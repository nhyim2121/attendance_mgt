/** 주 52시간 관리: 최근 8주 직원별 주간 실근로시간 (월~일), 초과(52h 넘음)·임박(48h 이상) 표시. */
import Link from "next/link";
import { Suspense } from "react";
import { Ico, Stat } from "@/components/인사노무/HomeKit";
import { ParamDate } from "@/components/ParamControls";
import PrintButton from "@/components/PrintButton";
import { NoData } from "@/components/ui";
import { netHours } from "@/lib/인사노무/dashboard";
import { getRule, loadBase, rosterDays, type SearchParams } from "@/lib/인사노무/data";
import { addDays, dayLabel, isDateStr, todayKst, weekday } from "@/lib/time";

export const metadata = { title: "주 52시간 관리 · 근태관리통합시스템" };
const LIMIT = 52, WARN = 48, WEEKS = 8;
const h1 = (x: number) => (x ? (Math.round(x * 10) / 10).toFixed(1) : "");

export default async function Week52({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [rule, base] = await Promise.all([getRule(), loadBase()]);
  if (!base.months.length) return <><h1>주 52시간 관리</h1><NoData /></>;
  const today = todayKst();
  const day = isDateStr(sp.day) ? String(sp.day) : today;
  const lastMon = addDays(day, -weekday(day));
  const mons = Array.from({ length: WEEKS }, (_, i) => addDays(lastMon, -7 * (WEEKS - 1 - i)));
  const { days } = await rosterDays(mons[0], addDays(lastMon, 6));

  // 직원 × 주 실근로시간
  const deptOf = new Map(base.employees.map((e) => [e.name, e.dept]));
  const grid = new Map<string, number[]>();
  for (const d of days) {
    const h = netHours(d, rule);
    if (h === null) continue;
    const w = Math.floor((Date.parse(d.day) - Date.parse(mons[0])) / (7 * 864e5));
    if (w < 0 || w >= WEEKS) continue;
    const row = grid.get(d.emp) ?? Array(WEEKS).fill(0);
    row[w] += h;
    grid.set(d.emp, row);
  }
  const rows = [...grid].map(([emp, hs]) => ({ emp, dept: deptOf.get(emp) ?? "", hs, max: Math.max(...hs), avg: hs.reduce((t, x) => t + x, 0) / WEEKS }))
    .sort((a, b) => b.hs[WEEKS - 1] - a.hs[WEEKS - 1] || b.max - a.max);
  const cur = rows.map((r) => r.hs[WEEKS - 1]);
  const overNow = cur.filter((x) => x > LIMIT).length, nearNow = cur.filter((x) => x >= WARN && x <= LIMIT).length;
  const overAny = rows.filter((r) => r.max > LIMIT);
  const cls = (x: number) => (x > LIMIT ? "w-over" : x >= WARN ? "w-near" : x > 0 ? "" : "w-none");

  return (
    <div className="home">
      <div className="topbar home-top">
        <div>
          <h1>주 52시간 관리</h1>
          <div className="meta">최근 {WEEKS}주 · {dayLabel(mons[0])} ~ {dayLabel(addDays(lastMon, 6))} · 캡스 출퇴근 기준 실근로시간</div>
        </div>
        <div className="row noprint">
          <Suspense><ParamDate name="day" label="기준일" value={day} /></Suspense>
          <PrintButton className="pill print" label="인쇄" />
        </div>
      </div>
      <section className="card hstats">
        <Stat icon="alert" label="이번 주 초과" value={overNow} unit="명" sub={`${LIMIT}시간 넘음`} />
        <Stat icon="week" label="이번 주 임박" value={nearNow} unit="명" sub={`${WARN}~${LIMIT}시간`} />
        <Stat icon="people" label={`${WEEKS}주 중 초과 경험`} value={overAny.length} unit="명" sub="한 주라도 52시간 넘음" />
        <Stat icon="chart" label="이번 주 최고" value={h1(Math.max(0, ...cur)) || "0"} unit="시간" sub={rows[0]?.emp ?? ""} />
        <Stat icon="cal" label="이번 주 평균" value={h1(cur.length ? cur.reduce((t, x) => t + x, 0) / cur.length : 0) || "0"} unit="시간" sub="1인" />
        <Stat icon="bars" label="연장 한도" value={LIMIT - 40} unit="시간" sub="주 40 + 연장 12" />
      </section>
      <section className="card">
        <div className="card-title"><Ico name="week" />직원별 주간 근로시간 <span className="muted" style={{ fontWeight: 400 }}>(이번 주 많은 순)</span></div>
        <div className="tbl-wrap tall"><table className="tbl w52">
          <thead><tr><th>부서</th><th>이름</th>
            {mons.map((m, i) => <th key={m} className={`num${i === WEEKS - 1 ? " cur" : ""}`}>{dayLabel(m).replace(/\(.\)/, "")}~{i === WEEKS - 1 && <><br /><small>이번 주</small></>}</th>)}
            <th className="num">{WEEKS}주 평균</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.emp}><td>{r.dept}</td><td><b>{r.emp}</b></td>
              {r.hs.map((x, i) => <td key={i} className={`num ${cls(x)}${i === WEEKS - 1 ? " cur" : ""}`}>{h1(x)}</td>)}
              <td className="num"><b>{h1(r.avg)}</b></td></tr>
          ))}</tbody>
        </table></div>
        <p className="caption" style={{ marginTop: 8 }}>
          <span className="w-chip w-over">52시간 초과</span> <span className="w-chip w-near">48시간 이상</span> ·
          실근로시간 = 퇴근 − 출근 − 휴게 (근로시간 리포트와 같은 계산). 출퇴근 중 하나라도 빠진 날은 빠집니다.
          이번 주는 오늘까지의 누적입니다. 날짜별로 보려면 <Link href="/person">직원별 근태</Link>.
        </p>
      </section>
    </div>
  );
}
