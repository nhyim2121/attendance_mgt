import "server-only";
import { employeeSummary, type EmployeeSummary } from "@/lib/analytics";
import { computeDays, filteredRecords, getRule, loadBase, periodLabel, type SearchParams } from "@/lib/data";

/** 직원별 시트 화면과 내려받기가 같이 쓰는 계산 */
export async function sheetData(sp: SearchParams) {
  const f = await filteredRecords(sp);
  if (!f || !f.records.length) return { f, empty: true as const };
  const [rule, base] = await Promise.all([getRule(), loadBase()]);
  const days = await computeDays(f.records, rule);
  const summary = employeeSummary(days, base.roster.map((r) => r.name));
  const allEmps = summary.map((s) => s.emp);
  const picked = String(sp.emps ?? "").split(",").filter((e) => allEmps.includes(e));
  const emps = picked.length ? allEmps.filter((e) => picked.includes(e)) : allEmps;
  return {
    f, empty: false as const, rule, days, summary: summary.filter((s) => emps.includes(s.emp)), allEmps, picked, emps,
    label: periodLabel(f.records),
  };
}

export function summaryRows(summary: EmployeeSummary[]): (string | number | null)[][] {
  return summary.map((s) => [s.emp, s.dept, s.workDays, s.avgIn, s.avgOut, s.avgStay, s.late, s.early, s.noRecord,
    s.tagMissing, s.holidayWork, s.leaveUsed, s.trips]);
}
