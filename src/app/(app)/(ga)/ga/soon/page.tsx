/** 총무 '준비 중' 화면: 분류안(2026-11-10)에서 아직 만들지 않은 화면 목록 */
import PageHead from "@/components/대시/PageHead";
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
      <PageHead href={GA_PLAN[g] ? `/ga/soon?g=${encodeURIComponent(g)}` : "/ga"} title={GA_PLAN[g] ? g : "총무"} mark="준비 중" emoji="🚧"
        desc={<>아래 화면은 아직 만들지 않았습니다. 쓰시던 엑셀을 <b>총무\자료</b> 폴더에 복사해 주시면 그 칸에 맞춰 하나씩 만듭니다.</>} />
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
