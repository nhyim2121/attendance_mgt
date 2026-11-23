/** 보호구·피복 관리 (총무 2-1. 피복 및 보호구). 화면·서버·시험이 같이 쓰는 기준과 계산 (함수만, DB 없음).
 *
 *  저장은 업무 대장 ledger_rows 세 권:
 *  - ppe        지급 기록 (한 줄 = 한 사람에게 한 품목 지급 / 반납)
 *  - ppepeople  개인별 사이즈 + 일용직 명단 (직원은 사이즈만, 일용직은 이름·업체·투입 기간까지)
 *  - ppestock   입고 기록 (재고 = 입고 합 − 지급 합)
 *
 *  법 근거: 산업안전보건기준에 관한 규칙 제32조(작업조건에 맞는 보호구를 근로자 수 이상 지급·착용),
 *  제33조(상시 점검, 이상 있으면 수리·교환), 산업안전보건법 제84조(안전인증 대상 보호구는 KCs 인증품).
 *  지급 주기는 법에 정해진 것이 없어 아래 PPE_ITEMS의 회사 기준(초안)을 쓴다 — 바꾸려면 여기만 고치면 된다.
 */

export type PpeGroup = "현장직" | "연구소" | "일용직";
export const PPE_GROUPS: PpeGroup[] = ["현장직", "연구소", "일용직"];
export const GROUP_COLOR: Record<PpeGroup, string> = { 현장직: "#c2410c", 연구소: "#0c3994", 일용직: "#6d28d9" };

/** 현장직 = 생산팀·품질팀·영업팀 (영업팀 이병욱 부장 제외) + 일용직, 연구소 = 연구소(사무직) */
export const FIELD_DEPTS = ["생산팀", "품질팀", "영업팀"];
export const FIELD_EXCLUDE = ["이병욱"];
export const LAB_DEPTS = ["연구소"];

export function groupOfEmp(e: { name: string; dept: string }): PpeGroup | null {
  if (FIELD_EXCLUDE.includes(e.name)) return null;
  if (FIELD_DEPTS.includes(e.dept)) return "현장직";
  if (LAB_DEPTS.includes(e.dept)) return "연구소";
  return null;
}

export type SizeKey = "top" | "bottom" | "shoe";
export const SIZE_LABEL: Record<SizeKey, string> = { top: "상의", bottom: "하의", shoe: "안전화(mm)" };

export interface PpeItem {
  name: string;
  kind: "피복" | "보호구" | "소모품";
  size?: SizeKey;                                  // 지급할 때 쓰는 사이즈
  /** 구분별 지급 기준: 숫자 = n개월마다 교체, 0 = 처음 1회(파손·분실 때 교체), 없음 = 꼭 줄 대상 아님 */
  cycle: Partial<Record<PpeGroup, number>>;
  season?: number[];                               // 정기 지급하는 달 (하복 4월, 춘추복 3·9월, 동복 10월)
  set?: SeasonSet;                                 // 어느 계절 근무복인지 (정기 지급일·착용 기간 연결)
  qty?: Partial<Record<PpeGroup, number>>;         // 한 번에 주는 벌·켤레 수 (규정 제7조, 없으면 1)
  kcs?: boolean;                                   // 안전인증(KCs) 대상
  note?: string;
}
export type SeasonSet = "하복" | "춘추복" | "동복";

/** 품목과 회사 지급 기준 — 「피복 관리 규정」(SN-MI-1042, 23.09.27) 제5·7조.
 *  연구소 = 규정의 '사무직' (현장 업무를 자주 하는 사무직은 현장직 기준 — 제5조 단서). 안전모는 규정에 없어 회사 기준. */
