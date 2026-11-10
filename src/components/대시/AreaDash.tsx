/** 업무별 대시보드 틀 (통합 디자인): 영역 색 배너·숫자 카드 · 시계 / 이 영역 이번 주 할 일 / 빠른 추가
 *  · 영역 창 2개(children) · 바로가기 / 다가오는 일정 · 전체 메뉴 */
import { Clock, LinksCard, TodoCard } from "./client";
import { nextOf, noteOf, schedOf, splitTodos, weekStrip } from "./common";
import { AreaHello, AreaMenu, Card, type KpiProps, Kpis, QuickAdd, Schedule } from "./parts";
import { toViews } from "./views";
import { requireUser } from "@/lib/auth";
import { todos } from "@/lib/대시/data";
import { loadLinks, type Scope } from "@/lib/대시/links";
import { menuOf } from "@/lib/대시/menu";
import { addDays, todayKst } from "@/lib/time";

export default async function AreaDash({ area, kpis, quick, children }: {
  area: Scope & ("hr" | "ga" | "ehs" | "cert" | "misc"); kpis: KpiProps[]; quick: [string, string][]; children: React.ReactNode;
}) {
  const user = await requireUser();
  const today = todayKst();
  const m = menuOf(area);
  const [list, links] = await Promise.all([todos(user.role === "관리자"), loadLinks(area)]);
  const { week, later } = splitTodos(list.filter((t) => t.area === area));
  const strip = weekStrip(today, (d) => week.filter((t) => t.left !== null && t.left >= 0 && d === addDays(today, t.left)).length);
  return (
    <div className="ud">
      <AreaHello area={m} todo={week.length} note={noteOf(week)} />
      <Kpis items={kpis} />
      <div className="u-grid">
        <Clock strip={strip} stripLabel="이번 주 요일별 기한 (건)" next={nextOf(week)} />
        <TodoCard items={toViews(week)} note={m.label} />
        <QuickAdd items={quick} className="s3" />
        <div className="u-pair s12">{children}</div>
        <LinksCard scope={area} links={links} className="s4" />
        <Card en="SCHEDULE" title="다가오는 일정 · 8~90일" className="s8"><Schedule items={schedOf(later, today)} /></Card>
        <AreaMenu area={m} />
      </div>
    </div>
  );
}

