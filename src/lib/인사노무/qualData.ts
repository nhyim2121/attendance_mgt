import "server-only";
/** 정비적격심사 기술자 등급 표 데이터 (화면 /hr/qual · 엑셀 /api/qual 공용) */
import * as ledger from "@/lib/대장/store";
import { loadEmployees } from "@/lib/store";
import { employedOn } from "./employees";
import { qualOf, type QualRow } from "./qualGrade";
import type { DateStr } from "../time";

export interface QualLine extends QualRow { id: number; emp: string; dept: string; cert: string; got: string; data: Record<string, string> }

/** 기준일 재직자의 자격증 줄 ('정비적격심사: 제외'는 뺀다). 명부 순서 → 취득일 순. */
export async function qualLines(day: DateStr): Promise<QualLine[]> {
  const [rows, emps] = await Promise.all([ledger.loadRows("licenses"), loadEmployees()]);
  const byName = new Map(emps.map((e) => [e.name, e]));
  return rows
    .filter((r) => r.data.audit !== "제외" && r.data.name)
    .filter((r) => { const e = byName.get(r.data.emp ?? ""); return !e || employedOn(e, day); })
    .map((r) => {
      const e = byName.get(r.data.emp ?? "");
      return { id: r.id, emp: r.data.emp ?? "", dept: e?.dept ?? "", cert: r.data.name, got: r.data.got ?? "", data: r.data, ...qualOf(r.data, e, day), ord: e?.ord ?? 9e9 };
    })
    .sort((a, b) => a.ord - b.ord || a.emp.localeCompare(b.emp) || a.got.localeCompare(b.got))
    .map(({ ord: _o, ...x }) => x);
}
