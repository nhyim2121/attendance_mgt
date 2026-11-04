/** 휴가 공간의 각 화면: 연차 현황, 신청서 증빙, 현황 보고서, 휴가 등록, 휴가 캘린더, 연차 조정, 연차 기준.
 * 주소는 /leave/<화면> (예: /leave/status). 휴가 홈은 /leave (Home.tsx). */
import Link from "next/link";
import { Suspense } from "react";
import { hrefWith } from "@/components/Filters";
import { ParamDate, ParamSelect } from "@/components/ParamControls";
import PrintButton from "@/components/PrintButton";
import { Metric } from "@/components/ui";
import { isHoliday } from "@/lib/analytics";
import { attachmentsFor, groupTrips } from "@/lib/evidence";
import { getHolidays, getLeavePolicy, getRule, loadBase, type SearchParams } from "@/lib/data";
import * as store from "@/lib/store";
import { addDays, dayLabel, daysInMonth, isDateStr, makeDate, shortKst, todayKst, weekday } from "@/lib/time";
import {
  fyLabel, fyOf, fyRange, leaveBalances, RANGE_TYPES, VACATION_TYPES, vacationDays,
} from "@/lib/vacation";
import { StatusBars } from "@/components/Charts";
import { Ico, Stat } from "@/components/HomeKit";
import MonthCalendar from "@/components/MonthCalendar";
import { leaveBg, leaveFg } from "@/lib/leaveColors";
import { ApprovalForm } from "../upload/forms";
import { AdjustForm, DeleteButton, PolicyForm, VacationForm } from "./forms";
import { EvidenceTab, PersonReport, PromoteReport, SummaryReport } from "./Report";

export const TABS = {
  status: "연차 현황", evidence: "신청서 증빙", report: "현황 보고서", register: "휴가 등록·설정", calendar: "휴가 캘린더",
  adjust: "연차 조정", policy: "연차 기준",
};
const VAC = new Set(VACATION_TYPES);
// 휴가 캘린더에 보이는 유형 (출장·교육·외근은 근태 캘린더에서)
const CAL_TYPES = ["연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가"];
const n2 = (x: number) => String(Math.round(x * 100) / 100);
/** 입사일 순 (입사일 없는 사람은 뒤로) */
const byJoin = <T extends { joinDate: string | null; name: string }>(xs: T[]) =>
  [...xs].sort((a, b) => (a.joinDate ?? "9999") < (b.joinDate ?? "9999") ? -1 : (a.joinDate ?? "9999") > (b.joinDate ?? "9999") ? 1 : a.name < b.name ? -1 : 1);

export type LeaveTab = keyof typeof TABS;

