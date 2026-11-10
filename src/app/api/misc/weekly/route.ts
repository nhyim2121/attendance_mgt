/** 주간업무일지 엑셀 내려받기: ?w=월요일&who=me(내 일지)|team(팀 전체, 사람마다 시트 한 장) */
import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { todayKst } from "@/lib/time";
import { mondayOf, weekRange, weekTitle, type WeekLog } from "@/lib/기타/work";
import { loadLog, people } from "@/lib/기타/workStore";

const thin = { style: "thin" as const, color: { argb: "FF999999" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

function sheet(wb: ExcelJS.Workbook, name: string, title: string, range: string, log: WeekLog | null) {
  const ws = wb.addWorksheet(name.slice(0, 31), { pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .2, footer: .2 } } });
  [10, 20, 26, 40, 8, 30, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = "주간업무일지";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = `${title} (${range})   작성자: ${name}${log?.updatedAt ? `   저장: ${log.updatedAt.slice(0, 16)}` : ""}`;
  ws.getCell("A2").alignment = { horizontal: "right" };
  const h = ws.addRow(["구분", "업무", "이번 주 계획", "금주 실적", "진행률", "차주 계획", "비고"]);
  h.eachCell((c) => { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE7FB" } }; c.alignment = { horizontal: "center", vertical: "middle" }; c.border = box; });
  const rows = log?.rows.filter((r) => r.task || r.done || r.next) ?? [];
  if (!rows.length) ws.addRow(["", "작성한 내용이 없습니다."]);
  for (const r of rows) ws.addRow([r.cat, r.task, r.prev, r.done, r.pct / 100, r.next, r.note]);
  for (let i = 4; i <= ws.rowCount; i++) ws.getRow(i).eachCell({ includeEmpty: true }, (c, col) => {
    c.border = box; c.alignment = { vertical: "top", wrapText: true, horizontal: col === 5 || col === 1 ? "center" : "left" };
    if (col === 5) c.numFmt = "0%";
  });
  if (log?.issue || log?.request) {
    ws.addRow([]);
    for (const [k, v] of [["문제점·이슈", log.issue], ["건의·협조 요청", log.request]] as const) {
      if (!v) continue;
      const r = ws.addRow([k, v]);
      ws.mergeCells(r.number, 2, r.number, 7);
      r.getCell(1).font = { bold: true };
      r.eachCell((c) => { c.border = box; c.alignment = { vertical: "top", wrapText: true }; });
    }
  }
}

export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u) return new Response("로그인이 필요합니다.", { status: 401 });
  const w = req.nextUrl.searchParams.get("w") ?? "";
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(w) ? w : todayKst());
  const team = req.nextUrl.searchParams.get("who") === "team";
  const title = weekTitle(monday), range = weekRange(monday);
  const wb = new ExcelJS.Workbook();
  const list = team ? await people() : [{ id: u.id, name: u.name }];
  for (const p of list) sheet(wb, p.name, title, range, await loadLog(p.id, monday));
  const buf = await wb.xlsx.writeBuffer();
  const file = `주간업무일지_${monday}_${team ? "팀" : u.name}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
    },
  });
}
