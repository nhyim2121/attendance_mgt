/** 기타(내 업무) 대시보드: 오늘 일정 · 빠른 추가 · 월별 캘린더(한 일·잡힌 일 + 주간업무일지) · 업무협조 · 이번 주 일지 · 팀 작성 현황.
 *  관리팀 계정(관리자·담당자) 모두. 진행 건·할 일 대장은 관리자만. ?m=YYYY-MM 로 캘린더 달을 바꾼다. */
import Link from "next/link";
import MonthCal from "@/components/기타/MonthCal";
import { Clock, LinksCard } from "@/components/대시/client";
import { AreaMenu, type KpiProps, Kpis, MiniTable, QuickAdd, Tag, Win } from "@/components/대시/parts";
import { requireUser } from "@/lib/auth";
import { recentRows } from "@/lib/대시/data";
import { loadLinks } from "@/lib/대시/links";
import { menuFor } from "@/lib/대시/menu";
import { getHolidays } from "@/lib/인사노무/data";
import { addDays, dayLabel, todayKst } from "@/lib/time";
import { monthCal } from "@/lib/기타/calendar";
import { coopLeft, DEPT_COLOR, DEPT_EMOJI, DEPTS, isOpen, logAvg, mondayOf, occurrences, PLAN_COLOR, statusTone, timeText, weekTitle } from "@/lib/기타/work";
import { allLogs, loadCoops, loadPlans, people } from "@/lib/기타/workStore";

