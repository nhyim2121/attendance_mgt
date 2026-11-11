/** 휴가 관리: 회계연도 기준 연차·월차 부여, 사용·잔여 계산, 사이트에서 등록한 휴가를 근태로 펼치기.
 *
 * 연차 (회계연도 기준, 회계연도는 시작하는 해로 부른다. 1월 시작이면 2026 = 2026-01-01 ~ 2026-12-31)
 * - 입사한 회계연도      : 연차 없음 (월차만)
 * - 입사 다음 회계연도   : 기본일수 × 입사 연도 재직일 / 그 해 일수 (비례 부여, 끄면 기본일수)
 * - 그 다음부터          : 기본일수 + (회계연도 근속 - 1) ÷ 가산주기, 최대 상한
 * 월차 (입사 1년 미만): 입사일로부터 매달 같은 날 1일씩, 최대 상한.
 *   회사 규정: 입사일이 기준일(포함) 이전이면 입사한 달 몫으로 추가 일수를 입사일에 준다.
 *   입사 1년이 되는 날 쓰지 않은 월차는 사라진다 (자동 조정 '월차 소멸').
 */
import { LEAVE_DAY_VALUE } from "../config";
import { LUNCH } from "./daily";
import type { Employee } from "./employees";
import type { Leave } from "./leave";
import { addDays, type DateStr, daysBetween, makeDate } from "../time";

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

/** 30분 단위 올림 (1시간 10분 -> 1.5시간) */
export const halfHourUp = (h: number) => (h > 0 ? Math.ceil(h * 2 - 1e-9) / 2 : 0);

/** 외출 시간 (내용의 'HH:MM~HH:MM'을 모두 더함, 30분 단위 올림) */
export function outingHours(content: string): number {
  const spans = [...content.matchAll(new RegExp(TIME_SPAN.source, "g"))];
  if (!spans.length) {
    // 하이웍스 결재 제목처럼 '1시간 30분', '30분'으로 적힌 경우
    const h = /(\d+(?:\.\d+)?)\s*시간/.exec(content), mm = /(\d+)\s*분/.exec(content);
    return halfHourUp((h ? +h[1] : 0) + (mm ? +mm[1] / 60 : 0));
  }
  const min = spans.reduce((t, m) => {
    const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
    const lunch = Math.max(0, Math.min(b, LUNCH[1]) - Math.max(a, LUNCH[0])); // 점심시간은 빼고 센다
    return t + Math.max(0, b - a - lunch);
  }, 0);
  return halfHourUp(min / 60);
}

/** 근태 한 건이 잔여 연차에서 빠지는 일수 */
export function deductDays(l: Leave, p: LeavePolicy): number {
  if (l.type === "외출") return p.outingDeduct ? outingHours(l.content) / p.outingHoursPerDay : 0;
  return DEDUCT_TYPES.has(l.type) ? LEAVE_DAY_VALUE[l.type] ?? 0 : 0;
}

const HALF_HOURS: Record<string, number> = { 반차: 4, 반반차: 2 };
const hm = (h: number, m = 0) => h * 60 + m;
/** 반차·반반차 시간대 (하이웍스 기준: 오전 반차 08:30~13:30, 오후 반차 13:30~17:30, 반반차 08:30~10:30·15:30~17:30) */
const HALF_WINDOWS: Record<string, [number, number][]> = {
  반차: [[hm(8, 30), hm(13, 30)], [hm(13, 30), hm(17, 30)]],
  반반차: [[hm(8, 30), hm(10, 30)], [hm(15, 30), hm(17, 30)]],
};
const workMin = (a: number, b: number) => Math.max(0, b - a - Math.max(0, Math.min(b, LUNCH[1]) - Math.max(a, LUNCH[0])));

/** 반차·반반차와 함께 낸 시간 중 그 시간대 밖의 시간 = 외출 (가장 많이 겹치는 시간대 기준, 30분 단위).
 * 예) 13:00~17:30 + 반차 -> 0.5시간, 13:00~17:00 + 반차 -> 0.5시간, 14:00~17:30 + 반반차 -> 1.5시간 */
export function outsideHalf(content: string, half: string): number {
  const spans = [...content.matchAll(new RegExp(TIME_SPAN.source, "g"))].map((m) => [hm(+m[1], +m[2]), hm(+m[3], +m[4])]);
  if (!spans.length) return Math.max(0, outingHours(content) - HALF_HOURS[half]);
  const total = spans.reduce((t, [a, b]) => t + workMin(a, b), 0);
  const inside = Math.max(...HALF_WINDOWS[half].map(([wa, wb]) =>
    spans.reduce((t, [a, b]) => t + workMin(Math.max(a, wa), Math.min(b, wb)), 0)));
  return halfHourUp((total - inside) / 60);
}

