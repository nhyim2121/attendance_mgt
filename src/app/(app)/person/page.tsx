/** 직원 한 명의 출퇴근 흐름, 근태현황 시트, 하이웍스 근태, 원본 기록. */
import Link from "next/link";
import { Suspense } from "react";
import { TimelineChart } from "@/components/Charts";
import Filters, { hrefWith } from "@/components/Filters";
import { ParamSelect } from "@/components/ParamControls";
import { Metric, Msg, NoData, Table } from "@/components/ui";
import { employeeSummary } from "@/lib/analytics";
import { computeDays, filteredRecords, getRule, loadBase, type SearchParams } from "@/lib/data";
import { employeeRows, SHEET_COLUMNS } from "@/lib/splitter";
import { minutesOf, tsTime } from "@/lib/time";
import { rowClass } from "../sheets/rowClass";

export const metadata = { title: "출퇴근기록 · 근태관리통합시스템" };

const TABS = { sheet: "근태현황 시트", hiworks: "하이웍스 근태", raw: "캡스 원본 기록" };

export default async function PersonPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = await filteredRecords(sp);
  if (!f) return <><h1>출퇴근기록</h1><NoData /></>;
  if (!f.records.length) return <><h1>출퇴근기록</h1><Filters f={f} /><Msg kind="warn">필터 조건에 맞는 기록이 없습니다.</Msg></>;
  const [rule, base] = await Promise.all([getRule(), loadBase()]);

  const all = await computeDays(f.records, rule);
  const names = employeeSummary(all, base.roster.map((r) => r.name)).map((s) => s.emp);
  const emp = names.includes(String(sp.emp)) ? String(sp.emp) : names[0];
  const mine = f.records.filter((r) => r.emp === emp);
  const days = await computeDays(mine, rule);
  const s = employeeSummary(days)[0];
  const tab = String(sp.tab ?? "sheet") in TABS ? String(sp.tab ?? "sheet") : "sheet";

  const lo = mine[0].day, hi = mine[mine.length - 1].day;
  const myLeaves = base.leaves.filter((l) => l.name === mine[0].name && l.day >= lo && l.day <= hi);
  const toH = (t: number | null) => (t === null ? null : minutesOf(t) / 60 + (Math.floor(t / 1000) % 60) / 3600);
  const points = days.map((d) => ({ day: d.day, in: toH(d.in), out: toH(d.out), status: d.status }));
  const sheet = employeeRows(days, rule);

  return (
    <>
      <h1>출퇴근기록</h1>
      <Filters f={f}>
        <Suspense><ParamSelect name="emp" label="직원" value={emp} options={names.map((n) => [n, n])} /></Suspense>
      </Filters>
      <div className="metrics">
        <Metric label="부서" value={s.dept || "-"} />
        <Metric label="출근일수" value={`${s.workDays}일`} />
        <Metric label="평균 출근" value={s.avgIn || "-"} />
        <Metric label="평균 퇴근" value={s.avgOut || "-"} />
        <Metric label="지각 / 조퇴" value={`${s.late} / ${s.early}`} />
        <Metric label="휴가 사용" value={`${s.leaveUsed}일`} />
        <Metric label="휴일근무" value={`${s.holidayWork}일`} />
      </div>

      <div className="card">
        <div className="card-title">날짜별 출퇴근 시각</div>
        <TimelineChart data={points} start={(rule.start + rule.graceMin) / 60} end={rule.end / 60} />
        {days.some((d) => d.in === null) && (
          <p className="caption">휴가·기록 없음: {days.filter((d) => d.in === null).map((d) => `${+d.day.slice(5, 7)}/${+d.day.slice(8)} ${d.status}`).join(" · ")}</p>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="tabs">
          {Object.entries(TABS).map(([k, l]) => (
            <Link key={k} href={hrefWith(sp, "/person", { tab: k, emp })} className={k === tab ? "on" : ""} scroll={false}>{l}</Link>
          ))}
        </div>
        {tab === "sheet" && <Table head={SHEET_COLUMNS} rows={sheet} tall rowClass={(i) => rowClass(sheet[i])} />}
        {tab === "hiworks" && (myLeaves.length
          ? <Table head={["일자", "부서", "직급", "유형", "내용", "비고", "시트"]} wrap={[4]} tall
            rows={myLeaves.map((l) => [l.day, l.dept, l.rank, l.type, l.content, l.note, l.sheet])} />
          : <p className="muted">이 기간의 하이웍스 근태가 없습니다.</p>)}
        {tab === "raw" && (
          <Table head={["일자", "시간", "요일", "사번", "이름", "부서", "출입문", "모드", "인증", "근무형태", "근무지", "비고"]} tall
            rows={mine.map((r) => [r.day, tsTime(r.ts), r.wd, r.empId, r.name, r.dept, r.door, r.mode, r.auth, r.workType, r.place, r.note])} />
        )}
      </div>
    </>
  );
}
