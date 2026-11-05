/** 휴가 홈 대시보드: 요약 띠, 이번 주 휴가, 유형별·월별·부서별 사용, 신청서가 빠진 휴가, 잔여 연차가 많은 직원. */
import Link from "next/link";
import { redirect } from "next/navigation";
import { MonthlyLeaveBars, StatusBars, TwoBars } from "@/components/Charts";
import { Ico, Stat } from "@/components/HomeKit";
import PrintButton from "@/components/PrintButton";
import { getLeavePolicy, loadBase, type SearchParams } from "@/lib/data";
import { attachmentsFor, groupTrips } from "@/lib/evidence";
import * as store from "@/lib/store";
import { addDays, dayLabel, todayKst, weekday, weekdayKr } from "@/lib/time";
import { fyLabel, fyOf, fyRange, leaveBalances, VACATION_TYPES } from "@/lib/vacation";
import { LEAVE_COLORS } from "@/lib/leaveColors";
import { applyHwStatus } from "@/lib/leaveStatus";
import { TABS } from "./LeaveView";

export const metadata = { title: "휴가 홈 · 근태관리통합시스템" };
const VAC = new Set(VACATION_TYPES);
const n2 = (x: number) => String(Math.round(x * 100) / 100);
const TYPE_COLOR = Object.fromEntries(Object.entries(LEAVE_COLORS).map(([t, [fg]]) => [t, fg]));

