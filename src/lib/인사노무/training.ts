/** 교육훈련 관리 (3-7): 법정의무교육 이수 계산, 직원별 이수 현황, 무재해 사업장 정기교육 시간 감면.
 *
 * 자료: 교육 실시 대장(training)의 참석자(who: 이름을 쉼표·줄바꿈으로, '전 직원'이면 그날 재직자 모두)와 시간(hours),
 *       연간 교육 계획(trainplan), 산재 처리(injuries), 자격증·선임 관리(licenses), 직원 관리(재직·부서·직책).
 *
 * 법 기준 (2026-11 기준)
 *  - 산업안전보건법 제29조①, 시행규칙 별표 4: 근로자 정기교육 — 사무직 종사 근로자·판매 업무 직접 종사자 매반기 6시간 이상,
 *    그 밖의 근로자 매반기 12시간 이상 / 관리감독자 정기교육 연간 16시간 이상 / 채용 시 교육 8시간 이상(일용 등은 1~4시간)
 *  - 산업안전보건법 시행규칙 제27조①: 전년도에 산업재해가 발생하지 않은 사업장은 근로자 정기교육을 그다음 연도에 한정하여
 *    별표 4 교육시간의 100분의 50 범위에서 면제할 수 있다 → '무재해 감면' (관리감독자·채용 시·특별교육은 해당 없음)
 *    ※ 근로기준법에는 교육시간 감면 규정이 없다. 근거는 산업안전보건법 시행규칙이다.
 *  - 남녀고용평등법 제13조: 직장 내 성희롱 예방교육 연 1회 이상 / 장애인고용촉진법 제5조의2: 장애인 인식개선교육 연 1회 이상
 *  - 근로자퇴직급여 보장법 제32조: 퇴직연금 가입자 교육 매년 1회 이상 / 개인정보 보호법 제28조: 개인정보취급자 정기 교육
 */
import "server-only";
import type { Data, Row } from "../대장/logic";
import { loadBooks } from "../대장/store";
import { getSetting } from "../store";
import { addDays, type DateStr, daysBetween, todayKst } from "../time";
import { loadBase } from "./data";
import type { Employee } from "./employees";

export type Cycle = "year" | "half1" | "half2";
export interface LegalDef {
  key: string; name: string; short: string; law: string; cycle: Cycle;
  match: RegExp; exclude?: RegExp;
  /** 사람별 필요 시간 (없으면 한 번 참석하면 이수) */
  hours?: (e: Employee, o: TrainOpts) => number;
  /** 대상 (없으면 전 직원) */
  target?: (e: Employee, o: TrainOpts) => boolean;
  /** 무재해 감면 대상 (근로자 정기교육만) */
  reducible?: boolean;
  /** 이 교육으로 새로 만들 때 넣을 교육명·구분 */
  title: string; kind: string;
}

export interface TrainOpts {
  /** 무재해 감면: auto = 산재 처리 대장에 전년도 기록이 없으면 적용 */
  noAccident: "auto" | "yes" | "no";
  /** 사무직(반기 6시간)으로 볼 부서. 나머지는 반기 12시간 */
  officeDepts: string[];
  /** 관리감독자 (비우면 직책에 팀장·반장·공장장·조장·파트장·관리감독이 들어간 사람) */
  supervisors: string[];
  /** 이 이름은 교육 대상에서 뺀다 (대표이사, 장기 휴직 등) */
  exclude: string[];
}
export const DEFAULT_OPTS: TrainOpts = { noAccident: "auto", officeDepts: ["관리팀", "영업팀", "연구소"], supervisors: [], exclude: [] };
export const SUPERVISOR_RE = /팀장|반장|공장장|조장|파트장|관리감독/;

export const isOffice = (e: Employee, o: TrainOpts) => o.officeDepts.some((d) => d && (e.dept === d || e.dept.includes(d)));
export const isSupervisor = (e: Employee, o: TrainOpts) => (o.supervisors.length ? o.supervisors.includes(e.name) : SUPERVISOR_RE.test(e.position || ""));
const safetyHours = (e: Employee, o: TrainOpts) => (isOffice(e, o) ? 6 : 12);
const SAFETY_MATCH = /안전보건|안전\s*교육|산업안전|정기\s*교육/;
const SAFETY_EXCLUDE = /관리감독자|채용\s*시|작업\s*내용|특별/;

