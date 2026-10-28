/** 근태 기입: 직원·월을 골라 날짜별 출퇴근 시각, 근무형태(조출·연장 등), 근무지, 비고를 직접 기입·수정. */
import { Suspense } from "react";
import { ParamSelect } from "@/components/ParamControls";
import { NoData } from "@/components/ui";
import { computeDays, getRecords, getRule, loadBase, type SearchParams } from "@/lib/data";
import { employeeRows, SHEET_COLUMNS } from "@/lib/splitter";
import { daysInMonth, makeDate, shortKst, weekday, weekdayKr } from "@/lib/time";
import Editor, { type EditRow } from "./Editor";

export const metadata = { title: "근태 기입 · 근태관리통합시스템" };
const C = (name: string) => SHEET_COLUMNS.indexOf(name);

export default async function EditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [rule, base] = await Promise.all([getRule(), loadBase()]);
  const head = (
    <>
      <h1>근태 기입</h1>
      <p className="caption">캡스·하이웍스로 채워지지 않은 조출·연장·출장 시각이나 근무지, 비고를 직접 적습니다. 저장하면 대시보드와 직원별 시트(엑셀)에 바로 반영되고, 누가 언제 고쳤는지 남습니다.</p>
    </>
  );
  if (!base.months.length) return <>{head}<NoData /></>;

  const months = base.months.map((m) => m.month).reverse();
  const month = months.includes(String(sp.month)) ? String(sp.month) : months[0];
  const [y, m] = month.split("-").map(Number);
  const n = daysInMonth(month);
  const records = await getRecords(`${month}-01`, `${month}-${String(n).padStart(2, "0")}`);
  const present = new Set(records.map((r) => r.emp));
  let names = base.roster.map((r) => r.name).filter((x) => present.has(x));
  if (!names.length) names = [...present].sort();
  const emp = names.includes(String(sp.emp)) ? String(sp.emp) : names[0];

  const days = await computeDays(records, rule);
  const mine = days.filter((d) => d.emp === emp);
  const sheet = employeeRows(mine, rule);
  const status = new Map(mine.map((d) => [d.day, d.status]));
  const ov = new Map(base.overrides.filter((o) => o.employee === emp && o.day.startsWith(month)).map((o) => [o.day, o]));

  // 날짜별 한 줄로 정리 (달력의 모든 날짜)
  const rows: EditRow[] = Array.from({ length: n }, (_, i) => {
    const d = makeDate(y, m, i + 1)!;
    const r = sheet.filter((x) => x[C("발생일자")] === d);
    const ins = r.find((x) => x[C("모드")] === "출근"), outs = r.find((x) => x[C("모드")] === "퇴근");
    const o = ov.get(d);
    return {
      day: d, wd: weekdayKr(d), status: status.get(d) ?? (weekday(d) >= 5 ? "휴일" : ""),
      clock_in: ins?.[C("발생시각")] ?? "", in_type: ins?.[C("근무형태")] ?? "",
      clock_out: outs?.[C("발생시각")] ?? "", out_type: outs?.[C("근무형태")] ?? "",
      place: r[0]?.[C("근무지")] ?? "", note: r[0]?.[C("비고")] ?? "",
      edited: o ? `${o.editedBy} ${shortKst(o.editedAt)}` : "",
    };
  });

  return (
    <>
      {head}
      <div className="filters">
        <Suspense>
          <ParamSelect name="month" label="월" value={month} options={months.map((x) => [x, x])} />
          <ParamSelect name="emp" label="직원" value={emp} options={names.map((x) => [x, x])} />
        </Suspense>
      </div>
      <div className="card">
        <div className="card-title">{mine[0]?.dept} {emp} · {y}년 {m}월</div>
        <Editor key={`${emp}|${month}|${rows.map((r) => r.edited).join()}`} employee={emp} rows={rows} />
        <p className="caption" style={{ marginTop: 10 }}>
          시각을 직접 넣은 행은 엑셀의 인증 칸에 &apos;수기입력&apos;으로 표시됩니다. 근무형태를 비워 두면 기준에 따라 자동으로 적고, 지우고 저장하면 빈칸으로 고정됩니다.
        </p>
      </div>
    </>
  );
}
