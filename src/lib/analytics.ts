/** 일별 근태 판정, 근무형태 자동 표기, 직원별 요약. */
import {
  ALARM_MODES, EXCUSED_TYPES, FULL_DAY_TYPES, type Holidays, LEAVE_DAY_VALUE, TRAVEL_TYPES, type WorkRule,
} from "./config";
import type { Leave } from "./hiworks";
import type { CapsRecord } from "./loader";
import {
  addDays, type DateStr, hhmm, minutesOf, parseClock, type Ts, ts, weekday, weekdayKr,
} from "./time";

/** 웹에서 기입·수정한 값 (null = 수정 안 함, '' = 비움) */
export interface Override {
  employee: string;
  day: DateStr;
  clockIn: string | null;
  inType: string | null;
  clockOut: string | null;
  outType: string | null;
  place: string | null;
  note: string | null;
  editedBy: string;
  editedAt: string;
}

/** 직원·일자별 근태 한 줄 */
export interface DayRow {
  emp: string;
  dept: string;
  day: DateStr;
  wd: string;
  holiday: boolean;
  in: Ts | null;
  out: Ts | null;
  stayH: number | null;
  tags: number;
  leave: string; // 근태 유형 ', '로 연결
  leaveContent: string;
  mates: string; // 같은 출장·교육·휴일근무 일행
  leaveDays: number;
  late: boolean;
  early: boolean;
  status: string;
  inRec: CapsRecord | null;
  outRec: CapsRecord | null;
  inSrc: string; // '캡스' | '하이웍스' | '수기입력' | ''
  outSrc: string;
  lastTag: Ts | null;
  ovInType: string | null;
  ovOutType: string | null;
  ovPlace: string | null;
  ovNote: string | null;
  editedBy: string;
}

const HOUR = 3_600_000;
const MIN = 60_000;

