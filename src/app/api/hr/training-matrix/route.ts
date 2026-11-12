/** 직원별 법정교육 이수 현황표 엑셀 (관리자만). 주소의 y·dept·miss는 화면과 같다. */
import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { LEGAL, trainingView } from "@/lib/인사노무/training";

export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u) return new Response("로그인이 필요합니다.", { status: 401 });
  if (u.role !== "관리자") return new Response("내려받을 수 없습니다.", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const v = await trainingView(Number(sp.get("y")) || undefined);
  const dept = sp.get("dept") ?? "", miss = sp.get("miss") === "1";
  const rows = v.people.filter((p) => (!dept || (p.emp.dept || "(부서 없음)") === dept) && (!miss || p.done < p.need));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${v.year} 이수 현황`, { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const head = ["번호", "부서", "성명", "직책", ...LEGAL.map((d) => d.short.replace("\n", " ")), "이수율"];
  ws.mergeCells(1, 1, 1, head.length);
  ws.getCell("A1").value = `${v.year}년 법정의무교육 이수 현황${dept ? ` (${dept})` : ""}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.mergeCells(2, 1, 2, head.length);
  ws.getCell("A2").value = v.noAccident.on
    ? `무재해 감면 적용: 전년도(${v.noAccident.prevYear}) 산업재해 미발생 → 근로자 정기교육 시간 50% (산업안전보건법 시행규칙 제27조①)`
    : "근로자 정기교육: 사무직 반기 6시간 · 그 밖 반기 12시간 (산업안전보건법 시행규칙 별표 4)";
  ws.getCell("A2").font = { size: 9, color: { argb: "FF555555" } };
  const h = ws.addRow(head);
  h.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF8" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  const FILL: Record<string, string> = { ok: "FFE3F4EC", part: "FFFDF0E1", no: "FFFBE7E6" };
  rows.forEach((p, i) => {
    const r = ws.addRow([i + 1, p.emp.dept, p.emp.name, p.emp.position || p.emp.rank, ...LEGAL.map((d) => p.cells[d.key].text), p.need ? `${Math.round((p.done / p.need) * 100)}%` : "-"]);
    LEGAL.forEach((d, j) => {
      const f = FILL[p.cells[d.key].st];
      if (f) r.getCell(5 + j).fill = { type: "pattern", pattern: "solid", fgColor: { argb: f } };
    });
  });
  const thin = { style: "thin" as const, color: { argb: "FFBBBBBB" } };
  head.forEach((_, i) => { ws.getColumn(i + 1).width = i === 0 ? 6 : i < 4 ? 11 : 12; });
  for (let r = 3; r <= ws.rowCount; r++) ws.getRow(r).eachCell({ includeEmpty: true }, (c, col) => {
    if (col > head.length) return;
    c.border = { top: thin, left: thin, bottom: thin, right: thin };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 3 }];
  const body = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export"; filename*=UTF-8''${encodeURIComponent(`법정교육 이수 현황 ${v.year}년.xlsx`)}`,
    },
  });
}
