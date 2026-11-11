/** 새 사이트(F안) 메뉴: 업무 영역 → 묶음 → 화면. 사이드바·업무별 대시보드의 '전체 메뉴'가 같이 쓴다.
 *  대장은 books.ts에서 가져오고, 아래 GA_GROUPS에 없는 총무 대장은 '그 밖' 묶음에 들어간다. */
import { type Area, bookHref, BOOKS, booksIn } from "../대장/books";
import { IT_DUTIES } from "../보안전산/duties";
import { DUTY_HREF, type DutyArea, ROUTINE_BOOK } from "./duties";

export interface MenuItem { href: string; label: string; desc?: string; also?: string[]; exact?: boolean; admin?: boolean }
export interface MenuGroup { label: string; items: MenuItem[] }
export interface MenuArea {
  key: "hr" | "ga" | "ehs" | "it" | "cert" | "misc"; label: string; en: string; color: string; desc: string;
  dash: string; adminOnly: boolean; groups: MenuGroup[];
}

const book = (key: string): MenuItem => {
  const b = BOOKS.find((x) => x.key === key)!;
  return { href: bookHref(b), label: b.title, desc: b.desc };
};
/** 영역 맨 위 '업무분장' 묶음: 업무분장·업무 목록 화면 + 정기 업무 대장 */
const dutyGroup = (area: DutyArea, admin = false): MenuGroup => ({ label: "업무분장", items: [
  { href: DUTY_HREF[area], label: "업무분장·업무 목록", desc: "묶음별 하는 일과 주기, 관련 대장", ...(admin ? { admin: true } : {}) },
  { ...book(ROUTINE_BOOK[area]), ...(admin ? { admin: true } : {}) },
] });
const ROUTINES = Object.values(ROUTINE_BOOK);
const booksOf = (area: Area, skip: string[] = []) => booksIn(area).filter((b) => !skip.includes(b.key) && !ROUTINES.includes(b.key)).map((b) => book(b.key));

/** 총무 묶음: 회사 업무분장·X:\관리팀\1. 총무 폴더 번호(1~12) 그대로. 아직 화면이 없는 묶음은 '준비 중' 화면으로 간다. */
const GA_GROUPS: [string, string[]][] = [
  ["2. 복리 및 후생", ["ppe", "dorm"]],
  ["3. 보안·전산", []],
  ["4. 비품관리", ["fixtures"]],
  ["5. 차량관리", ["vehicles", "drivelog"]],
  ["6. 출장 및 연수관리", []],
  ["9. 프로젝트 관리", []],
  ["10. 입찰관리", []],
  ["12. 지원사업 관리", []],
];
/** 준비 중인 화면 (총무 분류안 2026-11-10) */
export const GA_PLAN: Record<string, string[]> = {
  "1. 문서 및 자료관리": ["문서 보존·폐기, 직인 날인 대장", "각종 규정 (제정·개정 이력, 최신본)", "명함 신청·발주, 인장 관리"],
  "2. 복리 및 후생": ["경조사 (대상·지원금·화환)", "임직원 선물 (명절·기념일, 수령 확인)", "휴게실·복지공간 (비치품·점검)"],
  "4. 비품관리": ["구매 요청", "수리 신청", "전환(담당자 변경) 신청", "폐기"],
  "5. 차량관리": ["주유·정비·하이패스 비용", "사고·과태료"],
  "6. 출장 및 연수관리": ["출장 신청 → 일정 → 결과보고 → 비용 정산", "연수·외부교육 참가"],
  "9. 프로젝트 관리": ["수주 등록 (고객·품목·납기)", "출하지시 → 배차 → 입출고 기록 → 납품 완료", "거래명세서 출력 연결"],
};
const soon = (label: string): MenuItem => ({ href: `/ga/soon?g=${encodeURIComponent(label)}`, label: "준비 중인 화면", desc: GA_PLAN[label]?.join(" · ") });
const gaGroup = ([label, ks]: [string, string[]]): MenuGroup => ({
  label,
  items: [
    ...(label === "12. 지원사업 관리" ? [{ href: "/ga/grants", label: "지원사업 관리", desc: "신청중·선정·완료 폴더별 정리, 사업 기간·다음 할 일, 지원사업 사이트 바로가기" }] : []),
    ...(label === "10. 입찰관리" ? [{ href: "/bid", label: "입찰관리", desc: "입찰 사이트 바로가기, 공고·투찰·개찰·제출 마감" }] : []),
    ...(label === "3. 보안·전산" ? [{ href: "/it?from=ga", label: "보안전산 영역", desc: "보안전산(IT) 영역에서 관리: 전산장비·계정·보안점검·개인정보·백업·방문자·CCTV" }] : []),
    ...ks.map(book),
    ...(GA_PLAN[label] ? [soon(label)] : []),
  ],
});
// 입찰 대장은 /bid 화면 안에서 쓴다. 회의록은 1번 묶음에.
const gaListed = [...GA_GROUPS.flatMap(([, ks]) => ks), "meetings", "bids", "grants"];
const gaRest = booksOf("ga", gaListed);

