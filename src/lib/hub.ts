import { bookHref, booksIn } from "./대장/books";

/** 통합관리시스템 업무 영역 안내 (통합 대시보드·준비 중 화면에 쓴다).
 *  plan은 아직 정하지 않은 예시 메뉴: 영역마다 무엇을 관리할지 정하면 고친다. */
export interface HubSection {
  key: string; label: string; href: string; color: string; desc: string;
  ready: boolean; links?: [string, string][]; plan?: string[];
}
export const HUB: HubSection[] = [
  { key: "hr", label: "인사노무", href: "/attendance", color: "#0c3994", desc: "근태(출퇴근·근로시간)와 휴가·연차, 직원·조직도", ready: true,
    links: [["근태 홈", "/attendance"], ["일일 현황", "/daily"], ["주 52시간", "/week52"], ["휴가 홈", "/leave"], ["연차 현황", "/leave/status"], ["직원 관리", "/employees"], ["조직도", "/org"], ...booksIn("hr").map((b) => [b.title, bookHref(b)] as [string, string])] },
  { key: "ga", label: "총무", href: "/ga", color: "#0e7490", desc: "문서·비품·차량·보안·복리후생·지원사업·입찰 (관리자만)", ready: true,
    links: [["총무 홈", "/ga"], ["문서 수발 대장", "/ga/mail"], ["증빙·법인서류 발급", "/ga/issue"], ["공동인증서 관리", "/ga/certs"], ...booksIn("ga").map((b) => [b.title, bookHref(b)] as [string, string])] },
  { key: "ehs", label: "환경안전보건", href: "/ehs", color: "#15803d", desc: "폐수·안전 점검·건강검진 (관리자만)", ready: true,
    links: [["환경안전보건 홈", "/ehs"], ...booksIn("ehs").map((b) => [b.title, bookHref(b)] as [string, string])] },
  { key: "cert", label: "인증", href: "/cert", color: "#b45309", desc: "인증·지정 만기와 사후심사·갱신 일정, 인증서 스캔본 (관리자만)", ready: true,
    links: [["인증 현황", "/cert"], ["인증 등록", "/cert#add"]] },
  { key: "misc", label: "기타", href: "/misc", color: "#6d28d9", desc: "진행 건·할 일 (관리자만)", ready: true,
    links: [["기타 홈", "/misc"], ...booksIn("misc").map((b) => [b.title, bookHref(b)] as [string, string])] },
];
export const hubOf = (key: string) => HUB.find((s) => s.key === key)!;
