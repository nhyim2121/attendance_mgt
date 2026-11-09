/** 월 근태 집계 (급여 자료): 직원별 근무일·실근로·연장·야간·휴일 시간, 지각·조퇴, 휴가·출장 일수. CSV로 내려받는다. */
import Link from "next/link";
import { Suspense } from "react";
import CsvButton from "@/components/CsvButton";
import { Ico, Stat } from "@/components/인사노무/HomeKit";
import { ParamSelect } from "@/components/ParamControls";
import PrintButton from "@/components/PrintButton";
import { NoData } from "@/components/ui";
import { holidayHours, netHours, nightHours, overtimeHours } from "@/lib/인사노무/dashboard";
import { getLeavePolicy, getRule, loadBase, rosterDays, type SearchParams } from "@/lib/인사노무/data";
import { daysInMonth, todayKst } from "@/lib/time";
import { deductDays, VACATION_TYPES } from "@/lib/인사노무/vacation";

export const metadata = { title: "월 근태 집계 · 근태관리통합시스템" };
const VAC = new Set(VACATION_TYPES), TRIP = new Set(["출장", "교육", "외근"]);
const r1 = (x: number) => Math.round(x * 10) / 10;
const f = (x: number) => (x ? String(r1(x)) : "");

export default async function Monthly({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [rule, base, policy] = await Promise.all([getRule(), loadBase(), getLeavePolicy()]);
  if (!base.months.length) return <><h1>월 근태 집계</h1><NoData /></>;
  const months = base.months.map((m) => m.month).reverse();
  const cur = todayKst().slice(0, 7);
  const month = months.includes(String(sp.month)) ? String(sp.month) : months.includes(cur) ? cur : months[0];
  const from = `${month}-01`, to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const { days } = await rosterDays(from, to);
  const leaves = base.leaves.filter((l) => l.day >= from && l.day <= to);
  const deptOf = new Map(base.employees.map((e) => [e.name, e.dept]));

  const names = [...new Set([...days.map((d) => d.emp), ...leaves.filter((l) => VAC.has(l.type) || TRIP.has(l.type)).map((l) => l.name)])];
  const order = base.employees.map((e) => e.name);
  const pos = (n: string) => (order.includes(n) ? order.indexOf(n) : order.length);
  const rows = names.sort((a, b) => pos(a) - pos(b)).map((emp) => {
    const ds = days.filter((d) => d.emp === emp), ls = leaves.filter((l) => l.name === emp);
    const sum = (fn: (d: (typeof ds)[number]) => number) => ds.reduce((t, d) => t + fn(d), 0);
    return {
      emp, dept: deptOf.get(emp) ?? ds[0]?.dept ?? "",
      work: ds.filter((d) => d.in !== null || d.out !== null).length,
      hours: sum((d) => netHours(d, rule) ?? 0), overtime: sum((d) => overtimeHours(d, rule)),
      night: sum((d) => nightHours(d)), holiday: sum((d) => holidayHours(d, rule)),
      late: ds.filter((d) => d.late).length, early: ds.filter((d) => d.early).length,
      vac: ls.filter((l) => VAC.has(l.type)).reduce((t, l) => t + deductDays(l, policy), 0),
      trip: new Set(ls.filter((l) => TRIP.has(l.type)).map((l) => l.day)).size,
    };
  });
  const tot = (k: "hours" | "overtime" | "night" | "holiday" | "late" | "vac") => rows.reduce((t, r) => t + r[k], 0);
  const head = ["부서", "이름", "근무일", "실근로(h)", "연장(h)", "야간(h)", "휴일(h)", "지각(회)", "조퇴(회)", "휴가(일)", "출장·교육·외근(일)"];
  const csvRows = rows.map((r) => [r.dept, r.emp, r.work, r1(r.hours), r1(r.overtime), r1(r.night), r1(r.holiday), r.late, r.early, r1(r.vac), r.trip]);

  return (
    <div className="home">
      <div className="topbar home-top">
        <div>
          <h1>월 근태 집계</h1>
          <div className="meta">{+month.slice(0, 4)}년 {+month.slice(5)}월 · 급여·수당 계산용 직원별 집계 (캡스 출퇴근 + 하이웍스·보고서 근태)</div>
        </div>
        <div className="row noprint">
          <Suspense><ParamSelect name="month" label="월" value={month} options={months.map((m) => [m, `${+m.slice(0, 4)}년 ${+m.slice(5)}월`])} /></Suspense>
          <CsvButton name={`월근태집계_${month}.csv`} head={head} rows={csvRows} />
          <PrintButton className="pill print" label="인쇄" />
        </div>
      </div>
      <section className="card hstats">
        <Stat icon="people" label="대상" value={rows.length} unit="명" />
        <Stat icon="chart" label="실근로 합계" value={Math.round(tot("hours"))} unit="시간" sub={`1인 평균 ${rows.length ? r1(tot("hours") / rows.length) : 0}시간`} />
        <Stat icon="alert" label="연장 합계" value={r1(tot("overtime"))} unit="시간" />
        <Stat icon="week" label="야간·휴일" value={r1(tot("night") + tot("holiday"))} unit="시간" sub={`야간 ${r1(tot("night"))} · 휴일 ${r1(tot("holiday"))}`} />
        <Stat icon="in" label="지각" value={tot("late")} unit="회" />
        <Stat icon="beach" label="휴가 사용" value={r1(tot("vac"))} unit="일" />
      </section>
      <section className="card">
        <div className="card-title"><Ico name="bars" />직원별 집계</div>
        <div className="tbl-wrap tall"><table className="tbl ls-tbl">
          <thead><tr>{head.map((h, i) => <th key={h} className={i >= 2 ? "num" : ""}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.emp}>
              <td>{r.dept}</td><td><b>{r.emp}</b></td><td className="num">{r.work}</td><td className="num">{f(r.hours)}</td>
              <td className="num">{r.overtime ? <span className="pill" style={{ color: "#be123c", background: "#fde4ea" }}>{f(r.overtime)}</span> : ""}</td>
              <td className="num">{f(r.night)}</td>
              <td className="num">{r.holiday ? <span className="pill" style={{ color: "#b45309", background: "#fdf0d5" }}>{f(r.holiday)}</span> : ""}</td>
              <td className={`num${r.late >= 3 ? " red" : ""}`}>{r.late || ""}</td><td className="num">{r.early || ""}</td>
              <td className="num">{r.vac ? <span className="pill" style={{ color: "#0c3994", background: "#e3eafa" }}>{f(r.vac)}</span> : ""}</td>
              <td className="num">{r.trip || ""}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="caption" style={{ marginTop: 8 }}>
          실근로 = 퇴근 − 출근 − 휴게. 연장 = 평일 퇴근 기준 + {rule.overtimeMin}분 이후의 초과분, 야간 = 22:00~06:00, 휴일 = 주말·공휴일 근로.
          휴가는 연차 차감 일수(반차 0.5, 반반차 0.25). 지각 3회 이상은 빨간색. 날짜별 근거는 <Link href={`/person?month=${month}`}>직원별 근태</Link>에서 확인하세요.
        </p>
      </section>
    </div>
  );
}