export const PPE_ITEMS: PpeItem[] = [
  { name: "안전화", kind: "보호구", size: "shoe", cycle: { 현장직: 12, 연구소: 24, 일용직: 0 }, kcs: true, note: "제7조 동계: 현장직 1켤레/1년 · 사무직 1켤레/2년. 들어온 시점 기준으로 교체" },
  { name: "하복 상의", kind: "피복", size: "top", set: "하복", cycle: { 현장직: 12 }, qty: { 현장직: 3 }, season: [4], note: "현장직 3벌/1년 · 지급 4/25 · 착용 5/10~9/30" },
  { name: "하복 하의", kind: "피복", size: "bottom", set: "하복", cycle: { 현장직: 12 }, qty: { 현장직: 3 }, season: [4], note: "현장직 3벌/1년 · 지급 4/25 · 착용 5/10~9/30" },
  { name: "춘추복 상의", kind: "피복", size: "top", set: "춘추복", cycle: { 현장직: 24 }, qty: { 현장직: 2 }, season: [3, 9], note: "현장직 2벌/2년 · 지급 3/25·9/10 · 착용 3/1~5/31, 9/15~10/31" },
  { name: "춘추복 하의", kind: "피복", size: "bottom", set: "춘추복", cycle: { 현장직: 24 }, qty: { 현장직: 2 }, season: [3, 9], note: "현장직 2벌/2년 · 지급 3/25·9/10" },
  { name: "춘추 점퍼", kind: "피복", size: "top", set: "춘추복", cycle: { 현장직: 24, 연구소: 24 }, season: [3, 9], note: "전 직원 1벌/2년 · 지급 3/25·9/10" },
  { name: "동복 상의", kind: "피복", size: "top", set: "동복", cycle: { 현장직: 24 }, season: [10], note: "현장직 1벌/2년 · 지급 10/15 · 착용 11/1~2월 말" },
  { name: "동복 하의", kind: "피복", size: "bottom", set: "동복", cycle: { 현장직: 24 }, season: [10], note: "현장직 1벌/2년 · 지급 10/15" },
  { name: "동계 점퍼", kind: "피복", size: "top", set: "동복", cycle: { 현장직: 24, 연구소: 24 }, season: [10], note: "전 직원 1벌/2년 · 지급 10/15" },
  { name: "안전모", kind: "보호구", cycle: { 현장직: 36, 연구소: 0, 일용직: 0 }, kcs: true, note: "규정에 없는 회사 기준. 물체 낙하·비래, 추락 위험 작업. 충격을 받았거나 금이 가면 바로 교체" },
];
export const unitOf = (name: string) => (itemOf(name)?.size === "shoe" ? "켤레" : itemOf(name)?.kind === "피복" ? "벌" : "개");
export const qtyFor = (item: PpeItem, g: PpeGroup) => item.qty?.[g] ?? 1;
/** 지급 기준 글자: "3벌/1년", "1켤레/2년", "처음 1회·파손 때", "대상 아님" */
export function ruleText(item: PpeItem, g: PpeGroup): string {
  const n = item.cycle[g];
  if (n === undefined) return "대상 아님";
  if (n === 0) return "처음 1회·파손 때";
  return `${qtyFor(item, g)}${unitOf(item.name)}/${n % 12 === 0 ? `${n / 12}년` : `${n}개월`}`;
}

