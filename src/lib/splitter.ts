/** 직원별 시트 분할과 엑셀/ZIP 파일 만들기 (관리팀 수작업 양식과 같은 모양). 서버 전용. */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { type DayRow, splitTypes, workTypeIn, workTypeOut } from "./analytics";
import type { WorkRule } from "./config";
import type { CapsRecord } from "./loader";
import { hhmm, type Ts, tsHM, tsTime } from "./time";

const INVALID_SHEET_CHARS = /[[\]:*?/\\]/g;
const INVALID_FILE_CHARS = /[<>:"/\\|?*]/g;
const HEADER_FILL = "FFDDEBF7";
const WARN_FILL = "FFFCE4D6";
const LEAVE_FILL = "FFE2EFDA";
const BLANK_FILL = "FFEDEDED";

export const SHEET_COLUMNS = ["요일", "발생일자", "발생시각", "이름", "근무형태", "모드", "인증", "근무지", "비고", "확인"];
export const RAW_COLUMNS = ["요일", "발생일자", "발생시각", "이름", "근무형태", "모드", "인증", "근무지", "비고"];
export const SUMMARY_COLUMNS = ["직원", "부서", "출근일수", "평균출근", "평균퇴근", "평균체류(h)", "지각", "조퇴",
  "기록 없음", "태그 누락", "휴일근무", "휴가사용(일)", "출장·교육"];
const PLACE_TYPES = new Set(["출장", "외근", "교육"]);
// 날짜·요일만 남기고 비워 두는 예외 상태
const BLANK_STATUSES = new Set(["기록 없음", "출근 기록 없음", "퇴근 기록 없음", "휴일근무(기록 없음)"]);

export type SheetRow = string[]; // SHEET_COLUMNS 순서

/** 엑셀 시트 이름 규칙(31자, 특수문자 금지, 중복 불가)에 맞게 바꾼다. */
export function safeSheetName(name: string, used: Set<string>): string {
  const base = (String(name).replace(INVALID_SHEET_CHARS, "_").replace(/^['\s]+|['\s]+$/g, "") || "Sheet").slice(0, 31);
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = `_${i}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const oneLine = (text: string) => String(text).split(/\s+/).filter(Boolean).join(" ");

/** 근무형태 자동 표기. 수작업 시트처럼 특이한 날만 적는다 (rule.labelAll이면 모든 행). */
export function workTypeLabel(kind: "출근" | "퇴근", t: Ts, holiday: boolean, filled: boolean, rule: WorkRule): string {
  if (filled) return `정상${kind}(${hhmm(kind === "출근" ? rule.start : rule.end)})`; // 하이웍스로 채운 출장·교육 시각
  if (holiday) return kind === "출근" ? workTypeIn(t, true, rule) : workTypeOut(t, true, rule);
  const label = kind === "출근" ? workTypeIn(t, false, rule) : workTypeOut(t, false, rule);
  return label.startsWith("연장") || rule.labelAll ? label : "";
}

/** 한 직원의 일별 근태표 -> 날짜별 출근 1줄 + 퇴근 1줄 (기록 없는 날은 1줄). */
export function employeeRows(days: DayRow[], rule: WorkRule): SheetRow[] {
  const out: SheetRow[] = [];
  for (const d of [...days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    const types = splitTypes(d.leave);
    const content = d.leaveContent;
    const place = types.some((t) => PLACE_TYPES.has(t) || t === "휴일근무") ? oneLine(content.split("\n")[0]) : "";
    const mates = d.mates.replaceAll(", ", "\n");
    const otherTypes = types.filter((t) => !PLACE_TYPES.has(t) && t !== "휴일근무");
    const leaveNote = otherTypes.length
      ? content ? `${otherTypes.join(", ")}: ${oneLine(content)}` : otherTypes.join(", ")
      : "";
    const note = mates || leaveNote;
    let check = d.status === "정상" || d.status === "휴일근무" ? [] : [d.status];
    if (d.status === "퇴근 기록 없음" && d.lastTag !== null && d.in !== null && d.lastTag > d.in) {
      check = [`퇴근 기록 없음(마지막 태그 ${tsHM(d.lastTag)})`];
    }
    check.push(...types.filter((t) => !check.includes(t) && t !== "휴일근무"));
    const checkText = check.join(", ");
    const ovPlace = d.ovPlace, ovNote = d.ovNote;

    if (BLANK_STATUSES.has(d.status)) {
      // 기록 없음·출근만·퇴근만 있는 날: 대개 휴가 또는 미연동이라 날짜·요일만 적고 나머지는 비운다
      out.push([d.wd, d.day, "", "", "", "", "", ovPlace ?? "", ovNote ?? "", ""]);
      continue;
    }
    if (d.in === null && d.out === null) {
      out.push([d.wd, d.day, d.status, "", "", "", "", ovPlace ?? place, ovNote ?? note, checkText]);
      continue;
    }
    for (const kind of ["출근", "퇴근"] as const) {
      const t = kind === "출근" ? d.in : d.out;
      if (t === null) continue;
      const rec = kind === "출근" ? d.inRec : d.outRec;
      const src = kind === "출근" ? d.inSrc : d.outSrc;
      let name: string, auth: string, rawWt: string, rawPlace: string, rawNote: string;
      if (rec) [name, auth, rawWt, rawPlace, rawNote] = [rec.name, rec.auth, rec.workType, rec.place, rec.note];
      else [name, auth, rawWt, rawPlace, rawNote] = [d.emp, src || "하이웍스", "", "", ""]; // 하이웍스로 채웠거나 웹에서 기입한 시각
      const filled = src === "하이웍스";
      let wt = kind === "출근" ? d.ovInType : d.ovOutType;
      if (wt === null && kind === "퇴근" && types.includes("연장근무")) {
        const m = /~\s*(\d{1,2}):(\d{2})/.exec(content);
        if (m) wt = `연장(${m[1].padStart(2, "0")}:${m[2]})`;
      }
      if (wt === null) wt = rawWt || workTypeLabel(kind, t, d.holiday, filled, rule);
      out.push([d.wd, d.day, tsTime(t), name, wt, kind, auth, ovPlace ?? (rawPlace || place),
        ovNote ?? (rawNote || note), checkText]);
    }
  }
  return out;
}

/** 캡스 원본과 같은 열 구성의 전체 기록. */
export function rawRows(records: CapsRecord[]): string[][] {
  return records.map((r) => [r.wd, r.day, tsTime(r.ts), r.name || r.emp, r.workType, r.mode, r.auth, r.place, r.note]);
}

type Value = string | number | null;

function autofit(ws: ExcelJS.Worksheet, minRow = 1): void {
  const widths = new Map<number, number>();
  ws.eachRow((row, r) => {
    if (r < minRow) return;
    row.eachCell((cell, c) => {
      if (cell.value === null || cell.value === undefined) return;
      const len = Math.max(...String(cell.value).split("\n").map((l) => l.length));
      widths.set(c, Math.max(widths.get(c) ?? 2, len));
    });
  });
  for (let c = 1; c <= ws.columnCount; c++) ws.getColumn(c).width = Math.min(Math.max((widths.get(c) ?? 2) * 1.7, 6), 45);
}

function styleHeader(ws: ExcelJS.Worksheet, row: number): void {
  ws.getRow(row).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center" };
  });
}

function writeTable(ws: ExcelJS.Worksheet, header: string[], rows: Value[][], startRow = 1, startCol = 1): void {
  [header, ...rows].forEach((vals, i) => {
    const row = ws.getRow(startRow + i);
    vals.forEach((v, j) => {
      if (v !== null && v !== "") row.getCell(startCol + j).value = v;
    });
  });
}

function writeEmployeeSheet(ws: ExcelJS.Worksheet, title: string, rows: SheetRow[]): void {
  // 수작업 양식: B2 제목, B4 헤더, B5부터 데이터
  writeTable(ws, SHEET_COLUMNS, rows, 4, 2);
  const t = ws.getCell(2, 2);
  t.value = title;
  t.font = { bold: true, size: 13 };
  styleHeader(ws, 4);
  const checkCol = SHEET_COLUMNS.indexOf("확인");
  const timeCol = SHEET_COLUMNS.indexOf("발생시각");
  rows.forEach((r, i) => {
    const check = r[checkCol], timeVal = r[timeCol];
    let fill: string;
    if (!timeVal) fill = BLANK_FILL; // 날짜·요일만 있는 예외 행: 연한 회색으로 표시만
    else if (!/^\d/.test(timeVal)) fill = LEAVE_FILL; // 연차·공가 등
    else if (check && (check.includes("지각") || check.includes("조퇴"))) fill = WARN_FILL;
    else return;
    for (let c = 2; c < 2 + SHEET_COLUMNS.length; c++) {
      ws.getCell(5 + i, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    }
  });
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
  autofit(ws, 4);
}

export interface WorkbookInput {
  records: CapsRecord[];
  days: DayRow[];
  employees: string[];
  rule: WorkRule;
  summary?: Value[][] | null; // SUMMARY_COLUMNS 순서
  label?: string;
  includeRaw?: boolean;
}

/** [N월 전체] + [요약] + 직원별 시트 엑셀. */
export async function buildWorkbook(
  { records, days, employees, rule, summary = null, label = "", includeRaw = true }: WorkbookInput,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  if (includeRaw) {
    const ws = wb.addWorksheet(safeSheetName(`${label} 전체`.trim(), used));
    writeTable(ws, RAW_COLUMNS, rawRows(records));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    styleHeader(ws, 1);
    autofit(ws);
  }
  if (summary?.length) {
    const ws = wb.addWorksheet(safeSheetName("요약", used));
    writeTable(ws, SUMMARY_COLUMNS, summary);
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
    styleHeader(ws, 1);
    autofit(ws);
  }
  for (const emp of employees) {
    const d = days.filter((x) => x.emp === emp);
    if (!d.length) continue;
    const title = `${d[0].dept} ${emp}`.trim();
    writeEmployeeSheet(wb.addWorksheet(safeSheetName(emp, used)), title, employeeRows(d, rule));
  }
  if (!used.size) { // 빈 통합문서 방지
    writeTable(wb.addWorksheet("안내"), ["안내"], [["선택한 조건에 맞는 기록이 없습니다."]]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** 직원 한 명당 엑셀 파일 하나씩 묶은 ZIP. */
export async function buildZip(records: CapsRecord[], days: DayRow[], employees: string[], rule: WorkRule,
  label = ""): Promise<Buffer> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const emp of employees) {
    if (!days.some((d) => d.emp === emp)) continue;
    let fname = `${label} ${emp}`.trim().replace(INVALID_FILE_CHARS, "_");
    while (used.has(fname.toLowerCase())) fname += "_";
    used.add(fname.toLowerCase());
    const data = await buildWorkbook({
      records: records.filter((r) => r.emp === emp), days, employees: [emp], rule, label, includeRaw: false,
    });
    zip.file(`${fname}.xlsx`, data);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
