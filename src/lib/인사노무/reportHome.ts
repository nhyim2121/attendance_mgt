/** 근태 홈과 근태현황 보고서가 함께 쓰는 숫자: 재직·출근·연차 사용률·이직률, 어제(직전 근무일) 부서별 출장·휴가·퇴근미체크·연장근무.
 *  (2026-11-17) 보고서 맨 위 '한눈에' 줄과 '어제 근무' 칸이 홈과 같은 숫자를 보이도록 한 곳에서 계산한다. */
import type { WorkRule } from "@/lib/config";
import { addDays, type DateStr, nowKst, parseTs, todayKst } from "@/lib/time";
import { dailyBoard, type DayRow, isHoliday } from "./analytics";
import { dayLists, headcount } from "./dashboard";
import { getHolidays, getLeavePolicy, getRule, loadBase, rosterDays, staffOn } from "./data";
import type { Leave } from "./leave";
import type { CapsRecord } from "./loader";
import { leaveBook } from "./leaveBook";
import { fyOf, type LeavePolicy } from "./vacation";
import * as store from "@/lib/store";
import type { ReportHome } from "./daily";
import { employedOn } from "./employees";

// 어제 현황은 부서별로 (2026-11-11 사용자 결정): 생산팀, 품질팀(김동수 제외), 영업팀, 연구소, 관리팀
export const Y_DEPTS: [string, (dept: string, emp: string) => boolean][] = [
  ["생산팀", (d) => d === "생산팀"],
  ["품질팀", (d, e) => d === "품질팀" && e !== "김동수"],
  ["영업팀", (d) => d === "영업팀"],
  ["연구소", (d) => d.includes("연구소")],
  ["관리팀", (d) => d === "관리팀"],
];

export type YOt = { emp: string; out: number; hours: number; night: number; grp: string };
const LEAVE_RE = /^(연차|월차|반차|반반차|외출|조퇴|공가|경조|병가|포상|휴가)/;

export type YRow = { dept: string; trip: string[]; leave: string[]; leaveKind: Record<string, string>; noOut: string[]; ot: YOt[] };

/** day 바로 전 근무일 (주말·휴일은 건너뜀, 최대 14일) */
export function prevWorkday(day: DateStr, rule: WorkRule, holidays: Record<string, string>): DateStr {
  let y = addDays(day, -1);
  while (isHoliday(y, rule, holidays) && y > addDays(day, -14)) y = addDays(y, -1);
  return y;
}

/** 어제(yday) 부서별 출장·휴가·퇴근미체크·연장근무자 */
export async function yesterdayRows(days: DayRow[], leaves: Leave[], records: CapsRecord[], yday: DateStr, rule: WorkRule): Promise<YRow[]> {
  const y = dayLists(days, yday, rule);
  const yBoard = dailyBoard(days, leaves, await staffOn(yday, records), yday, rule);
  const deptOf = new Map(yBoard.map((b) => [b.emp, b.dept]));
  const grp = (emp: string, dept = deptOf.get(emp) ?? "") => Y_DEPTS.find(([, ok]) => ok(dept, emp))?.[0] ?? "";
  // 연장근무자 = 평일 연장·휴일근로 + 야간근무(22:00~06:00)를 한 명단으로
  const nightOf = new Map(y.night.map((o) => [o.emp, o]));
  const otAll = [...new Set([...y.overtime.map((o) => o.emp), ...y.night.map((o) => o.emp)])].map((emp) => {
    const o = y.overtime.find((x) => x.emp === emp), n = nightOf.get(emp);
    return { emp, out: o?.out ?? n?.out ?? 0, hours: o?.hours ?? 0, night: n?.hours ?? 0, grp: grp(emp, o?.dept ?? n?.dept) };
  }).filter((o) => o.grp);
  // (2026-11-19) 하이웍스 휴가 파일이 늦게 올라와도 맞도록, 그날 근태 보고서의 근태 칸에 적힌 휴가(반차·반반차·외출 등)도 휴가로 센다.
  // '휴가일정' 칸은 앞으로 잡힌 일정이라, 그 날짜(types)에 이날이 들어 있을 때만 센다.
  const rep = await store.loadReportRows(yday).catch(() => []);
  const kindOf = new Map<string, string>();
  for (const r of rep) {
    if (!r.name) continue;
    const t = (r.types ?? "").trim();
    if (r.section === "근태" && LEAVE_RE.test(t)) kindOf.set(r.name, t);
    else if (r.section === "휴가일정" && t.split(",").map((x) => x.trim()).includes(yday)) kindOf.set(r.name, r.title.trim() || "휴가");
  }
  for (const b of yBoard) if (b.group === "휴가" && !kindOf.has(b.emp)) kindOf.set(b.emp, "휴가");
  return Y_DEPTS.map(([dp]) => {
    const g = yBoard.filter((b) => grp(b.emp) === dp);
    const leave = [...kindOf.keys()].filter((n) => grp(n) === dp);
    return {
      dept: dp,
      trip: g.filter((b) => b.group === "출장·교육" && !leave.includes(b.emp)).map((b) => b.emp),
      leave, leaveKind: Object.fromEntries(leave.map((n) => [n, kindOf.get(n) ?? "휴가"])),
      noOut: y.noOut.filter((d) => grp(d.emp, d.dept) === dp).map((d) => d.emp),
      ot: otAll.filter((o) => o.grp === dp).sort((a, b) => b.hours + b.night - a.hours - a.night),
    };
  });
}