export const LEGAL: LegalDef[] = [
  { key: "harass", name: "직장 내 성희롱 예방교육", short: "성희롱\n예방", law: "남녀고용평등법 제13조 · 연 1회 이상", cycle: "year", match: /성희롱/, title: "직장 내 성희롱 예방교육", kind: "법정의무" },
  { key: "privacy", name: "개인정보 보호교육", short: "개인정보\n보호", law: "개인정보 보호법 제28조 · 정기 교육 (연 1회)", cycle: "year", match: /개인정보/, title: "개인정보 보호교육", kind: "법정의무" },
  { key: "disab", name: "직장 내 장애인 인식개선교육", short: "장애인\n인식개선", law: "장애인고용촉진법 제5조의2 · 연 1회 이상", cycle: "year", match: /장애인/, title: "직장 내 장애인 인식개선교육", kind: "법정의무" },
  { key: "pension", name: "퇴직연금 교육", short: "퇴직연금", law: "근로자퇴직급여 보장법 제32조 · 매년 1회 이상", cycle: "year", match: /퇴직연금/, title: "퇴직연금 교육", kind: "법정의무" },
  { key: "safe1", name: "산업안전보건 정기교육 (상반기)", short: "안전보건\n상반기", law: "산업안전보건법 제29조① · 별표 4 · 반기 6시간(사무)/12시간", cycle: "half1",
    match: SAFETY_MATCH, exclude: SAFETY_EXCLUDE, hours: safetyHours, reducible: true, title: "산업안전보건교육(정기)", kind: "안전보건" },
  { key: "safe2", name: "산업안전보건 정기교육 (하반기)", short: "안전보건\n하반기", law: "산업안전보건법 제29조① · 별표 4 · 반기 6시간(사무)/12시간", cycle: "half2",
    match: SAFETY_MATCH, exclude: SAFETY_EXCLUDE, hours: safetyHours, reducible: true, title: "산업안전보건교육(정기)", kind: "안전보건" },
  { key: "super", name: "관리감독자 정기교육", short: "관리감독자\n16시간", law: "산업안전보건법 제29조① · 별표 4 · 연간 16시간", cycle: "year",
    match: /관리감독자/, hours: () => 16, target: isSupervisor, title: "관리감독자 교육", kind: "안전보건" },
];
const HIRE_MATCH = /채용\s*시/;

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
export const splitNames = (s: string) => (s || "").split(/[,\n·/、;]+/).map((x) => x.replace(/\(.*?\)|\s+(외|등).*$/g, "").trim()).filter(Boolean);
const ALL_RE = /전\s*(직원|사원|임직원)|전원/;

/** 한 교육 기록의 참석자 (직원 관리 이름과 맞춘다) */
export function attendeesOf(d: Data, day: string, emps: Employee[]): string[] {
  const who = d.who ?? "";
  const on = emps.filter((e) => (!e.joinDate || e.joinDate <= day) && (!e.leaveDate || e.leaveDate >= day));
  if (ALL_RE.test(who)) return on.map((e) => e.name);
  const names = new Set(emps.map((e) => e.name));
  return [...new Set(splitNames(who).filter((n) => names.has(n)))];
}

export interface Cell { st: "ok" | "part" | "no" | "na"; text: string; need?: number; got?: number; last?: string }
export interface LegalStat {
  def: LegalDef; due: DateStr; left: number; need: number; done: number; last: string | null;
  state: "ok" | "part" | "no" | "na"; label: string;
}
export interface PersonRow { emp: Employee; cells: Record<string, Cell>; need: number; done: number }
export interface Todo { tone: "r" | "o" | "b"; kind: string; title: string; sub: string; href: string }

export interface TrainingView {
  year: number; today: DateStr; opts: TrainOpts;
  noAccident: { on: boolean; auto: boolean; prevYear: number; injuries: number };
  staff: Employee[];
  legal: LegalStat[];
  people: PersonRow[];
  rows: Row[]; plans: Row[];
  months: { m: number; items: { st: "done" | "plan" | "late"; text: string; href: string }[] }[];
  planDone: number; planTotal: number; planLate: number;
  cost: number; budget: number; refundTodo: number;
  deptHours: { dept: string; got: number; need: number }[];
  todos: Todo[];
}

/** 이번 반기 정기교육 필요 시간 (무재해면 50%) */
export const needHours = (def: LegalDef, e: Employee, o: TrainOpts, reduce: boolean) => {
  const h = def.hours?.(e, o) ?? 0;
  return def.reducible && reduce ? h / 2 : h;
};

