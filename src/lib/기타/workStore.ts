/** 기타 영역 저장: settings 표 (로그인한 관리팀 계정 모두 읽고 쓴다).
 *  - wk:<사용자>:<월요일 날짜> = WeekLog  (주간업무일지, 사람·주마다 한 장)
 *  - coop:<번호>               = Coop     (업무협조 한 건씩 → 두 사람이 동시에 고쳐도 서로 덮어쓰지 않음)
 *  - plan:<사용자>             = Plan[]   (개인일정)
 *  서버 전용. */
import "server-only";
import { cache } from "react";
import { createClient } from "../supabase/server";
import { type Coop, emptyLog, type Plan, type WeekLog } from "./work";

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  return res.data;
}
type KV<T> = { key: string; value: T };

async function get<T>(key: string): Promise<T | null> {
  const sb = await createClient();
  const r = check(await sb.from("settings").select("value").eq("key", key).maybeSingle(), "읽기") as { value: T } | null;
  return r ? r.value : null;
}
async function put(key: string, value: unknown) {
  const sb = await createClient();
  check(await sb.from("settings").upsert({ key, value }, { onConflict: "key" }), "저장");
}
async function del(key: string) {
  const sb = await createClient();
  check(await sb.from("settings").delete().eq("key", key), "삭제");
}
async function prefixed<T>(prefix: string): Promise<KV<T>[]> {
  const sb = await createClient();
  return (check(await sb.from("settings").select("key, value").like("key", `${prefix}%`).limit(10000), "읽기") ?? []) as KV<T>[];
}

/** 관리팀 계정 (일지를 쓰는 사람들) */
export const people = cache(async (): Promise<{ id: string; name: string; role: string }[]> => {
  const sb = await createClient();
  const rows = (check(await sb.from("profiles").select("id, name, role").order("name"), "계정 읽기") ?? []) as { id: string; name: string; role: string }[];
  return rows;
});

// ---------------------------------------------------------------- 주간업무일지
const wkKey = (uid: string, monday: string) => `wk:${uid}:${monday}`;
export async function loadLog(uid: string, monday: string): Promise<WeekLog | null> {
  const v = await get<WeekLog>(wkKey(uid, monday));
  return v ? { ...emptyLog(v.name ?? ""), ...v } : null;
}
export const saveLog = (uid: string, monday: string, log: WeekLog) => put(wkKey(uid, monday), log);
export const deleteLog = (uid: string, monday: string) => del(wkKey(uid, monday));
/** 한 사람의 모든 주 (최근 주 먼저) */
export async function logsOf(uid: string): Promise<{ monday: string; log: WeekLog }[]> {
  return (await prefixed<WeekLog>(`wk:${uid}:`)).map((r) => ({ monday: r.key.slice(-10), log: { ...emptyLog(""), ...r.value } }))
    .sort((a, b) => b.monday.localeCompare(a.monday));
}
/** 모든 사람의 일지 (주 모아보기·캘린더용) */
export const allLogs = cache(async (): Promise<{ uid: string; monday: string; log: WeekLog }[]> =>
  (await prefixed<WeekLog>("wk:")).map((r) => ({ uid: r.key.split(":")[1], monday: r.key.slice(-10), log: { ...emptyLog(""), ...r.value } })));

// ---------------------------------------------------------------- 업무협조
export const loadCoops = cache(async (): Promise<Coop[]> =>
  (await prefixed<Partial<Coop>>("coop:")).map((r) => ({ log: [], ...r.value }) as Coop).sort((a, b) => b.asked.localeCompare(a.asked) || b.id.localeCompare(a.id)));
export const loadCoop = (id: string) => get<Coop>(`coop:${id}`);
export const saveCoop = (c: Coop) => put(`coop:${c.id}`, c);
export const deleteCoop = (id: string) => del(`coop:${id}`);

// ---------------------------------------------------------------- 개인일정
export const loadPlans = cache(async (uid: string): Promise<Plan[]> =>
  ((await get<Partial<Plan>[]>(`plan:${uid}`)) ?? []).map((p) => ({ end: "", from: "", to: "", place: "", memo: "", repeat: "안 함", until: "", done: [], kind: "기타", ...p }) as Plan));
export const savePlans = (uid: string, list: Plan[]) => put(`plan:${uid}`, list);
