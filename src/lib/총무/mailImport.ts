/** 예전에 엑셀로 쓰던 문서 수발 대장을 읽어 대장 줄로 바꾼다.
 *  칸 순서는 회사마다 달라서 머리글 낱말(날짜·발신처·제목 …)로 칸을 찾는다. */
import { type Cell, type Grid, isExcelDate } from "../excel";

export interface ImportRow {
  dir: "수신" | "발신"; day: string; kind: string; party: string; title: string; refNo: string; route: string;
  status: string; due: string | null; note: string; replyOf: null; cost: number | null;
}
export interface ImportResult { rows: ImportRow[]; skipped: number; columns: string[] }

const norm = (c: Cell) => (c === null || c === undefined ? "" : isExcelDate(c) ? "" : String(c)).replace(/\s+/g, "");
const text = (c: Cell) => (c === null || c === undefined || isExcelDate(c) ? "" : String(c).trim());
const pad = (n: number) => String(n).padStart(2, "0");

/** 칸 값 → YYYY-MM-DD (못 읽으면 null) */
export function toDay(c: Cell): string | null {
  if (isExcelDate(c)) return `${c.y}-${pad(c.m)}-${pad(c.d)}`;
  if (typeof c === "number" && c > 30000 && c < 80000) { // 엑셀 날짜 일련번호
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = text(c);
  const m = s.match(/^(\d{2}|\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!m) return null;
  const y = m[1].length === 2 ? 2000 + +m[1] : +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function toKind(s: string): string {
  if (/공문/.test(s)) return "공문";
  if (/등기/.test(s)) return "등기";
  if (/팩스|fax/i.test(s)) return "팩스";
  if (/택배|퀵/.test(s)) return "택배";
  if (/메일|e-?mail/i.test(s)) return "이메일";
  if (/우편|우체국/.test(s)) return "우편";
  return s ? "기타" : "공문";
}

function toDir(s: string): "수신" | "발신" | null {
  if (/발신|발송|보냄|송부/.test(s)) return "발신";
  if (/수신|접수|받음|수령/.test(s)) return "수신";
  return null;
}

// 머리글 낱말 → 칸 (앞에 있는 규칙이 먼저)
const RULES: [key: string, re: RegExp][] = [
  ["day", /^(일자|날짜|년월일|접수일|접수일자|수신일|수신일자|발신일|발신일자|발송일|발송일자|수발신일|처리일자?)$/],
  ["dir", /^(구분|수발신|수\/발신|수·발신|수발신구분)$/],
  ["kind", /^(종류|유형|수단|발송방법|수발방법|문서종류)$/],
  ["from", /^(발신처|발신자|보낸곳|발신기관|보낸사람)$/],
  ["to", /^(수신처|수신자|받는곳|수신기관|받는사람|발송처)$/],
  ["party", /(상대|기관|업체|거래처|처명)/],
  ["title", /(제목|건명|문서명|내용)/],
  ["refNo", /(문서번호|등기번호|송장|운송장|접수번호|발송번호)/],
  ["route", /(전달|처리|담당|조치|배부)/],
  ["cost", /(요금|금액|비용|우편료)/],
  ["due", /(기한|마감|회신일)/],
  ["note", /(비고|메모)/],
];

export function parseLedger(grid: Grid, defaultDir: "수신" | "발신"): ImportResult {
  // 머리글 줄: 앞 15줄 중 날짜 칸이 있고 아는 칸이 가장 많은 줄
  let head = -1, cols = new Map<string, number>();
  for (let r = 0; r < Math.min(15, grid.length); r++) {
    const found = new Map<string, number>();
    (grid[r] ?? []).forEach((c, i) => {
      const h = norm(c);
      if (!h) return;
      const rule = RULES.find(([k, re]) => !found.has(k) && re.test(h));
      if (rule) found.set(rule[0], i);
    });
    if (found.has("day") && found.size >= 2 && found.size > cols.size) { head = r; cols = found; }
  }
  if (head < 0) return { rows: [], skipped: 0, columns: [] };

  const get = (row: Cell[], k: string) => (cols.has(k) ? row[cols.get(k)!] ?? null : null);
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const row of grid.slice(head + 1)) {
    if (!row || row.every((c) => text(c) === "" && !isExcelDate(c))) continue;
    const day = toDay(get(row, "day"));
    if (!day) { skipped++; continue; }
    const from = text(get(row, "from")), to = text(get(row, "to"));
    const dir = toDir(text(get(row, "dir"))) ?? (from && !to ? "수신" : to && !from ? "발신" : defaultDir);
    const party = text(get(row, "party")) || (dir === "수신" ? from || to : to || from);
    const costRaw = text(get(row, "cost")).replace(/[^\d]/g, "");
    rows.push({
      dir, day, kind: toKind(text(get(row, "kind"))), party, title: text(get(row, "title")), refNo: text(get(row, "refNo")),
      route: text(get(row, "route")), status: "완료", due: toDay(get(row, "due")), note: text(get(row, "note")),
      replyOf: null, cost: costRaw ? +costRaw : null,
    });
  }
  const names: Record<string, string> = {
    day: "날짜", dir: "수신/발신", kind: "종류", from: "발신처", to: "수신처", party: "상대처", title: "제목", refNo: "문서·등기번호",
    route: "전달·처리", cost: "요금", due: "기한", note: "메모",
  };
  return { rows, skipped, columns: [...cols.keys()].map((k) => names[k]) };
}