/** 착용 기간 (규정 제5조①) — 근무 지역·기후에 따라 조정 가능(②) */
export const WEAR_PERIODS: { set: SeasonSet; from: string; to: string; label: string }[] = [
  { set: "춘추복", from: "03-01", to: "05-31", label: "3/1~5/31" },
  { set: "하복", from: "05-10", to: "09-30", label: "5/10~9/30" },
  { set: "춘추복", from: "09-15", to: "10-31", label: "9/15~10/31" },
  { set: "동복", from: "11-01", to: "02-29", label: "11/1~2월 말" },
];
/** 오늘 입는 근무복 (겹치는 기간이면 둘 다) */
export function wearingNow(today: string) {
  const md = today.slice(5);
  return WEAR_PERIODS.filter((w) => (w.from <= w.to ? md >= w.from && md <= w.to : md >= w.from || md <= w.to));
}
// 관리하는 보호구는 안전화·안전모 두 가지 (2026-11-11). 보안경·안전대·마스크 등을 더 관리하게 되면 위에 한 줄씩 더한다.
export const itemOf = (name: string) => PPE_ITEMS.find((i) => i.name === name);
/** 이 구분이 꼭 받아야 하는 품목 (개인별 현황표의 칸) */
export const requiredItems = (g: PpeGroup) => PPE_ITEMS.filter((i) => i.cycle[g] !== undefined);
/** 현황표에 칸으로 보일 품목 (어느 구분이든 꼭 받아야 하는 것) */
export const MATRIX_ITEMS = PPE_ITEMS.filter((i) => Object.keys(i.cycle).length > 0);

export const GIVE_KINDS = ["정기 지급", "신규 지급", "교체(파손·분실)", "추가 지급", "반납"] as const;
export const isGive = (kind: string | undefined) => kind !== "반납";

/** 날짜 + n개월 (말일 넘치면 그 달 말일) */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
const DAY = 86400000;
export const daysTo = (today: string, d: string) => Math.round((Date.parse(d) - Date.parse(today)) / DAY);

// ------------------------------------------------------------------ 사람
export interface PpePerson {
  name: string; group: PpeGroup; dept: string; rank: string;
  sizes: Partial<Record<SizeKey, string>>;
  daily: boolean;              // 일용직 (명단 대장에서 온 사람)
  start?: string; end?: string; // 일용직 투입·종료일
  profileId?: number;          // ppepeople 줄 번호 (사이즈를 적은 적이 있으면)
  note?: string;
  retired?: string;            // 퇴사일 (직원) · 종료일이 지난 일용직은 그 종료일
}
/** 지금 관리 중인 사람 (퇴사·종료 제외) — 미지급·교체 알림은 이 사람들만 */
export const activeOnly = (ps: PpePerson[]) => ps.filter((p) => !p.retired);

