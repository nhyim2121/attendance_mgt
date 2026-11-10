/** 일일 현황: [출퇴근 현황] 그날 캡스 출퇴근 내역으로 출근·퇴근·지각·휴가·출장·휴일·연장 인원을 자동 집계,
 * [근태 보고서] 연차·출장 등을 입력해 하루치 근태현황 보고서를 만들고 이미지·메일로 보낸다. */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import { Suspense } from "react";
import { hrefWith } from "@/components/Filters";
import { ParamDate } from "@/components/ParamControls";
import { COLORS, Kpi, Msg, Table } from "@/components/ui";
import { boardCounts, type BoardRow, dailyBoard, isHoliday } from "@/lib/인사노무/analytics";
import FileLink from "@/components/FileLink";
import { computeDays, getHolidays, getRecords, getRule, loadBase, type SearchParams, staffOn } from "@/lib/인사노무/data";
import { attachmentsFor } from "@/lib/인사노무/evidence";
import * as store from "@/lib/store";
import { addDays, dayLabelLong, hhmm, isDateStr, nowKst, parseTs, todayKst, tsHM, tsTime } from "@/lib/time";
import ReportView from "../report/ReportView";
import DailyUpload from "./DailyUpload";

export const metadata = { title: "일일 현황 · 근태관리통합시스템" };

function Board({ groups }: { groups: [string, string, [string, string][]][] }) {
  return (
    <div className="board">
      {groups.map(([title, color, people]) => (
        <div key={title} className="board-col" style={{ "--c": color } as React.CSSProperties}>
          <h4>{title}<span>{people.length}명</span></h4>
          {people.length ? people.map(([n, sub], i) => (
            <div key={i} className="chip"><span>{n}</span><small title={sub}>{sub}</small></div>
          )) : <div className="chip"><small>없음</small></div>}
        </div>
      ))}
    </div>
  );
}