/** 업무분장 묶음별 대시보드 (/hr/g/<slug>) */
export const HR_DASH: Record<string, { group: string; name: string; en: string; emoji: string }> = {
  hire: { group: "3-1. 직원채용", name: "직원채용", en: "HIRING", emoji: "🧲" },
  work: { group: "3-2. 복무 및 근태관리", name: "복무·근태", en: "ATTENDANCE", emoji: "⏰" },
  leave: { group: "3-2. 휴가·휴직", name: "휴가·휴직", en: "LEAVE", emoji: "🏖️" },
  labor: { group: "3-4. 노무관리", name: "노무", en: "LABOR", emoji: "⚖️" },
  org: { group: "3-5. 조직 관리", name: "조직", en: "ORGANIZATION", emoji: "🌳" },
  people: { group: "3-6. 인사관리", name: "인사", en: "PEOPLE", emoji: "🪪" },
  edu: { group: "3-7. 교육훈련 관리", name: "교육훈련", en: "TRAINING", emoji: "🎓" },
};
/** 이 주소(화면·대장)가 속한 인사노무 업무분장 묶음 */
export function hrSlugOf(href: string): string | undefined {
  const g = MENU.find((a) => a.key === "hr")?.groups.find((x) => x.items.some((i) => i.href === href));
  return g ? Object.keys(HR_DASH).find((k) => HR_DASH[k].group === g.label) : undefined;
}
const gdash = (slug: string): MenuItem => ({ href: `/hr/g/${slug}`, label: `${HR_DASH[slug].name} 홈`, desc: `${HR_DASH[slug].group} 한눈에 보기`, exact: true });
/** 인사노무 묶음: X:\관리팀\3. 인사, 노무 폴더 번호(3-1~3-7). 대장은 관리자만 열린다. */
const hrBook = (key: string): MenuItem => ({ ...book(key), admin: true });
const HR_LISTED = ["recruit", "onoff", "contracts", "holidaywork", "flex", "reserve", "leavepromo", "absence", "labor", "revisions", "certificates", "licenses", "foreign", "programs", "training", "applicants", "compliance", "council", "agreements", "discipline", "injuries", "appointments", "evaluations", "awards", "trainplan"];
const hrRest = booksOf("hr", HR_LISTED).map((it) => ({ ...it, admin: true }));

