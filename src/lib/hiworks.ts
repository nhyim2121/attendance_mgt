/** 근태현황(하이웍스 신청서 정리) 파일 읽기.
 *
 * 파일 구조
 * - '명단' 시트: 구분 | 부서 | 성명
 * - 날짜별 일일보고 시트 (이름 예: '26.10.27(화)')
 *     헤더 1행: 구분 | 부서 | 직급 | 성명 | 근태현황 | ... | 근무지(목적지/사유/시간) | 비고
 *     헤더 2행:                          연차 | 반차 | 반반차 | 외출 | 공가 | 출장 | 교육 (시기별로 순서·종류 다름)
 *     데이터: 해당 칸에 'o' 표시. 부서 칸은 병합되어 비어 있을 수 있음.
 *     그 아래 '일학습병행 관련', '휴가일정 관련' 등 참고 표는 읽지 않는다.
 */
import { type Cell, type Grid, isExcelDate, readRaw, type Sheets } from "./excel";
import { dedupeLeaves, type Leave, sortLeaves } from "./leave";
import { toText } from "./loader";
import { type DateStr, makeDate } from "./time";

export const LEAVE_FLAGS = new Set(["o", "○", "◯", "●", "v", "✓", "✔", "y"]);
const SHEET_DATE = /^\s*(\d{2})\s*\.+\s*(\d{1,2})\s*\.\s*(\d{1,2})/;
const NOTE_DATE = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\([월화수목금토일]\)\s*근태/;
const MD = /^(\d{1,2})\s*\/\s*(\d{1,2})\s*\(/;
const NUM = /^\d+(\.0)?$/;

export { dedupeLeaves, type Leave, sortLeaves };

export interface RosterRow {
  ord: number;
  dept: string;
  name: string;
}

const cell = (v: Cell | undefined) => toText(v ?? null);
const key = (s: string) => s.replace(/\s+/g, "");
const year = (d: DateStr) => +d.slice(0, 4);

/** '26.10.27(화)' -> 2026-10-27. 기간·참고 시트는 null. */
export function sheetDate(name: string): DateStr | null {
  if (name.includes("~") || name.includes("참고")) return null;
  const m = SHEET_DATE.exec(name);
  return m ? makeDate(2000 + +m[1], +m[2], +m[3]) : null;
}

/** '명단' 시트 -> [순서, 부서, 이름] */
export function parseRoster(raw: Grid): RosterRow[] {
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const row = raw[i].map((v) => key(cell(v)));
    if (row.includes("부서") && (row.includes("성명") || row.includes("이름"))) {
      const dc = row.indexOf("부서");
      const nc = row.includes("성명") ? row.indexOf("성명") : row.indexOf("이름");
      const rows: RosterRow[] = [];
      for (let j = i + 1; j < raw.length; j++) {
        const name = cell(raw[j][nc]), dept = cell(raw[j][dc]);
        if (name) rows.push({ ord: rows.length + 1, dept, name });
      }
      const seen = new Set<string>();
      return rows.filter((r) => !seen.has(r.name) && seen.add(r.name));
    }
  }
  return [];
}

function findHeader(raw: Grid): number | null {
  for (let i = 0; i < Math.min(15, raw.length - 1); i++) {
    const row = raw[i].map((v) => key(cell(v)));
    if (row.includes("성명") && row.some((c) => c.includes("근태"))) return i;
  }
  return null;
}

const idx = (arr: string[], v: string) => (arr.includes(v) ? arr.indexOf(v) : null);

/** 일일보고 시트 하나에서 첫 번째 근태현황 표의 기록을 읽는다. */
export function parseDailySheet(raw: Grid, day: DateStr, sheetName = ""): Leave[] {
  const hi = findHeader(raw);
  if (hi === null) return [];
  const head = raw[hi].map((v) => key(cell(v)));
  const sub = raw[hi + 1].map((v) => key(cell(v)));

  const nameC = head.indexOf("성명");
  const deptC = idx(head, "부서");
  const rankC = idx(head, "직급");
  const contentIdx = head.findIndex((c) => c.includes("목적지") || c.startsWith("내용") || c.startsWith("근무지"));
  const contentC = contentIdx >= 0 ? contentIdx : null;
  const noteC = idx(head, "비고");
  const numC = deptC ? deptC - 1 : null;
  const fixed = new Set([nameC, deptC, rankC, contentC, noteC]);
  const typeCols: [number, string][] = [];
  sub.forEach((label, c) => {
    if (label && c > nameC && !fixed.has(c) && (contentC === null || c < contentC)) typeCols.push([c, label]);
  });

  const out: Leave[] = [];
  let prevName = "", prevDept = "", prevRank = "", prevContent = "";
  let prevTypes: string[] = [];
  for (let j = hi + 2; j < raw.length; j++) {
    const cells = raw[j].map((v) => cell(v));
    if (!cells.some(Boolean)) continue;
    const num = numC !== null ? cells[numC] : "";
    let name = cells[nameC];
    if (key(name) === "성명" || key(name) === "이름") break; // 다음 표의 헤더
    if (num && !NUM.test(num)) break; // '휴가일정 관련' 같은 섹션 제목
    let content = contentC !== null ? cells[contentC] : "";
    const note = noteC !== null ? cells[noteC] : "";

    const types: string[] = [];
    for (const [c, label] of typeCols) {
      const v = cells[c] ?? "";
      if (!v) continue;
      if (LEAVE_FLAGS.has(v.toLowerCase()) || v === "0" || v === "0.0") types.push(label); // '0'은 'o' 오타
      else if (/^[\d.]+$/.test(v)) continue; // 3월 일부 시트의 보조 숫자(5, 6 등)는 근태가 아님
      else types.push(v); // 'OFF-JT(학교)' 같은 직접 입력 값
    }
    const dept = (deptC !== null ? cells[deptC] : "") || prevDept;
    let rank: string;
    if (name) rank = rankC !== null ? cells[rankC] : "";
    else {
      if (!(num || content)) continue; // 표 아래 낙서 같은 값
      [name, rank] = [prevName, prevRank];
    }
    if (!content && types.length && types.join("\u0000") === prevTypes.join("\u0000")) {
      content = prevContent; // 같은 출장·교육 일행은 내용 칸이 병합되어 있음
    }
    [prevName, prevDept, prevRank, prevTypes, prevContent] = [name, dept, rank, types, content];
    if (!name || !types.length) continue;

    let when = day;
    const m = NOTE_DATE.exec(note) ?? NOTE_DATE.exec(content);
    if (m) when = makeDate(year(day), +m[1], +m[2]) ?? day; // 비고에 '10/15(목) 근태'처럼 늦게 올린 신청서
    for (const t of types) {
      out.push({ day: when, name, dept, rank, type: t, content, note, sheet: sheetName });
    }
  }
  return out;
}

