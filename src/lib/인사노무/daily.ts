/** 일일 근태현황 보고서: 사이트에서 등록·수정·삭제하는 하루치 보고서와 그 변환·표 그리기.
 *
 * 섹션
 * - 근태     : 부서 | 직급 | 성명 | 유형(연차·반차·반반차·외출·공가·출장·교육, 여러 개) | 제목(목적지/사유) | 상세(시간 등) | 비고
 * - 도제     : 일학습병행(도제) 관련 — 성명 | 값(출근 완료) | 비고(비고란)
 * - 휴가일정 : 성명 | 값(출근예정) | 비고(휴가 일정)
 * - 휴일근무 : 성명 | 유형(근무한 휴일 날짜들, 'YYYY-MM-DD,YYYY-MM-DD') | 제목(작업내용/근무지) | 비고
 */
import { dedupeLeaves, type Leave, sortLeaves } from "./leave";
import { RANK_ORDER } from "./org";
import { addDays, type DateStr, dayLabel, isDateStr, makeDate, weekday } from "../time";

export const SECTIONS = ["근태", "도제", "휴가일정", "휴일근무"] as const;
export type Section = (typeof SECTIONS)[number];
export const LEAVE_TYPES = [
  "연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가", "출장", "교육", "휴일근무", "연장근무",
];
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
/** 휴일·연장 근무 탭의 연장근무 줄: section '휴일근무' + value '연장' 또는 '연장|~20:00' */
export const isOtRow = (r: Pick<ReportRow, "section" | "value">) => r.section === "휴일근무" && String(r.value ?? "").startsWith("연장");
export const otUntil = (r: Pick<ReportRow, "value">) => /~(\d{2}:\d{2})/.exec(String(r.value ?? ""))?.[1] ?? "";

