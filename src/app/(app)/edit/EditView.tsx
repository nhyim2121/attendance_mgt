/** 직원별 근태 > 근태 기입 탭: 직원·월을 골라 날짜별 출퇴근 시각, 근무형태(조출·연장 등), 근무지, 인원, 업무내용을 직접 기입·수정. */
import { Suspense } from "react";
import { ParamSelect } from "@/components/ParamControls";
import { NoData } from "@/components/ui";
import { isHoliday } from "@/lib/analytics";
import { computeDays, getHolidays, getRecords, getRule, loadBase, type SearchParams } from "@/lib/data";
import { employeeRows, SHEET_COLUMNS } from "@/lib/splitter";
import { daysInMonth, makeDate, shortKst, weekday, weekdayKr } from "@/lib/time";
import PrintButton from "@/components/PrintButton";
import Editor, { type EditRow } from "./Editor";
import { Kinds, rowTone } from "./kinds";

const C = (name: string) => SHEET_COLUMNS.indexOf(name);

export default async function EditView({ sp }: { sp: SearchParams }) {
  const [rule, base, holidays] = await Promise.all([getRule(), loadBase(), getHolidays()]);
  const head = (
    <>
      <p className="caption noprint">캡스·하이웍스로 채워지지 않은 조출·연장·출장 시각이나 근무지, 같이 근무한 인원, 업무내용을 직접 적습니다. 저장하면 대시보드와 엑셀에 바로 반영되고, 누가 언제 고쳤는지 남습니다.</p>
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
  const dayOf = new Map(mine.map((d) => [d.day, d]));
  const me = base.employees.find((e) => e.name === emp);
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
      // 근무지·인원 칸에는 직접 기입한 값만. 일일 근태 보고서·하이웍스에서 자동으로 채워지는 값은 회색 안내로만 보여 준다.
      place: o?.place ?? "", note: o?.note ?? "", work: o?.work ?? "",
      placeHint: r[0]?.[C("근무지")] ?? "", noteHint: r[0]?.[C("비고")] ?? "",
      workHint: dayOf.get(d)?.leaveContent?.split("\n")[0] ?? "",
      holiday: isHoliday(d, rule, holidays),
      kinds: kindsOf(dayOf.get(d), outs?.[C("근무형태")] ?? "", isHoliday(d, rule, holidays), ins?.[C("근무형태")] ?? ""),
      edited: o ? `${o.editedBy} ${shortKst(o.editedAt)}` : "",
    };
  });

  // 인쇄에는 근무한 날만 (출퇴근 기록이나 근태·근무지·인원·업무내용이 있는 날)
  const printRows = rows.filter((r) => r.clock_in || r.clock_out || r.kinds.length || r.place || r.note || r.work || r.placeHint);
  // 인원 칸에는 직원 이름만. 그 밖의 글(하이웍스 사유 등)은 업무내용 쪽으로
  const allNames = new Set(base.employees.map((e) => e.name));
  const split = (note: string) => {
    const w = note.split(/[\s,·/]+/).filter(Boolean);
    return { names: w.filter((x) => allNames.has(x)).join(" "), rest: w.every((x) => allNames.has(x)) ? "" : note };
  };

  return (
    <>
      {head}
      <div className="filters noprint">
        <Suspense>
          <ParamSelect name="month" label="월" value={month} options={months.map((x) => [x, x])} />
          <ParamSelect name="emp" label="직원" value={emp} options={names.map((x) => [x, x])} />
        </Suspense>
        <span className="spacer" />
        <a className="btn primary" style={{ alignSelf: "flex-end" }}
          href={`/api/export?kind=one&month=${month}&emp=${encodeURIComponent(emp)}`}>엑셀 저장</a>
        <span style={{ alignSelf: "flex-end" }}><PrintButton label="PDF 저장 / 인쇄" /></span>
      </div>
      {/* 인쇄·PDF용: 입력칸 대신 표 (A4 세로 한 장) */}
      <div className="print-only doc-page edit-print">
        <div className="ep-head">
          <img src="/logo.png" alt="" className="ep-logo" />
          <div>
            <h1 className="ep-name">{[me?.dept || mine[0]?.dept, me?.rank, emp].filter(Boolean).join(" ")}</h1>
            <div className="ep-period">{y}년 {m}월 1일 ~ {m}월 {n}일 근태</div>
          </div>
          <div className="ep-sum">
            {(["휴일근무", "연장근무", "조기출근", "출장", "교육"] as const).map((k) => {
              const c = rows.filter((r) => r.kinds.includes(k)).length;
              return c ? <span key={k} className={`tag t-${k}`}>{k} {c}일</span> : null;
            })}
            {(() => {
              const c = rows.filter((r) => rowTone(r) === "tone-leave").length;
              return c ? <span className="tag t-연차">휴가 {c}일</span> : null;
            })()}
          </div>
        </div>
        <table className="doc-tbl full ep-tbl">
          <colgroup>
            <col style={{ width: "6%" }} /><col style={{ width: "4%" }} /><col style={{ width: "12%" }} />
            <col style={{ width: "6.5%" }} /><col style={{ width: "9%" }} /><col style={{ width: "6.5%" }} /><col style={{ width: "9%" }} />
            <col style={{ width: "14%" }} /><col style={{ width: "14%" }} /><col style={{ width: "19%" }} />
          </colgroup>
          <thead><tr><th>일자</th><th>요일</th><th>근태 구분</th><th>출근</th><th>출근 형태</th><th>퇴근</th><th>퇴근 형태</th><th>근무지</th><th>인원</th><th>업무내용</th></tr></thead>
          <tbody>{printRows.map((r) => (
            <tr key={r.day} className={`${rowTone(r)}${r.holiday ? " we" : ""}`}>
              <td>{+r.day.slice(5, 7)}/{+r.day.slice(8)}</td><td className={r.holiday ? "hol" : ""}>{r.wd}</td><td><Kinds r={r} /></td>
              <td>{r.clock_in.slice(0, 5)}</td><td className={tyCls(r.in_type)}>{shortType(r.in_type)}</td>
              <td>{r.clock_out.slice(0, 5)}</td><td className={tyCls(r.out_type)}>{shortType(r.out_type)}</td>
              <td className="wrap">{r.place || r.placeHint}</td><td className="wrap">{split(r.note || r.noteHint).names}</td>
              <td className="wrap">{r.work || <span className="muted">{split(r.note || r.noteHint).rest || r.workHint}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="caption" style={{ marginTop: 6 }}>
          근무한 날 {printRows.length}일만 표시 · <span className="tag t-휴일근무">휴일근무</span> <span className="tag t-연장근무">연장근무</span> <span className="tag t-조기출근">조기출근</span> 줄은 색으로 표시 · 출력 {shortKst(new Date().toISOString())} · 근태관리통합시스템 · 주식회사 에쓰엔
        </p>
      </div>
      <div className="card noprint">
        <div className="card-title">{mine[0]?.dept} {emp} · {y}년 {m}월</div>
        <Editor key={`${emp}|${month}|${rows.map((r) => r.edited).join()}`} employee={emp} rows={rows}
          staff={base.employees.filter((e) => (!e.leaveDate || e.leaveDate >= `${month}-01`) && (!e.joinDate || e.joinDate <= `${month}-31`)).map((e) => e.name)} />
        <p className="caption" style={{ marginTop: 10 }}>
          시각을 직접 넣은 행은 엑셀의 인증 칸에 &apos;수기입력&apos;으로 표시됩니다. 근무형태를 비워 두면 기준에 따라 자동으로 적고, 지우고 저장하면 빈칸으로 고정됩니다.
        </p>
      </div>
    </>
  );
}

const tyCls = (v: string) => (v.startsWith("연장") ? "ty-ot" : v.startsWith("휴일") ? "ty-hol" : v.startsWith("조출") ? "ty-early" : "");

/** 그날 근태 구분: 휴가·출장 등 근태 종류 + 휴일근무(공휴일·주말에 일한 날만) + 조기출근(조출을 직접 적은 날) + 연장근무 */
function kindsOf(d: { leave: string; in: number | null; out: number | null } | undefined, outType: string, redDay: boolean, inType = ""): string[] {
  const out = (d?.leave ?? "").split(",").map((x) => x.trim()).filter(Boolean).filter((x) => x !== "휴일근무" && x !== "연장근무");
  // 휴일근무는 빨간날(공휴일·주말)에 출퇴근했거나 휴일근무로 적힌 경우만. 평일은 휴일근무로 적혀 있어도 붙이지 않는다.
  if (redDay && ((d && (d.in !== null || d.out !== null)) || (d?.leave ?? "").includes("휴일근무"))) out.push("휴일근무");
  if (inType.startsWith("조출")) out.push("조기출근");
  if (outType.startsWith("연장") || (d?.leave ?? "").includes("연장근무")) out.push("연장근무");
  return [...new Set(out)];
}
/** 인쇄용 짧은 근무형태: '휴일(08:30)' -> '휴일 08:30' (괄호 때문에 줄이 넘어가지 않게) */
const shortType = (v: string) => v.replace(/\(([^)]*)\)/, " $1");
