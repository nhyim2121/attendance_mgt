/** 조직도 보기 설정: 사내용(연락처 포함)·대외용(부서·직급·성명) 등 용도별로 보여 줄 항목을 저장해 두고 골라 쓴다. */
import type { Employee } from "./employees";
import type { DateStr } from "./time";

export const ORG_FIELDS = {
  rank: "직급", position: "직책", phone: "휴대전화", ext: "내선", email: "이메일", empId: "사번", joinDate: "입사일",
} as const;
export type OrgField = keyof typeof ORG_FIELDS;

export interface OrgView {
  id: string;
  name: string; // 보기 이름 (사내용, 대외용 …)
  title: string; // 조직도 맨 위에 적을 이름 (회사명)
  fields: OrgField[];
  depts: string[]; // 비우면 전체 부서
  showCount: boolean; // 부서 인원 수
  layout: "chart" | "table";
  exclude?: string[]; // 이 보기에서 빼는 사람 (명부에 없는 사람 포함)
}

export const DEFAULT_VIEWS: OrgView[] = [
  { id: "internal", name: "사내용", title: "{년}년도 조직도", fields: ["rank", "position", "phone", "ext", "email"], depts: [],
    showCount: true, layout: "chart" },
  { id: "external", name: "대외용", title: "{년}년도 조직도", fields: ["rank"], depts: [], showCount: false, layout: "chart" },
  { id: "contact", name: "비상연락망", title: "비상연락망", fields: ["rank", "phone"], depts: [], showCount: false, layout: "table" },
];

export interface OrgDept {
  dept: string;
  head: Employee | null; // 직책에 '장'이 들어간 첫 사람 (팀장·부장·공장장 등)
  members: Employee[];
}

/** 기준일 재직자를 부서별로 (명부 순서). 직책이 있는 사람을 앞에 둔다. */
export function orgTree(emps: Employee[], day: DateStr, depts: string[] = []): OrgDept[] {
  const act = emps.filter((e) => (!e.joinDate || e.joinDate <= day) && (!e.leaveDate || e.leaveDate >= day));
  const order: string[] = [];
  for (const e of act) if (!order.includes(e.dept || "(부서 없음)")) order.push(e.dept || "(부서 없음)");
  return order.filter((d) => !depts.length || depts.includes(d)).map((dept) => {
    const ms = act.filter((e) => (e.dept || "(부서 없음)") === dept)
      .sort((a, b) => Number(!a.position) - Number(!b.position) || a.ord - b.ord);
    const head = ms.find((e) => e.position.includes("장")) ?? null;
    return { dept, head, members: ms.filter((e) => e !== head) };
  });
}

export function fieldValue(e: Employee, f: OrgField): string {
  return (f === "joinDate" ? e.joinDate : e[f]) ?? "";
}

// ---------------------------------------------------------------- 조직 구조 (대표 → 임원 → 부서 → 반)

export const NODE_KINDS = { top: "대표", exec: "임원", unit: "부서", sub: "반·파트" } as const;
export type NodeKind = keyof typeof NODE_KINDS;

export interface OrgNode {
  id: string;
  parent: string | null;
  kind: NodeKind;
  label: string; // 상자에 적을 이름 (대표이사, 전무, 생산팀, 권선반 …)
  head: string; // 책임자: 직원 이름이면 직급을 붙이고, 아니면 적은 대로 (명부에 없는 대표 등)
  headPhone?: string; // 명부에 없는 책임자의 휴대전화 (명부에 넣으면 근태 집계에 들어가므로 여기에 둔다)
  dept: string; // 이 부서의 직원을 자동으로 넣는다 (다른 곳에 직접 넣은 사람은 빼고)
  members: string[]; // 직접 넣을 직원 (반·파트 나누기)
  extra: string[]; // 명부에 없는 사람 "과장 김선우"
  color?: string; // 머리 칸 색 (#rrggbb). 비우면 부서는 차례대로 자동, 반은 상위 부서 색
}

/** 부서 자동 색: 회사 로고의 빨강에서 시작해 흰 글씨가 읽히는(대비 4.5 이상) 색들 */
export const DEPT_COLORS = ["#d23a37", "#1f5fbf", "#0f7f86", "#a85d08", "#6a4bb5", "#2e7d46", "#c2185b", "#5b6b82"];

export interface OrgCompany { name: string; nameEn: string; logo: string } // logo = data URL

/** 높은 직급부터. 목록에 없는 직급·빈 직급은 뒤로 (같으면 명부 순서). */
export const RANK_ORDER = [
  "회장", "대표이사", "사장", "부사장", "전무이사", "전무", "상무이사", "상무", "이사", "전문위원", "수석", "부장", "책임",
  "차장", "과장", "선임", "대리", "주임", "사원", "도제",
];
const rankIdx = (r: string) => (RANK_ORDER.includes(r) ? RANK_ORDER.indexOf(r) : RANK_ORDER.length);

