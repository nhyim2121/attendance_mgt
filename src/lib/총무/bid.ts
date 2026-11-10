/** 입찰관리: 사이트·공고 한 건의 모양·진행 단계·일정 칸·정리본(요약)·적합도. 서버·화면 공용 (DB 없음).
 *  저장은 bidStore.ts (표 ledger_rows, book='bids'), 자동 수집은 g2b.ts. */

// ---------------------------------------------------------------- 입찰 사이트 (윤정아 차장님 메일 '[업무] 입찰사이트' 2026-11-04)
export interface BidSite { key: string; name: string; short: string; url: string; api: "ready" | "later" | "none" }
export const BID_SITES: BidSite[] = [
  { key: "kepco", name: "한국전력 전자조달 시스템", short: "한국전력", url: "https://srm.kepco.net", api: "later" },
  { key: "g2b", name: "나라장터", short: "나라장터", url: "https://www.g2b.go.kr", api: "ready" },
  { key: "kwater", name: "K-water 전자조달시스템", short: "K-water", url: "https://ebid.kwater.or.kr", api: "later" },
  { key: "khnp", name: "KHNP Procurement System", short: "한수원", url: "https://ebiz.khnp.co.kr", api: "none" },
  { key: "ex", name: "한국도로공사 전자조달시스템", short: "도로공사", url: "https://ebid.ex.co.kr", api: "none" },
  { key: "lh", name: "한국토지주택공사 전자조달시스템", short: "LH", url: "https://ebid.lh.or.kr", api: "later" },
  { key: "d2b", name: "방위사업청 국방전자조달시스템", short: "국방(D2B)", url: "https://www.d2b.go.kr", api: "none" },
];
export const siteOf = (key: string) => BID_SITES.find((s) => s.key === key);

// ---------------------------------------------------------------- 진행 단계
export const STAGES = ["새 공고", "검토 중", "참여 결정", "서류 준비", "투찰 완료", "개찰", "낙찰", "계약", "유찰", "탈락", "불참"] as const;
export type Stage = (typeof STAGES)[number];
/** 끝난 단계 (진행 목록에서 빠짐) */
export const DONE_STAGES: Stage[] = ["계약", "유찰", "탈락", "불참"];
/** 칸반에 보이는 진행 단계 */
export const FLOW: Stage[] = ["검토 중", "참여 결정", "서류 준비", "투찰 완료", "개찰", "낙찰"];
export const KINDS = ["물품", "용역", "공사", "기타"] as const;

// ---------------------------------------------------------------- 일정 칸 (공고 한 건에 날짜가 여러 개)
export const DATE_KEYS = [
  ["posted", "공고일"],
  ["preSpec", "사전규격 공개"],
  ["brief", "현장설명회"],
  ["question", "질의 마감"],
  ["qualify", "입찰참가 신청(자격등록) 마감"],
  ["bidOpen", "투찰 시작"],
  ["bidClose", "투찰 마감"],
  ["opening", "개찰"],
  ["docDue", "제출 마감 (적격심사·제안서·서류)"],
  ["result", "결과 발표"],
  ["contractDue", "계약 체결 기한"],
] as const;
export type DateKey = (typeof DATE_KEYS)[number][0];
export const dateLabel = (k: DateKey) => DATE_KEYS.find((d) => d[0] === k)![1];
/** 알림(할 일)에 올리는 마감 */
export const ALERT_KEYS: DateKey[] = ["brief", "question", "qualify", "bidClose", "opening", "docDue", "contractDue"];

