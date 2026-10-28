/** 일일 근태현황 보고서: 사이트에서 등록·수정·삭제하는 하루치 보고서와 그 변환·표 그리기.
 *
 * 섹션
 * - 근태     : 부서 | 직급 | 성명 | 유형(연차·반차·반반차·외출·공가·출장·교육, 여러 개) | 제목(목적지/사유) | 상세(시간 등) | 비고
 * - 도제     : 일학습병행(도제) 관련 — 성명 | 값(출근 완료) | 비고(비고란)
 * - 휴가일정 : 성명 | 값(출근예정) | 비고(휴가 일정)
 * - 휴일근무 : 성명 | 유형(근무한 휴일 날짜들, 'YYYY-MM-DD,YYYY-MM-DD') | 제목(작업내용/근무지) | 비고
 */
import { dedupeLeaves, type Leave, sortLeaves } from "./leave";
import { addDays, type DateStr, dayLabel, isDateStr, weekday } from "./time";

export const SECTIONS = ["근태", "도제", "휴가일정", "휴일근무"] as const;
export type Section = (typeof SECTIONS)[number];
export const LEAVE_TYPES = ["연차", "반차", "반반차", "외출", "공가", "출장", "교육", "휴일근무", "연장근무"];
const FONT = "'Paperlogy','Malgun Gothic','맑은 고딕',sans-serif";

export interface ReportRow {
  section: string;
  ord: number;
  dept: string;
  rank: string;
  name: string;
  types: string;
  title: string;
  detail: string;
  value: string;
  note: string;
  day?: DateStr;
}

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
const esc = escapeHtml;

export function splitReportTypes(v: string | string[] | null | undefined): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

// ---------------------------------------------------------------- 근태 판정용 변환
/** 보고서 행 -> 하이웍스 근태와 같은 형식 (근태 판정·직원별 시트에 쓰임). */
export function reportToLeaves(rows: ReportRow[]): Leave[] {
  const out: Leave[] = [];
  for (const r of rows) {
    const content = [r.title, r.detail].filter(Boolean).join("\n");
    const base = { name: r.name, dept: r.dept, rank: r.rank, content, note: r.note ?? "", sheet: "사이트" };
    if (r.section === "근태") {
      for (const t of splitReportTypes(r.types)) out.push({ ...base, day: r.day!, type: t });
    } else if (r.section === "휴일근무") {
      for (const t of splitReportTypes(r.types)) if (isDateStr(t)) out.push({ ...base, day: t, type: "휴일근무" });
    }
  }
  return out;
}

/** 근태현황 파일 + 사이트 보고서. 사이트에 보고서가 있는 날은 사이트 내용이 우선한다. */
export function mergeLeaves(fileLeaves: Leave[], rows: ReportRow[], reportDays: DateStr[]): Leave[] {
  const site = rows.length ? reportToLeaves(rows) : [];
  if (!fileLeaves.length) return site;
  const days = new Set(reportDays);
  const holKeys = new Set(site.filter((l) => l.type === "휴일근무").map((l) => `${l.day}|${l.name}`));
  const keep = fileLeaves.filter((l) => !(days.has(l.day) && l.type !== "휴일근무"))
    .filter((l) => !(l.type === "휴일근무" && holKeys.has(`${l.day}|${l.name}`)));
  return sortLeaves(dedupeLeaves([...keep, ...site], "last"));
}

// ---------------------------------------------------------------- 보고서 미리 채우기
/** 근태현황 파일에 이미 적힌 그날 근태를 보고서 '근태' 섹션 행으로. */
export function prefillFromLeaves(leaves: Leave[], day: DateStr): ReportRow[] {
  const groups = new Map<string, Leave[]>();
  for (const l of leaves) {
    if (l.day !== day) continue;
    if (!groups.has(l.name)) groups.set(l.name, []);
    groups.get(l.name)!.push(l);
  }
  const rows: ReportRow[] = [];
  for (const [name, g] of groups) {
    const types = [...new Set(g.map((l) => l.type))].filter((t) => LEAVE_TYPES.includes(t) || t === "외근");
    if (!types.length) continue;
    const lines = String(g[0].content).split("\n");
    rows.push({
      section: "근태", ord: 0, dept: g[0].dept, rank: g[0].rank, name, types: types.join(","), title: lines[0],
      detail: lines.slice(1).join(" "), value: "", note: g[0].note,
    });
  }
  return rows;
}

/** 이름 -> 최근 직급 (근태현황 파일·보고서에서). */
export function rankMap(leaves: Leave[], rows: ReportRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  const byDay = <T extends { day?: DateStr }>(xs: T[]) =>
    [...xs].sort((a, b) => ((a.day ?? "") < (b.day ?? "") ? -1 : (a.day ?? "") > (b.day ?? "") ? 1 : 0));
  for (const l of byDay(leaves)) if (l.rank.trim()) out[l.name] = l.rank;
  for (const r of byDay(rows)) if (r.rank.trim()) out[r.name] = r.rank;
  return out;
}

