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
  const { lines, people } = await qualLines(day);
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
  // 자격취득후 근무경력 = 자격증 줄만, 총 근무경력 = 자격증 없는 실무 경력자(또는 경력으로 등급이 정해진 사람), 등급 = 그 사람의 등급 줄에만
  lines.forEach((l) => ws.addRow([l.first ? l.emp : "", l.cert, l.cert && l.got ? dot(l.got) : "",
    l.cert ? ym(l.after) : "", !l.cert || (l.best && l.byTotal) ? ym(l.total) : "", l.best ? l.grade : ""]));
  const thin = { style: "thin" as const };
  for (let r = 2; r <= ws.rowCount; r++) ws.getRow(r).eachCell({ includeEmpty: true }, (c, col) => {
    if (col > 6) return;
    c.border = { top: thin, left: thin, bottom: thin, right: thin };
    if (r > 2) c.alignment = { horizontal: "center", vertical: "middle" };
  });
  [10, 24, 13, 20, 16, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // 두 번째 시트: 기술인력 입사 및 경력정보
  const tech = people.filter((p) => lines.some((l) => l.emp === p.name));
  const w2 = wb.addWorksheet("기술인력 입사·경력", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  w2.mergeCells("A1:H1");
  w2.getCell("A1").value = "기술인력 입사 및 경력정보";
  w2.mergeCells("I1:K1");
  w2.getCell("I1").value = `기준일: ${dot(day)}`;
  w2.getRow(1).font = { bold: true, size: 12 };
  const h2 = w2.addRow(["연번", "성명", "부서", "직급", "담당 분야", "입사일", "4대보험 취득일", "당사 근무", "이전 관련 경력", "총 근무경력", "보유 자격증"]);
  h2.eachCell((c) => { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E7D3" } }; c.alignment = { horizontal: "center", vertical: "middle" }; });
  tech.forEach((p, i) => w2.addRow([i + 1, p.name, p.dept, p.rank, p.role,
    `${p.join ? dot(p.join) : ""}${p.prior.length ? ` (이전 ${p.prior.map(dot).join(", ")})` : ""}`, p.insured ? dot(p.insured) : "",
    ym(p.company), p.prev ? ym(p.prev) : "-", ym(p.total), p.certNames.join(", ")]));
  const avg = (k: "company" | "total") => (tech.length ? ym(Math.round(tech.reduce((t, p) => t + p[k], 0) / tech.length)) : "-");
  const f2 = w2.addRow(["", `기술인력 ${tech.length}명`, "", "", "", "", "1인당 평균", avg("company"), "", avg("total"), ""]);
  f2.font = { bold: true };
  for (let r = 2; r <= w2.rowCount; r++) w2.getRow(r).eachCell({ includeEmpty: true }, (c, col) => {
    if (col > 11) return;
    c.border = { top: thin, left: thin, bottom: thin, right: thin };
    if (r > 2) c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  [6, 10, 10, 9, 16, 26, 14, 12, 14, 14, 26].forEach((w, i) => { w2.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`관련 자격증 및 학과 적용_${day}.xlsx`)}`,
  } });
}
