/** 업무 대장 설정. 대장 하나 = 칸 목록. 여기에 한 덩어리를 더하면 화면·엑셀 내려받기·가져오기·만기 알림이 같이 생긴다.
 *  (화면과 서버가 같이 쓰므로 함수 없이 값만 둔다.)
 *
 *  칸 type
 *  - text / textarea / number / money(원, 합계) / date / time
 *  - select: options 중 하나 · suggest: 자유 입력 + options 추천 · emp: 직원 이름(명부 추천)
 *  칸 옵션
 *  - req: 꼭 적기 · hide: 목록 표에서 숨김(입력·엑셀에는 있음) · wide: 입력칸 넓게
 *  - alert: 날짜 칸이 오늘부터 n일 안이면 알림 (닫힌 줄 제외)
 *  - aliases: 예전 엑셀 머리글 다른 이름
 */
export type FieldType = "text" | "textarea" | "number" | "money" | "date" | "time" | "select" | "suggest" | "emp";
export interface Field {
  k: string; label: string; type: FieldType; options?: string[]; req?: boolean; hide?: boolean; wide?: boolean;
  alert?: number; aliases?: string[]; placeholder?: string;
}
export type Area = "ga" | "hr" | "ehs" | "misc";
export interface Book {
  key: string; area: Area; title: string; desc: string; folder?: string;
  day: string;                                  // 기준 날짜 칸 (정렬·연도)
  title1: string;                               // 줄을 부를 때 쓰는 칸 (예: 품명)
  fields: Field[];
  closed?: { k: string; values: string[] };     // 이 값이면 끝난 줄 (알림 없음, 기본 목록에서 흐리게)
  filters?: string[];                           // 거르기 칸 (select)
  calc?: { k: string; from: string; to: string }; // k = to - from (예: 주행거리 = 도착 km - 출발 km)
}

const 직원 = (k = "emp", label = "직원"): Field => ({ k, label, type: "emp" });

