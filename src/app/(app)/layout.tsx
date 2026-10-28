import { Suspense } from "react";
import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

const ITEMS = [
  { href: "/", label: "홈" },
  { href: "/daily", label: "일일 현황" },
  { href: "/report", label: "일일 근태현황" },
  { href: "/person", label: "출퇴근기록" },
  { href: "/edit", label: "근태 기입" },
  { href: "/sheets", label: "직원별 시트" },
  { href: "/upload", label: "파일 업로드", group: "관리" },
  { href: "/employees", label: "직원 관리", group: "관리" },
  { href: "/settings", label: "근무 기준·공휴일", group: "관리" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = [...ITEMS, { href: "/users", label: user.role === "관리자" ? "사용자 관리" : "비밀번호 변경", group: "관리" }];
  return (
    <div className="shell">
      <nav className="side">
        <div className="brand">근태관리통합시스템</div>
        <Suspense><Nav items={items} /></Suspense>
        <div className="who">
          <span><b>{user.name}</b> · {user.role}</span>
          <form action={logout}><button>로그아웃</button></form>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
