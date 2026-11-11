/** 지원사업 관리 (2026-11-11): X:\관리팀\1. 총무\12. 지원사업 관리 폴더 구조 그대로 폴더별로 나눈다.
 *  저장은 업무 대장 ledger_rows (book = "grants", 칸은 books.ts). 화면은 /ga/grants. 화면·서버 공용(값만). */

/** X 드라이브 폴더와 같은 7개 폴더 */
export const GRANT_FOLDERS = ["1. 신청중", "2. 선정·진행", "3. 완료", "4. 미선정", "5. 협약해지", "6. 성과·수요조사", "7. 기타"] as const;
export const GRANT_FOLDER_COLOR: Record<string, string> = {
  "1. 신청중": "#c2410c", "2. 선정·진행": "#0c3994", "3. 완료": "#15803d", "4. 미선정": "#6b7280",
  "5. 협약해지": "#be123c", "6. 성과·수요조사": "#7c3aed", "7. 기타": "#0e7490",
};
/** 끝난 폴더 (알림 없음) */
export const GRANT_DONE = ["3. 완료", "4. 미선정", "5. 협약해지"];

export const GRANT_FIELDS = ["발전사 상생협력", "R&D·기술사업화", "스마트공장·설비", "수출·판로", "인증·컨설팅", "인력·고용", "에너지·ESG", "포상·지정", "복지·기타"];

export const GRANT_AGENCIES = ["한국서부발전", "한국중부발전", "한국남동발전", "한국동서발전", "한국남부발전", "한국수력원자력", "한전KPS",
  "충남테크노파크", "충남경제진흥원", "중소벤처기업부", "중소기업기술정보진흥원", "서산시", "서산상공회의소", "한국무역협회", "고용노동부", "산업통상자원부"];

/** 기간 빠른 버튼: 시작일부터 끝나는 날 계산 (개월) */
export const GRANT_PERIODS: [label: string, months: number][] = [["3개월", 3], ["6개월", 6], ["1년", 12], ["2년", 24], ["3년", 36]];

/** X 드라이브 폴더 번호 → 사이트 폴더 */
export const X_FOLDER: Record<string, string> = {
  "1.신청중": "1. 신청중", "2.선정및진행": "2. 선정·진행", "3.완료": "3. 완료", "4.미선정": "4. 미선정",
  "5.협약해지": "5. 협약해지", "6.성과및수요조사": "6. 성과·수요조사", "7.기타": "7. 기타",
};

/** 폴더 이름 → 연도·사업명·주관기관 (예: '12.2026년도 기술사업화 패키지 지원사업_중소벤처기업부') */
export function parseGrantName(raw: string): { year: string; name: string; agency: string; tag: string } {
  let s = raw.replace(/\.(zip|pdf|hwpx?|xlsx?|docx?)$/i, "").trim();
  s = s.replace(/^\d+\s*[.)]\s*/, "").trim(); // 앞 번호 '12.' '18)'
  let tag = "";
  const tm = /_(진행중|미신청|완료)$/.exec(s);
  if (tm) { tag = tm[1]; s = s.slice(0, tm.index); }
  const parts = s.split("_").map((x) => x.trim()).filter(Boolean);
  const agency = parts.length > 1 ? parts.pop()! : "";
  const name = parts.join(" ").replace(/\s+/g, " ").trim() || s;
  const ym = /(20\d{2})/.exec(name) ?? /^(\d{2})\.\d{2}\.\d{2}/.exec(name);
  const year = ym ? (ym[1].length === 2 ? `20${ym[1]}` : ym[1]) : "";
  return { year, name, agency, tag };
}

