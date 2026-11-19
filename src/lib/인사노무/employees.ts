/** 직원 명부 (입사·퇴사) 적용: 캡스 이름 연결, 부서 채우기, 재직 기간. */
import type { RosterRow } from "./hiworks";
import type { CapsRecord } from "./loader";
import type { DateStr } from "../time";

export interface Stint { join: DateStr | null; leave: DateStr | null }
/** 보직 이력 한 줄: 이 날(until)까지는 이 부서·직급이었다. 지금 부서·직급은 마지막 이동 뒤. */
export interface Move { until: DateStr; dept: string; rank: string }

export interface Employee {
  name: string;
  capsName: string; // 캡스에 이름이 다르게 찍힐 때만
  empId: string;
  dept: string;
  rank: string;
  position: string; // 직책 (팀장 등)
  phone: string;
  ext: string; // 내선
  email: string;
  joinDate: DateStr | null;
  leaveDate: DateStr | null; // 마지막 근무일
  /** 재입사 직원의 이전 근무 기간 (2026-11-17). 그 기간의 기록도 재직으로 집계한다. 연차·근속은 지금 입사일 기준. */
  prior?: Stint[];
  /** 보직 이력 (2026-11-19): 기준일이 until 이하인 첫 줄의 부서·직급을 쓴다 (조직도 기준일 등) */
  moves?: Move[];
  note: string;
  ord: number;
}

/** 처음 한 번: 근태현황 '명단'으로 직원 명부를 만든다 (입사일·퇴사일은 비워 둠). */
export function seedFrom(roster: RosterRow[], ranks: Record<string, string>): Employee[] {
  return roster.map((r, i) => ({
    name: r.name, capsName: "", empId: "", dept: r.dept, rank: ranks[r.name] ?? "", position: "", phone: "", ext: "",
    email: "", joinDate: null, leaveDate: null, prior: [],
    note: "", ord: i + 1,
  }));
}

/** 명단의 부서를 출입기록에 채운다 (캡스 원본에는 부서가 없음). */
export function applyRoster(records: CapsRecord[], roster: RosterRow[]): CapsRecord[] {
  if (!roster.length) return records;
  const dept = new Map(roster.map((r) => [r.name, r.dept]));
  return records.map((r) => {
    const d = dept.get(r.name);
    return d ? { ...r, dept: d } : r;
  });
}

/** 캡스 이름이 다르게 찍히는 직원은 명부 이름으로 바꾸고, 명부의 부서를 채운다.
 *
 * 명부에 있는 직원은 사번이 함께 찍혀도 명부 이름 하나로 묶는다. 매일 올리는 캡스 파일(Search_*.xls)에는
 * 사번이 있고 월별 파일에는 없어서, 묶지 않으면 같은 사람이 '이름'과 '이름(사번)' 두 명으로 나뉜다.
 * (동명이인은 명부에서 '홍길동2'처럼 이름을 나누고 캡스 이름으로 연결한다.)
 */
export function applyEmployees(records: CapsRecord[], emps: Employee[]): CapsRecord[] {
  if (!emps.length) return records;
  const alias = new Map(emps.filter((e) => e.capsName && e.capsName !== e.name).map((e) => [e.capsName, e.name]));
  const dept = new Map(emps.filter((e) => e.dept).map((e) => [e.name, e.dept]));
  const registered = new Set(emps.map((e) => e.name));
  return records.map((r) => {
    const name = alias.get(r.name) ?? r.name;
    if (!registered.has(name)) return r;
    return { ...r, name, emp: name, dept: dept.get(name) ?? r.dept };
  });
}

export type Span = [DateStr | null, DateStr | null];

/** 직원의 근무 기간 전부: 이전 근무 기간(재입사 전) + 지금 (입사일, 퇴사일). 비어 있으면 null (제한 없음). */
export function spansOf(e: Employee): Span[] {
  return [...(e.prior ?? []).map((s) => [s.join, s.leave] as Span), [e.joinDate, e.leaveDate]];
}

/** 이름 -> 근무 기간들 */
export function employment(emps: Employee[]): Map<string, Span[]> {
  return new Map(emps.map((e) => [e.name, spansOf(e)]));
}

/** 퇴사일은 마지막 근무일로 본다 (그날까지 재직). 근무 기간 중 하나라도 들면 재직. */
export function isEmployed(spans: Span | Span[] | undefined, day: DateStr): boolean {
  if (!spans) return true;
  const list = (Array.isArray(spans[0]) || !spans.length ? spans : [spans]) as Span[];
  return list.some(([start, end]) => (start === null || day >= start) && (end === null || day <= end));
}

/** 그날의 부서·직급 (보직 이력 반영). 이동 전이면 사본, 아니면 그대로. */
export function asOf(e: Employee, day: DateStr): Employee {
  const m = [...(e.moves ?? [])].sort((a, b) => a.until.localeCompare(b.until)).find((x) => day <= x.until);
  return m ? { ...e, dept: m.dept || e.dept, rank: m.rank || e.rank } : e;
}

/** 그날 재직 중인가 (재입사 전 근무 기간 포함) */
export const employedOn = (e: Employee, day: DateStr) => isEmployed(spansOf(e), day);

/** 기간 [lo, hi] 중 하루라도 재직한 직원 (명부 순서). */
export function activeNames(emps: Employee[], lo: DateStr, hi: DateStr): string[] {
  return emps.filter((e) => spansOf(e).some(([a, b]) => (a === null || a <= hi) && (b === null || b >= lo)))
    .map((e) => e.name);
}

export function statusLabel(e: Employee, today: DateStr): string {
  if (e.leaveDate !== null && e.leaveDate < today) return "퇴사";
  if (e.joinDate !== null && e.joinDate > today) return "입사 예정";
  return "재직";
}
