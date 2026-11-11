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
  season?: number;                                 // 정기 지급을 시작하는 달 (하계 5월, 동계 10월 …)
  kcs?: boolean;                                   // 안전인증(KCs) 대상
  note?: string;
}

/** 품목과 회사 지급 기준 (초안 2026-11-11). 소모품은 개인별 주기 대신 재고·지급 수량만 본다. */
export const PPE_ITEMS: PpeItem[] = [
  { name: "안전화", kind: "보호구", size: "shoe", cycle: { 현장직: 12, 연구소: 24, 일용직: 0 }, kcs: true, note: "물체 낙하·충격, 끼임 위험 작업 (규칙 제32조 제1항 제3호)" },
  { name: "작업복(하계)", kind: "피복", size: "top", cycle: { 현장직: 12, 연구소: 24 }, season: 5 },
  { name: "작업복(동계)", kind: "피복", size: "top", cycle: { 현장직: 12, 연구소: 24 }, season: 10 },
  { name: "방한복", kind: "피복", size: "top", cycle: { 현장직: 24 }, season: 11 },
  { name: "안전모", kind: "보호구", cycle: { 현장직: 36, 연구소: 0, 일용직: 0 }, kcs: true, note: "물체 낙하·비래, 추락 위험 작업. 충격을 받았거나 금이 가면 바로 교체" },
];
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
    if (cell.status === "none" || cell.status === "late" || cell.status === "soon") out.push({ p, item, cell });
  }
  const rank: Record<Status, number> = { late: 0, none: 1, soon: 2, ok: 3, na: 4 };
  return out.sort((a, b) => rank[a.cell.status] - rank[b.cell.status] || (a.cell.left ?? 0) - (b.cell.left ?? 0) || a.p.name.localeCompare(b.p.name));
}

/** 이번 달·다음 달이 정기 지급 시작 달인 피복 (예: 5월 하계 작업복) */
export function seasonal(today: string) {
  const m = +today.slice(5, 7);
  const next = m === 12 ? 1 : m + 1;
  return PPE_ITEMS.filter((i) => i.season === m || i.season === next).map((i) => ({ item: i, now: i.season === m }));
}

// ------------------------------------------------------------------ 재고
export interface StockLine { item: string; size: string; inQty: number; outQty: number; left: number }
/** 품목·사이즈별 재고 = 입고 합 − 지급 합 (반납은 다시 쓰지 않는 것으로 보고 더하지 않는다) */
export function stockOf(stock: RowLike[], issues: RowLike[]): StockLine[] {
  const m = new Map<string, StockLine>();
  const at = (item: string, size: string) => {
    const k = `${item}|${size}`;
    if (!m.has(k)) m.set(k, { item, size, inQty: 0, outQty: 0, left: 0 });
    return m.get(k)!;
  };
  for (const r of stock) if (r.data.item) at(r.data.item, r.data.size ?? "").inQty += +r.data.qty || 0;
  for (const r of issues) if (r.data.item && isGive(r.data.kind)) at(r.data.item, r.data.size ?? "").outQty += +r.data.qty || 1;
  const order = (s: string) => { const i = PPE_ITEMS.findIndex((x) => x.name === s); return i < 0 ? 99 : i; };
  return [...m.values()].map((x) => ({ ...x, left: x.inQty - x.outQty }))
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
  { step: "지급", task: "정기 지급 (하계 5월·동계 10월·방한복 11월), 신규 입사·일용직 투입 시 즉시 지급", cycle: "반기 · 수시" },
  { step: "수령", task: "수령 서명 받기 (지급대장 = 법적 증빙)", cycle: "지급 때" },
  { step: "교체", task: "파손·분실·오염 시 교체 신청 받아 재지급, 사유 기록", cycle: "수시", note: "규칙 제33조: 상시 점검, 이상 있으면 수리·교환" },
  { step: "점검", task: "착용 상태·보관 상태 점검 (안전모 균열·턱끈, 안전화 밑창 마모·앞코 변형)", cycle: "분기" },
  { step: "반납", task: "퇴사·일용직 종료 시 반납 확인, 재사용 불가품 폐기", cycle: "변경 때" },
  { step: "재고", task: "품목·사이즈별 재고 확인, 부족분 구매 요청", cycle: "분기" },
];
