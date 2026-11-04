/** 출장 증빙: 출장·교육·외근마다 하이웍스 전자결재 신청서(PDF·이미지)를 첨부해 근태 확인 때 증빙으로 쓴다. */
import SubNav from "@/components/SubNav";
import Link from "next/link";
import { Suspense } from "react";
import { hrefWith } from "@/components/Filters";
import { ParamSelect } from "@/components/ParamControls";
import FileLink from "@/components/FileLink";
import { Metric } from "@/components/ui";
import { loadBase, type SearchParams } from "@/lib/data";
import { attachmentsFor, groupTrips } from "@/lib/evidence";
import * as store from "@/lib/store";
import { addDays, dayLabel, daysInMonth, todayKst } from "@/lib/time";
import { VACATION_TYPES } from "@/lib/vacation";
import { AttachForm, AttachInline, DeleteEvidence } from "./forms";

export const metadata = { title: "출장 증빙 · 근태관리통합시스템" };

export default async function EvidencePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const base = await loadBase();
  const today = todayKst();
  const months = [...new Set([today.slice(0, 7), addDays(today, 31).slice(0, 7), ...base.leaves.map((l) => l.day.slice(0, 7))])]
    .sort().reverse();
  const month = months.includes(String(sp.month)) ? String(sp.month) : today.slice(0, 7);
  const from = `${month}-01`, to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const only = sp.missing === "1";

  const deptOf = new Map(base.employees.map((e) => [e.name, e.dept]));
  const trips = groupTrips(base.leaves.filter((l) => l.day >= from && l.day <= to));
  const atts = (await store.loadAttachments(addDays(from, -40), addDays(to, 40))).filter((a) => !VACATION_TYPES.includes(a.type));
  const rows = trips.map((t) => ({ t, files: attachmentsFor(atts, t.name, t.from, t.to) }));
  const done = rows.filter((r) => r.files.length).length;
  const shown = only ? rows.filter((r) => !r.files.length) : rows;
  const linked = new Set(rows.flatMap((r) => r.files.map((f) => f.id)));
  const loose = atts.filter((a) => a.dayFrom <= to && a.dayTo >= from && !linked.has(a.id));

  return (
    <>
      <h1>근태 캘린더</h1><Suspense><SubNav group="trip" /></Suspense>
      <p className="caption">하이웍스 근태현황·일일 근태 보고서에 올라온 출장·교육·외근마다 전자결재 신청서를 첨부해 두면, 근태를 확인할 때 바로 열어 볼 수 있습니다. 직원별 시트·일일 현황에도 📎로 표시됩니다.</p>
      <div className="filters">
        <Suspense><ParamSelect name="month" label="월" value={month} options={months.map((m) => [m, `${+m.slice(0, 4)}년 ${+m.slice(5)}월`])} /></Suspense>
        <label className="check">
          <Link href={hrefWith(sp, "/evidence", { missing: only ? null : "1" })} scroll={false}>
            <input type="checkbox" readOnly checked={only} /> 증빙 없는 것만
          </Link>
        </label>
      </div>
      <div className="metrics">
        <Metric label="출장·교육·외근" value={`${trips.length}건`} />
        <Metric label="증빙 첨부" value={`${done}건`} />
        <Metric label="증빙 없음" value={<span className={trips.length - done ? "red" : ""}>{trips.length - done}건</span>} />
      </div>

      <div className="card">
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>기간</th><th>직원</th><th>부서</th><th>근태</th><th>목적지·사유</th><th>증빙</th><th /></tr></thead>
          <tbody>
            {shown.map(({ t, files }) => (
              <tr key={`${t.name}|${t.type}|${t.from}`} className={files.length ? "" : "nofile"}>
                <td>{t.from === t.to ? dayLabel(t.from) : `${dayLabel(t.from)} ~ ${dayLabel(t.to)}`}{t.days.length > 1 && <span className="muted"> ({t.days.length}일)</span>}</td>
                <td>{t.name}</td><td>{deptOf.get(t.name) ?? t.dept}</td>
                <td><span className={`tag t-${t.type}`}>{t.type}</span></td>
                <td style={{ whiteSpace: "normal", minWidth: 200 }}><b>{t.title}</b>{t.detail && <div className="muted">{t.detail}</div>}</td>
                <td style={{ whiteSpace: "normal" }}>
                  {files.length ? files.map((a) => <div key={a.id} className="row" style={{ gap: 4 }}><FileLink a={a} /><DeleteEvidence id={a.id} /></div>)
                    : <span className="red">없음</span>}
                </td>
                <td><AttachInline name={t.name} type={t.type} from={t.from} to={t.to} title={t.title} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {!shown.length && <p className="muted">{only ? "증빙이 빠진 출장이 없습니다." : "이 달의 출장·교육·외근이 없습니다."}</p>}
      </div>

      {loose.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">그 밖의 증빙 <span className="muted" style={{ fontWeight: 400 }}>(위 목록과 맞는 근태가 없는 첨부)</span></div>
          <table className="tbl"><thead><tr><th>기간</th><th>직원</th><th>근태</th><th>제목</th><th>파일</th></tr></thead>
            <tbody>{loose.map((a) => (
              <tr key={a.id}><td>{a.dayFrom === a.dayTo ? dayLabel(a.dayFrom) : `${dayLabel(a.dayFrom)} ~ ${dayLabel(a.dayTo)}`}</td>
                <td>{a.name}</td><td>{a.type}</td><td>{a.title}</td>
                <td><div className="row" style={{ gap: 4 }}><FileLink a={a} /><DeleteEvidence id={a.id} /></div></td></tr>
            ))}</tbody></table>
        </div>
      )}

      <details className="fold" style={{ marginTop: 16 }}>
        <summary>직접 첨부 (목록에 없는 근태 · 휴일근무 · 연장근무 등)</summary>
        <div style={{ marginTop: 10 }}>
          <AttachForm names={base.employees.filter((e) => !e.leaveDate || e.leaveDate >= from).map((e) => [e.name, e.dept])} today={today} />
        </div>
      </details>
    </>
  );
}