export default async function LeaveHome({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  // 예전 주소 /leave?tab=... -> /leave/...
  if (typeof sp.tab === "string" && sp.tab in TABS) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "tab" && typeof v === "string") q.set(k, v);
    redirect(`/leave/${sp.tab}${q.size ? `?${q}` : ""}`);
  }
  const [base, policy, adjusts] = await Promise.all([loadBase(), getLeavePolicy(), store.loadAdjusts()]);
  const today = todayKst();
  const fy = fyOf(today, policy);
  const [fs, fe] = fyRange(fy, policy);
  const excl = new Set(policy.exclude ?? []);
  const empOf = new Map(base.employees.map((e) => [e.name, e]));
  const siteBal = leaveBalances(base.employees, base.leaves, adjusts, fy, today, policy).filter((b) => {
    const e = empOf.get(b.name);
    return !excl.has(b.name) && (!e?.leaveDate || e.leaveDate >= today) && (!e?.joinDate || e.joinDate <= today);
  });
  // 하이웍스 휴가현황(종류별)을 올렸으면 부여·사용·잔여는 그 숫자
  const hwRows = await store.loadLeaveStatus(fy);
  const bal = hwRows.length && today >= hwRows[0].exportedAt.slice(0, 10) ? applyHwStatus(siteBal, hwRows, policy) : siteBal;
  const deptOf = new Map(base.employees.map((e) => [e.name, e.dept]));
  const vac = base.leaves.filter((l) => VAC.has(l.type));

  const todayList = vac.filter((l) => l.day === today);
  const monday = addDays(today, -weekday(today)), sunday = addDays(monday, 6);
  const weekNames = new Set(vac.filter((l) => l.day >= monday && l.day <= sunday).map((l) => l.name));
  const soon = vac.filter((l) => l.day > today && l.day <= addDays(today, 14));
  const total = bal.reduce((t, b) => t + b.total, 0), used = bal.reduce((t, b) => t + b.used, 0);

  // 신청서가 빠진 휴가 (최근 60일, 지난 것만)
  const from = addDays(today, -60) < fs ? fs : addDays(today, -60);
  const atts = (await store.loadAttachments(from, today)).filter((a) => VAC.has(a.type));
  const missing = groupTrips(vac.filter((l) => l.day >= from && l.day <= today), VAC)
    .filter((t) => !attachmentsFor(atts, t.name, t.from, t.to).length).reverse();
  const promote = bal.filter((b) => b.remain >= 5).sort((a, b) => b.remain - a.remain);

  // 이번 주 (월~일)
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // 유형별 건수, 월별 사용 일수, 부서별 부여·사용 (이 회계연도)
  const items = bal.flatMap((b) => b.items.map((it) => ({ ...it, name: b.name })));
  const byType = VACATION_TYPES.map((t) => ({ label: t, n: items.filter((it) => it.type === t).length, color: TYPE_COLOR[t] ?? "#0c3994" }))
    .filter((x) => x.n > 0);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(fs, i));
  const monthly = months.map((m) => {
    const g = items.filter((it) => it.day.startsWith(m));
    return {
      label: `${+m.slice(5)}월`, used: r1(g.filter((it) => !it.planned).reduce((t, it) => t + it.days, 0)),
      planned: r1(g.filter((it) => it.planned).reduce((t, it) => t + it.days, 0)),
    };
  });
  const order = [...new Set(base.employees.map((e) => e.dept).filter(Boolean))];
  const pos = (d: string) => (order.includes(d) ? order.indexOf(d) : order.length);
  const depts = [...new Set(bal.map((b) => b.dept || "(부서 없음)"))].sort((x, y) => pos(x) - pos(y));
  const deptData = depts.map((d) => {
    const g = bal.filter((b) => (b.dept || "(부서 없음)") === d);
    return { dept: d, total: r1(g.reduce((t, b) => t + b.total, 0)), used: r1(g.reduce((t, b) => t + b.used, 0)) };
  });
  const thisMonth = items.filter((it) => it.day.startsWith(today.slice(0, 7)) && !it.planned).reduce((t, it) => t + it.days, 0);
  const todayNames = [...new Set(todayList.map((l) => l.name))];

  return (
    <div className="home">
      <div className="topbar home-top">
        <div>
          <h1>휴가 대시보드</h1>
          <div className="meta">{dayLabel(today, true)} · {fyLabel(fy, policy)}{policy.fyStartMonth === 1 ? "" : " 회계연도"} ({fs} ~ {fe})</div>
        </div>
        <div className="row noprint">
          <Link className="pill" href="/leave/register">+ 휴가 등록</Link>
          <Link className="pill" href="/leave/calendar">휴가 캘린더</Link>
          <Link className="pill" href="/leave/status?view=summary">현황 보고서</Link>
          <PrintButton className="pill print" label="인쇄" />
        </div>
      </div>

      <section className="card hstats">
        <Stat icon="beach" label="오늘 휴가자" value={todayNames.length} unit="명"
          sub={todayNames.slice(0, 3).join(", ") + (todayNames.length > 3 ? " 외" : "")} />
        <Stat icon="week" label="이번 주 휴가자" value={weekNames.size} unit="명" sub={`${dayLabel(monday)} ~ ${dayLabel(sunday)}`} />
        <Stat icon="cal" label="평균 연차 사용률" value={total ? Math.round((used / total) * 100) : 0} unit="%"
          sub={`사용 ${n2(used)} / 부여 ${n2(total)}일`} />
        <Stat icon="chart" label="이번 달 사용" value={n2(thisMonth)} unit="일" sub={`${+today.slice(5, 7)}월, 오늘까지`} />
        <Stat icon="clip" label="신청서 없음" value={missing.length} unit="건" sub="최근 60일" />
        <Stat icon="alert" label="잔여 5일 이상" value={promote.length} unit="명" sub="사용 촉진 참고" />
      </section>

      <div className="grid2 home-row">
        <section className="card">
          <div className="card-title"><Ico name="week" />이번 주 휴가<span className="spacer" />
            <Link className="btn sm noprint" href="/leave/calendar">캘린더</Link></div>
          <div className="wk">
            {week.map((d) => {
              const ls = vac.filter((l) => l.day === d);
              return (
                <div key={d} className={`wk-d${d === today ? " today" : ""}${weekday(d) >= 5 ? " off" : ""}`}>
                  <div className="wk-h">{weekdayKr(d)} <small>{+d.slice(5, 7)}/{+d.slice(8)}</small></div>
                  {ls.length ? ls.map((l, i) => (
                    <div key={i} className="wk-i" style={{ "--tc": TYPE_COLOR[l.type] ?? "#0c3994" } as React.CSSProperties}
                      title={`${l.name} ${l.type} ${l.content.split("\n")[0]}`}>{l.name}<small>{l.type}</small></div>
                  )) : <div className="wk-none">-</div>}
                </div>
              );
            })}
          </div>
          {soon.length > 0 && (
            <p className="caption" style={{ margin: "10px 0 0" }}>
              다음 2주 예정: {soon.slice(0, 6).map((l) => `${dayLabel(l.day)} ${l.name}(${l.type})`).join(" · ")}
              {soon.length > 6 ? ` 외 ${soon.length - 6}건` : ""}
            </p>
          )}
        </section>
        <section className="card">
          <div className="card-title"><Ico name="pie" />휴가 유형별 <span className="muted" style={{ fontWeight: 400 }}>(건수, 예정 포함)</span></div>
          {byType.length ? <StatusBars data={byType} total={byType.reduce((t, x) => t + x.n, 0)} unit="건" />
            : <p className="muted">이 회계연도 휴가가 없습니다.</p>}
        </section>
      </div>

      <div className="grid2 home-row">
        <section className="card">
          <div className="card-title"><Ico name="chart" />월별 휴가 사용 <span className="muted" style={{ fontWeight: 400 }}>(차감 일수)</span></div>
          <MonthlyLeaveBars data={monthly} />
        </section>
        <section className="card">
          <div className="card-title"><Ico name="bars" />부서별 연차 <span className="muted" style={{ fontWeight: 400 }}>(합계 일수)</span></div>
          {deptData.length ? <TwoBars data={deptData} x="dept" a={["total", "부여"]} b={["used", "사용"]} unit="일" />
            : <p className="muted">대상이 없습니다.</p>}
        </section>
      </div>

      <div className="grid2 home-row">
        <section className="card">
          <div className="card-title"><Ico name="clip" />신청서가 빠진 휴가
            <span className="muted" style={{ fontWeight: 400 }}>최근 60일 · {missing.length}건</span>
            <span className="spacer" /><Link className="btn sm noprint" href="/leave/evidence?missing=1">신청서 첨부</Link></div>
          {missing.length ? (
            <div className="chips">{missing.slice(0, 16).map((t) => (
              <Link key={`${t.name}|${t.from}|${t.type}`} className="chip-l" href={`/leave/evidence?emp=${encodeURIComponent(t.name)}&missing=1`}
                style={{ "--tc": TYPE_COLOR[t.type] ?? "#0c3994" } as React.CSSProperties}>
                <b>{t.name}</b><span>{t.type}</span>
                <small>{t.from === t.to ? dayLabel(t.from) : `${dayLabel(t.from)}~${dayLabel(t.to)}`}</small>
              </Link>
            ))}{missing.length > 16 && <span className="muted" style={{ alignSelf: "center" }}>외 {missing.length - 16}건</span>}</div>
          ) : <p className="muted">모든 휴가에 신청서가 첨부되어 있습니다.</p>}
        </section>
        <section className="card">
          <div className="card-title"><Ico name="alert" />잔여 연차가 많은 직원
            <span className="muted" style={{ fontWeight: 400 }}>사용 촉진 참고</span>
            <span className="spacer" /><Link className="btn sm noprint" href="/leave/status">연차 현황</Link></div>
          {promote.length ? (
            <div className="sbars">{promote.slice(0, 8).map((b) => (
              <div key={b.name} className="sbar">
                <span className="sbar-l">{b.name}</span>
                <div className="sbar-track" title={`사용 ${n2(b.used)} · 예정 ${n2(b.planned)} · 잔여 ${n2(b.remain)} / ${n2(b.total)}일`}>
                  <div className="sbar-fill" style={{ width: `${b.total ? Math.min(100, (b.used / b.total) * 100) : 0}%`, background: "#0c3994" }} />
                </div>
                <span className="sbar-v">잔여 {n2(b.remain)}<small>/{n2(b.total)}일</small></span>
              </div>
            ))}</div>
          ) : <p className="muted">잔여 5일 이상인 직원이 없습니다.</p>}
        </section>
      </div>
    </div>
  );
}

const r1 = (x: number) => Math.round(x * 10) / 10;
/** 'YYYY-MM-DD'에서 n달 뒤의 'YYYY-MM' */
function addMonths(day: string, n: number): string {
  const y = +day.slice(0, 4), m = +day.slice(5, 7) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
}
