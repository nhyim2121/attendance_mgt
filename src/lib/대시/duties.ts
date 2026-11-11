/** 영역별 업무분장·업무 목록 (2026-11-11). 묶음마다 하는 일·주기, 관련 대장(books.ts 키)·화면 링크.
 *  메뉴(menu.ts)의 '업무분장' 묶음과 업무분장 화면(<영역>/duties)이 같이 쓴다. 정기 업무 대장 키 = ROUTINE_BOOK[영역]. */
import { IT_DUTIES } from "../보안전산/duties";

export interface Duty { task: string; cycle: string; note?: string }
export interface DutyGroup { no: string; name: string; emoji: string; desc: string; books: string[]; links?: [label: string, href: string][]; duties: Duty[] }
export type DutyArea = "hr" | "ga" | "ehs" | "it" | "cert";

/** 영역 → 업무분장 화면 주소, 정기 업무 대장 키 */
export const DUTY_HREF: Record<DutyArea, string> = { hr: "/hr/duties", ga: "/ga/duties", ehs: "/ehs/duties", it: "/it/duties", cert: "/cert/duties" };
export const ROUTINE_BOOK: Record<DutyArea, string> = { hr: "hrroutine", ga: "garoutine", ehs: "ehsroutine", it: "itroutine", cert: "certroutine" };

const HR: DutyGroup[] = [
  { no: "3-1", name: "직원채용", emoji: "🧲", desc: "채용 계획·공고·면접·합격, 입퇴사 처리, 근로계약", books: ["recruit", "applicants", "onoff", "contracts"], duties: [
    { task: "부서별 인력 요청 받아 채용 공고 (사람인·고용24)", cycle: "변경 때" },
    { task: "서류·면접 진행, 합격 통보, 불합격자 서류 반환·파기", cycle: "변경 때", note: "채용절차법: 청구 시 14일 안 반환" },
    { task: "입사 서류 받기, 4대보험 취득 신고", cycle: "변경 때", note: "입사일이 속한 달의 다음 달 15일까지" },
    { task: "근로계약서 작성·교부, 수습·계약 만료 확인", cycle: "변경 때" },
    { task: "퇴사 처리: 상실 신고·퇴직금 정산·경력증명", cycle: "변경 때", note: "퇴직금 14일 안 지급" },
  ] },
  { no: "3-2", name: "복무·근태·휴가", emoji: "⏰", desc: "출퇴근·연장·휴일근무, 연차·휴직, 공가", books: ["holidaywork", "flex", "reserve", "leavepromo", "absence"],
    links: [["근태 홈", "/attendance"], ["직원별 근태", "/person"], ["휴가 홈", "/leave"], ["연차 현황", "/leave/status"]], duties: [
    { task: "캡스·하이웍스 자료 올리기, 지각·누락 확인", cycle: "매일" },
    { task: "휴일·연장근무 신청서 확인, 근태 기입", cycle: "매주" },
    { task: "주 52시간 초과 확인", cycle: "매주" },
    { task: "월 근태 집계·근태표 인쇄 (급여 마감 전)", cycle: "매월" },
    { task: "연차 현황 업로드·사용률 확인", cycle: "매월" },
    { task: "연차사용촉진 1차·2차 통보", cycle: "매년", note: "만료 6개월 전·2개월 전" },
    { task: "휴직자 복직 예정일·고용센터 급여 신청 확인", cycle: "변경 때" },
  ] },
  { no: "3-4", name: "노무관리", emoji: "⚖️", desc: "노사협의회·법정 의무·근로자대표 합의·고충·징계·산재", books: ["compliance", "council", "agreements", "labor", "discipline", "injuries"], duties: [
    { task: "노사협의회 정기회의·회의록 게시", cycle: "분기" },
    { task: "법정 의무 교육 (성희롱 예방·장애인 인식개선·퇴직연금)", cycle: "매년" },
    { task: "취업규칙 변경 시 의견 청취·신고", cycle: "변경 때" },
    { task: "근로자대표 서면합의 (탄력·선택근무·연차 대체 등) 갱신", cycle: "매년" },
    { task: "고충·진정 접수와 처리, 산재 신고", cycle: "수시", note: "산재 3일 이상 휴업 시 1개월 안 보고" },
  ] },
  { no: "3-5", name: "조직 관리", emoji: "🌳", desc: "직원 명부·조직도·업무분장 개정", books: ["revisions"], links: [["직원 관리", "/employees"], ["조직도", "/org"]], duties: [
    { task: "직원 명부·조직도 최신화 (입퇴사·발령 반영)", cycle: "변경 때" },
    { task: "업무분장·사내 규정 개정 이력 정리", cycle: "변경 때" },
    { task: "비상연락망 갱신·배포", cycle: "반기" },
  ] },
  { no: "3-6", name: "인사관리", emoji: "🪪", desc: "발령·평가·포상, 제증명, 자격·선임, 외국인·인력 제도", books: ["appointments", "evaluations", "awards", "certificates", "licenses", "foreign", "programs"], duties: [
    { task: "인사발령 공지·기록", cycle: "변경 때" },
    { task: "인사평가 실시·결과 정리", cycle: "매년" },
    { task: "재직·경력증명서 발급 기록", cycle: "수시" },
    { task: "법정 선임자(안전·보건·환경) 자격·선임 유지 확인", cycle: "반기" },
    { task: "외국인 근로자 체류기간·고용허가 연장", cycle: "변경 때" },
    { task: "산업기능요원·일학습병행 등 인력 제도 신고·점검", cycle: "분기" },
  ] },
  { no: "3-7", name: "교육훈련", emoji: "🎓", desc: "연간 교육 계획, 법정·직무 교육 실시 기록", books: ["trainplan", "training"], duties: [
    { task: "연간 교육 계획 수립", cycle: "매년", note: "1월" },
    { task: "산업안전보건교육 (분기)·법정 교육 실시와 기록", cycle: "분기" },
    { task: "직무·외부 교육 참석과 수료증 보관", cycle: "수시" },
    { task: "사업주 훈련 지원금 신청", cycle: "변경 때" },
  ] },
];