/** 보고서 행 -> 하이웍스 근태와 같은 형식 (근태 판정·직원별 시트에 쓰임). */
export function reportToLeaves(rows: ReportRow[]): Leave[] {
  const out: Leave[] = [];
  for (const r of rows) {
    // 연장근무 신청 시각(value '~HH:MM')은 내용 끝에 '~20:00'으로 붙여 직원별 근태 퇴근 근무형태 '연장(20:00)'이 되게 한다
    const until = r.section === "근태" && splitReportTypes(r.types).includes("연장근무") ? parseAttValue(r.value).until : "";
    const content = [r.title, r.detail, until ? `~${until}` : ""].filter(Boolean).join("\n");
    const base = { name: r.name, dept: r.dept, rank: r.rank, content, note: r.note ?? "", sheet: "사이트" };
    if (r.section === "근태") {
      for (const t of splitReportTypes(r.types)) out.push({ ...base, day: r.day!, type: t });
    } else if (r.section === "휴일근무") {
      // 휴일·연장 근무 탭: value가 '연장…'이면 연장근무 (신청 시각 '~HH:MM'을 내용 끝에 붙여 퇴근 근무형태 연장(HH:MM)이 되게)
      const ot = isOtRow(r);
      const until = ot ? otUntil(r) : "";
      const c = until ? [content, `~${until}`].filter(Boolean).join("\n") : content;
      for (const t of splitReportTypes(r.types)) if (isDateStr(t)) out.push({ ...base, content: c, day: t, type: ot ? "연장근무" : "휴일근무" });
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
// 보고서 디자인 (2026-11-11 개편): 회사 남색 머리띠 + 한 줄 요약 + 구분선 위주의 깔끔한 표
const INK = "#1b2333", SUB = "#6b7486", LINE = "#e8ebf1", BG = "#f2f4f8", NAVY = "#0c3994", RED = "#e84340";
const TXT = `font-family:${FONT};color:${INK};`;
const CELL = `${TXT}font-size:14px;line-height:1.55;padding:11px 12px;border-bottom:1px solid ${LINE};text-align:left;vertical-align:top;`;
const HEAD = `${TXT}font-size:12px;font-weight:700;color:${SUB};background:#f7f8fb;padding:8px 12px;text-align:left;`
  + `border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};white-space:nowrap;letter-spacing:0.02em;`;
const CARD = `background:#ffffff;border:1px solid ${LINE};border-radius:10px;`;

// 근태 종류별 배지 색 (글자색, 배경색)
const BADGE: Record<string, [string, string]> = {
  연차: ["#1f8a3b", "#e3f4e8"], 월차: ["#1f8a3b", "#e3f4e8"], 경조휴가: ["#1f8a3b", "#e3f4e8"],
  병가: ["#1f8a3b", "#e3f4e8"], 반차: ["#0f766e", "#dcf3f0"], 반반차: ["#0f766e", "#dcf3f0"],
  외출: ["#c2410c", "#fdebdc"], 공가: ["#2563c9", "#e3ecfb"], 출장: ["#6d28d9", "#ede5fb"],
  교육: ["#4338ca", "#e6e7fb"], 외근: ["#6d28d9", "#ede5fb"], 휴일근무: ["#b45309", "#fdf0d5"], 연장근무: ["#be123c", "#fde4ea"],
};
const SECTION_TITLES: Record<Section, string> = {
  근태: "근태 현황", 도제: "일학습병행(도제)", 휴가일정: "휴가 일정", 휴일근무: "휴일·연장 근무",
};
// 요약 카드: (라벨, 색, 포함 유형)
const SUMMARY_CARDS: [string, string, Set<string>][] = [
  ["휴가", "#1f8a3b", new Set(["연차", "월차", "반차", "반반차", "공가", "경조휴가", "병가"])],
  ["외출", "#e07b00", new Set(["외출"])],
  ["출장·교육", "#6d28d9", new Set(["출장", "교육", "외근"])],
  ["휴일·연장", "#b45309", new Set(["휴일근무", "연장근무"])],
];

export function badge(t: string): string {
  const [fg, bg] = BADGE[t] ?? ["#374151", "#eef0f4"];
  return `<span style="display:inline-block;${TXT}font-size:12px;font-weight:700;color:${fg};background:${bg};`
    + `border-left:3px solid ${fg};border-radius:4px;padding:2px 8px;margin:0 4px 3px 0;white-space:nowrap">${esc(t)}</span>`;
}

function twoLine(title: string, detail: string): string {
  const t = title ? `<div style="${TXT}font-weight:700">${esc(title)}</div>` : "";
  const d = detail ? `<div style="${TXT}font-size:13px;color:${SUB};margin-top:2px">${esc(detail)}</div>` : "";
  return t + d || `<span style="color:${SUB}">-</span>`;
}

/** 근태 줄 본문: 출장·교육·휴일연장 = 장소(굵게) + 내용, 휴가류 = 사유 + 시간(종일), 경조·공가·병가 = 사유 + 비고 */
/** 근태현황 줄의 value: 기간('YYYY-MM-DD~YYYY-MM-DD')과 연장근무 신청 시각('~HH:MM')을 '|'로 이어 저장한다.
 *  예) '2026-11-10~2026-11-12|~20:00', '~20:00', '' */
export function parseAttValue(v: string): { from: string; to: string; until: string } {
  let from = "", to = "", until = "";
  for (const part of String(v ?? "").split("|").map((x) => x.trim())) {
    const rg = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(part);
    const ot = /^~(\d{2}:\d{2})$/.exec(part);
    if (rg) [from, to] = [rg[1], rg[2]];
    else if (ot) until = ot[1];
  }
  return { from, to, until };
}
export const attValue = (from: string, to: string, until: string) =>
  [from && to && to > from ? `${from}~${to}` : "", until ? `~${until}` : ""].filter(Boolean).join("|");

function attText(r: ReportRow): string {
  const cat = attCat(r.types);
  if (cat === "leave") {
    const unit = leaveUnit(r.types);
    const time = unit === "day" ? "종일 (1일)" : timeLabel(r.detail);
    const reason = r.title.trim();
    if (!reason && !time) return `<span style="color:${SUB}">-</span>`;
    return reason ? twoLine(reason, time) : `<div style="${TXT}font-weight:700">${esc(time)}</div>`;
  }
  return twoLine(r.title, r.detail);
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
    + `<tr><td style="padding:14px 18px 10px">`
    + `<span style="display:inline-block;width:4px;height:16px;background:${NAVY};border-radius:2px;vertical-align:-2px;margin-right:8px"></span>`
    + `<span style="${TXT}font-size:16px;font-weight:800">${title}</span>`
    + `<span style="${TXT}font-size:12px;font-weight:700;color:${NAVY};background:#eaf0fc;border-radius:999px;padding:2px 9px;margin-left:8px">${count}명</span></td></tr>`
    + `<tr><td style="padding:0 18px 12px">${inner}</td></tr></table>`;
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

/** 근태가 같은 사람끼리 묶는다 (같은 근태 종류·근무지·내용 → 한 줄). 처음 나온 순서를 지킨다.
 * 근무지·사유가 비어 있으면 (예: 연차만) 묶지 않는다. */
export function groupAttendance(rows: ReportRow[]): ReportRow[][] {
  const groups = new Map<string, ReportRow[]>();
  rows.forEach((r, i) => {
    const types = [...splitReportTypes(r.types)].sort().join(",");
    const key = r.title.trim() ? `${types}\u0000${r.title.trim()}\u0000${r.detail.trim()}` : `#${i}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });
  return [...groups.values()];
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
    // 머리띠: 왼쪽 보고서 이름·날짜, 오른쪽 작성 부서
    parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${NAVY};border-radius:10px 10px 0 0">`
      + `<tr><td style="padding:16px 20px 14px">`
      + `<div style="${TXT}font-size:12px;font-weight:700;color:#b9c8ec;letter-spacing:0.08em">DAILY ATTENDANCE REPORT</div>`
      + `<div style="${TXT}font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;margin-top:2px">${dayLabel(day, true)} 근태현황</div></td>`
      + `<td style="padding:16px 20px 14px;text-align:right;vertical-align:bottom;white-space:nowrap">`
      + `<div style="${TXT}font-size:13px;font-weight:700;color:#ffffff">관리팀</div>`
      + `<div style="${TXT}font-size:11px;color:#b9c8ec;margin-top:2px">근태관리통합시스템</div></td></tr></table>`
      + `<div style="height:3px;background:${RED}"></div>`);
  }

  // 한 줄 요약 (메일에서도 나란히 보이도록 표로): 칸 사이 세로선, 0명은 흐리게
  const counts = reportCounts(rows);
  const cards = SUMMARY_CARDS.map(([label, color], i) => {
    const n = counts[label];
    return `<td style="width:25%;padding:12px 8px 12px 18px;${i ? `border-left:1px solid ${LINE};` : ""}">`
      + `<div style="${TXT}font-size:12px;font-weight:700;color:${SUB}">`
      + `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>${label}</div>`
      + `<div style="${TXT}font-size:26px;font-weight:800;line-height:1.3;color:${n ? color : "#c3c9d4"}">${n}`
      + `<span style="${TXT}font-size:13px;font-weight:600;color:${SUB};margin-left:3px">명</span></div></td>`;
  }).join("");
  parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;`
    + `border:1px solid ${LINE};border-top:0;border-radius:${withTitle ? "0 0 10px 10px" : "10px"}">`
    + `<tr>${cards}</tr></table>`);

  // 근태 현황 (항상 표시)
  const att = rows.filter((r) => r.section === "근태");
  const lines = (xs: string[]) => xs.map((x) => `<div style="${TXT}line-height:1.6">${x}</div>`).join("");
  // 묶인 줄 안에서 부서별로 사람을 모으고, 부서 이름은 그 부서 첫 사람 옆에만
  const byDept = (g: ReportRow[]) => {
    const order = [...new Set(g.map((r) => r.dept))];
    // 같은 부서 안에서는 직급 높은 순 (차장 → 대리 → 사원), 같은 직급은 입력 순서
    const rk = (r: string) => (RANK_ORDER.includes(r) ? RANK_ORDER.indexOf(r) : RANK_ORDER.length);
    return [...g].sort((a, b) => order.indexOf(a.dept) - order.indexOf(b.dept) || rk(a.rank) - rk(b.rank));
  };
  const deptLines = (g: ReportRow[]) => g.map((r, i) => {
    const first = i === 0 || g[i - 1].dept !== r.dept;
    return `<div style="${TXT}line-height:1.6;${first ? "font-weight:700" : ""}">${first ? esc(r.dept) || "&nbsp;" : "&nbsp;"}</div>`;
  }).join("");
  const nameLines = (g: ReportRow[]) => g.map((r) => `<div style="${TXT}line-height:1.6">${person(r)}</div>`).join("");
  const inner = att.length
    ? table([["부서", "80px"], ["성명", "110px"], ["근태", "130px"], ["장소 · 내용 (사유·시간)", ""]],
      sortByKind(groupAttendance(att)).map(byDept).map((g) => [
        deptLines(g), nameLines(g),
        splitReportTypes(g[0].types).map(badge).join(""), attText(g[0])]))
    : `<div style="${TXT}color:${SUB};padding:6px 0">오늘 근태 특이사항이 없습니다.</div>`;
  parts.push(section(SECTION_TITLES.근태, att.length, inner));

  // 휴가 일정: 종류·시간은 한 번만, 이어지는 휴가 묶음마다 한 줄씩 '휴가일 → 출근일'
  let sub = rows.filter((r) => r.section === "휴가일정");
  if (sub.length) {
    const red = (s: string) => `<span style="${TXT}font-weight:800;color:#d42a2a">${esc(s)}</span>`;
    const kind = (r: ReportRow) => {
      if (!r.types) return `<span style="color:${SUB}">-</span>`;
      const time = r.detail.trim() ? timeLabel(r.detail) || r.detail.trim() : "";
      return (r.title ? badge(r.title) : "")
        + (time ? `<div style="${TXT}font-size:13px;color:${SUB};margin-top:3px">${esc(time)}</div>` : "")
        + (r.note.trim() ? `<div style="${TXT}font-size:13px;color:${SUB};margin-top:2px">${esc(r.note.trim())}</div>` : "");
    };
    const runsCell = (r: ReportRow) => {
      // 반차·반반차·외출: 그날도 출근 → 날짜마다 '당일 출근'
      if (r.types && isPartialSchedule(r.title)) {
        const ds = splitReportTypes(r.types).filter(isDateStr).sort();
        return esc(ds.map((d) => dayLabel(d)).join(" · ")) + `<span style="${TXT}font-size:13px;color:${SUB};padding-left:10px">→ 당일 출근</span>`;
      }
      const runs = r.types ? scheduleRuns(r) : null;
      if (!runs) {
        // 예전 형식이나 출근일을 묶음에 못 맞춘 줄은 그대로
        const text = esc(r.types ? splitReportTypes(r.types).filter(isDateStr).sort().map((d) => dayLabel(d)).join("·") : r.note);
        return text + (r.value ? `<div style="margin-top:3px">출근 ${red(r.value)}</div>` : "");
      }
      const td = `${TXT}font-size:14px;padding:3px 0;vertical-align:top;`;
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">`
        + runs.map(([ds, back], i) => `<tr${i ? ` style="border-top:1px dashed ${LINE}"` : ""}>`
          + `<td style="${td}padding-right:14px">${esc(ds.map((d) => dayLabel(d)).join(" · "))}</td>`
          + `<td style="${td}color:${SUB};padding-right:8px;white-space:nowrap">→ 출근</td>`
          + `<td style="${td}white-space:nowrap">${red(back)}</td></tr>`).join("")
        + `</table>`;
    };
    parts.push(section(SECTION_TITLES.휴가일정, sub.length,
      table([["부서", "80px"], ["성명", "110px"], ["종류", "130px"], ["휴가일 → 출근 예정", ""]],
        sub.map((r) => [esc(r.dept), person(r), kind(r), runsCell(r)]))));
  }

  // 휴일 근무: 날짜별로 나누고, 같은 날 근무지·작업내용이 같은 사람들은 한 줄로 (부서 순서대로)
  sub = rows.filter((r) => r.section === "휴일근무");
  if (sub.length) {
    const [hfg, hbg] = BADGE.휴일근무;
    const split = (t: string) => {
      const cut = t.indexOf("/");
      return cut < 0 ? [t.trim(), ""] : [t.slice(0, cut).trim(), t.slice(cut + 1).trim()];
    };
    const byDay = new Map<string, Map<string, ReportRow[]>>();
    for (const r of sub) {
      const ds = splitReportTypes(r.types).filter(isDateStr);
      for (const d of ds.length ? ds : [""]) {
        const m = byDay.get(d) ?? new Map<string, ReportRow[]>();
        const k = [isOtRow(r) ? "연장" : "휴일", ...split(r.title)].join("|");
        m.set(k, [...(m.get(k) ?? []), r]);
        byDay.set(d, m);
      }
    }
    const placeCell = (g: ReportRow[]) => {
      const notes = [...new Set(g.map((x) => x.note.trim()).filter(Boolean))];
      const [place] = split(g[0].title);
      return (place
        ? `<span style="display:inline-block;${TXT}font-size:12px;font-weight:700;color:${hfg};background:${hbg};`
          + `border-left:3px solid ${hfg};border-radius:4px;padding:2px 8px;margin:0 4px 3px 0">${esc(place)}</span>`
        : `<span style="color:${SUB}">-</span>`)
        + notes.map((n) => `<div style="${TXT}font-size:13px;color:${SUB};margin-top:3px">${esc(n)}</div>`).join("");
    };
    const workCell = (g: ReportRow[]) => {
      const [, work] = split(g[0].title);
      return work ? `<div style="${TXT}font-weight:700">${esc(work)}</div>` : `<span style="color:${SUB}">-</span>`;
    };
    const body: string[][] = [];
    for (const d of [...byDay.keys()].sort((a, b) => (a || "9").localeCompare(b || "9"))) {
      [...byDay.get(d)!.values()].sort((a, b) => Number(isOtRow(a[0])) - Number(isOtRow(b[0]))).map(byDept).forEach((g, i) => body.push([
        i ? "" : `<div style="${TXT}font-weight:700;white-space:nowrap">${d ? esc(dayLabel(d)) : "-"}</div>`,
        badge(isOtRow(g[0]) ? "연장근무" : "휴일근무"), deptLines(g), nameLines(g), placeCell(g), workCell(g),
      ]));
    }
    parts.push(section(SECTION_TITLES.휴일근무, new Set(sub.map((r) => r.name)).size,
      table([["근무일", "90px"], ["구분", "90px"], ["부서", "80px"], ["성명", "110px"], ["근무지", "120px"], ["작업내용", ""]], body)));
  }

  // 일학습병행(도제)
  sub = rows.filter((r) => r.section === "도제");
  if (sub.length) {
    parts.push(section(SECTION_TITLES.도제, sub.length,
      table([["부서", "80px"], ["성명", "110px"], ["출근 완료", "130px"], ["비고", ""]],
        sub.map((r) => [esc(r.dept), person(r), esc(r.value) || "-", esc(r.note)]))));
  }
  parts.push(`<div style="${TXT}font-size:11px;color:#9aa3b5;text-align:right;margin-top:10px">주식회사 에쓰엔 관리팀 · 근태관리통합시스템에서 작성</div>`);
  parts.push("</div>");
  return parts.join("");
}

/** 근태 현황 줄 순서: 요약 칸 순서(휴가 → 외출 → 출장·교육 → 휴일·연장)대로 같은 종류끼리 모은다. 같은 종류는 입력 순서. */
function sortByKind(groups: ReportRow[][]): ReportRow[][] {
  const kindOf = (g: ReportRow[]) => {
    const ts = splitReportTypes(g[0].types);
    const i = SUMMARY_CARDS.findIndex(([, , set]) => ts.some((t) => set.has(t)));
    return i < 0 ? SUMMARY_CARDS.length : i;
  };
  return groups.map((g, i) => [g, i] as const).sort((a, b) => kindOf(a[0]) - kindOf(b[0]) || a[1] - b[1]).map(([g]) => g);
}

// ---------------------------------------------------------------- 근태 종류 분류·휴가 시간 (보고서 입력칸·표시 공용)
/** 한 줄에 여러 근태가 있으면 출장 > 교육 > 휴일·연장 > 경조·공가·병가 > 휴가 순으로 칸 모양을 정한다 */
export type AttCat = "trip" | "edu" | "work" | "special" | "leave" | "none";
export function attCat(types: string): AttCat {
  const t = splitReportTypes(types);
  if (t.some((x) => x === "출장" || x === "외근")) return "trip";
  if (t.includes("교육")) return "edu";
  if (t.some((x) => x === "휴일근무" || x === "연장근무")) return "work";
  if (t.some((x) => x === "경조휴가" || x === "공가" || x === "병가")) return "special";
  if (t.some((x) => ["연차", "월차", "반차", "반반차", "외출"].includes(x))) return "leave";
  return "none";
}
/** 휴가 시간 단위: 연차·월차만 = 종일, 반차만 = 4시간, 반반차만 = 2시간, 외출이나 섞인 경우 = 30분 단위 자유 */
export function leaveUnit(types: string): "day" | 4 | 2 | "free" {
  const t = splitReportTypes(types).filter((x) => ["연차", "월차", "반차", "반반차", "외출"].includes(x));
  if (t.length && t.every((x) => x === "연차" || x === "월차")) return "day";
  if (t.length === 1 && t[0] === "반차") return 4;
  if (t.length === 1 && t[0] === "반반차") return 2;
  return "free";
}
export const LUNCH: [number, number] = [12 * 60, 13 * 60]; // 점심 12:00~13:00 (반차·반반차 끝 시각·시간 계산에서 뺀다)
const toMin = (s: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim()); return m ? +m[1] * 60 + +m[2] : null; };
const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** 시작 + 근무 n시간 (점심을 지나면 그만큼 뒤로) */
export function addWorkHours(start: string, hours: number): string {
  const s = toMin(start);
  if (s === null) return "";
  let t = s, left = hours * 60;
  while (left > 0) { if (!(t >= LUNCH[0] && t < LUNCH[1])) left--; t++; } // 점심시간은 세지 않는다
  return toHM(t);
}
/** '16:30~17:30' -> '16:30~17:30 (1시간)'. 시작·끝이 다 있어야 하고, 점심은 뺀다. 아니면 빈 글. */
export function timeLabel(detail: string): string {
  const m = /^\s*(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})\s*$/.exec(detail ?? "");
  if (!m) return "";
  const a = toMin(m[1])!, b = toMin(m[2])!;
  if (b <= a) return "";
  const mins = b - a - Math.max(0, Math.min(b, LUNCH[1]) - Math.max(a, LUNCH[0]));
  const h = Math.floor(mins / 60), mm = mins % 60;
  return `${toHM(a)}~${toHM(b)} (${h ? `${h}시간` : ""}${h && mm ? " " : ""}${mm ? `${mm}분` : ""})`;
}

// ---------------------------------------------------------------- 휴가일정 (사람별 한 줄: title = 종류, types = 날짜들, detail = 시간)
export const SCHEDULE_TYPES = ["연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가"];
const LEGACY_SCHEDULE = /^\s*(\d{1,2})\/(\d{1,2})\([^)]*\)\s*(연차|월차|반차|반반차|외출|공가|경조휴가|병가)\s*(\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2})?\s*(.*)$/;