export default async function DailyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const isReport = sp.tab === "report";
  const tabs = (
    <div className="tabs">
      <Link href={hrefWith(sp, "/daily", { tab: null })} className={isReport ? "" : "on"} scroll={false}>출퇴근 현황</Link>
      <Link href={hrefWith(sp, "/daily", { tab: "report" })} className={isReport ? "on" : ""} scroll={false}>근태 보고서</Link>
    </div>
  );
  if (isReport) return <><PageHead href={"/daily"} />{tabs}<ReportView sp={sp} /></>;
  const [rule, holidays, base] = await Promise.all([getRule(), getHolidays(), loadBase()]);
  const has = base.months.length > 0;
  const today = todayKst();
  const lastDay = has ? base.months[base.months.length - 1].last_day : today;
  const want = String(sp.day ?? "");
  const day = isDateStr(want) ? want : today <= lastDay ? today : lastDay;

  const head = (
    <>
      <PageHead href={"/daily"} />
      {tabs}
      <Suspense><DailyUpload open={!has} /></Suspense>
    </>
  );
  if (!has) return <>{head}<Msg kind="info">아직 캡스 기록이 없습니다. 위에서 파일을 올려 주세요.</Msg></>;

  const records = await getRecords(addDays(day, -60), day);
  const staff = await staffOn(day, records);
  const picker = (
    <div className="row end" style={{ marginBottom: 14 }}>
      <Suspense><ParamDate name="day" label="기준일" value={day} max={today > lastDay ? today : lastDay} /></Suspense>
      <span className="caption" style={{ margin: 0 }}>캡스 기록: {lastDay}까지</span>
    </div>
  );
  if (!staff.length) {
    return <>{head}{picker}<Msg kind="warn">{day}에 재직 중인 직원이 없습니다. <b>직원 관리</b>에서 직원을 등록해 주세요.</Msg></>;
  }

  // 대상 인원: 직원 관리에 등록되어 그날 재직 중인 사람 (입사일~퇴사일)
  const names = new Set(staff.map(([n]) => n));
  const window = records.filter((r) => names.has(r.emp));
  const holiday = isHoliday(day, rule, holidays);
  const days = await computeDays(window, rule);
  const now = day === today ? parseTs(nowKst()) : null;
  const board = dailyBoard(days, base.leaves, staff, day, rule, now, holiday);
  const cnt = boardCounts(board);
  const hasDay = records.some((r) => r.day === day);
  const atts = await store.loadAttachments(day, day);

  const by = (g: string) => board.filter((b) => b.group === g);
  const sorted = (xs: BoardRow[], k: "in" | "out") => [...xs].sort((a, b) => a[k]! - b[k]!);
  const groups: [string, string, [string, string][]][] = [
    ["출근", COLORS.blue, sorted(board.filter((b) => b.in !== null), "in").map((b) => [b.emp, tsHM(b.in)])],
    ["퇴근", COLORS.gray, sorted(board.filter((b) => b.out !== null), "out").map((b) => [b.emp, tsHM(b.out)])],
    ["지각", COLORS.red, board.filter((b) => b.late && b.in !== null).map((b) => [b.emp, tsTime(b.in!)])],
    ["휴가", COLORS.green, by("휴가").map((b) => [b.emp, b.leave])],
    ["출장·교육", COLORS.violet, by("출장·교육").map((b) => [b.emp, b.leaveContent || b.leave])],
    ["휴일·연장근무", COLORS.amber, board.filter((b) => b.group === "휴일근무" || b.overtime).map((b) =>
      [b.emp, (b.overtime ? "연장 " : "") + (b.leaveContent || (b.group === "휴일근무" ? "휴일근무" : ""))])],
  ];
  const deptOrder = [...new Set([...base.employees.map((e) => e.dept).filter(Boolean), ...board.map((b) => b.dept || "(부서 없음)")])]
    .filter((dp) => board.some((b) => b.group !== "휴무" && (b.dept || "(부서 없음)") === dp));
  const shown = board.filter((b) => b.group !== "휴무"); // 휴일, 또는 그 직원의 근무 요일이 아닌 날(도제의 월·화 등)은 빼고 보인다

  return (
    <>
      {head}
      {picker}
      <div className="topbar">
        <h1 style={{ fontSize: "1.35rem" }}>{dayLabelLong(day)}</h1>
        <div className="meta">
          재직 <b>{staff.length}</b>명
          {holiday && <> · <span style={{ color: COLORS.amber }}>{holidays[day] ?? "주말"} (휴일)</span></>}
          {!hasDay && <> · <span style={{ color: COLORS.red }}>이 날짜의 캡스 기록이 아직 없습니다</span></>}
        </div>
      </div>
      <div className="kpi-row">
        <Kpi label="출근" n={cnt.출근} color={COLORS.blue} sub={holiday ? "휴일 출근" : `재직 ${staff.length}명 중`} />
        <Kpi label="퇴근" n={cnt.퇴근} color={COLORS.gray} sub={now !== null ? `근무 중 ${cnt["근무 중"]}명` : "퇴근 태그 기준"} />
        <Kpi label="지각" n={cnt.지각} color={COLORS.red} sub={`${hhmm(rule.start)} 이후 출근`} />
        <Kpi label="휴가" n={cnt.휴가} color={COLORS.green} sub="연차·반차·반반차·공가·외출" />
        <Kpi label="출장·교육" n={cnt["출장·교육"]} color={COLORS.violet} sub="외근 포함" />
        <Kpi label="휴일·연장" n={cnt.휴일근무 + cnt.연장근무} color={COLORS.amber}
          sub={`휴일 ${cnt.휴일근무} · 연장 ${cnt.연장근무}`} />
      </div>
      <div style={{ height: 16 }} />
      <Board groups={groups} />
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">부서별 출근 현황 <span className="muted" style={{ fontWeight: 400, fontSize: ".85rem" }}>
          🔵 출근 · 🔴 지각 · 🟢 휴가 · 🟣 출장·교육 · ⚪ 기록 없음</span></div>
        {holiday && <p className="caption">휴일이라 출근하지 않은 {by("휴무").length}명은 뺐습니다.</p>}
        <div className="dept-board">
          {deptOrder.map((dp) => {
            const g = shown.filter((b) => (b.dept || "(부서 없음)") === dp)
              .sort((a, b) => toneRank(a) - toneRank(b) || (a.in ?? 1e15) - (b.in ?? 1e15));
            const came = g.filter((b) => b.in !== null).length;
            return (
              <section key={dp} className="dept-box">
                <header><b>{dp}</b><span>출근 <b>{came}</b> / {g.length}명</span></header>
                <div className="dept-bar"><i style={{ width: `${g.length ? (came / g.length) * 100 : 0}%` }} /></div>
                <ul>
                  {g.map((b) => {
                    const t = tone(b);
                    return (
                      <li key={b.emp} className={`dm ${t}`}>
                        <b>{b.emp}</b>
                        <span className="tm">{b.in !== null ? tsHM(b.in) : ""}{b.out !== null ? ` ~ ${tsHM(b.out)}` : ""}</span>
                        <span className="st">{t === "late" ? "지각" : t === "leave" ? b.leave || "휴가" : t === "trip" ? (b.leaveContent || b.leave).split(String.fromCharCode(10))[0] : t === "none" ? "기록 없음" : b.overtime ? "연장" : b.group === "휴일근무" ? "휴일근무" : ""}</span>
                        {attachmentsFor(atts, b.emp, day, day).map((a) => <FileLink key={a.id} a={a} />)}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <details className="fold" style={{ marginTop: 12 }}>
          <summary>표로 보기 (전체 {shown.length}명)</summary>
          <Table head={["부서", "직원", "출근", "퇴근", "상태", "근태", "근무지·사유", "증빙"]} tall
            rows={shown.map((b) => [b.dept, b.emp, tsHM(b.in), tsHM(b.out), b.status, b.leave, b.leaveContent,
              attachmentsFor(atts, b.emp, day, day).map((a) => <FileLink key={a.id} a={a} />)])} />
        </details>
      </div>
    </>
  );
}

/** 부서별 현황판 색: 지각 > 출장·교육 > 휴가 > 기록 없음 > 출근 */
type Tone = "late" | "trip" | "leave" | "none" | "in";
function tone(b: BoardRow): Tone {
  if (b.late && b.in !== null) return "late";
  if (b.group === "출장·교육") return "trip";
  if (b.group === "휴가") return "leave";
  if (b.in === null && b.out === null) return "none";
  return "in";
}
const toneRank = (b: BoardRow) => ({ in: 0, late: 1, trip: 2, leave: 3, none: 4 })[tone(b)];
