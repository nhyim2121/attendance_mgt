/** 홈 대시보드: 오늘 근무 현황, 부재·이번 주 근무, 어제 근무 현황, 이번 달 근무시간·인력 변동·연차, 부서별 연장·월별 평균. */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import { missingProofs } from "@/lib/인사노무/proofScan";
import { DeptHeadBars, HOME, HoursArea, HoursBars, JoinLeaveBars, MonthlyCombo, StatusBars } from "@/components/인사노무/Charts";
import { Ico, Stat } from "@/components/인사노무/HomeKit";
import PrintButton from "@/components/PrintButton";
import { NoData } from "@/components/ui";
import { dailyBoard, isHoliday } from "@/lib/인사노무/analytics";
import {
  dayLists, deptOvertime, frequentLate, headcount, isLeaveType, monthlyAverage, periodHours, weekdayAverage, weekHours,
} from "@/lib/인사노무/dashboard";
import { getHolidays, getLeavePolicy, getRule, loadBase, rosterDays, staffOn } from "@/lib/인사노무/data";
import { buildOrg, defaultNodes, type OrgBox, type OrgNode } from "@/lib/인사노무/org";
import * as store from "@/lib/store";
import { addDays, dayLabel, hhmm, nowKst, parseTs, todayKst, tsHM, weekday } from "@/lib/time";
import { fyOf } from "@/lib/인사노무/vacation";
import { leaveBook } from "@/lib/인사노무/leaveBook";

const WEEK_LIMIT = 52;
const WEEK_WARN = 48;

type Person = [name: string, sub: string];

/** 숫자 칸. 누르면 해당 직원 목록이 펼쳐진다. */
function Tile({ label, n, people, warn, unit = "명", href }: {
  label: string; n: number; people?: Person[]; warn?: boolean; unit?: string; href?: string;
}) {
  const num = <span className={`tile-n${warn && n > 0 ? " warn" : ""}`}>{n}<small>{unit}</small></span>;
  if (!people) return <div className="tile"><span className="tile-l">{label}</span>{num}</div>;
  return (
    <details className="pop tile-pop">
      <summary className="tile"><span className="tile-l">{label}</span>{num}<span className="chev">›</span></summary>
      <div className="pop-body">
        <b>{label} {n}{unit}</b>
        {people.length ? (
          <table className="list-table" style={{ marginTop: 6 }}><tbody>
            {people.map(([p, s], i) => <tr key={i}><td>{p}</td><td className="dt">{s}</td></tr>)}
          </tbody></table>
        ) : <p className="muted">없습니다.</p>}
        {href && <p style={{ margin: "8px 0 0" }}><Link href={href}>자세히 보기 →</Link></p>}
      </div>
    </details>
  );
}

function Empty() {
  return <div className="empty"><span>≡</span>대상자가 없습니다.</div>;
}

