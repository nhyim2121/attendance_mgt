/** 근태관리 > 대시보드 (2026-11-27 새로): 기준(금일·명일·주간·월별·연도별)마다 출퇴근·지각·조퇴·외출·결근·연장및휴일근무.
 *  카드를 누르면 명단(모달), 부서별 출근율(진행막대), 오늘 마감 단계, 살펴볼 사람, 아래에 예전 근태 화면·대장 링크.
 *  예전 근태 홈(그래프 모음)은 /attendance/classic */
import Link from "next/link";
import { Suspense } from "react";
import { ParamDate, ParamSelect } from "@/components/ParamControls";
import { Badge, Bar, Fab, Modal, ParamCheck, Segment, SnackHost, Steps, Tip, UxHead } from "@/components/ux/Kit";
import { NoData } from "@/components/ui";
import { isHoliday, splitTypes, type DayRow } from "@/lib/인사노무/analytics";
import { holidayHours, overtimeHours, weekHours } from "@/lib/인사노무/dashboard";
import { getHolidays, getRule, loadBase, rosterDays, type SearchParams } from "@/lib/인사노무/data";
import { activeNames } from "@/lib/인사노무/employees";
import { missingProofs } from "@/lib/인사노무/proofScan";
import * as store from "@/lib/store";
import { addDays, dayLabel, isDateStr, todayKst, tsHM, weekday } from "@/lib/time";
import CopySummary from "./CopySummary";
import { ATT_MENU } from "@/lib/인사노무/attMenu";

export const metadata = { title: "근태 대시보드 · 근태관리통합시스템" };

const PERIODS: [string, string][] = [["day", "금일"], ["next", "명일"], ["week", "주간"], ["month", "월별"], ["year", "연도별"]];
const EXEC = /대표|부사장|전무|상무|이사/;
const KINDS = [
  { k: "in", label: "출퇴근", color: "#0c3994", tip: "캡스 출근 기록이 있는 사람 (퇴근 미체크 포함). 주간·월별·연도별은 사람×날 수" },
  { k: "late", label: "지각", color: "#c2410c", tip: "출근 기준 시각을 넘어 출근 (출장·반차 출근 형태 제외)" },
  { k: "early", label: "조퇴", color: "#7c3aed", tip: "퇴근 기준 시각 전에 캡스로 퇴근 (반차·외출 신청은 제외)" },
  { k: "out", label: "외출", color: "#0e7490", tip: "외출 신청 (하이웍스·보고서·휴가 등록)" },
  { k: "absent", label: "결근", color: "#be123c", tip: "근무일인데 캡스 기록·휴가·출장이 모두 없는 날" },
  { k: "ot", label: "연장및휴일근무", color: "#e8590c", tip: "평일 연장근로 + 주말·공휴일 근무 (캡스 시각 기준)" },
] as const;
type Kind = (typeof KINDS)[number]["k"];
type Who = [name: string, dept: string, detail: string];