/** 휴가일정 날짜들 -> '11/6(금)·11/9(월) 외출 16:30~17:30 (사유)' */
export function scheduleText(r: Pick<ReportRow, "types" | "title" | "detail" | "note">): string {
  const ds = splitReportTypes(r.types).filter(isDateStr).sort();
  return [ds.map((d) => dayLabel(d)).join("·"), r.title, r.detail.trim(), r.note.trim() ? `(${r.note.trim()})` : ""].filter(Boolean).join(" ");
}

/** 휴가일정 줄을 이어지는 묶음별로 나눈다: [[휴가일들, 출근 예정 글자], ...].
 * 출근 예정(value, 'M/D(요일), M/D(요일)')은 묶음마다 하나씩 순서대로 저장돼 있으므로
 * 각 출근일보다 앞선 휴가일을 그 묶음으로 본다. 개수가 안 맞으면 null. */
export function scheduleRuns(r: Pick<ReportRow, "types" | "value">): [DateStr[], string][] | null {
  const ds = [...new Set(splitReportTypes(r.types).filter(isDateStr))].sort();
  const backs = r.value.split(",").map((s) => s.trim()).filter(Boolean);
  if (!ds.length || !backs.length) return null;
  const out: [DateStr[], string][] = [];
  let i = 0;
  for (const label of backs) {
    const m = /^(\d{1,2})\/(\d{1,2})/.exec(label);
    if (!m || i >= ds.length) return null;
    const y = +ds[i].slice(0, 4);
    let back = makeDate(y, +m[1], +m[2]);
    if (back && back <= ds[i]) back = makeDate(y + 1, +m[1], +m[2]); // 연말 넘김
    if (!back) return null;
    const run: DateStr[] = [];
    while (i < ds.length && ds[i] < back) run.push(ds[i++]);
    if (!run.length) return null;
    out.push([run, label]);
  }
  return i === ds.length ? out : null;
}

