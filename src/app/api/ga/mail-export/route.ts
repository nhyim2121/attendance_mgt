/** 문서 수발 대장 엑셀 내려받기. 주소의 거르기(연도·월·받음/보냄·종류·찾기)는 화면과 같다. */
import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import * as mail from "@/lib/총무/mail";
import { todayKst } from "@/lib/time";

export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u) return new Response("로그인이 필요합니다.", { status: 401 });
  if (u.role !== "관리자") return new Response("내려받을 수 없습니다.", { status: 403 });
  const f = mail.readFilter(Object.fromEntries(req.nextUrl.searchParams), +todayKst().slice(0, 4));
  const [all, files] = await Promise.all([mail.loadMails(f.y), mail.loadFiles("mail:")]);
  const nos = await mail.mailNos(all.flatMap((x) => (x.replyOf ? [x.replyOf] : [])));
  const rows = mail.filterMails(all, f).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id - b.id)); // 대장은 오래된 순

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("문서 수발 대장", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const label = `${f.y}년${f.m ? ` ${+f.m}월` : ""}${f.dir ? ` ${f.dir}` : ""}${f.kind ? ` ${f.kind}` : ""}`;
  ws.mergeCells("A1:N1");
  ws.getCell("A1").value = `문서 수발 대장 (${label})`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A1").alignment = { horizontal: "center" };
  const head = ["번호", "날짜", "수신/발신", "종류", "보낸 곳·받는 곳", "제목·내용", "문서·등기번호", "전달·처리", "상태", "기한", "회신 대상", "발송 요금", "메모", "첨부"];
  const widths = [16, 11, 9, 8, 22, 40, 18, 26, 8, 11, 16, 10, 20, 6];
  ws.addRow([]);
  const h = ws.addRow(head);
  h.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF8" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (const x of rows) {
    ws.addRow([mail.mailNo(x), x.day, x.dir, x.kind, x.party, x.title, x.refNo, x.route, x.status, x.due ?? "", x.replyOf ? nos.get(x.replyOf) ?? "" : "", x.cost ?? "", x.note,
      (files.get(mail.mailRef(x.id)) ?? []).length || ""]);
  }
  const thin = { style: "thin" as const, color: { argb: "FFBBBBBB" } };
  for (let r = 3; r <= ws.rowCount; r++) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (c, col) => {
      if (col > head.length) return;
      c.border = { top: thin, left: thin, bottom: thin, right: thin };
      c.alignment = { vertical: "middle", wrapText: [5, 6, 8, 13].includes(col), horizontal: [1, 2, 3, 4, 9, 10, 11, 14].includes(col) ? "center" : col === 12 ? "right" : "left" };
    });
  }
  ws.getColumn(12).numFmt = "#,##0";
  const sum = rows.reduce((t, x) => t + (x.cost ?? 0), 0);
  if (sum) {
    const t = ws.addRow(["합계", "", "", "", "", "", "", "", "", "", "", sum]);
    t.font = { bold: true };
  }
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.pageSetup.printTitlesRow = "3:3";

  const body = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export"; filename*=UTF-8''${encodeURIComponent(`문서 수발 대장 ${label}.xlsx`)}`,
    },
  });
}
