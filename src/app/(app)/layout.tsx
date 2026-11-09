import { Suspense } from "react";
import Nav from "@/components/Nav";
import PageMark from "@/components/PageMark";
import PrintFit from "@/components/PrintFit";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="shell d2 f">
      <nav className="side">
        <a href="/" className="logo" title="통합 대시보드"><img src="/logo.png" alt="주식회사 에쓰엔" /></a>
        <div className="brand">통합관리시스템</div>
        <Suspense><Nav admin={user.role === "관리자"} /></Suspense>
        <div className="who">
          <span><b>{user.name}</b> · {user.role}</span>
          <form action={logout}><button>로그아웃</button></form>
        </div>
      </nav>
      <main className="main">{children}</main>
      <PrintFit />
      <PageMark />
    </div>
  );
}