/** 부서별 묶음: 생산팀 · 품질팀 · 영업팀 · 연구소 · 일용직 순, 묶음 안에서는 재직자 먼저(명부 순서), 퇴사자는 뒤 */
export const DEPT_ORDER = [...FIELD_DEPTS, ...LAB_DEPTS, "일용직"];
export function byDept(ps: PpePerson[]): { dept: string; group: PpeGroup; people: PpePerson[] }[] {
  const key = (p: PpePerson) => (p.daily ? "일용직" : p.dept);
  const depts = [...new Set(ps.map(key))].sort((a, b) => {
    const ia = DEPT_ORDER.indexOf(a), ib = DEPT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return depts.map((dept) => {
    const people = ps.filter((p) => key(p) === dept);
    return { dept, group: people[0].group, people: [...people.filter((p) => !p.retired), ...people.filter((p) => p.retired)] };
  });
}
type Data = Record<string, string>;
interface RowLike { id: number; day: string | null; data: Data }

/** 직원 명부 + 사이즈·일용직 명단 → 관리 대상 (퇴사자·종료된 일용직 제외, ended=true면 포함) */
export function buildPeople(
  emps: { name: string; dept: string; rank: string; leaveDate?: string | null }[],
  profiles: RowLike[], today: string, ended = false,
): PpePerson[] {
  const prof = new Map(profiles.filter((r) => r.data.name).map((r) => [r.data.name.trim(), r]));
  const sizes = (d: Data | undefined) => ({ top: d?.top || undefined, bottom: d?.bottom || undefined, shoe: d?.shoe || undefined });
  const out: PpePerson[] = [];
  for (const e of emps) {
    if (!ended && e.leaveDate && e.leaveDate < today) continue;
    const g = groupOfEmp(e);
    if (!g) continue;
    const p = prof.get(e.name);
    const retired = e.leaveDate && e.leaveDate < today ? e.leaveDate : undefined;
    out.push({ name: e.name, group: g, dept: e.dept, rank: e.rank, sizes: sizes(p?.data), daily: false, profileId: p?.id, note: p?.data.note, retired });
  }
  const have = new Set(out.map((p) => p.name));
  for (const r of profiles) {
    const d = r.data;
    if (d.group !== "일용직" || !d.name || have.has(d.name.trim())) continue;
    if (!ended && d.end && d.end < today) continue;
    out.push({ name: d.name.trim(), group: "일용직", dept: d.dept || "일용직", rank: "", sizes: sizes(d), daily: true,
      start: d.start, end: d.end, profileId: r.id, note: d.note, retired: d.end && d.end < today ? d.end : undefined });
  }
  return out;
}

// ------------------------------------------------------------------ 품목별 상태
export type Status = "ok" | "soon" | "late" | "none" | "na";
export const STATUS_LABEL: Record<Status, string> = { ok: "정상", soon: "곧 교체", late: "교체 시기 지남", none: "미지급", na: "" };
export interface Cell { status: Status; last?: string; next?: string; left?: number; size?: string; signed?: boolean }

/** 한 사람·한 품목의 상태: 마지막 지급일 + 주기 → 다음 교체일. 30일 안이면 '곧 교체'. */
export function cellOf(p: PpePerson, item: PpeItem, issues: RowLike[], today: string, soonDays = 30): Cell {
  const cyc = item.cycle[p.group];
  const mine = issues.filter((r) => r.data.emp === p.name && r.data.item === item.name && isGive(r.data.kind) && r.data.day)
    .sort((a, b) => (b.data.day ?? "").localeCompare(a.data.day ?? ""));
  const last = mine[0];
  if (cyc === undefined) return last ? { status: "ok", last: last.data.day, size: last.data.size, signed: last.data.sign === "받음" } : { status: "na" };
  if (!last) return { status: "none" };
  const base = { last: last.data.day, size: last.data.size, signed: last.data.sign === "받음" };
  if (!cyc) return { status: "ok", ...base };
  const next = addMonths(last.data.day!, cyc);
  const left = daysTo(today, next);
  return { status: left < 0 ? "late" : left <= soonDays ? "soon" : "ok", next, left, ...base };
}

/** 사람마다 현황표 칸 */
export function matrix(people: PpePerson[], issues: RowLike[], today: string) {
  return people.map((p) => ({ p, cells: new Map(MATRIX_ITEMS.map((i) => [i.name, cellOf(p, i, issues, today)])) }));
}

/** 할 일 모으기: 미지급·교체 시기 지남·곧 교체 */
export function dueList(people: PpePerson[], issues: RowLike[], today: string) {
  const out: { p: PpePerson; item: PpeItem; cell: Cell }[] = [];
  for (const p of people) for (const item of requiredItems(p.group)) {
    const cell = cellOf(p, item, issues, today);
    // 신입직원은 다음 유니폼 제작 때까지 기존(퇴사자) 유니폼을 입으므로 (규정 제7조) 피복 '미지급'은 할 일로 띄우지 않는다
    if (cell.status === "none" && item.kind === "피복") continue;
    if (cell.status === "none" || cell.status === "late" || cell.status === "soon") out.push({ p, item, cell });
  }
  const rank: Record<Status, number> = { late: 0, none: 1, soon: 2, ok: 3, na: 4 };
  return out.sort((a, b) => rank[a.cell.status] - rank[b.cell.status] || (a.cell.left ?? 0) - (b.cell.left ?? 0) || a.p.name.localeCompare(b.p.name));
}

/** 이번 달·다음 달이 정기 지급 달인 피복 (예: 4월 하복) */
export function seasonal(today: string) {
  const m = +today.slice(5, 7);
  const next = m === 12 ? 1 : m + 1;
  return PPE_ITEMS.filter((i) => i.season?.includes(m) || i.season?.includes(next)).map((i) => ({ item: i, now: !!i.season?.includes(m) }));
}

/** 정기 지급일 (피복 관리 규정 제5조): 춘추복 3/25 · 하복 4/25 · 춘추복 9/10 · 동복 10/15 */
export const SEASON_DAYS: { item: string; md: string }[] = [
  { item: "춘추복", md: "03-25" }, { item: "하복", md: "04-25" }, { item: "춘추복", md: "09-10" }, { item: "동복", md: "10-15" },
];
/** 오늘 이후 가장 가까운 정기 지급 */
export function nextSeason(today: string): { item: string; day: string; left: number } {
  const y = +today.slice(0, 4);
  const all = [y, y + 1].flatMap((yy) => SEASON_DAYS.map((s) => ({ item: s.item, day: `${yy}-${s.md}` })));
  const n = all.find((s) => s.day >= today)!;
  return { ...n, left: daysTo(today, n.day) };
}

// ------------------------------------------------------------------ 퇴직 반납 (규정 제8조)
/** 퇴직 전 1년 안에 받은 피복은 전량 반납. 못 하면 급료·퇴직금에서 공제:
 *  지급 후 1개월 미만 전액 · 1~6개월 미만 2/3 · 6개월~1년 미만 1/2 */
export function deductRate(give: string, leave: string): string {
  if (leave < addMonths(give, 1)) return "전액";
  if (leave < addMonths(give, 6)) return "2/3";
  return "1/2";
}
export interface ReturnDue { p: PpePerson; item: string; size?: string; qty: number; day: string; rate: string; returned: boolean; price?: string }
/** 최근 1년 안에 퇴사한 직원의 반납 대상 피복 (반납 기록이 있으면 returned) */
export function returnDue(people: PpePerson[], issues: RowLike[], today: string): ReturnDue[] {
  const out: ReturnDue[] = [];
  for (const p of people) {
    if (p.daily || !p.retired || p.retired < addMonths(today, -12)) continue;
    const leave = p.retired;
    const mine = issues.filter((r) => r.data.emp === p.name && r.data.day);
    for (const r of mine) {
      const d = r.data.day!;
      if (!isGive(r.data.kind) || itemOf(r.data.item ?? "")?.kind !== "피복" || d > leave || d <= addMonths(leave, -12)) continue;
      const returned = mine.some((x) => x.data.kind === "반납" && x.data.item === r.data.item && x.data.day! >= d);
      out.push({ p, item: r.data.item!, size: r.data.size, qty: +r.data.qty || 1, day: d, rate: deductRate(d, leave), returned, price: r.data.price });
    }
  }
  return out.sort((a, b) => Number(a.returned) - Number(b.returned) || (b.p.retired ?? "").localeCompare(a.p.retired ?? ""));
}

// ------------------------------------------------------------------ 재고
export interface StockLine { item: string; size: string; inQty: number; outQty: number; disQty: number; left: number }
export const isDispose = (kind: string | undefined) => kind === "폐기";
/** 품목·사이즈별 재고 = 입고 합 − 지급 합 (반납은 다시 쓰지 않는 것으로 보고 더하지 않는다).
 *  지급은 그 품목의 첫 입고일부터만 센다 — 입고 기록이 없는 예전 지급 이력(2018~)까지 빼면 재고가 마이너스가 되므로. */
export function stockOf(stock: RowLike[], issues: RowLike[]): StockLine[] {
  const first = new Map<string, string>();
  for (const r of stock) if (r.data.item && r.day && !isDispose(r.data.kind) && (!first.has(r.data.item) || r.day < first.get(r.data.item)!)) first.set(r.data.item, r.day);
  issues = issues.filter((r) => { const f = first.get(r.data.item ?? ""); return !!f && !!r.data.day && r.data.day >= f; });
  const m = new Map<string, StockLine>();
  const at = (item: string, size: string) => {
    const k = `${item}|${size}`;
    if (!m.has(k)) m.set(k, { item, size, inQty: 0, outQty: 0, disQty: 0, left: 0 });
    return m.get(k)!;
  };
  for (const r of stock) if (r.data.item) { const l = at(r.data.item, r.data.size ?? ""); if (isDispose(r.data.kind)) l.disQty += +r.data.qty || 0; else l.inQty += +r.data.qty || 0; }
  for (const r of issues) if (r.data.item && isGive(r.data.kind)) at(r.data.item, r.data.size ?? "").outQty += +r.data.qty || 1;
  const order = (s: string) => { const i = PPE_ITEMS.findIndex((x) => x.name === s); return i < 0 ? 99 : i; };
  return [...m.values()].map((x) => ({ ...x, left: x.inQty - x.outQty - x.disQty }))
    .sort((a, b) => order(a.item) - order(b.item) || a.item.localeCompare(b.item) || a.size.localeCompare(b.size, "ko", { numeric: true }));
}

/** 사람에게 맞는 사이즈 (품목의 사이즈 종류로) */
export const sizeFor = (p: PpePerson, item: PpeItem | undefined) => (item?.size ? p.sizes[item.size] ?? "" : "");

/** 업무분장 2-1. 피복 및 보호구: 하는 일 (총무 업무분장·산업안전보건기준에 관한 규칙 제32~34조 참고) */
export const PPE_DUTIES: { step: string; task: string; cycle: string; note?: string }[] = [
  { step: "기준", task: "작업별 지급 대상·품목·지급 주기 정하기 (위험성평가 결과 반영)", cycle: "매년", note: "규칙 제32조: 작업조건에 맞는 보호구를 근로자 수 이상" },
  { step: "조사", task: "개인별 사이즈 조사 (상의·하의·안전화), 입사자·일용직 투입 시 바로 받기", cycle: "매년 · 입사 때" },
  { step: "구매", task: "필요 수량 = 지급 예정 + 예비분, KCs 안전인증품 확인 후 구매", cycle: "반기", note: "산안법 제84조 안전인증 대상: 안전화·안전모" },
  { step: "입고", task: "입고 수량·사이즈·인증번호 확인, 재고 대장 기록", cycle: "구매 때" },
  { step: "지급", task: "정기 지급 (춘추복 3/25·하복 4/25·춘추복 9/10·동복 10/15, 피복 관리 규정 제5조). 신입직원은 다음 유니폼 제작 때까지 기존 유니폼(팀장 판단 시 신규), 안전화·안전모는 입사·일용직 투입 때 바로", cycle: "반기 · 수시", note: "규정 제7조 신입직원" },
  { step: "수령", task: "사원피복지급현황 기록부(별지 제3호)에 수령 서명 받기", cycle: "지급 때", note: "규정 제5조④ · 지급대장은 법적 증빙" },
  { step: "교체", task: "노후·훼손 시 피복지급신청서(사진 첨부) 받고, 헌 피복 반납받은 뒤 재지급. 본인 과실(고의훼손·분실)은 지급 안 함", cycle: "수시", note: "규정 제4조④·제7조 기타사항 · 규칙 제33조" },
  { step: "점검", task: "착용 상태·보관 상태 점검 (안전모 균열·턱끈, 안전화 밑창 마모·앞코 변형)", cycle: "분기" },
  { step: "반납", task: "퇴직 시 1년 안에 받은 피복 전량 반납(세탁해서). 못 하면 공제: 1개월 미만 전액 · 6개월 미만 2/3 · 1년 미만 1/2", cycle: "퇴사 때", note: "규정 제8조 · 재활용 못 할 상태면 미반납으로 봄" },
  { step: "재고", task: "품목·사이즈별 재고 확인, 부족분 구매 요청", cycle: "분기" },
];