export default async function LeaveView({ sp, tab: page }: { sp: SearchParams; tab: LeaveTab }) {
  // 메뉴 하나에 화면 여러 개: 연차 현황(현황표·요약 보고서·직원별 내역서), 휴가 등록·설정(휴가 등록·연차 조정·연차 기준)
  const tab: LeaveTab = page === "status" && (sp.view === "summary" || sp.view === "person" || sp.view === "promote") ? "report"
    : page === "register" && sp.sec === "adjust" ? "adjust" : page === "register" && sp.sec === "policy" ? "policy" : page;
  const [base, policy, adjusts, rule, holidays] = await Promise.all([
    loadBase(), getLeavePolicy(), store.loadAdjusts(), getRule(), getHolidays(),
  ]);
  const today = todayKst();
  const curFy = fyOf(today, policy);
  const fys = [...new Set([curFy + 1, curFy, curFy - 1, curFy - 2, ...adjusts.map((a) => a.fy)])].sort((a, b) => b - a);
  const fy = fys.includes(Number(sp.fy)) ? Number(sp.fy) : curFy;
  const [fs, fe] = fyRange(fy, policy);
  // 기준일: 주소의 asof(회계연도 안) 또는 오늘. 월말 기준 보고서를 뽑을 때 바꾼다.
  const want = isDateStr(sp.asof) ? String(sp.asof) : today;
  const asOf = want < fs ? fs : want > fe ? fe : want;
  const isWorkday = (d: string) => !isHoliday(d, rule, holidays);

  const emps = base.employees;
  // 연차 대상: 기준일 재직자 중 '연차 기준'에서 뺀 사람(임원 등) 제외
  const excl = new Set(policy.exclude ?? []);
  const empOf = new Map(emps.map((e) => [e.name, e]));
  const onAt = (name: string, d: string) => {
    const e = empOf.get(name);
    return !excl.has(name) && (!e?.leaveDate || e.leaveDate >= d) && (!e?.joinDate || e.joinDate <= d);
  };
  const bal = leaveBalances(emps, base.leaves, adjusts, fy, asOf, policy).filter((b) => onAt(b.name, asOf));
  const active = emps.filter((e) => (!e.leaveDate || e.leaveDate >= today) && (!e.joinDate || e.joinDate <= addDays(today, 60)));
  const deptOf = new Map(emps.map((e) => [e.name, e.dept]));

  const head = (
    <div className="noprint">
      <h1>{TABS[page]}</h1>
      {page === "status" && (
        <div className="tabs">
          <Link href={hrefWith(sp, "/leave/status", { view: null, emp: null })} className={tab === "status" ? "on" : ""} scroll={false}>현황표</Link>
          <Link href={hrefWith(sp, "/leave/status", { view: "summary", emp: null })} className={sp.view === "summary" ? "on" : ""} scroll={false}>요약 보고서</Link>
          <Link href={hrefWith(sp, "/leave/status", { view: "person" })} className={sp.view === "person" ? "on" : ""} scroll={false}>직원별 내역서</Link>
          <Link href={hrefWith(sp, "/leave/status", { view: "promote", emp: null })} className={sp.view === "promote" ? "on" : ""} scroll={false}>연차 사용 촉진</Link>
        </div>
      )}
      {page === "register" && (
        <div className="tabs">
          <Link href={hrefWith(sp, "/leave/register", { sec: null })} className={tab === "register" ? "on" : ""} scroll={false}>휴가 등록</Link>
          <Link href={hrefWith(sp, "/leave/register", { sec: "adjust" })} className={tab === "adjust" ? "on" : ""} scroll={false}>연차 조정 (이월·포상)</Link>
          <Link href={hrefWith(sp, "/leave/register", { sec: "policy" })} className={tab === "policy" ? "on" : ""} scroll={false}>연차 기준</Link>
        </div>
      )}
      {tab === "status" && <p className="caption">회계연도 기준 연차와 입사 1년 미만 월차를 계산하고, 하이웍스 근태현황·일일 근태 보고서·휴가 등록을 모두 합쳐 사용·잔여 일수를 보여 줍니다.</p>}
      <div className="filters">
        <Suspense><ParamSelect name="fy" label="회계연도" value={String(fy)} options={fys.map((y) => [String(y), fyLabel(y, policy)])} /></Suspense>
        <Suspense><ParamDate name="asof" label="기준일" value={asOf} /></Suspense>
        <span className="caption" style={{ margin: 0, paddingBottom: 8 }}>{fs} ~ {fe} · 기준일 재직자{excl.size ? ` (대상 제외 ${excl.size}명)` : ""}</span>
      </div>
    </div>
  );
  // 휴가 신청서 (첨부 유형이 휴가인 것만. 출장 신청서는 출장 증빙에서)
  const vacAtts = tab === "evidence" || tab === "report" || tab === "status"
    ? (await store.loadAttachments(fs, fe)).filter((a) => VAC.has(a.type)) : [];
  const fyText = fyLabel(fy, policy) + (policy.fyStartMonth === 1 ? "" : " 회계연도");
  const empOpts: [string, string][] = [["", "전체 직원"], ...bal.map((b): [string, string] => [b.name, `${b.name} (${b.dept})`])];

  if (tab === "evidence") {
    const emp = String(sp.emp ?? "");
    const dayOf = new Map(bal.flatMap((b) => b.items.map((it) => [`${b.name}|${it.type}|${it.day}`, it.days] as const)));
    const trips = groupTrips(base.leaves.filter((l) => l.day >= fs && l.day <= fe && (!emp || l.name === emp)), VAC);
    const rows = trips.map((t) => ({
      t, files: attachmentsFor(vacAtts, t.name, t.from, t.to),
      days: t.days.reduce((x, d) => x + (dayOf.get(`${t.name}|${t.type}|${d}`) ?? 0), 0),
    }));
    return (
      <>
        {head}
        <div className="filters noprint">
          <Suspense><ParamSelect name="emp" label="직원" value={emp} options={empOpts} /></Suspense>
          <span className="spacer" />
          <PrintButton />
        </div>
        <EvidenceTab sp={sp} rows={rows} emps={emps} fyText={fyText} today={today} />
      </>
    );
  }

  if (tab === "report") {
    const view = sp.view === "person" ? "person" : sp.view === "promote" ? "promote" : "summary";
    const emp = String(sp.emp ?? "");
    const order = [...new Set(emps.map((e) => e.dept).filter(Boolean))];
    const people = bal.filter((b) => !emp || b.name === emp);
    // 월별 사용률 추이: 회계연도 시작부터 기준일까지 매달 말일 기준 (그 시점 재직자)
    const trend: { label: string; asOf: string; total: number; used: number }[] = [];
    for (let m = fs.slice(0, 7); `${m}-01` <= asOf; m = addDays(`${m}-${daysInMonth(m)}`, 1).slice(0, 7)) {
      const end = `${m}-${String(daysInMonth(m)).padStart(2, "0")}`;
      const d = end > asOf ? asOf : end;
      const bs = leaveBalances(emps, base.leaves, adjusts, fy, d, policy).filter((b) => onAt(b.name, d));
      trend.push({ label: `${+m.slice(5)}월`, asOf: d, total: bs.reduce((t, b) => t + b.total, 0), used: bs.reduce((t, b) => t + b.used, 0) });
    }
    return (
      <>
        {head}
        <div className="filters noprint">
          {view === "person" && <Suspense><ParamSelect name="emp" label="직원" value={emp} options={empOpts} /></Suspense>}
          <span className="spacer" />
          <span className="caption" style={{ margin: 0, alignSelf: "center" }}>인쇄 창에서 대상 → <b>PDF로 저장</b>을 고르면 PDF가 됩니다.</span>
          <PrintButton className="btn primary" />
        </div>
        <div className="doc">
          {view === "promote"
            ? <PromoteReport bal={bal} fyText={fyText} range={[fs, fe]} asOf={asOf} today={today} />
            : view === "summary"
            ? <SummaryReport bal={bal} atts={vacAtts} fyText={fyText} range={[fs, fe]} asOf={asOf} today={today} deptOrder={order} trend={trend} />
            : byJoin(people).map((b) => <PersonReport key={b.name} b={b} all={bal} fyText={fyText} range={[fs, fe]} asOf={asOf} today={today} />)}
        </div>
      </>
    );
  }

  if (tab === "register") {
    const vs = base.vacations.filter((v) => v.endDay >= fs && v.startDay <= fe).reverse();
    return (
      <>
        {head}
        <div className="card">
          <div className="card-title">휴가 등록</div>
          <VacationForm names={active.map((e) => [e.name, e.dept])} types={VACATION_TYPES} rangeTypes={[...RANGE_TYPES]} today={today} />
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">하이웍스 결재 내역 올리기 <span className="muted" style={{ fontWeight: 400 }}>(근무계획 수립이력 · 휴가 신청·취소)</span></div>
          <p className="caption">하이웍스에서 내려받은 <code>…_근무계획수립이력.xls</code>를 올리면 결재완료된 휴가는 자동으로 넣고, 휴가 취소는 지웁니다. 반려된 건은 넣지 않습니다.
            연장근무·휴일근무 파일도 여기서 함께 올릴 수 있습니다 (데이터 관리 &gt; 올리기와 같은 곳에 저장).</p>
          <ApprovalForm />
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">등록한 휴가 <span className="muted" style={{ fontWeight: 400 }}>({vs.length}건)</span></div>
          <div className="tbl-wrap tall"><table className="tbl">
            <thead><tr><th>기간</th><th>직원</th><th>부서</th><th>유형</th><th>시각</th><th className="num">차감</th><th>사유</th><th>비고</th><th>등록</th><th /></tr></thead>
            <tbody>
              {vs.map((v) => (
                <tr key={v.id}>
                  <td>{v.startDay === v.endDay ? dayLabel(v.startDay) : `${dayLabel(v.startDay)} ~ ${dayLabel(v.endDay)}`}</td>
                  <td>{v.name}</td><td>{deptOf.get(v.name) ?? ""}</td><td><span className={`tag t-${v.type}`}>{v.type}</span></td>
                  <td>{v.startTime && `${v.startTime}~${v.endTime}`}</td>
                  <td className="num">{n2(vacationDays(v, isWorkday, policy, `${v.startTime}~${v.endTime}`))}</td>
                  <td>{v.reason}</td><td>{v.note}</td><td className="muted">{v.createdBy} {shortKst(v.createdAt)}</td>
                  <td><DeleteButton id={v.id} kind="vacation" /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {!vs.length && <p className="muted">이 회계연도에 사이트에서 등록한 휴가가 없습니다.</p>}
        </div>
      </>
    );
  }

  if (tab === "calendar") {
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = ((policy.fyStartMonth - 1 + i) % 12) + 1, y = fy + (policy.fyStartMonth - 1 + i >= 12 ? 1 : 0);
      return `${y}-${String(m).padStart(2, "0")}`;
    });
    const month = months.includes(String(sp.month)) ? String(sp.month) : months.includes(today.slice(0, 7)) ? today.slice(0, 7) : months[0];
    const lv = base.leaves.filter((l) => l.day.startsWith(month) && CAL_TYPES.includes(l.type));
    const hols: Record<string, string | true> = {};
    for (let i = 1; i <= daysInMonth(month); i++) {
      const d = makeDate(+month.slice(0, 4), +month.slice(5), i)!;
      if (isHoliday(d, rule, holidays)) hols[d] = holidays[d] ?? true;
    }
    return (
      <>
        {head}
        <div className="card">
          <div className="card-title">
            <Suspense><ParamSelect name="month" value={month} options={months.map((m) => [m, `${+m.slice(0, 4)}년 ${+m.slice(5)}월`])} /></Suspense>
            <span className="spacer" />
            <span className="legend">{CAL_TYPES.map((t) => <span key={t} className={`tag t-${t}`}>{t}</span>)}</span>
          </div>
          <MonthCalendar month={month} today={today} holidays={hols}
            entries={lv.map((l) => ({ day: l.day, type: l.type, text: <>{l.name} <b>{l.type}</b></>, title: `${l.name} ${l.type} ${l.content}` }))} />
          <p className="caption" style={{ marginTop: 8 }}>하이웍스 근태현황·일일 근태 보고서·휴가 등록을 합친 휴가입니다 (연차·월차·반차·반반차·외출·공가·경조휴가). 출장·교육·외근은 근태 공간의 <b>근태 캘린더</b>에서 봅니다. 이름에 마우스를 올리면 사유가 보입니다.</p>
        </div>
      </>
    );
  }

  if (tab === "adjust") {
    const list = adjusts.filter((a) => a.fy === fy);
    // 자동 조정: 입사 1년 날 남은 월차 소멸 (기준일 뒤면 예정)
    const auto = leaveBalances(emps, base.leaves, adjusts, fy, asOf, policy)
      .filter((b) => b.expireDay && !excl.has(b.name)).sort((a, b) => (a.expireDay! < b.expireDay! ? -1 : 1));
    return (
      <>
        {head}
        <div className="card">
          <div className="card-title">연차 조정</div>
          <p className="caption">계산으로 나오지 않는 일수를 더하거나 뺍니다: 전년도 이월, 포상휴가, 다음 연도 연차 선사용, 퇴사 정산 등.</p>
          <AdjustForm names={emps.map((e) => e.name)} fy={fy} />
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">{fyLabel(fy, policy)} 조정 내역</div>
          {list.length || auto.length ? (
            <table className="tbl"><thead><tr><th>직원</th><th className="num">일수</th><th>사유</th><th>등록</th><th /></tr></thead>
              <tbody>{list.map((a) => (
                <tr key={a.id}><td>{a.name}</td><td className="num">{a.days > 0 ? "+" : ""}{a.days}</td><td>{a.reason}</td>
                  <td className="muted">{a.createdBy} {shortKst(a.createdAt)}</td><td><DeleteButton id={a.id} kind="adjust" /></td></tr>
              ))}
              {auto.map((b) => {
                const later = b.expireDay! > asOf, n = later ? b.expireLater : b.expired;
                return (
                  <tr key={`auto-${b.name}`} className={later ? "planned" : ""}>
                    <td>{b.name}</td><td className="num">{n ? `-${n2(n)}` : "0"}</td>
                    <td>월차 소멸 {later ? "예정 " : ""}(입사 1년 {b.expireDay} · 남은 월차{later ? ", 지금 기록 기준" : ""})</td>
                    <td className="muted">자동 계산</td><td />
                  </tr>
                );
              })}</tbody></table>
          ) : <p className="muted">조정 내역이 없습니다.</p>}
          <p className="caption" style={{ marginTop: 8 }}>
            월차 소멸은 자동입니다: 입사 1년이 되는 날, 그 해에 생긴 월차와 사유에 &apos;이월&apos;·&apos;초과&apos;가 들어간 조정을 더하고 그날 전에 쓴 휴가를 뺀 나머지를 없앱니다.
            기준일 뒤의 소멸은 &apos;예정&apos;으로만 보이고 잔여에서 빼지 않습니다.</p>
        </div>
      </>
    );
  }

  if (tab === "policy") {
    return <>{head}<div className="card"><PolicyForm p={policy} /></div></>;
  }

  // ---------------------------------------------------------------- 연차 현황
  const total = bal.reduce((t, b) => t + b.total, 0), used = bal.reduce((t, b) => t + b.used, 0);
  const noJoin = bal.filter((b) => !b.joinDate).map((b) => b.name);
  const LEAVE_ONLY = ["연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가"];
  const types = LEAVE_ONLY.filter((t) => bal.some((b) => b.counts[t]));
  const n4 = (x: number) => String(Math.round(x * 10000) / 10000);
  // 내역 팝업은 휴가만 (출장·교육·휴일근무·연장근무 제외)
  const leaveItems = (b: (typeof bal)[number]) => b.items.filter((it) => LEAVE_ONLY.includes(it.type));
  const plannedSum = bal.reduce((t, b) => t + b.planned, 0), remainSum = bal.reduce((t, b) => t + b.remain, 0);
  const rateOf = (b: (typeof bal)[number]) => (b.total ? (b.used / b.total) * 100 : 0);
  const rateColor = (r: number) => (r >= 80 ? "#0c3994" : r >= 50 ? "#3a5db0" : r >= 20 ? "#e9a23b" : "#e84340");
  const buckets = [
    { label: "80% 이상", n: bal.filter((b) => rateOf(b) >= 80).length, color: "#0c3994" },
    { label: "50~80%", n: bal.filter((b) => rateOf(b) >= 50 && rateOf(b) < 80).length, color: "#3a5db0" },
    { label: "20~50%", n: bal.filter((b) => rateOf(b) >= 20 && rateOf(b) < 50).length, color: "#e9a23b" },
    { label: "20% 미만", n: bal.filter((b) => rateOf(b) < 20).length, color: "#e84340" },
  ];
  // 부서별 사용률 (부서 부여 합계 대비 사용 합계, 명부 부서 순서)
  const deptOrder = [...new Set(emps.map((e) => e.dept).filter(Boolean))];
  const deptRates = [...new Set(bal.map((b) => b.dept || "(부서 없음)"))]
    .sort((a, b) => (deptOrder.indexOf(a) + 1 || 99) - (deptOrder.indexOf(b) + 1 || 99))
    .map((d) => {
      const g = bal.filter((b) => (b.dept || "(부서 없음)") === d);
      const t = g.reduce((x, b) => x + b.total, 0), u = g.reduce((x, b) => x + b.used, 0);
      return { dept: d, people: g.length, total: t, used: u, rate: t ? (u / t) * 100 : 0 };
    });
  const over = bal.filter((b) => b.remain < 0);
  const isNew = (b: (typeof bal)[number]) => !!b.joinDate && `${+b.joinDate.slice(0, 4) + 1}${b.joinDate.slice(4)}` > asOf;
  return (
    <div className="home">
      {head}
      <div className="row noprint" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
        <Link className="pill" href={hrefWith(sp, "/leave/status", { view: "summary", emp: null })}>보고서 형식으로 보기</Link>
        <PrintButton className="pill print" label="인쇄" />
      </div>
      <section className="card hstats">
        <Stat icon="people" label="대상 인원" value={bal.length} unit="명" sub={`1년 미만 ${bal.filter(isNew).length}명`} />
        <Stat icon="cal" label="총 부여" value={n2(total)} unit="일" sub="연차 + 월차 + 조정" />
        <Stat icon="chart" label="사용" value={n2(used)} unit="일" sub={`기준일 ${asOf}`} />
        <Stat icon="week" label="예정" value={n2(plannedSum)} unit="일" sub="기준일 이후" />
        <Stat icon="beach" label="잔여" value={n2(remainSum)} unit="일" sub={over.length ? `초과 사용 ${over.length}명` : "초과 사용 없음"} />
        <Stat icon="pie" label="평균 사용률" value={total ? Math.round((used / total) * 100) : 0} unit="%" />
      </section>
      <div className="grid2 home-row">
        <section className="card">
          <div className="card-title"><Ico name="bars" />사용률 분포 <span className="muted" style={{ fontWeight: 400 }}>(인원)</span></div>
          <StatusBars data={buckets} total={bal.length} />
        </section>
        <section className="card">
          <div className="card-title"><Ico name="pie" />부서별 사용률 <span className="muted" style={{ fontWeight: 400 }}>(부여 대비 사용, 기준일까지)</span></div>
          {deptRates.length ? (
            <div className="sbars">{deptRates.map((d) => (
              <div key={d.dept} className="sbar">
                <span className="sbar-l" title={`${d.people}명`}>{d.dept}</span>
                <div className="sbar-track" title={`사용 ${n2(d.used)} / 부여 ${n2(d.total)}일 · ${d.people}명`}>
                  <div className="sbar-fill" style={{ width: `${Math.min(100, d.rate)}%`, background: rateColor(d.rate) }}>
                    {d.rate >= 12 && <b>{Math.round(d.rate)}%</b>}
                  </div>
                </div>
                <span className="sbar-v">{n2(d.used)}<small>/{n2(d.total)}일</small></span>
              </div>
            ))}</div>
          ) : <p className="muted">대상이 없습니다.</p>}
        </section>
      </div>
      {noJoin.length > 0 && (
        <div className="msg warn">입사일이 없어 기본 {policy.baseDays}일로 계산한 직원: {noJoin.join(", ")} — <Link href="/employees">직원 관리</Link>에서 입사일을 넣어 주세요.</div>
      )}
      <div className="card">
        <div className="card-title"><Ico name="people" />직원별 현황 <span className="muted" style={{ fontWeight: 400 }}>입사일 순 · {bal.length}명</span></div>
        <div className="tbl-wrap tall"><table className="tbl ls-tbl">
          <thead><tr>
            <th>부서</th><th>이름</th><th>입사일</th><th className="num">연차</th><th className="num" title="기준일까지 발생 (+ 이 회계연도 안에 더 발생할 일수)">월차</th>
            <th className="num">조정</th><th className="num">총 부여</th><th className="num">사용</th><th className="num">예정</th><th className="num">잔여</th>
            <th>사용률</th>{types.map((t) => <th key={t} className="num" title={t === "외출" ? "시간 (일수)" : "일수"}><span className={`tag t-${t}`}>{t}</span></th>)}<th className="noprint" />
          </tr></thead>
          <tbody>
            {byJoin(bal).map((b) => (
              <tr key={b.name}>
                <td>{b.dept}</td><td><b>{b.name}</b> <span className="muted">{b.rank}</span>{isNew(b) && <span className="new" title="입사 1년 미만: 쓴 휴가는 월차로 셉니다">1년 미만</span>}</td>
                <td>{b.joinDate ?? <span className="muted">-</span>}</td>
                <td className="num" title={b.annualNote}>{n2(b.annual)}</td>
                <td className="num" title={b.monthlyItems.map(([d, n, why]) => `${d} +${n} (${why})`).join("\n")}>
                  {n2(b.monthly)}{b.monthlyLater ? <span className="muted"> (+{n2(b.monthlyLater)})</span> : ""}</td>
                <td className="num" title={b.expired ? `월차 소멸 -${n2(b.expired)} (${b.expireDay}) 포함` : b.expireLater ? `${b.expireDay} 월차 소멸 예정 ${n2(b.expireLater)}일` : undefined}>
                  {b.adjust ? n2(b.adjust) : ""}</td>
                <td className="num"><b>{n2(b.total)}</b></td>
                <td className="num">{n2(b.used)}</td>
                <td className="num">{b.planned ? n2(b.planned) : ""}</td>
                <td className="num"><span className={`remain${b.remain < 0 ? " neg" : b.remain <= 2 ? " low" : ""}`}>{n2(b.remain)}</span></td>
                <td><div className="rate"><div className="bar"><div style={{ width: `${Math.min(100, rateOf(b))}%`, background: rateColor(rateOf(b)) }} /></div>
                  <span style={{ color: rateColor(rateOf(b)) }}>{Math.round(rateOf(b))}%</span></div></td>
                {types.map((t) => (
                  <td key={t} className="num" title={b.counts[t] ? `${b.counts[t]}건` : undefined}>{b.counts[t] ? (
                    <span className="pill" style={{ color: leaveFg(t), background: leaveBg(t) }}>
                      {t === "외출" ? `${n2(b.outingHours)}h` : `${n4(b.typeDays[t])}일`}</span>) : ""}
                    {t === "외출" && b.outingHours > 0 && <div className="muted" style={{ fontSize: 11 }}>{n4(b.typeDays[t])}일</div>}</td>
                ))}
                <td className="noprint">
                  {leaveItems(b).length > 0 && (
                    <details className="pop">
                      <summary className="btn sm">내역</summary>
                      <div className="pop-body">
                        <b>{b.name} · {fyLabel(fy, policy)}</b>
                        <p className="caption" style={{ margin: "4px 0 8px" }}>연차 {n2(b.annual)}일 ({b.annualNote}){b.monthlyItems.length ? ` · 월차 ${b.monthlyItems.map(([d, n]) => `${+d.slice(5, 7)}/${+d.slice(8)} +${n}`).join(", ")}` : ""}{b.expired ? ` · 월차 소멸 -${n2(b.expired)} (${b.expireDay})` : ""}</p>
                        <table className="tbl"><thead><tr><th>일자</th><th>유형</th><th className="num">차감</th><th>내용</th><th>출처</th></tr></thead>
                          <tbody>{leaveItems(b).map((it, i) => (
                            <tr key={i} className={it.planned ? "planned" : ""}><td>{dayLabel(it.day)}</td><td>{it.type}{it.applied && it.applied !== it.type && <span className="muted"> ({it.applied} 신청)</span>}</td>
                              <td className="num">{it.days ? n4(it.days) : ""}</td>
                              <td>{it.content.split("\n")[0]}{it.type === "외출" && it.hours ? ` (${it.hours}h)` : ""}</td>
                              <td className="muted">{it.src === "사이트" ? "일일 근태 보고서" : it.src === "휴가관리" ? "휴가 등록" : "근태현황 파일"}</td></tr>
                          ))}</tbody></table>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="caption" style={{ marginTop: 8 }}>
          연차·월차는 1일, 반차 0.5일, 반반차 0.25일 차감{policy.outingDeduct ? `, 외출은 30분 단위(점심 12~13시 제외)로 ${policy.outingHoursPerDay}시간 = 1일로 차감` : " (외출·공가·경조휴가·병가는 차감 안 함)"}.
          외출+반차를 한 번에 낸 경우(예: 13:00~17:30)는 반차 + 나머지 시간 외출로, 외출만 4시간 이상이면 반차 + 나머지 외출로 셉니다. 유형 칸은 일수(외출은 시간)입니다.
          월차 칸의 괄호는 이 회계연도 안에 앞으로 더 생길 월차입니다. 숫자에 마우스를 올리면 계산 근거가 보입니다.
          입사 1년이 되기 전에 쓴 휴가는 연차로 신청했어도 월차로 셉니다. 잔여: <span className="remain low" style={{ padding: "0 6px" }}>2일 이하</span> <span className="remain neg" style={{ padding: "0 6px" }}>초과 사용</span>
        </p>
      </div>
    </div>
  );
}
