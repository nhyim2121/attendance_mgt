/** 휴가 관리: 회계연도 기준 연차·월차 부여, 사용·잔여 계산, 사이트에서 등록한 휴가를 근태로 펼치기.
 *
 * 연차 (회계연도 기준, 회계연도는 시작하는 해로 부른다. 1월 시작이면 2026 = 2026-01-01 ~ 2026-12-31)
 * - 입사한 회계연도      : 연차 없음 (월차만)
 * - 입사 다음 회계연도   : 기본일수 × 입사 연도 재직일 / 그 해 일수 (비례 부여, 끄면 기본일수)
 * - 그 다음부터          : 기본일수 + (회계연도 근속 - 1) ÷ 가산주기, 최대 상한
 * 월차 (입사 1년 미만): 입사일로부터 매달 같은 날 1일씩, 최대 상한.
 *   회사 규정: 입사일이 기준일(포함) 이전이면 입사한 달 몫으로 추가 일수를 입사일에 준다.
 */
import { LEAVE_DAY_VALUE } from "./config";
import type { Employee } from "./employees";
import type { Leave } from "./leave";
import { addDays, type DateStr, daysBetween, makeDate } from "./time";

export const VACATION_TYPES = ["연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가"];
/** 기간으로 등록하는 유형 (나머지는 하루) */
export const RANGE_TYPES = new Set(["연차", "월차", "공가", "경조휴가", "병가"]);
/** 잔여 연차에서 빼는 유형 */
export const DEDUCT_TYPES = new Set(["연차", "월차", "반차", "반반차"]);

export interface LeavePolicy {
  fyStartMonth: number; // 회계연도 시작 월 (1~12)
  baseDays: number; // 기본 연차 (15)
  addEvery: number; // 근속 가산 주기(년) (2)
  maxDays: number; // 연차 상한 (25)
  prorate: boolean; // 입사 다음 회계연도 비례 부여
  prorateRound: "none" | "half" | "halfRound" | "one"; // 비례 부여 끝수 처리 (half = 0.5 올림, halfRound = 0.5 반올림)
  monthly: boolean; // 입사 1년 미만 월차
  monthlyMax: number; // 월차 상한 (11)
  joinCutoffDay: number; // 이 날(포함) 이전 입사면 입사월 월차 추가
  joinExtra: number; // 추가 일수
  outingDeduct: boolean; // 외출 시간을 연차에서 차감
  outingHoursPerDay: number; // 연차 1일 = 몇 시간
  exclude: string[]; // 연차 현황·보고서에서 뺄 사람 (임원 등)
}

export const DEFAULT_POLICY: LeavePolicy = {
  fyStartMonth: 1, baseDays: 15, addEvery: 2, maxDays: 25, prorate: true, prorateRound: "half", monthly: true,
  monthlyMax: 11, joinCutoffDay: 10, joinExtra: 1, outingDeduct: false, outingHoursPerDay: 8, exclude: [],
};