// ---------------------------------------------------------------- 홈 꾸밈 (아이콘·요약 띠·조직도 요약)
function OrgMini({ roots }: { roots: OrgBox[] }) {
  const top = roots[0];
  if (!top) return <Empty />;
  const who = (b: OrgBox) => (b.head ? `${b.head.name} ${b.head.rank}`.trim() : `${b.count}명`);
  return (
    <div className="omini">
      <div className="obox top"><b>{top.node.label}</b><span>{top.head ? who(top) : `전체 ${top.count}명`}</span></div>
      {top.children.length > 0 && (
        <div className="olevel">
          {top.children.map((c) => (
            <div key={c.node.id} className="obranch">
              <div className="obox" style={{ "--oc": c.color || HOME.navy } as React.CSSProperties}>
                <b>{c.node.label}</b><span>{who(c)}</span>
              </div>
              {c.children.length > 0 && (
                <div className="osubs">{c.children.slice(0, 4).map((g) => (
                  <div key={g.node.id} className="obox sm"><b>{g.node.label}</b><span>{who(g)}</span></div>
                ))}{c.children.length > 4 && <span className="muted">외 {c.children.length - 4}</span>}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const h1 = (x: number) => `${Math.floor(x)}시간${Math.round((x % 1) * 60) ? ` ${Math.round((x % 1) * 60)}분` : ""}`;

export default async function Home() {
  const [rule, holidays, base, policy, adjusts, savedNodes] = await Promise.all([
    getRule(), getHolidays(), loadBase(), getLeavePolicy(), store.loadAdjusts(),
    store.getSetting<OrgNode[] | null>("org_nodes", null),
  ]);
  if (!base.months.length) return <><PageHead href={"/attendance"} /><NoData /></>;

  const today = todayKst();
  const lastDay = base.months[base.months.length - 1].last_day;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monday = addDays(today, -weekday(today));
  const { records, days } = await rosterDays(monday < yearStart ? monday : yearStart, today);
  const lastTs = records.length ? records[records.length - 1].ts : null;

  // ---------------------------------------------------------------- 오늘
  const holiday = isHoliday(today, rule, holidays);
  const staff = await staffOn(today, records);
  const board = dailyBoard(days, base.leaves, staff, today, rule, parseTs(nowKst()), holiday);
  const todayRows = days.filter((d) => d.day === today);
  const by = (g: string) => board.filter((b) => b.group === g);
  const working = board.filter((b) => b.group !== "휴가" && b.group !== "휴무");
  const early = todayRows.filter((d) => d.early && (d.outSrc === "캡스" || d.outSrc === "수기입력"));
  const depts = [...new Set(staff.map(([, d]) => d || "(부서 없음)"))];
  const hasToday = records.some((r) => r.day === today);

  // ---------------------------------------------------------------- 어제 (직전 근무일)
  let yday = addDays(today, -1);
  while (isHoliday(yday, rule, holidays) && yday > addDays(today, -14)) yday = addDays(yday, -1);
  const y = dayLists(days, yday, rule);
  // 어제 현황은 부서별로 (2026-11-11 사용자 결정): 생산팀, 품질팀(김동수 제외), 영업팀(이병욱 제외), 연구소, 관리팀
  const yBoard = dailyBoard(days, base.leaves, await staffOn(yday, records), yday, rule);
  const Y_DEPTS: [string, (dept: string, emp: string) => boolean][] = [
    ["생산팀", (d) => d === "생산팀"],
    ["품질팀", (d, e) => d === "품질팀" && e !== "김동수"],
    ["영업팀", (d, e) => d === "영업팀" && e !== "이병욱"],
    ["연구소", (d) => d.includes("연구소")],
    ["관리팀", (d) => d === "관리팀"],
  ];
  const yDeptOf = new Map(yBoard.map((b) => [b.emp, b.dept]));
  const yGroup = (emp: string, dept = yDeptOf.get(emp) ?? "") => Y_DEPTS.find(([, ok]) => ok(dept, emp))?.[0] ?? "";
  // 연장근무자 = 평일 연장·휴일근로 + 야간근무(22:00~06:00)를 한 명단으로
  const nightOf = new Map(y.night.map((o) => [o.emp, o]));
  const otAll = [...new Set([...y.overtime.map((o) => o.emp), ...y.night.map((o) => o.emp)])].map((emp) => {
    const o = y.overtime.find((x) => x.emp === emp), n = nightOf.get(emp);
    return { emp, out: o?.out ?? n?.out ?? 0, hours: o?.hours ?? 0, night: n?.hours ?? 0, grp: yGroup(emp, o?.dept ?? n?.dept) };
  }).filter((o) => o.grp);
  const yRows = Y_DEPTS.map(([dp]) => {
    const g = yBoard.filter((b) => yGroup(b.emp) === dp);
    return {
      dept: dp,
      trip: g.filter((b) => b.group === "출장·교육").map((b) => b.emp),
      leave: g.filter((b) => b.group === "휴가").map((b) => b.emp),
      noOut: y.noOut.filter((d) => yGroup(d.emp, d.dept) === dp).map((d) => d.emp),
      ot: otAll.filter((o) => o.grp === dp).sort((a, b) => b.hours + b.night - a.hours - a.night),
    };
  });
  const ySum = (k: "trip" | "leave" | "noOut" | "ot") => yRows.reduce((t, r) => t + r[k].length, 0);

  // ---------------------------------------------------------------- 이번 주·이번 달·올해
  const week = weekHours(days, today, rule);
  const over = week.filter((w) => w.hours > WEEK_LIMIT), near = week.filter((w) => w.hours >= WEEK_WARN && w.hours <= WEEK_LIMIT);
  const month = today.slice(0, 7);
  const monthDays = days.filter((d) => d.day.startsWith(month));
  const ph = periodHours(monthDays, rule);
  const late3 = frequentLate(monthDays);
  const order = [...new Set(base.employees.map((e) => e.dept).filter(Boolean))];
  const deptOt = deptOvertime(monthDays, rule, order);
  const yearDays = days.filter((d) => d.day >= yearStart);
  const monthly = monthlyAverage(yearDays, rule).map((m) => ({ ...m, label: `${+m.month.slice(5)}월` }));
  const org = buildOrg(savedNodes?.length ? savedNodes : defaultNodes(base.employees), base.employees, today);
  const wdAvg = weekdayAverage(monthDays, rule);
  const hc = headcount(base.employees, today);

  // ---------------------------------------------------------------- 연차 (회계연도)
  const fy = fyOf(today, policy);
  const active = base.employees.filter((e) => (!e.leaveDate || e.leaveDate >= today) && (!e.joinDate || e.joinDate <= today));
  // 연차 현황(현황표)과 같은 계산 (하이웍스 숫자·직접 수정 포함, '연차 기준'에서 뺀 사람 제외)
  const excl = new Set(policy.exclude ?? []);
  const bal = leaveBook(active, base.leaves, adjusts, fy, policy, await store.loadLeaveStatus(fy))(today, (b) => !excl.has(b.name))
    .bal.filter((b) => b.total > 0);
  const usedRate = bal.length ? Math.round((bal.reduce((t, b) => t + b.used, 0) / bal.reduce((t, b) => t + b.total, 0)) * 100) : 0;
  const most = [...bal].sort((a, b) => b.remain - a.remain).slice(0, 5);

  // ---------------------------------------------------------------- 다가오는 휴가·출장 (2주)
  // 홈 상단: 부서별 재직·출근, 오늘 근태 분포
  const present = board.filter((b) => b.in !== null).length;
  // 부서별 인원 현황에서 빼는 사람 (2026-11-11 사용자 결정): 품질팀 김동수, 대전지사 김창범
  const HEAD_EXCLUDE = ["김동수", "김창범"];
  const deptHead = [...order.filter((d) => depts.includes(d)), ...depts.filter((d) => !order.includes(d))].map((dp) => {
    const g = board.filter((b) => (b.dept || "(부서 없음)") === dp && !HEAD_EXCLUDE.includes(b.emp));
    return { dept: dp, staff: g.length, present: g.filter((b) => b.in !== null).length };
  }).filter((x) => x.staff > 0);
  const status = [
    // 항목마다 색을 달리 (출근 남색, 지각 빨강, 휴가 초록, 출장·교육 보라, 미출근 주황)
    { label: "출근", n: present, color: HOME.navy },
    { label: "지각", n: board.filter((b) => b.late).length, color: HOME.red },
    { label: "휴가", n: by("휴가").length, color: "#1f8a5b" },
    { label: "출장·교육", n: by("출장·교육").length, color: "#6d3fd1" },
    { label: "미출근", n: by("기록 없음").length, color: "#d9730d" },
  ];

  const soon = base.leaves.filter((l) => l.day > today && l.day <= addDays(today, 14)
    && (isLeaveType(l.type) || ["출장", "교육", "외근"].includes(l.type)));

  const noProof = await missingProofs().catch(() => []);
  return (
    <div className="home">
      <PageHead href="/attendance" desc={<>{dayLabel(today, true)} · 
          업데이트: <b style={{ fontSize: "1rem", color: "var(--violet)" }}>{lastTs ? `${dayLabel(lastDay)} ${tsHM(lastTs)}` : "-"}</b>
          {holiday && <> · <span style={{ color: "var(--amber)" }}>{holidays[today] ?? "주말"} (휴일)</span></>}</>}>
          <Link className="pill" href={`/daily?day=${today}`}>일일 현황</Link>
          <Link className="pill" href={`/daily?tab=report&day=${today}`}>근태 보고서</Link>
          <Link className="pill" href="/leave">휴가</Link>
          <PrintButton className="pill print" label="인쇄" />
      </PageHead>
      {noProof.length > 0 && (
        <div className="msg warn">📎 신청서 없는 휴일·연장근무·조출 <b>{noProof.length}건</b>은 <b>미인정</b>으로 표시됩니다 (시간 합계에는 들어감):{" "}
          {noProof.slice(0, 6).map((m, i) => (
            <span key={`${m.emp}${m.day}`}>{i ? ", " : ""}<Link href={`/sheets?tab=edit&month=${m.day.slice(0, 7)}&emp=${encodeURIComponent(m.emp)}`}>{m.emp} {+m.day.slice(5, 7)}/{+m.day.slice(8)} {m.kinds.join("·")}</Link></span>
          ))}{noProof.length > 6 && ` 외 ${noProof.length - 6}건`} · 근태 기입에서 [+ 신청서]로 첨부하면 바로 인정됩니다.</div>
      )}
      {!hasToday && !holiday && (
        <div className="msg warn">오늘 캡스 기록이 아직 올라오지 않았습니다 (마지막 기록 {lastDay}). 출근·미출근 숫자는 기록을 올리면 맞춰집니다.{" "}
          <Link href="/daily">일일 현황에서 올리기</Link></div>
      )}

      <section className="card hstats">
        <Stat icon="people" label="재직 직원" value={staff.length} unit="명" sub={`부서 ${depts.length}개`} />
        <Stat icon="in" label="오늘 출근" value={present} unit="명"
          sub={staff.length ? `출근율 ${Math.round((present / staff.length) * 100)}%` : ""} />
        <Stat icon="beach" label="휴가" value={by("휴가").length} unit="명" />
        <Stat icon="plane" label="출장·교육" value={by("출장·교육").length} unit="명" />
        <Stat icon="swap" label="이번 달 이직률" value={hc.turnover} unit="%" sub={`입사 ${hc.joined.length} · 퇴직 ${hc.left.length}`} />
        <Stat icon="cal" label="연차 사용률" value={usedRate} unit="%" sub={`${fy}${policy.fyStartMonth === 1 ? "년" : "회계연도"}`} />
      </section>

      <section className="card hero home-row">
        <div className="card-title">오늘 근무 현황<span className="spacer" />
          <details className="pop">
            <summary className="btn sm">부서별 현황 보기</summary>
            <div className="pop-body">
              <table className="tbl"><thead><tr>
                <th>부서</th><th className="num">재직</th><th className="num">출근</th><th className="num">지각</th>
                <th className="num">휴가</th><th className="num">출장·교육</th><th className="num">미출근</th>
              </tr></thead><tbody>
                {depts.map((dp) => {
                  const g = board.filter((b) => (b.dept || "(부서 없음)") === dp);
                  return (
                    <tr key={dp}><td>{dp}</td><td className="num">{g.length}</td>
                      <td className="num">{g.filter((b) => b.in !== null).length}</td>
                      <td className="num">{g.filter((b) => b.late).length}</td>
                      <td className="num">{g.filter((b) => b.group === "휴가").length}</td>
                      <td className="num">{g.filter((b) => b.group === "출장·교육").length}</td>
                      <td className="num">{g.filter((b) => b.group === "기록 없음").length}</td></tr>
                  );
                })}
              </tbody></table>
            </div>
          </details>
        </div>
        <div className="hero-body">
          <div>
            <div className="sub-title">근무 계획</div>
            <div className="plan">
              <Tile label="근무자" n={working.length} people={working.map((b) => [b.emp, b.dept])} />
              <Tile label="휴가자" n={by("휴가").length} people={by("휴가").map((b) => [b.emp, b.leave])} />
              <Tile label="휴무자" n={by("휴무").length} people={by("휴무").map((b) => [b.emp, b.dept])} />
              <Tile label="연장신청" n={board.filter((b) => b.overtime).length}
                people={board.filter((b) => b.overtime).map((b) => [b.emp, b.leaveContent])} />
            </div>
          </div>
          <div>
            <div className="sub-title">근태 현황</div>
            <div className="tiles2">
              <Tile label="출근" n={board.filter((b) => b.in !== null).length} href={`/daily?day=${today}`}
                people={board.filter((b) => b.in !== null).sort((a, b) => a.in! - b.in!).map((b) => [b.emp, tsHM(b.in)])} />
              <Tile label="지각" n={board.filter((b) => b.late).length} warn href={`/daily?day=${today}`}
                people={board.filter((b) => b.late).map((b) => [b.emp, tsHM(b.in)])} />
              <Tile label="조기퇴근" n={early.length} warn people={early.map((d) => [d.emp, tsHM(d.out)])} />
              <Tile label="미출근" n={by("기록 없음").length} warn href={`/daily?day=${today}`}
                people={by("기록 없음").map((b) => [b.emp, b.dept])} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid2 home-row">
        <section className="card">
          <div className="card-title"><Ico name="bars" />부서별 인원 현황</div>
          {deptHead.length ? <DeptHeadBars data={deptHead} /> : <Empty />}
        </section>
        <section className="card">
          <div className="card-title"><Ico name="flow" />오늘 근태 현황<span className="spacer" />
            <Link className="btn sm" href={`/daily?day=${today}`}>자세히</Link></div>
          <StatusBars data={status} total={staff.length} />
        </section>
      </div>

      <div className="grid2 home-row">
        <section className="card">
          <div className="card-title"><Ico name="org" />조직도<span className="spacer" /><Link className="btn sm" href="/org">조직도 보기</Link></div>
          <OrgMini roots={org.roots} />
        </section>
        <section className="card">
          <div className="card-title"><Ico name="chart" />월별 근무시간 <span className="muted" style={{ fontWeight: 400 }}>({today.slice(0, 4)}년, 1인 평균)</span></div>
          <MonthlyCombo data={monthly} />
        </section>
      </div>

      <div className="dash">
        <div className="stack">

          <section className="card">
            <div className="card-title">어제 근무 현황 <span className="muted" style={{ fontWeight: 400 }}>{dayLabel(yday)}</span></div>
            <div className="tiles4">
              <Tile label="출장" n={ySum("trip")} people={yRows.flatMap((r) => r.trip.map((e) => [e, r.dept] as [string, string]))} href="/evidence" />
              <Tile label="휴가" n={ySum("leave")} people={yRows.flatMap((r) => r.leave.map((e) => [e, r.dept] as [string, string]))} href="/leave" />
              <Tile label="퇴근미체크" n={ySum("noOut")} warn people={yRows.flatMap((r) => r.noOut.map((e) => [e, r.dept] as [string, string]))}
                href={`/sheets?tab=edit&month=${yday.slice(0, 7)}`} />
              <Tile label="연장근무" n={ySum("ot")} people={yRows.flatMap((r) => r.ot.map((o) => [o.emp, r.dept] as [string, string]))} />
            </div>
            <table className="tbl ydept" style={{ marginTop: 14 }}>
              <thead><tr><th>부서</th><th>출장</th><th>휴가</th><th>퇴근 미체크</th><th>연장근무</th></tr></thead>
              <tbody>{yRows.map((r) => (
                <tr key={r.dept}><td><b>{r.dept}</b></td>
                  {([r.trip, r.leave, r.noOut, r.ot.map((o) => o.emp)] as string[][]).map((list, i) => (
                    <td key={i}>{list.length ? <><b>{list.length}</b>명 <span className="muted">{list.join(", ")}</span></> : <span className="muted">-</span>}</td>
                  ))}</tr>
              ))}</tbody>
            </table>
            <div className="sub-title" style={{ marginTop: 16 }}>연장근무자 <span className="muted">({otAll.length}명 · 야간 22:00~06:00 포함)</span></div>
            {otAll.length ? (
              <table className="tbl"><thead><tr><th>부서</th><th>이름</th><th>퇴근</th><th className="num">연장근무시간</th></tr></thead>
                <tbody>{yRows.flatMap((r) => r.ot.map((o, i) => (
                  <tr key={o.emp}><td>{i ? "" : <b>{r.dept}</b>}</td><td>{o.emp}</td><td>{tsHM(o.out)}</td>
                    <td className="num">{h1(o.hours)}{o.night > 0 && <span className="muted"> (야간 {h1(o.night)})</span>}</td></tr>
                )))}</tbody></table>
            ) : <Empty />}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-title">부재 현황</div>
            <div className="tiles2">
              <Tile label="외부근무자" n={by("출장·교육").length}
                people={by("출장·교육").map((b) => [b.emp, b.leaveContent || b.leave])} href="/evidence" />
              <Tile label="휴가자" n={by("휴가").length} people={by("휴가").map((b) => [b.emp, b.leave])} href="/leave" />
            </div>
          </section>

          <section className="card">
            <div className="card-title">이번 주 근무 <span className="muted" style={{ fontWeight: 400 }}>{dayLabel(monday)} ~</span></div>
            <div className="tiles2">
              <Tile label={`초과자 (${WEEK_LIMIT}h↑)`} n={over.length} warn />
              <Tile label={`임박자 (${WEEK_WARN}h↑)`} n={near.length} />
            </div>
            <div className="sub-title" style={{ marginTop: 14 }}>초과/임박 근무자 <span className="muted">({over.length + near.length}명)</span></div>
            {over.length + near.length ? (
              <table className="tbl"><thead><tr><th>이름 (부서)</th><th className="num">누적 근무</th></tr></thead>
                <tbody>{[...over, ...near].map((w) => <tr key={w.emp}><td>{w.emp} <span className="muted">({w.dept})</span></td>
                  <td className={`num${w.hours > WEEK_LIMIT ? " red" : ""}`}>{h1(w.hours)}</td></tr>)}</tbody></table>
            ) : <Empty />}
            <details style={{ marginTop: 6 }}>
              <summary className="muted">이번 주 전체 누적 ({week.length}명)</summary>
              <table className="tbl"><tbody>{week.map((w) => <tr key={w.emp}><td>{w.emp}</td><td className="num">{h1(w.hours)}</td></tr>)}</tbody></table>
            </details>
            <div className="sub-title" style={{ marginTop: 16 }}>요일별 평균 근무시간 <span className="muted">({+month.slice(5)}월, 1인)</span></div>
            <HoursArea data={wdAvg} x="wd" color={HOME.navy} />
          </section>

          <section className="card">
            <div className="card-title">다가오는 휴가·출장 <span className="muted" style={{ fontWeight: 400 }}>2주</span></div>
            {soon.length ? (
              <table className="list-table"><tbody>
                {soon.slice(0, 10).map((l, i) => (
                  <tr key={i}><td className="dt">{dayLabel(l.day)}</td><td>{l.name}</td>
                    <td><span className={`tag t-${l.type}`}>{l.type}</span></td></tr>
                ))}
              </tbody></table>
            ) : <Empty />}
            {soon.length > 10 && <p className="caption">외 {soon.length - 10}건 · <Link href="/leave/calendar">휴가 캘린더</Link></p>}
          </section>
        </div>
      </div>

      <div className="grid3" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-title">이번 달 근무시간 <span className="muted" style={{ fontWeight: 400 }}>(인당 평균)</span></div>
          <div className="split">
            <div className="big"><span>총 근무시간</span><b>{h1(ph.total)}</b></div>
            <table className="list-table"><tbody>
              <tr><td>연장</td><td className="v">{h1(ph.overtime)}</td></tr>
              <tr><td>야간</td><td className="v">{h1(ph.night)}</td></tr>
              <tr><td>휴일</td><td className="v">{h1(ph.holiday)}</td></tr>
            </tbody></table>
          </div>
          <div className="sub-title" style={{ marginTop: 16 }}>3회 이상 지각자 <span className="muted">({late3.length}명)</span></div>
          {late3.length ? (
            <table className="tbl"><thead><tr><th>이름 (부서)</th><th className="num">횟수</th></tr></thead>
              <tbody>{late3.map((l) => <tr key={l.emp}><td>{l.emp} <span className="muted">({l.dept})</span></td><td className="num">{l.n}회</td></tr>)}</tbody></table>
          ) : <Empty />}
        </section>

        <section className="card">
          <div className="card-title">이번 달 인력 변동<span className="spacer" /><Link className="btn sm" href="/employees">더보기</Link></div>
          <div className="tiles2">
            <Tile label="입사" n={hc.joined.length} people={hc.joined.map((e) => [e.name, `${e.dept} · ${e.joinDate}`])} />
            <Tile label="퇴직" n={hc.left.length} people={hc.left.map((e) => [e.name, `${e.dept} · ${e.leaveDate}`])} />
          </div>
          <table className="list-table" style={{ marginTop: 8 }}><tbody>
            <tr><td>순증감</td><td className="v">{hc.joined.length - hc.left.length > 0 ? "+" : ""}{hc.joined.length - hc.left.length} 명</td></tr>
            <tr><td>이직률</td><td className="v">{hc.turnover} %</td></tr>
            <tr><td>재직</td><td className="v">{hc.active} 명</td></tr>
          </tbody></table>
          <div className="sub-title" style={{ marginTop: 14 }}>월별 입퇴사자 ({today.slice(0, 4)}년)</div>
          <JoinLeaveBars data={hc.byMonth} />
        </section>

        <section className="card">
          <div className="card-title">연차 현황 <span className="muted" style={{ fontWeight: 400 }}>{fy}{policy.fyStartMonth === 1 ? "년" : "회계연도"}</span>
            <span className="spacer" /><Link className="btn sm" href="/leave/status">연차 현황</Link></div>
          <table className="list-table"><tbody>
            <tr><td>대상자</td><td className="v">{bal.length} 명</td></tr>
            <tr><td>평균 사용률</td><td className="v">{usedRate} %</td></tr>
            <tr><td>이번 달 휴가 사용</td><td className="v">{base.leaves.filter((l) => l.day.startsWith(month) && l.day <= today && isLeaveType(l.type)).length} 건</td></tr>
          </tbody></table>
          <div className="sub-title" style={{ marginTop: 14 }}>잔여 연차가 많은 직원 <span className="muted">(사용 촉진 참고)</span></div>
          {most.length ? (
            <table className="report"><tbody>
              {most.map((b) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td style={{ width: "45%" }}><div className="bar"><div style={{ width: `${Math.min(100, ((b.used + b.planned) / b.total) * 100)}%` }} /></div></td>
                  <td className="numcell">잔여 {b.remain} / {b.total}일</td>
                </tr>
              ))}
            </tbody></table>
          ) : <Empty />}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-title">이번 달 평균 연장근무시간 <span className="muted" style={{ fontWeight: 400 }}>(부서별 1인, 휴일근로 포함)</span></div>
        {deptOt.length ? <HoursBars data={deptOt} x="dept" /> : <Empty />}
      </section>
      <p className="caption" style={{ marginTop: 10 }}>
        근무시간 = 퇴근 − 출근(평일 {hhmm(rule.start)} 이전은 {hhmm(rule.start)}) − 휴게. 연장 = 평일 {hhmm(rule.end)} + {rule.overtimeMin}분 이후 퇴근한 날의 초과분,
        야간 = 22:00~06:00. 이번 주 초과자는 주 {WEEK_LIMIT}시간 기준. 기간별 상세는 <Link href="/hours">근로시간 리포트</Link>.
      </p>
    </div>
  );
}
