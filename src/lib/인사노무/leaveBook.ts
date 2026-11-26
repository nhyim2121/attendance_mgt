/** 연차 숫자를 한 곳에서 계산한다: 연차 현황(현황표)·요약 보고서·직원별 내역서·연차 사용 촉진·휴가 홈·홈(근태)이 모두 이것을 쓴다.
 *
 * - 휴가 기록(현황표 '내역'에서 추가·수정·삭제한 것 포함)은 loadBase의 leaves로 들어온다.
 * - 하이웍스 휴가현황(파일 또는 현황표 '숫자 수정'·'생성')이 있으면 그 숫자를 쓴다.
 *   기준일이 하이웍스 숫자 날짜보다 앞이면(예: 10월 말 보고서) 하이웍스 숫자에서 기준일 뒤 사용분을 되돌려 뺀다:
 *   월별 시트가 있으면 기준일 다음 달부터의 월별 사용 + 기준일이 든 달의 남은 날(사이트 기록), 없으면 기준일 뒤 사이트 기록.
 *   부여는 기준일 뒤에 생기는 월차(사이트 계산)만큼 줄인다.
 */
import type { Employee } from "./employees";
import type { Leave } from "./hiworks";
import { applyHwStatus, HW_DEDUCT, type HwBalance, hwRemain, type HwStatus } from "./leaveStatus";
import type { DateStr } from "../time";
import { type Adjust, type LeaveBalance, type LeavePolicy, leaveBalances } from "./vacation";

const r4 = (x: number) => Math.round(x * 10000) / 10000;

export interface Book {
  bal: HwBalance[];
  useHw: boolean; // 하이웍스 숫자를 쓰는지
  past: boolean; // 하이웍스 숫자 날짜보다 앞 기준일이라 되돌려 계산했는지
  hwAt: string; // 하이웍스 숫자 날짜 ('YYYY-MM-DD HH:MM', 없으면 빈 값)
}

/** 같은 회계연도의 여러 기준일을 계산할 때(월별 추이) 하이웍스 날짜 기준 사이트 계산을 한 번만 하도록 묶는다 */
export function leaveBook(emps: Employee[], leaves: Leave[], adjusts: Adjust[], fy: number, p: LeavePolicy, hwRows: HwStatus[]) {
  const hwAt = hwRows.reduce((m, s) => (s.exportedAt > m ? s.exportedAt : m), "");
  const hwDay = hwAt.slice(0, 10);
  let atExport: Map<string, LeaveBalance> | null = null;
  const exportBal = () => (atExport ??= new Map(leaveBalances(emps, leaves, adjusts, fy, hwDay, p).map((b) => [b.name, b])));

  return (asOf: DateStr, keep: (b: LeaveBalance) => boolean = () => true): Book => {
    const site = leaveBalances(emps, leaves, adjusts, fy, asOf, p).filter(keep);
    if (!hwRows.length) return { bal: site.map((b) => ({ ...b, ahead: aheadOf(b) })), useHw: false, past: false, hwAt };
    const applied = applyHwStatus(site, hwRows, p);
    if (asOf >= hwDay) {
      // (2026-11-26) 하이웍스 파일 날짜 뒤에 쓴·잡힌 휴가(사이트 기록)를 더해 뺀다. 파일이 오래돼도 잔여가 맞도록.
      const siteBy = new Map(site.map((b) => [b.name, b]));
      return { bal: applied.map((b) => (b.hw ? forward(b, b.hw, siteBy.get(b.name)!, hwDay, asOf, p) : { ...b, ahead: aheadOf(b) })), useHw: true, past: false, hwAt };
    }
    const siteBy = new Map(site.map((b) => [b.name, b]));
    const bal = applied.map((b) => (b.hw ? rewind(b, b.hw, siteBy.get(b.name)!, exportBal().get(b.name), asOf, p) : b));
    return { bal, useHw: true, past: true, hwAt };
  };
}

/** 하이웍스 숫자(내려받은 날 기준)에 그 뒤 사이트 휴가 기록을 더한다.
 *  하이웍스 파일에는 앞날 결재분도 들어 있으므로, 파일 달부터는 달·유형마다 (사이트 − 하이웍스 월별) 남는 만큼만 더한다.
 *  월별 시트가 없으면 파일 날짜 뒤 사이트 기록을 모두 더한다. 기준일 뒤 것은 '예정'으로 둔다. */
/** 사이트 계산의 기준일 뒤 휴가 [날짜, 일수] */
const aheadOf = (b: LeaveBalance): [string, number][] => b.items.filter((it) => it.planned && it.days).map((it) => [it.day, it.days]);

