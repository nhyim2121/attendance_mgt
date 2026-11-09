/** 새 사이트(F안) 메뉴: 업무 영역 → 묶음 → 화면. 사이드바·업무별 대시보드의 '전체 메뉴'가 같이 쓴다.
 *  대장은 books.ts에서 가져오고, 아래 GA_GROUPS에 없는 총무 대장은 '그 밖' 묶음에 들어간다. */
import { type Area, bookHref, BOOKS, booksIn } from "../대장/books";

export interface MenuItem { href: string; label: string; desc?: string; also?: string[]; exact?: boolean }
export interface MenuGroup { label: string; items: MenuItem[] }
export interface MenuArea {
  key: "hr" | "ga" | "ehs" | "cert" | "misc"; label: string; en: string; color: string; desc: string;
  dash: string; adminOnly: boolean; groups: MenuGroup[];
}

const book = (key: string): MenuItem => {
  const b = BOOKS.find((x) => x.key === key)!;
  return { href: bookHref(b), label: b.title, desc: b.desc };
};
const booksOf = (area: Area, skip: string[] = []) => booksIn(area).filter((b) => !skip.includes(b.key)).map((b) => book(b.key));

const GA_GROUPS: [string, string[]][] = [
  ["문서", ["meetings"]],
  ["자산·차량", ["fixtures", "vehicles", "drivelog", "software"]],
  ["보안·복리", ["visitors", "ppe", "dorm"]],
  ["사업", ["grants", "bids"]],
];
const gaListed = GA_GROUPS.flatMap(([, ks]) => ks);
const gaRest = booksOf("ga", gaListed);

export const MENU: MenuArea[] = [
  {
    key: "hr", label: "인사노무", en: "HR", color: "#0c3994", desc: "근태(출퇴근·근로시간)와 휴가·연차, 직원·조직도", dash: "/hr", adminOnly: false,
    groups: [
      { label: "근태", items: [
        { href: "/attendance", label: "근태 홈", desc: "오늘 출근·지각·휴가 한눈에" },
        { href: "/daily", label: "일일 현황", desc: "날짜별 출근·지각·미출근, 근태 보고서" },
        { href: "/person", label: "직원별 근태", desc: "한 사람의 날짜별 출퇴근, 근태 기입", also: ["/sheets", "/edit"] },
        { href: "/calendar", label: "근태 캘린더", desc: "달력으로 보는 근태", also: ["/evidence"] },
        { href: "/hours", label: "근로시간 리포트", desc: "부서·월별 근로시간", also: ["/depts"] },
        { href: "/week52", label: "주 52시간 관리", desc: "주간 근로시간 경고" },
        { href: "/monthly", label: "월 근태 집계", desc: "월별 지각·결근·연장 합계" },
      ] },
      { label: "휴가", items: [
        { href: "/leave", label: "휴가 홈", desc: "사용률·다가오는 휴가", exact: true },
        { href: "/leave/status", label: "연차 현황", desc: "직원별 발생·사용·잔여" },
        { href: "/leave/calendar", label: "휴가 캘린더", desc: "달력으로 보는 휴가" },
        { href: "/leave/evidence", label: "신청서 증빙", desc: "휴가 신청서와 증빙 파일" },
        { href: "/leave/register", label: "휴가 등록·설정", desc: "휴가 직접 등록, 연차 기준" },
      ] },
      { label: "인사", items: [
        { href: "/employees", label: "직원 관리", desc: "직원 명부·입사일·근무 기준" },
        { href: "/org", label: "조직도", desc: "부서·직책 구조" },
        ...booksOf("hr"),
      ] },
      { label: "관리", items: [
        { href: "/upload", label: "데이터 관리", desc: "캡스·하이웍스 파일 올리기, 내려받기" },
        { href: "/settings", label: "근무 기준·공휴일", desc: "출퇴근 시각·공휴일" },
      ] },
    ],
  },
  {
    key: "ga", label: "총무", en: "ADMIN", color: "#0e7490", desc: "문서·비품·차량·보안·복리후생·지원사업·입찰", dash: "/ga", adminOnly: true,
    groups: [
      { label: "문서", items: [
        { href: "/ga/mail", label: "문서 수발 대장", desc: "받은·보낸 공문, 회신 기한" },
        { href: "/ga/issue", label: "증빙·법인서류 발급", desc: "등기부·납세증명 등 발급 기록" },
        { href: "/ga/certs", label: "공동인증서 관리", desc: "인증서 보관·만료 알림" },
        ...GA_GROUPS[0][1].map(book),
      ] },
      ...GA_GROUPS.slice(1).map(([label, ks]) => ({ label, items: ks.map(book) })),
      ...(gaRest.length ? [{ label: "그 밖", items: gaRest }] : []),
    ],
  },
  {
    key: "ehs", label: "환경안전보건", en: "SAFETY", color: "#15803d", desc: "폐수·안전 점검·건강검진", dash: "/ehs", adminOnly: true,
    groups: [{ label: "", items: booksOf("ehs") }],
  },
  {
    key: "cert", label: "인증", en: "CERT", color: "#b45309", desc: "인증·지정 만기와 사후심사·갱신 일정", dash: "/cert/home", adminOnly: true,
    groups: [{ label: "", items: [
      { href: "/cert", label: "인증 현황", desc: "분류별 인증 카드와 일정", also: ["/cert/item"], exact: true },
      { href: "/cert#add", label: "인증 등록", desc: "새 인증·지정 등록" },
    ] }],
  },
  {
    key: "misc", label: "기타", en: "ETC", color: "#6d28d9", desc: "진행 건·할 일", dash: "/misc", adminOnly: true,
    groups: [{ label: "", items: booksOf("misc") }],
  },
];
export const menuOf = (key: string) => MENU.find((a) => a.key === key)!;

/** 메뉴 이모지 (사이드바·전체 메뉴). 영역은 키, 화면은 주소, 대장은 끝 이름으로 찾는다. */
const EMOJI: Record<string, string> = {
  hr: "👥", ga: "🗂️", ehs: "🛡️", cert: "🏅", misc: "📌",
  "/attendance": "⏰", "/daily": "📅", "/person": "🙋", "/calendar": "🗓️", "/hours": "📊", "/week52": "⏱️", "/monthly": "🧮",
  "/leave": "🏖️", "/leave/status": "📈", "/leave/calendar": "🌴", "/leave/evidence": "📎", "/leave/register": "✍️",
  "/employees": "🪪", "/org": "🌳", "/upload": "💾", "/settings": "⚙️",
  "/ga/mail": "📨", "/ga/issue": "🧾", "/ga/certs": "🔑", "/cert": "🏅", "/cert#add": "➕", "/users": "⚙️",
  training: "🎓", licenses: "📜", meetings: "💬", fixtures: "📦", vehicles: "🚗", drivelog: "🛣️", software: "💿",
  visitors: "🚪", ppe: "🦺", dorm: "🏠", grants: "🎯", bids: "⚖️", checkup: "🩺", wastewater: "💧", inspections: "🔍", tasks: "📝",
};
const ICON_EMOJI: Record<string, string> = {
  clock: "⏰", umbrella: "🏖️", mail: "📨", gauge: "⏱️", pie: "📈", car: "🚗", key: "🔑", box: "📦", medal: "🏅",
  calendarStar: "🗓️", calendarCheck: "✅", calendar: "📅", list: "📌", alert: "⚠️", users: "👥",
};
export const emojiOf = (k: string) => EMOJI[k] ?? ICON_EMOJI[k] ?? EMOJI[k.split("/").pop() ?? ""] ?? "▫️";

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