export async function trainingView(year = +todayKst().slice(0, 4)): Promise<TrainingView> {
  const today = todayKst();
  const [base, all, saved] = await Promise.all([
    loadBase(), loadBooks(["training", "trainplan", "injuries", "licenses"]), getSetting<Partial<TrainOpts>>("training", {}),
  ]);
  const opts: TrainOpts = { ...DEFAULT_OPTS, ...saved };
  const yS = `${year}-01-01`, yE = `${year}-12-31`;
  const ref = today < yS ? yS : today > yE ? yE : today; // 그해 기준일
  const emps = base.employees;
  const staff = emps.filter((e) => (!e.joinDate || e.joinDate <= ref) && (!e.leaveDate || e.leaveDate >= ref) && !opts.exclude.includes(e.name));

  // 무재해: 전년도 산재 처리 대장 기록 수
  const injuries = all.filter((r) => r.book === "injuries" && r.day?.startsWith(String(year - 1))).length;
  const auto = opts.noAccident === "auto";
  const reduce = auto ? injuries === 0 : opts.noAccident === "yes";

  const rows = all.filter((r) => r.book === "training" && r.day?.startsWith(String(year)))
    .sort((a, b) => (a.day ?? "").localeCompare(b.day ?? ""));
  const att = rows.map((r) => ({ r, names: new Set(attendeesOf(r.data, r.day!, emps)), hours: +r.data.hours || 0 }));
  const span = (c: Cycle): [DateStr, DateStr] => (c === "half1" ? [yS, `${year}-06-30`] : c === "half2" ? [`${year}-07-01`, yE] : [yS, yE]);

  const people: PersonRow[] = staff.map((e) => {
    const cells: Record<string, Cell> = {};
    let need = 0, done = 0;
    for (const def of LEGAL) {
      if (def.target && !def.target(e, opts)) { cells[def.key] = { st: "na", text: "—" }; continue; }
      const [lo, hi] = span(def.cycle);
      // 그 기간 끝 뒤에 들어온 사람은 대상 아님
      if (e.joinDate && e.joinDate > hi) { cells[def.key] = { st: "na", text: "—" }; continue; }
      need++;
      const mine = att.filter((a) => a.r.day! >= lo && a.r.day! <= hi && a.names.has(e.name) && def.match.test(a.r.data.name ?? "") && !def.exclude?.test(a.r.data.name ?? ""));
      const last = mine.at(-1)?.r.day ?? undefined;
      if (def.hours) {
        const n = needHours(def, e, opts, reduce), got = mine.reduce((s, a) => s + a.hours, 0);
        if (got >= n) { done++; cells[def.key] = { st: "ok", text: last ? md(last) : "", need: n, got, last }; }
        else cells[def.key] = { st: got ? "part" : "no", text: got ? `${+got.toFixed(1)}/${n}h` : "미이수", need: n, got, last };
      } else if (mine.length) { done++; cells[def.key] = { st: "ok", text: md(last!), last }; }
      else cells[def.key] = { st: "no", text: "미이수" };
    }
    return { emp: e, cells, need, done };
  });

  const legal: LegalStat[] = LEGAL.map((def) => {
    const [, hi] = span(def.cycle);
    const cs = people.map((p) => p.cells[def.key]).filter((c) => c.st !== "na");
    const done = cs.filter((c) => c.st === "ok").length;
    const lasts = cs.map((c) => c.last).filter(Boolean) as string[];
    const last = lasts.length ? lasts.sort().at(-1)! : null;
    const left = daysBetween(today, hi);
    const state = !cs.length ? "na" : done === cs.length ? "ok" : done || cs.some((c) => c.st === "part") ? "part" : "no";
    const label = state === "na" ? "대상 없음" : state === "ok" ? "완료"
      : left < 0 ? `기한 지남 · ${cs.length - done}명` : state === "part" ? `${cs.length - done}명 미이수` : left <= 60 ? `미실시 · D-${left}` : "미실시";
    return { def, due: hi, left, need: cs.length, done, last, state, label };
  });

  // 연간 계획 → 월 달력
  const plans = all.filter((r) => r.book === "trainplan" && r.day?.startsWith(String(year)));
  const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, items: [] as TrainingView["months"][number]["items"] }));
  for (const p of plans) {
    const st = p.data.status === "실시 완료" ? "done" : p.data.status === "연기" || p.data.status === "취소" ? "late" : "plan";
    months[+p.day!.slice(5, 7) - 1].items.push({ st, text: p.data.name || "(교육명 없음)", href: `/hr/b/trainplan?edit=${p.id}#form` });
  }
  // 계획에 없이 실시한 교육도 달력에
  for (const a of att) {
    const m = +a.r.day!.slice(5, 7) - 1;
    if (!months[m].items.some((x) => x.st === "done" && x.text === a.r.data.name))
      months[m].items.push({ st: "done", text: a.r.data.name || "", href: `/hr/b/training?edit=${a.r.id}#form` });
  }
  const planTotal = plans.filter((p) => p.data.status !== "취소").length;
  const planDone = plans.filter((p) => p.data.status === "실시 완료").length;
  const planLate = plans.filter((p) => p.data.status === "연기" || (p.data.status !== "실시 완료" && p.data.status !== "취소" && (p.day ?? "") < today.slice(0, 7) + "-01")).length;
  const cost = rows.reduce((s, r) => s + (+r.data.cost || 0), 0);
  const budget = plans.reduce((s, p) => s + (+p.data.budget || 0), 0);
  const refundTodo = plans.filter((p) => p.data.refund === "신청 예정").length;

  // 부서별 이번 반기 정기교육 (1인 평균)
  const half: Cycle = today.slice(5) <= "06-30" && String(year) === today.slice(0, 4) ? "half1" : "half2";
  const hdef = LEGAL.find((d) => d.cycle === half && d.reducible)!;
  const dmap = new Map<string, { got: number; need: number; n: number }>();
  for (const p of people) {
    const c = p.cells[hdef.key];
    if (c.st === "na") continue;
    const k = p.emp.dept || "(부서 없음)";
    const v = dmap.get(k) ?? { got: 0, need: 0, n: 0 };
    v.got += Math.min(c.got ?? 0, c.need ?? 0); v.need += c.need ?? 0; v.n++;
    dmap.set(k, v);
  }
  const deptHours = [...dmap].map(([dept, v]) => ({ dept, got: +(v.got / v.n).toFixed(1), need: +(v.need / v.n).toFixed(1) }));

  // 확인할 일
  const todos: Todo[] = [];
  const hires = emps.filter((e) => e.joinDate && e.joinDate >= addDays(today, -90) && e.joinDate <= today && (!e.leaveDate || e.leaveDate >= today));
  for (const e of hires) {
    const ok = all.some((r) => r.book === "training" && (r.day ?? "") >= e.joinDate! && HIRE_MATCH.test(r.data.name ?? "") && attendeesOf(r.data, r.day!, emps).includes(e.name));
    if (!ok) todos.push({ tone: "r", kind: "신규 입사", title: `${e.name} 채용 시 안전보건교육 기록 없음`, sub: `${md(e.joinDate!)} 입사 · ${e.dept} · 8시간 (산업안전보건법 시행규칙 별표 4)`, href: `/hr/training/record?t=hire&who=${encodeURIComponent(e.name)}` });
  }
  for (const l of all.filter((r) => r.book === "licenses" && r.data.renew)) {
    const left = daysBetween(today, l.data.renew);
    if (left <= 60) todos.push({ tone: left < 0 ? "r" : "o", kind: "보수교육", title: `${l.data.emp || ""} ${l.data.name || "자격증"} 보수교육·갱신`, sub: `${left < 0 ? `${-left}일 지남` : `D-${left}`} · ${l.data.role && l.data.role !== "선임 아님" ? l.data.role : "자격증·선임 관리"}`, href: `/hr/b/licenses?edit=${l.id}#form` });
  }
  const noFile = rows.filter((r) => !r.data.n && !r.data.who).length;
  if (noFile) todos.push({ tone: "o", kind: "참석자", title: `참석자가 비어 있는 교육 기록 ${noFile}건`, sub: "참석자를 넣어야 직원별 이수 현황에 잡힙니다", href: "/hr/b/training" });
  if (refundTodo) todos.push({ tone: "b", kind: "환급", title: `사업주훈련 환급 신청 예정 ${refundTodo}건`, sub: "수료 후 고용24에서 신청", href: "/hr/b/trainplan" });
  const thisMonth = plans.filter((p) => p.day?.startsWith(today.slice(0, 7)) && !["실시 완료", "취소"].includes(p.data.status ?? ""));
  if (thisMonth.length) todos.push({ tone: "b", kind: "계획", title: `이번 달 계획 ${thisMonth.length}건 아직 실시 전`, sub: thisMonth.map((p) => p.data.name).join(" · "), href: `/hr/training/record?plan=${thisMonth[0].id}` });
  for (const s of legal) if ((s.state === "no" || s.state === "part") && s.left >= 0 && s.left <= 45)
    todos.push({ tone: "r", kind: "법정교육", title: `${s.def.name} ${s.need - s.done}명 미이수`, sub: `기한 ${md(s.due)} (D-${s.left})`, href: `/hr/training/record?t=${s.def.key}` });

  return {
    year, today, opts, noAccident: { on: reduce, auto, prevYear: year - 1, injuries }, staff, legal, people, rows, plans,
    months, planDone, planTotal, planLate, cost, budget, refundTodo, deptHours, todos,
  };
}