export const splitTypes = (s: string) => s.split(", ").filter(Boolean);
export const unique = <T,>(xs: Iterable<T>) => [...new Set(xs)];
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 파이썬 round()와 같은 짝수 반올림 */
function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (Math.abs(diff - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

/** 파이썬 '{:g}' 와 같은 숫자 표기 (12.0 -> '12', 1.5 -> '1.5') */
export function fmtG(x: number): string {
  return String(Number(x.toPrecision(6)));
}

// ---------------------------------------------------------------- 시각 표기
/** 출근 근무형태: 평일은 항상 '정상(기준)'(지각은 '확인' 열에 표시),
 * 휴일은 기준 전 출근이면 기준 시각, 늦으면 단위 올림. */
export function workTypeIn(t: Ts, holiday: boolean, rule: WorkRule): string {
  if (!holiday) return `정상(${hhmm(rule.start)})`;
  let m = minutesOf(t);
  m = m > rule.start ? Math.ceil(m / rule.roundMin) * rule.roundMin : rule.start;
  return `휴일(${hhmm(m)})`;
}

/** 퇴근 근무형태: 휴일은 단위 절사, 평일은 기준+연장기준분 이후면 '연장'. */
export function workTypeOut(t: Ts, holiday: boolean, rule: WorkRule): string {
  const m = minutesOf(t);
  const floored = Math.floor(m / rule.roundMin) * rule.roundMin;
  if (holiday) return `휴일(${hhmm(floored)})`;
  if (m >= rule.end + rule.overtimeMin) return `연장(${hhmm(floored)})`;
  return `정상(${hhmm(rule.end)})`;
}

// ---------------------------------------------------------------- 일별 판정
/** 하루 기록에서 출근/퇴근 기록을 고른다.
 *
 * - 출근: 첫 '출근' 모드 태그. '출근' 모드가 없으면 첫 번째 '퇴근' 아닌 태그.
 * - 퇴근: 출근 이후의 마지막 '퇴근' 모드 태그 ('출입'만 있으면 퇴근으로 보지 않음).
 */
function pickInOut(g: CapsRecord[]): [CapsRecord | null, CapsRecord | null, Ts] {
  const s = [...g].sort((a, b) => a.ts - b.ts);
  const inRec = s.find((r) => r.mode === "출근") ?? s.find((r) => r.mode !== "퇴근") ?? null;
  const outs = s.filter((r) => r.mode === "퇴근" && (!inRec || r.ts > inRec.ts));
  return [inRec, outs.length ? outs[outs.length - 1] : null, s[s.length - 1].ts];
}

export function isHoliday(d: DateStr, rule: WorkRule, holidays: Holidays): boolean {
  return !rule.workdays.includes(weekday(d)) || d in holidays;
}

export function firstLine(text: string): string {
  return String(text).split("\n")[0].split(/\s+/).filter(Boolean).join(" ");
}

/** 같은 날 같은 출장·교육·휴일근무(내용 첫 줄이 같은) 일행 이름. 키: '이름|일자' */
function companions(leaves: Leave[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const groups = new Map<string, string[]>();
  for (const l of leaves) {
    if (!(TRAVEL_TYPES.has(l.type) || l.type === "휴일근무") || l.content === "") continue;
    const k = [l.day, l.type, firstLine(l.content)].join("\u0000");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l.name);
  }
  for (const k of [...groups.keys()].sort()) {
    const day = k.split("\u0000")[0];
    const names = unique(groups.get(k)!);
    for (const n of names) {
      const key = `${n}|${day}`;
      out.set(key, unique([...(out.get(key) ?? []), ...names.filter((x) => x !== n)]));
    }
  }
  return out;
}

function emptyDay(emp: string, dept: string, day: DateStr): DayRow {
  return {
    emp, dept, day, wd: "", holiday: false, in: null, out: null, stayH: null, tags: 0, leave: "", leaveContent: "",
    mates: "", leaveDays: 0, late: false, early: false, status: "", inRec: null, outRec: null, inSrc: "", outSrc: "",
    lastTag: null, ovInType: null, ovOutType: null, ovPlace: null, ovNote: null, editedBy: "",
  };
}

/** 직원·일자별 근태표. 기록이 없는 평일(결근/휴가)도 포함한다.
 *
 * 출장·교육·외근 날은 출근 기록이 없거나 늦으면 출근 기준 시각, 퇴근 기록이 없거나 이르면
 * 퇴근 기준 시각을 '하이웍스' 출처로 채운다 (관리팀 수작업 방식).
 * leaves는 기록 기간 안의 것만 넘긴다 (leavesIn).
 */
export function buildDays(
  records: CapsRecord[], leaves: Leave[] | null, rule: WorkRule, holidays: Holidays, overrides: Override[] = [],
): DayRow[] {
  const rec = records.filter((r) => !ALARM_MODES.has(r.mode));
  if (!rec.length) return [];

  const rows = new Map<string, DayRow>(); // '직원|일자'
  const byDay = new Map<string, CapsRecord[]>();
  for (const r of rec) {
    const k = `${r.emp}|${r.day}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(r);
  }
  for (const [k, g] of byDay) {
    const [inRec, outRec, last] = pickInOut(g);
    const row = emptyDay(g[0].emp, g[0].dept, g[0].day);
    Object.assign(row, {
      in: inRec?.ts ?? null, out: outRec?.ts ?? null, tags: g.length, inRec, outRec, lastTag: last,
    });
    rows.set(k, row);
  }

  // 직원별 재직 구간(첫 기록~마지막 기록)의 근무일을 채운다
  const deptOf = new Map<string, string>();
  const span = new Map<string, [DateStr, DateStr]>();
  const nameOf = new Map<string, string>();
  const empByName = new Map<string, string>();
  for (const r of rec) {
    if (!deptOf.has(r.emp)) deptOf.set(r.emp, r.dept);
    if (!nameOf.has(r.emp)) nameOf.set(r.emp, r.name);
    if (!empByName.has(r.name)) empByName.set(r.name, r.emp);
    const s = span.get(r.emp);
    span.set(r.emp, s ? [r.day < s[0] ? r.day : s[0], r.day > s[1] ? r.day : s[1]] : [r.day, r.day]);
  }
  for (const [emp, [first, last]] of span) {
    for (let d = first; d <= last; d = addDays(d, 1)) {
      if (!isHoliday(d, rule, holidays) && !rows.has(`${emp}|${d}`)) rows.set(`${emp}|${d}`, emptyDay(emp, deptOf.get(emp)!, d));
    }
  }

  // 하이웍스 근태 붙이기 (이름 기준)
  const leaveMap = new Map<string, Leave[]>();
  let mates = new Map<string, string[]>();
  if (leaves?.length) {
    mates = companions(leaves);
    for (const l of leaves) {
      const emp = empByName.get(l.name);
      if (emp === undefined) continue;
      const k = `${emp}|${l.day}`;
      if (!leaveMap.has(k)) leaveMap.set(k, []);
      leaveMap.get(k)!.push(l);
      if (!rows.has(k)) rows.set(k, emptyDay(emp, deptOf.get(emp)!, l.day));
    }
  }

  // 기입·수정 값 (이 기간·이 직원들 것만)
  const days = rec.map((r) => r.day);
  const lo = days.reduce((a, b) => (b < a ? b : a));
  const hi = days.reduce((a, b) => (b > a ? b : a));
  const ovMap = new Map<string, Override>();
  for (const o of overrides) {
    if (!deptOf.has(o.employee) || o.day < lo || o.day > hi) continue;
    const k = `${o.employee}|${o.day}`;
    ovMap.set(k, o);
    if (!rows.has(k)) rows.set(k, emptyDay(o.employee, deptOf.get(o.employee)!, o.day));
  }

  const out = [...rows.values()];
  for (const r of out) {
    r.wd = weekdayKr(r.day);
    r.holiday = isHoliday(r.day, rule, holidays);
    const g = leaveMap.get(`${r.emp}|${r.day}`);
    if (g) {
      const types = unique(g.map((l) => l.type));
      r.leave = types.join(", ");
      r.leaveContent = unique(g.map((l) => l.content).filter(Boolean)).join(" / ");
      r.leaveDays = types.reduce((s, t) => s + (LEAVE_DAY_VALUE[t] ?? 0), 0);
    }
    r.mates = (mates.get(`${nameOf.get(r.emp) ?? r.emp}|${r.day}`) ?? []).join(", ");

    // 출장·교육·외근 날 하이웍스 시각으로 채우기
    r.inSrc = r.in !== null ? "캡스" : "";
    r.outSrc = r.out !== null ? "캡스" : "";
    const startStd = ts(r.day) + rule.start * MIN;
    const endStd = ts(r.day) + rule.end * MIN;
    const travel = splitTypes(r.leave).some((t) => TRAVEL_TYPES.has(t)) && !r.holiday;
    if (travel && (r.in === null || r.in > startStd)) Object.assign(r, { in: startStd, inRec: null, inSrc: "하이웍스" });
    if (travel && (r.out === null || r.out < endStd)) Object.assign(r, { out: endStd, outRec: null, outSrc: "하이웍스" });

    // 웹에서 기입·수정한 값 (null이면 그대로, ''이면 비움)
    const o = ovMap.get(`${r.emp}|${r.day}`);
    if (o) {
      for (const [v, kind] of [[o.clockIn, "in"], [o.clockOut, "out"]] as const) {
        if (v === null) continue;
        const secs = parseClock(v);
        r[kind] = secs !== null ? ts(r.day, secs) : null;
        r[`${kind}Rec`] = null;
        r[`${kind}Src`] = secs !== null ? "수기입력" : "";
      }
      if (o.inType !== null) r.ovInType = o.inType;
      if (o.outType !== null) r.ovOutType = o.outType;
      if (o.place !== null) r.ovPlace = o.place;
      if (o.note !== null) r.ovNote = o.note;
      r.editedBy = o.editedBy || "";
    }

    r.stayH = r.in !== null && r.out !== null ? Math.round(((r.out - r.in) / HOUR) * 100) / 100 : null;
    const excused = splitTypes(r.leave).some((t) => EXCUSED_TYPES.has(t));
    const startAt = startStd + rule.graceMin * MIN;
    r.late = !r.holiday && !excused && r.in !== null && r.in > startAt;
    r.early = !r.holiday && !excused && r.out !== null && r.out < endStd;
    r.status = statusOf(r);
  }
  return out.sort((a, b) => cmp(a.emp, b.emp) || cmp(a.day, b.day));
}

function statusOf(r: DayRow): string {
  const types = splitTypes(r.leave);
  const hasIn = r.in !== null, hasOut = r.out !== null;
  if (r.holiday) {
    if (hasIn || hasOut) return "휴일근무";
    if (types.includes("휴일근무")) return "휴일근무"; // 캡스 기록은 없지만 휴일근무를 올림 (현장 근무 등)
    const other = types.filter((t) => t !== "연장근무");
    return other.length ? other[0] : "휴일";
  }
  if (!hasIn && !hasOut) {
    const full = types.filter((t) => FULL_DAY_TYPES.has(t));
    if (full.length) return full[0];
    return types.length ? types[0] : "기록 없음";
  }
  if (!hasIn) return "출근 기록 없음";
  if (!hasOut) return "퇴근 기록 없음";
  if (r.late && r.early) return "지각·조퇴";
  if (r.late) return "지각";
  if (r.early) return "조퇴";
  return "정상";
}

// ---------------------------------------------------------------- 요약
function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
}

function meanClock(tss: (Ts | null)[]): string {
  const ms = tss.filter((t): t is Ts => t !== null).map(minutesOf);
  if (!ms.length) return "";
  return hhmm(roundHalfEven(ms.reduce((a, b) => a + b, 0) / ms.length));
}

export interface EmployeeSummary {
  emp: string;
  dept: string;
  workDays: number;
  avgIn: string;
  avgOut: string;
  avgStay: number | null;
  late: number;
  early: number;
  noRecord: number;
  tagMissing: number;
  holidayWork: number;
  leaveUsed: number;
  trips: number;
}

/** 직원별 출근일수, 평균 출퇴근 시각, 지각/조퇴/휴가 집계. 명단 순서로 정렬. */
export function employeeSummary(days: DayRow[], rosterNames: string[] | null = null): EmployeeSummary[] {
  const rows: EmployeeSummary[] = [];
  for (const [emp, g] of groupBy(days, (d) => d.emp)) {
    const work = g.filter((d) => !d.holiday);
    const stays = work.map((d) => d.stayH).filter((x): x is number => x !== null);
    rows.push({
      emp,
      dept: g[0].dept,
      workDays: g.filter((d) => d.in !== null || d.out !== null).length,
      avgIn: meanClock(work.map((d) => d.in)),
      avgOut: meanClock(work.map((d) => d.out)),
      avgStay: stays.length ? Math.round((stays.reduce((a, b) => a + b, 0) / stays.length) * 100) / 100 : null,
      late: g.filter((d) => d.late).length,
      early: g.filter((d) => d.early).length,
      noRecord: g.filter((d) => d.status === "기록 없음").length,
      tagMissing: g.filter((d) => d.status === "출근 기록 없음" || d.status === "퇴근 기록 없음").length,
      holidayWork: g.filter((d) => d.status === "휴일근무").length,
      leaveUsed: g.reduce((s, d) => s + d.leaveDays, 0),
      trips: g.filter((d) => /출장|교육|외근/.test(d.leave)).length,
    });
  }
  return orderByRoster(rows, rosterNames, (r) => r.emp);
}

/** 명단 순서대로 정렬 (명단에 없는 사람은 뒤에 가나다순). */
export function orderByRoster<T>(rows: T[], rosterNames: string[] | null, key: (r: T) => string): T[] {
  if (!rosterNames?.length) return [...rows].sort((a, b) => cmp(key(a), key(b)));
  const order = new Map(rosterNames.map((n, i) => [n, i]));
  const pos = (r: T) => order.get(key(r)) ?? order.size;
  return [...rows].sort((a, b) => pos(a) - pos(b) || cmp(key(a), key(b)));
}

/** 요일(행) x 시간대(열) 태그 건수 (경비 설정/해제 제외). */
export function hourlyByWeekday(records: CapsRecord[]): number[][] {
  const table = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const r of records) {
    if (ALARM_MODES.has(r.mode)) continue;
    table[weekday(r.day)][Math.floor(minutesOf(r.ts) / 60)]++;
  }
  return table;
}

export interface Headcount {
  day: DateStr;
  present: number;
  late: number;
  onLeave: number;
}

/** 날짜별 출근 인원·지각·휴가 인원. */
export function dailyHeadcount(days: DayRow[]): Headcount[] {
  return [...groupBy(days, (d) => d.day)].sort(([a], [b]) => cmp(a, b)).map(([day, g]) => ({
    day,
    present: g.filter((d) => d.in !== null).length,
    late: g.filter((d) => d.late).length,
    onLeave: g.filter((d) => d.leaveDays > 0).length,
  }));
}

/** 월별 상태 건수 (정상/지각/조퇴/연차 등). */
export function monthStatus(days: DayRow[]): { month: string; status: string; n: number }[] {
  const m = groupBy(days, (d) => `${d.day.slice(0, 7)}\u0000${d.status}`);
  return [...m].map(([k, g]) => {
    const [month, status] = k.split("\u0000");
    return { month, status, n: g.length };
  }).sort((a, b) => cmp(a.month, b.month) || cmp(a.status, b.status));
}

// ---------------------------------------------------------------- 대시보드
export const MISSING_LABELS: Record<string, string> = {
  "기록 없음": "미출근", "출근 기록 없음": "출근 누락", "퇴근 기록 없음": "퇴근 누락",
};

/** 휴게시간: 8시간 이상 1시간, 4시간 이상 30분. */
function breakHours(stayH: number): number {
  return stayH >= 8 ? 1 : stayH >= 4 ? 0.5 : 0;
}

/** 기준일의 출근·지각·미출근·휴가 인원. */
export function daySnapshot(days: DayRow[], day: DateStr) {
  const d = days.filter((r) => r.day === day);
  return {
    출근: d.filter((r) => r.in !== null || r.out !== null).length,
    지각: d.filter((r) => r.late).length,
    미출근: d.filter((r) => r.status === "기록 없음").length,
    휴가: d.filter((r) => r.leave.split(", ").some((t) => t in LEAVE_DAY_VALUE || FULL_DAY_TYPES.has(t))).length,
  };
}

/** 출퇴근 누락 목록 (최근 날짜 먼저). */
export function missingRows(days: DayRow[]) {
  return days.filter((d) => d.status in MISSING_LABELS)
    .map((d) => ({ emp: d.emp, dept: d.dept, day: d.day, wd: d.wd, label: MISSING_LABELS[d.status] }))
    .sort((a, b) => cmp(b.day, a.day) || cmp(a.emp, b.emp));
}

export interface HoursReport {
  emp: string;
  dept: string;
  std: number;
  actual: number;
  overtime: number;
  holiday: number;
  late: number;
  missing: number;
  reasons: string;
}

/** 직원별 소정·실제·연장·휴일 근로시간(h)과 주의 사유.
 *
 * 소정근로 = 평일 수 x (퇴근기준 - 출근기준 - 휴게 1h)
 * 실제근로 = 출퇴근이 모두 있는 평일의 (퇴근 - max(출근, 출근기준) - 휴게)
 * 연장근로 = 평일 퇴근이 기준+연장기준분 이후인 날의 (퇴근 - 퇴근기준), 단위 절사
 * 휴일근로 = 휴일 (퇴근 - 출근 - 휴게), 단위 절사
 */
export function workHoursReport(days: DayRow[], rule: WorkRule, rosterNames: string[] | null = null): HoursReport[] {
  const stdDay = (rule.end - rule.start) / 60 - 1;
  const rows: HoursReport[] = [];
  for (const [emp, g] of groupBy(days, (d) => d.emp)) {
    let actual = 0, overtime = 0, holiday = 0;
    for (const d of g) {
      if (d.in === null || d.out === null) continue;
      // 평일은 출근 기준(08:30) 전에 온 시간은 근로로 보지 않음 (조출은 승인 기반이라 제외)
      const startAt = ts(d.day) + rule.start * MIN;
      const begin = d.holiday || d.in > startAt ? d.in : startAt;
      const spanH = Math.max(0, (d.out - begin) / HOUR);
      const net = spanH - breakHours(spanH);
      if (d.holiday) {
        holiday += Math.floor((net * 60) / rule.roundMin) * rule.roundMin;
      } else {
        actual += net;
        const overMin = (d.out - (ts(d.day) + rule.end * MIN)) / MIN;
        overtime += Math.floor((overMin >= rule.overtimeMin ? overMin : 0) / rule.roundMin) * rule.roundMin;
      }
    }
    overtime /= 60;
    holiday /= 60;
    const late = g.filter((d) => d.late).length;
    const missing = g.filter((d) => d.status in MISSING_LABELS).length;
    const reasons: string[] = [];
    if (late >= 3) reasons.push(`지각 ${late}회`);
    if (missing >= 3) reasons.push(`출퇴근 누락 ${missing}회`);
    if (overtime + holiday >= 12) reasons.push(`연장·휴일 ${fmtG(overtime + holiday)}h`);
    rows.push({
      emp, dept: g[0].dept, std: g.filter((d) => !d.holiday).length * stdDay, actual, overtime, holiday, late, missing,
      reasons: reasons.join(", "),
    });
  }
  return orderByRoster(rows, rosterNames, (r) => r.emp);
}

/** 올해 1월 1일 ~ 기준일 연차 사용일수(연차 1, 반차 0.5, 반반차 0.25)와 공가 일수. */
export function leaveStatus(leaves: Leave[] | null, names: string[], upto: DateStr) {
  const from = `${upto.slice(0, 4)}-01-01`;
  const lv = (leaves ?? []).filter((l) => names.includes(l.name) && l.day >= from && l.day <= upto);
  return names.map((name) => {
    const mine = lv.filter((l) => l.name === name);
    return {
      name,
      annual: mine.reduce((s, l) => s + (LEAVE_DAY_VALUE[l.type] ?? 0), 0),
      special: new Set(mine.filter((l) => l.type === "공가").map((l) => l.day)).size,
    };
  });
}

/** 관리가 필요한 직원 분류 -> [(항목, 이름 목록)] */
export function attention(days: DayRow[], report: HoursReport[], outsiders: string[]): [string, string[]][] {
  return [
    ["지각 3회 이상", report.filter((r) => r.late >= 3).map((r) => r.emp)],
    ["출퇴근 누락 3회 이상", report.filter((r) => r.missing >= 3).map((r) => r.emp)],
    ["연장·휴일근로 12시간 이상", report.filter((r) => r.overtime + r.holiday >= 12).map((r) => r.emp)],
    ["휴일 출근 직원", unique(days.filter((d) => d.status === "휴일근무").map((d) => d.emp)).sort(cmp)],
    ["명단에 없는 출입자", outsiders],
  ];
}

// ---------------------------------------------------------------- 일일 현황
const LEAVE_LIKE = new Set(["연차", "반차", "반반차", "공가", "외출"]);
const TRIP_LIKE = new Set(["출장", "교육", "외근"]);

export interface BoardRow {
  emp: string;
  dept: string;
  in: Ts | null;
  out: Ts | null;
  leave: string;
  leaveContent: string;
  group: string; // 구분
  status: string;
  late: boolean;
  overtime: boolean; // 연장근무 신청
}

/** 기준일 직원별 현황판.
 *
 * days   : buildDays 결과 (기준일을 포함한 기간)
 * staff  : [(직원, 부서)] 기준일에 재직 중인 직원
 * now    : 오늘이면 현재 시각 (아직 퇴근 전인 사람을 '근무 중'으로)
 * holiday: 주말·공휴일이면 true — 기록 없는 사람은 '휴무', 출근했거나 휴일근무를 올린 사람은 '휴일근무'
 */
export function dailyBoard(
  days: DayRow[], leaves: Leave[] | null, staff: [string, string][], day: DateStr, rule: WorkRule,
  now: Ts | null = null, holiday = false,
): BoardRow[] {
  const d = new Map(days.filter((r) => r.day === day).map((r) => [r.emp, r]));
  const lv = (leaves ?? []).filter((l) => l.day === day);
  const endAt = ts(day) + rule.end * MIN;
  return staff.map(([emp, dept]) => {
    const r = d.get(emp) ?? null;
    const mine = lv.filter((l) => l.name === emp);
    const types = mine.length ? unique(mine.map((l) => l.type)) : r ? splitTypes(r.leave) : [];
    const content = mine.length
      ? unique(mine.map((l) => l.content).filter(Boolean).map((c) => c.split("\n")[0])).join(" / ")
      : r ? r.leaveContent.split("\n")[0] : "";
    let tIn = r?.in ?? null, tOut = r?.out ?? null;
    // 하이웍스로 채운 시각은 현황판에서 제외
    if (r && r.inSrc !== "캡스" && r.inSrc !== "수기입력") tIn = null;
    if (r && r.outSrc !== "캡스" && r.outSrc !== "수기입력") tOut = null;
    const late = r?.late ?? false;

    const present = tIn !== null || tOut !== null;
    const has = (set: Set<string>) => types.some((t) => set.has(t));
    let group: string;
    if (holiday) {
      if (present || types.includes("휴일근무")) group = "휴일근무";
      else if (has(LEAVE_LIKE) || has(TRIP_LIKE)) group = has(LEAVE_LIKE) ? "휴가" : "출장·교육";
      else group = "휴무";
    } else if (has(TRIP_LIKE)) group = "출장·교육";
    else if (types.some((t) => t === "연차" || t === "공가") && !present) group = "휴가";
    else if (present && tOut === null) {
      group = now !== null && now < endAt + 4 * HOUR ? "근무 중" : "퇴근 기록 없음";
    } else if (present) group = "퇴근";
    else if (has(LEAVE_LIKE)) group = "휴가";
    else group = "기록 없음";
    const status = late ? "지각" : group === "퇴근" ? "정상" : group;
    return {
      emp, dept, in: tIn, out: tOut, leave: types.join(", "), leaveContent: content, group, status, late,
      overtime: types.includes("연장근무"),
    };
  });
}

export function boardCounts(board: BoardRow[]) {
  return {
    대상: board.filter((b) => b.group !== "휴무").length,
    출근: board.filter((b) => b.in !== null).length,
    퇴근: board.filter((b) => b.out !== null).length,
    지각: board.filter((b) => b.late).length,
    휴가: board.filter((b) => splitTypes(b.leave).some((t) => LEAVE_LIKE.has(t))).length,
    "출장·교육": board.filter((b) => b.group === "출장·교육").length,
    휴일근무: board.filter((b) => b.group === "휴일근무").length,
    연장근무: board.filter((b) => b.overtime).length,
    "기록 없음": board.filter((b) => b.group === "기록 없음").length,
    "근무 중": board.filter((b) => b.group === "근무 중").length,
  };
}