const GA: DutyGroup[] = [
  { no: "1", name: "문서 및 자료관리", emoji: "📨", desc: "공문 수발, 법인 서류 발급, 공동인증서, 회의록", books: ["meetings"],
    links: [["문서 수발 대장", "/ga/mail"], ["증빙·법인서류 발급", "/ga/issue"], ["공동인증서 관리", "/ga/certs"]], duties: [
    { task: "공문·우편·팩스 접수·발송, 회신 기한 관리", cycle: "매일" },
    { task: "등기부·납세증명 등 법인 서류 발급", cycle: "수시" },
    { task: "공동인증서 만료 확인·갱신", cycle: "매년" },
    { task: "문서 보존기간 지난 서류 폐기, 직인 날인 기록", cycle: "매년" },
    { task: "회의록 작성과 후속 조치 확인", cycle: "변경 때" },
  ] },
  { no: "2", name: "복리 및 후생", emoji: "🎁", desc: "보호구·피복, 기숙사, 경조사·선물", books: ["ppe", "dorm"], duties: [
    { task: "안전화·작업복·보호구 지급과 수령 확인", cycle: "반기" },
    { task: "기숙사·사택 계약·월세·입주자 관리", cycle: "매월" },
    { task: "경조사 지원·명절 선물", cycle: "변경 때" },
  ] },
  { no: "3", name: "보안·전산", emoji: "💻", desc: "보안전산(IT) 영역으로 옮김", books: [], links: [["보안전산 업무분장", "/it/duties"]], duties: [
    { task: "보안전산 영역(IT-1~IT-7)에서 관리", cycle: "-" },
  ] },
  { no: "4", name: "비품관리", emoji: "📦", desc: "비품 구매·등록·수리·폐기", books: ["fixtures"], duties: [
    { task: "비품 구매 요청 받아 구매·등록", cycle: "변경 때" },
    { task: "비품 재고 조사 (대장과 실물 대조)", cycle: "매년" },
    { task: "고장 비품 수리·폐기 처리", cycle: "수시" },
  ] },
  { no: "5", name: "차량관리", emoji: "🚗", desc: "법인차량 보험·검사·리스, 운행일지", books: ["vehicles", "drivelog"], duties: [
    { task: "운행일지 기록 확인 (업무용 승용차 비용 인정)", cycle: "매월" },
    { task: "자동차 보험 갱신", cycle: "매년" },
    { task: "자동차 정기검사", cycle: "매년", note: "차령에 따라 1~2년" },
    { task: "주유·정비·하이패스 비용 정리, 과태료 처리", cycle: "매월" },
  ] },
  { no: "6", name: "출장 및 연수관리", emoji: "✈️", desc: "출장 신청·결과보고·비용 정산", books: [], links: [["출장 증빙", "/evidence"]], duties: [
    { task: "출장 신청 확인, 결과보고·비용 정산", cycle: "변경 때" },
  ] },
  { no: "9", name: "프로젝트 관리", emoji: "🚚", desc: "수주·출하지시·배차·입출고", books: [], duties: [
    { task: "출하지시 → 배차 → 입출고 기록 → 납품 완료 확인", cycle: "수시" },
    { task: "거래명세서 출력", cycle: "수시" },
  ] },
  { no: "10", name: "입찰관리", emoji: "⚖️", desc: "공고 확인·투찰·개찰·제출 마감", books: [], links: [["입찰관리", "/bid"]], duties: [
    { task: "나라장터 등 공고 확인", cycle: "매일" },
    { task: "참가 서류 준비·투찰, 개찰 결과 기록", cycle: "변경 때" },
    { task: "입찰 참가자격 등록 정보 갱신", cycle: "매년" },
  ] },
  { no: "12", name: "지원사업 관리", emoji: "🎯", desc: "지원사업 신청·선정·진행·완료", books: ["grants"], duties: [
    { task: "기업마당 등 지원사업 공고 확인", cycle: "매주" },
    { task: "신청서 제출, 선정 사업 진행·결과보고·정산", cycle: "변경 때" },
  ] },
];