/** 한 사람의 하루 근태를 휴가 규칙대로 정리한다.
 * - '외출+오후반차 13:00~17:30'처럼 한 신청이 두 줄(반차·연차 + 외출)로 들어오면: 반차 + 반차 시간대 밖의 시간 외출.
 *   시간이 안 적혀 있으면 외출 30분 (보통 13:00~17:30).
 * - 외출만 4시간 이상이면: 반차 + 반차 시간대 밖의 시간 외출 (13:00~17:00 -> 반차 + 0.5시간).
 * - 연차·월차로 올라왔지만 내용이 '오후 반차'처럼 반차·반반차뿐이면 그 유형으로.
 * 돌려주는 hours는 외출 시간 (30분 단위). */
export function normalizeDay(rows: Leave[]): { l: Leave; type: string; hours: number }[] {
  const out: { l: Leave; type: string; hours: number }[] = [];
  const outs = rows.filter((r) => r.type === "외출"), used = new Set<Leave>();
  const halfOf = (c: string, fallback = "반차") => (/반반차/.test(c) ? "반반차" : /반차/.test(c) ? "반차" : fallback);
  const halfOnly = (c: string) => /반차/.test(c) && !/연차|월차/.test(c);
  for (const o of outs) {
    const h = outingHours(o.content);
    const partner = rows.find((r) => !used.has(r) && r !== o && ["반차", "반반차", "연차", "월차"].includes(r.type)
      && (r.content === o.content || (/외출/.test(r.content) && /반차/.test(r.content))));
    let rest = h;
    if (partner) {
      used.add(partner);
      const half = partner.type === "반반차" || partner.type === "반차" ? partner.type : halfOf(o.content);
      out.push({ l: partner, type: half, hours: 0 });
      rest = h ? outsideHalf(o.content, half) : half === "반차" ? 0.5 : 0;
      if (rest > 0) out.push({ l: o, type: "외출", hours: rest });
      continue;
    }
    if (h >= 4 || (!h && halfOnly(o.content) && halfOf(o.content) === "반차")) {
      out.push({ l: o, type: "반차", hours: 0 });
      rest = h ? outsideHalf(o.content, "반차") : 0.5;
      if (rest > 0) out.push({ l: o, type: "외출", hours: rest });
      continue;
    }
    out.push({ l: o, type: "외출", hours: h });
  }
  for (const r of rows) {
    if (r.type === "외출" || used.has(r)) continue;
    if (r.type === "반차" && /외출/.test(r.content)) {
      // '외출+오후반차'인데 외출 줄이 따로 없는 경우
      const h = outingHours(r.content);
      out.push({ l: r, type: "반차", hours: 0 }, { l: r, type: "외출", hours: h ? outsideHalf(r.content, "반차") : 0.5 });
      continue;
    }
    const t = (r.type === "연차" || r.type === "월차") && halfOnly(r.content) ? halfOf(r.content) : r.type;
    out.push({ l: r, type: t, hours: 0 });
  }
  return out.filter((x) => x.type !== "외출" || x.hours > 0 || x.l.type === "외출");
}

export interface UseItem {
  day: DateStr;
  type: string; // 집계 유형 (입사 1년 전 연차 신청 -> 월차)
  applied?: string; // 신청한 유형 (type과 다를 때 화면에 표시)
  days: number;
  hours: number; // 외출 시간 (30분 단위)
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
  adjust: number; // 직접 등록한 조정 + 자동 월차 소멸(음수)
  expired: number; // 입사 1년이 되어 사라진 미사용 월차 (기준일까지, adjust에 포함)
  expireDay: DateStr | null; // 이 회계연도 안의 입사 1년 날 (월차 소멸일)
  expireLater: number; // 기준일 뒤 소멸 예정 월차 (지금 기록 기준, adjust에 넣지 않음)
  total: number; // 연차 + 발생 월차 + 조정
  used: number;
  planned: number;
  remain: number; // total - used - planned
  counts: Record<string, number>; // 유형별 건수 (예정 포함)
  typeDays: Record<string, number>; // 유형별 일수 (예정 포함, 외출은 시간 ÷ 하루 시간, 공가·병가 등은 하루 1일)
  outingHours: number;
  items: UseItem[];
}

