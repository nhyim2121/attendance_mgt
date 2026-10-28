/** 홈 대시보드: 출근/지각/미출근/휴가 카드, 출퇴근 누락, 관리 필요 직원, 근로시간 리포트, 휴가 현황. */
import Link from "next/link";
import { HeadcountChart } from "@/components/Charts";
import Filters, { hrefWith } from "@/components/Filters";
import { ParamNumber, ParamSelect } from "@/components/ParamControls";
import { COLORS, fmtNum, hm, Kpi, Msg, NoData, Table } from "@/components/ui";
import {
  attention, dailyHeadcount, daySnapshot, leaveStatus, missingRows, monthStatus, workHoursReport,
} from "@/lib/analytics";
import { computeDays, filteredRecords, getRule, loadBase, periodLabel, type SearchParams } from "@/lib/data";
import { dayLabelLong } from "@/lib/time";

const SORTS: Record<string, string> = { overtime: "연장근로", holiday: "휴일근로", actual: "실제근로", warn: "주의 먼저" };

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const f = await filteredRecords(sp);
  if (!f) return <><h1>홈</h1><NoData /></>;
  const [rule, base] = await Promise.all([getRule(), loadBase()]);
  if (!f.records.length) return <><h1>홈</h1><Filters f={f} /><Msg kind="warn">필터 조건에 맞는 기록이 없습니다.</Msg></>;

  const rosterNames = base.roster.map((r) => r.name);
  const days = await computeDays(f.records, rule);
  const report = workHoursReport(days, rule, rosterNames);
  const label = periodLabel(f.records);
  const workdays = [...new Set(days.filter((d) => !d.holiday).map((d) => d.day))].sort().reverse();
  const emps = new Set(days.map((d) => d.emp)).size;

  if (!workdays.length) return <><h1>홈</h1><Filters f={f} /><Msg kind="info">선택한 기간에 근무일이 없습니다.</Msg></>;
  const baseDay = workdays.includes(String(sp.base)) ? String(sp.base) : workdays[0];
  const snap = daySnapshot(days, baseDay);
  const missing = missingRows(days);
  const work = days.filter((d) => !d.holiday);

  const names = new Set(rosterNames);
  const outsiders = names.size ? [...new Set(f.all.map((r) => r.name))].filter((n) => !names.has(n)).sort() : [];
  const groups = attention(days, report, outsiders);

  const sort = String(sp.sort ?? "overtime") in SORTS ? String(sp.sort ?? "overtime") : "overtime";
  const key = sort === "warn" ? "overtime" : (sort as "overtime" | "holiday" | "actual");
  const rep = [...report].sort((a, b) =>
    sort === "warn" ? Number(!!b.reasons) - Number(!!a.reasons) || b.overtime - a.overtime : b[key] - a[key]);

  const allot = Math.min(30, Math.max(1, Number(sp.allot) || 15));
  const ls = leaveStatus(base.leaves, report.map((r) => r.emp), baseDay);
  const maxSpecial = Math.max(1, ...ls.map((l) => l.special));
  const ms = monthStatus(days);
  const statuses = [...new Set(ms.map((m) => m.status))];
  const msMonths = [...new Set(ms.map((m) => m.month))];
  const hc = dailyHeadcount(work);

  return (
    <>
      <div className="topbar">
        <h1>홈</h1>
        <div className="meta">기간 <b>{label}</b> · 총 직원수: <b>{emps}</b></div>
      </div>
      <Filters f={f}>
        <ParamSelect name="base" label="기준일" value={baseDay} options={workdays.map((d) => [d, dayLabelLong(d)])} />
      </Filters>

      <div className="grid3">
        <div className="kpi-grid">
          <Kpi label="출근" n={snap.출근} color={COLORS.blue} sub={dayLabelLong(baseDay)} />
          <Kpi label="지각" n={snap.지각} color={COLORS.red} sub={`기간 누적 ${days.filter((d) => d.late).length}건`} />
          <Kpi label="미출근" n={snap.미출근} color={COLORS.orange}
            sub={`기간 누적 ${work.filter((d) => d.status === "기록 없음").length}일`} />
          <Kpi label="휴가" n={snap.휴가} color={COLORS.green}
            sub={`기간 누적 ${fmtNum(days.reduce((s, d) => s + d.leaveDays, 0))}일`} />
        </div>

        <div className="card">
          <div className="card-title">출퇴근 누락</div>
          {missing.length ? (
            <table className="list-table"><tbody>
              {missing.slice(0, 6).map((m, i) => (
                <tr key={i}><td>{m.emp}</td><td className="dt">{dayLabelLong(m.day)}</td><td className="st">{m.label}</td></tr>
              ))}
            </tbody></table>
          ) : <p className="muted">누락된 출퇴근 기록이 없습니다.</p>}
          {missing.length > 0 && (
            <details className="pop" style={{ marginTop: 10 }}>
              <summary className="btn sm">전체 보기 ({missing.length})</summary>
              <div className="pop-body">
                <Table head={["직원", "부서", "일자", "표시"]} tall
                  rows={missing.map((m) => [m.emp, m.dept, dayLabelLong(m.day), m.label])} />
              </div>
            </details>
          )}
        </div>

        <div className="card">
          <div className="card-title">관리가 필요한 직원</div>
          <table className="list-table"><tbody>
            {groups.map(([k, v]) => (
              <tr key={k}><td>{k}</td><td style={{ textAlign: "right" }}><span className={`badge${v.length ? " on" : ""}`}>{v.length}</span></td></tr>
            ))}
          </tbody></table>
          <details className="pop" style={{ marginTop: 10 }}>
            <summary className="btn sm">상세 보기</summary>
            <div className="pop-body">
              {groups.map(([k, v]) => <p key={k}><b>{k}</b> ({v.length})<br />{v.length ? v.join(", ") : "-"}</p>)}
            </div>
          </details>
        </div>
      </div>

      <div className="grid-r" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">리포트 현황
            <span className="spacer" />
            <span className="seg">
              {Object.entries(SORTS).map(([k, l]) => (
                <Link key={k} href={hrefWith(sp, "/", { sort: k })} className={k === sort ? "on" : ""} scroll={false}>{l}</Link>
              ))}
            </span>
          </div>
          <div className="tbl-wrap"><table className="report">
            <thead><tr>
              <th>직원</th>
              {(["std", "actual", "overtime", "holiday"] as const).map((c) => (
                <th key={c} className={c === key ? "sort" : ""}>
                  {{ std: "소정근로시간", actual: "실제 근로시간", overtime: "연장근로시간", holiday: "휴일근로시간" }[c]}
                  {c === key ? " ↓" : ""}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {rep.slice(0, 10).map((r) => (
                <tr key={r.emp}>
                  <td>{r.reasons && <span className="tri" title={r.reasons}>▲</span>}{r.emp}</td>
                  <td>{hm(r.std)}</td><td>{hm(r.actual)}</td>
                  <td className={r.overtime > 0 ? "warn" : ""}>{hm(r.overtime)}</td>
                  <td className={r.holiday > 0 ? "warn" : ""}>{hm(r.holiday)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="caption" style={{ marginTop: 8 }}>
            소정근로 = 평일 수 × 8h · 실제근로 = 퇴근 − 출근(08:30 이전은 08:30) − 휴게 1h · ▲ 주의 직원 (마우스를 올리면 사유)
          </p>
          <details className="pop">
            <summary className="btn sm">전체 보기 ({report.length})</summary>
            <div className="pop-body">
              <Table head={["직원", "부서", "소정근로", "실제근로", "연장근로", "휴일근로", "지각", "누락", "주의사유"]} tall
                numeric={[6, 7]}
                rows={rep.map((r) => [r.emp, r.dept, hm(r.std), hm(r.actual), hm(r.overtime), hm(r.holiday), r.late,
                  r.missing, r.reasons])} />
            </div>
          </details>
        </div>

        <div className="card">
          <div className="card-title">휴가 현황 <span className="muted" style={{ fontWeight: 400 }}>
            ({baseDay.slice(0, 4)}년 1/1 ~ {+baseDay.slice(5, 7)}/{+baseDay.slice(8, 10)})</span>
            <span className="spacer" />
            <details className="pop">
              <summary className="btn sm">기준</summary>
              <div className="pop-body"><ParamNumber name="allot" label="연차 기준일수" value={allot} min={1} max={30} /></div>
            </details>
          </div>
          {!base.leaves.length ? <Msg kind="info">파일 업로드에서 근태현황 파일을 올리면 표시됩니다.</Msg> : (
            <>
              <div className="tbl-wrap"><table className="report">
                <thead><tr><th>직원</th><th>연차</th><th /><th>공가·특별휴가</th><th /></tr></thead>
                <tbody>
                  {ls.slice(0, 12).map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td style={{ width: "38%" }}><div className="bar"><div style={{ width: `${Math.min(100, (r.annual / allot) * 100)}%` }} /></div></td>
                      <td className="numcell">{fmtNum(r.annual)} / {allot}</td>
                      <td style={{ width: "28%" }}><div className="bar alt"><div style={{ width: `${(r.special / maxSpecial) * 100}%` }} /></div></td>
                      <td className="numcell">{r.special}일</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <details className="pop" style={{ marginTop: 10 }}>
                <summary className="btn sm">전체 보기 ({ls.length})</summary>
                <div className="pop-body">
                  <Table head={["이름", "연차사용", "공가", "남은연차"]} numeric={[1, 2, 3]} tall
                    rows={ls.map((r) => [r.name, fmtNum(r.annual), r.special, fmtNum(Math.max(0, allot - r.annual))])} />
                </div>
              </details>
            </>
          )}
        </div>
      </div>

      <details className="fold" style={{ marginTop: 16 }}>
        <summary>추이 (일별 인원 · 월별 상태)</summary>
        <h2>일별 인원</h2>
        <HeadcountChart data={hc} />
        <details style={{ margin: "8px 0" }}>
          <summary className="muted">표로 보기</summary>
          <Table head={["일자", "출근인원", "휴가인원", "지각인원"]} numeric={[1, 2, 3]} tall
            rows={hc.map((h) => [h.day, h.present, h.onLeave, h.late])} />
        </details>
        <h2>월별 상태 건수</h2>
        <Table head={["월", ...statuses]} numeric={statuses.map((_, i) => i + 1)}
          rows={msMonths.map((m) => [m, ...statuses.map((s) => ms.find((x) => x.month === m && x.status === s)?.n ?? 0)])} />
      </details>
    </>
  );
}
