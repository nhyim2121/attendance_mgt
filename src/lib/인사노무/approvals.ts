/** 하이웍스 전자결재 '근무계획 수립이력' 내보내기(.xls = HTML 표) 읽기와 근태로 바꾸기.
 *
 * 열: 기안일 | 제목 | 기안자 | 결재완료일 | 결재상태
 * 제목 예:
 *   휴가 신청(장경천) - 2026년 11월 2일(1일)/연차
 *   휴가 신청(박민수) - 2026년 10월 30일(2시간)/반반차
 *   휴가 신청(…) - 2026년 10월 27일~2026년 10월 29일(3일)/연차
 *   휴가 취소(…) - 2026년 10월 20일(4시간)/반차
 *   연장 근무 신청(…) - 2026년 10월 29일(17:30 ~ 23:00)
 *   휴(무)일근무 신청(…) - 2026년 10월 31일
 * 결재완료만 근태로 쓴다 (반려·관리자 기안 취소 등은 저장만 하고 쓰지 않음). 휴가 취소는 같은 사람·날·종류의 휴가를 지운다.
 */
import type { Leave } from "./leave";
import { addDays, type DateStr, makeDate } from "../time";

export interface Approval {
  key: string; // 기안자|기안일|제목
  draftedAt: string;
  title: string;
  name: string;
  doneAt: string;
  status: string;
  kind: "휴가" | "휴가취소" | "연장근무" | "휴일근무" | "기타";
  type: string; // 휴가 종류 (연차·월차·반차·반반차·외출·경조휴가 …), 연장근무, 휴일근무
  dayFrom: DateStr | null;
  dayTo: DateStr | null;
  amount: string; // '1일', '4시간', '1시간 30분'
  timeFrom: string;
  timeTo: string;
}

const APPROVED = "결재완료";
const HEADER = ["기안일", "제목", "기안자", "결재완료일", "결재상태"];

const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

