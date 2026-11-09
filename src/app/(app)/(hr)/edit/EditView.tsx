/** 직원별 근태 > 근태 기입 탭: 직원·월을 골라 날짜별 출퇴근 시각, 근무형태(조출·연장 등), 근무지, 인원, 업무내용을 직접 기입·수정. */
import { Suspense } from "react";
import { ParamMulti, ParamSelect } from "@/components/ParamControls";
import { NoData } from "@/components/ui";
import { isHoliday } from "@/lib/인사노무/analytics";
import { computeDays, getHolidays, getRecords, getRule, loadBase, type SearchParams } from "@/lib/인사노무/data";
import { employeeRows, SHEET_COLUMNS } from "@/lib/인사노무/splitter";
import { daysInMonth, makeDate, shortKst, weekdayKr } from "@/lib/time";
import PrintButton from "@/components/PrintButton";
import { splitReportTypes } from "@/lib/인사노무/daily";
import { VACATION_TYPES } from "@/lib/인사노무/vacation";
import * as store from "@/lib/store";
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
  // 그 달 캡스 기록이 있는 직원 + 기록이 없어도 직접 기입한 날이 있거나 직원별 근무 기준(도제 등)이 있는 재직자
  const typedIn = new Set(base.overrides.filter((o) => o.day.startsWith(month)).map((o) => o.employee));
  const employed = new Set(base.employees.filter((e) => (!e.leaveDate || e.leaveDate >= `${month}-01`) && (!e.joinDate || e.joinDate <= `${month}-31`)).map((e) => e.name));
  let names = base.roster.map((r) => r.name).filter((x) => present.has(x) || (employed.has(x) && (typedIn.has(x) || !!rule.byEmp?.[x])));
  if (!names.length) names = [...present].sort();
  const emp = names.includes(String(sp.emp)) ? String(sp.emp) : names[0];

  const days = await computeDays(records, rule);
  const rep = (await store.loadReportRows()).filter((r) => r.day?.startsWith(month) || r.section === "휴일근무");
  // 인원 칸에는 직원 이름만. 그 밖의 글(하이웍스 사유 등)은 업무내용 쪽으로
  const allNames = new Set(base.employees.map((e) => e.name));
  const split = (note: string) => {
    const w = note.split(/[\s,·/]+/).filter(Boolean);
    return { names: w.filter((x) => allNames.has(x)).join(" "), rest: w.every((x) => allNames.has(x)) ? "" : note };
  };

  /** 직원 한 명의 그 달 근태 기입 행과 인쇄용 값 */
  const build = (emp: string) => {
    const mine = days.filter((d) => d.emp === emp);
    const sheet = employeeRows(mine, rule);
    const status = new Map(mine.map((d) => [d.day, d.status]));
    const dayOf = new Map(mine.map((d) => [d.day, d]));
    const me = base.employees.find((e) => e.name === emp);
    const ov = new Map(base.overrides.filter((o) => o.employee === emp && o.day.startsWith(month)).map((o) => [o.day, o]));
    // 인쇄용 휴가 내용: 일일 근태 보고서·휴가 등록·하이웍스의 휴가. 같은 사유는 '반반차, 외출: 사유 시간'으로 묶는다
    const vacBy = new Map<string, Map<string, string[]>>();
    for (const l of base.leaves) {
      if (l.name !== emp || !l.day.startsWith(month) || !VACATION_TYPES.includes(l.type)) continue;
      const content = String(l.content).split("\n").map((x) => x.trim()).filter((x) => x && x !== l.type).join(" ");
      const m = vacBy.get(l.day) ?? new Map<string, string[]>();
      m.set(content, [...new Set([...(m.get(content) ?? []), l.type])]);
      vacBy.set(l.day, m);
    }
    const vacText = new Map([...vacBy].map(([d, m]) =>
      [d, [...m].map(([c, ts]) => (c ? `${ts.join(", ")}: ${c}` : ts.join(", "))).join(" / ")]));

    // 일일 근태 보고서에서 그 직원·날짜의 근무지·업무내용·인원 (근태현황 줄, 휴일 근태 줄)
    const fromReport = new Map<string, { place: string; work: string; mates: string[] }>();
    const add = (d: string, place: string, work: string, mates: string[]) => {
      const cur = fromReport.get(d) ?? { place: "", work: "", mates: [] };
      fromReport.set(d, {
        place: cur.place || place, work: [cur.work, work].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(" / "),
        mates: [...new Set([...cur.mates, ...mates])],
      });
    };
    const sameAtt = (a: (typeof rep)[number], b: (typeof rep)[number]) => a.day === b.day && a.section === "근태" && b.section === "근태"
      && a.types === b.types && a.title === b.title && a.detail === b.detail && a.note === b.note;
    for (const r of rep.filter((x) => x.name === emp)) {
      if (r.section === "근태" && r.day?.startsWith(month)) {
        add(r.day, r.title.trim(), r.detail.trim(), rep.filter((x) => x.name !== emp && sameAtt(x, r)).map((x) => x.name));
      } else if (r.section === "휴일근무") {
        for (const d of splitReportTypes(r.types).filter((x) => x.startsWith(month))) {
          const mates = rep.filter((x) => x.section === "휴일근무" && x.name !== emp && x.title === r.title && splitReportTypes(x.types).includes(d));
          add(d, "", r.title.trim(), mates.map((x) => x.name));
        }
      }
    }

    // 날짜별 한 줄로 정리 (달력의 모든 날짜)
    const rows: EditRow[] = Array.from({ length: n }, (_, i) => {
      const d = makeDate(y, m, i + 1)!;
      const r = sheet.filter((x) => x[C("발생일자")] === d);
      const ins = r.find((x) => x[C("모드")] === "출근"), outs = r.find((x) => x[C("모드")] === "퇴근");
      const o = ov.get(d);
      return {
        // 출퇴근 시각이 하나도 없는 날은 하이웍스·보고서에 휴일근무로 올라 있어도 휴일근무로 보이지 않는다
        day: d, wd: weekdayKr(d),
        status: status.get(d) === "휴일근무" && !ins?.[C("발생시각")] && !outs?.[C("발생시각")] ? "휴일"
          : status.get(d) ?? (isHoliday(d, rule, holidays, emp) ? "휴일" : ""),
        // 근무형태는 자동(휴일·연장, 직접 고친 값이 있으면 그 값). 근무지·인원·업무내용만 직접 입력한 값
        clock_in: ins?.[C("발생시각")] ?? "", in_type: ins?.[C("근무형태")] ?? "",
        clock_out: outs?.[C("발생시각")] ?? "", out_type: outs?.[C("근무형태")] ?? "",
        inAuto: ins?.[C("근무형태")] ?? "", outAuto: outs?.[C("근무형태")] ?? "",
        // 근무지·인원·업무내용: 직접 기입한 값 > 일일 근태 보고서에 적은 값 (하이웍스 등 그 밖의 자동 값은 넣지 않음)
        place: o?.place ?? fromReport.get(d)?.place ?? "", note: o?.note ?? fromReport.get(d)?.mates.join(" ") ?? "",
        work: o?.work ?? fromReport.get(d)?.work ?? "", work_ot: o?.workOt ?? "",
        fromRep: [
          ...(o?.place == null && fromReport.get(d)?.place ? ["place"] : []),
          ...(o?.note == null && fromReport.get(d)?.mates.length ? ["note"] : []),
          ...(o?.work == null && fromReport.get(d)?.work ? ["work"] : []),
        ],
        placeHint: r[0]?.[C("근무지")] ?? "", noteHint: r[0]?.[C("비고")] ?? "",
        workHint: dayOf.get(d)?.leaveContent?.split("\n")[0] ?? "",
        holiday: isHoliday(d, rule, holidays, emp),
        kinds: kindsOf(dayOf.get(d), outs?.[C("근무형태")] ?? "", isHoliday(d, rule, holidays, emp), ins?.[C("근무형태")] ?? ""),
        edited: o ? `${o.editedBy} ${shortKst(o.editedAt)}` : "",
      };
    });

    // 인쇄·PDF의 근무지·인원·업무내용은 근태 기입에 직접 적은 값만 (일일 근태 보고서·하이웍스 자동 값은 넣지 않음)
    const typed = (d: string) => {
      const o = ov.get(d);
      return { place: o?.place ?? "", note: o?.note ?? "", work: o?.work ?? "", work_ot: o?.workOt ?? "" };
    };
    // 인쇄에는 근무한 날만 (출퇴근 기록이나 근태가 있거나 직접 적은 내용이 있는 날)
    const printRows = rows.filter((r) => r.clock_in || r.clock_out || r.kinds.length || Object.values(typed(r.day)).some(Boolean));
    return { mine, me, rows, typed, printRows, vacText };
  };
  const { mine, rows } = build(emp);
  // 여러 명 한꺼번에 인쇄·저장: 고른 직원(주소 pick)마다 한 장씩
  const pick = String(sp.pick ?? "").split(",").filter((x) => names.includes(x));
  const pickQ = names.filter((x) => pick.includes(x));

  /** 인쇄·PDF용 한 장: 입력칸 대신 표 (A4 한 장) */
  const printPage = (emp: string) => {
    const { mine, me, rows, typed, printRows, vacText } = build(emp);
    return (
      <div key={emp} className="print-only doc-page edit-print">
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
          <div className="ep-sign">
            <table className="doc-sign"><tbody>
              <tr><th rowSpan={2}>결<br />재</th><td>담당</td><td>확인</td></tr>
              <tr><td /><td /></tr>
            </tbody></table>
            <div className="ep-confirm">위 근태 내용에 이상이 없음을 확인합니다.</div>
          </div>
        </div>
        <table className="doc-tbl full ep-tbl">
          <colgroup>
            <col style={{ width: "5.5%" }} /><col style={{ width: "3.5%" }} /><col style={{ width: "11%" }} />
            <col style={{ width: "7.5%" }} /><col style={{ width: "8.5%" }} /><col style={{ width: "7.5%" }} /><col style={{ width: "8.5%" }} />
            <col style={{ width: "12%" }} /><col style={{ width: "13%" }} /><col style={{ width: "23%" }} />
          </colgroup>
          <thead><tr><th>일자</th><th>요일</th><th>근태 구분</th><th>출근</th><th>출근 형태</th><th>퇴근</th><th>퇴근 형태</th><th>근무지</th><th>인원</th><th>업무내용</th></tr></thead>
          <tbody>{printRows.map((r) => (
            <tr key={r.day} className={`${rowTone(r)}${r.holiday ? " we" : ""}`}>
              <td>{+r.day.slice(5, 7)}/{+r.day.slice(8)}</td><td className={r.holiday ? "hol" : ""}>{r.wd}</td><td><Kinds r={r} /></td>
              <td>{r.clock_in}</td><td className={tyCls(r.in_type || r.inAuto)}>{shortType(r.in_type || r.inAuto)}</td>
              <td>{r.clock_out}</td><td className={tyCls(r.out_type || r.outAuto)}>{shortType(r.out_type || r.outAuto)}</td>
              <td className="wrap">{typed(r.day).place}</td><td className="wrap">{split(typed(r.day).note).names}</td>
              <td className="wrap">{vacText.get(r.day) && <div className="ep-vac">{vacText.get(r.day)}</div>}{typed(r.day).work || split(typed(r.day).note).rest}
                {/* 연장 업무 칸은 없앴으므로, 적어 둔 연장 업무는 업무내용 아래에 붙인다 (업무내용과 같으면 생략) */}
                {typed(r.day).work_ot && typed(r.day).work_ot !== typed(r.day).work && <div>연장: {typed(r.day).work_ot}</div>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      {head}
      <div className="filters noprint">
        <Suspense>
          <ParamSelect name="month" label="월" value={month} options={months.map((x) => [x, x])} />
          <ParamSelect name="emp" label="직원" value={emp} options={names.map((x) => [x, x])} />
          <span style={{ alignSelf: "flex-end" }}>
            <ParamMulti name="pick" values={pickQ} options={names} label="여러 명 저장·인쇄" allLabel="선택 안 함" />
          </span>
        </Suspense>
        {pickQ.length > 0 && <span className="caption" style={{ alignSelf: "flex-end", margin: 0 }}>
          고른 {pickQ.length}명을 한 사람씩 한 장에 인쇄하고, 엑셀은 한 사람씩 파일로 묶어(ZIP) 받습니다.</span>}
        <span className="spacer" />
        <a className="btn primary" style={{ alignSelf: "flex-end" }}
          href={pickQ.length
            ? `/api/export?kind=zip&month=${month}&emps=${encodeURIComponent(pickQ.join(","))}`
            : `/api/export?kind=one&month=${month}&emp=${encodeURIComponent(emp)}`}>
          {pickQ.length ? `엑셀 저장 (${pickQ.length}명)` : "엑셀 저장"}</a>
        <span style={{ alignSelf: "flex-end" }}><PrintButton label={pickQ.length ? `PDF 저장 / 인쇄 (${pickQ.length}명)` : "PDF 저장 / 인쇄"} /></span>
      </div>
      {(pickQ.length ? pickQ : [emp]).map(printPage)}
      <div className="card noprint">
        <div className="card-title">{mine[0]?.dept} {emp} · {y}년 {m}월</div>
        <Editor key={`${emp}|${month}`} employee={emp} rows={rows}
          staff={base.employees.filter((e) => (!e.leaveDate || e.leaveDate >= `${month}-01`) && (!e.joinDate || e.joinDate <= `${month}-31`)).map((e) => e.name)} />
        <p className="caption" style={{ marginTop: 10 }}>
          시각을 직접 넣은 행은 엑셀의 인증 칸에 &apos;수기입력&apos;으로 표시됩니다. 근무형태(휴일·연장)는 기준에 따라 자동으로 적고, 고쳐 쓰면 그 값이 저장됩니다. 근무지·인원·업무내용은 일일 근태 보고서에 적은 값이 <span style={{ color: "#0c3994", fontWeight: 700 }}>파란 글씨</span>로 들어오고, 고쳐 쓰면 근태 기입 값으로 저장됩니다.
        </p>
      </div>
    </>
  );
}

const tyCls = (v: string) => (v.startsWith("연장") ? "ty-ot" : v.startsWith("휴일") ? "ty-hol" : v.startsWith("조출") ? "ty-early" : "");

/** 그날 근태 구분: 휴가·출장 등 근태 종류 + 휴일근무(공휴일·주말에 출퇴근 기록이 있는 날만) + 조기출근(조출을 직접 적은 날) + 연장근무 */
function kindsOf(d: { leave: string; in: number | null; out: number | null } | undefined, outType: string, redDay: boolean, inType = ""): string[] {
  const out = (d?.leave ?? "").split(",").map((x) => x.trim()).filter(Boolean).filter((x) => x !== "휴일근무" && x !== "연장근무");
  // 휴일근무는 빨간날(공휴일·주말)에 출퇴근 기록이 있는 경우만. 휴일근무로 적혀만 있고 기록이 없으면 붙이지 않는다.
  const leave = d?.leave ?? "";
  if (redDay && d && (d.in !== null || d.out !== null)) out.push("휴일근무");
  if (inType.startsWith("조출")) out.push("조기출근");
  if (outType.startsWith("연장") || leave.includes("연장근무")) out.push("연장근무");
  return [...new Set(out)];
}
/** 인쇄용 짧은 근무형태: '휴일(08:30)' -> '휴일 08:30' (괄호 때문에 줄이 넘어가지 않게) */
const shortType = (v: string) => v.replace(/\(([^)]*)\)/, " $1");
