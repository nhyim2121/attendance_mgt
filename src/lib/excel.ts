/** 엑셀(.xls·.xlsx)·CSV·HTML(.xls로 저장된 표)을 헤더 없이 칸 단위 표로 읽는다. 서버 전용. */
import * as XLSX from "xlsx";
import * as cptable from "xlsx/dist/cpexcel.full";

XLSX.set_cptable(cptable);

/** 엑셀 날짜·시각 서식 칸. 시간대 없이 칸에 보이는 값 그대로. */
export interface ExcelDate {
  kind: "date";
  y: number;
  m: number;
  d: number;
  H: number;
  M: number;
  S: number;
  timeOnly: boolean; // 시각만 있는 칸 (일련번호 < 1)
}

export type Cell = string | number | boolean | ExcelDate | null;
export type Grid = Cell[][];
export type Sheets = [name: string, grid: Grid][]; // 시트 순서 유지

export function isExcelDate(v: unknown): v is ExcelDate {
  return typeof v === "object" && v !== null && (v as ExcelDate).kind === "date";
}

export function excelDate(y: number, m: number, d: number, H = 0, M = 0, S = 0, timeOnly = false): ExcelDate {
  return { kind: "date", y, m, d, H, M, S, timeOnly };
}

function decodeText(buf: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    try {
      return new TextDecoder("euc-kr").decode(buf);
    } catch {
      throw new Error("파일 인코딩을 인식할 수 없습니다 (UTF-8, CP949만 지원).");
    }
  }
}

function looksLikeHtml(buf: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(buf.slice(0, 512)).replace(/^﻿/, "").trimStart().toLowerCase();
  return head.startsWith("<");
}

function toCell(c: XLSX.CellObject | undefined): Cell {
  if (!c) return null;
  switch (c.t) {
    case "n": {
      const v = c.v as number;
      if (c.z && XLSX.SSF.is_date(c.z as string)) {
        const p = XLSX.SSF.parse_date_code(v);
        if (p) return excelDate(p.y, p.m, p.d, p.H, p.M, Math.floor(p.S), v < 1);
      }
      return v;
    }
    case "s":
      return (c.v as string) === "" ? null : (c.v as string);
    case "b":
      return c.v as boolean;
    case "d": {
      const x = c.v as Date;
      return excelDate(x.getFullYear(), x.getMonth() + 1, x.getDate(), x.getHours(), x.getMinutes(), x.getSeconds());
    }
    default:
      return null;
  }
}

function sheetGrid(ws: XLSX.WorkSheet): Grid {
  if (!ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const dense = (ws as { "!data"?: XLSX.CellObject[][] })["!data"];
  const grid: Grid = [];
  for (let r = 0; r <= range.e.r; r++) {
    const row: Cell[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      row.push(toCell(dense ? dense[r]?.[c] : ws[XLSX.utils.encode_cell({ r, c })]));
    }
    grid.push(row);
  }
  return grid;
}

/** 파일의 모든 시트를 헤더 없이 읽는다. */
export function readRaw(data: Uint8Array, filename: string): Sheets {
  const name = filename.toLowerCase();
  let wb: XLSX.WorkBook;
  try {
    if (name.endsWith(".csv")) {
      wb = XLSX.read(decodeText(data), { type: "string", raw: true });
      return [["CSV", sheetGrid(wb.Sheets[wb.SheetNames[0]])]];
    }
    if (looksLikeHtml(data)) {
      // 일부 출입관리 프로그램은 HTML 표를 .xls 확장자로 저장한다.
      wb = XLSX.read(decodeText(data), { type: "string", raw: true });
      return wb.SheetNames.map((s, i) => [`표${i + 1}`, sheetGrid(wb.Sheets[s])]);
    }
    wb = XLSX.read(data, { type: "array", cellNF: true, cellDates: false });
  } catch (exc) {
    throw new Error(`엑셀 파일을 읽을 수 없습니다: ${(exc as Error).message}`);
  }
  return wb.SheetNames.map((s) => [s, sheetGrid(wb.Sheets[s])]);
}