/** 지원사업 사이트 바로가기 기본 목록 (화면 위쪽, 대시보드 바로가기처럼 추가·삭제 가능) */
export const GRANT_LINKS: { group: string; name: string; url: string }[] = [
  { group: "공고", name: "기업마당", url: "https://www.bizinfo.go.kr" },
  { group: "공고", name: "중소벤처24", url: "https://www.smes.go.kr" },
  { group: "공고", name: "K-Startup", url: "https://www.k-startup.go.kr" },
  { group: "지역", name: "충남테크노파크", url: "https://www.ctp.or.kr" },
  { group: "지역", name: "충남경제진흥원", url: "https://www.cepa.or.kr" },
  { group: "지역", name: "서산시", url: "https://www.seosan.go.kr" },
  { group: "발전사", name: "한국서부발전", url: "https://www.iwest.co.kr" },
  { group: "발전사", name: "한국중부발전", url: "https://www.komipo.co.kr" },
  { group: "발전사", name: "한국남동발전", url: "https://www.koenergy.kr" },
  { group: "발전사", name: "한국동서발전", url: "https://www.ewp.co.kr" },
  { group: "발전사", name: "한국남부발전", url: "https://www.kospo.co.kr" },
  { group: "분야", name: "스마트공장", url: "https://www.smart-factory.kr" },
  { group: "분야", name: "수출바우처", url: "https://www.exportvoucher.com" },
  { group: "분야", name: "무역협회", url: "https://www.kita.net" },
  { group: "분야", name: "고용24", url: "https://www.work24.go.kr" },
];

// ---------------------------------------------------------------- 단계·단계별 준비 서류 (2026-11-11)
export interface GrantStage { key: string; label: string; folder: string; emoji: string; docs: string[] }
/** 사업 한 건의 진행 단계 (순서대로). 단계를 바꾸면 폴더도 따라간다. */
export const GRANT_STAGES: GrantStage[] = [
  { key: "notice", label: "공고 확인", folder: "1. 신청중", emoji: "📢", docs: ["공고문", "사업 안내서·지침", "신청 자격 확인표"] },
  { key: "prep", label: "신청 준비", folder: "1. 신청중", emoji: "📝", docs: ["신청서", "사업계획서", "사업자등록증", "중소기업확인서", "재무제표 (최근 3년)", "국세·지방세 완납증명서", "4대보험 가입자명부", "견적서"] },
  { key: "apply", label: "신청·평가", folder: "1. 신청중", emoji: "📮", docs: ["신청 접수증", "발표·평가 자료", "평가 결과 통보"] },
  { key: "agree", label: "선정·협약", folder: "2. 선정·진행", emoji: "🤝", docs: ["선정 통보", "협약서", "자부담 입금 확인", "사업비 통장 사본"] },
  { key: "run", label: "사업 수행", folder: "2. 선정·진행", emoji: "🛠️", docs: ["계약서·발주서", "세금계산서", "이체 확인증", "중간보고서", "사진·증빙"] },
  { key: "report", label: "결과보고·정산", folder: "2. 선정·진행", emoji: "📊", docs: ["결과보고서", "정산 서류", "성과 확인서"] },
  { key: "done", label: "완료", folder: "3. 완료", emoji: "🏁", docs: ["지원금 입금 확인", "사후관리·성과조사"] },
];
/** 중간에 끝난 경우 */
export const GRANT_ENDS: GrantStage[] = [
  { key: "fail", label: "미선정", folder: "4. 미선정", emoji: "🙅", docs: ["미선정 통보", "탈락 사유·다음 준비"] },
  { key: "cancel", label: "협약 해지", folder: "5. 협약해지", emoji: "✂️", docs: ["해지 통보·합의서", "사업비 반납 확인"] },
];
export const stageOf = (key: string) => [...GRANT_STAGES, ...GRANT_ENDS].find((s) => s.key === key);
/** X 드라이브에서 가져온 줄처럼 단계가 없으면 폴더로 짐작 */
export const stageFromFolder = (folder: string) =>
  ({ "1. 신청중": "prep", "2. 선정·진행": "run", "3. 완료": "done", "4. 미선정": "fail", "5. 협약해지": "cancel" } as Record<string, string>)[folder] ?? "notice";