/** 그날 일부만 쉬는 휴가 (반차·반반차·외출): 그날도 출근하므로 '출근 예정'을 따로 계산하지 않고 '당일 출근'으로 본다 */
export const PARTIAL_SCHEDULE = ["반차", "반반차", "외출"];
export const isPartialSchedule = (kind: string) => PARTIAL_SCHEDULE.includes(kind.trim());

/** 출근 예정: 이어지는 휴가 묶음마다 그다음 근무일 (하루 종일 쉬는 휴가만. 반차·반반차·외출은 isPartialSchedule) */
export function returnDays(dates: DateStr[], isWorkday: (d: DateStr) => boolean): DateStr[] {
  const ds = [...new Set(dates.filter(isDateStr))].sort();
  const out: DateStr[] = [];
  for (let i = 0; i < ds.length; i++) {
    let next = addDays(ds[i], 1);
    while (!isWorkday(next)) next = addDays(next, 1);
    if (ds[i + 1] === next) continue; // 다음 날도 휴가면 묶음이 이어진다
    out.push(next);
  }
  return out;
}

/** 예전 휴가일정 줄('11/6(금) 외출 16:30~17:30')을 사람·종류·시간별 한 줄(날짜 여러 개)로 정리한다. */
export function tidySchedule(rows: ReportRow[], reportDay: DateStr): ReportRow[] {
  const y = +reportDay.slice(0, 4), rm = +reportDay.slice(5, 7);
  const out: ReportRow[] = [];
  for (const r of rows) {
    if (r.section !== "휴가일정" || r.types || r.title) { out.push(r); continue; }
    const m = LEGACY_SCHEDULE.exec(r.note);
    if (!m) { out.push(r); continue; }
    const mm = +m[1], yy = mm < rm - 6 ? y + 1 : mm > rm + 6 ? y - 1 : y; // 연말·연초 넘김
    const d = makeDate(yy, mm, +m[2]);
    if (!d) { out.push(r); continue; }
    const time = (m[4] ?? "").replace(/\s+/g, "");
    const same = out.find((x) => x.section === "휴가일정" && x.name === r.name && x.title === m[3] && x.detail === time && x.types);
    if (same) same.types = [...splitReportTypes(same.types), d].sort().join(",");
    else out.push({ ...r, title: m[3], types: d, detail: time, note: m[5].trim(), value: "" });
  }
  return out;
}

/** 메일 제목·미리보기용 한 줄 요약: '연차 1, 반차 1, 출장 3' */
export function summaryText(rows: ReportRow[]): string {
  const counts: Record<string, number> = {};
  for (const r of rows.filter((x) => x.section === "근태")) {
    for (const t of splitReportTypes(r.types)) counts[t] = (counts[t] ?? 0) + 1;
  }
  return [...LEAVE_TYPES, "외근"].filter((t) => t in counts).map((t) => `${t} ${counts[t]}`).join(", ") || "특이사항 없음";
}