// ---------------------------------------------------------------- 수강 현황 (과정별 대상·수료·미수료·수료증)
export interface Course { row: Row; done: string[]; target: string[]; cert: string[] }
const namesIn = (s: string | undefined, emps: Employee[], day: string) => {
  if (ALL_RE.test(s ?? "")) return emps.filter((e) => (!e.joinDate || e.joinDate <= day) && (!e.leaveDate || e.leaveDate >= day)).map((e) => e.name);
  const set = new Set(emps.map((e) => e.name));
  return [...new Set(splitNames(s ?? "").filter((n) => set.has(n)))];
};
/** 한 교육(과정)의 대상·수료·수료증. 대상자를 따로 적지 않았으면 수료자 = 대상 */
export function courseOf(r: Row, emps: Employee[]): Course {
  const day = r.day ?? todayKst();
  const done = attendeesOf(r.data, day, emps);
  const target = [...new Set([...namesIn(r.data.target, emps, day), ...done])];
  return { row: r, done, target, cert: namesIn(r.data.cert, emps, day) };
}

export interface StatusView {
  from: DateStr; to: DateStr; courses: Course[];
  people: { emp: Employee; marks: ("수료" | "미수료" | "-")[]; cert: boolean }[];
}
/** 기간 안의 교육(교육일~수강 기간 끝이 걸치는 것) 과정별·개인별 수료 현황 */
export async function courseStatus(from: DateStr, to: DateStr): Promise<StatusView> {
  const [base, all] = await Promise.all([loadBase(), loadBooks(["training"])]);
  const emps = base.employees;
  const courses = all.filter((r) => r.day && r.day <= to && (r.data.until || r.day) >= from)
    .sort((a, b) => (a.day ?? "").localeCompare(b.day ?? "") || a.id - b.id).map((r) => courseOf(r, emps));
  const inAny = new Set(courses.flatMap((c) => c.target));
  const people = emps.filter((e) => inAny.has(e.name)).map((emp) => ({
    emp,
    marks: courses.map((c) => (c.done.includes(emp.name) ? "수료" : c.target.includes(emp.name) ? "미수료" : "-") as "수료" | "미수료" | "-"),
    cert: courses.some((c) => c.cert.includes(emp.name)),
  }));
  return { from, to, courses, people };
}

// ---------------------------------------------------------------- 개인별 교육이력
export interface HistItem { row: Row; st: "수료" | "미수료"; cert: boolean; hours: number; legal: string[] }
export async function historyOf(name: string) {
  const [base, all, saved] = await Promise.all([loadBase(), loadBooks(["training", "licenses"]), getSetting<Partial<TrainOpts>>("training", {})]);
  const emp = base.employees.find((e) => e.name === name) ?? null;
  const opts: TrainOpts = { ...DEFAULT_OPTS, ...saved };
  const items: HistItem[] = [];
  for (const r of all.filter((x) => x.book === "training" && x.day).sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""))) {
    const c = courseOf(r, base.employees);
    if (!c.target.includes(name)) continue;
    const done = c.done.includes(name);
    items.push({ row: r, st: done ? "수료" : "미수료", cert: c.cert.includes(name), hours: done ? +r.data.hours || 0 : 0,
      legal: LEGAL.filter((d) => d.match.test(r.data.name ?? "") && !d.exclude?.test(r.data.name ?? "")).map((d) => d.name) });
  }
  const licenses = all.filter((r) => r.book === "licenses" && r.data.emp === name);
  return { emp, items, licenses, opts };
}