export const MENU: MenuArea[] = [
  {
    key: "hr", label: "인사노무", en: "HR", color: "#0c3994", desc: "채용·근태·휴가·급여·노무·조직·인사·교육 (업무분장 3-1~3-7)", dash: "/hr", adminOnly: false,
    groups: [
      dutyGroup("hr", true),
      { label: "3-1. 직원채용", items: [gdash("hire"), hrBook("recruit"), { ...hrBook("applicants"), also: ["/hr/applicant"] }, hrBook("onoff"), hrBook("contracts")] },
      { label: "3-2. 복무 및 근태관리", items: [
        { href: "/attendance", label: "근태 홈", desc: "오늘 출근·지각·휴가 한눈에" },
        { href: "/daily", label: "일일 현황", desc: "날짜별 출근·지각·미출근, 근태 보고서" },
        { href: "/person", label: "직원별 근태", desc: "한 사람의 날짜별 출퇴근, 근태 기입", also: ["/sheets", "/edit"] },
        { href: "/calendar", label: "근태 캘린더", desc: "달력으로 보는 근태", also: ["/evidence"] },
        { href: "/hours", label: "근로시간 리포트", desc: "부서·월별 근로시간", also: ["/depts"] },
        { href: "/week52", label: "주 52시간 관리", desc: "주간 근로시간 경고" },
        { href: "/monthly", label: "월 근태 집계", desc: "월별 지각·결근·연장 합계" },
        hrBook("holidaywork"), hrBook("flex"), hrBook("reserve"),
      ] },
      { label: "3-2. 휴가·휴직", items: [ 
        { href: "/leave", label: "휴가 홈", desc: "사용률·다가오는 휴가", exact: true },
        { href: "/leave/status", label: "연차 현황", desc: "직원별 발생·사용·잔여" },
        { href: "/leave/calendar", label: "휴가 캘린더", desc: "달력으로 보는 휴가" },
        { href: "/leave/evidence", label: "신청서 증빙", desc: "휴가 신청서와 증빙 파일" },
        { href: "/leave/register", label: "휴가 등록·설정", desc: "휴가 직접 등록, 연차 기준" },
        hrBook("leavepromo"), hrBook("absence"),
      ] },
      { label: "3-4. 노무관리", items: [gdash("labor"), hrBook("compliance"), hrBook("council"), hrBook("agreements"), hrBook("labor"), hrBook("discipline"), hrBook("injuries")] },
      { label: "3-5. 조직 관리", items: [gdash("org"), 
        { href: "/employees", label: "직원 관리", desc: "직원 명부(사원현황)·입사일·근무 기준, 비상연락망" },
        { href: "/org", label: "조직도", desc: "부서·직책 구조" },
        hrBook("revisions"),
      ] },
      { label: "3-6. 인사관리", items: [gdash("people"), hrBook("appointments"), hrBook("evaluations"), hrBook("awards"), hrBook("certificates"), hrBook("licenses"), hrBook("foreign"), hrBook("programs")] },
      { label: "3-7. 교육훈련 관리", items: [gdash("edu"), hrBook("trainplan"), hrBook("training")] },
      ...(hrRest.length ? [{ label: "그 밖", items: hrRest }] : []),
      { label: "관리", items: [
        { href: "/upload", label: "데이터 관리", desc: "캡스·하이웍스 파일 올리기, 내려받기" },
        { href: "/settings", label: "근무 기준·공휴일", desc: "출퇴근 시각·공휴일" },
      ] },
    ],
  },
  {
    key: "ga", label: "총무", en: "ADMIN", color: "#0e7490", desc: "문서·비품·차량·복리후생·지원사업·입찰", dash: "/ga", adminOnly: true,
    groups: [
      dutyGroup("ga"),
      { label: "1. 문서 및 자료관리", items: [
        { href: "/ga/mail", label: "문서 수발 대장", desc: "대내외 공문서·우편·팩스, 회신 기한" },
        { href: "/ga/issue", label: "증빙·법인서류 발급", desc: "등기부·납세증명 등 발급 기록" },
        { href: "/ga/certs", label: "공동인증서 관리", desc: "인증서 보관·만료 알림" },
        book("meetings"),
        { href: "/cert?from=ga", label: "지정·인증 (AEO·연구소 등)", desc: "인증 영역에서 관리: AEO·기업부설연구소·병역지정업체·성과공유제·일학습병행" },
        soon("1. 문서 및 자료관리"),
      ] },
      ...GA_GROUPS.map(gaGroup),
      ...(gaRest.length ? [{ label: "그 밖", items: gaRest }] : []),
    ],
  },
  {
    key: "ehs", label: "환경안전보건", en: "SAFETY", color: "#15803d", desc: "폐수·안전 점검·건강검진", dash: "/ehs", adminOnly: true,
    groups: [dutyGroup("ehs"), { label: "대장", items: booksOf("ehs") }],
  },
  {
    key: "it", label: "보안전산", en: "IT·SECURITY", color: "#4338ca", desc: "전산장비·네트워크·계정·정보보안·개인정보·백업·물리보안 (업무분장 IT-1~IT-7)", dash: "/it", adminOnly: true,
    groups: [
      dutyGroup("it"),
      ...IT_DUTIES.map((g) => ({ label: `${g.no}. ${g.name}`, items: g.books.map(book) })),
    ],
  },
  {
    key: "cert", label: "인증", en: "CERT", color: "#b45309", desc: "인증·지정 만기와 사후심사·갱신 일정", dash: "/cert/home", adminOnly: true,
    groups: [dutyGroup("cert"), { label: "인증", items: [
      { href: "/cert", label: "인증 현황", desc: "분류별 인증 카드와 일정", also: ["/cert/item"], exact: true },
      { href: "/cert#add", label: "인증 등록", desc: "새 인증·지정 등록" },
    ] }],
  },
  {
    key: "misc", label: "기타", en: "MY WORK", color: "#6d28d9", desc: "주간업무일지·타부서 업무협조·개인일정·월별 캘린더", dash: "/misc", adminOnly: false,
    groups: [
      { label: "업무 기록", items: [
        { href: "/misc/weekly", label: "주간업무일지", desc: "금주 실적·차주 계획, 팀 모아보기, 인쇄·엑셀" },
        { href: "/misc/coop", label: "타부서 업무협조", desc: "품질·생산·영업·구매·연구소와 주고받는 요청" },
      ] },
      { label: "일정", items: [
        { href: "/misc/plan", label: "개인일정", desc: "회의·외근·출장·교육 일정, 반복 일정" },
        { href: "/misc/calendar", label: "월별 캘린더", desc: "한 달 동안 한 일과 잡힌 일" },
      ] },
      { label: "그 밖", items: booksOf("misc").map((it) => ({ ...it, admin: true })) },
    ],
  },
];
export const menuOf = (key: string) => MENU.find((a) => a.key === key)!;
/** 이 계정에 보이는 메뉴: 관리자 전용 영역·화면을 뺀다 */
export const menuFor = (admin: boolean): MenuArea[] => MENU.filter((a) => admin || !a.adminOnly)
  .map((a) => ({ ...a, groups: a.groups.map((g) => ({ ...g, items: g.items.filter((i) => admin || !i.admin) })).filter((g) => g.items.length) }));

