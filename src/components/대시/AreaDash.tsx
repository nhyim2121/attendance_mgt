/** 업무별 대시보드 틀 (F안): 영역 색 배너 · 숫자 카드 · 빠른 추가 / 이 영역 할 일 / 바로가기 · 영역 그림 2개 · 전체 메뉴 */
import { LinksCard, TodoCard } from "./client";
import { AreaHello, AreaMenu, type KpiProps, Kpis, QuickAdd } from "./parts";
import { toViews } from "./views";
import { requireUser } from "@/lib/auth";
import { todos } from "@/lib/대시/data";
import { loadLinks, type Scope } from "@/lib/대시/links";
import { menuOf } from "@/lib/대시/menu";

export default async function AreaDash({ area, kpis, quick, children }: {
  area: Scope & ("hr" | "ga" | "ehs" | "cert" | "misc"); kpis: KpiProps[]; quick: [string, string][]; children: React.ReactNode;
}) {
  const user = await requireUser();
  const m = menuOf(area);
  const [list, links] = await Promise.all([todos(user.role === "관리자"), loadLinks(area)]);
  return (
    <div className="fd">
      <AreaHello area={m} />
      <Kpis items={kpis} />
      <div className="fd-row3">
        <QuickAdd items={quick} />
        <TodoCard items={toViews(list.filter((t) => t.area === area))} note={m.label} />
        <LinksCard scope={area} links={links} />
      </div>
      <div className="fd-wide2">{children}</div>
      <AreaMenu area={m} />
    </div>
  );
}