/** HTML 표 -> 칸 배열 (첫 줄은 머리) */
export function htmlRows(html: string): string[][] {
  const rows: string[][] = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => strip(m[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

const DATE = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g;
const toDate = (y: string, m: string, d: string) => makeDate(+y, +m, +d);

/** 제목 한 줄 풀기 */
export function parseTitle(title: string): Pick<Approval, "kind" | "type" | "dayFrom" | "dayTo" | "amount" | "timeFrom" | "timeTo"> {
  const t = title.replace(/\s+/g, " ").trim();
  const head = t.split(" - ")[0].replace(/\s/g, "");
  const dates = [...t.matchAll(DATE)].map((m) => toDate(m[1], m[2], m[3])).filter((x): x is DateStr => !!x);
  const dayFrom = dates[0] ?? null, dayTo = dates[1] ?? dates[0] ?? null;
  const base = { dayFrom, dayTo, amount: "", timeFrom: "", timeTo: "" };
  const span = /(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/.exec(t);
  if (head.startsWith("연장근무")) {
    return { ...base, kind: "연장근무", type: "연장근무",
      timeFrom: span ? `${span[1].padStart(2, "0")}:${span[2]}` : "", timeTo: span ? `${span[3].padStart(2, "0")}:${span[4]}` : "" };
  }
  if (/^휴\(?무?\)?일근무/.test(head)) return { ...base, kind: "휴일근무", type: "휴일근무" };
  if (head.startsWith("휴가신청") || head.startsWith("휴가취소")) {
    const kind = head.startsWith("휴가취소") ? "휴가취소" : "휴가";
    const amount = /\(([^()]*(?:일|시간|분))\)\s*\/?/.exec(t.slice(t.indexOf(" - ")))?.[1]?.trim() ?? "";
    let type = (/\/\s*([^/]+?)\s*$/.exec(t)?.[1] ?? "").replace(/\s*외$/, "").trim();
    if (type === "경조사") type = "경조휴가";
    return { ...base, kind, type, amount };
  }
  return { ...base, kind: "기타", type: "" };
}

/** 근무계획 수립이력 파일 -> 결재 목록. 형식이 아니면 오류. */
export function parseApprovalFile(text: string): Approval[] {
  const rows = htmlRows(text);
  const hi = rows.findIndex((r) => HEADER.every((h) => r.includes(h)));
  if (hi < 0) throw new Error("하이웍스 '근무계획 수립이력' 파일이 아닙니다 (기안일·제목·기안자·결재완료일·결재상태 열이 없음).");
  const col = Object.fromEntries(HEADER.map((h) => [h, rows[hi].indexOf(h)]));
  const out: Approval[] = [];
  for (const r of rows.slice(hi + 1)) {
    const title = r[col["제목"]] ?? "", name = r[col["기안자"]] ?? "", draftedAt = r[col["기안일"]] ?? "";
    if (!title || !name) continue;
    out.push({
      key: `${name}|${draftedAt}|${title}`, draftedAt, title, name, doneAt: r[col["결재완료일"]] ?? "", status: r[col["결재상태"]] ?? "",
      ...parseTitle(title),
    });
  }
  return out;
}

/** '1시간 30분' -> 1.5 */
export function amountHours(a: string): number {
  const h = /(\d+(?:\.\d+)?)\s*시간/.exec(a), m = /(\d+)\s*분/.exec(a);
  return (h ? +h[1] : 0) + (m ? +m[1] / 60 : 0);
}

/** 결재완료 휴가·연장·휴일근무 -> 근태. 취소된 건의 키(day|name|type)도 함께 돌려준다. */
export function approvalsToLeaves(list: Approval[], isWorkday: (d: DateStr) => boolean): { leaves: Leave[]; cancels: Set<string> } {
  const leaves: Leave[] = [], cancels = new Set<string>();
  const ok = list.filter((a) => a.status === APPROVED && a.dayFrom);
  const days = (a: Approval) => {
    const out: DateStr[] = [];
    for (let d = a.dayFrom!; d <= (a.dayTo ?? a.dayFrom!); d = addDays(d, 1)) out.push(d);
    return out;
  };
  for (const a of ok) {
    if (a.kind === "휴가취소") {
      for (const d of days(a)) cancels.add(`${d}|${a.name}|${leaveType(a)}`);
      continue;
    }
    if (a.kind === "기타") continue;
    const base = { name: a.name, dept: "", rank: "", note: "", sheet: "하이웍스 결재" };
    if (a.kind === "연장근무") {
      leaves.push({ ...base, day: a.dayFrom!, type: "연장근무", content: `연장근무${a.timeFrom ? `\n${a.timeFrom}~${a.timeTo}` : ""}` });
      continue;
    }
    if (a.kind === "휴일근무") {
      for (const d of days(a)) leaves.push({ ...base, day: d, type: "휴일근무", content: "휴(무)일근무" });
      continue;
    }
    const type = leaveType(a);
    if (type === "외출") {
      // 여러 날에 걸친 '외출 외'는 첫날에 시간을 모두 적는다 (하이웍스 제목에 날짜별 시간이 없음)
      leaves.push({ ...base, day: a.dayFrom!, type, content: `외출 ${a.amount}${a.dayTo && a.dayTo !== a.dayFrom ? ` (${a.dayFrom}~${a.dayTo} 합계)` : ""}` });
      continue;
    }
    const ds = days(a);
    const many = ds.length > 1;
    for (const d of ds) {
      if (many && !isWorkday(d)) continue;
      leaves.push({ ...base, day: d, type, content: `${a.type}${a.amount ? ` (${a.amount})` : ""}` });
    }
  }
  return { leaves, cancels };
}

/** 휴가 종류: 시간 단위 연차는 4시간=반차, 2시간=반반차, 그 밖의 시간은 외출(시간 차감)로 */
function leaveType(a: Approval): string {
  const t = a.type || "연차";
  if ((t === "연차" || t === "월차") && /시간|분/.test(a.amount)) {
    const h = amountHours(a.amount);
    return h === 4 ? "반차" : h === 2 ? "반반차" : "외출";
  }
  return t;
}

/** 결재 목록 요약 (올린 뒤 안내) */
export function summarize(list: Approval[]) {
  const c = (f: (a: Approval) => boolean) => list.filter(f).length;
  return {
    total: list.length,
    vacation: c((a) => a.kind === "휴가" && a.status === APPROVED),
    cancel: c((a) => a.kind === "휴가취소" && a.status === APPROVED),
    overtime: c((a) => a.kind === "연장근무" && a.status === APPROVED),
    holiday: c((a) => a.kind === "휴일근무" && a.status === APPROVED),
    skipped: c((a) => a.status !== APPROVED),
  };
}