export const BOOKS: Book[] = [
  // ------------------------------------------------------------ 총무
  {
    key: "fixtures", area: "ga", title: "비품관리대장", desc: "구매 → 등록 → 관리 → 폐기, 사진·영수증 첨부", folder: "1. 총무\\4. 비품관리",
    day: "bought", title1: "name", filters: ["cat", "status"], closed: { k: "status", values: ["폐기"] },
    fields: [
      { k: "no", label: "관리번호", type: "text", placeholder: "예: SN-PC-001" },
      { k: "name", label: "품명", type: "text", req: true, wide: true },
      { k: "cat", label: "분류", type: "select", options: ["전산", "사무기기", "가구", "가전", "공구·장비", "계측기", "기타"] },
      { k: "model", label: "규격·모델", type: "text" },
      { k: "qty", label: "수량", type: "number" },
      { k: "bought", label: "구입일", type: "date", aliases: ["구매일", "취득일"] },
      { k: "vendor", label: "구입처", type: "text", hide: true, aliases: ["구매처"] },
      { k: "price", label: "구입금액", type: "money", aliases: ["금액", "단가"] },
      { k: "dept", label: "사용부서", type: "text" },
      직원("user", "사용자"),
      { k: "place", label: "보관 위치", type: "text", aliases: ["위치", "설치장소"] },
      { k: "status", label: "상태", type: "select", options: ["사용 중", "보관", "수리 중", "폐기"] },
      { k: "disposed", label: "폐기일", type: "date", hide: true },
      { k: "note", label: "비고", type: "textarea", hide: true },
    ],
  },
  {
    key: "vehicles", area: "ga", title: "법인차량 관리", desc: "차량별 보험·검사·리스 만기 알림", folder: "1. 총무\\5. 차량관리\\5-1. 법인차량 관련",
    day: "bought", title1: "plate", closed: { k: "status", values: ["매각·반납"] },
    fields: [
      { k: "plate", label: "차량번호", type: "text", req: true },
      { k: "model", label: "차종", type: "text" },
      { k: "year", label: "연식", type: "text", hide: true },
      { k: "own", label: "보유 형태", type: "select", options: ["구입", "리스", "렌탈"] },
      { k: "bought", label: "구입·계약일", type: "date" },
      { k: "insurer", label: "보험사", type: "text" },
      { k: "insEnd", label: "보험 만기", type: "date", alert: 30 },
      { k: "inspEnd", label: "자동차검사 만기", type: "date", alert: 30 },
      { k: "leaseEnd", label: "리스·렌탈 만기", type: "date", alert: 60, hide: true },
      직원("driver", "주 사용자"),
      { k: "status", label: "상태", type: "select", options: ["운행 중", "매각·반납"] },
      { k: "note", label: "비고", type: "textarea", hide: true },
    ],
  },
  {
    key: "drivelog", area: "ga", title: "차량 운행일지", desc: "운행마다 주행거리·주유비·통행료", folder: "1. 총무\\5. 차량관리\\5-2. 차량운행일지",
    day: "day", title1: "dest", filters: ["purpose"], calc: { k: "km", from: "kmFrom", to: "kmTo" },
    fields: [
      { k: "day", label: "운행일", type: "date", req: true, aliases: ["날짜", "일자"] },
      { k: "plate", label: "차량번호", type: "suggest", req: true },
      직원("driver", "운전자"),
      { k: "dest", label: "목적지·경유지", type: "text", wide: true, aliases: ["목적지", "행선지"] },
      { k: "purpose", label: "용도", type: "select", options: ["업무", "출장", "출퇴근", "기타"] },
      { k: "kmFrom", label: "출발 km", type: "number", aliases: ["주행 전", "출발"] },
      { k: "kmTo", label: "도착 km", type: "number", aliases: ["주행 후", "도착"] },
      { k: "km", label: "주행거리", type: "number", aliases: ["주행거리(km)"] },
      { k: "fuel", label: "주유비", type: "money" },
      { k: "toll", label: "통행료·주차", type: "money", aliases: ["통행료"] },
      { k: "note", label: "비고", type: "text", hide: true },
    ],
  },
  {
    key: "visitors", area: "ga", title: "방문자 관리대장", desc: "방문자 출입 기록", folder: "1. 총무\\3. 보안관리",
    day: "day", title1: "name",
    fields: [
      { k: "day", label: "방문일", type: "date", req: true },
      { k: "inAt", label: "들어온 시각", type: "time" },
      { k: "outAt", label: "나간 시각", type: "time" },
      { k: "name", label: "성명", type: "text", req: true },
      { k: "org", label: "소속", type: "text" },
      { k: "phone", label: "연락처", type: "text", hide: true },
      { k: "purpose", label: "방문 목적", type: "text", wide: true },
      직원("host", "만난 사람"),
      { k: "pass", label: "출입증 번호", type: "text", hide: true },
      { k: "note", label: "비고", type: "text", hide: true },
    ],
  },
  {
    key: "software", area: "ga", title: "소프트웨어 관리대장", desc: "라이선스 수량·설치 PC·만료 알림 (키 자체는 적지 않기)", folder: "1. 총무\\3. 보안관리\\소프트웨어",
    day: "bought", title1: "name", closed: { k: "status", values: ["해지·삭제"] },
    fields: [
      { k: "name", label: "제품명", type: "text", req: true, wide: true },
      { k: "ver", label: "버전", type: "text" },
      { k: "lic", label: "라이선스", type: "select", options: ["영구", "구독(연)", "구독(월)", "무료", "기타"] },
      { k: "qty", label: "수량", type: "number" },
      { k: "bought", label: "구입일", type: "date" },
      { k: "vendor", label: "구입처", type: "text", hide: true },
      { k: "price", label: "금액", type: "money" },
      { k: "end", label: "만료일", type: "date", alert: 30 },
      { k: "pcs", label: "설치 PC·사용자", type: "textarea" },
      { k: "keyAt", label: "라이선스 증서 보관 위치", type: "text", hide: true },
      { k: "status", label: "상태", type: "select", options: ["사용 중", "해지·삭제"] },
    ],
  },
  {
    key: "ppe", area: "ga", title: "보호구·피복 지급대장", desc: "직원별 안전화·작업복·보호구 지급", folder: "1. 총무\\2. 복리 및 후생\\2-1. 피복 및 보호구",
    day: "day", title1: "item", filters: ["item"],
    fields: [
      { k: "day", label: "지급일", type: "date", req: true },
      직원("emp", "받은 직원"),
      { k: "item", label: "품목", type: "suggest", req: true, options: ["안전화", "안전모", "작업복(하계)", "작업복(동계)", "방한복", "안전장갑", "보안경", "귀마개", "방진마스크", "안전대"] },
      { k: "size", label: "규격·사이즈", type: "text" },
      { k: "qty", label: "수량", type: "number" },
      { k: "sign", label: "수령 서명", type: "select", options: ["받음", "안 받음"] },
      { k: "note", label: "비고", type: "text", hide: true },
    ],
  },
  {
    key: "dorm", area: "ga", title: "기숙사·사택 운영대장", desc: "계약·입주자·월세, 계약 만료 알림", folder: "1. 총무\\2. 복리 및 후생\\2-2. 기숙사",
    day: "start", title1: "room", closed: { k: "status", values: ["계약 종료"] },
    fields: [
      { k: "room", label: "기숙사(호실)", type: "text", req: true },
      { k: "addr", label: "주소", type: "text", wide: true, hide: true },
      { k: "kind", label: "계약 형태", type: "select", options: ["월세", "전세", "사택(회사 소유)"] },
      { k: "deposit", label: "보증금", type: "money" },
      { k: "rent", label: "월세", type: "money" },
      { k: "start", label: "계약 시작", type: "date" },
      { k: "end", label: "계약 만료", type: "date", alert: 60 },
      { k: "who", label: "입주자", type: "textarea" },
      { k: "status", label: "상태", type: "select", options: ["운영 중", "계약 종료"] },
      { k: "note", label: "비고", type: "textarea", hide: true },
    ],
  },
  {
    key: "grants", area: "ga", title: "지원사업 현황", desc: "신청 → 선정·진행 → 완료, 사업 기간·다음 할 일 알림", folder: "1. 총무\\12. 지원사업 관리",
    day: "applied", title1: "name", filters: ["stage"], closed: { k: "stage", values: ["완료", "미선정", "협약 해지"] },
    fields: [
      { k: "applied", label: "신청일", type: "date", aliases: ["공고일"] },
      { k: "name", label: "사업명", type: "text", req: true, wide: true },
      { k: "agency", label: "주관기관", type: "text", aliases: ["기관"] },
      { k: "stage", label: "단계", type: "select", options: ["신청 준비", "신청 중", "선정·진행", "완료", "미선정", "협약 해지"] },
      { k: "support", label: "지원 내용", type: "textarea", hide: true },
      { k: "amount", label: "지원금", type: "money", aliases: ["지원금액"] },
      { k: "self", label: "자부담", type: "money", hide: true },
      { k: "from", label: "사업 시작", type: "date", hide: true },
      { k: "to", label: "사업 종료", type: "date", alert: 30 },
      { k: "nextAt", label: "다음 할 일 날짜", type: "date", alert: 14 },
      { k: "next", label: "다음 할 일", type: "text", placeholder: "예: 중간보고서 제출" },
      { k: "note", label: "메모", type: "textarea", hide: true },
    ],
  },
  {
    key: "bids", area: "ga", title: "입찰 관리", desc: "입찰 공고·마감·투찰 결과", folder: "1. 총무\\10. 입찰관리",
    day: "posted", title1: "name", filters: ["result"], closed: { k: "result", values: ["낙찰", "유찰", "포기", "미낙찰"] },
    fields: [
      { k: "posted", label: "공고일", type: "date" },
      { k: "no", label: "공고번호", type: "text", hide: true },
      { k: "name", label: "공고명", type: "text", req: true, wide: true },
      { k: "client", label: "발주처", type: "text" },
      { k: "due", label: "투찰 마감", type: "date", alert: 7 },
      { k: "base", label: "기초금액", type: "money" },
      { k: "bid", label: "투찰금액", type: "money" },
      { k: "result", label: "결과", type: "select", options: ["검토 중", "투찰 완료", "낙찰", "미낙찰", "유찰", "포기"] },
      { k: "note", label: "비고", type: "textarea", hide: true },
    ],
  },
  {
    key: "meetings", area: "ga", title: "회의록", desc: "회의 결정 사항과 후속 조치 기한", folder: "1. 총무\\1. 문서 및 자료관리\\1-8. 회의",
    day: "day", title1: "title", closed: { k: "status", values: ["완료"] },
    fields: [
      { k: "day", label: "회의일", type: "date", req: true },
      { k: "title", label: "회의명", type: "text", req: true, wide: true },
      { k: "who", label: "참석자", type: "text" },
      { k: "agenda", label: "안건", type: "textarea", hide: true },
      { k: "decision", label: "결정 사항", type: "textarea" },
      { k: "todo", label: "후속 조치", type: "text" },
      { k: "due", label: "조치 기한", type: "date", alert: 7 },
      { k: "status", label: "상태", type: "select", options: ["진행 중", "완료"] },
    ],
  },
  // ------------------------------------------------------------ 인사노무
  {
    key: "training", area: "hr", title: "교육 실시 대장", desc: "법정의무교육·안전보건교육·외부 교육 실시와 다음 예정", folder: "3. 인사, 노무\\3-7. 교육훈련 관리",
    day: "day", title1: "name", filters: ["kind"],
    fields: [
      { k: "day", label: "교육일", type: "date", req: true },
      { k: "name", label: "교육명", type: "suggest", req: true, wide: true,
        options: ["직장 내 성희롱 예방교육", "개인정보 보호교육", "직장 내 장애인 인식개선교육", "퇴직연금 교육", "산업안전보건교육(정기)", "채용 시 안전보건교육", "작업내용 변경 시 교육", "특별안전보건교육", "관리감독자 교육"] },
      { k: "kind", label: "구분", type: "select", options: ["법정의무", "안전보건", "직무", "외부 위탁", "사내", "기타"] },
      { k: "who", label: "대상·참석자", type: "textarea" },
      { k: "n", label: "인원", type: "number" },
      { k: "hours", label: "시간", type: "number" },
      { k: "by", label: "강사·기관", type: "text" },
      { k: "cost", label: "비용", type: "money", hide: true },
      { k: "next", label: "다음 교육 예정", type: "date", alert: 30 },
      { k: "note", label: "비고", type: "text", hide: true },
    ],
  },
  {
    key: "licenses", area: "hr", title: "자격증·선임 관리", desc: "직원 자격증, 안전·전기·소방 선임과 보수교육 만기", folder: "3. 인사, 노무\\3-6. 인사관리",
    day: "got", title1: "name", filters: ["role"],
    fields: [
      직원("emp", "직원"),
      { k: "name", label: "자격증", type: "text", req: true, wide: true },
      { k: "grade", label: "등급", type: "text" },
      { k: "no", label: "자격번호", type: "text", hide: true },
      { k: "got", label: "취득일", type: "date" },
      { k: "issuer", label: "발급기관", type: "text", hide: true },
      { k: "role", label: "선임", type: "select", options: ["선임 아님", "안전관리자", "보건관리자", "전기안전관리자", "소방안전관리자", "환경기술인", "기타"] },
      { k: "renew", label: "보수교육·갱신 기한", type: "date", alert: 60 },
      { k: "note", label: "비고", type: "text", hide: true },
    ],
  },
  // ------------------------------------------------------------ 환경안전보건
  {
    key: "checkup", area: "ehs", title: "건강검진 관리", desc: "직원별 일반·특수검진 대상과 수검 여부", folder: "4. 환경, 안전, 보건\\4-3. 보건관리\\건강검진",
    day: "done", title1: "kind", filters: ["kind", "result"], closed: { k: "result", values: ["수검 완료"] },
    fields: [
      직원("emp", "직원"),
      { k: "kind", label: "검진 종류", type: "select", options: ["일반", "특수", "배치전", "암", "종합"] },
      { k: "year", label: "대상 연도", type: "text" },
      { k: "due", label: "검진 기한", type: "date", alert: 30 },
      { k: "done", label: "수검일", type: "date" },
      { k: "where", label: "검진기관", type: "text" },
      { k: "result", label: "진행", type: "select", options: ["대상", "예약", "수검 완료"] },
      { k: "follow", label: "판정·사후관리", type: "text", hide: true },
    ],
  },
  {
    key: "wastewater", area: "ehs", title: "폐수 배출·위탁 일지", desc: "폐수 발생·위탁처리량과 인계서", folder: "4. 환경, 안전, 보건\\4-1. 환경관리\\2.폐수",
    day: "day", title1: "kind", filters: ["kind"],
    fields: [
      { k: "day", label: "날짜", type: "date", req: true },
      { k: "kind", label: "구분", type: "select", options: ["발생", "위탁처리", "운영점검"] },
      { k: "amount", label: "양(㎥)", type: "number" },
      { k: "company", label: "위탁업체", type: "text" },
      { k: "slip", label: "인계서 번호", type: "text" },
      { k: "cost", label: "처리비", type: "money" },
      { k: "who", label: "확인자", type: "text", hide: true },
      { k: "note", label: "비고", type: "text", hide: true },
    ],
  },
  {
    key: "inspections", area: "ehs", title: "안전·시설 점검", desc: "정기·수시·소방·전기 점검과 조치 기한", folder: "4. 환경, 안전, 보건\\4-2. 안전관리",
    day: "day", title1: "target", filters: ["kind", "result"], closed: { k: "result", values: ["적합", "조치 완료"] },
    fields: [
      { k: "day", label: "점검일", type: "date", req: true },
      { k: "kind", label: "점검 구분", type: "select", options: ["정기", "수시", "소방", "전기", "가스", "설비", "위험성평가", "기타"] },
      { k: "target", label: "장소·설비", type: "text", req: true, wide: true },
      { k: "by", label: "점검자", type: "text" },
      { k: "result", label: "결과", type: "select", options: ["적합", "조치 필요", "조치 완료"] },
      { k: "action", label: "조치 내용", type: "textarea" },
      { k: "due", label: "조치 기한", type: "date", alert: 14 },
      { k: "doneAt", label: "조치 완료일", type: "date", hide: true },
    ],
  },
  // ------------------------------------------------------------ 기타
  {
    key: "tasks", area: "misc", title: "진행 건·할 일", desc: "다른 대장에 넣기 어려운 진행 중인 일과 기한", folder: "진행중",
    day: "day", title1: "title", filters: ["status"], closed: { k: "status", values: ["완료", "보류"] },
    fields: [
      { k: "day", label: "시작일", type: "date" },
      { k: "title", label: "할 일", type: "text", req: true, wide: true },
      { k: "from", label: "요청", type: "text", placeholder: "예: 대표님, 생산팀" },
      { k: "due", label: "기한", type: "date", alert: 7 },
      { k: "status", label: "상태", type: "select", options: ["할 일", "진행 중", "완료", "보류"] },
      { k: "note", label: "메모", type: "textarea" },
    ],
  },
];


export const bookOf = (key: string) => BOOKS.find((b) => b.key === key);
export const booksIn = (area: Area) => BOOKS.filter((b) => b.area === area);
/** 대장 화면 주소 */
export const AREA_BASE: Record<Area, string> = { ga: "/ga/b", hr: "/hr/b", ehs: "/ehs/b", misc: "/misc/b" };
/** 대장 화면 주소. 입찰 대장은 입찰관리 화면(/bid) 안에 있다. */
export const bookHref = (b: Book) => (b.key === "bids" ? "/bid" : `${AREA_BASE[b.area]}/${b.key}`);