export interface OrgPerson { rank: string; name: string; emp: Employee | null; phone?: string }
export interface OrgBox { node: OrgNode; color: string; head: OrgPerson | null; people: OrgPerson[]; children: OrgBox[]; count: number }

/** 저장된 구조가 없을 때: 대표이사 아래 명부의 부서를 나란히. */
export function defaultNodes(emps: Employee[]): OrgNode[] {
  const depts = [...new Set(emps.filter((e) => !e.leaveDate).map((e) => e.dept).filter(Boolean))];
  const n = (id: string, parent: string | null, kind: NodeKind, label: string, dept = ""): OrgNode =>
    ({ id, parent, kind, label, head: "", dept, members: [], extra: [] });
  return [n("top", null, "top", "대표이사"), ...depts.map((d, i) => n(`d${i}`, "top", "unit", d, d))];
}

/** "과장 김선우" -> 직급·이름 (첫 낱말이 직급 목록에 있을 때만 나눈다) */
function parseExtra(t: string): OrgPerson {
  const [a, ...b] = t.trim().split(/\s+/);
  return b.length && RANK_ORDER.includes(a) ? { rank: a, name: b.join(" "), emp: null } : { rank: "", name: t.trim(), emp: null };
}

/** 기준일 재직자를 구조에 앉힌다. 어디에도 안 들어간 직원은 unplaced. */
export function buildOrg(nodes: OrgNode[], emps: Employee[], day: DateStr, depts: string[] = [], exclude: string[] = []) {
  const out = new Set(exclude);
  const act = emps.filter((e) => (!e.joinDate || e.joinDate <= day) && (!e.leaveDate || e.leaveDate >= day)
    && (!depts.length || depts.includes(e.dept)) && !out.has(e.name));
  const byName = new Map(act.map((e) => [e.name, e]));
  const placed = new Set([...nodes.map((n) => n.head), ...nodes.flatMap((n) => n.members)].filter((x) => byName.has(x)));
  const seen = new Set<string>();
  const person = (e: Employee): OrgPerson => ({ rank: e.rank, name: e.name, emp: e });
  let auto = 0;
  const make = (n: OrgNode, path: string[], inherit: string): OrgBox => {
    const color = n.color || (n.kind === "unit" ? DEPT_COLORS[auto++ % DEPT_COLORS.length] : n.kind === "sub" ? inherit : "");
    const h = n.head && !out.has(n.head) ? (byName.has(n.head) ? person(byName.get(n.head)!) : parseExtra(n.head)) : null;
    const head = h && !h.emp && (out.has(h.name) || emps.some((e) => e.name === h.name)) ? null : h; // 뺀 사람·퇴사자
    if (head && !head.emp) head.phone = n.headPhone;
    if (head?.emp) seen.add(head.name);
    const ms = [...n.members.filter((m) => byName.has(m)).map((m) => byName.get(m)!),
      ...(n.dept ? act.filter((e) => e.dept === n.dept && !placed.has(e.name)) : [])]
      .filter((e, i, xs) => xs.indexOf(e) === i);
    ms.forEach((e) => seen.add(e.name));
    const people = [...ms.map(person), ...n.extra.filter((x) => x.trim()).map(parseExtra).filter((p) => !out.has(p.name))]
      .map((p, i) => ({ p, i, o: p.emp?.ord ?? 9e9 }))
      .sort((a, b) => rankIdx(a.p.rank) - rankIdx(b.p.rank) || a.o - b.o || a.i - b.i).map((x) => x.p);
    const children = nodes.filter((c) => c.parent === n.id && !path.includes(c.id))
      .map((c) => make(c, [...path, c.id], color || inherit));
    return { node: n, color, head, people, children,
      count: (head ? 1 : 0) + people.length + children.reduce((t, c) => t + c.count, 0) };
  };
  const ids = new Set(nodes.map((n) => n.id));
  const roots = nodes.filter((n) => !n.parent || !ids.has(n.parent)).map((n) => make(n, [n.id], ""));
  return { roots, unplaced: act.filter((e) => !seen.has(e.name)), total: roots.reduce((t, r) => t + r.count, 0) };
}

/** 조직 구조에 나오는 사람 이름 전부 (보기별로 뺄 사람 고르기용) */
export function orgPeople(nodes: OrgNode[], emps: Employee[]): string[] {
  const names = new Set(emps.filter((e) => !e.leaveDate).map((e) => e.name));
  const extra = nodes.flatMap((n) => [...(n.head && !names.has(n.head) ? [n.head] : []), ...n.extra.map((x) => parseExtra(x).name)]);
  return [...new Set([...extra.filter(Boolean), ...names])];
}