/** 보고일 직전 주말(토·일). */
export function weekendBefore(day: DateStr): [DateStr, DateStr] {
  let d = addDays(day, -1);
  while (weekday(d) < 5) d = addDays(d, -1);
  const sun = weekday(d) === 6 ? d : addDays(d, 1);
  return [addDays(sun, -1), sun];
}

// ---------------------------------------------------------------- 보고서 그리기 (대시보드 스타일, 메일에도 쓰도록 인라인 스타일)
// 메일 프로그램은 CSS grid·외부 스타일을 무시하는 경우가 많아 표(table)와 인라인 스타일만 쓴다.
const INK = "#1f2937", SUB = "#6b7280", LINE = "#eef0f4", BG = "#f3f5f9";
const TXT = `font-family:${FONT};color:${INK};`;
const CELL = `${TXT}font-size:14px;padding:10px 12px;border-bottom:1px solid ${LINE};text-align:left;vertical-align:top;`;
const HEAD = `${TXT}font-size:13px;font-weight:700;color:#374151;background:${BG};padding:9px 12px;text-align:left;`
  + "border-bottom:1px solid #e5e7eb;white-space:nowrap;";
const CARD = "background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;";

// 근태 종류별 배지 색 (글자색, 배경색)
const BADGE: Record<string, [string, string]> = {
  연차: ["#1f8a3b", "#e3f4e8"], 반차: ["#0f766e", "#dcf3f0"], 반반차: ["#0f766e", "#dcf3f0"],
  외출: ["#c2410c", "#fdebdc"], 공가: ["#2563c9", "#e3ecfb"], 출장: ["#6d28d9", "#ede5fb"],
  교육: ["#4338ca", "#e6e7fb"], 외근: ["#6d28d9", "#ede5fb"], 휴일근무: ["#b45309", "#fdf0d5"], 연장근무: ["#be123c", "#fde4ea"],
};
const SECTION_TITLES: Record<Section, string> = {
  근태: "근태 현황", 도제: "일학습병행(도제)", 휴가일정: "휴가 일정", 휴일근무: "휴일 근무",
};
// 요약 카드: (라벨, 색, 포함 유형)
const SUMMARY_CARDS: [string, string, Set<string>][] = [
  ["휴가", "#1f8a3b", new Set(["연차", "반차", "반반차", "공가"])],
  ["외출", "#e07b00", new Set(["외출"])],
  ["출장·교육", "#6d28d9", new Set(["출장", "교육", "외근"])],
  ["휴일·연장", "#b45309", new Set(["휴일근무", "연장근무"])],
];

export function badge(t: string): string {
  const [fg, bg] = BADGE[t] ?? ["#374151", "#eef0f4"];
  return `<span style="display:inline-block;${TXT}font-size:12px;font-weight:700;color:${fg};background:${bg};`
    + `border-radius:10px;padding:2px 9px;margin:0 4px 2px 0;white-space:nowrap">${esc(t)}</span>`;
}

function twoLine(title: string, detail: string): string {
  const t = title ? `<div style="${TXT}font-weight:700">${esc(title)}</div>` : "";
  const d = detail ? `<div style="${TXT}font-size:13px;color:${SUB};margin-top:2px">${esc(detail)}</div>` : "";
  return t + d || `<span style="color:${SUB}">-</span>`;
}

function person(r: ReportRow): string {
  const rank = r.rank ? ` <span style="${TXT}font-size:12px;color:${SUB}">${esc(r.rank)}</span>` : "";
  return `<span style="${TXT}font-weight:700">${esc(r.name)}</span>${rank}`;
}

