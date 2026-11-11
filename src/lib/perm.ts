/** 계정별 권한 (2026-11-11 사용자 결정): 업무 영역마다 읽기·등록·수정·삭제를 계정별로 정한다.
 *
 * - 저장: settings 'perms' = { [아이디]: { [영역]: ["read","create","update","delete"] } }
 * - 관리자 역할은 언제나 전부 허용 (잠김 방지). 사용자 관리(/users)는 관리자만.
 * - 표에 없는(직접 정하지 않은) 계정은 예전처럼 역할 기본값을 따른다 (담당자 = 인사노무·기타, 관리자 전용 화면 제외).
 * - 확인하는 곳: proxy.ts(화면 열기 = 읽기), auth.ts requirePerm(서버 동작 = 등록·수정·삭제),
 *   requireAdminPage·requireAdmin(관리자 전용 화면·동작은 직접 정한 계정이면 표를 따른다), 메뉴(읽기 없는 영역 숨김).
 * 이 파일은 proxy(엣지 이전 단계)에서도 쓰므로 서버 전용 모듈을 가져오지 않는다. */
export const PERM_ACTIONS = ["read", "create", "update", "delete"] as const;
export type PermAction = (typeof PERM_ACTIONS)[number];
export const PERM_LABEL: Record<PermAction, string> = { read: "읽기", create: "등록", update: "수정", delete: "삭제" };

/** 권한을 정하는 업무 영역 (메뉴의 영역과 같은 키) */
export const PERM_AREAS: { key: string; label: string }[] = [
  { key: "hr", label: "인사노무" }, { key: "ga", label: "총무" }, { key: "ehs", label: "환경안전보건" },
  { key: "it", label: "보안전산" }, { key: "cert", label: "인증" }, { key: "misc", label: "기타" },
];

export type AreaPerms = Record<string, PermAction[]>;
export type PermTable = Record<string, AreaPerms>;

/** 역할 기본값 (표에 없는 계정): 지금까지의 동작과 같게 */
export function rolePerms(role: string): AreaPerms {
  const all = [...PERM_ACTIONS];
  if (role === "관리자") return Object.fromEntries(PERM_AREAS.map((a) => [a.key, all]));
  return { hr: ["read", "create", "update"], misc: all };
}

/** 그 계정의 영역별 권한 (직접 정했으면 그 값, 아니면 역할 기본값) */
export function permsOf(table: PermTable | null | undefined, loginId: string, role: string): AreaPerms {
  if (role === "관리자") return rolePerms("관리자");
  return table?.[loginId] ?? rolePerms(role);
}
export const isCustom = (table: PermTable | null | undefined, loginId: string, role: string) => role !== "관리자" && !!table?.[loginId];
export const allows = (p: AreaPerms, area: string, act: PermAction) => !!p[area]?.includes(act);