/** 헤더 칸의 날짜: 엑셀 날짜 값 또는 '10/17(토)' 형식. */
function asDate(v: Cell, y: number): DateStr | null {
  if (isExcelDate(v)) return v.timeOnly ? null : makeDate(v.y, v.m, v.d);
  const m = MD.exec(cell(v));
  return m ? makeDate(y, +m[1], +m[2]) : null;
}

/** '휴일근무 관련' 표: 날짜 칸에 'o' -> 그날 휴일근무, 작업내용(병합 가능)은 근무지. */
export function parseHolidayTables(raw: Grid, day: DateStr, sheetName = ""): Leave[] {
  const out: Leave[] = [];
  const n = raw.length;
  let i = 0;
  while (i < n) {
    const head = raw[i].map((v) => key(cell(v)));
    if (!head.includes("성명")) {
      i++;
      continue;
    }
    const nameC = head.indexOf("성명");
    const dateCols = new Map<number, DateStr>();
    let start = i + 1;
    for (const r of [i, i + 1]) {
      if (r >= n) continue;
      raw[r].forEach((v, c) => {
        const d = c > nameC ? asDate(v, year(day)) : null;
        if (d) dateCols.set(c, d);
      });
      if (dateCols.size && r === i + 1) start = i + 2;
      if (dateCols.size) break;
    }
    const contentIdx = head.findIndex(
      (h, c) => c > nameC && !dateCols.has(c) && (h.includes("작업내용") || h === "비고" || h.startsWith("내용")));
    const contentC = contentIdx >= 0 ? contentIdx : null;
    if (!dateCols.size) { // 근태현황·휴가일정 표 등 날짜 칸이 없는 표
      i++;
      continue;
    }
    const deptC = idx(head, "부서");
    const numC = deptC ? deptC - 1 : null;
    let prevName = "", prevContent = "", prevDept = "";
    let j = start;
    for (; j < n; j++) {
      const cells = raw[j].map((v) => cell(v));
      if (!cells.some(Boolean)) continue;
      const num = numC !== null ? cells[numC] : "";
      let name = cells[nameC];
      if (key(name) === "성명" || key(name) === "이름" || (num && !NUM.test(num))) break;
      name = name || prevName;
      const content = (contentC !== null ? cells[contentC] : "") || prevContent;
      const dept = (deptC !== null ? cells[deptC] : "") || prevDept;
      [prevName, prevContent, prevDept] = [name, content, dept];
      for (const [c, d] of dateCols) {
        if (c < cells.length && LEAVE_FLAGS.has(cells[c].toLowerCase()) && name) {
          out.push({ day: d, name, dept, rank: "", type: "휴일근무", content, note: "", sheet: sheetName });
        }
      }
    }
    i = j;
  }
  return out;
}

/** (명단, 근태기록, 건너뛴 시트 이름) */
export function parseHiworks(sheets: Sheets): { roster: RosterRow[]; leaves: Leave[]; skipped: string[] } {
  let roster: RosterRow[] = [];
  const records: Leave[] = [];
  const skipped: string[] = [];
  for (const [name, raw] of sheets) {
    if (name.includes("명단")) {
      roster = parseRoster(raw);
      continue;
    }
    const day = sheetDate(name);
    if (day === null || !raw.length) {
      skipped.push(name);
      continue;
    }
    records.push(...parseDailySheet(raw, day, name), ...parseHolidayTables(raw, day, name));
  }
  return { roster, leaves: sortLeaves(dedupeLeaves(records)), skipped };
}

export function loadHiworksFile(data: Uint8Array, filename: string) {
  return parseHiworks(readRaw(data, filename));
}