function table(heads: [string, string][], bodyRows: string[][]): string {
  const head = heads.map(([h, w]) => `<th style="${HEAD}${w ? `width:${w};` : ""}">${h}</th>`).join("");
  const body = bodyRows.map((cells) => `<tr>${cells.map((c) => `<td style="${CELL}">${c}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">`
    + `<tr>${head}</tr>${body}</table>`;
}

function section(title: string, count: number, inner: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;${CARD}margin-top:14px">`
    + `<tr><td style="padding:16px 18px 6px">`
    + `<span style="${TXT}font-size:16px;font-weight:800">${title}</span>`
    + `<span style="${TXT}font-size:13px;color:${SUB};margin-left:6px">${count}명</span></td></tr>`
    + `<tr><td style="padding:4px 18px 16px">${inner}</td></tr></table>`;
}

/** 요약 카드 숫자 (사람 수). 휴일·연장은 근태 목록 + 휴일근무 표. */
export function reportCounts(rows: ReportRow[]): Record<string, number> {
  const att = rows.filter((r) => r.section === "근태");
  const out: Record<string, number> = {};
  for (const [label, , types] of SUMMARY_CARDS) {
    const names = new Set(att.filter((r) => splitReportTypes(r.types).some((t) => types.has(t))).map((r) => r.name));
    if (label === "휴일·연장") rows.filter((r) => r.section === "휴일근무").forEach((r) => names.add(r.name));
    out[label] = names.size;
  }
  return out;
}

function clean(rows: ReportRow[]): ReportRow[] {
  return rows.map((r) => ({
    section: r.section ?? "", ord: r.ord ?? 0, dept: String(r.dept ?? ""), rank: String(r.rank ?? ""),
    name: String(r.name ?? ""), types: r.types ?? "", title: r.title ?? "", detail: r.detail ?? "",
    value: r.value ?? "", note: r.note ?? "", day: r.day,
  }));
}

/** 일일 근태현황 보고서 HTML (사이트 미리보기·이미지 저장·메일 본문 공용). */
export function renderReportHtml(day: DateStr, input: ReportRow[], withTitle = true): string {
  const rows = clean(input);
  const parts = [`<div style="background:${BG};padding:18px;${TXT}max-width:920px">`];
  if (withTitle) {
    parts.push(`<div style="${TXT}font-size:22px;font-weight:800;letter-spacing:-0.02em">`
      + `${dayLabel(day, true)} 근태현황</div>`
      + `<div style="${TXT}font-size:13px;color:${SUB};margin:4px 0 14px">근태관리통합시스템</div>`);
  }

  // 요약 카드 (메일에서도 나란히 보이도록 표로)
  const counts = reportCounts(rows);
  const cards = SUMMARY_CARDS.map(([label, color]) =>
    `<td style="padding:0 6px;width:25%">`
    + `<div style="${CARD}border-top:4px solid ${color};text-align:center;padding:14px 6px 12px">`
    + `<div style="${TXT}font-size:13px;font-weight:700;color:${color}">${label}</div>`
    + `<div style="${TXT}font-size:30px;font-weight:800;color:${color};line-height:1.25">${counts[label]}</div>`
    + `<div style="${TXT}font-size:11px;color:${SUB}">명</div></div></td>`).join("");
  parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 -6px">`
    + `<tr>${cards}</tr></table>`);

  // 근태 현황 (항상 표시)
  const att = rows.filter((r) => r.section === "근태");
  const inner = att.length
    ? table([["부서", "80px"], ["성명", "110px"], ["근태", "130px"], ["근무지·사유", ""], ["비고", "110px"]],
      att.map((r) => [esc(r.dept), person(r), splitReportTypes(r.types).map(badge).join(""), twoLine(r.title, r.detail),
        esc(r.note)]))
    : `<div style="${TXT}color:${SUB};padding:6px 0">오늘 근태 특이사항이 없습니다.</div>`;
  parts.push(section(SECTION_TITLES.근태, att.length, inner));

  // 휴가 일정
  let sub = rows.filter((r) => r.section === "휴가일정");
  if (sub.length) {
    parts.push(section(SECTION_TITLES.휴가일정, sub.length,
      table([["부서", "80px"], ["성명", "110px"], ["출근 예정", "130px"], ["휴가 일정", ""]],
        sub.map((r) => [esc(r.dept), person(r), `<span style="${TXT}font-weight:800;color:#d42a2a">${esc(r.value)}</span>`,
          esc(r.note)]))));
  }

  // 휴일 근무
  sub = rows.filter((r) => r.section === "휴일근무");
  if (sub.length) {
    const daysBadges = (v: string) =>
      splitReportTypes(v).filter(isDateStr).sort().map((d) => badge(dayLabel(d))).join("") || "-";
    parts.push(section(SECTION_TITLES.휴일근무, sub.length,
      table([["부서", "80px"], ["성명", "110px"], ["근무일", "150px"], ["작업내용·근무지", ""], ["비고", "120px"]],
        sub.map((r) => [esc(r.dept), person(r), daysBadges(r.types), twoLine(r.title, ""), esc(r.note)]))));
  }

  // 일학습병행(도제)
  sub = rows.filter((r) => r.section === "도제");
  if (sub.length) {
    parts.push(section(SECTION_TITLES.도제, sub.length,
      table([["부서", "80px"], ["성명", "110px"], ["출근 완료", "130px"], ["비고", ""]],
        sub.map((r) => [esc(r.dept), person(r), esc(r.value) || "-", esc(r.note)]))));
  }
  parts.push("</div>");
  return parts.join("");
}

/** 메일 제목·미리보기용 한 줄 요약: '연차 1, 반차 1, 출장 3' */
export function summaryText(rows: ReportRow[]): string {
  const counts: Record<string, number> = {};
  for (const r of rows.filter((x) => x.section === "근태")) {
    for (const t of splitReportTypes(r.types)) counts[t] = (counts[t] ?? 0) + 1;
  }
  return [...LEAVE_TYPES, "외근"].filter((t) => t in counts).map((t) => `${t} ${counts[t]}`).join(", ") || "특이사항 없음";
}
