/** 신청서 없는 휴일·연장근무 찾기 (근태 홈·할 일). 근태 기입 화면과 같은 기준(kindsOf·proofOf)을 쓴다. 서버 전용. */
import "server-only";
import { cache } from "react";
import { isHoliday } from "./analytics";
import { computeDays, getHolidays, getRecords, getRule } from "./data";
import { kindsOf, PROOF_FROM, proofOf } from "./proof";
import { employeeRows, SHEET_COLUMNS } from "./splitter";
import * as store from "../store";
import { addDays, todayKst } from "../time";

const C = (name: string) => SHEET_COLUMNS.indexOf(name);
export interface Missing { emp: string; day: string; kinds: string[] }

/** PROOF_FROM(또는 최근 62일 중 늦은 날)부터 오늘까지 신청서가 없는 휴일·연장근무 */
export const missingProofs = cache(async (): Promise<Missing[]> => {
  const today = todayKst();
  const from = [PROOF_FROM, addDays(today, -62)].sort()[1];
  if (from > today) return [];
  const [rule, holidays, records, atts] = await Promise.all([getRule(), getHolidays(), getRecords(from, today), store.loadAttachments(from, today)]);
  const days = await computeDays(records, rule);
  const out: Missing[] = [];
  for (const emp of [...new Set(days.map((d) => d.emp))]) {
    const mine = days.filter((d) => d.emp === emp);
    const sheet = employeeRows(mine, rule);
    for (const d of mine) {
      if (d.day < from) continue;
      const r = sheet.filter((x) => x[C("발생일자")] === d.day);
      const ins = r.find((x) => x[C("모드")] === "출근"), outs = r.find((x) => x[C("모드")] === "퇴근");
      const kinds = kindsOf(d, outs?.[C("근무형태")] ?? "", isHoliday(d.day, rule, holidays, emp), ins?.[C("근무형태")] ?? "");
      const p = proofOf(emp, d.day, kinds, atts);
      if (p.missing.length) out.push({ emp, day: d.day, kinds: p.missing });
    }
  }
  return out.sort((a, b) => b.day.localeCompare(a.day) || a.emp.localeCompare(b.emp));
});
