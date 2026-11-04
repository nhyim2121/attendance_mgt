import { Suspense } from "react";
import Nav from "@/components/Nav";
import PrintFit from "@/components/PrintFit";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

// 근태 공간 메뉴
const ITEMS = [
  { href: "/", label: "홈" },
  { href: "/daily", label: "일일 현황", group: "근태" },
  { href: "/person", label: "직원별 근태", group: "근태", also: ["/sheets"] },
  { href: "/calendar", label: "근태 캘린더", group: "근태", also: ["/evidence"] },
  { href: "/hours", label: "근로시간 리포트", group: "근로시간", also: ["/depts"] },
  { href: "/week52", label: "주 52시간 관리", group: "근로시간" },
  { href: "/monthly", label: "월 근태 집계", group: "근로시간" },
  { href: "/employees", label: "직원 관리", group: "인사" },
  { href: "/org", label: "조직도", group: "인사" },
  { href: "/upload", label: "데이터 관리", group: "관리" },
  { href: "/settings", label: "근무 기준·공휴일", group: "관리" },
]
// 휴가 공간 메뉴 (/leave 아래)
const LEAVE_ITEMS = [
  { href: "/leave", label: "휴가 홈" },
  { href: "/leave/status", label: "연차 현황", group: "현황" },
  { href: "/leave/calendar", label: "휴가 캘린더", group: "현황" },
  { href: "/leave/evidence", label: "신청서 증빙", group: "신청·증빙" },
  { href: "/leave/register", label: "휴가 등록·설정", group: "관리" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = [...ITEMS, { href: "/users", label: user.role === "관리자" ? "사용자 관리" : "비밀번호 변경", group: "관리" }];
  return (
    <div className="shell">
      <nav className="side">
        <a href="/" className="logo" title="홈"><img src="/logo.png" alt="주식회사 에쓰엔" /></a>
        <div className="brand">근태관리통합시스템</div>
        <Suspense><Nav items={items} leaveItems={LEAVE_ITEMS} /></Suspense>
        <div className="who">
          <span><b>{user.name}</b> · {user.role}</span>
          <form action={logout}><button>로그아웃</button></form>
        </div>
      </nav>
      <main className="main">{children}</main>
      <PrintFit />
    </div>
  );
}
