/** 정비적격심사 '관련 자격증 및 관련 학과 적용' 기술자 등급 (2026-11-19).
 *  자격증·선임 관리 대장(licenses) 한 줄 + 직원 명부 근무 기간으로 기준일의 경력과 등급을 계산한다. 화면·엑셀 공용(값만).
 *
 *  등급 기준 (심사 기준표)
 *  - 고급기술자 7점: 기술사·기능장 / 기사 취득 후 5년 / 산업기사 취득 후 8년 / 기능사 취득 후 10년 이상 실무
 *  - 중급기술자 5점: 기사 취득 후 2년 / 산업기사 취득 후 3년 / 기능사 취득 후 5년 / 학사 후 2년 / 전문학사 후 3년 / 관련근무 5년 이상 실무
 *  - 초급기술자 3점: 기능사·산업기사 이상 취득 / 학사·전문학사 후 1년 / 고졸 후 2년 / 관련 근무경력 3년 이상 실무
 *  (기능사 이상 관련 직무교육 이수자는 기록이 없어 따지지 않는다)
 */
import { spansOf, type Employee } from "./employees";
import type { DateStr } from "../time";

export type CertLevel = "기술사" | "기능장" | "기사" | "산업기사" | "기능사" | "";
export const GRADES = [
  { name: "고급기술자", point: 7 },
  { name: "중급기술자", point: 5 },
  { name: "초급기술자", point: 3 },
] as const;

/** 자격증 이름 끝으로 종류를 가린다 (전기산업기사 → 산업기사, 전산응용기계제도기능사 → 기능사) */
export function certLevel(name: string): CertLevel {
  const n = name.replace(/\s/g, "");
  if (/기술사$/.test(n)) return "기술사";
  if (/기능장$/.test(n)) return "기능장";
  if (/산업기사$/.test(n)) return "산업기사";
  if (/기사$/.test(n)) return "기사";
  if (/기능사$/.test(n)) return "기능사";
  return "";
}

/** a~b 개월 수 (일 단위까지 따져 꽉 찬 달만) */
export function monthsBetween(a: DateStr, b: DateStr): number {
  if (!a || !b || b < a) return 0;
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/** 당사 근무 개월: 근무 기간(재입사 전 포함) 중 from 이후 ~ 기준일 */
function companyMonths(e: Employee | undefined, day: DateStr, from = ""): number {
  if (!e) return 0;
  return spansOf(e).reduce((t, [s, l]) => {
    const a = [s ?? "", from].sort().pop()!, b = l && l < day ? l : day;
    return t + (a ? monthsBetween(a, b) : 0);
  }, 0);
}

export const ym = (m: number) => (m <= 0 ? "-" : `${Math.floor(m / 12) ? `${Math.floor(m / 12)}년` : ""}${m % 12 ? ` ${m % 12}개월` : ""}`.trim());

export interface QualRow {
  after: number;      // 자격취득 후 근무경력 (개월)
  total: number;      // 총 근무경력 (개월)
  level: CertLevel;
  grade: string;      // 고급기술자 … / "" (해당 없음)
  point: number;
  why: string;        // 등급 근거
}

export function qualOf(d: Record<string, string>, e: Employee | undefined, day: DateStr): QualRow {
  const got = d.got ?? "";
  const prev = Math.max(0, Math.round(+d.prev || 0));
  const prevAfter = d.prevAfter ? Math.max(0, Math.round(+d.prevAfter || 0)) : 0;
  const total = companyMonths(e, day) + prev;
  const after = got && got <= day ? companyMonths(e, day, got) + Math.min(prevAfter, prev) : 0;
  const level = got && got <= day ? certLevel(d.name ?? "") : "";
  const edu = d.edu ?? "";
  const sinceEdu = d.eduDate ? Math.min(total, monthsBetween(d.eduDate, day)) : 0; // 졸업 후 실무 (총 경력을 넘지 않게)
  const y = (m: number) => m / 12;
  const rules: [number, boolean, string][] = [
    [0, level === "기술사" || level === "기능장", `${level} 취득`],
    [0, level === "기사" && y(after) >= 5, "기사 취득 후 5년 이상"],
    [0, level === "산업기사" && y(after) >= 8, "산업기사 취득 후 8년 이상"],
    [0, level === "기능사" && y(after) >= 10, "기능사 취득 후 10년 이상"],
    [1, level === "기사" && y(after) >= 2, "기사 취득 후 2년 이상"],
    [1, level === "산업기사" && y(after) >= 3, "산업기사 취득 후 3년 이상"],
    [1, level === "기능사" && y(after) >= 5, "기능사 취득 후 5년 이상"],
    [1, (edu === "학사" || edu === "석사 이상") && y(sinceEdu) >= 2, "학사 후 2년 이상"],
    [1, edu === "전문학사" && y(sinceEdu) >= 3, "전문학사 후 3년 이상"],
    [1, y(total) >= 5, "관련근무 5년 이상"],
    [2, level !== "", `${level} 취득`],
    [2, (edu === "학사" || edu === "석사 이상" || edu === "전문학사") && y(sinceEdu) >= 1, `${edu} 후 1년 이상`],
    [2, edu === "고졸" && y(sinceEdu) >= 2, "고졸 후 2년 이상"],
    [2, y(total) >= 3, "관련 근무경력 3년 이상"],
  ];
  const hit = rules.find(([, ok]) => ok);
  const g = hit ? GRADES[hit[0]] : null;
  return { after, total, level, grade: g?.name ?? "", point: g?.point ?? 0, why: hit?.[2] ?? "" };
}