export default async function AttendanceDash({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [rule, holidays, base] = await Promise.all([getRule(), getHolidays(), loadBase()]);
  const head = <UxHead crumb="인사노무 › 근태관리" title="근태 대시보드" menu={ATT_MENU} />;
  if (!base.months.length) return <div className="ux-page">{head}<NoData /></div>;

  const today = todayKst();
  const p = PERIODS.some(([v]) => v === sp.p) ? String(sp.p) : "day";
  const at = isDateStr(sp.day) && String(sp.day) <= addDays(today, 60) ? String(sp.day) : today;
  const dept = String(sp.dept ?? "");
  const withApp = sp.app !== "0", noExec = sp.exec === "1";
  const from = p === "day" ? at : p === "next" ? addDays(at, 1) : p === "week" ? addDays(at, -weekday(at)) : p === "month" ? `${at.slice(0, 7)}-01` : `${at.slice(0, 4)}-01-01`;
  const to = p === "next" ? addDays(at, 1) : at;
  const label = p === "day" ? dayLabel(at, true) : p === "next" ? `${dayLabel(to, true)} 예정` : `${dayLabel(from)} ~ ${dayLabel(to)}`;

  const empOf = new Map(base.employees.map((e) => [e.name, e]));
  const keep = (name: string, d: string) => {
    const e = empOf.get(name);
    const dp = d || e?.dept || "";
    if (dept && dp !== dept) return false;
    if (!withApp && /일학습/.test(dp)) return false;
    if (noExec && EXEC.test(e?.rank ?? "")) return false;
    return true;
  };
  const staffAt = activeNames(base.employees, to, to).filter((n) => keep(n, empOf.get(n)?.dept ?? ""));
  const depts = [...new Set(base.employees.filter((e) => activeNames([e], today, today).length).map((e) => e.dept).filter(Boolean))];

  // 실제 기록 (명일은 기록이 없으니 신청·일정으로)
  const { records, days: all } = p === "next" ? { records: [], days: [] as DayRow[] } : await rosterDays(from, to);
  const days = all.filter((d) => d.day >= from && d.day <= to && keep(d.emp, d.dept));
  const tagged = (s: string) => s === "캡스" || s === "수기입력";
  const hm = (t: number | null) => (t === null ? "" : tsHM(t));
  const lists: Record<Kind, Who[]> = { in: [], late: [], early: [], out: [], absent: [], ot: [] };
  const multi = p !== "day";
  const dl = (d: DayRow) => (multi ? `${+d.day.slice(5, 7)}/${+d.day.slice(8)} ` : "");
  for (const d of days) {
    if (d.in !== null) lists.in.push([d.emp, d.dept, `${dl(d)}${hm(d.in)}${d.out !== null ? ` ~ ${hm(d.out)}` : " · 퇴근 미체크"}`]);
    if (d.late) lists.late.push([d.emp, d.dept, `${dl(d)}${hm(d.in)} 출근`]);
    if (d.early && tagged(d.outSrc)) lists.early.push([d.emp, d.dept, `${dl(d)}${hm(d.out)} 퇴근`]);
    if (splitTypes(d.leave).includes("외출")) lists.out.push([d.emp, d.dept, `${dl(d)}${d.leaveOut || d.leaveIn || "외출"}`]);
    if (!d.holiday && d.status === "기록 없음" && d.day <= today) lists.absent.push([d.emp, d.dept, `${dl(d)}기록 없음`]);
    const ot = overtimeHours(d, rule) + holidayHours(d, rule);
    if (ot > 0) lists.ot.push([d.emp, d.dept, `${dl(d)}${d.holiday ? "휴일" : "연장"} ${Math.round(ot * 10) / 10}시간`]);
  }
  if (p === "next") {
    const lv = base.leaves.filter((l) => l.day === to && keep(l.name, empOf.get(l.name)?.dept ?? ""));
    for (const l of lv) {
      const dp = empOf.get(l.name)?.dept ?? "";
      if (l.type === "외출") lists.out.push([l.name, dp, "외출 신청"]);
      if (l.type === "휴일근무" || l.type === "연장근무") lists.ot.push([l.name, dp, `${l.type} 신청`]);
    }
  }
  const nextOff = p === "next" ? new Set(base.leaves.filter((l) => l.day === to && !["외출", "휴일근무", "연장근무"].includes(l.type)).map((l) => l.name)) : new Set<string>();
  const nextHoliday = p === "next" && isHoliday(to, rule, holidays);
  const persons = (xs: Who[]) => new Set(xs.map((x) => x[0])).size;
  const inCount = p === "day" ? persons(lists.in) : p === "next" ? (nextHoliday ? 0 : staffAt.filter((n) => !nextOff.has(n)).length) : lists.in.length;
  const value = (k: Kind) => (k === "in" ? inCount : lists[k].length);

  // 부서별 출근율 (기간 안 근무일 기준)
  const deptRate = depts.filter((d) => !dept || d === dept).map((d) => {
    const g = days.filter((x) => x.dept === d && !x.holiday);
    const ok = g.filter((x) => x.in !== null || splitTypes(x.leave).some((t) => ["출장", "교육", "외근"].includes(t))).length;
    return { d, n: g.length, pct: g.length ? (ok / g.length) * 100 : 0 };
  }).filter((x) => x.n);

  // 살펴볼 사람: 52시간·신청서 빠짐·지각 잦음·퇴근 미체크
  const watch: [string, string, string, string][] = [];
  if (p !== "next") {
    const wk = weekHours(days.length && p === "day" ? (await rosterDays(addDays(at, -weekday(at)), at)).days.filter((d) => keep(d.emp, d.dept)) : days, at, rule);
    wk.filter((w) => w.hours >= 48).forEach((w) => watch.push(["52시간", w.emp, `이번 주 ${Math.round(w.hours)}시간${w.hours > 52 ? " · 초과" : " · 경고"}`, "#be123c"]));
    const miss = (await missingProofs()).filter((m) => m.day >= from && m.day <= to && keep(m.emp, empOf.get(m.emp)?.dept ?? ""));
    miss.slice(0, 6).forEach((m) => watch.push(["신청서", m.emp, `${dayLabel(m.day)} ${m.kinds.join("·")} 신청서 없음`, "#b45309"]));
    const lateN = new Map<string, number>(); lists.late.forEach(([n]) => lateN.set(n, (lateN.get(n) ?? 0) + 1));
    [...lateN].filter(([, n]) => n >= 3).forEach(([n, c]) => watch.push(["지각", n, `${c}회`, "#c2410c"]));
    days.filter((d) => d.status === "퇴근 기록 없음" && d.day < today).slice(0, 5).forEach((d) => watch.push(["퇴근", d.emp, `${dayLabel(d.day)} 퇴근 미체크`, "#4b5563"]));
  }

  // 오늘 마감 단계: 캡스 기록 → 근태 확인(퇴근 미체크 없음) → 보고서 작성 → 발송
  const info = await store.reportInfo(today).catch(() => null);
  const stepAt = !records.some((r) => r.day === today) && p === "day" && at === today ? 0 : !info ? 2 : !info.sent_at ? 3 : 4;

  const summary = `[${label}] ${KINDS.map((k) => `${k.label} ${value(k.k)}`).join(" · ")}`;
  const unit = (k: Kind) => (k === "in" ? (p === "day" || p === "next" ? `/ ${staffAt.length}명` : "명·일") : k === "ot" ? "건" : p === "day" || p === "next" ? "명" : "회");

  return (
    <SnackHost>
      <div className="ux-page">
        {head}
        <div className="ux-bar-row noprint">
          <Suspense><Segment name="p" value={p} label="기준" options={PERIODS.map(([v, l]) => [v, l])} /></Suspense>
          <Suspense><ParamDate name="day" label="기준일" value={at} /></Suspense>
          <Suspense><ParamSelect name="dept" label="부서" value={dept} options={[["", "전 부서"], ...depts.map((d): [string, string] => [d, d])]} /></Suspense>
          <Suspense><ParamCheck name="app" on={withApp} label="일학습병행 포함" /></Suspense>
          <Suspense><ParamCheck name="exec" on={noExec} label="임원 제외" /></Suspense>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <span className="ux-sub">기준: <b>{label}</b></span><CopySummary text={summary} />
          </span>
        </div>

        {p === "day" && at === today && (
          <section className="ux-panel ux-rise" aria-label="오늘 마감 단계" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>오늘 마감</b>
            <Steps steps={["캡스 기록 올리기", "근태 확인", "보고서 작성", "발송"]} at={stepAt === 0 ? 0 : stepAt === 2 ? 2 : stepAt === 3 ? 3 : 4} />
            {stepAt < 4 && <Link href={stepAt === 0 ? "/upload" : "/daily"} style={{ marginLeft: "auto", fontSize: 13 }}>{stepAt === 0 ? "캡스 파일 올리기 ›" : stepAt === 2 ? "보고서 쓰기 ›" : "보고서 보내기 ›"}</Link>}
          </section>
        )}

        <div className="ux-cards">
          {KINDS.map((k, i) => {
            const v = value(k.k);
            const xs = lists[k.k];
            const card = (
              <span className="ux-card" style={{ animation: "ux-rise .45s ease both", animationDelay: `${0.05 + i * 0.06}s` }}>
                <span className="ux-card-l" style={{ color: k.color }}><span className="dot" style={{ background: k.color }} />{k.label}<Tip text={k.tip} label={`${k.label} 기준`} />
                  {k.k === "ot" && watch.some((w) => w[0] === "신청서") && <Badge bounce>신청서 {watch.filter((w) => w[0] === "신청서").length}</Badge>}
                  {k.k === "absent" && v > 0 && <Badge bounce>확인</Badge>}</span>
                <span className={`ux-num${v ? "" : " zero"}`}>{v.toLocaleString()}<small>{unit(k.k)}</small></span>
                <Bar pct={k.k === "in" ? (staffAt.length ? (inCount / Math.max(1, p === "day" || p === "next" ? staffAt.length : days.filter((d) => !d.holiday).length)) * 100 : 0) : Math.min(100, (v / Math.max(1, staffAt.length)) * 100)} color={k.color} label={`${k.label} 비율`} />
                <span className="ux-sub">{k.k === "in" ? (p === "next" ? `휴가·출장 예정 ${nextOff.size}명 제외` : `${persons(lists.in)}명 출근`) : xs.length ? `${persons(xs)}명` : "없음"}</span>
              </span>
            );
            return (
              <Modal key={k.k} className="ux-plain" title={`${k.label} · ${label}`} trigger={card} wide={xs.length > 12}>
                {xs.length ? (
                  <table className="ux-list"><thead><tr><th>이름</th><th>부서</th><th>내용</th></tr></thead>
                    <tbody>{xs.slice(0, 300).map(([n, d, t], j) => <tr key={j}><td><Link href={`/person?emp=${encodeURIComponent(n)}&month=${(t.match(/^(\d+)\//) ? `${at.slice(0, 4)}-${t.split("/")[0].padStart(2, "0")}` : at.slice(0, 7))}`}><b>{n}</b></Link></td><td>{d}</td><td>{t}</td></tr>)}</tbody></table>
                ) : <p className="ux-sub">{k.k === "in" && p === "next" ? `명일 근무 예정 ${inCount}명 (휴가·출장 예정자 제외)` : "해당하는 사람이 없습니다."}</p>}
                {xs.length > 300 && <p className="ux-sub">앞 300건만 보입니다.</p>}
              </Modal>
            );
          })}
        </div>

        <div className="ux-grid2">
          <section className="ux-panel ux-rise" style={{ animationDelay: ".42s" }}>
            <h2>부서별 출근율<small>{label} · 근무일 기준 (출장·교육 포함)</small></h2>
            {deptRate.length ? deptRate.map((x) => (
              <div key={x.d} className="ux-dept"><b>{x.d}</b><Bar pct={x.pct} label={`${x.d} 출근율`} /><span style={{ textAlign: "right", fontWeight: 700 }}>{Math.round(x.pct)}%</span></div>
            )) : <p className="ux-sub">{p === "next" ? "명일은 아직 기록이 없습니다." : "기록이 없습니다."}</p>}
          </section>
          <section className="ux-panel ux-rise" style={{ animationDelay: ".5s" }}>
            <h2>살펴볼 사람 {watch.length > 0 && <Badge>{watch.length}</Badge>}</h2>
            {watch.length ? (
              <table className="ux-list"><tbody>{watch.slice(0, 12).map(([tag, n, t, c], j) => (
                <tr key={j}><td style={{ width: 70 }}><span className="ux-tag" style={{ color: c, background: `${c}18` }}>{tag}</span></td><td><b>{n}</b></td><td className="ux-sub">{t}</td></tr>
              ))}</tbody></table>
            ) : <p className="ux-sub">살펴볼 사람이 없습니다.</p>}
          </section>
        </div>

        <section className="ux-panel ux-rise noprint" style={{ animationDelay: ".58s" }}>
          <h2>더 보기<small>예전 근태 화면과 대장</small></h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[["/calendar", "근태 캘린더"], ["/calendar/work", "휴일·연장 달력"], ["/hours", "근로시간 리포트"], ["/week52", "주 52시간"], ["/monthly", "월 근태 집계"],
              ["/hr/b/holidaywork", "휴일근무·대체휴무 대장"], ["/hr/b/flex", "유연근무 신청"], ["/hr/b/reserve", "예비군·민방위·공가"], ["/attendance/classic", "예전 근태 홈 (그래프)"]].map(([h, l]) => (
              <Link key={h} href={h} className="ux-btn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", color: "#1b2333" }}>{l}</Link>
            ))}
          </div>
        </section>

        <Fab href="/daily" label="보고서 쓰기" icon="pen" />
      </div>
    </SnackHost>
  );
}
