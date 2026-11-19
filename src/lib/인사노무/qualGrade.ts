/** 정비적격심사 '관련 자격증 및 관련 학과 적용' 기술자 등급 (2026-11-19, 발전5사 정비적격기업 통합관리지침 부록-1 기술분야).
 *  인정대상: 4대 보험에 가입된 상시 근무 인원 중 기술인력(설계·제작·정비·기술관리·품질관리·전문연구 부서).
 *  - 자격취득 후 근무경력: 자격증이 있는 사람만, 취득일(또는 입사일 중 늦은 날)부터 기준일까지 + 이전 직장 경력 중 취득 후 부분
 *  - 총 근무경력: 자격증 없이 실무 경력(전기기술자 경력수첩·경력증명서 등)으로 인정받는 사람. 당사 근무 + 이전 관련 경력
 *  등급 기준
 *  - 고급 7점: 기술사·기능장 / 기사 취득 후 5년 / 산업기사 취득 후 8년 / 기능사 취득 후 10년 이상 실무
 *  - 중급 5점: 기사 후 2년 / 산업기사 후 3년 / 기능사 후 5년 / 학사 후 2년 / 전문학사 후 3년 / 관련근무 5년 이상
 *  - 초급 3점: 기능사·산업기사 이상 취득 / 학사·전문학사 후 1년 / 고졸 후 2년 / 관련 근무경력 3년 이상
 *  ('기능사 이상 관련 직무교육 이수자'는 기록이 없어 따지지 않는다)
 */
import { spansOf, type Employee } from "./employees";
import type { DateStr } from "../time";

export type CertLevel = "기술사" | "기능장" | "기사" | "산업기사" | "기능사" | "";
export const GRADES = [
  { name: "고급기술자", point: 7 },
  { name: "중급기술자", point: 5 },
  { name: "초급기술자", point: 3 },
] as const;
export const EDU = ["고졸", "전문학사", "학사", "석사 이상"] as const;
/** 기술인력으로 보는 부서 (기본값, 화면에서 바꿀 수 있음) */
export const TECH_DEPTS = ["생산팀", "품질팀", "연구소", "일학습"];

/** 사람별 추가 정보 (settings 'qual_people') */
export interface QualPerson {
  prev?: number;      // 이전 직장 관련 경력 (개월) — 경력증명서·경력수첩으로 확인되는 것만
  edu?: string;       // 관련 학과 학력
  eduDate?: string;   // 졸업일
  include?: boolean;  // 기술인력 포함 여부 (비우면 부서로 판단)
  note?: string;      // 메모 (4대보험 미가입 등)
}
export interface QualSettings { depts: string[]; people: Record<string, QualPerson> }
export const EMPTY_QUAL: QualSettings = { depts: TECH_DEPTS, people: {} };

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

