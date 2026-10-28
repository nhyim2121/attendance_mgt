"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAccount, loginEmail, verifyLegacyPassword } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

// 로그인 실패가 반복되면 잠깐 막는다 (아이디+접속 주소 기준, 서버 메모리)
const fails = new Map<string, { n: number; until: number }>();

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const id = String(form.get("id") ?? "").trim();
  const pw = String(form.get("pw") ?? "");
  if (!id || !pw) return "아이디와 비밀번호를 입력해 주세요.";
  const ip = (await headers()).get("x-forwarded-for") ?? "local";
  const key = `${id}|${ip}`;
  const f = fails.get(key);
  if (f && f.until > Date.now()) {
    return `로그인 실패가 반복되어 ${Math.ceil((f.until - Date.now()) / 1000)}초 후에 다시 시도할 수 있습니다.`;
  }

  const supabase = await createClient();
  let { error } = await supabase.auth.signInWithPassword({ email: loginEmail(id), password: pw });
  if (error) {
    // 이전 사이트 계정: 처음 로그인할 때 비밀번호를 확인하고 새 계정으로 옮긴다
    const admin = createAdminClient();
    const { data: legacy } = await admin.from("legacy_users").select("*").eq("login_id", id).maybeSingle();
    if (legacy && verifyLegacyPassword(pw, legacy.hash)) {
      await createAccount(admin, id, legacy.name, legacy.role, pw);
      await admin.from("legacy_users").delete().eq("login_id", id);
      ({ error } = await supabase.auth.signInWithPassword({ email: loginEmail(id), password: pw }));
    }
  }
  if (error) {
    const n = (f?.n ?? 0) + 1;
    fails.set(key, n >= 5 ? { n: 0, until: Date.now() + 60_000 } : { n, until: 0 });
    return "아이디 또는 비밀번호가 맞지 않습니다.";
  }
  fails.delete(key);
  redirect("/");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
