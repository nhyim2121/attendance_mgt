/** 부서별 근무: 누가 일찍 출근하고 늦게 퇴근했는지, 며칠 일했는지 부서 단위로 비교한다. */
import SubNav from "@/components/SubNav";
import Link from "next/link";
import { Suspense } from "react";
import Filters, { hrefWith } from "@/components/Filters";
import { ParamSelect } from "@/components/ParamControls";
import { hm, Msg, NoData } from "@/components/ui";
import { personStats, type PersonStat } from "@/lib/dashboard";
import { computeDays, filteredRecords, getRule, loadBase, type SearchParams } from "@/lib/data";
import { dayLabelLong, hhmm, tsHM } from "@/lib/time";

export const metadata = { title: "부서별 근무 · 근태관리통합시스템" };

const SORTS: Record<string, [string, (a: PersonStat, b: PersonStat) => number]> = {
  in: ["일찍 출근 순", (a, b) => (a.avgIn ?? 9e9) - (b.avgIn ?? 9e9)],
  out: ["늦게 퇴근 순", (a, b) => (b.avgOut ?? -1) - (a.avgOut ?? -1)],
  days: ["근무일 많은 순", (a, b) => b.workDays - a.workDays],
  hours: ["근무시간 많은 순", (a, b) => b.hours - a.hours],
};
const clock = (m: number | null) => (m === null ? "-" : m >= 1440 ? `익일 ${hhmm(m - 1440)}` : hhmm(m));

export default async function DeptsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = await filteredRecords(sp);
  if (!f) return <><h1>근로시간 리포트</h1><Suspense><SubNav group="hours" /></Suspense><NoData /></>;
  if (!f.records.length) return <><h1>근로시간 리포트</h1><Suspense><SubNav group="hours" /></Suspense><Filters f={f} /><Msg kind="warn">필터 조건에 맞는 기록이 없습니다.</Msg></>;
  const [rule, base] = await Promise.all([getRule(), loadBase()]);
  const days = await computeDays(f.records, rule);
  const stats = personStats(days, rule);
  const sort = String(sp.sort ?? "in") in SORTS ? String(sp.sort ?? "in") : "in";
  const order = [...new Set([...base.employees.map((e) => e.dept), ...stats.map((s) => s.dept)])].filter((d) => stats.some((s) => s.dept === d));

  const workdays = [...new Set(days.filter((d) => !d.holiday && d.in !== null).map((d) => d.day))].sort().reverse();
  const day = workdays.includes(String(sp.day)) ? String(sp.day) : workdays[0];
  const onDay = days.filter((d) => d.day === day);

  return (
    <>
      <h1>근로시간 리포트</h1><Suspense><SubNav group="hours" /></Suspense>
      <Filters f={f}>
        <span className="seg">
          {Object.entries(SORTS).map(([k, [l]]) => (
            <Link key={k} href={hrefWith(sp, "/depts", { sort: k })} className={k === sort ? "on" : ""} scroll={false}>{l}</Link>
          ))}
        </span>
      </Filters>
      <p className="caption">
        평균 출근·퇴근은 평일 캡스(수기 포함) 기록 기준입니다. <b>일찍 출근</b> = 출근 기준({hhmm(rule.start)}) 30분 전 도착한 날, <b>연장 퇴근</b> = {hhmm(rule.end)} + {rule.overtimeMin}분 이후 퇴근한 날,
        <b> 1등 출근/마지막 퇴근</b> = 그날 부서에서 가장 먼저 출근·가장 늦게 퇴근한 날 수. 근무일에는 휴일근무가 포함됩니다.
      </p>

      <div className="stack">
        {order.map((dept) => {
          const g = stats.filter((s) => s.dept === dept).sort(SORTS[sort][1]);
          const top = (k: "firstDays" | "lastDays") => Math.max(...g.map((s) => s[k]));
          return (
            <section key={dept} className="card">
              <div className="card-title">{dept || "(부서 없음)"} <span className="muted" style={{ fontWeight: 400 }}>{g.length}명</span></div>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr>
                  <th>직원</th><th className="num">근무일</th><th className="num">평균 출근</th><th className="num">가장 이른</th>
                  <th className="num">평균 퇴근</th><th className="num">가장 늦은</th><th className="num">일찍 출근</th><th className="num">연장 퇴근</th>
                  <th className="num">1등 출근</th><th className="num">마지막 퇴근</th><th className="num">근무시간</th>
                </tr></thead>
                <tbody>
                  {g.map((s) => (
                    <tr key={s.emp}>
                      <td><Link href={hrefWith(sp, "/person", { emp: s.emp })}>{s.emp}</Link></td>
                      <td className="num">{s.workDays}{s.holidayDays ? <span className="muted"> (휴일 {s.holidayDays})</span> : ""}</td>
                      <td className="num">{clock(s.avgIn)}</td><td className="num">{clock(s.earliestIn)}</td>
                      <td className="num">{clock(s.avgOut)}</td><td className="num">{clock(s.latestOut)}</td>
                      <td className="num">{s.earlyArrivals || ""}</td><td className="num">{s.lateStays || ""}</td>
                      <td className={`num${s.firstDays && s.firstDays === top("firstDays") ? " best" : ""}`}>{s.firstDays || ""}</td>
                      <td className={`num${s.lastDays && s.lastDays === top("lastDays") ? " best" : ""}`}>{s.lastDays || ""}</td>
                      <td className="num">{hm(s.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </section>
          );
        })}
      </div>

      {day && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-title">하루 출퇴근 순서
            <Suspense><ParamSelect name="day" value={day} options={workdays.map((d) => [d, dayLabelLong(d)])} /></Suspense>
          </div>
          <div className="dept-grid">
            {order.map((dept) => {
              const g = onDay.filter((d) => d.dept === dept);
              const ins = g.filter((d) => d.in !== null && d.inSrc !== "하이웍스").sort((a, b) => a.in! - b.in!);
              const outs = g.filter((d) => d.out !== null && d.outSrc !== "하이웍스").sort((a, b) => b.out! - a.out!);
              return (
                <div key={dept} className="order-box">
                  <b>{dept || "(부서 없음)"}</b>
                  <div className="grid2" style={{ gap: 10 }}>
                    <div><div className="sub-title">출근 빠른 순</div>
                      <ol>{ins.map((d) => <li key={d.emp}>{d.emp} <span className="muted">{tsHM(d.in)}</span></li>)}</ol></div>
                    <div><div className="sub-title">퇴근 늦은 순</div>
                      <ol>{outs.map((d) => <li key={d.emp}>{d.emp} <span className="muted">{tsHM(d.out)}</span></li>)}</ol></div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