export const metadata = { title: "기타 · 통합관리시스템" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const admin = me.role === "관리자";
  const sp = await searchParams;
  const today = todayKst();
  const mon = mondayOf(today);
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const [cal, holidays, plans, coops, logs, team, links, tasks] = await Promise.all([
    monthCal(me, month), getHolidays(), loadPlans(me.id), loadCoops(), allLogs(), people(), loadLinks("misc"), admin ? recentRows("misc", 6, true) : Promise.resolve([]),
  ]);
  const area = menuFor(admin).find((a) => a.key === "misc")!;

  const week = plans.flatMap((p) => occurrences(p, mon, addDays(mon, 6)));
  const todayHits = week.filter((h) => h.day === today).sort((a, b) => (a.p.from || "00").localeCompare(b.p.from || "00"));
  const next7 = plans.flatMap((p) => occurrences(p, addDays(today, 1), addDays(today, 7))).filter((h) => !h.done && h.day === h.start).sort((a, b) => a.day.localeCompare(b.day)).slice(0, 5);
  const open = coops.filter(isOpen).map((c) => ({ c, left: coopLeft(c, today) })).sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999));
  const late = open.filter((x) => x.left !== null && x.left < 0);
  const mine = logs.find((l) => l.uid === me.id && l.monday === mon)?.log;
  const wrote = logs.filter((l) => l.monday === mon);
  const firstDue = open.find((x) => x.left !== null);

  const kpis: KpiProps[] = [
    { label: "오늘 일정", n: todayHits.length, unit: "건", sub: todayHits.map((h) => `${timeText(h.p)} ${h.p.title}`).slice(0, 2).join(" · ") || "없음", icon: "clock", color: "#be185d", href: `/misc/plan?d=${today}` },
    { label: "업무협조 진행 중", n: open.length, unit: "건", sub: `받은 ${open.filter((x) => x.c.dir === "받은 요청").length} · 보낸 ${open.filter((x) => x.c.dir === "보낸 요청").length}`, icon: "list", color: "#0c3994", href: "/misc/coop" },
    { label: "기한 지난 협조", n: late.length, unit: "건", sub: late[0] ? `${late[0].c.dept} ${late[0].c.title.slice(0, 14)}` : "없음", icon: "alert", color: "#e84340", warn: late.length > 0, href: "/misc/coop" },
    { label: `${weekTitle(mon)} 내 일지`, n: mine ? `${logAvg(mine)}` : "-", unit: mine ? "%" : "", sub: mine ? `업무 ${mine.rows.length}건 작성` : "아직 안 씀 — 지난주 계획이 기다려요", icon: "calendarCheck", color: "#6d28d9", warn: !mine && today >= addDays(mon, 3), href: "/misc/weekly" },
  ];
  const strip = ["월", "화", "수", "목", "금"].map((label, i) => ({ label, n: week.filter((h) => h.day === addDays(mon, i)).length, today: addDays(mon, i) === today }));

  return (
    <div className="ud">
      <header className="u-hello ar" style={{ ["--c" as string]: "#6d28d9" }}>
        <span className="u-date">{dayLabel(today, true)}</span>
        <h1>{me.name}님의 <mark>업무 노트</mark></h1>
        <p>주간업무일지 · 타부서 업무협조 · 개인일정을 한곳에서. 캘린더에서 한 달 동안 한 일을 한눈에 봅니다.</p>
        <span className="u-cover" aria-hidden>📓</span>
        {firstDue
          ? <Link className="u-note" href={`/misc/coop?id=${firstDue.c.id}`}><b>가장 급한 협조</b>{firstDue.c.dept} · {firstDue.c.title}<small>{firstDue.left! < 0 ? `${-firstDue.left!}일 지남` : firstDue.left === 0 ? "오늘 기한" : `D-${firstDue.left}`}</small></Link>
          : <div className="u-note"><b>오늘의 한 줄</b>기한이 걸린 업무협조가 없습니다.</div>}
      </header>
      <Kpis items={kpis} />
      <div className="u-grid">
        <Clock strip={strip} stripLabel="이번 주 요일별 내 일정 (건)" next={next7[0] ? { title: next7[0].p.title, when: dayLabel(next7[0].day), href: `/misc/plan?d=${next7[0].day}` } : null} />
        <Win en="TODAY" ko="오늘 · 다가오는 7일 일정" more={["일정표", "/misc/plan"]} className="s6">
          {todayHits.length || next7.length ? (
            <ul className="pl-mini">
              {todayHits.map((h) => <li key={`t${h.p.id}`} className={h.done ? "done" : ""} style={{ ["--c" as string]: PLAN_COLOR[h.p.kind] }}><Link href={`/misc/plan?d=${today}&edit=${h.p.id}#form`}><em>오늘 {timeText(h.p)}</em><b>{h.p.title}</b><small>{h.p.kind}{h.p.place ? ` · ${h.p.place}` : ""}</small></Link></li>)}
              {next7.map((h) => <li key={`n${h.p.id}${h.day}`} style={{ ["--c" as string]: PLAN_COLOR[h.p.kind] }}><Link href={`/misc/plan?d=${h.day}&edit=${h.p.id}#form`}><em>{dayLabel(h.day)} {timeText(h.p)}</em><b>{h.p.title}</b><small>{h.p.kind}{h.p.place ? ` · ${h.p.place}` : ""}</small></Link></li>)}
            </ul>
          ) : <p className="muted">7일 안에 잡힌 일정이 없습니다. <Link href="/misc/plan#form">일정 넣기 ›</Link></p>}
        </Win>
        <QuickAdd className="s3" items={[["/misc/weekly", "주간업무일지 쓰기"], ["/misc/coop#form", "업무협조 등록"], [`/misc/plan?d=${today}#form`, "일정 넣기"], ["/misc/calendar", "월별 캘린더"]]} />

        <Win en="CALENDAR" ko="월별 캘린더 · 한 일과 잡힌 일, 주마다 업무일지" more={["크게 보기", `/misc/calendar?m=${month}`]} className="s12">
          <MonthCal month={month} cal={cal} today={today} base="/misc" holidays={holidays} max={3} />
        </Win>

        <Win en="COOPERATION" ko="진행 중인 타부서 업무협조 · 기한 순" more={["전체", "/misc/coop"]} className="s7">
          <MiniTable empty="진행 중인 업무협조가 없습니다." rows={open.slice(0, 8).map(({ c, left }) => ({
            href: `/misc/coop?id=${c.id}`,
            cells: [<span key="d" className="cp-dp" style={{ ["--c" as string]: DEPT_COLOR[c.dept] }}>{DEPT_EMOJI[c.dept]} {c.dept}</span>, `${c.prio === "긴급" ? "🔥 " : ""}${c.title}`,
              <Tag key="s" tone={statusTone(c.status)}>{c.status}</Tag>, <Tag key="l" tone={left !== null && left <= 2 ? "r" : "k"}>{left === null ? "기한 없음" : left < 0 ? `${-left}일 지남` : left === 0 ? "오늘" : `D-${left}`}</Tag>],
          }))} />
        </Win>
        <Win en="DEPARTMENTS" ko="부서별 진행 중 협조" className="s5">
          <div className="cp-depts sm">
            {DEPTS.map((d) => {
              const n = open.filter((x) => x.c.dept === d).length;
              return <Link key={d} href={`/misc/coop?dept=${encodeURIComponent(d)}#list`} className="cp-dept" style={{ ["--c" as string]: DEPT_COLOR[d] }}><span className="em">{DEPT_EMOJI[d]}</span><b>{d}</b><strong>{n}<small>건</small></strong></Link>;
            })}
          </div>
        </Win>

        <Win en="THIS WEEK" ko={`${weekTitle(mon)} 내 주간업무일지`} more={[mine ? "고치기" : "쓰기", "/misc/weekly"]} className="s6" tape="y">
          {mine && mine.rows.length ? (
            <ul className="wk-mini">{mine.rows.filter((r) => r.task).slice(0, 7).map((r) => (
              <li key={r.id}><span className="fd-tag k">{r.cat || "-"}</span><b>{r.task}</b><span className="bar"><i style={{ width: `${r.pct}%` }} /></span><em>{r.pct}%</em></li>
            ))}</ul>
          ) : <p className="muted">이번 주 일지를 아직 안 썼습니다. 열면 지난주 &lsquo;차주 계획&rsquo;이 자동으로 들어와 있어요. <Link href="/misc/weekly">쓰러 가기 ›</Link></p>}
        </Win>
        <Win en="TEAM" ko={`${weekTitle(mon)} 팀 일지 작성 현황`} more={["모아보기", `/misc/weekly?view=team`]} className="s6">
          <ul className="wk-team">{team.map((p) => {
            const l = wrote.find((x) => x.uid === p.id)?.log;
            return <li key={p.id}><b>{p.name}</b><small>{p.role}</small>{l ? <><Tag tone="g">작성 {l.rows.length}건</Tag><em>{logAvg(l)}%</em></> : <Tag tone="k">아직</Tag>}</li>;
          })}</ul>
        </Win>

        {admin && (
          <Win en="IN PROGRESS" ko="진행 건·할 일 (관리자)" more={["전체", "/misc/b/tasks"]} className="s8">
            <MiniTable empty="진행 중인 일이 없습니다." rows={tasks.map(({ r, name }) => ({
              href: `/misc/b/tasks?edit=${r.id}#form`, cells: [name, r.data.status ? <Tag key="s" tone={r.data.status === "진행 중" ? "b" : "k"}>{String(r.data.status)}</Tag> : "", r.data.due ? `기한 ${dayLabel(String(r.data.due))}` : ""],
            }))} />
          </Win>
        )}
        <LinksCard scope="misc" links={links} className={admin ? "s4" : "s12"} />
        <AreaMenu area={area} />
      </div>
    </div>
  );
}