const EHS: DutyGroup[] = [
  { no: "4-1", name: "환경관리", emoji: "💧", desc: "폐수·대기·폐기물", books: ["wastewater"], duties: [
    { task: "폐수 발생·위탁처리 기록, 인계서 보관", cycle: "변경 때" },
    { task: "폐수·대기 배출시설 운영일지", cycle: "매일" },
    { task: "자가측정·위탁 측정 결과 보관", cycle: "매월" },
    { task: "지정폐기물 올바로시스템 인계·처리 확인", cycle: "변경 때" },
    { task: "환경 관련 실적 보고 (폐기물 발생량 등)", cycle: "매년", note: "2월 말" },
  ] },
  { no: "4-2", name: "안전관리", emoji: "🦺", desc: "시설·설비 점검, 위험성평가, 소방·전기", books: ["inspections"], duties: [
    { task: "작업 전 안전 점검", cycle: "매일" },
    { task: "위험성평가 (정기 연 1회, 수시)", cycle: "매년" },
    { task: "소방시설 자체점검 (작동·종합)", cycle: "반기" },
    { task: "크레인·지게차·압력용기 안전검사 기한 확인", cycle: "반기" },
    { task: "산업안전보건위원회·안전교육", cycle: "분기" },
  ] },
  { no: "4-3", name: "보건관리", emoji: "🩺", desc: "건강검진·작업환경측정·MSDS", books: ["checkup"], duties: [
    { task: "일반·특수 건강검진 대상자 안내와 수검 확인", cycle: "매년" },
    { task: "작업환경측정", cycle: "반기" },
    { task: "MSDS 게시·교육", cycle: "변경 때" },
  ] },
];

const CERT: DutyGroup[] = [
  { no: "C-1", name: "인증 현황 관리", emoji: "🏅", desc: "인증·지정 목록, 유효기간, 스캔본", books: [], links: [["인증 현황", "/cert"]], duties: [
    { task: "인증·지정 목록과 유효기간 최신화", cycle: "분기" },
    { task: "인증서 스캔본·발급 서류 보관", cycle: "변경 때" },
  ] },
  { no: "C-2", name: "사후심사·갱신", emoji: "🔁", desc: "ISO·벤처·이노비즈 등 사후심사·갱신 일정", books: [], links: [["인증 현황", "/cert"]], duties: [
    { task: "ISO 사후심사 준비 (내부심사·경영검토)", cycle: "매년" },
    { task: "벤처·이노비즈·메인비즈 등 만료 전 갱신 신청", cycle: "변경 때", note: "만료 2~3개월 전" },
    { task: "심사 지적사항 시정조치", cycle: "변경 때" },
  ] },
  { no: "C-3", name: "연구소·지정 유지", emoji: "🔬", desc: "기업부설연구소·AEO·병역지정업체·성과공유제·일학습병행", books: [], links: [["인증 현황", "/cert"]], duties: [
    { task: "기업부설연구소 연구원 변동 신고", cycle: "변경 때", note: "변동일로부터 30일 안" },
    { task: "AEO 정기 자체평가 제출", cycle: "매년" },
    { task: "병역지정업체 복무관리 실태 점검 대응", cycle: "매년" },
    { task: "성과공유제·일학습병행 운영 보고", cycle: "매년" },
  ] },
];

export const DUTIES: Record<DutyArea, DutyGroup[]> = { hr: HR, ga: GA, ehs: EHS, it: IT_DUTIES, cert: CERT };