export interface BidFile { name: string; url: string }
export interface CheckItem { t: string; done: boolean }
export interface Bid {
  id: number;
  src: string;                 // 사이트 키 (g2b·kepco… 또는 manual)
  ntceNo: string; ntceOrd: string;
  name: string;                // 공고명
  org: string;                 // 공고기관
  demand: string;              // 수요기관
  kind: string;                // 물품·용역·공사
  method: string;              // 계약 방법 (일반경쟁·제한경쟁·수의…)
  award: string;               // 낙찰 방법 (적격심사·최저가…)
  region: string;              // 참가 제한 지역
  price: number | null;        // 추정가격
  base: number | null;         // 기초금액
  url: string;                 // 공고 원문 (투찰하러 가기)
  files: BidFile[];
  dates: Partial<Record<DateKey, string>>; // 'YYYY-MM-DD HH:MM' 또는 'YYYY-MM-DD'
  briefPlace: string; briefRequired: boolean;
  stage: Stage;
  owner: string;               // 담당 (김도아·윤정아)
  checklist: CheckItem[];
  bidAmount: number | null; bidAt: string; rate: number | null;   // 투찰금액·투찰 시각·투찰률(%)
  winAmount: number | null; rank: string; winner: string;          // 개찰 결과
  memo: string;
  matched: string[];           // 걸린 키워드
  fetchedAt: string;           // 자동으로 가져온 시각 (직접 등록은 '')
}

export const emptyBid = (): Omit<Bid, "id"> => ({
  src: "manual", ntceNo: "", ntceOrd: "", name: "", org: "", demand: "", kind: "물품", method: "", award: "", region: "", price: null, base: null,
  url: "", files: [], dates: {}, briefPlace: "", briefRequired: false, stage: "검토 중", owner: "", checklist: [], bidAmount: null, bidAt: "",
  rate: null, winAmount: null, rank: "", winner: "", memo: "", matched: [], fetchedAt: "",
});

/** 참여를 정하면 붙는 기본 할 일 (업무 절차) */
export const DEFAULT_CHECKLIST = [
  "공고문·과업지시서(규격서) 읽기",
  "입찰참가자격 등록·업종·지역 제한 확인",
  "공동인증서(전자입찰용) 유효기간 확인",
  "현장설명회 참석 (필수인 경우)",
  "질의 사항 정리·질의",
  "입찰보증금(보증서) 준비",
  "투찰금액 정하기 (기초금액·사정률·낙찰하한율)",
  "투찰 (사이트에서) · 투찰 확인증 저장",
  "개찰 결과 확인",
  "적격심사·제출 서류 내기",
  "계약 체결",
];

// ---------------------------------------------------------------- 알림 조건 (자동 수집 거르기)
export interface Watch {
  keywords: string[];          // 공고명에 하나라도 들어가면
  exclude: string[];           // 들어가면 뺌
  kinds: string[];             // 물품·용역·공사
  minPrice: number | null; maxPrice: number | null;
  regions: string[];           // 참가 제한 지역 (비어 있으면 상관없음). '전국'은 제한 없음
  orgs: string[];              // 공고·수요기관 (비어 있으면 상관없음)
}
/** (주)에쓰엔: 산업용 전동기·발전기 제조 (충남 서산). 처음 값 — 화면에서 고친다. */
export const DEFAULT_WATCH: Watch = {
  keywords: ["전동기", "모터", "발전기", "유도전동기", "동기전동기", "회전기", "소수력", "파력", "권선", "전동기 정비"],
  exclude: ["임대", "청소", "급식"],
  kinds: ["물품", "용역", "공사"],
  minPrice: null, maxPrice: null, regions: [], orgs: [],
};

export function matchWatch(w: Watch, b: Pick<Bid, "name" | "kind" | "price" | "region" | "org" | "demand">): string[] | null {
  const name = b.name.toLowerCase();
  const hit = w.keywords.filter((k) => k && name.includes(k.toLowerCase()));
  if (!hit.length) return null;
  if (w.exclude.some((k) => k && name.includes(k.toLowerCase()))) return null;
  if (w.kinds.length && b.kind && !w.kinds.includes(b.kind)) return null;
  if (w.minPrice !== null && b.price !== null && b.price < w.minPrice) return null;
  if (w.maxPrice !== null && b.price !== null && b.price > w.maxPrice) return null;
  if (w.regions.length && b.region && !w.regions.some((r) => b.region.includes(r))) return null;
  if (w.orgs.length && !w.orgs.some((o) => b.org.includes(o) || b.demand.includes(o))) return null;
  return hit;
}

