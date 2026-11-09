/** 근태 기입 -> 일일 근태현황 보고서 반영 (서버 전용).
 *
 * 근태 기입에서 근무지·업무내용을 고치면, 이미 저장된 그날 보고서의 그 직원 줄도 같이 고친다.
 * - 근태 줄    : 제목 = 근무지, 상세 = 업무내용 (연장근무만 있는 줄은 연장 업무)
 * - 휴일근무 줄 : 제목 = 업무내용. 여러 날짜가 한 줄이면 그 날짜만 떼어 새 줄로.
 * - 같이 근무한 직원([+ 인원])이 그날 보고서에 줄이 없으면 고른 사람의 줄을 복사해 넣는다.
 * 보고서가 없는 날은 새로 만들지 않는다 (보고서가 생기면 그날 근태현황 파일 내용이 가려지므로).
 */
import "server-only";
import { type ReportRow, splitReportTypes } from "./daily";
import * as store from "../store";
import type { DateStr } from "../time";

export interface SyncChange {
  employee: string;
  day: DateStr;
  place?: string;
  work?: string;
  work_ot?: string;
  copyFrom?: string; // [+ 인원]으로 들어온 직원: 이 사람의 줄을 복사
}

type Row = ReportRow & { day: DateStr };
const otOnly = (r: ReportRow) => splitReportTypes(r.types).every((t) => t === "연장근무");

/** 바뀐 보고서 날짜 수를 돌려준다. */
export async function syncReports(changes: SyncChange[], user: string, info: (name: string) => { dept: string; rank: string }):
  Promise<number> {
  const relevant = changes.filter((c) => "place" in c || "work" in c || "work_ot" in c);
  if (!relevant.length) return 0;
  const reportDays = new Set(await store.reportDays());
  const all = (await store.loadReportRows()) as Row[];
  const byDay = new Map<DateStr, Row[]>();
  for (const r of all) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day)!.push(r);
  }
  const dirty = new Set<DateStr>();
  const holRows = (name: string, d: DateStr) =>
    all.filter((r) => r.section === "휴일근무" && r.name === name && splitReportTypes(r.types).includes(d));

  for (const c of relevant) {
    // 근태 줄 (그날 보고서)
    if (reportDays.has(c.day)) {
      const rows = byDay.get(c.day) ?? [];
      let mine = rows.filter((r) => r.section === "근태" && r.name === c.employee);
      if (!mine.length && c.copyFrom) {
        const src = rows.filter((r) => r.section === "근태" && r.name === c.copyFrom);
        const { dept, rank } = info(c.employee);
        let ord = Math.max(0, ...rows.filter((r) => r.section === "근태").map((r) => r.ord));
        mine = src.map((s) => ({ ...s, dept, rank, name: c.employee, ord: ++ord }));
        rows.push(...mine);
        byDay.set(c.day, rows);
        if (mine.length) dirty.add(c.day);
      }
      for (const r of mine) {
        const work = otOnly(r) ? c.work_ot : c.work;
        if (c.place !== undefined && r.title !== c.place) { r.title = c.place; dirty.add(c.day); }
        if (work !== undefined && r.detail !== work) { r.detail = work; dirty.add(c.day); }
      }
    }
    // 휴일근무 줄 (어느 날 보고서에 있든 이 날짜가 들어 있는 줄)
    if (c.work === undefined) continue;
    let hol = holRows(c.employee, c.day);
    if (!hol.length && c.copyFrom) {
      for (const s of holRows(c.copyFrom, c.day)) {
        const { dept, rank } = info(c.employee);
        const row: Row = { ...s, dept, rank, name: c.employee, types: c.day, ord: s.ord };
        all.push(row);
        byDay.get(s.day)!.push(row);
        dirty.add(s.day);
      }
      hol = holRows(c.employee, c.day);
    }
    for (const r of hol) {
      if (r.title === c.work) continue;
      const dates = splitReportTypes(r.types);
      if (dates.length === 1) r.title = c.work;
      else {
        r.types = dates.filter((x) => x !== c.day).join(",");
        const row: Row = { ...r, types: c.day, title: c.work };
        all.push(row);
        byDay.get(r.day)!.push(row);
      }
      dirty.add(r.day);
    }
  }
  for (const d of dirty) await store.saveReport(d, byDay.get(d) ?? [], user);
  return dirty.size;
}
