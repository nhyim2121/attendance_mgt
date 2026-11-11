"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { checkPasswordRule, createAccount, loadPerms, loginEmail, requireAdmin, requireUser, ROLES } from "@/lib/auth";
import { type AreaPerms, PERM_ACTIONS, PERM_AREAS, type PermTable } from "@/lib/perm";
import { setSetting } from "@/lib/store";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Res = { ok?: string; error?: string } | null;

export async function changeMyPassword(_prev: Res, form: FormData): Promise<Res> {
  const me = await requireUser();
  const cur = String(form.get("cur") ?? ""), pw = String(form.get("pw") ?? ""), pw2 = String(form.get("pw2") ?? "");
  // 현재 비밀번호 확인은 세션을 건드리지 않는 별도 클라이언트로
  const probe = createPlainClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await probe.auth.signInWithPassword({ email: loginEmail(me.loginId), password: cur });
  if (error) return { error: "현재 비밀번호가 맞지 않습니다." };
  await probe.auth.signOut();
  const rule = checkPasswordRule(pw);
  if (rule) return { error: rule };
  if (pw !== pw2) return { error: "새 비밀번호가 서로 다릅니다." };
  const sb = await createClient();
  const { error: e2 } = await sb.auth.updateUser({ password: pw });
  return e2 ? { error: `비밀번호를 바꾸지 못했습니다: ${e2.message}` } : { ok: "비밀번호를 바꿨습니다." };
}

/** 같은 아이디면 이름·역할을 바꾸고, 비밀번호를 넣으면 초기화한다. */
export async function upsertUser(_prev: Res, form: FormData): Promise<Res> {
  const me = await requireAdmin();
  const id = String(form.get("id") ?? "").trim(), name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? ""), pw = String(form.get("pw") ?? "");
  if (!id || !name) return { error: "아이디와 이름을 입력해 주세요." };
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { error: "역할을 골라 주세요." };
  if (pw && checkPasswordRule(pw)) return { error: checkPasswordRule(pw)! };
  if (id === me.loginId && role !== "관리자") return { error: "내 계정의 관리자 권한은 스스로 해제할 수 없습니다." };
  const admin = createAdminClient();
  const { data: old } = await admin.from("profiles").select("id").eq("login_id", id).maybeSingle();
  try {
    if (old) {
      await admin.from("profiles").update({ name, role }).eq("id", old.id);
      if (pw) {
        const { error } = await admin.auth.admin.updateUserById(old.id, { password: pw });
        if (error) return { error: `비밀번호를 바꾸지 못했습니다: ${error.message}` };
      }
    } else {
      if (!pw) return { error: "새 계정은 비밀번호가 필요합니다." };
      await createAccount(admin, id, name, role, pw);
      await admin.from("legacy_users").delete().eq("login_id", id);
    }
  } catch (exc) {
    return { error: (exc as Error).message };
  }
  revalidatePath("/users");
  return { ok: `${id} 계정을 ${old ? "수정" : "추가"}했습니다. 처음 비밀번호는 직접 전달해 주세요.` };
}

export async function deleteUser(_prev: Res, form: FormData): Promise<Res> {
  const me = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!id || id === me.loginId) return { error: "삭제할 계정을 골라 주세요 (내 계정은 지울 수 없습니다)." };
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("id").eq("login_id", id).maybeSingle();
  if (p) await admin.auth.admin.deleteUser(p.id);
  await admin.from("legacy_users").delete().eq("login_id", id);
  revalidatePath("/users");
  return { ok: `${id} 계정을 삭제했습니다.` };
}

/** 계정별 권한 저장 (lib/perm.ts). mode 'role' = 역할 기본값으로 되돌리기, 'custom' = 표대로. 관리자 역할만. */
export async function savePerms(loginId: string, mode: "role" | "custom", perms: Record<string, string[]>): Promise<Res> {
  const me = await requireUser();
  if (me.role !== "관리자") return { error: "관리자만 권한을 바꿀 수 있습니다." };
  const admin = createAdminClient();
  const { data: who } = await admin.from("profiles").select("role").eq("login_id", loginId).maybeSingle();
  if (!who) return { error: "없는 계정입니다." };
  if (who.role === "관리자") return { error: "관리자 계정은 언제나 모든 권한을 가집니다 (잠김 방지)." };
  const table = await loadPerms();
  const next: PermTable = { ...table };
  if (mode === "role") delete next[loginId];
  else {
    const clean: AreaPerms = {};
    for (const a of PERM_AREAS) {
      const acts = PERM_ACTIONS.filter((x) => perms[a.key]?.includes(x));
      // 등록·수정·삭제가 있으면 읽기도 같이 준다
      if (acts.length && !acts.includes("read")) acts.unshift("read");
      if (acts.length) clean[a.key] = acts;
    }
    next[loginId] = clean;
  }
  await setSetting("perms", next);
  revalidatePath("/", "layout");
  return { ok: mode === "role" ? `${loginId}: 역할 기본값으로 되돌렸습니다.` : `${loginId}: 권한을 저장했습니다.` };
}