// ---------------------------------------------------------------- 날짜·요약
const day = (s?: string) => (s ? s.slice(0, 10) : "");
export function daysLeft(s: string | undefined, today: string): number | null {
  if (!s) return null;
  return Math.round((Date.parse(`${day(s)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
}
export const dLabel = (n: number | null) => (n === null ? "" : n < 0 ? `${-n}일 지남` : n === 0 ? "오늘" : `D-${n}`);
export const won = (n: number | null) => (n === null ? "-" : n >= 1e8 ? `${(n / 1e8).toFixed(n % 1e8 ? 2 : 0)}억 원` : `${Math.round(n / 1e4).toLocaleString("ko-KR")}만 원`);

/** 지금 가장 가까운 마감 하나 */
export function nextDeadline(b: Bid, today: string): { key: DateKey; label: string; at: string; left: number } | null {
  let best: { key: DateKey; label: string; at: string; left: number } | null = null;
  for (const k of ALERT_KEYS) {
    const at = b.dates[k], left = daysLeft(at, today);
    if (at && left !== null && left >= 0 && (!best || left < best.left)) best = { key: k, label: dateLabel(k), at, left };
  }
  return best;
}

/** 적합도 0~5: 키워드 수·지역(충남·전국)·금액이 있고 마감이 남았는지 */
export function fitScore(b: Bid, today: string): number {
  let s = Math.min(b.matched.length, 2) * 1.5;
  if (!b.region || /전국|충청남도|충남|서산/.test(b.region)) s += 1;
  const left = daysLeft(b.dates.bidClose, today);
  if (left !== null && left >= 3) s += 1;
  if (b.price !== null) s += 0.5;
  return Math.max(0, Math.min(5, Math.round(s)));
}

/** 정리본: 공고를 한눈에 (화면 '정리본' 칸·목록 한 줄 요약) */
export function summaryOf(b: Bid, today: string): { line: string; points: string[] } {
  const nd = nextDeadline(b, today);
  const rest = [b.demand || b.org, b.price !== null ? `추정 ${won(b.price)}` : "", nd ? `${nd.label.split(" (")[0]} ${dLabel(nd.left)}` : ""].filter(Boolean).join(" · ");
  const line = [b.kind && `[${b.kind}]`, rest].filter(Boolean).join(" ");
  const points = [
    `발주: ${[b.org, b.demand && b.demand !== b.org ? `(수요 ${b.demand})` : ""].filter(Boolean).join(" ") || "-"}`,
    `방법: ${[b.method, b.award].filter(Boolean).join(" / ") || "-"}`,
    `금액: 추정가격 ${won(b.price)}${b.base !== null ? ` · 기초금액 ${won(b.base)}` : ""}`,
    `지역 제한: ${b.region || "없음(전국)"}`,
    `투찰: ${b.dates.bidOpen ? `${b.dates.bidOpen} ~ ` : ""}${b.dates.bidClose ?? "-"}${b.dates.bidClose ? ` (${dLabel(daysLeft(b.dates.bidClose, today))})` : ""}`,
    `개찰: ${b.dates.opening ?? "-"}`,
    ...(b.dates.brief ? [`현장설명회: ${b.dates.brief}${b.briefPlace ? ` · ${b.briefPlace}` : ""}${b.briefRequired ? " · 참석 필수" : ""}`] : []),
    ...(b.dates.docDue ? [`제출 마감: ${b.dates.docDue}`] : []),
    ...(b.matched.length ? [`걸린 키워드: ${b.matched.join(", ")}`] : []),
  ];
  return { line, points };
}

/** 투찰금액 계산: 기초금액 × 사정률 × 낙찰하한율 (적격심사에서 흔한 방식) */
export const calcBid = (base: number, assess: number, lower: number) => Math.ceil(base * (assess / 100) * (lower / 100));
