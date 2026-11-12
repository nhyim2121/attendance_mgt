/** 업무별 대시보드 틀 (통합 디자인). 업무 성격에 맞춰 레이아웃을 고른다 (2026-11-12, 대시보드 레이아웃 9가지 중):
 *  - "hero-cards" 01 히어로 + 04 카드 그리드 : 인사노무·총무 (오늘 숫자를 크게, 업무 묶음을 같은 크기 카드로)
 *  - "hero"       01 히어로                  : 환경안전보건 (무재해 일수 같은 핵심 숫자 하나를 크게)
 *  - "split"      03 스플릿                  : 보안전산 (왼쪽 상태·기록 / 오른쪽 할 일·바로가기)
 *  - "mag"        06 매거진                  : 인증 (가장 임박한 일을 큰 기사처럼 + 목록)
 *  - 없음         기존 (배너·숫자 카드·12칸 그리드) */
import Link from "next/link";
import { Clock, LinksCard, TodoCard } from "./client";
import { nextOf, noteOf, schedOf, splitTodos, weekStrip } from "./common";
import { AreaHello, AreaMenu, Card, type KpiProps, Kpis, QuickAdd, Schedule } from "./parts";
import { toViews } from "./views";
import { requireUser } from "@/lib/auth";
import { ddayText, todos } from "@/lib/대시/data";
import { loadLinks, type Scope } from "@/lib/대시/links";
import { menuOf } from "@/lib/대시/menu";
import { addDays, dayLabel, todayKst } from "@/lib/time";

export type AreaLayout = "hero-cards" | "hero" | "split" | "mag";
export interface HeroBig { label: string; n: React.ReactNode; unit?: string; sub?: string; href?: string }

export default async function AreaDash({ area, kpis, quick, children, layout, hero, feature }: {
  area: Scope & ("hr" | "ga" | "ehs" | "it" | "cert" | "misc"); kpis: KpiProps[]; quick: [string, string][]; children: React.ReactNode;
  layout?: AreaLayout; hero?: HeroBig; feature?: React.ReactNode;
}) {
  const user = await requireUser();
  const admin = user.role === "관리자";
  const today = todayKst();
  const m = menuOf(area);
  const [list, links] = await Promise.all([todos(admin), loadLinks(area)]);
  const mineAll = list.filter((t) => t.area === area);
  const { week, later } = splitTodos(mineAll);
  const strip = weekStrip(today, (d) => week.filter((t) => t.left !== null && t.left >= 0 && d === addDays(today, t.left)).length);
  const sched = <Card en="SCHEDULE" title="다가오는 일정 · 8~90일" className="s8"><Schedule items={schedOf(later, today)} /></Card>;

  // 01 히어로: 배너 안에 숫자 카드를 넣는다 (핵심 숫자 하나는 크게)
  const heroBand = (
    <header className="lay-hero" style={{ ["--hc" as string]: m.color }}>
      <div className="hh">
        <div>
          <small className="eb">{dayLabel(today, true)} · {m.en}</small>
          <h1>{m.label} 홈</h1>
          <p>{m.desc}</p>
        </div>
        {hero && (
          <Link href={hero.href ?? m.dash} className="big" style={{ color: "#fff", textDecoration: "none" }}>
            <span>{hero.label}</span><b>{hero.n}</b><span>{hero.unit}{hero.sub ? <small style={{ display: "block", fontSize: ".78rem", opacity: .85 }}>{hero.sub}</small> : null}</span>
          </Link>
        )}
      </div>
      <div className="hs">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href ?? m.dash} className={k.warn ? "warn" : ""}>
            <span>{k.label}</span><b>{k.n}<small>{k.unit}</small></b><span>{k.sub}</span>
          </Link>
        ))}
        <Link href={week[0]?.href ?? m.dash} className={week.length ? "warn" : ""}>
          <span>이번 주 할 일</span><b>{week.length}<small>건</small></b><span>{week[0] ? `${week[0].title.slice(0, 16)} ${ddayText(week[0].left)}` : "없음"}</span>
        </Link>
      </div>
    </header>
  );

  // 04 카드 그리드: 메뉴 묶음마다 같은 크기 카드 (기한 건수·가장 급한 일·바로가기)
  const groups = m.groups.filter((g) => !["업무분장", "관리", "그 밖"].includes(g.label) && g.items.some((i) => admin || !i.admin));
  const groupCards = (
    <div className="lay-cards">
      {groups.map((g) => {
        const items = g.items.filter((i) => admin || !i.admin);
        const hrefs = items.flatMap((i) => [i.href.split(/[?#]/)[0], ...(i.also ?? [])]);
        const due = mineAll.filter((t) => hrefs.some((h) => t.href.startsWith(h)));
        const home = items.find((i) => i.href.includes("/g/")) ?? items[0];
        const late = due.filter((t) => t.left !== null && t.left < 0).length;
        return (
          <Link key={g.label} href={home.href} className="lay-card" style={{ ["--lc" as string]: m.color }}>
            <div className="lc-h"><b>{g.label}</b></div>
            <div className="lc-n">
              <span>화면 <b>{items.length}</b></span>
              <span className={due.length ? "warn" : ""}>기한 <b>{due.length}</b></span>
              {late > 0 && <span className="warn">지남 <b>{late}</b></span>}
            </div>
            {due.length ? (
              <ul>{due.slice(0, 3).map((t) => <li key={t.href + t.title}><span>{t.title}</span><small>{ddayText(t.left)}</small></li>)}</ul>
            ) : <small>{items.slice(0, 4).map((i) => i.label).join(" · ")}</small>}
          </Link>
        );
      })}
    </div>
  );

  if (layout === "hero-cards") {
    return (
      <div className="ud">
        {heroBand}
        {groupCards}
        <div className="u-grid">
          <TodoCard items={toViews(week)} note={m.label} className="s8" />
          <QuickAdd items={quick} className="s4" />
          <div className="u-pair s12">{children}</div>
          <LinksCard scope={area} links={links} className="s4" />
          {sched}
          <AreaMenu area={m} />
        </div>
      </div>
    );
  }
  if (layout === "hero") {
    return (
      <div className="ud">
        {heroBand}
        <div className="u-grid">
          <div className="u-pair s12">{children}</div>
          <TodoCard items={toViews(week)} note={m.label} className="s8" />
          <div className="s4 u-col"><QuickAdd items={quick} className="s12" /><LinksCard scope={area} links={links} className="s12" /></div>
          <Card en="SCHEDULE" title="다가오는 일정 · 8~90일" className="s12"><Schedule items={schedOf(later, today)} /></Card>
          <AreaMenu area={m} />
        </div>
      </div>
    );
  }
  if (layout === "split" || layout === "mag") {
    return (
      <div className="ud">
        <AreaHello area={m} todo={week.length} note={noteOf(week)} />
        <Kpis items={kpis} />
        <div className={layout === "split" ? "lay-split" : "lay-mag"}>
          <div className="col">{layout === "mag" && feature}{children}</div>
          <div className="col">
            <TodoCard items={toViews(week)} note={m.label} className="s12" />
            <QuickAdd items={quick} className="s12" />
            <LinksCard scope={area} links={links} className="s12" />
          </div>
        </div>
        <div className="u-grid">
          <Card en="SCHEDULE" title="다가오는 일정 · 8~90일" className="s12"><Schedule items={schedOf(later, today)} /></Card>
          <AreaMenu area={m} />
        </div>
      </div>
    );
  }
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
        {sched}
        <AreaMenu area={m} />
      </div>
    </div>
  );
}
