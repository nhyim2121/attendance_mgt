/** 로그인 계정. Supabase Auth를 쓰고, 화면에서는 이메일 대신 아이디로 로그인한다.
 *
 * 역할
 * - 관리자: 모든 기능 + 업로드 삭제 + 사용자 관리
 * - 담당자: 조회, 파일 업로드, 근태 기입, 설정 변경
 */
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginEmail } from "./auth-rules";
import { createClient } from "./supabase/server";

export { checkPasswordRule, loginEmail, verifyLegacyPassword } from "./auth-rules";

export const ROLES = ["관리자", "담당자"] as const;
export type Role = (typeof ROLES)[number];

export interface AppUser {
  id: string;
  loginId: string;
  name: string;
  role: Role;
}

/** 지금 로그인한 사용자 (요청마다 한 번만 조회) */
export const currentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: p } = await supabase.from("profiles").select("login_id, name, role").eq("id", data.user.id)
    .maybeSingle();
  if (!p) return null;
  return { id: data.user.id, loginId: p.login_id, name: p.name, role: p.role };
});

export async function requireUser(): Promise<AppUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role !== "관리자") throw new Error("관리자만 사용할 수 있는 기능입니다.");
  return u;
}

/** 계정 만들기 (service role 클라이언트로만) */
export async function createAccount(admin: SupabaseClient, loginId: string, name: string, role: string,
  password: string): Promise<void> {
  const { data, error } = await admin.auth.admin.createUser({
    email: loginEmail(loginId), password, email_confirm: true, user_metadata: { login_id: loginId },
  });
  if (error || !data.user) throw new Error(`계정을 만들지 못했습니다: ${error?.message}`);
  const { error: e2 } = await admin.from("profiles").insert({ id: data.user.id, login_id: loginId, name, role });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`계정을 만들지 못했습니다: ${e2.message}`);
  }
}
