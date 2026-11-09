/** 입체(3D) 앱 아이콘: 색 타일 + 흰 그림. 통합 대시보드 런처와 사이드바가 같이 쓴다. */
import type { ReactNode } from "react";

const cal = <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>;
const doc = <><path d="M6 3h9l4 4v14H6z" /><path d="M14.5 3v4.5H19" /></>;

const G: Record<string, ReactNode> = {
  dashboard: <><rect x="3.5" y="3.5" width="7.5" height="9" rx="1.5" /><rect x="13" y="3.5" width="7.5" height="5.5" rx="1.5" /><rect x="13" y="11" width="7.5" height="9.5" rx="1.5" /><rect x="3.5" y="14.5" width="7.5" height="6" rx="1.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  calendarCheck: <>{cal}<path d="m9 15 2 2 4-4" /></>,
  calendar: <>{cal}<path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></>,
  calendarStar: <>{cal}<path d="m12 12.6 1 2 2.1.3-1.5 1.5.4 2.1-2-1-2 1 .4-2.1-1.5-1.5 2.1-.3z" /></>,
  userClock: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6 1.2 0 2.3.3 3.2.9" /><circle cx="17" cy="16" r="4.5" /><path d="M17 14v2l1.3 1" /></>,
  chart: <><path d="M4 4v16h16" /><path d="M8.5 16v-4M12.5 16V8M16.5 16v-6" /></>,
  gauge: <><path d="M4.5 17.5a8.5 8.5 0 1 1 15 0" /><path d="m12 13 4-4" /><circle cx="12" cy="13" r="1.3" /></>,
  table: <><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M3.5 9.5h17M3.5 15h17M10 4v16" /></>,
  umbrella: <><path d="M12 3.5a9 9 0 0 1 9 8.5H3a9 9 0 0 1 9-8.5z" /><path d="M12 12v6.5a2 2 0 0 0 4 0" /></>,
  pie: <><path d="M11 4a8.5 8.5 0 1 0 9 9h-9z" /><path d="M14 3a7.5 7.5 0 0 1 7 7h-7z" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 13.8c2.1.8 3.5 3 3.5 5.7" /></>,
  org: <><rect x="9" y="3" width="6" height="5" rx="1.2" /><rect x="3" y="16" width="6" height="5" rx="1.2" /><rect x="15" y="16" width="6" height="5" rx="1.2" /><path d="M12 8v4M6 16v-4h12v4" /></>,
  cap: <><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5M22 9v6" /></>,
  award: <><circle cx="12" cy="9" r="6" /><path d="m8.5 14-1.5 7 5-2.5 5 2.5-1.5-7" /></>,
  building: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h2a2 2 0 0 1 2 2v10M2.5 21h19M8 7h4M8 11h4M8 15h4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  doc: <>{doc}<path d="M9 12h6M9 16h4" /></>,
  docPlus: <>{doc}<path d="M12.5 11v6M9.5 14h6" /></>,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="m11.2 11.8 8.8-8.8M16.5 5.5l2.5 2.5M14 8l2 2" /></>,
  box: <><path d="m12 2.8 8.5 4.6v9.2L12 21.2l-8.5-4.6V7.4z" /><path d="M3.8 7.5 12 12l8.2-4.5M12 12v9" /></>,
  car: <><path d="M3 16.5v-4.2l2.2-5.6A2 2 0 0 1 7 5.5h10a2 2 0 0 1 1.8 1.2l2.2 5.6v4.2z" /><path d="M3.5 12h17" /><circle cx="7.5" cy="16.5" r="2" /><circle cx="16.5" cy="16.5" r="2" /></>,
  route: <><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5" /></>,
  idcard: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16.5c.5-1.6 1.7-2.5 3.2-2.5s2.7.9 3.2 2.5M14.5 10h3.5M14.5 13.5h3.5" /></>,
  monitor: <><rect x="3" y="4" width="18" height="12.5" rx="2" /><path d="M8.5 20.5h7M12 16.5v4M10 8.5l-2 1.8 2 1.8M14 8.5l2 1.8-2 1.8" /></>,
  helmet: <><path d="M4.5 17v-2.5a7.5 7.5 0 0 1 15 0V17" /><path d="M10 7.5V5h4v2.5M3 17h18v2H3z" /></>,
  home: <><path d="m3 11 9-7.5 9 7.5" /><path d="M5.5 9.5V20h13V9.5M10 20v-5.5h4V20" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  gavel: <><rect x="10" y="2.5" width="6" height="10" rx="1.2" transform="rotate(45 13 7.5)" /><path d="m10 11.5-6 6a1.4 1.4 0 0 0 2 2l6-6M13 21h8" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z" /><path d="m8.8 12 2.2 2.2 4.4-4.4" /></>,
  heart: <><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" /><path d="M7 12.5h3l1.3-2.5 2 4 1.2-1.5H17" /></>,
  drop: <><path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3z" /><path d="M9 15a3 3 0 0 0 3 3" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path d="M9 4.5V3h6v1.5M9 13l2 2 4-4" /></>,
  medal: <><circle cx="12" cy="14.5" r="6" /><path d="M8.5 9.7 6 3h4l2 4.5M15.5 9.7 18 3h-4l-2 4.5" /><path d="m12 12 .9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  list: <><path d="m4 6.5 1.5 1.5L8 5.5M4 12.5 5.5 14 8 11.5M4 18.5 5.5 20 8 17.5M11 7h9M11 13h9M11 19h9" /></>,
  userCog: <><circle cx="10" cy="8" r="4" /><path d="M3 20c0-3.9 3.1-7 7-7 1.3 0 2.4.3 3.4.9" /><circle cx="18" cy="17" r="2.5" /><path d="M18 13.2v1.3M18 19.5v1.3M21.8 17h-1.3M15.5 17h-1.3" /></>,
};

/** 주소 → 아이콘. 대장(/ga/fixtures 등)은 끝 이름으로 찾는다. */
const BY_HREF: Record<string, string> = {
  "/": "dashboard", "/attendance": "clock", "/daily": "calendarCheck", "/person": "userClock", "/calendar": "calendar",
  "/hours": "chart", "/week52": "gauge", "/monthly": "table", "/leave": "umbrella", "/leave/status": "pie",
  "/leave/calendar": "calendarStar", "/employees": "users", "/org": "org", "/users": "userCog",
  "/ga": "building", "/ga/mail": "mail", "/ga/issue": "doc", "/ga/certs": "key",
  "/ehs": "shield", "/cert": "medal", "/cert#add": "docPlus", "/misc": "grid",
};
const BY_BOOK: Record<string, string> = {
  training: "cap", licenses: "award", fixtures: "box", vehicles: "car", drivelog: "route", visitors: "idcard",
  software: "monitor", ppe: "helmet", dorm: "home", grants: "target", bids: "gavel", meetings: "chat",
  checkup: "heart", wastewater: "drop", inspections: "clipboard", tasks: "list",
};
export const iconFor = (href: string) => BY_HREF[href] ?? BY_BOOK[href.split("/").pop() ?? ""] ?? "grid";

/** 영역 → 아이콘 (사이드바) */
export const AREA_ICON: Record<string, string> = { hr: "users", ga: "building", ehs: "shield", cert: "medal", misc: "grid" };

export default function AppIcon({ name, color, size = "lg" }: { name: string; color: string; size?: "lg" | "sm" }) {
  return (
    <span className={`app-ico ${size}`} style={{ ["--c" as string]: color }} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        {G[name] ?? G.grid}
      </svg>
    </span>
  );
}
