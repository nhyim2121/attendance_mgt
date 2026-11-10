/** 기타 영역(내 업무): 주간업무일지 · 타부서 업무협조 · 개인일정 · 월별 캘린더의 자료 모양과 계산. 서버·화면 같이 쓴다.
 *  저장은 settings 표 (workStore.ts): wk:<사용자>:<월요일> · coop:<번호> · plan:<사용자>. */
import { addDays, daysBetween, weekday } from "../time";

// ---------------------------------------------------------------- 주간업무일지
/** 일지 한 줄: 구분 · 업무 · (지난주에 세운) 계획 · 금주 실적 · 진행률 · 차주 계획 · 비고 */
export interface WRow { id: string; cat: string; task: string; prev: string; done: string; pct: number; next: string; note: string }
export interface WeekLog { name: string; rows: WRow[]; issue: string; request: string; updatedAt: string }
export const WCATS = ["총무", "인사·노무", "입찰", "업무협조", "인증", "환경안전", "회계", "기타"] as const;

export const mondayOf = (day: string) => addDays(day, -weekday(day));
/** '11월 2주차' (그 주 목요일이 속한 달 기준) */
export function weekTitle(monday: string): string {
  const thu = addDays(monday, 3);
  const first = `${thu.slice(0, 8)}01`;
  const firstThu = addDays(first, (3 - weekday(first) + 7) % 7);
  return `${+thu.slice(5, 7)}월 ${Math.floor(daysBetween(firstThu, thu) / 7) + 1}주차`;
}
export const weekRange = (monday: string) => `${+monday.slice(5, 7)}/${+monday.slice(8, 10)} ~ ${+addDays(monday, 4).slice(5, 7)}/${+addDays(monday, 4).slice(8, 10)}`;
export const emptyLog = (name: string): WeekLog => ({ name, rows: [], issue: "", request: "", updatedAt: "" });

/** 새 주 일지 시작: 지난주 '차주 계획'을 이번 주 '계획'으로, 끝나지 않은(100% 아닌) 일은 이어서 */
export function carryOver(last: WeekLog | null, newId: () => string): WRow[] {
  if (!last) return [];
  return last.rows.filter((r) => r.next.trim() || r.pct < 100).map((r) => ({
    id: newId(), cat: r.cat, task: r.task, prev: r.next.trim(), done: "", pct: r.pct >= 100 ? 0 : r.pct, next: "", note: "",
  }));
}
export const logAvg = (l: WeekLog) => (l.rows.length ? Math.round(l.rows.reduce((t, r) => t + r.pct, 0) / l.rows.length) : 0);

// ---------------------------------------------------------------- 업무협조
export const DEPTS = ["품질", "생산", "영업", "구매", "연구소", "관리", "기타"] as const;
export const DEPT_COLOR: Record<string, string> = { 품질: "#0e7490", 생산: "#b45309", 영업: "#be185d", 구매: "#15803d", 연구소: "#6d28d9", 관리: "#0c3994", 기타: "#5b6475" };
export const DEPT_EMOJI: Record<string, string> = { 품질: "🔬", 생산: "🏭", 영업: "🤝", 구매: "🛒", 연구소: "🧪", 관리: "🗂️", 기타: "📌" };
export const COOP_STATUS = ["접수", "진행 중", "회신 대기", "완료", "보류"] as const;
export const COOP_DIR = ["받은 요청", "보낸 요청"] as const;
export type CoopStatus = (typeof COOP_STATUS)[number];
export interface CoopLog { at: string; by: string; text: string }
export interface Coop {
  id: string; dir: (typeof COOP_DIR)[number]; dept: string; title: string; detail: string;
  partner: string;   // 상대 부서 담당자
  owner: string;     // 우리 쪽 담당
  asked: string;     // 요청일
  due: string;       // 기한 ('' = 없음)
  status: CoopStatus; doneAt: string; result: string; prio: "보통" | "긴급";
  log: CoopLog[]; by: string; at: string;
}
export const isOpen = (c: Coop) => c.status !== "완료" && c.status !== "보류";
export const coopLeft = (c: Coop, today: string) => (c.due ? daysBetween(today, c.due) : null);
export const statusTone = (s: string) => ({ 접수: "v", "진행 중": "b", "회신 대기": "o", 완료: "g", 보류: "k" } as Record<string, string>)[s] ?? "k";

// ---------------------------------------------------------------- 개인일정
export const PLAN_KINDS = ["회의", "외근", "출장", "교육", "마감", "개인", "기타"] as const;
export const PLAN_COLOR: Record<string, string> = { 회의: "#0c3994", 외근: "#0e7490", 출장: "#b45309", 교육: "#6d28d9", 마감: "#e84340", 개인: "#be185d", 기타: "#5b6475" };
export const REPEATS = ["안 함", "매일(평일)", "매주", "매월"] as const;
export interface Plan {
  id: string; day: string; end: string; // 끝 날짜 ('' = 하루)
  from: string; to: string;              // 'HH:MM' ('' = 종일)
  title: string; kind: string; place: string; memo: string;
  repeat: (typeof REPEATS)[number]; until: string; // 반복 끝 ('' = 계속)
  done: string[];                         // 끝낸 날짜 (반복 일정은 날짜별로)
}
export interface PlanHit { p: Plan; day: string; start: string; done: boolean; multi: boolean }

/** 기간 [from, to] 안에서 일정이 걸리는 날 */
export function occurrences(p: Plan, from: string, to: string): PlanHit[] {
  const out: PlanHit[] = [];
  const len = p.end && p.end > p.day ? daysBetween(p.day, p.end) : 0;
  const push = (start: string) => {
    for (let i = 0; i <= len; i++) {
      const d = addDays(start, i);
      if (d >= from && d <= to) out.push({ p, day: d, start, done: p.done.includes(start), multi: len > 0 });
    }
  };
  if (p.repeat === "안 함") { push(p.day); return out; }
  const last = p.until && p.until < to ? p.until : to;
  let d = p.day, n = 0;
  while (d <= last && n < 800) {
    if (addDays(d, len) >= from && !(p.repeat === "매일(평일)" && weekday(d) > 4)) push(d);
    n++;
    if (p.repeat === "매월") {
      const [y, m] = [+p.day.slice(0, 4), +p.day.slice(5, 7) + n];
      const yy = y + Math.floor((m - 1) / 12), mm = ((m - 1) % 12) + 1;
      const dd = Math.min(+p.day.slice(8, 10), new Date(Date.UTC(yy, mm, 0)).getUTCDate());
      d = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    } else d = addDays(d, p.repeat === "매주" ? 7 : 1);
  }
  return out;
}
export const timeText = (p: Plan) => (p.from ? `${p.from}${p.to ? `~${p.to}` : ""}` : "종일");

// ---------------------------------------------------------------- 월별 캘린더
/** 캘린더 한 칸에 놓이는 것 */
export interface CalItem { day: string; kind: "plan" | "coop" | "coopDone" | "due" | "bid"; title: string; href: string; color: string; done?: boolean; time?: string }
/** 그 달을 덮는 월요일 시작 주들 (5~6주) */
export function monthWeeks(month: string): string[] {
  const first = `${month}-01`;
  const out: string[] = [];
  for (let m = mondayOf(first); m.slice(0, 7) <= month; m = addDays(m, 7)) out.push(m);
  return out;
}
export function shiftMonth(month: string, n: number): string {
  const [y, m] = [+month.slice(0, 4), +month.slice(5, 7) - 1 + n];
  return `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}`;
}
