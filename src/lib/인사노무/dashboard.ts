/** 홈 대시보드 집계: 오늘 근무 현황, 어제 근무 현황, 이번 주 52시간, 이번 달 근무시간, 인력 변동, 부서별 근무. */
import type { DayRow } from "./analytics";
import type { WorkRule } from "../config";
import type { Employee } from "./employees";
import { addDays, type DateStr, minutesOf, ts, weekday } from "../time";

const HOUR = 3_600_000;
const MIN = 60_000;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** 휴게시간: 8시간 이상 1시간, 4시간 이상 30분 (근로시간 리포트와 같음). */
function breakHours(stayH: number): number {
  return stayH >= 8 ? 1 : stayH >= 4 ? 0.5 : 0;
}

/** 하루 실근로시간(h). 평일은 출근 기준 전 시간은 빼고, 휴게시간을 뺀다. 출퇴근 중 하나라도 없으면 null. */
export function netHours(d: DayRow, rule: WorkRule): number | null {
  if (d.in === null || d.out === null) return null;
  const startAt = ts(d.day) + rule.start * MIN;
  const begin = d.holiday || d.in > startAt ? d.in : startAt;
  const span = Math.max(0, (d.out - begin) / HOUR);
  return span - breakHours(span);
}

/** 평일 연장근로(h): 퇴근 기준 + 연장 기준분 이후 퇴근한 날의 (퇴근 - 퇴근 기준), 단위 절사 */
export function overtimeHours(d: DayRow, rule: WorkRule): number {
  if (d.holiday || d.in === null || d.out === null) return 0;
  const over = (d.out - (ts(d.day) + rule.end * MIN)) / MIN;
  return over >= rule.overtimeMin ? (Math.floor(over / rule.roundMin) * rule.roundMin) / 60 : 0;
}

/** 휴일근로(h), 단위 절사 */
export function holidayHours(d: DayRow, rule: WorkRule): number {
  if (!d.holiday) return 0;
  const n = netHours(d, rule);
  return n === null ? 0 : (Math.floor((n * 60) / rule.roundMin) * rule.roundMin) / 60;
}

/** 야간근로(h): 22:00~다음날 06:00과 겹치는 시간 */
export function nightHours(d: DayRow): number {
  if (d.in === null || d.out === null || d.out <= d.in) return 0;
  const day0 = ts(d.day);
  const windows: [number, number][] = [[day0 - 2 * HOUR, day0 + 6 * HOUR], [day0 + 22 * HOUR, day0 + 30 * HOUR]];
  const ms = windows.reduce((t, [a, b]) => t + Math.max(0, Math.min(b, d.out!) - Math.max(a, d.in!)), 0);
  return r2(ms / HOUR);
}

// ---------------------------------------------------------------- 이번 주
export interface WeekRow {
  emp: string;
  dept: string;
  hours: number;
}

/** 기준일이 든 주(월~기준일)의 직원별 누적 실근로시간, 많은 순 */
export function weekHours(days: DayRow[], base: DateStr, rule: WorkRule): WeekRow[] {
  const mon = addDays(base, -weekday(base));
  const m = new Map<string, WeekRow>();
  for (const d of days) {
    if (d.day < mon || d.day > base) continue;
    const h = netHours(d, rule);
    if (h === null) continue;
    const w = m.get(d.emp) ?? { emp: d.emp, dept: d.dept, hours: 0 };
    w.hours += h;
    m.set(d.emp, w);
  }
  return [...m.values()].map((w) => ({ ...w, hours: r2(w.hours) })).sort((a, b) => b.hours - a.hours);
}

/** 요일별 1인 평균 실근로시간 (월~일) */
export function weekdayAverage(days: DayRow[], rule: WorkRule): { wd: string; hours: number }[] {
  const sum = Array(7).fill(0) as number[], n = Array(7).fill(0) as number[];
  for (const d of days) {
    const h = netHours(d, rule);
    if (h === null) continue;
    sum[weekday(d.day)] += h;
    n[weekday(d.day)]++;
  }
  return ["월", "화", "수", "목", "금", "토", "일"].map((wd, i) => ({ wd, hours: n[i] ? r2(sum[i] / n[i]) : 0 }));
}

// ---------------------------------------------------------------- 하루 (어제)
export interface DayLists {
  late: DayRow[];
  early: DayRow[];
  noOut: DayRow[];
  absent: DayRow[];
  overtime: { emp: string; dept: string; hours: number; out: number }[];
  night: { emp: string; dept: string; hours: number; out: number }[];
}