/** 연차 사용률 (연차 현황표와 같은 계산: 하이웍스 숫자·직접 수정 포함, '연차 기준'에서 뺀 사람 제외) */
export async function annualUsage(day: DateStr, policy: LeavePolicy) {
  const [base, adjusts] = await Promise.all([loadBase(), store.loadAdjusts()]);
  const fy = fyOf(day, policy);
  const active = base.employees.filter((e) => employedOn(e, day));
  const excl = new Set(policy.exclude ?? []);
  const all = leaveBook(active, base.leaves, adjusts, fy, policy, await store.loadLeaveStatus(fy))(day, (b) => !excl.has(b.name)).bal;
  const bal = all.filter((b) => b.total > 0);
  const usedRate = bal.length ? Math.round((bal.reduce((t, b) => t + b.used, 0) / bal.reduce((t, b) => t + b.total, 0)) * 100) : 0;
  // 잔여 연차 (연차 현황표와 같은 숫자, 마이너스 그대로) — 보고서 휴가 일정 카드에 씀
  const remain = Object.fromEntries(all.map((b) => [b.name, b.remain]));
  // 월말 잔여 (2026-11-26): 기준일 달부터 3달, 그 달 말까지 쓴·잡힌 휴가만 뺀 잔여 = 전체 잔여 + 그 달 뒤에 잡힌 휴가
  const ends = [0, 1, 2].map((i) => { const [y, m] = day.slice(0, 7).split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + i, 1)); return t.toISOString().slice(0, 7); }).filter((ym) => fyOf(`${ym}-01` as DateStr, policy) === fy); // 다음 회계연도 달은 새로 생기므로 뺀다
  const remainMonths = Object.fromEntries(all.map((b) => [b.name, Object.fromEntries(ends.map((ym) =>
    [ym, Math.round((b.remain + (b.ahead ?? []).filter(([d]) => d.slice(0, 7) > ym).reduce((x, [, n]) => x + n, 0)) * 10000) / 10000]))]));
  return { fy, bal, usedRate, remain, remainMonths };
}

const hm = (x: number) => `${Math.floor(x)}시간${Math.round((x % 1) * 60) ? ` ${Math.round((x % 1) * 60)}분` : ""}`;

/** 보고서 '한눈에'·'어제 근무' 칸에 쓸 숫자 (보고일 기준). 기록이 없으면 null. */
export async function reportHome(day: DateStr): Promise<ReportHome | null> {
  const [rule, holidays, base, policy] = await Promise.all([getRule(), getHolidays(), loadBase(), getLeavePolicy()]);
  if (!base.months.length) return null;
  const yday = prevWorkday(day, rule, holidays);
  const { records, days } = await rosterDays(addDays(yday, -1), day);
  const staff = await staffOn(day, records);
  const today = todayKst();
  const board = dailyBoard(days, base.leaves, staff, day, rule, day === today ? parseTs(nowKst()) : null, isHoliday(day, rule, holidays));
  const present = board.filter((b) => b.in !== null).length;
  const hc = headcount(base.employees, day);
  const { fy, usedRate, remain, remainMonths } = await annualUsage(day, policy);
  const rows = await yesterdayRows(days, base.leaves, records, yday, rule);
  const who = (pick: (r: YRow) => string[]) => rows.flatMap((r) => pick(r).map((e) => [e, r.dept] as [string, string]));
  return {
    staff: staff.length, depts: new Set(staff.map(([, d]) => d || "(부서 없음)")).size, present,
    future: day > today,
    usedRate, remain, remainMonths, fyLabel: `${fy}${policy.fyStartMonth === 1 ? "년" : "회계연도"}`,
    turnover: hc.turnover, joined: hc.joined.length, left: hc.left.length,
    yday,
    trip: who((r) => r.trip),
    leave: rows.flatMap((r) => r.leave.map((e) => [e, `${r.dept} · ${r.leaveKind[e]}`] as [string, string])),
    ot: rows.flatMap((r) => r.ot.map((o) => [o.emp, `${r.dept} · ${hm(o.hours + o.night)}${o.night > 0 ? ` (야간 ${hm(o.night)})` : ""}`] as [string, string])),
  };
}
