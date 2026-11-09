/** 통합관리시스템 업무 영역 안내 (통합 대시보드·준비 중 화면에 쓴다).
 *  plan은 아직 정하지 않은 예시 메뉴: 영역마다 무엇을 관리할지 정하면 고친다. */
export interface HubSection {
  key: string; label: string; href: string; color: string; desc: string;
  ready: boolean; links?: [string, string][]; plan?: string[];
}
export const HUB: HubSection[] = [
  { key: "hr", label: "인사노무", href: "/attendance", color: "#0c3994", desc: "근태(출퇴근·근로시간)와 휴가·연차, 직원·조직도", ready: true,
    links: [["근태 홈", "/attendance"], ["일일 현황", "/daily"], ["주 52시간", "/week52"], ["휴가 홈", "/leave"], ["연차 현황", "/leave/status"], ["직원 관리", "/employees"], ["조직도", "/org"]] },
  { key: "ga", label: "총무", href: "/ga", color: "#0e7490", desc: "회사 살림 전반", ready: false, plan: ["비품·자산", "차량", "계약·보험", "법인·행정"] },
  { key: "ehs", label: "환경안전보건", href: "/ehs", color: "#15803d", desc: "시설·안전 점검과 교육, 환경 신고", ready: false, plan: ["시설·안전 점검", "안전보건 교육", "건강검진", "환경 신고"] },
  { key: "cert", label: "인증", href: "/cert", color: "#b45309", desc: "인증 만기·갱신 관리", ready: false, plan: ["ISO 경영시스템", "기업 인증·확인", "제품·조달 인증", "지식재산", "만기·갱신 알림"] },
  { key: "misc", label: "기타", href: "/misc", color: "#6d28d9", desc: "다른 영역에 넣기 어려운 업무", ready: false },
];
export const hubOf = (key: string) => HUB.find((s) => s.key === key)!;