/** 사이트에서 등록한 휴가 */
export interface Vacation {
  id: number;
  name: string;
  type: string;
  startDay: DateStr;
  endDay: DateStr;
  startTime: string;
  endTime: string;
  reason: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface Adjust {
  id: number;
  name: string;
  fy: number;
  days: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

// ---------------------------------------------------------------- 회계연도
export function fyOf(d: DateStr, p: LeavePolicy): number {
  const y = +d.slice(0, 4), m = +d.slice(5, 7);
  return m >= p.fyStartMonth ? y : y - 1;
}

/** 회계연도 [시작일, 종료일] */
export function fyRange(fy: number, p: LeavePolicy): [DateStr, DateStr] {
  const start = makeDate(fy, p.fyStartMonth, 1)!;
  return [start, addDays(makeDate(fy + 1, p.fyStartMonth, 1)!, -1)];
}

export function fyLabel(fy: number, p: LeavePolicy): string {
  if (p.fyStartMonth === 1) return `${fy}년`;
  const [s, e] = fyRange(fy, p);
  return `${fy}회계연도 (${s.slice(0, 7)} ~ ${e.slice(0, 7)})`;
}

/** 같은 날짜의 n달 뒤 (말일 넘으면 그 달 말일) */
export function addMonths(d: DateStr, n: number): DateStr {
  const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n, day = +d.slice(8, 10);
  const yy = y + Math.floor(m / 12), mm = (((m % 12) + 12) % 12) + 1;
  for (let x = day; x > 27; x--) {
    const t = makeDate(yy, mm, x);
    if (t) return t;
  }
  return makeDate(yy, mm, day)!;
}

function roundUp(x: number, unit: LeavePolicy["prorateRound"]): number {
  if (unit === "none") return Math.round(x * 100) / 100;
  if (unit === "halfRound") return Math.round(x * 2 + 1e-9) / 2; // 0.5일 단위 반올림 (13.64 -> 13.5, 10.48 -> 10.5)
  const u = unit === "half" ? 0.5 : 1;
  return Math.ceil(x / u - 1e-9) * u;
}

// ---------------------------------------------------------------- 부여
export interface AnnualGrant {
  days: number;
  note: string;
  years: number | null; // 회계연도 기준 근속 (입사 연도 0)
}

export function annualGrant(join: DateStr | null, fy: number, p: LeavePolicy): AnnualGrant {
  if (!join) return { days: p.baseDays, note: "입사일 없음 (기본일수)", years: null };
  const joinFy = fyOf(join, p);
  if (joinFy >= fy) return { days: 0, note: "입사 연도 (월차만)", years: 0 };
  if (joinFy === fy - 1) {
    if (!p.prorate) return { days: p.baseDays, note: "입사 다음 연도", years: 1 };
    const [ps] = fyRange(fy - 1, p), [s] = fyRange(fy, p);
    const worked = daysBetween(join, s), total = daysBetween(ps, s);
    return { days: roundUp((p.baseDays * worked) / total, p.prorateRound), note: `비례 ${worked}/${total}일`, years: 1 };
  }
  const n = fy - joinFy - 1;
  const days = Math.min(p.maxDays, p.baseDays + Math.floor(Math.max(0, n - 1) / Math.max(1, p.addEvery)));
  return { days, note: `근속 ${n}년`, years: n + 1 };
}

/** 월차 발생일 목록 [(발생일, 일수, 사유)] (입사 1년 미만) */
export function monthlyGrants(join: DateStr | null, p: LeavePolicy): [DateStr, number, string][] {
  if (!join || !p.monthly) return [];
  const out: [DateStr, number, string][] = [];
  if (p.joinExtra > 0 && +join.slice(8, 10) <= p.joinCutoffDay) {
    out.push([join, p.joinExtra, `${p.joinCutoffDay}일 이전 입사 (입사월)`]);
  }
  const yearEnd = addMonths(join, 12);
  for (let k = 1; k <= p.monthlyMax; k++) {
    const d = addMonths(join, k);
    if (d >= yearEnd) break;
    out.push([d, 1, `${k}개월`]);
  }
  return out;
}

// ---------------------------------------------------------------- 사용
const TIME_SPAN = /(\d{1,2}):(\d{2})\s*[~\-]\s*(\d{1,2}):(\d{2})/;

/** 외출 시간 (내용에 'HH:MM~HH:MM'이 있으면) */
export function outingHours(content: string): number {
  const m = TIME_SPAN.exec(content);
  if (!m) {
    // 하이웍스 결재 제목처럼 '1시간 30분', '30분'으로 적힌 경우
    const h = /(\d+(?:\.\d+)?)\s*시간/.exec(content), mm = /(\d+)\s*분/.exec(content);
    const x = (h ? +h[1] : 0) + (mm ? +mm[1] / 60 : 0);
    return x > 0 ? Math.round(x * 100) / 100 : 0;
  }
  const h = (+m[3] * 60 + +m[4] - (+m[1] * 60 + +m[2])) / 60;
  return h > 0 ? Math.round(h * 100) / 100 : 0;
}

/** 근태 한 건이 잔여 연차에서 빠지는 일수 */
export function deductDays(l: Leave, p: LeavePolicy): number {
  if (l.type === "외출") return p.outingDeduct ? outingHours(l.content) / p.outingHoursPerDay : 0;
  return DEDUCT_TYPES.has(l.type) ? LEAVE_DAY_VALUE[l.type] ?? 0 : 0;
}

export interface UseItem {
  day: DateStr;
  type: string; // 집계 유형 (입사 1년 전 연차 신청 -> 월차)
  applied?: string; // 신청한 유형 (type과 다를 때 화면에 표시)
  days: number;
  content: string;
  src: string; // 근태현황 파일 시트 이름 | '사이트' | '휴가관리'
  planned: boolean; // 기준일 뒤 (예정)
}

export interface LeaveBalance {
  name: string;
  dept: string;
  rank: string;
  joinDate: DateStr | null;
  years: number | null;
  annual: number;
  annualNote: string;
  monthly: number; // 기준일까지 발생한 월차
  monthlyLater: number; // 이 회계연도 안에 더 발생할 월차
  monthlyItems: [DateStr, number, string][];
  adjust: number;
  total: number; // 연차 + 발생 월차 + 조정
  used: number;
  planned: number;
  remain: number; // total - used - planned
  counts: Record<string, number>; // 유형별 건수 (예정 포함)
  outingHours: number;
  items: UseItem[];
}

/** 직원별 회계연도 연차 현황. 퇴사일이 회계연도 시작 전이거나 입사일이 끝 뒤인 직원은 뺀다. */
export function leaveBalances(emps: Employee[], leaves: Leave[], adjust: Adjust[], fy: number, asOf: DateStr,
  p: LeavePolicy): LeaveBalance[] {
  const [s, e] = fyRange(fy, p);
  const byName = new Map<string, Leave[]>();
  for (const l of leaves) {
    if (l.day < s || l.day > e) continue;
    if (!byName.has(l.name)) byName.set(l.name, []);
    byName.get(l.name)!.push(l);
  }
  return emps.filter((x) => (!x.leaveDate || x.leaveDate >= s) && (!x.joinDate || x.joinDate <= e)).map((x) => {
    const a = annualGrant(x.joinDate, fy, p);
    const mg = monthlyGrants(x.joinDate, p).filter(([d]) => d >= s && d <= e && (!x.leaveDate || d <= x.leaveDate));
    const monthly = mg.filter(([d]) => d <= asOf).reduce((t, [, n]) => t + n, 0);
    const monthlyLater = mg.filter(([d]) => d > asOf).reduce((t, [, n]) => t + n, 0);
    const adj = adjust.filter((j) => j.name === x.name && j.fy === fy).reduce((t, j) => t + j.days, 0);
    // 재직 기간 밖의 기록은 뺀다 (동명이인 퇴사자의 휴가가 새 입사자에게 잡히지 않도록)
    const mine = (byName.get(x.name) ?? []).filter((l) => (!x.joinDate || l.day >= x.joinDate) && (!x.leaveDate || l.day <= x.leaveDate));
    // 연차·월차는 쓴 날로 나눈다: 입사 1년이 되기 전 = 월차, 1년이 지난 뒤 = 연차 (신청한 이름과 관계없이)
    const anniv = x.joinDate ? `${+x.joinDate.slice(0, 4) + 1}${x.joinDate.slice(4)}` : null;
    const kind = (l: Leave) => (anniv && (l.type === "연차" || l.type === "월차") ? (l.day < anniv ? "월차" : "연차") : l.type);
    const items: UseItem[] = mine.map((l) => ({
      day: l.day, type: kind(l), applied: l.type, days: deductDays(l, p), content: l.content, src: l.sheet, planned: l.day > asOf,
    }));
    const counts: Record<string, number> = {};
    for (const it of items) counts[it.type] = (counts[it.type] ?? 0) + 1;
    const sum = (xs: UseItem[]) => Math.round(xs.reduce((t, it) => t + it.days, 0) * 100) / 100;
    const used = sum(items.filter((it) => !it.planned)), planned = sum(items.filter((it) => it.planned));
    const total = a.days + monthly + adj;
    return {
      name: x.name, dept: x.dept, rank: x.rank, joinDate: x.joinDate, years: a.years, annual: a.days,
      annualNote: a.note, monthly, monthlyLater, monthlyItems: mg, adjust: adj, total, used, planned,
      remain: Math.round((total - used - planned) * 100) / 100, counts,
      outingHours: items.filter((it) => it.type === "외출").reduce((t, it) => t + outingHours(it.content), 0),
      items: items.sort((m, n) => (m.day < n.day ? -1 : m.day > n.day ? 1 : 0)),
    };
  });
}

// ---------------------------------------------------------------- 등록한 휴가 -> 근태
/** 등록한 휴가를 날짜별 근태로 펼친다. 기간 휴가는 근무일만 (isWorkday). */
export function expandVacations(vs: Vacation[], isWorkday: (d: DateStr) => boolean): Leave[] {
  const out: Leave[] = [];
  for (const v of vs) {
    const time = v.startTime && v.endTime ? `${v.startTime}~${v.endTime}` : "";
    const content = [v.reason || v.type, time].filter(Boolean).join("\n");
    for (let d = v.startDay; d <= v.endDay; d = addDays(d, 1)) {
      if (v.startDay !== v.endDay && !isWorkday(d)) continue;
      out.push({ day: d, name: v.name, dept: "", rank: "", type: v.type, content, note: v.note, sheet: "휴가관리" });
    }
  }
  return out;
}

/** 기간 휴가의 사용일수 (근무일 수 × 유형 일수) */
export function vacationDays(v: Pick<Vacation, "type" | "startDay" | "endDay">, isWorkday: (d: DateStr) => boolean,
  p: LeavePolicy, content = ""): number {
  let n = 0;
  for (let d = v.startDay; d <= v.endDay; d = addDays(d, 1)) if (v.startDay === v.endDay || isWorkday(d)) n++;
  if (v.type === "외출") return p.outingDeduct ? outingHours(content) / p.outingHoursPerDay : 0;
  return n * (DEDUCT_TYPES.has(v.type) ? LEAVE_DAY_VALUE[v.type] ?? 0 : 0);
}
