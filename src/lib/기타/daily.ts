/** 데일리 체크 보드 (2026-11-12): ① 오늘 할 일·주간 체크 ② 업무(프로젝트)·리마인더 ③ 업무 인수인계서.
 *  - 사람마다: settings 'daily:<사용자 id>' = { routines, days, projects, handover }
 *  - 다 같이: settings 'daily_reminders' = 리마인더(공지·참고) 목록, 사람별 '확인 완료'
 *  서버 전용. 화면 계산(그날 할 일·상태)은 아래 순수 함수. */
import "server-only";
import { getSetting, setSetting } from "../store";
import { addDays, type DateStr, todayKst, weekday } from "../time";

export type Cycle = "daily" | "weekly" | "monthly";
export interface Routine { id: string; text: string; cycle: Cycle; wd?: number; md?: number } // wd: 0=월 … 4=금, md: 1~31
export interface Item { id: string; text: string; done: boolean }
export interface Day { items: Item[]; rdone: string[]; memo?: string } // rdone: 끝낸 반복 업무 id · 'sys:<주소>' (사이트가 찾아 준 일)
export interface Project { id: string; name: string; from: string; to: string; status: "시작 전" | "진행 중" | "완료"; pct: number; area: string; cycle: string; star: number; memo: string; next: string }
export interface Contact { id: string; name: string; kind: "내부" | "외부"; tel: string; note: string }
export interface Handover { taker: string; date: string; areas: string[]; dutyMemo: Record<string, string>; contacts: Contact[]; tips: string[]; checks: string[]; fileMemo: Record<string, string> }
export interface DailyData { routines: Routine[]; days: Record<string, Day>; projects: Project[]; handover: Handover }
export interface Reminder { id: string; title: string; kind: string; body: string; from: string; to: string; pin: boolean; by: string; read: string[]; at: string }

export const EMPTY_HANDOVER: Handover = { taker: "", date: "", areas: ["hr"], dutyMemo: {}, contacts: [], tips: [], checks: [], fileMemo: {} };
export const DEFAULT_ROUTINES: Routine[] = [
  { id: "r1", text: "메일·공문 확인", cycle: "daily" },
  { id: "r2", text: "근태 확인 · 일일 보고서", cycle: "daily" },
  { id: "r3", text: "대장 기한 확인", cycle: "daily" },
  { id: "r4", text: "주간 업무 보고", cycle: "weekly", wd: 4 },
];

const key = (uid: string) => `daily:${uid}`;
export async function loadDaily(uid: string): Promise<DailyData> {
  const d = await getSetting<Partial<DailyData> | null>(key(uid), null);
  return { routines: d?.routines ?? DEFAULT_ROUTINES, days: d?.days ?? {}, projects: d?.projects ?? [], handover: { ...EMPTY_HANDOVER, ...(d?.handover ?? {}) } };
}
export async function saveDaily(uid: string, d: DailyData) {
  // 120일 지난 날 기록은 정리
  const lo = addDays(todayKst(), -120);
  const days = Object.fromEntries(Object.entries(d.days).filter(([k, v]) => k >= lo && (v.items.length || v.rdone.length || v.memo)));
  await setSetting(key(uid), { ...d, days });
}
export const loadReminders = () => getSetting<Reminder[]>("daily_reminders", []);
export const saveReminders = (list: Reminder[]) => setSetting("daily_reminders", list);
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 그날 해당하는 반복 업무 (주말엔 매일 업무 없음) */
export function routinesOn(rs: Routine[], day: DateStr): Routine[] {
  const wd = weekday(day), md = +day.slice(8, 10);
  return rs.filter((r) => (r.cycle === "daily" ? wd < 5 : r.cycle === "weekly" ? r.wd === wd : r.md === md));
}
export type DayState = "완료" | "진행 중" | "시작 전" | "";
export function stateOf(done: number, all: number): DayState {
  if (!all) return "";
  return done >= all ? "완료" : done ? "진행 중" : "시작 전";
}
export const cycleText = (r: Routine) => (r.cycle === "daily" ? "매일" : r.cycle === "weekly" ? `매주 ${"월화수목금토일"[r.wd ?? 0]}` : `매월 ${r.md}일`);

/** 그날 보드 한 칸: 반복 업무 + (오늘이면) 사이트가 찾아 준 기한 + 오늘만 할 일, 완료 수·상태 */
export interface SysTodo { id: string; text: string; sub: string; href: string; left: number }
export function dayView(data: DailyData, day: DateStr, sys: SysTodo[]) {
  const d = data.days[day] ?? { items: [], rdone: [] };
  const rs = routinesOn(data.routines, day);
  const all = rs.length + d.items.length + sys.length;
  const done = rs.filter((r) => d.rdone.includes(r.id)).length + d.items.filter((i) => i.done).length + sys.filter((s) => d.rdone.includes(s.id)).length;
  return {
    day, routines: rs.map((r) => ({ id: r.id, text: r.text, done: d.rdone.includes(r.id) })), items: d.items,
    sys: sys.map((s) => ({ ...s, done: d.rdone.includes(s.id) })), memo: d.memo ?? "", done, all, state: stateOf(done, all) as string,
  };
}