/** 메뉴 이모지 (사이드바·전체 메뉴). 영역은 키, 화면은 주소, 대장은 끝 이름으로 찾는다. */
const EMOJI: Record<string, string> = {
  hr: "👥", ga: "🗂️", ehs: "🛡️", it: "💻", cert: "🏅", misc: "📌",
  "/it/duties": "🧩", "/hr/duties": "🧩", "/ga/duties": "🧩", "/ehs/duties": "🧩", "/cert/duties": "🧩",
  hrroutine: "🔁", garoutine: "🔁", ehsroutine: "🔁", certroutine: "🔁", "/it?from=ga": "💻",
  "/attendance": "⏰", "/daily": "📅", "/person": "🙋", "/calendar": "🗓️", "/hours": "📊", "/week52": "⏱️", "/monthly": "🧮",
  "/leave": "🏖️", "/leave/status": "📈", "/leave/calendar": "🌴", "/leave/evidence": "📎", "/leave/register": "✍️",
  "/employees": "🪪", "/org": "🌳", "/upload": "💾", "/settings": "⚙️",
  "/ga/mail": "📨", "/ga/issue": "🧾", "/ga/certs": "🔑", "/ga/grants": "🎯", "/bid": "⚖️", "/cert?from=ga": "🏅", "/cert": "🏅", "/cert#add": "➕", "/users": "⚙️",
  "/misc/weekly": "📓", "/misc/coop": "🤝", "/misc/plan": "🧭", "/misc/calendar": "🗓️",
  training: "🎓", licenses: "📜", recruit: "🧲", onoff: "🔁", contracts: "✒️", holidaywork: "🛠️", flex: "🕘", reserve: "🎖️", leavepromo: "📣", absence: "🍼", labor: "⚖️", revisions: "📐", certificates: "📃", foreign: "🌏", programs: "🧑‍🎓", applicants: "📇", appointments: "📢", evaluations: "📝", awards: "🏆", trainplan: "🗓️", council: "🤝", discipline: "🚨", injuries: "🩹", agreements: "✍️", compliance: "✅", meetings: "💬", fixtures: "📦", vehicles: "🚗", drivelog: "🛣️", software: "💿",
  itassets: "🖥️", helpdesk: "🛠️", itdispose: "🗑️", itcontracts: "🌐", accounts: "🔐", accessreview: "🔎", seccheck: "🛡️", incidents: "🚨", pledges: "✍️", media: "💽", privacy: "🔏", privdestroy: "🧯", itedu: "🎓", backups: "💾", cctv: "📹", idcards: "🪪", itroutine: "🔁",
  visitors: "🚪", ppe: "🦺", dorm: "🏠", grants: "🎯", bids: "⚖️", checkup: "🩺", wastewater: "💧", inspections: "🔍", tasks: "📝",
};
const ICON_EMOJI: Record<string, string> = {
  clock: "⏰", umbrella: "🏖️", mail: "📨", gauge: "⏱️", pie: "📈", car: "🚗", key: "🔑", box: "📦", medal: "🏅",
  calendarStar: "🗓️", calendarCheck: "✅", calendar: "📅", list: "📌", alert: "⚠️", users: "👥",
};
export const emojiOf = (k: string) => (k.startsWith("/ga/soon") ? "🚧" : k.startsWith("/hr/g/") ? "📊" : undefined) ?? EMOJI[k] ?? ICON_EMOJI[k] ?? EMOJI[k.split("/").pop() ?? ""] ?? "▫️";

const under = (path: string, p: string) => path === p || path.startsWith(`${p}/`);
/** 이 주소가 속한 영역. 통합 대시보드(/)·사용자 관리는 영역 없음, 나머지 근태 화면은 인사노무. */
export function areaOfPath(path: string): string {
  if (path === "/" || under(path, "/users")) return "";
  for (const a of MENU) if (a.key !== "hr" && (under(path, a.dash) || a.groups.some((g) => g.items.some((i) => under(path, i.href.split("#")[0]))))) return a.key;
  return "hr";
}
/** 메뉴 한 줄이 지금 주소와 맞는지 */
export function isOn(it: MenuItem, path: string): boolean {
  if (it.href.includes("#")) return false;
  if (path === it.href) return true;
  if (!it.exact && path.startsWith(`${it.href}/`)) return true;
  return !!it.also?.some((x) => under(path, x));
}
