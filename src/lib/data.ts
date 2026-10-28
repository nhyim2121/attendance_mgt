/** 여러 화면이 함께 쓰는 데이터(공용 저장소)와 기간·부서 필터. 서버 전용. */
import "server-only";
import { cache } from "react";
import { buildDays, type DayRow } from "./analytics";
import { DEFAULT_RULE, HOLIDAYS_2026, type Holidays, type WorkRule } from "./config";
import { mergeLeaves, rankMap } from "./daily";
import { activeNames, applyEmployees, applyRoster, type Employee, employment, isEmployed, seedFrom } from "./employees";
import type { Leave, RosterRow } from "./hiworks";
import type { CapsRecord } from "./loader";
import * as store from "./store";
import { addDays, type DateStr, daysInMonth } from "./time";

// ---------------------------------------------------------------- 공용 설정
interface RuleSetting {
  start: string; end: string; grace_min: number; workdays: number[]; overtime_min: number; round_min: number;
  label_all: boolean;
}

const toMin = (s: string) => +s.slice(0, 2) * 60 + +s.slice(3, 5);
const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function ruleToSetting(r: WorkRule): RuleSetting {
  return {
    start: toHM(r.start), end: toHM(r.end), grace_min: r.graceMin, workdays: r.workdays, overtime_min: r.overtimeMin,
    round_min: r.roundMin, label_all: r.labelAll,
  };
}

export const getRule = cache(async (): Promise<WorkRule> => {
  const d = await store.getSetting<RuleSetting | null>("rule", null);
  if (!d) return DEFAULT_RULE;
  return {
    start: toMin(d.start), end: toMin(d.end), graceMin: d.grace_min, workdays: d.workdays,
    overtimeMin: d.overtime_min, roundMin: d.round_min, labelAll: d.label_all,
  };
});

export const getHolidays = cache(async (): Promise<Holidays> =>
  store.getSetting<Holidays>("holidays", HOLIDAYS_2026));

// ---------------------------------------------------------------- 기본 데이터
export interface Base {
  fileRoster: RosterRow[];
  employees: Employee[];
  roster: RosterRow[]; // 직원 명부가 있으면 그것, 없으면 근태현황 파일의 '명단'
  leaves: Leave[]; // 근태현황 파일 + 사이트 일일 보고서 (보고서가 있는 날은 보고서 우선)
  overrides: Awaited<ReturnType<typeof store.loadOverrides>>;
  months: store.MonthInfo[];
}

export const loadBase = cache(async (): Promise<Base> => {
  const [fileRoster, fileLeaves, reportRows, reportDays, overrides, months] = await Promise.all([
    store.loadRoster(), store.loadLeaves(), store.loadReportRows(), store.reportDays(), store.loadOverrides(),
    store.recordMonths(),
  ]);
  let employees = await store.loadEmployees();
  if (!employees.length && fileRoster.length) {
    // 직원 명부가 비어 있으면 근태현황 '명단'으로 한 번 채운다
    await store.saveEmployees(seedFrom(fileRoster, rankMap(fileLeaves, reportRows)), "자동(명단)");
    employees = await store.loadEmployees();
  }
  const roster = employees.length ? employees.map((e) => ({ ord: e.ord, dept: e.dept, name: e.name })) : fileRoster;
  return {
    fileRoster, employees, roster, leaves: mergeLeaves(fileLeaves, reportRows, reportDays), overrides, months,
  };
});

/** 기간의 캡스 기록에 명단 부서·명부 이름을 반영한다. */
export async function getRecords(from?: DateStr, to?: DateStr): Promise<CapsRecord[]> {
  const base = await loadBase();
  return applyEmployees(applyRoster(await store.loadRecords(from, to), base.fileRoster), base.employees);
}

/** 입사일 전·퇴사일 뒤의 기록을 뺀다 (명부에 날짜가 없으면 그대로). */
export function onlyEmployed(records: CapsRecord[], emps: Employee[]): CapsRecord[] {
  const spans = employment(emps);
  if (!spans.size) return records;
  return records.filter((r) => isEmployed(spans.get(r.name), r.day));
}

