/** 인사노무 업무분장별 관련 사이트 바로가기. 묶음 대시보드(/hr/g/…)와 그 묶음 대장 화면 위쪽에 나온다.
 *  사이트를 더하거나 빼려면 여기만 고치면 된다. */
export interface Site { name: string; url: string; sub: string }

export const HR_SITES: Record<string, Site[]> = {
  hire: [
    { name: "사람인", url: "https://www.saramin.co.kr/zf_user/", sub: "공고 등록·지원자 이력서 (기업회원 로그인)" },
    { name: "잡코리아", url: "https://www.jobkorea.co.kr/", sub: "공고·인재 검색" },
    { name: "고용24", url: "https://www.work24.go.kr/", sub: "구인 등록·고용지원금·고용보험" },
    { name: "4대보험 정보연계센터", url: "https://www.4insure.or.kr/", sub: "취득·상실 신고" },
    { name: "근로계약서 표준양식", url: "https://www.moel.go.kr/", sub: "고용노동부 (자료실)" },
  ],
  work: [
    { name: "하이웍스", url: "https://office.hiworks.com/", sub: "근태현황·전자결재" },
    { name: "고용24", url: "https://www.work24.go.kr/", sub: "유연근무 지원금·일생활균형" },
    { name: "고용노동부", url: "https://www.moel.go.kr/", sub: "근로시간 지침·민원" },
  ],
  leave: [
    { name: "하이웍스", url: "https://office.hiworks.com/", sub: "휴가 신청·결재" },
    { name: "고용24 (모성보호)", url: "https://www.work24.go.kr/", sub: "출산전후·육아휴직 급여 확인서" },
    { name: "4대보험 정보연계센터", url: "https://www.4insure.or.kr/", sub: "휴직·복직 신고" },
  ],
  labor: [
    { name: "노동포털 (민원)", url: "https://labor.moel.go.kr/", sub: "취업규칙 신고·각종 노동 민원" },
    { name: "고용노동부", url: "https://www.moel.go.kr/", sub: "법령·지침·질의회시" },
    { name: "근로복지공단", url: "https://www.comwel.or.kr/", sub: "산재 신청·요양" },
    { name: "국가법령정보센터", url: "https://www.law.go.kr/", sub: "근로기준법·노동법 찾기" },
    { name: "중앙노동위원회", url: "https://www.nlrc.go.kr/", sub: "부당해고 구제·조정" },
  ],
  org: [
    { name: "하이웍스", url: "https://office.hiworks.com/", sub: "조직도·주소록" },
    { name: "노동포털 (취업규칙 신고)", url: "https://labor.moel.go.kr/", sub: "규정 변경 신고" },
  ],
  people: [
    { name: "정부24", url: "https://www.gov.kr/", sub: "각종 증명서" },
    { name: "고용허가제 (EPS)", url: "https://www.eps.go.kr/", sub: "외국인 고용허가·연장" },
    { name: "하이코리아", url: "https://www.hikorea.go.kr/", sub: "외국인 체류기간 연장" },
    { name: "병무청 산업지원", url: "https://www.mma.go.kr/", sub: "산업기능요원 복무 관리" },
    { name: "큐넷", url: "https://www.q-net.or.kr/", sub: "국가자격 확인" },
    { name: "일학습병행", url: "https://www.bizhrd.net/", sub: "학습근로자 관리" },
  ],
  edu: [
    { name: "HRD-Net", url: "https://www.hrd.go.kr/", sub: "사업주훈련·환급" },
    { name: "고용24 (훈련)", url: "https://www.work24.go.kr/", sub: "직업훈련 신청" },
    { name: "안전보건공단 교육", url: "https://edu.kosha.or.kr/", sub: "안전보건교육" },
    { name: "한국표준협회", url: "https://www.ksa.or.kr/", sub: "외부 위탁교육" },
  ],
};