/** 전년도에서 넘어온 조정 (사유에 '이월'·'초과'). 입사 1년 날이 있는 해의 이월분은 월차이므로 소멸 계산에 넣는다. */
const CARRY_RE = /이월|초과/;

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
    const anniv = x.joinDate ? addMonths(x.joinDate, 12) : null;
    const kind = (l: Leave) => (anniv && (l.type === "연차" || l.type === "월차") ? (l.day < anniv ? "월차" : "연차") : l.type);
    const byDay = new Map<string, Leave[]>();
    for (const l of mine) byDay.set(l.day, [...(byDay.get(l.day) ?? []), l]);
    const items: UseItem[] = [...byDay.values()].flatMap(normalizeDay).map(({ l, type, hours }) => {
      const t = kind({ ...l, type });
      const days = t === "외출" ? (p.outingDeduct ? hours / p.outingHoursPerDay : 0) : DEDUCT_TYPES.has(t) ? LEAVE_DAY_VALUE[t] ?? 0 : 0;
      return { day: l.day, type: t, applied: l.type, days, hours, content: l.content, src: l.sheet, planned: l.day > asOf };
    });
    const counts: Record<string, number> = {}, typeDays: Record<string, number> = {};
    for (const it of items) {
      counts[it.type] = (counts[it.type] ?? 0) + 1;
      const d = it.type === "외출" ? it.hours / p.outingHoursPerDay : LEAVE_DAY_VALUE[it.type] ?? 1;
      typeDays[it.type] = Math.round(((typeDays[it.type] ?? 0) + d) * 10000) / 10000;
    }
    const sum = (xs: UseItem[]) => Math.round(xs.reduce((t, it) => t + it.days, 0) * 10000) / 10000;
    const used = sum(items.filter((it) => !it.planned)), planned = sum(items.filter((it) => it.planned));
    // 월차 소멸: 입사 1년이 되는 날 남은 월차는 사라진다. 그날이 이 회계연도에 있으면
    // (이 해에 생긴 월차 + 전년도 이월·초과 조정) - (그날 전에 쓴 휴가) 를 뺀다. 그 전에 쓴 휴가는 모두 월차로 센다.
    let expired = 0, expireLater = 0;
    const expireDay = anniv && p.monthly && anniv >= s && anniv <= e && (!x.leaveDate || x.leaveDate >= anniv) ? anniv : null;
    if (expireDay) {
      const carry = adjust.filter((j) => j.name === x.name && j.fy === fy && CARRY_RE.test(j.reason)).reduce((t, j) => t + j.days, 0);
      const pool = mg.filter(([d]) => d < expireDay).reduce((t, [, n]) => t + n, 0) + carry;
      const left = Math.max(0, Math.round((pool - sum(items.filter((it) => it.day < expireDay))) * 10000) / 10000);
      if (expireDay <= asOf) expired = left; else expireLater = left;
    }
    const adjAll = Math.round((adj - expired) * 10000) / 10000;
    const total = a.days + monthly + adjAll;
    return {
      name: x.name, dept: x.dept, rank: x.rank, joinDate: x.joinDate, years: a.years, annual: a.days,
      annualNote: a.note, monthly, monthlyLater, monthlyItems: mg, adjust: adjAll, expired, expireDay, expireLater, total, used, planned,
      remain: Math.round((total - used - planned) * 10000) / 10000, counts, typeDays,
      outingHours: items.filter((it) => it.type === "외출").reduce((t, it) => t + it.hours, 0),
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

/** 부분 휴가 표시 순서 (같은 날 여러 개면 앞의 것으로 근무형태를 적는다) */
const PART_ORDER = ["반차", "반반차", "외출", "공가", "병가", "경조휴가", "연차", "월차"];
const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 근태 기입·시트용 휴가 표시 (2026-11-11 사용자 결정)
 * - 근태 구분에는 종류만 (예: 연차).
 * - 시간이 있는 휴가는 근무형태에 몇 시인지: 늦게 오면 출근 형태 '반차(13:30)' (들어오는 시각),
 *   일찍 가거나 중간에 나가면 퇴근 형태 '반차(13:30)' (나가는 시각). 시간이 안 적힌 반차·반반차는 오전/오후 글로 하이웍스 시간대를 쓴다.
 * - 사유(시간을 뺀 내용)는 업무내용(시트는 비고)에.
 * workStart·workEnd = 그 직원의 출근·퇴근 기준(분). */
export function leaveMark(leaves: { type: string; content: string }[], workStart: number, workEnd: number):
  { inType: string; outType: string; reason: string } {
  const reasons: string[] = [];
  let best: { type: string; a: number; b: number } | null = null;
  for (const l of leaves) {
    if (!VACATION_TYPES.includes(l.type) && l.type !== "포상") continue;
    const content = String(l.content ?? "");
    const lines = content.split("\n").map((x) => x.replace(new RegExp(TIME_SPAN.source, "g"), "").trim())
      .filter((x) => x && x !== l.type);
    for (const x of lines) if (!reasons.includes(x)) reasons.push(x);
    let spans = [...content.matchAll(new RegExp(TIME_SPAN.source, "g"))].map((m) => [hm(+m[1], +m[2]), hm(+m[3], +m[4])] as [number, number]);
    if (!spans.length && HALF_WINDOWS[l.type]) { // 시간 없이 '오전/오후 반차'만 적힌 경우
      const w = /오전/.test(content) ? HALF_WINDOWS[l.type][0] : /오후/.test(content) ? HALF_WINDOWS[l.type][1] : null;
      if (w) spans = [w];
    }
    if (!spans.length) continue;
    const a = Math.min(...spans.map((s) => s[0])), b = Math.max(...spans.map((s) => s[1]));
    const rank = (t: string) => (PART_ORDER.indexOf(t) + 1 || 99);
    if (!best || rank(l.type) < rank(best.type)) best = { type: l.type, a, b };
  }
  let inType = "", outType = "";
  if (best && !(best.a <= workStart && best.b >= workEnd)) { // 하루 종일이면 근무형태에 적지 않음
    if (best.a <= workStart) inType = `${best.type}(${toHM(best.b)})`;
    else outType = `${best.type}(${toHM(best.a)})`;
  }
  return { inType, outType, reason: reasons.join(" / ") };
}
