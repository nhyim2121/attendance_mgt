/** 직원별 시트로 나눈 엑셀/ZIP 만들기 (수작업 양식과 같은 모양). */
import { Suspense } from "react";
import Filters, { hrefWith } from "@/components/Filters";
import { ParamMulti, ParamSelect } from "@/components/ParamControls";
import { Metric, Msg, NoData, Table } from "@/components/ui";
import type { SearchParams } from "@/lib/data";
import { employeeRows, SHEET_COLUMNS, SUMMARY_COLUMNS } from "@/lib/splitter";
import { sheetData, summaryRows } from "./compute";
import { rowClass } from "./rowClass";

export const metadata = { title: "직원별 시트 · 근태관리통합시스템" };

export default async function SheetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const d = await sheetData(sp);
  if (!d.f) return <><h1>직원별 시트</h1><NoData /></>;
  if (d.empty) return <><h1>직원별 시트</h1><Filters f={d.f} /><Msg kind="warn">필터 조건에 맞는 기록이 없습니다.</Msg></>;

  const { rule, days, summary, emps, label } = d;
  const sum = (k: "late" | "early" | "noRecord") => summary.reduce((s, x) => s + x[k], 0);
  const preview = emps.includes(String(sp.preview)) ? String(sp.preview) : emps[0];
  const pd = days.filter((x) => x.emp === preview);
  const rows = employeeRows(pd, rule);
  const dl = (kind: string) => hrefWith(sp, "/api/export", { kind });

  return (
    <>
      <h1>직원별 시트</h1>
      <Filters f={d.f}>
        <Suspense><ParamMulti name="emps" label="포함할 직원" allLabel="전체 직원" values={d.picked} options={d.allEmps} /></Suspense>
      </Filters>
      <div className="metrics">
        <Metric label="기간" value={label} />
        <Metric label="직원 수" value={`${emps.length}명`} />
        <Metric label="지각 / 조퇴" value={`${sum("late")} / ${sum("early")}건`} />
        <Metric label="기록 없음" value={`${sum("noRecord")}일`} title="평일인데 출입기록과 하이웍스 근태가 모두 없는 날" />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">{label} 근태현황.xlsx</div>
          <p className="caption">[{label} 전체] 원본 + [요약] + 직원별 시트</p>
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
        출장·교육 날 채운 시각은 &apos;정상출근/정상퇴근&apos;. 근무기록이 없거나 출근·퇴근 중 하나만 있는 날은 날짜·요일만 적고
        비워 둡니다. 조출 등 승인 기반 항목은 <b>근태 기입</b>에서 고쳐 주세요.
      </p>

      <h2>직원별 요약</h2>
      <div className="card">
        <Table head={SUMMARY_COLUMNS} rows={summaryRows(summary)} numeric={[2, 5, 6, 7, 8, 9, 10, 11, 12]} tall />
      </div>

      <h2>시트 미리보기</h2>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <Suspense><ParamSelect name="preview" value={preview} options={emps.map((e) => [e, e])} /></Suspense>
          <b>{pd.length ? `${pd[0].dept} ${preview}` : preview}</b>
        </div>
        <Table head={SHEET_COLUMNS} rows={rows} tall rowClass={(i) => rowClass(rows[i])} />
      </div>
    </>
  );
}
