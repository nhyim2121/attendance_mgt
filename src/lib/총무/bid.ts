/** 입찰관리: 입찰 사이트 바로가기 (윤정아 차장님 메일 '[업무] 입찰사이트' 2026-11-04 기준).
 *  api = 공공데이터포털 OpenAPI로 공고를 자동으로 가져올 수 있는 곳 (인증키 받으면 연결 예정). */
export interface BidSite { name: string; short: string; url: string; api: boolean }

export const BID_SITES: BidSite[] = [
  { name: "한국전력 전자조달 시스템", short: "한국전력", url: "https://srm.kepco.net", api: true },
  { name: "나라장터", short: "나라장터", url: "https://www.g2b.go.kr", api: true },
  { name: "K-water 전자조달시스템", short: "K-water", url: "https://ebid.kwater.or.kr", api: true },
  { name: "KHNP Procurement System", short: "한수원", url: "https://ebiz.khnp.co.kr", api: false },
  { name: "한국도로공사 전자조달시스템", short: "도로공사", url: "https://ebid.ex.co.kr", api: false },
  { name: "한국토지주택공사 전자조달시스템", short: "LH", url: "https://ebid.lh.or.kr", api: true },
  { name: "방위사업청 국방전자조달시스템", short: "국방(D2B)", url: "https://www.d2b.go.kr", api: false },
];
