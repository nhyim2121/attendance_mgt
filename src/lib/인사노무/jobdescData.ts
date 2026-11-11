/** 직무기술서 불러오기·담당자 연결·엑셀 (서버 전용). 값·예시는 jobdesc.ts */
import "server-only";
import ExcelJS from "exceljs";
import * as store from "../store";
import { todayKst } from "../time";
import { BASICS, JD_EXAMPLES, JD_SKIP_UNITS, type JobDesc, shareSum } from "./jobdesc";
import { buildOrg, defaultNodes, type OrgBox, type OrgNode } from "./org";

export async function loadJobs(): Promise<{ jobs: JobDesc[]; saved: boolean }> {
  const saved = await store.getSetting<JobDesc[] | null>("job_descs", null);
  return saved ? { jobs: saved, saved: true } : { jobs: JD_EXAMPLES, saved: false };
}
export const saveJobs = (jobs: JobDesc[]) => store.setSetting("job_descs", jobs);

export interface Unit { id: string; label: string; path: string; people: string[] } // people: '직급 이름'
/** 조직도 상자 → 그 상자에 바로 있는 사람 (하위 상자 사람은 빼고) */
export async function loadUnits(day = todayKst()): Promise<{ units: Unit[]; all: string[] }> {
  const [emps, saved] = await Promise.all([store.loadEmployees(), store.getSetting<OrgNode[] | null>("org_nodes", null)]);
  const nodes = saved?.length ? saved : defaultNodes(emps);
  const { roots } = buildOrg(nodes, emps, day);
  const units: Unit[] = [];
  const walk = (b: OrgBox, path: string[]) => {
    const p = [...path, b.node.label];
    const ppl = [...(b.head ? [b.head] : []), ...b.people].map((x) => [x.name, x.rank].filter(Boolean).join(" "));
    units.push({ id: b.node.id, label: b.node.label, path: p.join(" › "), people: ppl });
    b.children.forEach((c) => walk(c, p));
  };
  roots.forEach((r) => walk(r, []));
  const all = units.filter((u) => !JD_SKIP_UNITS.includes(u.id)).flatMap((u) => u.people);
  return { units, all };
}

export const peopleOf = (j: JobDesc, units: Unit[]) => units.filter((u) => j.units.includes(u.id)).flatMap((u) => u.people);
export const unitLabel = (j: JobDesc, units: Unit[]) => units.filter((u) => j.units.includes(u.id)).map((u) => u.label).join(", ");

