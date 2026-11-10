/** 총무 '준비 중' 화면: 분류안(2026-11-10)에서 아직 만들지 않은 화면 목록 */
import Link from "next/link";
import { Win } from "@/components/대시/win";
import { requireAdminPage } from "@/lib/auth";
import { GA_PLAN } from "@/lib/대시/menu";

export const metadata = { title: "준비 중 · 총무 · 통합관리시스템" };

export default async function Page({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  await requireAdminPage();
  const g = (await searchParams).g ?? "";
  const groups = GA_PLAN[g] ? [g] : Object.keys(GA_PLAN);
  return (
    <div className="ud">
      <h1>🚧 {GA_PLAN[g] ? g : "총무"} · 준비 중인 화면</h1>
      <p className="caption">아래 화면은 아직 만들지 않았습니다. 쓰시던 엑셀을 <b>총무\자료</b> 폴더에 복사해 주시면 그 칸에 맞춰 하나씩 만듭니다.</p>
      <div className="u-grid">
        {groups.map((k) => (
          <Win key={k} en="SOON" ko={k} className={groups.length > 1 ? "s4" : "s6"}>
            <ul className="u-soon">{GA_PLAN[k].map((x) => <li key={x}>🚧 {x}</li>)}</ul>
          </Win>
        ))}
      </div>
      <p><Link href="/ga">← 총무 대시보드</Link></p>
    </div>
  );
}
