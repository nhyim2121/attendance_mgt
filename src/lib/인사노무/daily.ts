/** 일일 근태현황 보고서: 사이트에서 등록·수정·삭제하는 하루치 보고서와 그 변환·표 그리기.
 *
 * 섹션
 * - 근태     : 부서 | 직급 | 성명 | 유형(연차·반차·반반차·외출·공가·출장·교육, 여러 개) | 제목(목적지/사유) | 상세(시간 등) | 비고
 * - 도제     : 일학습병행(도제) 관련 — 성명 | 값(출근일들 '11/11(수), 11/12(목)' 또는 '-' = 해당 없음) | 비고(비고란)
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

/** 연속 출장·교육·외근에서 날짜마다 근무지가 다를 때의 일정표. 근태현황 줄의 note(비고 칸은 안 씀)에 넣어 둔다.
 *  형식: '#일정' + JSON [[날짜, 근무장소, 목적/작업내용], ...] */
const PLAN_MARK = "#일정";
export type DayPlan = Record<string, [string, string]>;
export function parsePlan(note: string | null | undefined): DayPlan | null {
  const s = String(note ?? "");
  if (!s.startsWith(PLAN_MARK)) return null;
  try {
    const out: DayPlan = {};
    for (const x of JSON.parse(s.slice(PLAN_MARK.length)) as unknown[]) {
      if (Array.isArray(x) && isDateStr(x[0])) out[x[0]] = [String(x[1] ?? ""), String(x[2] ?? "")];
    }
    return out;
  } catch { return null; }
}
export const planNote = (plan: DayPlan): string =>
  PLAN_MARK + JSON.stringify(Object.keys(plan).sort().map((d) => [d, plan[d][0], plan[d][1]]));

