/** 보안전산(IT) 업무분장 (2026-11-11). 중소기업 전산·IT팀 일반 업무 + 개인정보 안전성 확보조치 기준 + AEO 정보보안 기준을 묶었다.
 *  묶음마다: 하는 일(업무 목록·주기), 관련 대장(books.ts 키). 메뉴(menu.ts)와 업무분장 화면(/it/duties)이 같이 쓴다. */

export interface Duty { task: string; cycle: string; note?: string }
export interface DutyGroup { no: string; name: string; emoji: string; desc: string; books: string[]; duties: Duty[] }

export const IT_DUTIES: DutyGroup[] = [
  {
    no: "IT-1", name: "전산자산 관리", emoji: "🖥️", desc: "PC·노트북·서버·네트워크 장비·프린터와 소프트웨어, 고장·요청 처리, 폐기",
    books: ["itassets", "software", "helpdesk", "itdispose"],
    duties: [
      { task: "전산장비 구입·등록 (자산번호 부착, 사용자·위치·IP 기록)", cycle: "변경 때" },
      { task: "입사자 PC 세팅·퇴사자 PC 회수·초기화", cycle: "변경 때" },
      { task: "전산 요청·고장 접수와 조치, 외부 수리 의뢰", cycle: "수시" },
      { task: "소프트웨어 라이선스 수량·설치 PC 관리, 정품 점검", cycle: "반기" },
      { task: "전산장비 재고 조사 (대장과 실물 대조)", cycle: "매년" },
      { task: "보증 만료·노후 장비 교체 계획", cycle: "매년" },
      { task: "폐기·반납 전 저장장치 완전삭제·파쇄 확인", cycle: "변경 때" },
    ],
  },
  {
    no: "IT-2", name: "네트워크·서비스", emoji: "🌐", desc: "인터넷 회선·공유기·방화벽, 도메인·SSL·호스팅·그룹웨어·ERP 계약",
    books: ["itcontracts"],
    duties: [
      { task: "인터넷 회선·공유기·스위치 관리, 장애 시 통신사 연락", cycle: "수시" },
      { task: "공유기·방화벽 관리자 비밀번호 변경, 펌웨어 업데이트", cycle: "분기" },
      { task: "도메인·SSL 인증서·호스팅 만기 확인과 갱신", cycle: "매년", note: "만료되면 메일·홈페이지가 멈춤" },
      { task: "그룹웨어(하이웍스)·ERP(이카운트)·백신 등 유지보수·구독 계약 갱신", cycle: "매년" },
      { task: "복합기·CCTV 렌탈·유지보수 업체 관리", cycle: "매년" },
    ],
  },
  {
    no: "IT-3", name: "계정·권한 관리", emoji: "🔐", desc: "입사·퇴사·이동 때 계정 발급·변경·말소, 접속기록 점검",
    books: ["accounts", "accessreview"],
    duties: [
      { task: "입사자 계정 발급 (그룹웨어·메일·ERP·NAS·PC), 업무에 필요한 만큼만 권한", cycle: "변경 때" },
      { task: "퇴사자 계정 당일 말소·메일 전달 설정, 공용 비밀번호 변경", cycle: "변경 때" },
      { task: "부서 이동·업무 변경 시 권한 변경", cycle: "변경 때" },
      { task: "권한 부여·변경·말소 기록 3년 보관", cycle: "상시", note: "개인정보 안전성 확보조치 기준" },
      { task: "개인정보처리시스템(ERP·인사급여 등) 접속기록 점검", cycle: "매월", note: "월 1회 이상, 기록은 1년 이상 보관" },
      { task: "계정·권한 정기 검토 (퇴사자·장기 미사용·공용 계정 정리)", cycle: "분기" },
    ],
  },
  {
    no: "IT-4", name: "정보보안", emoji: "🛡️", desc: "백신·보안 업데이트·PC 보안 점검, 보안사고 대응, 보안서약서, 저장매체 통제",
    books: ["seccheck", "incidents", "pledges", "media"],
    duties: [
      { task: "전 PC 백신 설치·최신 업데이트, 검사 결과 확인", cycle: "매주" },
      { task: "윈도우·주요 SW 보안 업데이트 적용 확인", cycle: "매월" },
      { task: "PC 보안 점검 (화면보호기·비밀번호·비인가 SW·공유폴더)", cycle: "분기" },
      { task: "USB·외장하드 사용 승인, 도면·기술자료 외부 반출 기록", cycle: "변경 때" },
      { task: "보안서약서 징구 (입사·퇴사·외부업체)", cycle: "변경 때" },
      { task: "악성코드·랜섬웨어·해킹 메일·장애 발생 시 대응과 재발 방지", cycle: "수시", note: "KISA 118 신고" },
      { task: "AEO 정보기술 보안 기준 점검 자료 준비", cycle: "매년" },
    ],
  },
  {
    no: "IT-5", name: "개인정보보호", emoji: "🔏", desc: "개인정보 처리 현황·보관기간·파기, 내부관리계획, 법정 교육",
    books: ["privacy", "privdestroy", "itedu"],
    duties: [
      { task: "회사가 가진 개인정보 파일 현황 정리 (항목·보관 위치·보관기간)", cycle: "매년" },
      { task: "보관기간이 지난 개인정보 파기와 파기 기록 (불합격자 서류·퇴사자 자료·CCTV)", cycle: "분기" },
      { task: "개인정보 내부관리계획 수립·검토", cycle: "매년" },
      { task: "개인정보 취급자 보호교육 실시·기록", cycle: "매년", note: "연 1회 이상" },
      { task: "주민번호 등 고유식별정보 암호화 보관 확인", cycle: "반기" },
      { task: "개인정보 유출 시 통지·신고 (72시간 안)", cycle: "수시" },
    ],
  },
  {
    no: "IT-6", name: "백업·복구", emoji: "💾", desc: "NAS·서버·DB 백업 확인, 외부(오프라인) 보관, 복구 테스트",
    books: ["backups"],
    duties: [
      { task: "백업 성공 여부 확인 (NAS·통합관리시스템 DB·ERP 자료)", cycle: "매주" },
      { task: "외부·오프라인 백업 매체 교체·보관 (랜섬웨어 대비)", cycle: "매월" },
      { task: "백업본 복구 테스트", cycle: "반기" },
    ],
  },
  {
    no: "IT-7", name: "물리보안", emoji: "🚪", desc: "방문자 출입, 사원증·출입카드, CCTV·출입통제기",
    books: ["visitors", "idcards", "cctv"],
    duties: [
      { task: "방문자 출입 기록·출입증 회수", cycle: "매일" },
      { task: "사원증·출입카드 발급·회수 (퇴사 당일 회수)", cycle: "변경 때" },
      { task: "CCTV 녹화 상태·카메라 각도 점검, 안내판 부착 확인", cycle: "매월" },
      { task: "CCTV 영상 열람·외부 제공 기록 (요청자·목적)", cycle: "수시" },
    ],
  },
];

/** 정기 업무 대장(itroutine) — 모든 묶음에 걸친 반복 업무 */
export const IT_ROUTINE_BOOK = "itroutine";
