/** 로그인 계정. Supabase Auth를 쓰고, 화면에서는 이메일 대신 아이디로 로그인한다.
 *
 * 역할
 * - 관리자: 모든 기능 + 업로드 삭제 + 사용자 관리
 * - 담당자: 조회, 파일 업로드, 근태 기입, 설정 변경
 * 입찰관리(/bid)는 담당자(윤정아 차장님)와 공유 — DB 규칙 supabase/migrations/20261110000000_bid_share.sql (2026-11-10 적용).
 */
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginEmail } from "./auth-rules";
import { areaOfPath } from "./대시/menu";
import { allows, isCustom, PERM_AREAS, PERM_LABEL, type PermAction, type PermTable, permsOf } from "./perm";
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

/** 입찰관리: 관리자 (+ BID_SHARED면 담당자) */
export const BID_SHARED = true;
export const canBid = (u: AppUser | null) => !!u && (u.role === "관리자" || (BID_SHARED && u.role === "담당자"));
export async function requireBidPage(): Promise<AppUser> {
  const u = await requireUser();
  if (!canBid(u)) redirect("/");
  return u;
}
export async function requireBid(): Promise<AppUser> {
  const u = await requireUser();
  if (!canBid(u)) throw new Error("입찰관리를 쓸 수 없는 계정입니다.");
  return u;
}

export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role === "관리자") return u;
  // 권한을 직접 정한 계정은 그 영역의 등록·수정·삭제 중 하나가 있으면 허용 (사용자 관리 등 영역 밖 기능은 관리자만)
  const g = await permGate(u);
  if (g && g.area && (["create", "update", "delete"] as PermAction[]).some((a) => allows(g.perms, g.area, a))) return u;
  throw new Error("관리자만 사용할 수 있는 기능입니다.");
}

// ---------------------------------------------------------------- 계정별 권한 (lib/perm.ts)
/** 계정별 권한 표 (settings 'perms') */
export const loadPerms = cache(async (): Promise<PermTable> => {
  const sb = await createClient();
  const { data } = await sb.from("settings").select("value").eq("key", "perms").maybeSingle();
  return (data?.value ?? {}) as PermTable;
});
/** 지금 요청 주소의 업무 영역 (proxy가 넘긴 x-path) */
async function areaNow(): Promise<string> {
  const h = await headers();
  const raw = h.get("x-path") ?? "";
  let path = raw;
  try { path = decodeURI(raw); } catch { /* 그대로 */ }
  return path ? areaOfPath(path) : "";
}
/** 권한을 직접 정한 계정이면 그 영역과 권한, 아니면 null (예전 역할 규칙을 따른다) */
async function permGate(u: AppUser): Promise<{ area: string; perms: ReturnType<typeof permsOf> } | null> {
  const table = await loadPerms();
  if (!isCustom(table, u.loginId, u.role)) return null;
  return { area: await areaNow(), perms: permsOf(table, u.loginId, u.role) };
}
/** 서버 동작(등록·수정·삭제) 권한 확인. 권한을 직접 정한 계정만 막는다. */
export async function requirePerm(act: PermAction): Promise<AppUser> {
  const u = await requireUser();
  const g = await permGate(u);
  if (!g || !g.area || allows(g.perms, g.area, act)) return u;
  const label = PERM_AREAS.find((a) => a.key === g.area)?.label ?? g.area;
  throw new Error(`권한이 없습니다: ${label} ${PERM_LABEL[act]}. 관리자에게 권한을 요청하세요.`);
}
/** 메뉴에 보일 영역 (권한을 직접 정한 계정은 읽기 있는 영역만, 아니면 null = 예전 규칙) */
export async function readableAreas(u: AppUser): Promise<string[] | null> {
  const table = await loadPerms();
  if (!isCustom(table, u.loginId, u.role)) return null;
  const p = permsOf(table, u.loginId, u.role);
  return PERM_AREAS.filter((a) => allows(p, a.key, "read")).map((a) => a.key);
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

/** 관리자 한 사람만 쓰는 화면 (총무 등): 다른 계정은 통합 대시보드로 돌려보낸다. */
export async function requireAdminPage(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role === "관리자") return u;
  const g = await permGate(u); // 권한을 직접 정한 계정은 그 영역 '읽기'가 있으면 열린다
  if (g && g.area && allows(g.perms, g.area, "read")) return u;
  redirect("/");
}