const tagged = (src: string) => src === "캡스" || src === "수기입력";

export function dayLists(days: DayRow[], day: DateStr, rule: WorkRule): DayLists {
  const g = days.filter((d) => d.day === day);
  return {
    late: g.filter((d) => d.late),
    early: g.filter((d) => d.early && tagged(d.outSrc)),
    noOut: g.filter((d) => d.status === "퇴근 기록 없음"),
    absent: g.filter((d) => d.status === "기록 없음"),
    overtime: g.map((d) => ({ emp: d.emp, dept: d.dept, hours: overtimeHours(d, rule) + holidayHours(d, rule), out: d.out ?? 0 }))
      .filter((x) => x.hours > 0).sort((a, b) => b.hours - a.hours),
    night: g.map((d) => ({ emp: d.emp, dept: d.dept, hours: nightHours(d), out: d.out ?? 0 }))
      .filter((x) => x.hours > 0).sort((a, b) => b.hours - a.hours),
  };
}

// ---------------------------------------------------------------- 기간 (이번 달)
export interface PeriodHours {
  people: number;
  total: number; // 인당 평균 (h)
  overtime: number;
  night: number;
  holiday: number;
}

export function periodHours(days: DayRow[], rule: WorkRule): PeriodHours {
  const people = new Set(days.map((d) => d.emp)).size || 1;
  let total = 0, overtime = 0, night = 0, holiday = 0;
  for (const d of days) {
    total += netHours(d, rule) ?? 0;
    overtime += overtimeHours(d, rule);
    night += nightHours(d);
    holiday += holidayHours(d, rule);
  }
  return {
    people, total: r2(total / people), overtime: r2(overtime / people), night: r2(night / people),
    holiday: r2(holiday / people),
  };
}

/** 부서별 1인 평균 연장근로(평일 연장 + 휴일근로) */
export function deptOvertime(days: DayRow[], rule: WorkRule, order: string[] = []): { dept: string; hours: number }[] {
  const m = new Map<string, { h: number; emps: Set<string> }>();
  for (const d of days) {
    const k = d.dept || "(부서 없음)";
    const x = m.get(k) ?? { h: 0, emps: new Set<string>() };
    x.h += overtimeHours(d, rule) + holidayHours(d, rule);
    x.emps.add(d.emp);
    m.set(k, x);
  }
  const pos = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return [...m].sort(([a], [b]) => pos(a) - pos(b) || (a < b ? -1 : 1))
    .map(([dept, x]) => ({ dept, hours: r2(x.h / x.emps.size) }));
}

/** 월별 1인 평균 실근로시간 */
export function monthlyAverage(days: DayRow[], rule: WorkRule): { month: string; hours: number; overtime: number }[] {
  const m = new Map<string, { h: number; o: number; emps: Set<string> }>();
  for (const d of days) {
    const k = d.day.slice(0, 7);
    const x = m.get(k) ?? { h: 0, o: 0, emps: new Set<string>() };
    x.h += netHours(d, rule) ?? 0;
    x.o += overtimeHours(d, rule) + holidayHours(d, rule);
    x.emps.add(d.emp);
    m.set(k, x);
  }
  return [...m].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, x]) => ({
    month, hours: r2(x.h / x.emps.size), overtime: r2(x.o / x.emps.size),
  }));
}

/** 지각 n회 이상 [(직원, 부서, 횟수)] */
export function frequentLate(days: DayRow[], min = 3): { emp: string; dept: string; n: number }[] {
  const m = new Map<string, { emp: string; dept: string; n: number }>();
  for (const d of days) {
    if (!d.late) continue;
    const x = m.get(d.emp) ?? { emp: d.emp, dept: d.dept, n: 0 };
    x.n++;
    m.set(d.emp, x);
  }
  return [...m.values()].filter((x) => x.n >= min).sort((a, b) => b.n - a.n);
}

// ---------------------------------------------------------------- 인력 변동
export interface Headcount {
  joined: Employee[];
  left: Employee[];
  active: number; // 기준일 재직
  startActive: number; // 그 달 1일 재직
  turnover: number; // 이직률(%) = 퇴사 / 월초 재직
  byMonth: { month: string; join: number; leave: number }[]; // 그 해 1~12월
}

const activeOn = (e: Employee, d: DateStr) => (!e.joinDate || e.joinDate <= d) && (!e.leaveDate || e.leaveDate >= d);