/** 엑셀: 직무마다 시트 한 장 (양식 꼴). 맨 앞에 목록 시트 */
export async function buildJobsXlsx(jobs: JobDesc[], units: Unit[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const thin = { style: "thin" as const, color: { argb: "FF9CA3AF" } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const HEAD = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFDDEBF7" } };
  const company = (await store.getSetting<{ name?: string }>("org_company", {})).name || "(주)에쓰엔";

  if (jobs.length > 1) {
    const ws = wb.addWorksheet("목록");
    ws.addRow([`${company} 직무기술서 목록`]).font = { bold: true, size: 14 };
    ws.addRow([`${todayKst()} 기준`]).font = { color: { argb: "FF6B7280" }, size: 9 };
    ws.addRow([]);
    const h = ws.addRow(["번호", "직무명", "소속", "담당자", "직무 목적", "작성·개정일"]);
    h.eachCell((c) => { c.font = { bold: true }; c.fill = HEAD; c.border = box; c.alignment = { horizontal: "center" }; });
    jobs.forEach((j, i) => {
      const r = ws.addRow([i + 1, j.name, unitLabel(j, units), peopleOf(j, units).join(", "), j.purpose, j.updated]);
      r.eachCell((c) => { c.border = box; c.alignment = { vertical: "top", wrapText: true }; });
    });
    ws.columns = [{ width: 6 }, { width: 22 }, { width: 14 }, { width: 28 }, { width: 60 }, { width: 12 }];
  }

  const used = new Set<string>();
  for (const j of jobs) {
    let name = (j.name || "직무").replace(/[\\/*?:[\]]/g, "·").slice(0, 28);
    while (used.has(name)) name += "_";
    used.add(name);
    const ws = wb.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .2, footer: .2 } } });
    ws.columns = [{ width: 16 }, { width: 26 }, { width: 40 }, { width: 9 }, { width: 9 }];
    ws.mergeCells("A1:E1");
    ws.getCell("A1").value = "직 무 기 술 서";
    ws.getCell("A1").font = { bold: true, size: 18 }; ws.getCell("A1").alignment = { horizontal: "center" };
    ws.getRow(1).height = 32;
    const sec = (title: string) => {
      const r = ws.addRow([title]); ws.mergeCells(`A${r.number}:E${r.number}`);
      r.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C3994" } };
    };
    const line = (label: string, value: string, height?: number) => {
      const r = ws.addRow([label, value]); ws.mergeCells(`B${r.number}:E${r.number}`);
      r.getCell(1).font = { bold: true }; r.getCell(1).fill = HEAD;
      [1, 2].forEach((c) => { r.getCell(c).border = box; r.getCell(c).alignment = { vertical: "middle", wrapText: true }; });
      for (let c = 3; c <= 5; c++) r.getCell(c).border = box;
      if (height) r.height = height;
    };
    const lines = (xs: string[]) => xs.map((x) => `• ${x}`).join("\n");
    ws.addRow([]);
    sec("1. 직무 확인");
    line("직무명", j.name); line("소속", unitLabel(j, units)); line("담당자", peopleOf(j, units).join(", "));
    line("대상 직급", j.grade); line("보고 대상", j.reportTo); line("NCS 분류", j.ncs);
    sec("2. 직무 개요");
    line("직무 목적", j.purpose, 34); line("책임과 권한", j.authority, 30);
    sec("3. 주요 업무");
    const h = ws.addRow(["업무", "세부 내용", "", "비중(%)", "주기"]); ws.mergeCells(`B${h.number}:C${h.number}`);
    h.eachCell((c) => { c.font = { bold: true }; c.fill = HEAD; c.border = box; c.alignment = { horizontal: "center" }; });
    for (const x of j.tasks) {
      const r = ws.addRow([x.name, x.detail, "", x.share || "", x.cycle]); ws.mergeCells(`B${r.number}:C${r.number}`);
      for (let c = 1; c <= 5; c++) { r.getCell(c).border = box; r.getCell(c).alignment = { vertical: "middle", wrapText: true, horizontal: c >= 4 ? "center" : undefined }; }
    }
    const sum = ws.addRow(["합계", "", "", shareSum(j), ""]); ws.mergeCells(`A${sum.number}:C${sum.number}`);
    sum.font = { bold: true }; for (let c = 1; c <= 5; c++) sum.getCell(c).border = box;
    sec("4. 직무 요건 (필요 능력)");
    line("필요 지식", lines(j.knowledge), 15 * Math.max(1, j.knowledge.length) + 4);
    line("필요 기술", lines(j.skills), 15 * Math.max(1, j.skills.length) + 4);
    line("직무수행태도", lines(j.attitudes), 15 * Math.max(1, j.attitudes.length) + 4);
    line("직업기초능력", BASICS.map((b) => `${j.basics.includes(b) ? "■" : "□"} ${b}`).join("  "), 32);
    sec("5. 자격 요건");
    line("학력·전공", j.edu); line("경력", j.career); line("자격·면허", lines(j.licenses), 15 * Math.max(1, j.licenses.length) + 4);
    sec("6. 근무 환경 · 성과 · 교육");
    line("근무 환경", j.env, 30);
    line("성과 지표", lines(j.kpis), 15 * Math.max(1, j.kpis.length) + 4);
    line("필요 교육", lines(j.training), 15 * Math.max(1, j.training.length) + 4);
    ws.addRow([]);
    const f = ws.addRow([`작성·개정일 ${j.updated || "        .    .    ."}`, "", `작성자 ${j.writer || ""}`, "", ""]);
    f.font = { color: { argb: "FF6B7280" } };
    ws.addRow([company]).font = { bold: true };
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