/** 보고서 행 -> 하이웍스 근태와 같은 형식 (근태 판정·직원별 시트에 쓰임). */
export function reportToLeaves(rows: ReportRow[]): Leave[] {
  const out: Leave[] = [];
  for (const r of rows) {
    // 연장근무 신청 시각(value '~HH:MM')은 내용 끝에 '~20:00'으로 붙여 직원별 근태 퇴근 근무형태 '연장(20:00)'이 되게 한다
    const until = r.section === "근태" && splitReportTypes(r.types).includes("연장근무") ? parseAttValue(r.value).until : "";
    const content = [r.title, r.detail, until ? `~${until}` : ""].filter(Boolean).join("\n");
    const base = { name: r.name, dept: r.dept, rank: r.rank, content, note: parsePlan(r.note) ? "" : r.note ?? "", sheet: "사이트" };
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
  교육: ["#4338ca", "#e6e7fb"], 외근: ["#0e7490", "#dff3f7"], 휴일근무: ["#b45309", "#fdf0d5"], 연장근무: ["#be123c", "#fde4ea"],
};
const SECTION_TITLES: Record<Section, string> = {
  근태: "근태 현황", 도제: "일학습병행(도제)", 휴가일정: "휴가 일정", 휴일근무: "휴일·연장 근무",
};
// 요약 카드: (라벨, 색, 포함 유형)
const SUMMARY_CARDS: [string, string, Set<string>][] = [
  ["휴가", "#1f8a3b", new Set(["연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가"])],
  ["출장", "#6d28d9", new Set(["출장"])],
  ["교육", "#4338ca", new Set(["교육"])],
  // 외근은 빼고 휴일·연장은 나눔 (2026-11-17 사용자 결정)
  ["휴일", "#b45309", new Set(["휴일근무"])],
  ["연장", "#be123c", new Set(["연장근무"])],
];
/** 근태 현황 칸 (보고서 2안, 2026-11-11): 한 줄의 종류가 여럿이면 출장 > 교육 > 외근 > 휴일근무 > 휴가 순으로 한 칸에 넣는다. 없는 칸은 안 그림 */
const ATT_PANELS: [string, string, (ts: string[]) => boolean][] = [
  ["휴가", "#1f8a3b", (ts) => ts.some((t) => SUMMARY_CARDS[0][2].has(t))],
  ["출장", "#6d28d9", (ts) => ts.includes("출장")],
  ["교육", "#4338ca", (ts) => ts.includes("교육")],
  ["외근", "#0e7490", (ts) => ts.includes("외근")],
  ["휴일근무", "#b45309", (ts) => ts.includes("휴일근무") || ts.includes("연장근무")],
];
const PANEL_PRIORITY = ["출장", "교육", "외근", "휴일근무", "휴가"];
const panelOf = (types: string) => {
  const ts = splitReportTypes(types);
  return PANEL_PRIORITY.find((k) => ATT_PANELS.find(([n]) => n === k)![2](ts)) ?? "휴가";
};

/** 휴가 종류 형광펜 (휴가 일정 칸과 같은 개나리색, 반차·반반차·외출은 연하게) */
function hlBadge(t: string): string {
  const c = ["반차", "반반차", "외출"].includes(t) ? "#ffe9a0" : "#ffd43b";
  return `<span style="${TXT}font-size:13px;font-weight:800;white-space:nowrap;background-image:linear-gradient(transparent 50%,${c} 50%);padding:0 2px">${esc(t)}</span>`;
}

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

/** 가벼운 표 (휴가 일정 칸과 같은 모양): 작은 회색 머리줄 + 줄마다 얇은 선 */
function liteTable(heads: [string, string][], bodyRows: string[][]): string {
  const th = heads.map(([h, w]) => `<td style="${TXT}font-size:11px;color:${SUB};padding:3px 8px 3px 0;border-bottom:1px solid #d6dce8;${w ? `width:${w};` : ""}">${h}</td>`).join("");
  const tr = bodyRows.map((cells) => `<tr>${cells.map((c) => `<td style="${TXT}font-size:13px;padding:7px 8px 7px 0;border-bottom:1px solid ${LINE};vertical-align:top">${c}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%"><tr>${th}</tr>${tr}</table>`;
}

function section(title: string, count: number, inner: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;${CARD}margin-top:12px">`
    + `<tr><td style="padding:12px 16px 8px">`
    + `<span style="display:inline-block;width:4px;height:16px;background:${NAVY};border-radius:2px;vertical-align:-2px;margin-right:8px"></span>`
    + `<span style="${TXT}font-size:15px;font-weight:800">${title}</span>`
    + `<span style="${TXT}font-size:12px;font-weight:700;color:${NAVY};background:#eaf0fc;border-radius:999px;padding:2px 9px;margin-left:8px">${count}명</span></td></tr>`
    + `<tr><td style="padding:0 16px 12px">${inner}</td></tr></table>`;
}

/** 휴가 일정 칸 (2026-11-24 ③안): 왼쪽 작은 달력 두 달(휴가일 개나리색 형광펜) + 오른쪽 한 사람 한 줄 표 (휴가·출근 예정).
 *  메일에서도 보이도록 표와 인라인 스타일만 쓴다. */
function scheduleCalendar(day: DateStr, sub: ReportRow[]): string {
  type P = { r: ReportRow; pills: [string, string, string][]; backs: string[]; notes: string[]; first: string };
  const people = new Map<string, P>();
  const marks = new Map<DateStr, string[]>();
  for (const r of sub) {
    const ds = [...new Set(splitReportTypes(r.types).filter(isDateStr))].sort();
    const kind = r.title.trim() || "휴가";
    ds.forEach((d) => marks.set(d, [...(marks.get(d) ?? []), kind]));
    const p = people.get(r.name) ?? { r, pills: [], backs: [], notes: [], first: ds[0] ?? "9999" };
    if (ds[0] && ds[0] < p.first) p.first = ds[0];
    if (!ds.length) { // 예전 형식: 날짜 없이 비고에만 적힌 일정
      p.pills.push([kind, `${kind} ${r.note}`.trim(), ""]);
      if (r.value) p.backs.push(r.value);
    } else if (isPartialSchedule(kind)) {
      const time = r.detail.trim() ? timeLabel(r.detail) || r.detail.trim() : "";
      p.pills.push([kind, `${kind} ${ds.map((d) => dayLabel(d)).join(", ")}${time ? ` ${time}` : ""}`, ds[0]]);
      p.backs.push("당일 근무");
      if (r.note.trim()) p.notes.push(r.note.trim());
    } else {
      const runs = scheduleRuns(r);
      if (runs) for (const [run, b] of runs) {
        p.pills.push([kind, `${kind} ${run.length > 1 ? `${dayLabel(run[0])} ~ ${dayLabel(run[run.length - 1])} · ${run.length}일` : dayLabel(run[0])}`, run[0]]);
        p.backs.push(b);
      } else {
        p.pills.push([kind, `${kind} ${ds.map((d) => dayLabel(d)).join(", ")}`, ds[0]]);
        if (r.value) p.backs.push(r.value);
      }
      if (r.note.trim()) p.notes.push(r.note.trim());
    }
    people.set(r.name, p);
  }
  const list = [...people.values()].sort((a, b) => a.first.localeCompare(b.first));

  // 작은 달력 두 달 (2026-11-24 ③안): 보고일 달 + 다음 달, 월요일 시작. 휴가일 = 개나리색 형광펜(반차·반반차·외출은 연하게), 보고일 = 빨간 칸
  const months: [number, number][] = [[+day.slice(0, 4), +day.slice(5, 7)]];
  months.push(months[0][1] === 12 ? [months[0][0] + 1, 1] : [months[0][0], months[0][1] + 1]);
  const HL = (c: string) => `background-image:linear-gradient(transparent 50%,${c} 50%);`;
  const holiday = (d: DateStr) => weekday(d) >= 5;
  const W = ["월", "화", "수", "목", "금", "토", "일"];
  const cal = months.map(([y, m]) => {
    const first = makeDate(y, m, 1)!;
    let d = addDays(first, -weekday(first));
    const weeks: string[] = [];
    while (+d.slice(5, 7) === m || d < first) {
      const cells: string[] = [];
      for (let k = 0; k < 7; k++, d = addDays(d, 1)) {
        const inM = +d.slice(5, 7) === m, ks = inM ? marks.get(d) ?? [] : [], now = inM && d === day;
        const full = ks.some((t) => !isPartialSchedule(t));
        const mark = now ? `background:${RED};border-radius:4px;` : ks.length ? HL(full ? "#ffd43b" : "#ffe9a0") : "";
        const color = now ? "#ffffff" : !inM ? "#d1d5db" : holiday(d) ? RED : INK;
        cells.push(`<td width="24" style="width:24px;padding:1px 0;text-align:center;height:21px">`
          + `<span style="${TXT}display:inline-block;min-width:18px;font-size:11px;line-height:17px;${mark}font-weight:${now || ks.length ? 800 : 500};color:${color}">${+d.slice(8)}</span></td>`);
      }
      weeks.push(`<tr>${cells.join("")}</tr>`);
    }
    return `<td width="180" style="width:180px;min-width:180px;vertical-align:top;padding-right:14px">`
      + `<div style="${TXT}font-size:13px;font-weight:800;color:${NAVY};margin-bottom:4px">${y}년 ${m}월</div>`
      + `<table role="presentation" width="168" cellpadding="0" cellspacing="0" style="width:168px;border-collapse:collapse;table-layout:fixed">`
      + `<tr>${W.map((w, i) => `<td width="24" style="${TXT}width:24px;font-size:10px;font-weight:700;text-align:center;padding-bottom:2px;color:${i >= 5 ? RED : SUB}">${w}</td>`).join("")}</tr>`
      + weeks.join("") + `</table></td>`;
  }).join("");
  const legend = `<div style="${TXT}font-size:11px;color:${SUB};text-align:right;margin-bottom:4px">`
    + `<span style="${HL("#ffd43b")}padding:0 3px;font-weight:700;color:${INK}">연차</span> 휴가일 · `
    + `<span style="${HL("#ffe9a0")}padding:0 3px;font-weight:700;color:${INK}">반차</span> 반차·반반차·외출 · `
    + `<span style="background:${RED};color:#fff;border-radius:4px;padding:0 4px;font-weight:700">${+day.slice(8)}</span> 보고일</div>`;

  // 한 사람 한 줄: 이름·부서 | 휴가(형광펜) | 출근 예정
  const rows = list.map((p) => {
    const nm = p.r.name.trim();
    const leaves = [...p.pills].sort((a, b) => a[2].localeCompare(b[2])).map(([k, t]) =>
      `<span style="${HL(isPartialSchedule(k) ? "#ffe9a0" : "#ffd43b")}padding:0 2px;white-space:nowrap">${esc(t)}</span>`).join(" · ");
    const backs = [...new Set(p.backs)];
    const real = backs.filter((b) => b !== "당일 근무");
    const back = real.length ? real.join("\n") : backs.length ? "당일 근무" : "-";
    const who = [p.r.dept, p.r.rank].filter(Boolean).join("·");
    const note = p.notes.length ? `<div style="${TXT}font-size:11px;color:${SUB};margin-top:2px">${esc([...new Set(p.notes)].join(" / "))}</div>` : "";
    return `<tr><td style="padding:6px 8px 6px 0;border-bottom:1px solid ${LINE};white-space:nowrap;vertical-align:top">`
      + `<span style="${TXT}font-size:13px;font-weight:800">${esc(nm)}</span>${who ? ` <span style="${TXT}font-size:11px;color:${SUB}">${esc(who)}</span>` : ""}</td>`
      + `<td style="${TXT}padding:6px 8px 6px 0;border-bottom:1px solid ${LINE};font-size:12px;vertical-align:top">${leaves}${note}</td>`
      + `<td style="${TXT}padding:6px 0;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;vertical-align:top;font-size:13px;font-weight:800;color:${back === "당일 근무" ? SUB : NAVY}">${esc(back).replace(/\n/g, "<br>")}</td></tr>`;
  }).join("");
  const tbl = legend + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">`
    + `<tr><td style="${TXT}font-size:11px;color:${SUB};padding:3px 0;border-bottom:1px solid #d6dce8">이름</td><td style="${TXT}font-size:11px;color:${SUB};border-bottom:1px solid #d6dce8">휴가</td>`
    + `<td style="${TXT}font-size:11px;color:${SUB};text-align:right;border-bottom:1px solid #d6dce8">출근 예정</td></tr>${rows}</table>`;

  return section(SECTION_TITLES.휴가일정, list.length,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>`
    + `${cal}<td style="vertical-align:top;padding-left:4px">${tbl}</td></tr></table>`);
}

/** 요약 카드 숫자 (사람 수). 휴일·연장은 근태 목록 + 휴일근무 표. */
export function reportCounts(rows: ReportRow[], day?: DateStr): Record<string, number> {
  const att = rows.filter((r) => r.section === "근태");
  const out: Record<string, number> = {};
  for (const [label, , types] of SUMMARY_CARDS) {
    const names = new Set(att.filter((r) => splitReportTypes(r.types).some((t) => types.has(t))).map((r) => r.name));
    // (2026-11-19) '휴가일정' 칸은 앞으로의 일정이라, 적힌 날짜에 보고일이 들어 있을 때만 그날 휴가로 센다
    if (label === "휴가") rows.filter((r) => r.section === "휴가일정" && splitReportTypes(r.types).includes(day ?? r.day ?? "")).forEach((r) => names.add(r.name));
    // (2026-11-23) 휴일·연장 근무는 근무일(types의 날짜)이 보고일인 사람만 '오늘'로 센다. 날짜가 없으면 보고일로 본다.
    const onDay = (r: ReportRow) => { const ds = splitReportTypes(r.types).filter(isDateStr); return !ds.length || !day || ds.includes(day); };
    if (label === "휴일") rows.filter((r) => r.section === "휴일근무" && !isOtRow(r) && onDay(r)).forEach((r) => names.add(r.name));
    if (label === "연장") rows.filter((r) => r.section === "휴일근무" && isOtRow(r) && onDay(r)).forEach((r) => names.add(r.name));
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

/** 보고서 맨 위 '한눈에' 줄과 '어제 근무' 칸에 쓰는 근태 홈 숫자 (reportHome.ts에서 계산) */
export interface ReportHome {
  staff: number; depts: number; present: number; future: boolean;
  usedRate: number; fyLabel: string; turnover: number; joined: number; left: number;
  yday: DateStr; trip: [string, string][]; leave: [string, string][]; ot: [string, string][];
}

const bar = (pct: number, color: string, h: number) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;height:${h}px"><tr>`
  + (pct > 0 ? `<td style="width:${pct}%;height:${h}px;background:${color};border-radius:${h / 2}px 0 0 ${h / 2}px;font-size:0;line-height:0">&nbsp;</td>` : "")
  + (pct < 100 ? `<td style="height:${h}px;background:#e3e8f3;border-radius:${pct > 0 ? 0 : h / 2}px ${h / 2}px ${h / 2}px ${pct > 0 ? 0 : h / 2}px;font-size:0;line-height:0">&nbsp;</td>` : "")
  + `</tr></table>`;
const kicker = (t: string) => `<div style="${TXT}font-size:11px;font-weight:800;letter-spacing:0.1em;color:${NAVY};margin-bottom:6px">${t}</div>`;

/** 한눈에 줄 (2026-11-17 최종안 = C안): 인원 | 오늘 근태 | 지표 */
function glance(h: ReportHome, counts: Record<string, number>, withTitle: boolean): string {
  const rate = h.staff ? Math.round((h.present / h.staff) * 100) : 0;
  const people = kicker("인원")
    + `<div style="${TXT}white-space:nowrap"><span style="${TXT}font-size:30px;font-weight:900;color:${NAVY};line-height:1.1">${h.future ? "-" : h.present}</span>`
    + `<span style="${TXT}font-size:15px;font-weight:700;color:${SUB};margin-left:6px">/ ${h.staff}명 출근</span></div>`
    + `<div style="margin:8px 0 6px">${bar(h.future ? 0 : rate, NAVY, 8)}</div>`
    + `<div style="${TXT}font-size:12px;color:#4b5563">출근율 <b>${h.future ? "-" : `${rate}%`}</b> · 부서 ${h.depts}개</div>`;
  const kinds = SUMMARY_CARDS.map(([label, color]) => {
    const n = counts[label];
    return `<td style="vertical-align:top;padding-right:6px">`
      + `<div style="${TXT}font-size:12px;font-weight:700;color:#4b5563;white-space:nowrap">`
      + `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px"></span>${label}</div>`
      + `<div style="${TXT}font-size:26px;font-weight:900;line-height:1.3;color:${n ? color : "#c3c9d4"}">${n}`
      + `<span style="${TXT}font-size:12px;font-weight:600;color:${SUB};margin-left:2px">명</span></div></td>`;
  }).join("");
  const metrics = kicker("지표")
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>`
    + `<td style="${TXT}font-size:12px;color:#4b5563">연차 사용률 (${esc(h.fyLabel)})</td><td style="${TXT}font-size:12px;font-weight:800;text-align:right">${h.usedRate}%</td></tr></table>`
    + `<div style="margin:4px 0 10px">${bar(h.usedRate, "#0e7490", 6)}</div>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>`
    + `<td style="${TXT}font-size:12px;color:#4b5563">이번 달 이직률</td><td style="${TXT}font-size:12px;font-weight:800;text-align:right">${h.turnover}%</td></tr></table>`
    + `<div style="${TXT}font-size:11px;color:${SUB};margin-top:2px">입사 ${h.joined} · 퇴직 ${h.left}</div>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;border-collapse:separate;`
    + `border:1px solid ${LINE};${withTitle ? "border-top:0;" : ""}border-radius:${withTitle ? "0 0 10px 10px" : "10px"}"><tr>`
    + `<td style="width:210px;vertical-align:top;padding:14px 18px;background:#f7f9fd;border-radius:${withTitle ? "0 0 0 10px" : "10px 0 0 10px"}">${people}</td>`
    + `<td style="vertical-align:top;padding:14px 18px;border-left:1px solid ${LINE}">${kicker("오늘 근태")}`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>${kinds}</tr></table></td>`
    + `<td style="width:190px;vertical-align:top;padding:14px 18px;border-left:1px solid ${LINE}">${metrics}</td>`
    + `</tr></table>`;
}

/** 어제 근무 칸 (2026-11-17 최종안 = D안 카드, 퇴근미체크 뺌): 출장 · 휴가 · 연장근무, 카드마다 이름·부서 */
function yesterdayCards(h: ReportHome): string {
  const cards: [string, [string, string][], string][] = [["출장·교육", h.trip, "#6d28d9"], ["휴가", h.leave, "#1f8a3b"], ["연장근무", h.ot, "#be123c"]];
  const tds = cards.map(([label, xs, color], i) => `<td style="width:33.3%;vertical-align:top;${i ? "padding-left:10px;" : ""}">`
    + `<div style="background:#ffffff;border:1px solid ${LINE};border-radius:10px;padding:10px 12px">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>`
    + `<td style="${TXT}font-size:13px;font-weight:800;color:${color}">${label}</td>`
    + `<td style="${TXT}text-align:right;white-space:nowrap"><span style="${TXT}font-size:18px;font-weight:900;color:${xs.length ? INK : "#c3c9d4"}">${xs.length}</span>`
    + `<span style="${TXT}font-size:12px;color:${SUB};margin-left:3px">명</span></td></tr></table>`
    + (xs.length
      ? xs.map(([n, d]) => `<div style="${TXT}font-size:13px;line-height:1.7"><b>${esc(n)}</b> <span style="color:${SUB}">${esc(d)}</span></div>`).join("")
      : `<div style="${TXT}font-size:13px;color:#9ca3af;line-height:1.7">없음</div>`)
    + `</div></td>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;${CARD}margin-top:12px">`
    + `<tr><td style="padding:12px 16px 8px">`
    + `<span style="display:inline-block;width:4px;height:16px;background:${NAVY};border-radius:2px;vertical-align:-2px;margin-right:8px"></span>`
    + `<span style="${TXT}font-size:15px;font-weight:800">어제 근무</span>`
    + `<span style="${TXT}font-size:13px;color:${SUB};margin-left:6px">${dayLabel(h.yday)}</span></td></tr>`
    + `<tr><td style="padding:0 16px 14px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>${tds}</tr></table></td></tr></table>`;
}

/** 일일 근태현황 보고서 HTML (사이트 미리보기·이미지 저장·메일 본문 공용). */
export function renderReportHtml(day: DateStr, input: ReportRow[], withTitle = true, home?: ReportHome | null): string {
  const rows = scheduleToday(day, clean(input));
  const parts = [`<div style="background:${BG};padding:18px;${TXT}max-width:920px">`];
  if (withTitle) {
    // 머리띠: 왼쪽 보고서 이름·날짜, 오른쪽 작성 부서
    parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${NAVY};border-radius:10px 10px 0 0">`
      + `<tr><td style="padding:16px 20px 14px">`
      + `<div style="${TXT}font-size:12px;font-weight:700;color:#b9c8ec;letter-spacing:0.08em">DAILY ATTENDANCE REPORT</div>`
      + `<div style="${TXT}font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;margin-top:2px">${dayLabel(day, true)} 근태현황</div></td></tr></table>`
      + `<div style="height:3px;background:${RED}"></div>`);
  }

  // 한 줄 요약 (메일에서도 나란히 보이도록 표로)
  const counts = reportCounts(rows, day);
  // 어제 근무 칸: 월요일 보고서에서는 빼기 (지난 금요일 이야기라 필요 없음 — 2026-11-23 사용자 요청)
  if (home) parts.push(glance(home, counts, withTitle), weekday(day) === 0 ? "" : yesterdayCards(home));
  else {
    // 홈 숫자가 없을 때 (예전 방식): 칸 사이 세로선, 0명은 흐리게
    const cards = SUMMARY_CARDS.map(([label, color], i) => {
      const n = counts[label];
      return `<td style="width:${100 / SUMMARY_CARDS.length}%;padding:12px 8px 12px 16px;${i ? `border-left:1px solid ${LINE};` : ""}">`
        + `<div style="${TXT}font-size:12px;font-weight:700;color:${SUB}">`
        + `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>${label}</div>`
        + `<div style="${TXT}font-size:26px;font-weight:800;line-height:1.3;color:${n ? color : "#c3c9d4"}">${n}`
        + `<span style="${TXT}font-size:13px;font-weight:600;color:${SUB};margin-left:3px">명</span></div></td>`;
    }).join("");
    parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;`
      + `border:1px solid ${LINE};border-top:0;border-radius:${withTitle ? "0 0 10px 10px" : "10px"}">`
      + `<tr>${cards}</tr></table>`);
  }

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
  const inner = att.length ? attPanels(groupAttendance(att).map(byDept))
    : `<div style="${TXT}color:${SUB};padding:6px 0">오늘 근태 특이사항이 없습니다.</div>`;
  parts.push(section(SECTION_TITLES.근태, att.length, inner));

  // 휴가 일정 (2026-11-17 F안): 왼쪽 미니 달력(휴가 날짜에 점, 보고일 빨간 동그라미) + 오른쪽 사람별 카드(휴가 알약·출근 예정)
  let sub = rows.filter((r) => r.section === "휴가일정");
  if (sub.length) parts.push(scheduleCalendar(day, sub));

  // 휴일·연장 근무 (2026-11-23 C안): 위에 주간 띠(근무 있는 날만 색·인원), 아래에 한 줄씩 목록 (휴일 주황 · 연장 빨강 왼쪽 띠)
  sub = rows.filter((r) => r.section === "휴일근무");
  if (sub.length) parts.push(section(SECTION_TITLES.휴일근무, new Set(sub.map((r) => r.name)).size, workWeek(sub)));

  // 일학습병행(도제)
  sub = rows.filter((r) => r.section === "도제");
  if (sub.length) {
    parts.push(section(SECTION_TITLES.도제, sub.length,
      liteTable([["이름", "180px"], ["출근일", "150px"], ["근무시간", "100px"], ["비고", ""]],
        // 출근한 날이 있으면 근무시간 08:30~16:30, 해당 없음('-')이면 근무시간 '-'에 비고 '사유(기간 총 N일)'
        sub.map((r) => {
          const went = !!r.value.trim() && r.value.trim() !== "-";
          return [`${person(r)}${r.dept ? ` <span style="${TXT}font-size:11px;color:${SUB}">${esc(r.dept)}</span>` : ""}`, went ? esc(r.value) : "-", went ? "08:30~16:30" : "-", esc(r.note) || "-"];
        }))));
  }
  parts.push("</div>");
  return parts.join("");
}

/** 휴일·연장 근무 칸 (2026-11-23 C안). 메일에서도 보이도록 표와 인라인 스타일만. */
function workWeek(sub: ReportRow[]): string {
  const HOL = "#b45309", OT = "#be123c", HOL_BG = "#fdf8ee", OT_BG = "#fff5f7";
  const small = `${TXT}font-size:12px;color:${SUB};`;
  const split = (t: string) => {
    const cut = t.indexOf("/");
    return cut < 0 ? [t.trim(), ""] : [t.slice(0, cut).trim(), t.slice(cut + 1).trim()];
  };
  // 날짜 → (구분|근무지|작업내용) → 사람들
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
  const rk = (r: string) => (RANK_ORDER.includes(r) ? RANK_ORDER.indexOf(r) : RANK_ORDER.length);
  const sortG = (g: ReportRow[]) => {
    const order = [...new Set(g.map((r) => r.dept))];
    return [...g].sort((a, b) => order.indexOf(a.dept) - order.indexOf(b.dept) || rk(a.rank) - rk(b.rank));
  };
  const namesOf = (d: string, ot: boolean) => new Set([...(byDay.get(d)?.values() ?? [])].flat().filter((r) => isOtRow(r) === ot).map((r) => r.name)).size;

  // 주말 달력 (사용자 요청: 주말만): 주말 근무가 있는 첫 주 ~ 마지막 주의 토·일 (최대 8주). 평일 연장근무는 아래 목록에만
  const dates = [...byDay.keys()].filter(Boolean).sort();
  let strip = "";
  const wk = dates.filter((d) => weekday(d) >= 5);
  if (wk.length) {
    const first = addDays(wk[0], 5 - weekday(wk[0]));
    const last = wk[wk.length - 1];
    const lastSun = addDays(last, 6 - weekday(last));
    const days: string[] = [];
    for (let sat = first; sat <= lastSun && days.length < 16; sat = addDays(sat, 7)) days.push(sat, addDays(sat, 1));
    const cell = (d: string) => {
      const h = namesOf(d, false), o = namesOf(d, true);
      const on = h + o > 0;
      const c = h ? HOL : OT;
      const label = `<div style="${TXT}font-size:12px;${on ? `font-weight:700;color:${c}` : `color:${SUB}`}">${esc(dayLabel(d))}</div>`;
      const num = (n: number, col: string, t: string) => n
        ? `<div style="${TXT}font-size:20px;font-weight:800;line-height:1.2;color:${col}">${n}<span style="${TXT}font-size:11px;font-weight:600;color:${col};margin-left:2px">명 ${t}</span></div>` : "";
      const bar = on ? `<div style="height:5px;border-radius:3px;margin-top:5px;background:${h && o ? `linear-gradient(90deg,${HOL} 50%,${OT} 50%)` : c}"></div>` : "";
      const body = on ? num(h, HOL, "휴일") + num(o, OT, "연장") + bar : `<div style="${TXT}font-size:12px;color:#b6bdca;margin-top:4px">없음</div>`;
      return `<div style="border:${on ? `2px solid ${c}` : `1px solid ${LINE}`};background:${on ? (h ? HOL_BG : OT_BG) : "#ffffff"};border-radius:8px;padding:${on ? 7 : 8}px;min-height:62px;box-sizing:border-box">${label}${body}</div>`;
    };
    // 한 줄에 주말 4번(8칸)까지, 주말 사이는 조금 더 띄운다
    const PER = 8, w = 100 / Math.min(PER, days.length);
    const trs: string[] = [];
    for (let i = 0; i < days.length; i += PER) {
      const row = days.slice(i, i + PER);
      trs.push(`<tr>${row.map((d, j) => `<td style="width:${w}%;vertical-align:top;padding:0 ${j === row.length - 1 ? 0 : j % 2 ? 14 : 5}px 6px 0">${cell(d)}</td>`).join("")}</tr>`);
    }
    const legend = (c: string, t: string) => `<span style="${small}margin-left:12px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};vertical-align:-1px;margin-right:5px"></span>${t}</span>`;
    strip = `<div style="text-align:right;margin:-4px 0 6px">${legend(HOL, "휴일근무")}${legend(OT, "연장근무")}</div>`
      + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;table-layout:fixed">${trs.join("")}</table>`;
  }

  // 목록: 근무일 | 근무지 | 작업내용 | 근무자(부서별 한 줄) | 인원
  const TD = `${TXT}font-size:14px;line-height:1.55;padding:10px 12px;border-bottom:1px solid ${LINE};text-align:left;vertical-align:top;`;
  const heads: [string, string][] = [["근무일", "92px"], ["근무지", "120px"], ["작업내용", ""], ["근무자", "230px"], ["인원", "44px"]];
  const head = heads.map(([h, w], i) => `<th style="${HEAD}${w ? `width:${w};` : ""}${i === 4 ? "text-align:right;" : ""}">${h}</th>`).join("");
  const body: string[] = [];
  for (const d of [...byDay.keys()].sort((a, b) => (a || "9").localeCompare(b || "9"))) {
    const groups = [...byDay.get(d)!.values()].sort((a, b) => Number(isOtRow(a[0])) - Number(isOtRow(b[0]))).map(sortG);
    groups.forEach((g, i) => {
      const ot = isOtRow(g[0]);
      const c = ot ? OT : HOL;
      const [place, work] = split(g[0].title);
      const until = ot ? otUntil(g[0]) : "";
      const notes = [...new Set(g.map((x) => x.note.trim()).filter(Boolean))];
      const placeCell = (place ? `<div style="${TXT}font-size:13px;font-weight:700;color:${c}">${esc(place)}</div>` : `<span style="color:${SUB}">-</span>`)
        + (until ? `<div style="${TXT}font-size:12px;font-weight:700;color:${OT}">~${esc(until)}</div>` : "");
      const workCell = (work ? `<div style="${TXT}font-weight:700">${esc(work)}</div>` : `<span style="color:${SUB}">-</span>`)
        + notes.map((n) => `<div style="${small}margin-top:2px">${esc(n)}</div>`).join("");
      const people = [...new Set(g.map((r) => r.dept))].map((dp) =>
        `<div style="${TXT}font-size:13px;line-height:1.6">${dp ? `<span style="${small}margin-right:6px">${esc(dp)}</span>` : ""}`
        + g.filter((r) => r.dept === dp).map((r) => `${esc(r.name)}${r.rank ? `<span style="${small}"> ${esc(r.rank)}</span>` : ""}`).join(`<span style="color:#c3c9d4"> · </span>`)
        + `</div>`).join("");
      const dayCell = i ? "" : `<div style="${TXT}font-weight:700;white-space:nowrap">${d ? esc(dayLabel(d)) : "-"}</div>`;
      body.push(`<tr><td style="${TD}border-left:4px solid ${c};">${dayCell}</td><td style="${TD}">${placeCell}</td><td style="${TD}">${workCell}</td>`
        + `<td style="${TD}">${people}</td><td style="${TD}text-align:right;font-weight:800;color:${c}">${g.length}</td></tr>`);
    });
  }
  return strip + `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:8px"><tr>${head}</tr>${body.join("")}</table>`;
}

/** 근태 현황 칸 그리기 (2026-11-11 메모지형): 있는 종류만, 종류마다 한 줄 전체를 쓰고
 *  그 안에 근무지(건)마다 네모난 메모지 타일을 3개씩 나란히 둔다. 메일에서도 나란히 보이도록 표로. */
const PANEL_SOFT: Record<string, [string, string]> = { // 타일 바탕, 타일 테두리
  휴가: ["#ffffff", LINE], 출장: ["#ffffff", LINE], 교육: ["#ffffff", LINE],
  외근: ["#ffffff", LINE], 휴일근무: ["#ffffff", LINE],
};
function attPanels(groups: ReportRow[][]): string {
  const small = `${TXT}font-size:12px;color:${SUB};`;
  const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  // 사람: 부서마다 한 줄 '부서  이름 직급 · 이름 직급'
  const ppl = (g: ReportRow[]) => [...new Set(g.map((r) => r.dept))].map((dp) =>
    `<div style="${TXT}font-size:13px;line-height:1.6">${dp ? `<span style="${small}margin-right:6px">${esc(dp)}</span>` : ""}`
    + g.filter((r) => r.dept === dp).map((r) => `<b>${esc(r.name)}</b>${r.rank ? `<span style="${small}"> ${esc(r.rank)}</span>` : ""}`).join(`<span style="color:#c3c9d4"> · </span>`)
    + `</div>`).join("");
  const tile = (panel: string, g: ReportRow[]) => {
    const r = g[0];
    const [bg, bd] = PANEL_SOFT[panel] ?? ["#f7f8fb", LINE];
    // 메모지 한 장 = [머리: 제목 | 오른쪽 작은 표시] / [한 줄 설명] / 점선 / [사람]
    const head = (title: string, right: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>`
      + `<td style="${TXT}font-size:14px;font-weight:800;line-height:1.35;vertical-align:top">${title}</td>`
      + `<td style="text-align:right;vertical-align:top;white-space:nowrap;padding-left:6px">${right}</td></tr></table>`;
    const line = (t: string) => `<div style="${TXT}font-size:12.5px;color:#3b4558;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t || "&nbsp;"}</div>`;
    const foot = (inner: string) => `<div style="border-top:1px dashed ${bd};margin-top:8px;padding-top:6px">${inner}</div>`;
    const box = (inner: string) => `<div style="background:${bg};border:1px solid ${bd};border-radius:10px;padding:10px 12px;min-height:86px;box-sizing:border-box">${inner}</div>`;
    if (panel === "휴가") {
      const unit = leaveUnit(r.types);
      const time = unit === "day" ? "종일" : timeLabel(r.detail);
      return box(head(g.map((x) => `${esc(x.name)}${x.rank ? `<span style="${small}font-weight:400"> ${esc(x.rank)}</span>` : ""}`).join(", "),
        splitReportTypes(r.types).map(badge).join(""))
        + line(esc([r.title.trim(), time].filter(Boolean).join(" · ")))
        + foot(`<div style="${small}">${esc([...new Set(g.map((x) => x.dept))].filter(Boolean).join(" · "))}</div>`));
    }
    const v = parseAttValue(r.value);
    const when = v.from && v.to ? `${md(v.from)}~${md(v.to)}` : "당일";
    const extra = splitReportTypes(r.types).filter((t) => t !== panel && !(panel === "휴일근무" && t === "연장근무"));
    return box(head(esc(r.title.trim() || "-"), `<span style="${small}font-weight:700">${when}</span>`)
      + line(esc(r.detail.trim()) + (extra.length ? ` ${extra.map(badge).join("")}` : ""))
      + foot(ppl(g)));
  };
  // 휴가 (2026-11-23 1안): 메모지 대신 한 사람 한 줄 표 — 종류(묶음 첫 줄에만, 인원) | 이름 직급 | 부서 | 시간·사유, 세로로 줄 맞춤
  // 휴가 (2026-11-23 2안+4안): 종류마다 한 줄 — 왼쪽 종류·시간·인원, 오른쪽 부서별 이름표.
  // 반차·반반차·외출(시간이 있는 휴가)만 사람마다 하루 시간 막대(08:30~17:30)를 붙여 언제 자리를 비우는지 보여 준다.
  const leaveTable = (gs: ReportRow[][]) => {
    const DAY0 = 8 * 60 + 30, DAY1 = 17 * 60 + 30;
    const hm = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim()); return m ? +m[1] * 60 + +m[2] : null; };
    const span = (detail: string) => {
      const m = /^\s*(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})\s*$/.exec(detail ?? "");
      const a = m ? hm(m[1]) : null, b = m ? hm(m[2]) : null;
      return a !== null && b !== null && b > a ? [Math.max(DAY0, a), Math.min(DAY1, b)] as const : null;
    };
    const rk = (x: string) => (RANK_ORDER.includes(x) ? RANK_ORDER.indexOf(x) : RANK_ORDER.length);
    const byType = new Map<string, ReportRow[]>();
    for (const r of gs.flat()) {
      const k = [...splitReportTypes(r.types)].sort().join(",");
      byType.set(k, [...(byType.get(k) ?? []), r]);
    }
    const chip = (r: ReportRow, bd: string) => `<span style="display:inline-block;${TXT}font-size:13px;background:#ffffff;border:1px solid ${bd};border-radius:999px;padding:1px 10px;margin:0 4px 4px 0;white-space:nowrap">`
      + `<b>${esc(r.name)}</b>${r.rank ? `<span style="${small}"> ${esc(r.rank)}</span>` : ""}</span>`;
    const deptLabel = (dp: string) => `<td style="${small}width:52px;vertical-align:top;padding-top:3px;white-space:nowrap">${esc(dp) || "-"}</td>`;
    /** 막대 안에 시간 글자가 들어갈 만큼 긴지 (아니면 오른쪽에 시간을 다 적는다) */
    const wide = (detail: string) => { const sp = span(detail); return !!sp && ((sp[1] - sp[0]) / (DAY1 - DAY0)) * 100 > 14; };
    const bar = (detail: string, fg: string) => {
      const sp = span(detail);
      if (!sp) return "";
      const tot = DAY1 - DAY0, w0 = ((sp[0] - DAY0) / tot) * 100, w1 = ((sp[1] - sp[0]) / tot) * 100, w2 = Math.max(0, 100 - w0 - w1);
      const cell = (w: number, bg: string, inner = "") => (w > 0.5 ? `<td style="width:${w.toFixed(1)}%;height:16px;background:${bg};${inner ? `${TXT}font-size:11px;font-weight:700;color:#ffffff;padding:0 6px;white-space:nowrap;overflow:hidden;` : ""}">${inner}</td>` : "");
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-radius:5px;overflow:hidden"><tr>`
        + cell(w0, "#eef1f5") + cell(w1, fg, w1 > 14 ? esc(detail.replace(/\s/g, "")) : "") + cell(w2, "#eef1f5") + `</tr></table>`;
    };
    const blocks = [...byType.entries()].map(([k, rs]) => {
      const types = k.split(",");
      // 사유 칸에 종류 이름(연차 등)만 적힌 경우는 왼쪽에 이미 있으니 다시 적지 않는다
      const why = (r: ReportRow) => { const t = r.title.trim(); return t && !types.includes(t) && !SCHEDULE_TYPES.includes(t) ? t : ""; };
      const [fg] = BADGE[types[0]] ?? ["#1f8a3b", "#e3f4e8"];
      const [bgSoft, bd] = ["#ffffff", LINE];
      const timed = rs.some((r) => span(r.detail));
      const order = [...new Set(rs.map((r) => r.dept))];
      const sorted = [...rs].sort((a, b) => order.indexOf(a.dept) - order.indexOf(b.dept) || rk(a.rank) - rk(b.rank));
      const allDay = leaveUnit(k) === "day";
      const left = `<td style="width:96px;vertical-align:top;padding:10px 0 10px 12px">${types.map(hlBadge).join(" ")}`
        + `<div style="${TXT}font-size:12px;color:#3b4558;margin-top:2px">${allDay ? "종일 · " : ""}${new Set(rs.map((r) => r.name)).size}명</div></td>`;
      let right: string;
      if (timed) {
        // 사람마다 한 줄: 부서 | 이름표 | 시간 막대 | 사유
        const axis = `<tr><td></td><td></td><td style="padding:0 0 2px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>`
          + `<td style="${small}font-size:10px">08:30</td><td style="${small}font-size:10px;text-align:right">17:30</td></tr></table></td><td></td></tr>`;
        right = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${axis}`
          + sorted.map((r, i) => `<tr>${deptLabel(i && sorted[i - 1].dept === r.dept ? "" : r.dept)}`
            + `<td style="width:130px;vertical-align:middle">${chip(r, bd)}</td>`
            + `<td style="vertical-align:middle;padding:0 0 4px">${bar(r.detail, fg) || `<span style="${small}">${esc(timeLabel(r.detail) || r.detail)}</span>`}</td>`
            + `<td style="${small}vertical-align:middle;padding:0 0 4px 8px;width:150px">${esc([wide(r.detail) ? timeLabel(r.detail).replace(/^.*\(/, "(") : timeLabel(r.detail), why(r)].filter(Boolean).join(" "))}</td></tr>`).join("")
          + `</table>`;
      } else {
        // 부서마다 한 줄: 부서 | 이름표들 (사유는 이름 뒤 괄호)
        right = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">`
          + order.map((dp) => `<tr>${deptLabel(dp)}<td style="vertical-align:top">`
            + sorted.filter((r) => r.dept === dp).map((r) => chip(r, bd) + (why(r) ? `<span style="${small}margin:0 8px 0 -2px">(${esc(why(r))})</span>` : "")).join("")
            + `</td></tr>`).join("")
          + `</table>`;
      }
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;background:${bgSoft};border:1px solid ${bd};border-radius:10px;margin-bottom:8px"><tr>`
        + left + `<td style="vertical-align:top;padding:10px 14px 6px 10px">${right}</td></tr></table>`;
    });
    return blocks.join("");
  };
  const COLS = 3;
  return ATT_PANELS.map(([name, color]) => {
    const gs = groups.filter((g) => panelOf(g[0].types) === name);
    if (!gs.length) return "";
    const n = new Set(gs.flat().map((r) => r.name)).size;
    if (name === "휴가") {
      return `<div style="margin-bottom:12px">`
        + `<div style="${TXT}font-size:13px;font-weight:800;color:${color};margin-bottom:6px">`
        + `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>${name}`
        + `<span style="${small}font-weight:700;margin-left:6px">${n}명</span></div>${leaveTable(gs)}</div>`;
    }
    const cells = gs.map((g) => tile(name, g));
    const trs: string[] = [];
    for (let i = 0; i < cells.length; i += COLS) {
      const row = cells.slice(i, i + COLS);
      while (row.length < COLS) row.push("");
      trs.push(`<tr>${row.map((c, j) => `<td style="width:${100 / COLS}%;vertical-align:top;padding:0 ${j < COLS - 1 ? 8 : 0}px 8px 0">${c}</td>`).join("")}</tr>`);
    }
    return `<div style="margin-bottom:12px">`
      + `<div style="${TXT}font-size:13px;font-weight:800;color:${color};margin-bottom:6px">`
      + `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>${name}`
      + `<span style="${small}font-weight:700;margin-left:6px">${n}명</span></div>`
      + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;table-layout:fixed">${trs.join("")}</table></div>`;
  }).join("");
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
/** 휴가일정 중 보고일(과 이미 지난 날)은 휴가일정에서 빼고, 보고일 휴가는 근태현황 '휴가'에 올린다 (보고서 그릴 때만, 2026-11-11).
 *  같은 사람·같은 종류가 이미 근태현황에 있으면 다시 올리지 않는다. 남은 날짜가 없으면 휴가일정 줄을 뺀다. */
export function scheduleToday(day: DateStr, rows: ReportRow[]): ReportRow[] {
  const out: ReportRow[] = [];
  const add: ReportRow[] = [];
  for (const r of rows) {
    const ds = r.section === "휴가일정" && r.types ? splitReportTypes(r.types).filter(isDateStr).sort() : [];
    if (!ds.length || !ds.some((d) => d <= day)) { out.push(r); continue; }
    if (ds.includes(day) && r.title) {
      const has = rows.some((x) => x.section === "근태" && x.name === r.name && splitReportTypes(x.types).includes(r.title));
      if (!has) add.push({ ...r, section: "근태", types: r.title, title: r.note.trim(), detail: r.detail, value: "", note: "" });
    }
    const rest = ds.filter((d) => d > day);
    if (!rest.length) continue;
    if (isPartialSchedule(r.title)) { out.push({ ...r, types: rest.join(",") }); continue; }
    // 하루 종일 휴가: 묶음별 출근 예정(value)을 남은 날짜에 맞춰 다시 짝짓는다
    const runs = scheduleRuns(r);
    if (!runs) { out.push({ ...r, types: rest.join(",") }); continue; }
    const keep = runs.map(([run, b]) => [run.filter((d) => d > day), b] as const).filter(([run]) => run.length);
    out.push({ ...r, types: keep.flatMap(([run]) => run).join(","), value: keep.map(([, b]) => b).join(", ") });
  }
  return [...out, ...add];
}

export function summaryText(rows: ReportRow[]): string {
  const counts: Record<string, number> = {};
  for (const r of rows.filter((x) => x.section === "근태")) {
    for (const t of splitReportTypes(r.types)) counts[t] = (counts[t] ?? 0) + 1;
  }
  return [...LEAVE_TYPES, "외근"].filter((t) => t in counts).map((t) => `${t} ${counts[t]}`).join(", ") || "특이사항 없음";
}