export function headcount(emps: Employee[], base: DateStr): Headcount {
  const month = base.slice(0, 7), first = `${month}-01`;
  const joined = emps.filter((e) => e.joinDate?.startsWith(month));
  const left = emps.filter((e) => e.leaveDate?.startsWith(month));
  const startActive = emps.filter((e) => activeOn(e, first)).length;
  const y = base.slice(0, 4);
  return {
    joined, left, active: emps.filter((e) => activeOn(e, base)).length, startActive,
    turnover: startActive ? Math.round((left.length / startActive) * 1000) / 10 : 0,
    byMonth: Array.from({ length: 12 }, (_, i) => {
      const mm = `${y}-${String(i + 1).padStart(2, "0")}`;
      return {
        month: `${i + 1}월`, join: emps.filter((e) => e.joinDate?.startsWith(mm)).length,
        leave: emps.filter((e) => e.leaveDate?.startsWith(mm)).length,
      };
    }),
  };
}

// ---------------------------------------------------------------- 부서별 출퇴근
export interface PersonStat {
  emp: string;
  dept: string;
  workDays: number; // 출근 기록이 있는 날 (휴일 포함)
  holidayDays: number;
  avgIn: number | null; // 평일 평균 출근 (자정 이후 분)
  earliestIn: number | null;
  avgOut: number | null;
  latestOut: number | null;
  earlyArrivals: number; // 출근 기준 30분 전 도착한 평일
  lateStays: number; // 연장근로가 잡힌 평일
  hours: number; // 실근로시간 합
  firstDays: number; // 그날 부서에서 가장 먼저 출근한 날
  lastDays: number; // 그날 부서에서 가장 늦게 퇴근한 날
}

/** 직원별 출퇴근 통계. 부서 안에서 '가장 먼저 출근 / 가장 늦게 퇴근'한 날도 센다 (캡스·수기 기록만). */
export function personStats(days: DayRow[], rule: WorkRule): PersonStat[] {
  const m = new Map<string, PersonStat & { ins: number[]; outs: number[] }>();
  const first = new Map<string, [string, number]>(), last = new Map<string, [string, number]>(); // '부서|일자'
  for (const d of days) {
    const s = m.get(d.emp) ?? {
      emp: d.emp, dept: d.dept, workDays: 0, holidayDays: 0, avgIn: null, earliestIn: null, avgOut: null,
      latestOut: null, earlyArrivals: 0, lateStays: 0, hours: 0, firstDays: 0, lastDays: 0, ins: [], outs: [],
    };
    m.set(d.emp, s);
    if (d.in === null && d.out === null) continue;
    s.workDays++;
    if (d.holiday) s.holidayDays++;
    s.hours += netHours(d, rule) ?? 0;
    if (d.in !== null && tagged(d.inSrc)) {
      const k = `${d.dept}|${d.day}`;
      if (!first.has(k) || d.in < first.get(k)![1]) first.set(k, [d.emp, d.in]);
      if (!d.holiday) {
        s.ins.push(minutesOf(d.in));
        if (minutesOf(d.in) <= rule.start - 30) s.earlyArrivals++;
      }
    }
    if (d.out !== null && tagged(d.outSrc)) {
      const k = `${d.dept}|${d.day}`;
      if (!last.has(k) || d.out > last.get(k)![1]) last.set(k, [d.emp, d.out]);
      if (!d.holiday) {
        // 자정 넘어 퇴근하면 24시 이후로 센다
        s.outs.push(minutesOf(d.out) + (d.out - ts(d.day) >= 24 * HOUR ? 1440 : 0));
        if (overtimeHours(d, rule) > 0) s.lateStays++;
      }
    }
  }
  for (const [e] of first.values()) m.get(e)!.firstDays++;
  for (const [e] of last.values()) m.get(e)!.lastDays++;
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return [...m.values()].map(({ ins, outs, ...s }) => ({
    ...s, hours: r2(s.hours), avgIn: avg(ins), earliestIn: ins.length ? Math.min(...ins) : null, avgOut: avg(outs),
    latestOut: outs.length ? Math.max(...outs) : null,
  }));
}

/** 기간 안 휴가 유형인지 (대시보드 '다가오는 휴가') */
export function isLeaveType(type: string): boolean {
  return ["연차", "월차", "반차", "반반차", "공가", "경조휴가", "병가", "외출"].includes(type);
}
