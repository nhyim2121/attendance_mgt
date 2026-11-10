/** 개인일정: 한 주 일정표(월~일) · 일정 넣기·고치기 · 다가오는 일정. 로그인한 사람마다 따로. ?d=날짜 &edit=번호 */
import Link from "next/link";
import { type KpiProps, Kpis, Win } from "@/components/대시/parts";
import { requireUser } from "@/lib/auth";
import { addDays, dayLabel, todayKst, weekdayKr } from "@/lib/time";
import { mondayOf, occurrences, PLAN_COLOR, timeText, weekTitle } from "@/lib/기타/work";
import { loadPlans } from "@/lib/기타/workStore";
import { DeletePlan, PlanCheck, PlanForm } from "../forms";

export const metadata = { title: "개인일정 · 통합관리시스템" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = todayKst();
  const d = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const mon = mondayOf(d);
  const plans = await loadPlans(me.id);
  const edit = plans.find((p) => p.id === sp.edit);
  const week = plans.flatMap((p) => occurrences(p, mon, addDays(mon, 6)));
  const sortHits = <T extends { day: string; p: { from: string } }>(a: T, b: T) => a.day.localeCompare(b.day) || (a.p.from || "00").localeCompare(b.p.from || "00");
  const upcoming = plans.flatMap((p) => occurrences(p, today, addDays(today, 30))).filter((h) => !h.done && (h.day === h.start || h.day === today)).sort(sortHits);
  const todayHits = plans.flatMap((p) => occurrences(p, today, today)).sort(sortHits);
  const q = (day: string) => `/misc/plan?d=${day}`;

  const kpis: KpiProps[] = [
    { label: "오늘 일정", n: todayHits.length, unit: "건", sub: todayHits.map((h) => h.p.title).slice(0, 2).join(", ") || "없음", icon: "clock", color: "#be185d", href: q(today) },
    { label: "이번 주 일정", n: plans.flatMap((p) => occurrences(p, mondayOf(today), addDays(mondayOf(today), 6))).length, unit: "건", sub: weekTitle(mondayOf(today)), icon: "calendar", color: "#0c3994", href: q(today) },
    { label: "30일 안 일정", n: upcoming.length, unit: "건", sub: upcoming[0] ? `${dayLabel(upcoming[0].day)} ${upcoming[0].p.title}` : "없음", icon: "calendarStar", color: "#0e7490", href: "#up" },
    { label: "반복 일정", n: plans.filter((p) => p.repeat !== "안 함").length, unit: "개", sub: "매일·매주·매월", icon: "list", color: "#6d28d9", href: "#up" },
  ];
  return (
    <div className="ud">
      <header className="u-hello ar" style={{ ["--c" as string]: "#be185d" }}>
        <span className="u-date"><Link href="/misc">기타</Link> › 개인일정</span>
        <h1>{me.name}님의 <mark>개인일정</mark></h1>
        <p>회의·외근·출장·교육·마감 일정을 넣어 두면 대시보드와 월별 캘린더, 주간업무일지 &lsquo;가져오기&rsquo;에 같이 나옵니다. 나만 보는 일정이에요.</p>
        <span className="u-cover" aria-hidden>🧭</span>
        {todayHits[0]
          ? <div className="u-note"><b>오늘</b>{todayHits.map((h) => `${timeText(h.p)} ${h.p.title}`).join(" · ")}</div>
          : <div className="u-note"><b>오늘</b>잡힌 일정이 없습니다.</div>}
      </header>
      <Kpis items={kpis} />
      <div className="u-grid">
        <Win en="THIS WEEK" ko={`${weekTitle(mon)} 일정표 · 체크하면 끝냄`} className="s7">
          <div className="wk-nav sm">
            <Link className="fd-btn sm" href={q(addDays(mon, -7))}>‹</Link><b>{dayLabel(mon)} ~ {dayLabel(addDays(mon, 6))}</b><Link className="fd-btn sm" href={q(addDays(mon, 7))}>›</Link>
            {mon !== mondayOf(today) && <Link className="fd-btn sm" href={q(today)}>오늘</Link>}
            <span className="sp" /><Link className="fd-btn sm" href={`/misc/calendar?m=${d.slice(0, 7)}`}>🗓️ 월별로 보기</Link>
          </div>
          <div className="pl-week">
            {Array.from({ length: 7 }, (_, i) => {
              const day = addDays(mon, i);
              const hits = week.filter((h) => h.day === day).sort(sortHits);
              return (
                <div key={day} className={`pl-day${day === today ? " today" : ""}${day === d ? " sel" : ""}${i > 4 ? " we" : ""}`}>
                  <Link href={`${q(day)}#form`} className="pl-dh" title="이날 일정 넣기"><b>{+day.slice(8, 10)}</b>{weekdayKr(day)}<span>＋</span></Link>
                  <ul>
                    {hits.map((h) => (
                      <li key={`${h.p.id}${h.day}`} className={h.done ? "done" : ""} style={{ ["--c" as string]: PLAN_COLOR[h.p.kind] }}>
                        <PlanCheck id={h.p.id} start={h.start} done={h.done} />
                        <Link href={`/misc/plan?d=${h.day}&edit=${h.p.id}#form`}>
                          <em>{h.multi ? "여러 날" : timeText(h.p)}</em><b>{h.p.title}</b>
                          <small>{h.p.kind}{h.p.place ? ` · ${h.p.place}` : ""}{h.p.repeat !== "안 함" ? ` · 🔁${h.p.repeat}` : ""}</small>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Win>
        <Win en={edit ? "EDIT" : "NEW"} ko={edit ? "일정 고치기" : `일정 넣기 · ${dayLabel(d)}`} className="s5" tape="y">
          <span id="form" />
          <PlanForm p={edit} day={d} />
          {edit && <div className="fd-btns" style={{ marginTop: 8 }}><DeletePlan id={edit.id} /></div>}
        </Win>
        <Win en="UPCOMING" ko="다가오는 일정 · 30일" className="s12">
          <span id="up" />
          {upcoming.length ? (
            <ul className="u-ev">{upcoming.slice(0, 20).map((h) => (
              <li key={`${h.p.id}${h.day}`}><Link href={`/misc/plan?d=${h.day}&edit=${h.p.id}#form`}>
                <span className="dt">{+h.day.slice(5, 7)}/{+h.day.slice(8, 10)}</span>
                <span className="tt"><b>{h.p.title}</b><small>{weekdayKr(h.day)}요일 · {timeText(h.p)}{h.p.place ? ` · ${h.p.place}` : ""}{h.p.end ? ` · ~${h.p.end.slice(5)}` : ""}</small></span>
                <span className="fd-tag" style={{ background: `${PLAN_COLOR[h.p.kind]}22`, color: PLAN_COLOR[h.p.kind] }}>{h.p.kind}</span>
                <span className="muted">{h.day === today ? "오늘" : `D-${Math.round((Date.parse(h.day) - Date.parse(today)) / 864e5)}`}</span>
              </Link></li>
            ))}</ul>
          ) : <p className="muted">30일 안에 잡힌 일정이 없습니다.</p>}
        </Win>
      </div>
    </div>
  );
}
