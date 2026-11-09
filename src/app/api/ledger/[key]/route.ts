/** 업무 대장 엑셀 내려받기. 주소의 거르기는 화면과 같다 (관리자만). */
import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { bookOf } from "@/lib/대장/books";
import { filterRows } from "@/lib/대장/logic";
import * as store from "@/lib/대장/store";
import { loadFiles } from "@/lib/총무/mail";

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("로그인이 필요합니다.", { status: 401 });
  if (u.role !== "관리자") return new Response("내려받을 수 없습니다.", { status: 403 });
  const book = bookOf((await params).key);
  if (!book) return new Response("없는 대장입니다.", { status: 404 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const [all, files] = await Promise.all([store.loadRows(book.key), loadFiles("lg:")]);
  const rows = filterRows(book, all, sp).reverse(); // 대장은 오래된 순

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(book.title.slice(0, 31), { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const head = ["번호", ...book.fields.map((f) => f.label), "첨부"];
  ws.mergeCells(1, 1, 1, head.length);
  ws.getCell("A1").value = `${book.title}${sp.y ? ` (${sp.y}년)` : ""}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.addRow([]);
  const h = ws.addRow(head);
  h.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF8" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  rows.forEach((r, i) => ws.addRow([i + 1, ...book.fields.map((f) => {
    const v = r.data[f.k] ?? "";
    return (f.type === "money" || f.type === "number") && v ? +v : v;
  }), (files.get(store.rowRef(r.id)) ?? []).length || ""]));
  const sums = book.fields.map((f, i) => (f.type === "money" ? i + 2 : 0)).filter(Boolean);
  if (sums.length && rows.length) {
    const t = ws.addRow(head.map((_, i) => (i === 0 ? "합계" : sums.includes(i + 1) ? rows.reduce((s, r) => s + (+r.data[book.fields[i - 1].k] || 0), 0) : "")));
    t.font = { bold: true };
  }
  const thin = { style: "thin" as const, color: { argb: "FFBBBBBB" } };
  head.forEach((label, i) => {
    const f = book.fields[i - 1];
    const col = ws.getColumn(i + 1);
    col.width = i === 0 ? 6 : !f ? 6 : f.type === "textarea" || f.wide ? 30 : f.type === "date" ? 11 : Math.max(8, Math.min(20, label.length * 2 + 4));
    if (f?.type === "money") col.numFmt = "#,##0";
  });
  for (let r = 3; r <= ws.rowCount; r++) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (c, col) => {
      if (col > head.length) return;
      c.border = { top: thin, left: thin, bottom: thin, right: thin };
      const f = book.fields[col - 2];
      c.alignment = { vertical: "middle", wrapText: !!f && (f.type === "textarea" || !!f.wide), horizontal: !f || f.type === "date" || f.type === "select" ? "center" : undefined };
    });
  }
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.pageSetup.printTitlesRow = "3:3";
  const body = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export"; filename*=UTF-8''${encodeURIComponent(`${book.title}${sp.y ? ` ${sp.y}년` : ""}.xlsx`)}`,
    },
  });
}