function forward(b: HwBalance, s: HwStatus, site: LeaveBalance, hwDay: DateStr, asOf: DateStr, p: LeavePolicy): HwBalance {
  const hwMonth = hwDay.slice(0, 7);
  const hasMonths = Object.keys(s.months).length > 0;
  const daysOf = (it: LeaveBalance["items"][number]) => (it.type === "외출" ? it.hours / p.outingHoursPerDay : it.days);
  const items = site.items.filter((it) => HW_DEDUCT.includes(it.type) && (hasMonths ? it.day.slice(0, 7) >= hwMonth : it.day > hwDay));
  const extra: Record<string, number> = {}; // 유형별 더할 일수
  let used = 0, planned = 0;
  const ahead: [string, number][] = []; // 기준일 뒤에 빠지는 휴가 (하이웍스에 이미 든 앞날 결재 + 새로 더한 것)
  const asOfMonth = asOf.slice(0, 7);
  // 달·유형별 사이트 합 − 하이웍스 월별 = 하이웍스에 없는 만큼. 날짜순으로 채워서 지난 것/예정 나눔
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const k = `${hasMonths ? it.day.slice(0, 7) : "all"}|${it.type}`;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  for (const [k, xs] of groups) {
    const [m, t] = k.split("|");
    let skip = hasMonths ? (s.months[m]?.[t] ?? 0) : 0; // 하이웍스에 이미 든 만큼은 앞쪽 날짜부터 건너뜀
    for (const it of [...xs].sort((a, c) => a.day.localeCompare(c.day))) {
      let d = daysOf(it);
      if (it.day > asOf && d > 0) ahead.push([it.day, d]);
      const sk = Math.min(skip, d);
      skip -= sk; d -= sk;
      if (d <= 0) continue;
      extra[t] = (extra[t] ?? 0) + d;
      if (it.day > asOf) planned += d; else used += d;
    }
  }
  // 하이웍스 월별에만 있는 앞날 달 사용분 (사이트 기록 없음) → 그 달 1일로
  if (hasMonths) for (const [m, u] of Object.entries(s.months)) {
    if (m <= asOfMonth) continue;
    for (const t of HW_DEDUCT) {
      const siteDays = items.filter((it) => it.type === t && it.day.startsWith(m)).reduce((x, it) => x + daysOf(it), 0);
      const rest = (u[t] ?? 0) - siteDays;
      if (rest > 0) ahead.push([`${m}-01`, rest]);
    }
  }
  if (!used && !planned) return { ...b, ahead };
  const typeDays = { ...b.typeDays }, counts = { ...b.counts };
  for (const [t, d] of Object.entries(extra)) { typeDays[t] = r4((typeDays[t] ?? 0) + d); counts[t] = Math.max(counts[t] ?? 0, site.counts[t] ?? 1); }
  return {
    ...b, typeDays, counts, used: r4(b.used + used), planned: r4(b.planned + planned), ahead,
    remain: r4(b.remain - used - planned), outingHours: r4((typeDays.외출 ?? 0) * p.outingHoursPerDay),
  };
}

/** 하이웍스 숫자(내려받은 날 기준)를 그보다 앞 기준일로 되돌린다 */
function rewind(b: HwBalance, s: HwStatus, site: LeaveBalance, atExport: LeaveBalance | undefined, asOf: DateStr, p: LeavePolicy): HwBalance {
  const month = asOf.slice(0, 7);
  const later: Record<string, number> = {};
  const add = (t: string, d: number) => { if (d) later[t] = (later[t] ?? 0) + d; };
  const hasMonths = Object.keys(s.months).length > 0;
  if (hasMonths) for (const [m, u] of Object.entries(s.months)) if (m > month) for (const [t, d] of Object.entries(u)) add(t, d);
  for (const it of site.items) {
    if (it.day <= asOf || (hasMonths && !it.day.startsWith(month))) continue;
    add(it.type, it.type === "외출" ? it.hours / p.outingHoursPerDay : it.days || (["공가", "경조휴가", "병가"].includes(it.type) ? 1 : 0));
  }
  const typeDays: Record<string, number> = {}, counts: Record<string, number> = {};
  for (const [t, d] of Object.entries(s.used)) {
    const v = r4(Math.max(0, d - (later[t] ?? 0)));
    if (!v) continue;
    typeDays[t] = v;
    counts[t] = site.counts[t] || 1;
  }
  const used = r4(HW_DEDUCT.reduce((t, k) => t + (typeDays[k] ?? 0), 0));
  const usedAll = r4(HW_DEDUCT.reduce((t, k) => t + (s.used[k] ?? 0), 0));
  // 기준일 뒤 ~ 하이웍스 날짜 사이에 생기는 월차
  const grantLater = r4(Math.max(0, (atExport?.monthly ?? site.monthly) - site.monthly));
  return {
    ...b, typeDays, counts, used, planned: 0,
    annual: r4(s.grant.정기 - grantLater), annualNote: `하이웍스 정기 생성 ${s.grant.정기}일${grantLater ? ` − 기준일 뒤 생기는 월차 ${grantLater}일` : ""}`,
    total: r4(s.granted - grantLater), remain: r4(hwRemain(s) + (usedAll - used) - grantLater),
    outingHours: r4((typeDays.외출 ?? 0) * p.outingHoursPerDay),
  };
}
