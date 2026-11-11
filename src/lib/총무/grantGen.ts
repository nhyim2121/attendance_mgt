/** 지원사업 자료 요청에 낼 자료를 직원 명부로 만든다 (엑셀). 서버 전용. 주민번호·연락처·급여 같은 개인정보는 넣지 않는다. */
import "server-only";
import ExcelJS from "exceljs";
import { loadEmployees } from "../store";
import type { Employee } from "../인사노무/employees";
import { todayKst } from "../time";
import { type GenKind, yearsIn } from "./grants";

const active = (e: Employee, day: string) => (!e.joinDate || e.joinDate <= day) && (!e.leaveDate || e.leaveDate >= day);
const head = (ws: ExcelJS.Worksheet, row: number) => ws.getRow(row).eachCell((c) => {
  c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } }; c.alignment = { horizontal: "center" };
});
const title = (ws: ExcelJS.Worksheet, text: string, sub: string) => {
  ws.getCell("A1").value = text; ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = sub; ws.getCell("A2").font = { color: { argb: "FF6B7280" }, size: 9 };
};

export async function buildGrantFile(kind: GenKind, item: string): Promise<{ name: string; data: Uint8Array }> {
  const today = todayKst();
  const emps = (await loadEmployees()).filter((e) => e.name);
  const wb = new ExcelJS.Workbook();
  const sub = `(주)에쓰엔 · ${today} 기준 · 통합관리시스템 직원 명부에서 만듦`;
  let name = "";

  if (kind === "org") {
    const now = emps.filter((e) => active(e, today));
    const depts = [...new Set(now.map((e) => e.dept || "미지정"))];
    const ws = wb.addWorksheet("부서별 인원");
    title(ws, "조직도 (부서·팀별 인원)", sub);
    ws.addRow([]);
    ws.addRow(["부서·팀", "인원", "구성 (직책·직급 이름)"]); head(ws, 4);
    for (const d of depts) {
      const m = now.filter((e) => (e.dept || "미지정") === d).sort((a, b) => a.ord - b.ord);
      ws.addRow([d, m.length, m.map((e) => [e.position || e.rank, e.name].filter(Boolean).join(" ")).join(", ")]);
    }
    const t = ws.addRow(["합계", now.length, ""]); t.font = { bold: true };
    ws.columns = [{ width: 16 }, { width: 8 }, { width: 80 }];
    ws.getColumn(3).alignment = { wrapText: true, vertical: "top" };
    name = `조직도_부서별인원_${today}.xlsx`;
  } else if (kind === "headcount") {
    const years = yearsIn(item, +today.slice(0, 4));
    const ws = wb.addWorksheet("연말 기준 근로자 수");
    title(ws, "연도별 근로자 총 인원 (연말 기준)", `${sub} · 퇴사자 기록이 명부에 없으면 실제보다 적을 수 있으니 확인 후 제출`);
    ws.addRow([]);
    const depts = [...new Set(emps.map((e) => e.dept || "미지정"))];
    ws.addRow(["연도", "기준일", "총 인원", ...depts]); head(ws, 4);
    for (const y of years) {
      const day = `${y}-12-31` > today ? today : `${y}-12-31`;
      const on = emps.filter((e) => active(e, day));
      ws.addRow([`${y}년`, day, on.length, ...depts.map((d) => on.filter((e) => (e.dept || "미지정") === d).length)]);
    }
    ws.columns = [{ width: 10 }, { width: 12 }, { width: 10 }, ...depts.map(() => ({ width: 10 }))];
    name = `근로자수_연말기준_${years[0]}-${years[years.length - 1]}.xlsx`;
  } else {
    const now = emps.filter((e) => active(e, today)).sort((a, b) => a.dept.localeCompare(b.dept) || a.ord - b.ord);
    const ws = wb.addWorksheet("직원 명부");
    title(ws, "직원 명부", sub);
    ws.addRow([]);
    ws.addRow(["번호", "부서", "직급", "직책", "이름", "입사일"]); head(ws, 4);
    now.forEach((e, i) => ws.addRow([i + 1, e.dept, e.rank, e.position, e.name, e.joinDate ?? ""]));
    ws.columns = [{ width: 6 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }];
    name = `직원명부_${today}.xlsx`;
  }
  return { name, data: new Uint8Array(await wb.xlsx.writeBuffer()) };
}
