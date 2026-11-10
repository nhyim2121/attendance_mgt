/** 월별 캘린더: 한 달 동안 무엇을 했고 무엇이 잡혀 있는지. 개인일정·업무협조·할 일·투찰 마감 + 주마다 주간업무일지,
 *  아래에 '이번 달 한 일' 정리 (일지 실적·끝낸 협조·끝낸 일정). ?m=YYYY-MM */
import Link from "next/link";
import MonthCal from "@/components/기타/MonthCal";
import { type KpiProps, Kpis, Win } from "@/components/대시/parts";
import { requireUser } from "@/lib/auth";
import { getHolidays } from "@/lib/인사노무/data";
import { todayKst } from "@/lib/time";
import { monthCal } from "@/lib/기타/calendar";
import { DEPT_EMOJI, logAvg, weekTitle } from "@/lib/기타/work";
import { loadCoops } from "@/lib/기타/workStore";
import { PrintButton } from "../forms";

export const metadata = { title: "월별 캘린더 · 통합관리시스템" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = todayKst();
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const [cal, holidays, coops] = await Promise.all([monthCal(me, month), getHolidays(), loadCoops()]);
  const inMonth = (d: string) => d.startsWith(month);
  const plans = cal.items.filter((i) => i.kind === "plan" && inMonth(i.day));
  const doneCoops = coops.filter((c) => c.status === "완료" && inMonth(c.doneAt)).sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  const logs = cal.weeks.filter((w) => cal.logs[w]).map((w) => ({ w, log: cal.logs[w] }));
  const label = `${+month.slice(5, 7)}월`;

  const kpis: KpiProps[] = [
    { label: `${label} 일정`, n: plans.length, unit: "건", sub: `끝냄 ${plans.filter((p) => p.done).length}건`, icon: "calendar", color: "#be185d", href: "/misc/plan" },
    { label: `${label} 끝낸 업무협조`, n: doneCoops.length, unit: "건", sub: [...new Set(doneCoops.map((c) => c.dept))].join("·") || "-", icon: "calendarCheck", color: "#15803d", href: "/misc/coop" },
    { label: "쓴 주간업무일지", n: logs.length, unit: `/${cal.weeks.length}주`, sub: logs.length ? `업무 ${logs.reduce((t, l) => t + l.log.rows.length, 0)}건` : "아직 없음", icon: "list", color: "#6d28d9", href: "/misc/weekly?view=list" },
    { label: "남은 기한", n: cal.items.filter((i) => i.kind !== "plan" && !i.done && i.day >= today && inMonth(i.day)).length, unit: "건", sub: "협조·할 일·투찰", icon: "alert", color: "#e84340", href: "#cal" },
  ];
  return (
    <div className="ud">
      <header className="u-hello ar noprint" style={{ ["--c" as string]: "#0c3994" }}>
        <span className="u-date"><Link href="/misc">기타</Link> › 월별 캘린더</span>
        <h1>{month.slice(0, 4)}년 <mark>{label}</mark>에 한 일</h1>
        <p>날짜를 누르면 그날 일정, 오른쪽 주 칸을 누르면 그 주 업무일지로 갑니다.</p>
        <span className="u-cover" aria-hidden>🗓️</span>
        <div className="u-note"><b>인쇄</b>월간 보고용으로 캘린더와 아래 정리를 한 번에 인쇄할 수 있어요.<PrintButton label="🖨️ 인쇄" /></div>
      </header>
      <div className="noprint"><Kpis items={kpis} /></div>
      <div className="u-grid">
        <Win en="CALENDAR" ko={`${me.name} · ${month}`} className="s12">
          <span id="cal" />
          <MonthCal month={month} cal={cal} today={today} base="/misc/calendar" holidays={holidays} max={6} />
        </Win>
        <Win en="DONE THIS MONTH" ko={`${label} 주간업무일지 실적`} className="s7">
          {logs.length ? logs.map(({ w, log }) => (
            <div key={w} className="mc-sum">
              <h4><Link href={`/misc/weekly?w=${w}`}>{weekTitle(w)}</Link> <small>{log.rows.length}건 · 평균 {logAvg(log)}%</small></h4>
              <ul>{log.rows.filter((r) => r.task).map((r) => <li key={r.id}><span className="fd-tag k">{r.cat || "-"}</span><b>{r.task}</b>{r.done && <small>{r.done}</small>}<em>{r.pct}%</em></li>)}</ul>
            </div>
          )) : <p className="muted">이 달에 쓴 주간업무일지가 없습니다. <Link href="/misc/weekly">일지 쓰러 가기 ›</Link></p>}
        </Win>
        <Win en="COOPERATION" ko={`${label}에 끝낸 업무협조`} className="s5">
          {doneCoops.length ? (
            <ul className="u-ev">{doneCoops.map((c) => (
              <li key={c.id}><Link href={`/misc/coop?id=${c.id}`}>
                <span className="dt">{+c.doneAt.slice(5, 7)}/{+c.doneAt.slice(8, 10)}</span>
                <span className="tt"><b>{DEPT_EMOJI[c.dept]} {c.title}</b><small>{c.dept} · {c.dir} · {c.owner}</small></span>
                <span className="fd-tag g">완료</span><span />
              </Link></li>
            ))}</ul>
          ) : <p className="muted">이 달에 끝낸 업무협조가 없습니다.</p>}
        </Win>
      </div>
    </div>
  );
}
