/** 근태 증빙: 날짜별 출장·교육·외근을 한 건(연속된 날, 같은 목적지)으로 묶고 첨부 파일과 맞춘다. */
import type { Leave } from "./leave";
import { addDays, type DateStr } from "../time";

export const EVIDENCE_TYPES = new Set(["출장", "교육", "외근"]);

export interface Trip {
  name: string;
  dept: string;
  type: string;
  title: string; // 목적지·사유 첫 줄
  detail: string;
  from: DateStr;
  to: DateStr;
  days: DateStr[];
}

const firstLine = (s: string) => String(s).split("\n")[0].trim();

/** 같은 사람·유형·목적지로 이어지는 날(주말 등 3일 이내 간격)을 한 건으로 묶는다. */
export function groupTrips(leaves: Leave[], types: Set<string> = EVIDENCE_TYPES): Trip[] {
  const sorted = leaves.filter((l) => types.has(l.type))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const out: Trip[] = [];
  for (const l of sorted) {
    const title = firstLine(l.content);
    const last = out[out.length - 1];
    if (last && last.name === l.name && last.type === l.type && last.title === title && l.day <= addDays(last.to, 3)) {
      if (!last.days.includes(l.day)) last.days.push(l.day);
      if (l.day > last.to) last.to = l.day;
      continue;
    }
    out.push({
      name: l.name, dept: l.dept, type: l.type, title, detail: String(l.content).split("\n").slice(1).join(" ").trim(),
      from: l.day, to: l.day, days: [l.day],
    });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.name < b.name ? -1 : 1));
}

/** 이름이 같고 기간이 겹치는 첨부 */
export function attachmentsFor<T extends { name: string; dayFrom: DateStr; dayTo: DateStr }>(
  atts: T[], name: string, from: DateStr, to: DateStr): T[] {
  return atts.filter((a) => a.name === name && a.dayFrom <= to && a.dayTo >= from);
}
