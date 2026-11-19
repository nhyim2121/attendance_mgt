/** 정비적격심사 '관련 자격증 및 관련 학과 적용' 표 엑셀 (관리자만). 화면 /hr/qual과 같은 계산. */
import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { qualLines } from "@/lib/인사노무/qualData";
import { ym } from "@/lib/인사노무/qualGrade";
import { isDateStr, todayKst } from "@/lib/time";

export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u) return new Response("로그인이 필요합니다.", { status: 401 });
  if (u.role !== "관리자") return new Response("내려받을 수 없습니다.", { status: 403 });
  const q = req.nextUrl.searchParams.get("day") ?? "";
  const day = isDateStr(q) ? q : todayKst();
  const lines = await qualLines(day);
  const dot = (d: string) => d.replaceAll("-", ".");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("자격증 및 학과 적용", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = "2. 관련 자격증 및 관련 학과 적용";
  ws.mergeCells("E1:F1");
  ws.getCell("E1").value = `기준일: ${dot(day)}`;
  ws.getRow(1).font = { bold: true, size: 12 };
  const head = ws.addRow(["성 명", "자격증", "취득월일", "자격취득후 근무경력", "총 근무경력", "기술자 등급"]);
  head.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E7D3" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  lines.forEach((l, i) => ws.addRow([i === 0 || lines[i - 1].emp !== l.emp ? l.emp : "", l.cert, l.got ? dot(l.got) : "",
    l.after ? ym(l.after) : "", l.total ? ym(l.total) : "", l.grade ? `${l.grade} (${l.point}점)` : ""]));
  const thin = { style: "thin" as const };
  for (let r = 2; r <= ws.rowCount; r++) ws.getRow(r).eachCell({ includeEmpty: true }, (c, col) => {
    if (col > 6) return;
    c.border = { top: thin, left: thin, bottom: thin, right: thin };
    if (r > 2) c.alignment = { horizontal: "center", vertical: "middle" };
  });
  [10, 24, 13, 20, 16, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`관련 자격증 및 학과 적용_${day}.xlsx`)}`,
  } });
}