/** a~b 개월 수 (꽉 찬 달만) */
export function monthsBetween(a: DateStr, b: DateStr): number {
  if (!a || !b || b < a) return 0;
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/** 당사 근무 개월: 근무 기간(재입사 전 포함) 중 from 이후 ~ 기준일 */
export function companyMonths(e: Employee | undefined, day: DateStr, from = ""): number {
  if (!e) return 0;
  return spansOf(e).reduce((t, [s, l]) => {
    const a = [s ?? "", from].sort().pop()!, b = l && l < day ? l : day;
    return t + (a ? monthsBetween(a, b) : 0);
  }, 0);
}

export const ym = (m: number) => (m <= 0 ? "-" : `${Math.floor(m / 12) ? `${Math.floor(m / 12)}년` : ""}${m % 12 ? ` ${m % 12}개월` : ""}`.trim());

export interface Cert { name: string; got: string; prevAfter?: number }
export interface QualRow {
  after: number;      // 자격취득 후 근무경력 (개월, 자격증 줄만)
  total: number;      // 총 근무경력 (개월)
  level: CertLevel;
  grade: string;      // 고급기술자 … / "" (해당 없음)
  point: number;
  why: string;        // 등급 근거
  byTotal: boolean;   // 총 근무경력(관련근무)·학력으로 정해졌는가
}

export function qualOf(cert: Cert | null, p: QualPerson, e: Employee | undefined, day: DateStr): QualRow {
  const prev = Math.max(0, Math.round(p.prev ?? 0));
  const total = companyMonths(e, day) + prev;
  const got = cert?.got && cert.got <= day ? cert.got : "";
  const after = got ? companyMonths(e, day, got) + Math.min(Math.max(0, Math.round(cert?.prevAfter ?? 0)), prev) : 0;
  const level = got ? certLevel(cert!.name) : "";
  const edu = p.edu ?? "";
  const sinceEdu = p.eduDate ? Math.min(total, monthsBetween(p.eduDate, day)) : 0; // 졸업 후 실무 (총 경력을 넘지 않게)
  const y = (m: number) => m / 12;
  const uni = edu === "학사" || edu === "석사 이상";
  // [등급 0=고급 1=중급 2=초급, 맞는가, 근거, 총 경력·학력 기준인가]
  const rules: [number, boolean, string, boolean][] = [
    [0, level === "기술사" || level === "기능장", `${level} 실무자`, false],
    [0, level === "기사" && y(after) >= 5, "기사 자격 후 5년 이상", false],
    [0, level === "산업기사" && y(after) >= 8, "산업기사 자격 후 8년 이상", false],
    [0, level === "기능사" && y(after) >= 10, "기능사 자격 후 10년 이상", false],
    [1, level === "기사" && y(after) >= 2, "기사 자격 후 2년 이상", false],
    [1, level === "산업기사" && y(after) >= 3, "산업기사 자격 후 3년 이상", false],
    [1, level === "기능사" && y(after) >= 5, "기능사 자격 후 5년 이상", false],
    [1, uni && y(sinceEdu) >= 2, "학사 후 2년 이상", true],
    [1, edu === "전문학사" && y(sinceEdu) >= 3, "전문학사 후 3년 이상", true],
    [1, y(total) >= 5, "관련근무 5년 이상", true],
    [2, level !== "", `${level} 취득`, false],
    [2, (uni || edu === "전문학사") && y(sinceEdu) >= 1, `${edu} 후 1년 이상`, true],
    [2, edu === "고졸" && y(sinceEdu) >= 2, "고졸 후 2년 이상", true],
    [2, y(total) >= 3, "관련 근무경력 3년 이상", true],
  ];
  const hit = rules.find(([, ok]) => ok);
  const g = hit ? GRADES[hit[0]] : null;
  return { after, total, level, grade: g?.name ?? "", point: g?.point ?? 0, why: hit?.[2] ?? "", byTotal: !!hit?.[3] };
}

/** 정비적격심사 요청서류 (붙임3 품질분야 · 붙임4 기술분야). key = 첨부 ref 'qual:doc:<key>' */
export const QUAL_DOCS: { area: string; group: string; key: string; item: string; docs: string[]; note?: string }[] = [
  { area: "품질", group: "1. 품질경영시스템", key: "q11", item: "1) ISO 9001 인증", docs: ["ISO 9001 인증서", "인증기관의 심사보고서", "권고·지적사항 개선조치 관련 서류"] },
  { area: "품질", group: "1. 품질경영시스템", key: "q12", item: "2) 품질조직구성", docs: ["이름·부서명이 포함된 조직도 (품질관리 전담부서 유무)", "4대보험 가입자명부"] },
  { area: "품질", group: "1. 품질경영시스템", key: "q13", item: "3) 품질방침·매뉴얼·품질보증계획서", docs: ["품질방침, 매뉴얼, 품질보증계획서", "유효성 평가(3년 이내) 결과 및 절차서"] },
  { area: "품질", group: "2. 자원/자료관리", key: "q21", item: "1) 품질교육", docs: ["최근 2년간 품질교육 수료증 또는 확인서"], note: "사내·사외교육 구분" },
  { area: "품질", group: "2. 자원/자료관리", key: "q22", item: "2) 기술규격 (Code/규격)", docs: ["신청품목 관련 국제표준 규격집 (KS, JIS, ASME, ASTM 등)"], note: "PDF 등 문서파일 가능" },
  { area: "품질", group: "2. 자원/자료관리", key: "q23", item: "3) 검사기준/작업절차서/도면", docs: ["검사기준, 작업절차서, 도면 (신청품목 관련)"], note: "주기적 개정 여부 · 타사 절차서 대체 불가" },
  { area: "품질", group: "3. 측정/분석/평가", key: "q31", item: "1) 계측기 검교정", docs: ["계측기 관리대장", "계측기 검교정 관리기준", "공인기관 검교정 성적서"] },
  { area: "품질", group: "3. 측정/분석/평가", key: "q32", item: "2) NCR/CAR 관리", docs: ["NCR/CAR 관리대장 (사외 및 사내)"] },
  { area: "품질", group: "3. 측정/분석/평가", key: "q33", item: "3) 협력회사 평가관리", docs: ["협력사 평가기준 또는 지침"], note: "외주제작·가공 진행 시" },
  { area: "품질", group: "3. 측정/분석/평가", key: "q34", item: "4) 시험, 검사, 자격평가", docs: ["자체 품질검사 수행 및 검사설비 보유 (자재 재질·성능 등)", "특수작업자 자격평가 수행 및 관리기준 (용접, 케이블 단말처리 등)"] },
  { area: "기술", group: "1. 기술인력", key: "t11", item: "1) 인정대상", docs: ["이름·부서명이 포함된 조직도", "4대보험 가입자명부"] },
  { area: "기술", group: "1. 기술인력", key: "t12", item: "2) 관련 자격증 및 관련 학과 적용", docs: ["국가기술 자격증 보유현황 (자격증 사본, 주민번호 뒷자리 지움)", "기술인력 입사 및 경력정보 확인 서류 (경력증명서 등)"], note: "경력수첩은 자격증으로 인정 불가" },
  { area: "기술", group: "1. 기술인력", key: "t13", item: "3) 기술인증 가점", docs: ["해당 특허, NEP/NET 인증, 실용신안 인증서류"] },
  { area: "기술", group: "2. 제작/정비능력", key: "t21", item: "1) 자체 제작/정비능력", docs: ["설계·제작·시험·검사 관련 시방서, 도면, 절차서, 기술규격", "자사 고유모델 보유, 정비 전문 입증 서류"], note: "제작·정비율 산정, 매출 기여도 확인" },
  { area: "기술", group: "2. 제작/정비능력", key: "t22", item: "2) 납품/정비 실적", docs: ["실적증명서, 세금계산서 등 신청품목 실적 확인 서류"], note: "사진대장 불가" },
  { area: "기술", group: "3. 설비/작업장/안전", key: "t31", item: "1) 설비/공기구 보유", docs: ["설비, 공기구 관리 대장"], note: "지침 부록-8 참고" },
  { area: "기술", group: "3. 설비/작업장/안전", key: "t32", item: "2) 설비/공기구 노후화", docs: ["설비, 공기구 관리 대장"], note: "제작년도 기준" },
  { area: "기술", group: "3. 설비/작업장/안전", key: "t33", item: "3) 자재관리", docs: ["(제작·반출정비) 자재관리대장", "(현장정비) 자재검수 시행결과 및 재고관리 대장, 기준"] },
  { area: "기술", group: "3. 설비/작업장/안전", key: "t34", item: "4) 안전관리 (현장정비)", docs: ["안전교육 계획수립, 안전교육 시행 현황", "개인별 안전장구 지급여부 및 상태", "현장 작업자 안전장구 착용 상태"], note: "안전보건경영시스템 보유 시 가점" },
  { area: "기술", group: "3. 설비/작업장/안전", key: "t35", item: "5) 공장규모 (제작·반출정비)", docs: ["작업구획 표시 및 통로확보, 저장공간, 완성품 창고, 휴게공간 (사진 등)"] },
];
