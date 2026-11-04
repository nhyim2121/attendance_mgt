/** 데이터 관리 > 내려받기: 직원별 시트로 나눈 엑셀/ZIP 만들기 (수작업 양식과 같은 모양), 확인 필요·직원별 요약·시트 미리보기. */
import Link from "next/link";
import { Suspense } from "react";
import Filters, { hrefWith } from "@/components/Filters";
import { ParamMulti, ParamSelect } from "@/components/ParamControls";
import FileLink from "@/components/FileLink";
import { Metric, Msg, NoData, Table } from "@/components/ui";
import * as store from "@/lib/store";
import type { SearchParams } from "@/lib/data";
import { employeeRows, EXCEPTION_COLUMNS, exceptionRows, rowKind, SHEET_COLUMNS, SUMMARY_COLUMNS } from "@/lib/splitter";
import { sheetData, summaryRows } from "../sheets/compute";

export default async function DownloadView({ sp, head }: { sp: SearchParams; head: React.ReactNode }) {
  const d = await sheetData(sp);
  if (!d.f) return <>{head}<NoData /></>;
  if (d.empty) return <>{head}<Filters f={d.f} /><Msg kind="warn">필터 조건에 맞는 기록이 없습니다.</Msg></>;

  const { rule, days, summary, emps, label } = d;
  const sum = (k: "late" | "early" | "noRecord") => summary.reduce((s, x) => s + x[k], 0);
  const preview = emps.includes(String(sp.preview)) ? String(sp.preview) : emps[0];
  const pd = days.filter((x) => x.emp === preview);
  const rows = employeeRows(pd, rule);
  const dl = (kind: string) => hrefWith(sp, "/api/export", { kind });
  const atts = (await store.loadAttachments(d.f.filter.from, d.f.filter.to)).filter((a) => a.name === preview);
  const exceptions = exceptionRows(days, emps);
  const empLink = (emp: string) => <a href={`${hrefWith(sp, "/upload", { tab: "download", preview: emp })}#preview`}>{emp}</a>;

  return (
    <>
      {head}
      <Filters f={d.f}>
        <Suspense><ParamMulti name="emps" label="포함할 직원" allLabel="전체 직원" values={d.picked} options={d.allEmps} /></Suspense>
      </Filters>
      <div className="metrics">
        <Metric label="기간" value={label} />
        <Metric label="직원 수" value={`${emps.length}명`} />
        <Metric label="지각 / 조퇴" value={`${sum("late")} / ${sum("early")}건`} />
        <Metric label="기록 없음" value={`${sum("noRecord")}일`} title="평일인데 출입기록과 하이웍스 근태가 모두 없는 날" />
        <Metric label="확인 필요" value={`${exceptions.length}건`} title="지각·조퇴·기록 없음·태그 누락인 날" />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">{label} 근태현황.xlsx</div>
          <p className="caption">[{label} 전체] 원본 + [요약] + [확인 필요] + 부서별로 묶은 직원 시트. 요약에서 이름을 누르면 시트로 이동</p>
          <a className="btn primary" href={dl("xlsx")}>엑셀 내려받기</a>
        </div>
        <div className="card">
          <div className="card-title">직원별 개별 파일 (ZIP)</div>
          <p className="caption">직원마다 엑셀 파일 1개씩, 개인 확인용</p>
          <a className="btn primary" href={dl("zip")}>ZIP 내려받기</a>
        </div>
      </div>
      <p className="caption" style={{ marginTop: 10 }}>
        근무형태는 특이한 날만 적습니다: 퇴근 기준+{rule.overtimeMin}분 이후면 &apos;연장(시각)&apos;, 주말·공휴일은 &apos;휴일(시각)&apos;,
        출장·교육 날 채운 시각은 &apos;정상출근/정상퇴근&apos;. 출근·퇴근 중 하나만 있는 날은 찍힌 시각을 노란색으로, 기록이 없는 날은
        회색으로 표시하고 사유를 확인 칸에 적습니다. 조출 등 승인 기반 항목은 위의 <b>근태 기입</b> 탭에서 고쳐 주세요.
      </p>

      <h2>확인 필요</h2>
      <div className="card">
        {exceptions.length ? (
          <Table head={[...EXCEPTION_COLUMNS, ""]} tall rows={exceptions.map((r) => [
            r[0], empLink(r[1]), ...r.slice(2),
            <a key="edit" className="btn sm" href={`/sheets?tab=edit&month=${r[2].slice(0, 7)}&emp=${encodeURIComponent(r[1])}`}>기입</a>,
          ])} />
        ) : <span className="muted">확인할 날이 없습니다.</span>}
      </div>

      <h2>직원별 요약</h2>
      <div className="card">
        <Table head={SUMMARY_COLUMNS} numeric={[2, 5, 6, 7, 8, 9, 10, 11, 12]} tall
          rows={summaryRows(summary).map((r) => [empLink(String(r[0])), ...r.slice(1)])} />
      </div>

      <h2 id="preview">시트 미리보기</h2>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <Suspense><ParamSelect name="preview" value={preview} options={emps.map((e) => [e, e])} /></Suspense>
          <b>{pd.length ? `${pd[0].dept} ${preview}` : preview}</b>
          <span className="spacer" />
          <a className="btn sm" href={`/sheets?tab=edit&month=${d.f.filter.from.slice(0, 7)}&emp=${encodeURIComponent(preview)}`}>이 직원 근태 기입</a>
        </div>
        <Table head={SHEET_COLUMNS} rows={rows} tall rowClass={(i) => rowKind(rows[i])} />
        <div className="row" style={{ marginTop: 10 }}>
          <b style={{ fontSize: ".9rem" }}>증빙</b>
          {atts.length ? atts.map((a) => <span key={a.id} className="muted">{a.dayFrom.slice(5)}{a.dayTo !== a.dayFrom ? `~${a.dayTo.slice(5)}` : ""} {a.type} <FileLink a={a} /></span>)
            : <span className="muted">이 기간 첨부된 증빙이 없습니다.</span>}
          <a className="btn sm" href={`/evidence?month=${d.f.filter.from.slice(0, 7)}`}>출장 증빙 관리</a>
        </div>
      </div>
    </>
  );
}
