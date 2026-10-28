/** 캡스 엑셀/CSV 읽기, 헤더 행 찾기, 열 매핑, 표준 형식으로 정리. */
import { COLUMN_ALIASES, FIELDS, type Field } from "./config";
import { type Cell, type Grid, isExcelDate, readRaw, type Sheets } from "./excel";
import { type DateStr, makeDate, type Ts, ts, tsDate, weekdayKr } from "./time";

/** 표준 출입기록 한 건 */
export interface CapsRecord {
  ts: Ts;
  empId: string;
  name: string;
  dept: string;
  door: string;
  mode: string;
  auth: string;
  workType: string;
  place: string;
  note: string;
  emp: string; // 직원 표시 이름 (동명이인은 '이름(사번)')
  day: DateStr;
  wd: string; // 요일
}

export type RawRecord = Omit<CapsRecord, "emp" | "day" | "wd">;
export type Mapping = Record<Field, string | null>;

export interface Table {
  columns: string[];
  rows: Cell[][];
}

// ---------------------------------------------------------------- 값 판별
export function isNa(v: Cell | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return !v.trim() || v.trim().toLowerCase() === "nan";
  if (typeof v === "number") return Number.isNaN(v);
  return false;
}

/** 칸 값을 글자로 (엑셀이 사번 1001을 1001.0으로 읽는 경우도 '1001') */
export function toText(v: Cell | undefined): string {
  if (isNa(v)) return "";
  if (isExcelDate(v)) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.y}-${p(v.m)}-${p(v.d)} ${p(v.H)}:${p(v.M)}:${p(v.S)}`;
  }
  if (typeof v === "boolean") return v ? "True" : "False";
  return String(v).trim();
}

// ---------------------------------------------------------------- 열 이름 매칭
function norm(value: unknown): string {
  return String(value).replace(/\s+/g, "").toLowerCase();
}

function hasKorean(text: string): boolean {
  return /[가-힣]/.test(text);
}

function matchField(header: Cell): Field | null {
  const h = norm(toText(header));
  for (const f of FIELDS) if (COLUMN_ALIASES[f].some((a) => h === norm(a))) return f;
  for (const f of FIELDS) if (COLUMN_ALIASES[f].some((a) => hasKorean(a) && h.includes(norm(a)))) return f;
  return null;
}

/** 제목/조회조건 줄을 건너뛰고 실제 헤더 행 번호를 찾는다. */
export function detectHeaderRow(raw: Grid, maxScan = 30): number {
  let bestRow = 0, bestScore = 0;
  for (let i = 0; i < Math.min(maxScan, raw.length); i++) {
    const score = raw[i].filter((c) => !isNa(c) && matchField(c) !== null).length;
    if (score > bestScore) [bestRow, bestScore] = [i, score];
  }
  return bestScore >= 2 ? bestRow : 0;
}

/** headerRow 행을 열 이름으로 쓰고 그 아래를 데이터로 만든다 (빈 행·빈 열 제거). */
export function applyHeader(raw: Grid, headerRow: number): Table {
  const width = Math.max(0, ...raw.map((r) => r.length));
  const head = raw[headerRow] ?? [];
  const seen = new Map<string, number>();
  const columns: string[] = [];
  for (let i = 0; i < width; i++) {
    const t = toText(head[i]);
    let name = t ? t.replace(/\s+/g, " ") : `열${i + 1}`;
    if (seen.has(name)) {
      seen.set(name, seen.get(name)! + 1);
      name = `${name}_${seen.get(name)}`;
    } else seen.set(name, 0);
    columns.push(name);
  }
  let rows = raw.slice(headerRow + 1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null));
  rows = rows.filter((r) => r.some((c) => c !== null));
  const keep = columns.map((_, i) => rows.some((r) => r[i] !== null));
  return {
    columns: columns.filter((_, i) => keep[i]),
    rows: rows.map((r) => r.filter((_, i) => keep[i])),
  };
}

/** 열 이름을 보고 표준 필드에 맞는 열을 추측한다 (별칭 순서가 우선순위). */
export function guessMapping(columns: string[]): Mapping {
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, null])) as Mapping;
  const used = new Set<string>();
  for (const exact of [true, false]) {
    for (const f of FIELDS) {
      if (mapping[f] !== null) continue;
      for (const alias of COLUMN_ALIASES[f]) {
        const a = norm(alias);
        if (!exact && !hasKorean(alias)) continue;
        const hit = columns.find((c) => !used.has(c) && (exact ? norm(c) === a : norm(c).includes(a)));
        if (hit !== undefined) {
          mapping[f] = hit;
          used.add(hit);
          break;
        }
      }
    }
  }
  return mapping;
}

function isValidMapping(m: Mapping): boolean {
  const hasTime = !!m.datetime || (!!m.date && !!m.time);
  return hasTime && !!(m.name || m.emp_id);
}

/** 여러 시트 중 출입 원본 기록 시트(행이 가장 많은 유효 시트)와 헤더 행을 찾는다.
 *
 * 캡스 월별 파일은 원본 시트 이름이 'Sheet1', '3월 근태현황', '9월 전체' 등으로 제각각이고,
 * 직원별로 정리한 시트가 함께 들어 있으므로 행 수가 가장 많은 시트를 원본으로 본다.
 */
export function findRecordSheet(sheets: Sheets): [string, number] | null {
  let best: [string, number] | null = null;
  let bestRows = -1;
  for (const [name, raw] of sheets) {
    if (!raw.length) continue;
    const hr = detectHeaderRow(raw);
    const table = applyHeader(raw, hr);
    if (!isValidMapping(guessMapping(table.columns))) continue;
    if (table.rows.length > bestRows) [best, bestRows] = [[name, hr], table.rows.length];
  }
  return best;
}

// ---------------------------------------------------------------- 값 변환
/** 여러 형태의 시간 값을 자정 이후 초로 바꾼다. */
export function toSeconds(v: Cell): number | null {
  if (isNa(v)) return null;
  if (isExcelDate(v)) return v.H * 3600 + v.M * 60 + v.S;
  let s: string;
  if (typeof v === "number") {
    if (v >= 0 && v < 1) return Math.round(v * 86400) % 86400; // 엑셀 시간 서식(하루의 비율)
    s = String(Math.trunc(v));
  } else s = String(v).trim();

  let h: number, mi: number, se: number;
  const m = /^(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?$/i.exec(s);
  if (m) {
    const ampm = (m[1] || m[5] || "").toUpperCase();
    [h, mi, se] = [+m[2], +m[3], +(m[4] ?? 0)];
    if ((ampm === "오후" || ampm === "PM") && h < 12) h += 12;
    if ((ampm === "오전" || ampm === "AM") && h === 12) h = 0;
  } else {
    let digits = s.replace(/\D/g, "");
    if (digits.length === 14) digits = digits.slice(8); // YYYYMMDDHHMMSS
    if (digits.length === 3 || digits.length === 4) digits = digits.padStart(4, "0") + "00";
    else if (digits.length === 5 || digits.length === 6) digits = digits.padStart(6, "0");
    else return null;
    [h, mi, se] = [+digits.slice(0, 2), +digits.slice(2, 4), +digits.slice(4, 6)];
  }
  if (h > 23 || mi > 59 || se > 59) return null;
  return h * 3600 + mi * 60 + se;
}

/** 여러 형태의 날짜 값을 'YYYY-MM-DD'로 바꾼다. */
export function toDate(v: Cell): DateStr | null {
  if (isNa(v)) return null;
  if (isExcelDate(v)) return v.timeOnly ? null : makeDate(v.y, v.m, v.d);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return tsDate(Date.UTC(1899, 11, 30) + Math.trunc(v) * 86_400_000); // 엑셀 일련번호
  }
  const s = String(v).trim();
  const parts = s.split(/[-./년월일\s]+/).filter(Boolean);
  if (parts.length >= 3 && parts.slice(0, 3).every((p) => /^\d+$/.test(p))) {
    let [y, mo, d] = parts.slice(0, 3).map(Number);
    if (y < 100) y += 2000;
    return makeDate(y, mo, d);
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 8) return makeDate(+digits.slice(0, 4), +digits.slice(4, 6), +digits.slice(6, 8));
  if (digits.length === 6) {
    const yy = +digits.slice(0, 2);
    return makeDate(yy < 69 ? 2000 + yy : 1900 + yy, +digits.slice(2, 4), +digits.slice(4, 6));
  }
  return null;
}

/** 날짜와 시간이 한 열에 있는 값 */
export function toTimestamp(v: Cell): Ts | null {
  if (isNa(v)) return null;
  if (isExcelDate(v)) {
    const d = toDate(v);
    return d === null ? null : ts(d, v.H * 3600 + v.M * 60 + v.S);
  }
  const s = String(v).trim();
  let d: DateStr | null, secs: number | null;
  if (/^\d{14}$/.test(s)) {
    [d, secs] = [toDate(s.slice(0, 8)), toSeconds(s.slice(8))];
  } else {
    const m = /^(\S+)\s+(.*)$/.exec(s);
    d = toDate(m ? m[1] : s);
    secs = m ? toSeconds(m[2]) : 0;
  }
  if (d === null || secs === null) return null;
  return ts(d, secs);
}

// ---------------------------------------------------------------- 정규화
/** 매핑을 적용해 표준 기록을 만든다. 시각·이름이 없는 행은 버리고 그 수를 센다. */
export function normalize(table: Table, mapping: Mapping): { records: CapsRecord[]; dropped: number } {
  const col = (f: Field) => (mapping[f] ? table.columns.indexOf(mapping[f]!) : -1);
  const idx = Object.fromEntries(FIELDS.map((f) => [f, col(f)])) as Record<Field, number>;
  const useDatetime = idx.datetime >= 0;
  if (!useDatetime && !(idx.date >= 0 && idx.time >= 0)) {
    throw new Error("'출입일시' 열 또는 '일자'+'시간' 열을 지정해야 합니다.");
  }
  if (idx.name < 0 && idx.emp_id < 0) throw new Error("'이름' 또는 '사번' 열 중 하나는 지정해야 합니다.");

  const text = (row: Cell[], f: Field) => (idx[f] >= 0 ? toText(row[idx[f]]) : "");
  const out: RawRecord[] = [];
  let dropped = 0;
  for (const row of table.rows) {
    let t: Ts | null;
    if (useDatetime) t = toTimestamp(row[idx.datetime]);
    else {
      const d = toDate(row[idx.date]);
      const s = toSeconds(row[idx.time]);
      t = d !== null && s !== null ? ts(d, s) : null;
    }
    const r: RawRecord = {
      ts: t ?? 0, empId: text(row, "emp_id"), name: text(row, "name"), dept: text(row, "dept"),
      door: text(row, "door"), mode: text(row, "mode"), auth: text(row, "auth"), workType: text(row, "work_type"),
      place: text(row, "place"), note: text(row, "note"),
    };
    if (t === null || (!r.name && !r.empId)) dropped++;
    else out.push(r);
  }
  return { records: finalizeRecords(out), dropped };
}

/** 기본 열로부터 직원·일자·요일을 만든다 (저장소에서 읽을 때도 사용). */
export function finalizeRecords(raw: RawRecord[]): CapsRecord[] {
  const out = raw.map((r) => {
    // 동명이인을 구분하기 위해 이름과 사번이 모두 있으면 "이름(사번)"으로 표시
    const emp = r.name && r.empId ? `${r.name}(${r.empId})` : r.name || r.empId;
    const day = tsDate(r.ts);
    return { ...r, emp, day, wd: weekdayKr(day) };
  });
  return out.sort((a, b) => a.ts - b.ts || (a.emp < b.emp ? -1 : a.emp > b.emp ? 1 : 0));
}

export interface LoadInfo {
  file: string;
  sheet: string;
  count: number;
  dropped: number;
  period: string;
  mapping: Partial<Record<Field, string>>;
}

/** 캡스 파일 하나를 읽어 표준 출입기록과 처리 정보를 돌려준다. */
export function loadCapsFile(data: Uint8Array, filename: string): { records: CapsRecord[]; info: LoadInfo } {
  const sheets = readRaw(data, filename);
  const found = findRecordSheet(sheets);
  if (!found) throw new Error(`${filename}: 출입기록 시트를 찾지 못했습니다 (발생일자·발생시각·이름 열 필요).`);
  const [sheet, headerRow] = found;
  const table = applyHeader(sheets.find(([n]) => n === sheet)![1], headerRow);
  const mapping = guessMapping(table.columns);
  const { records, dropped } = normalize(table, mapping);
  const days = records.map((r) => r.day);
  return {
    records,
    info: {
      file: filename, sheet, count: records.length, dropped,
      period: records.length ? `${days[0]} ~ ${days.reduce((a, b) => (b > a ? b : a))}` : "-",
      mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)) as Partial<Record<Field, string>>,
    },
  };
}

/** 여러 달 파일을 합치고, 같은 기록이 두 파일에 있으면 하나만 남긴다. */
export function combineRecords(frames: CapsRecord[][]): CapsRecord[] {
  const seen = new Set<string>();
  const out: CapsRecord[] = [];
  for (const r of frames.flat()) {
    const k = `${r.ts}|${r.emp}|${r.mode}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return finalizeRecords(out);
}
