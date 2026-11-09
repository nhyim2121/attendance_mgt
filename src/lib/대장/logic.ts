/** 업무 대장 공통 계산 (화면·서버·시험이 같이 쓴다): 입력값 정리, 끝난 줄, 만기 알림, 엑셀 칸 맞추기 */
import { type Cell, type Grid, isExcelDate } from "../excel";
import type { Book, Field } from "./books";

export type Data = Record<string, string>;
export interface Row { id: number; book: string; day: string | null; data: Data; batch: string }

const pad = (n: number) => String(n).padStart(2, "0");
const DAY_MS = 86400000;
const dms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const daysTo = (today: string, d: string) => Math.round((dms(d) - dms(today)) / DAY_MS);

/** 여러 모양의 날짜 글자 → YYYY-MM-DD */
export function toDay(c: Cell | string | undefined): string | null {
  if (c === null || c === undefined) return null;
  if (isExcelDate(c)) return `${c.y}-${pad(c.m)}-${pad(c.d)}`;
  if (typeof c === "number" && c > 30000 && c < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * DAY_MS);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const m = String(c).trim().match(/^(\d{2}|\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!m) return null;
  const y = m[1].length === 2 ? 2000 + +m[1] : +m[1], mo = +m[2], d = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

function toTime(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  return m ? `${pad(+m[1])}:${pad(+(m[2] ?? 0))}` : s.trim();
}
const toNum = (s: string) => { const t = s.replace(/[^\d.\-]/g, ""); return t && !isNaN(+t) ? String(+t) : ""; };

/** 칸 하나 값 정리 (틀리면 오류 글) */
export function cleanValue(f: Field, raw: string): { v: string; error?: string } {
  const s = raw.trim();
  if (!s) return { v: "", error: f.req ? `${f.label}을(를) 적어 주세요.` : undefined };
  switch (f.type) {
    case "date": { const d = toDay(s); return d ? { v: d } : { v: "", error: `${f.label} 날짜를 확인해 주세요.` }; }
    case "number": case "money": { const n = toNum(s); return n ? { v: n } : { v: "", error: `${f.label}에는 숫자만 적어 주세요.` }; }
    case "time": return { v: toTime(s) };
    case "select": return { v: f.options?.includes(s) ? s : s };
    default: return { v: s };
  }
}

/** 입력 전체 정리 + 계산 칸 + 기준 날짜 */
export function cleanData(book: Book, raw: Data): { data: Data; day: string | null; error?: string } {
  const data: Data = {};
  for (const f of book.fields) {
    const r = cleanValue(f, raw[f.k] ?? "");
    if (r.error) return { data, day: null, error: r.error };
    if (r.v) data[f.k] = r.v;
  }
  if (book.calc && data[book.calc.from] && data[book.calc.to] && !raw[book.calc.k]?.trim()) {
    const v = +data[book.calc.to] - +data[book.calc.from];
    if (v >= 0) data[book.calc.k] = String(v);
  }
  return { data, day: data[book.day] ?? null };
}

export const isClosed = (book: Book, d: Data) => !!book.closed && book.closed.values.includes(d[book.closed.k] ?? "");

export interface Alert { field: string; label: string; day: string; left: number; level: "late" | "soon" | "near" }
/** 알림 칸 중 기한이 n일 안으로 들어온 것 (끝난 줄은 없음) */
export function alertsOf(book: Book, d: Data, today: string): Alert[] {
  if (isClosed(book, d)) return [];
  const out: Alert[] = [];
  for (const f of book.fields) {
    if (!f.alert || !d[f.k]) continue;
    const left = daysTo(today, d[f.k]);
    if (left <= f.alert) out.push({ field: f.k, label: f.label, day: d[f.k], left, level: left < 0 ? "late" : left <= Math.min(7, f.alert) ? "soon" : "near" });
  }
  return out;
}

/** 이 줄을 부르는 이름 */
export const rowName = (book: Book, d: Data) => d[book.title1] || d[book.fields.find((f) => f.req)?.k ?? ""] || "(이름 없음)";

// ---------------------------------------------------------------- 예전 엑셀 가져오기
const norm = (c: Cell) => (c === null || c === undefined || isExcelDate(c) ? "" : String(c)).replace(/[\s()·._\-/]/g, "").toLowerCase();
const cellText = (c: Cell) => (c === null || c === undefined ? "" : isExcelDate(c) ? `${c.y}-${pad(c.m)}-${pad(c.d)}` : String(c).trim());

/** 머리글 줄을 찾아 칸 이름(label·aliases)으로 맞춘 줄들 */
export function parseGrid(book: Book, grid: Grid): { rows: Data[]; matched: string[] } {
  const names = book.fields.map((f) => ({ f, keys: [f.label, ...(f.aliases ?? [])].map((x) => norm(x)) }));
  let head = -1, cols = new Map<string, number>();
  for (let r = 0; r < Math.min(20, grid.length); r++) {
    const found = new Map<string, number>();
    (grid[r] ?? []).forEach((c, i) => {
      const h = norm(c);
      if (!h) return;
      const hit = names.find((n) => !found.has(n.f.k) && n.keys.includes(h))
        ?? names.find((n) => !found.has(n.f.k) && n.keys.some((k) => k.length >= 2 && (h.includes(k) || k.includes(h)) && h.length >= 2));
      if (hit) found.set(hit.f.k, i);
    });
    if (found.size >= 2 && found.size > cols.size) { head = r; cols = found; }
  }
  if (head < 0) return { rows: [], matched: [] };
  const rows: Data[] = [];
  for (const line of grid.slice(head + 1)) {
    if (!line) continue;
    const d: Data = {};
    for (const [k, i] of cols) {
      const f = book.fields.find((x) => x.k === k)!;
      const c = line[i] ?? null;
      const v = f.type === "date" ? toDay(c) ?? "" : cellText(c);
      if (v) d[k] = v;
    }
    if (Object.keys(d).length) rows.push(d);
  }
  return { rows, matched: book.fields.filter((f) => cols.has(f.k)).map((f) => f.label) };
}

// ---------------------------------------------------------------- 화면·엑셀 공통 거르기
export type Sp = Record<string, string | string[] | undefined>;
const one = (v: Sp[string]) => (typeof v === "string" ? v : "");
export function filterRows(book: Book, rows: Row[], sp: Sp) {
  const y = one(sp.y), q = one(sp.q).trim().toLowerCase(), showClosed = one(sp.closed) === "1";
  const fl = (book.filters ?? []).map((k) => [k, one(sp[`fl_${k}`])] as const).filter(([, v]) => v);
  return rows.filter((r) => (!y || (r.day ?? "").startsWith(y)) && (showClosed || !isClosed(book, r.data))
    && fl.every(([k, v]) => r.data[k] === v)
    && (!q || Object.values(r.data).some((s) => s.toLowerCase().includes(q))));
}

