import "server-only";
/** 정비적격심사 기술자 등급 표 데이터 (화면 /hr/qual · 엑셀 /api/qual 공용) */
import * as ledger from "@/lib/대장/store";
import { getSetting, loadEmployees } from "@/lib/store";
import { asOf, employedOn, type Employee } from "./employees";
import { CERT_DEFAULT, careerMonths, certIn, certLevel, companyMonths, DEPT_ROLE, EMPTY_QUAL, isSafetyCert, qualOf, SAFETY_DEFAULT, type QualPerson, type QualRow, type QualSettings } from "./qualGrade";
import type { DateStr } from "../time";

export interface QualLine extends QualRow {
  id: number | null;  // 자격증 대장 줄 (자격증 없는 실무 경력자는 null)
  emp: string; dept: string; cert: string; got: string;
  first: boolean;     // 그 사람의 첫 줄
  best: boolean;      // 그 사람의 등급으로 쓰는 줄
}
export interface QualPersonRow {
  name: string; dept: string; rank: string; person: QualPerson; tech: boolean; certs: number; grade: string; point: number;
  join: string; prior: string[]; insured: string; role: string; company: number; prev: number; total: number; certNames: string[];
}

export const loadQualSettings = async (): Promise<QualSettings> => ({ ...EMPTY_QUAL, ...(await getSetting<Partial<QualSettings>>("qual_people", {})) });

/** 기준일 재직 기술인력의 자격증·경력 줄. 사람마다 자격증 줄(여럿 가능), 없으면 경력 한 줄. 명부 순서. */
export async function qualLines(day: DateStr): Promise<{ lines: QualLine[]; people: QualPersonRow[]; settings: QualSettings; safety: { emp: string; cert: string; got: string }[]; allCerts: string[] }> {
  const [rows, emps, settings] = await Promise.all([ledger.loadRows("licenses"), loadEmployees(), loadQualSettings()]);
  const act = emps.filter((e) => employedOn(e, day)).map((e) => asOf(e, day));
  const certsOf = new Map<string, typeof rows>();
  // 등급은 국가기술자격(기능사 이상) 중 관련 자격증만 (대장의 '정비적격심사'가 포함/제외면 그것을 따름). 경력수첩·선임·연구원 줄은 뺀다
  const relevant = settings.certs?.length ? settings.certs : CERT_DEFAULT;
  const use = (d: Record<string, string>) => !!d.name && !!certLevel(d.name) && (d.audit === "포함" || (d.audit !== "제외" && certIn(d.name, relevant)));
  for (const r of rows) if (use(r.data)) certsOf.set(r.data.emp ?? "", [...(certsOf.get(r.data.emp ?? "") ?? []), r]);
  const isTech = (e: Employee) => settings.people[e.name]?.include ?? (settings.depts.includes(e.dept) || certsOf.has(e.name));
  const lines: QualLine[] = [];
  const people: QualPersonRow[] = [];
  for (const e of act) {
    const p0 = settings.people[e.name] ?? {};
    const hasCareers = !!p0.careers?.length; // 4대보험 이력을 넣었으면 그것으로, 아니면 직접 적은 개월 수
    const p = { ...p0, prev: hasCareers ? careerMonths(p0.careers, day) : p0.prev };
    const tech = isTech(e);
    const cs = (certsOf.get(e.name) ?? []).sort((a, b) => (a.data.got ?? "").localeCompare(b.data.got ?? ""));
    const mine: QualLine[] = (cs.length ? cs : [null]).map((r, i) => ({
      id: r?.id ?? null, emp: e.name, dept: e.dept, cert: r?.data.name ?? "", got: r?.data.got ?? "", first: i === 0, best: false,
      ...qualOf(r ? { name: r.data.name, got: r.data.got ?? "", prevAfter: hasCareers ? careerMonths(p0.careers, day, r.data.got ?? "") : +r.data.prevAfter || 0 } : null, p, e, day),
    }));
    const top = mine.reduce((a, b) => (b.point > a.point ? b : a), mine[0]);
    top.best = true;
    const company = companyMonths(e, day), prev = Math.max(0, p.prev ?? 0);
    people.push({ name: e.name, dept: e.dept, rank: e.rank, person: p0, tech, certs: cs.length, grade: top.grade, point: top.point,
      join: e.joinDate ?? "", prior: (e.prior ?? []).map((s) => `${s.join ?? "?"} ~ ${s.leave ?? "?"}`), insured: p.insured ?? "",
      role: p.role || DEPT_ROLE[e.dept] || "", company, prev, total: company + prev, certNames: cs.map((r) => r.data.name) });
    if (tech) lines.push(...mine);
  }
  const on = new Set(act.map((e) => e.name));
  const safeList = settings.safety?.length ? settings.safety : SAFETY_DEFAULT;
  const safety = rows.filter((r) => on.has(r.data.emp ?? "") && isSafetyCert(r.data.name ?? "", safeList) && (!r.data.got || r.data.got <= day))
    .map((r) => ({ emp: r.data.emp ?? "", cert: r.data.name, got: r.data.got ?? "" }));
  const allCerts = [...new Set(rows.map((r) => (r.data.name ?? "").trim()).filter((n) => n && certLevel(n)))];
  return { lines, people, settings, safety, allCerts };
}
