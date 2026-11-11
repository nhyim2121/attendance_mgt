import { Suspense } from "react";
import AutoDraft from "@/components/AutoDraft";
import PageMark from "@/components/PageMark";
import PrintFit from "@/components/PrintFit";
import TopBar from "@/components/TopBar";
import TopNav from "@/components/TopNav";
import { canBid, readableAreas, requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = user.role === "관리자";
  const areas = await readableAreas(user); // 권한을 직접 정한 계정: 읽기 있는 영역만 메뉴에
  return (
    <div className="shell top d2 f u">
      {/* 손으로 그린 동그라미·테두리용 거친 선 (3차 L) */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id="u-rough"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={3} /><feDisplacementMap in="SourceGraphic" scale={3.5} /></filter>
      </svg>
      <Suspense>
        <TopNav admin={admin} bid={canBid(user)} areas={areas}
          who={<span><b>{user.name}</b> · {user.role}</span>}
          logout={<form action={logout}><button>로그아웃</button></form>} />
      </Suspense>
      <main className="main">
        <Suspense><TopBar admin={admin} areas={areas} /></Suspense>
        {children}
      </main>
      <Suspense><AutoDraft /></Suspense>
      <PrintFit />
      <PageMark />
    </div>
  );
}
