import { SHEET_COLUMNS, type SheetRow } from "@/lib/splitter";

/** 엑셀과 같은 색 구분: 날짜만 있는 행 회색, 연차·공가 등 초록, 지각·조퇴 주황 */
export function rowClass(r: SheetRow): string {
  const time = r[SHEET_COLUMNS.indexOf("발생시각")];
  const check = r[SHEET_COLUMNS.indexOf("확인")];
  if (!time) return "blank";
  if (!/^\d/.test(time)) return "leave";
  if (check.includes("지각") || check.includes("조퇴")) return "warn";
  return "";
}