/** 필터된 기간 안의 하이웍스 근태만. */
export function leavesIn(leaves: Leave[], records: CapsRecord[]): Leave[] {
  if (!records.length) return leaves;
  const lo = records[0].day, hi = records.reduce((a, r) => (r.day > a ? r.day : a), lo);
  return leaves.filter((l) => l.day >= lo && l.day <= hi);
}

export async function computeDays(records: CapsRecord[], rule: WorkRule): Promise<DayRow[]> {
  const [base, holidays] = await Promise.all([loadBase(), getHolidays()]);
  return buildDays(records, leavesIn(base.leaves, records), rule, holidays, base.overrides);
}

/** 파일 이름·시트 이름에 쓸 기간 표시 (한 달이면 '9월'). */
export function periodLabel(records: CapsRecord[]): string {
  if (!records.length) return "";
  const days = records.map((r) => r.day);
  const lo = days.reduce((a, b) => (b < a ? b : a)), hi = days.reduce((a, b) => (b > a ? b : a));
  if (lo.slice(0, 7) === hi.slice(0, 7)) return `${+lo.slice(5, 7)}월`;
  return `${lo.slice(5).replace("-", ".")}~${hi.slice(5).replace("-", ".")}`;
}

/** 기준일에 재직 중인 직원 [(직원, 부서)] (명부 순서). 명부가 없으면 최근 60일 출입자. */
export async function staffOn(day: DateStr, records: CapsRecord[]): Promise<[string, string][]> {
  const { employees } = await loadBase();
  if (employees.length) {
    const dept = new Map(employees.map((e) => [e.name, e.dept]));
    return activeNames(employees, day, day).map((n) => [n, dept.get(n) ?? ""]);
  }
  const lo = addDays(day, -60);
  const seen = new Map<string, string>();
  for (const r of records) if (r.day >= lo && r.day <= day && !seen.has(r.emp)) seen.set(r.emp, r.dept);
  return [...seen];
}

// ---------------------------------------------------------------- 필터 (주소의 ?month=&from=&to=&dept=&all=)
export type SearchParams = Record<string, string | string[] | undefined>;

export interface Filter {
  month: string | null; // 'YYYY-MM', 직접 선택이면 null
  from: DateStr;
  to: DateStr;
  depts: string[];
  onlyRoster: boolean;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilter(sp: SearchParams, months: store.MonthInfo[]): Filter | null {
  if (!months.length) return null;
  const first = months[0].first_day, last = months[months.length - 1].last_day;
  const want = one(sp.month);
  const depts = one(sp.dept).split(",").filter(Boolean);
  const onlyRoster = one(sp.all) !== "1";
  if (want === "custom") {
    let from = one(sp.from) || first, to = one(sp.to) || last;
    if (from > to) [from, to] = [to, from];
    return { month: null, from, to, depts, onlyRoster };
  }
  const month = months.some((m) => m.month === want) ? want : months[months.length - 1].month;
  return { month, from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}`, depts, onlyRoster };
}

export interface Filtered {
  filter: Filter;
  all: CapsRecord[]; // 기간 안 전체 기록 (명단 밖 출입자 확인용)
  records: CapsRecord[]; // 필터 적용
  depts: string[]; // 고를 수 있는 부서
}

/** 기간·부서·명단 필터를 적용한 기록. 기록이 하나도 없으면 null. */
export async function filteredRecords(sp: SearchParams): Promise<Filtered | null> {
  const base = await loadBase();
  const filter = parseFilter(sp, base.months);
  if (!filter) return null;
  const all = await getRecords(filter.from, filter.to);
  let out = all;
  if (filter.onlyRoster && base.roster.length) {
    const names = new Set(base.roster.map((r) => r.name));
    out = onlyEmployed(out.filter((r) => names.has(r.name)), base.employees);
  }
  const depts = [...new Set(out.map((r) => r.dept).filter(Boolean))].sort();
  if (filter.depts.length) out = out.filter((r) => filter.depts.includes(r.dept));
  return { filter, all, records: out, depts };
}
