import "server-only";
/** 정비적격심사 기술자 등급 표 데이터 (화면 /hr/qual · 엑셀 /api/qual 공용) */
import * as ledger from "@/lib/대장/store";
import { getSetting, loadEmployees } from "@/lib/store";
import { asOf, employedOn, type Employee } from "./employees";
import { EMPTY_QUAL, isSafetyCert, qualOf, type QualPerson, type QualRow, type QualSettings } from "./qualGrade";
import type { DateStr } from "../time";

export interface QualLine extends QualRow {
  id: number | null;  // 자격증 대장 줄 (자격증 없는 실무 경력자는 null)
  emp: string; dept: string; cert: string; got: string;
  first: boolean;     // 그 사람의 첫 줄
  best: boolean;      // 그 사람의 등급으로 쓰는 줄
}
export interface QualPersonRow { name: string; dept: string; rank: string; person: QualPerson; tech: boolean; certs: number; grade: string; point: number }

export const loadQualSettings = async (): Promise<QualSettings> => ({ ...EMPTY_QUAL, ...(await getSetting<Partial<QualSettings>>("qual_people", {})) });

/** 기준일 재직 기술인력의 자격증·경력 줄. 사람마다 자격증 줄(여럿 가능), 없으면 경력 한 줄. 명부 순서. */
export async function qualLines(day: DateStr): Promise<{ lines: QualLine[]; people: QualPersonRow[]; settings: QualSettings; safety: { emp: string; cert: string; got: string }[] }> {
  const [rows, emps, settings] = await Promise.all([ledger.loadRows("licenses"), loadEmployees(), loadQualSettings()]);
  const act = emps.filter((e) => employedOn(e, day)).map((e) => asOf(e, day));
  const certsOf = new Map<string, typeof rows>();
  for (const r of rows) if (r.data.name && r.data.audit !== "제외") certsOf.set(r.data.emp ?? "", [...(certsOf.get(r.data.emp ?? "") ?? []), r]);
  const isTech = (e: Employee) => settings.people[e.name]?.include ?? (settings.depts.includes(e.dept) || certsOf.has(e.name));
  const lines: QualLine[] = [];
  const people: QualPersonRow[] = [];
  for (const e of act) {
    const p = settings.people[e.name] ?? {};
    const tech = isTech(e);
    const cs = (certsOf.get(e.name) ?? []).sort((a, b) => (a.data.got ?? "").localeCompare(b.data.got ?? ""));
    const mine: QualLine[] = (cs.length ? cs : [null]).map((r, i) => ({
      id: r?.id ?? null, emp: e.name, dept: e.dept, cert: r?.data.name ?? "", got: r?.data.got ?? "", first: i === 0, best: false,
      ...qualOf(r ? { name: r.data.name, got: r.data.got ?? "", prevAfter: +r.data.prevAfter || 0 } : null, p, e, day),
    }));
    const top = mine.reduce((a, b) => (b.point > a.point ? b : a), mine[0]);
    top.best = true;
    people.push({ name: e.name, dept: e.dept, rank: e.rank, person: p, tech, certs: cs.length, grade: top.grade, point: top.point });
    if (tech) lines.push(...mine);
  }
  const on = new Set(act.map((e) => e.name));
  const safety = rows.filter((r) => on.has(r.data.emp ?? "") && isSafetyCert(r.data.name ?? "") && (!r.data.got || r.data.got <= day))
    .map((r) => ({ emp: r.data.emp ?? "", cert: r.data.name, got: r.data.got ?? "" }));
  return { lines, people, settings, safety };
}
