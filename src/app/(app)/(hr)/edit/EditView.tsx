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
import { kindsOf, proofOf } from "@/lib/인사노무/proof";
import { noProofFor } from "@/lib/config";
import Editor, { type EditRow } from "./Editor";
import { Kinds, rowTone, kindCls, isLeaveText } from "./kinds";
import { activeNames } from "@/lib/인사노무/employees";
import Link from "next/link";

const C = (name: string) => SHEET_COLUMNS.indexOf(name);

export default async function EditView({ sp, mode = "table" }: { sp: SearchParams; mode?: "table" | "cal" }) {
  const cal = mode === "cal";
  const [rule, base, holidays] = await Promise.all([getRule(), loadBase(), getHolidays()]);
  const head = (
    <>
      {cal ? <p className="caption noprint">전 직원의 휴일근무·연장근무를 한 달력에 모았습니다. 날짜마다 그날 근무한 사람이 보이고, 날짜를 누르면 오른쪽에 시각·근무지·업무내용·신청서가 나옵니다. 고칠 때는 이름 옆 [고치기]로 근태 기입에 들어갑니다.</p>
      : <p className="caption noprint">캡스·하이웍스로 채워지지 않은 조출·연장·출장 시각이나 근무지, 같이 근무한 인원, 업무내용을 직접 적습니다. 저장하면 대시보드와 엑셀에 바로 반영되고, 누가 언제 고쳤는지 남습니다.</p>}
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
  const employed = new Set(base.employees.filter((e) => activeNames([e], `${month}-01`, `${month}-31`).length > 0).map((e) => e.name));
  let names = base.roster.map((r) => r.name).filter((x) => present.has(x) || (employed.has(x) && (typedIn.has(x) || !!rule.byEmp?.[x])));
  if (!names.length) names = [...present].sort();
  const emp = names.includes(String(sp.emp)) ? String(sp.emp) : names[0];

  const days = await computeDays(records, rule);
  const atts = await store.loadAttachments(`${month}-01`, `${month}-${String(n).padStart(2, "0")}`);
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
    // 휴가 (2026-11-11): 근태 구분 = 종류만, 근무형태 = 시각(반차(13:30)), 사유 = 업무내용.
    // 근무지·인원 칸에 들어간 휴가 글(외출, 개인사유, 16:30~17:30 등)은 뺀다
    const leaveWords = new Map<string, Set<string>>();
    for (const r of rep) if (r.name === emp && r.section === "근태" && r.day?.startsWith(month) && isLeaveTypes(r.types)) {
      leaveWords.set(r.day, new Set([...(leaveWords.get(r.day) ?? []), r.title.trim(), r.detail.trim()].filter(Boolean)));
    }
    const noLeave = (d: string, v: string) => {
      const t = v.trim();
      if (!t || !(vacBy.has(d) || leaveWords.has(d))) return v;
      return isLeaveText(t) || /^\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}$/.test(t) || leaveWords.get(d)?.has(t) ? "" : v;
    };

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
        if (isLeaveTypes(r.types)) continue; // 휴가 보고 줄은 근태 구분 칸에만
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
        place: noLeave(d, o?.place ?? fromReport.get(d)?.place ?? ""), note: noLeave(d, o?.note ?? fromReport.get(d)?.mates.join(" ") ?? ""),
        // 업무내용: 직접 적은 값 > 보고서 > 휴가 사유
        work: o?.work ?? (fromReport.get(d)?.work || dayOf.get(d)?.leaveReason || ""), work_ot: o?.workOt ?? "",
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
    }).map((r) => {
      const proof = proofOf(emp, r.day, r.kinds, atts, noProofFor(rule, emp), me?.dept ?? "");
      const files = atts.filter((a) => a.name === emp && a.dayFrom <= r.day && a.dayTo >= r.day).map((a) => ({ id: a.id, fileName: a.fileName, type: a.type }));
      if (!proof.missing.length) return { ...r, proof, files };
      // (2026-11-19 사용자 결정) 신청서가 없어 인정되지 않은 휴일·연장근무·조출은 보이지 않게: 근태 구분·줄 색·자동 근무형태에서 뺀다.
      // 직접 적은 근무형태는 그대로 두고, 첨부 칸의 [☐ 신청서] 버튼으로 언제든 인정할 수 있다.
      const o = ov.get(r.day);
      const pre = proof.missing.map((k) => (k === "휴일근무" ? "휴일" : k === "연장근무" ? "연장" : "조출"));
      const strip = (v: string, typed: string | null | undefined) => (typed == null && pre.some((p) => v.startsWith(p)) ? "" : v);
      const kinds = r.kinds.filter((k) => !proof.missing.includes(k));
      return {
        ...r, proof, files, kinds,
        status: proof.missing.includes(r.status) ? (r.holiday ? "휴일" : "정상") : r.status,
        in_type: strip(r.in_type, o?.inType), out_type: strip(r.out_type, o?.outType),
        inAuto: strip(r.inAuto, o?.inType), outAuto: strip(r.outAuto, o?.outType),
      };
    });

    // 인쇄·PDF의 근무지·인원·업무내용은 근태 기입에 직접 적은 값만 (일일 근태 보고서·하이웍스 자동 값은 넣지 않음)
    const typed = (d: string) => {
      const o = ov.get(d);
      return { place: noLeave(d, o?.place ?? ""), note: noLeave(d, o?.note ?? ""), work: o?.work ?? "", work_ot: o?.workOt ?? "" };
    };
    // 인쇄에는 근무한 날만 (출퇴근 기록이나 근태가 있거나 직접 적은 내용이 있는 날)
    const printRows = rows.filter((r) => r.clock_in || r.clock_out || r.kinds.length || Object.values(typed(r.day)).some(Boolean));
    return { mine, me, rows, typed, printRows, dayOf };
  };
  // 휴일·연장 달력 탭 (2026-11-23): 직원 한 명이 아니라 전 직원을 한 달력에
  if (cal) return <>{head}{teamCal()}</>;
  const { mine, rows } = build(emp);
  const empOptions: [string, string][] = names.map((x) => [x, x]);

  /** 전 직원 휴일·연장 달력: 날짜 칸마다 그날 휴일근무·연장근무한 사람, 누르면 오른쪽에 그날 명단과 내용 */
  function teamCal() {
    const WORK = ["휴일근무", "연장근무"];
    type P = { name: string; dept: string; kinds: string[]; miss: string[]; r: EditRow };
    const byDay = new Map<string, P[]>();
    for (const x of names) {
      const dept = base.employees.find((e) => e.name === x)?.dept ?? "";
      for (const r of build(x).rows) {
        const miss = (r.proof?.missing ?? []).filter((k) => WORK.includes(k));
        const kinds = [...new Set([...r.kinds.filter((k) => WORK.includes(k)), ...miss])];
        if (!kinds.length) continue;
        byDay.set(r.day, [...(byDay.get(r.day) ?? []), { name: x, dept, kinds, miss, r }]);
      }
    }
    const all = [...byDay.values()].flat();
    const cnt = (k: string) => all.filter((p) => p.kinds.includes(k)).length;
    const missN = all.filter((p) => p.miss.length).length;
    const people = new Set(all.map((p) => p.name)).size;
    const dayList = [...byDay.keys()].sort();
    const want = String(sp.day ?? "");
    const sel = byDay.has(want) ? want : dayList.find((d) => byDay.get(d)!.some((p) => p.miss.length)) ?? dayList[0] ?? "";
    const today = new Date().toLocaleDateString("sv-SE");
    const WD = ["월", "화", "수", "목", "금", "토", "일"];
    const lead = Math.max(0, WD.indexOf(weekdayKr(makeDate(y, m, 1)!)));
    const href = (d: string) => `/person?month=${month}&day=${d}`;
    const editHref = (x: string) => `/sheets?tab=edit&month=${month}&emp=${encodeURIComponent(x)}`;
    const ps = byDay.get(sel) ?? [];
    const iSel = dayList.indexOf(sel);
    return (
      <>
        <div className="filters noprint">
          <Suspense><ParamSelect name="month" label="월" value={month} options={months.map((x) => [x, x])} /></Suspense>
        </div>
        <div className="ed-cal-sum">
          <span className="tag t-휴일근무">휴일근무 {cnt("휴일근무")}건</span>
          <span className="tag t-연장근무">연장근무 {cnt("연장근무")}건</span>
          <span>· {dayList.length}일 · {people}명</span>
          {missN > 0 && <span className="red"><b>● 신청서 없음 {missN}건</b></span>}
        </div>
        {!dayList.length ? <p className="fd-empty">{y}년 {m}월에는 휴일근무·연장근무가 없습니다.</p> : (
          <div className="ed-cal">
            <div className="ed-cal-grid">
              {WD.map((w) => <div key={w} className={`ed-cal-wd${w === "토" ? " sat" : w === "일" ? " sun" : ""}`}>{w}</div>)}
              {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: n }, (_, i) => {
                const d = makeDate(y, m, i + 1)!;
                const wd = weekdayKr(d);
                const dayCls = wd === "일" || isHoliday(d, rule, holidays) ? "sun" : wd === "토" ? "sat" : "";
                const list = byDay.get(d);
                if (!list) return <div key={d} className={`ed-cal-day off${d === today ? " today" : ""}`}><b className={dayCls}>{i + 1}</b></div>;
                const anyHol = list.some((p) => p.kinds.includes("휴일근무"));
                return (
                  <Link key={d} href={href(d)} scroll={false}
                    className={`ed-cal-day tc-day ${anyHol ? "tone-hol" : "tone-ot"}${d === sel ? " sel" : ""}${d === today ? " today" : ""}`}>
                    <b className={dayCls}>{i + 1}</b>
                    {list.map((p) => (
                      <span key={p.name} className={`tc-name ${p.kinds.includes("휴일근무") ? "h" : "o"}${p.miss.length ? " miss" : ""}`}>
                        {p.miss.length ? "● " : ""}{p.name}
                      </span>
                    ))}
                  </Link>
                );
              })}
            </div>
            <div className="ed-cal-panel">
              <div className="ed-cal-head"><b>{+sel.slice(5, 7)}월 {+sel.slice(8)}일 ({weekdayKr(sel)})</b><span className="caption" style={{ margin: 0 }}>{ps.length}명 근무</span></div>
              {ps.map((p) => (
                <div key={p.name} className="tc-person">
                  <div className="tc-top">
                    <b>{p.name}</b><span className="muted">{p.dept}</span>
                    {p.kinds.map((k) => <span key={k} className={`tag t-${k}`}>{k}</span>)}
                    <Link className="btn tc-edit" href={editHref(p.name)}>고치기</Link>
                  </div>
                  <div className="tc-line ed-cal-t">
                    {p.r.clock_in || "--:--"} ~ {p.r.clock_out || <span className="ed-cal-miss">퇴근 없음</span>}
                    {p.miss.length ? <span className="ed-cal-miss"> · ● 신청서 없음</span> : p.r.proof?.need.length ? <span className="ed-cal-ok"> · ✓ 신청서</span> : null}
                  </div>
                  {(p.r.place || p.r.work) && <div className="tc-line">{[p.r.place, p.r.work].filter(Boolean).join(" · ")}</div>}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                {iSel > 0 ? <Link className="btn" href={href(dayList[iSel - 1])} scroll={false}>‹ 이전 날</Link> : <span className="btn" style={{ opacity: .4 }}>‹ 이전 날</span>}
                {iSel < dayList.length - 1 ? <Link className="btn primary" style={{ flex: 1, textAlign: "center" }} href={href(dayList[iSel + 1])} scroll={false}>다음 근무일 ›</Link>
                  : <span className="btn primary" style={{ flex: 1, textAlign: "center", opacity: .4 }}>다음 근무일 ›</span>}
              </div>
              <p className="caption" style={{ margin: 0 }}>● 빨간 이름 = 신청서가 없어 아직 인정되지 않은 근무. [고치기]를 누르면 그 사람의 근태 기입으로 갑니다.</p>
            </div>
          </div>
        )}
      </>
    );
  }
  // 여러 명 한꺼번에 인쇄·저장: 고른 직원(주소 pick)마다 한 장씩
  const pick = String(sp.pick ?? "").split(",").filter((x) => names.includes(x));
  const pickQ = names.filter((x) => pick.includes(x));

  /** 인쇄·PDF용 한 장: 입력칸 대신 표 (A4 한 장) */
  const printPage = (emp: string) => {
    const { mine, me, rows, typed, printRows, dayOf } = build(emp);
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
            <col style={{ width: "5.5%" }} /><col style={{ width: "3.5%" }} /><col style={{ width: "10%" }} />
            <col style={{ width: "8.5%" }} /><col style={{ width: "9.5%" }} /><col style={{ width: "8.5%" }} /><col style={{ width: "9.5%" }} />
            <col style={{ width: "9%" }} /><col style={{ width: "23%" }} /><col style={{ width: "13%" }} />
          </colgroup>
          <thead><tr><th>일자</th><th>요일</th><th>근태 구분</th><th>출근</th><th>출근 형태</th><th>퇴근</th><th>퇴근 형태</th><th>근무지</th><th>인원</th><th>업무내용</th></tr></thead>
          <tbody>{printRows.map((r) => (
            <tr key={r.day} className={`${rowTone(r)} ${kindCls(r)}${r.holiday ? " we" : ""}`}>
              <td>{+r.day.slice(5, 7)}/{+r.day.slice(8)}</td><td className={r.holiday ? "hol" : ""}>{r.wd}</td><td><Kinds r={r} /></td>
              <td>{r.clock_in}</td><td className={tyCls(r.in_type || r.inAuto)}>{shortType(r.in_type || r.inAuto)}</td>
              <td>{r.clock_out}</td><td className={tyCls(r.out_type || r.outAuto)}>{shortType(r.out_type || r.outAuto)}</td>
              <td className="wrap">{typed(r.day).place}</td><td className="wrap">{split(typed(r.day).note).names}</td>
              <td className="wrap">{typed(r.day).work || split(typed(r.day).note).rest || dayOf.get(r.day)?.leaveReason}
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
          <ParamSelect name="emp" label="직원" value={emp} options={empOptions} />
          {!cal && <span style={{ alignSelf: "flex-end" }}>
            <ParamMulti name="pick" values={pickQ} options={names} label="여러 명 저장·인쇄" allLabel="선택 안 함" />
          </span>}
        </Suspense>
        {!cal && pickQ.length > 0 && <span className="caption" style={{ alignSelf: "flex-end", margin: 0 }}>
          고른 {pickQ.length}명을 한 사람씩 한 장에 인쇄하고, 엑셀은 한 사람씩 파일로 묶어(ZIP) 받습니다.</span>}
        <span className="spacer" />
        {!cal && <><a className="btn primary" style={{ alignSelf: "flex-end" }}
          href={pickQ.length
            ? `/api/export?kind=zip&month=${month}&emps=${encodeURIComponent(pickQ.join(","))}`
            : `/api/export?kind=one&month=${month}&emp=${encodeURIComponent(emp)}`}>
          {pickQ.length ? `엑셀 저장 (${pickQ.length}명)` : "엑셀 저장"}</a>
        <span style={{ alignSelf: "flex-end" }}><PrintButton label={pickQ.length ? `PDF 저장 / 인쇄 (${pickQ.length}명)` : "PDF 저장 / 인쇄"} /></span></>}
      </div>
      {!cal && (pickQ.length ? pickQ : [emp]).map(printPage)}
      <div className="card noprint">
        <div className="card-title">{mine[0]?.dept} {emp} · {y}년 {m}월</div>
        <Editor key={`${emp}|${month}|${mode}`} employee={emp} rows={rows} mode={mode}
          staff={base.employees.filter((e) => activeNames([e], `${month}-01`, `${month}-31`).length > 0).map((e) => e.name)} />
        {!cal && <p className="caption" style={{ marginTop: 10 }}>
          시각을 직접 넣은 행은 엑셀의 인증 칸에 &apos;수기입력&apos;으로 표시됩니다. 근무형태(휴일·연장)는 기준에 따라 자동으로 적고, 고쳐 쓰면 그 값이 저장됩니다. 근무지·인원·업무내용은 일일 근태 보고서에 적은 값이 <span style={{ color: "#0c3994", fontWeight: 700 }}>파란 글씨</span>로 들어오고, 고쳐 쓰면 근태 기입 값으로 저장됩니다.
        </p>}
      </div>
    </>
  );
}

/** 보고서 근태 줄의 종류가 모두 휴가인가 (예: '외출', '반차,외출') */
const isLeaveTypes = (types: string) => !!types.trim() && types.split(/[,\s·/]+/).filter(Boolean).every(isLeaveText);

const tyCls = (v: string) => (v.startsWith("연장") ? "ty-ot" : v.startsWith("휴일") ? "ty-hol" : v.startsWith("조출") ? "ty-early" : "");

/** 인쇄용 짧은 근무형태: '휴일(08:30)' -> '휴일 08:30' (괄호 때문에 줄이 넘어가지 않게) */
const shortType = (v: string) => v.replace(/\(([^)]*)\)/, " $1");