export const currentStage = (d: Record<string, string>) => d.stage || stageFromFolder(d.folder ?? "");

/** 단계별 서류 체크 (data.docs = JSON): { [단계]: { done: 서류[], extra: 직접 더한 서류[] } } */
export type GrantDocs = Record<string, { done: string[]; extra: string[] }>;
export function readDocs(d: Record<string, string>): GrantDocs {
  try { return JSON.parse(d.docs || "{}") as GrantDocs; } catch { return {}; }
}
export const docsOfStage = (st: GrantStage, docs: GrantDocs) => [...st.docs, ...(docs[st.key]?.extra ?? [])];
/** 첨부 ref: 'lg:<줄 id>/<단계>/<서류>' (줄 자체 첨부는 'lg:<id>') */
export const docRef = (id: number, stage: string, doc: string) => `lg:${id}/${stage}/${doc.replaceAll("/", "·")}`;

/** 진행률: 단계 위치(완료 = 100%) */
export function stagePercent(stage: string): number {
  const i = GRANT_STAGES.findIndex((s) => s.key === stage);
  if (i < 0) return stage === "fail" || stage === "cancel" ? 100 : 0;
  return Math.round((i / (GRANT_STAGES.length - 1)) * 100);
}

// ---------------------------------------------------------------- 자료 요청 목록 (예: 컨설팅 기관의 기초자료 요청 메일)
export interface ReqItem { name: string; note?: string; na?: boolean; done?: boolean }
export interface GrantReq { id: string; title: string; from: string; due: string; items: ReqItem[] }
export function readReqs(d: Record<string, string>): GrantReq[] {
  try { return JSON.parse(d.reqs || "[]") as GrantReq[]; } catch { return []; }
}
export const reqRef = (id: number, rid: string, item: string) => `lg:${id}/rq-${rid}/${item.replaceAll("/", "·")}`;

/** 메일 본문에서 자료 목록 뽑기: '- 사업자등록증 사본', '1. ...', '• ...' 줄 */
export function parseReqItems(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  // '-'·'•' 줄이 있으면 그것만 (제목 '2. 기초자료'·안내 '* 보유한 자료만' 줄은 빼려고), 없으면 '1.' 번호 줄
  const BUL = /^[-•·▪□■○●–]\s*(?=\S)/, NUM = /^\d+[.)]\s*(?=\S)/;
  const re = lines.some((l) => BUL.test(l)) ? BUL : NUM;
  return [...new Set(lines.filter((l) => re.test(l)).map((l) => l.replace(re, "").trim()).filter(Boolean))];
}

/** 사이트에서 바로 만들 수 있는 자료 (직원 명부로 엑셀 생성) */
export type GenKind = "org" | "headcount" | "roster" | "jd";
export const GEN_LABEL: Record<GenKind, string> = { org: "조직도·부서별 인원", headcount: "연말 기준 근로자 수", roster: "직원 명부", jd: "직무기술서" };
export function genKindOf(item: string): GenKind | null {
  if (/직무\s*기술서|직무\s*명세|직무\s*분석/.test(item)) return "jd"; // 인사노무 > 직무기술서 (/jobs) 전체
  if (/조직도|부서.*인원|팀별 인원/.test(item)) return "org";
  if (/(근로자|직원|종업원|인원).*(수|현황)/.test(item) && /\d{4}|연말|년/.test(item)) return "headcount";
  if (/직원 명부|인원 현황|근로자 명부/.test(item)) return "roster";
  return null;
}
/** '최근 3개년(2023~2025)' → [2023, 2024, 2025] */
export function yearsIn(text: string, thisYear: number): number[] {
  const m = /(20\d{2})\s*[~\-–]\s*(20\d{2})/.exec(text);
  if (m) { const out: number[] = []; for (let y = +m[1]; y <= +m[2]; y++) out.push(y); return out; }
  return [thisYear - 3, thisYear - 2, thisYear - 1];
}
