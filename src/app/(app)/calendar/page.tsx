/** 근태 캘린더: 출장·교육(부서별 색)·휴일근무·연장근무(이름만)를 달력으로. 같은 날 같은 곳으로 가는 사람은 한 줄로 묶는다. */
import SubNav from "@/components/SubNav";
import Link from "next/link";
import { Suspense } from "react";
import MonthCalendar, { type CalEntry } from "@/components/MonthCalendar";
import { ParamSelect } from "@/components/ParamControls";
import PrintButton from "@/components/PrintButton";
import { isHoliday } from "@/lib/analytics";
import { getHolidays, getRule, loadBase, type SearchParams } from "@/lib/data";
import { groupTrips } from "@/lib/evidence";
import { DEPT_COLORS } from "@/lib/org";
import { addDays, dayLabel, daysInMonth, makeDate, todayKst } from "@/lib/time";

export const metadata = { title: "근태 캘린더 · 근태관리통합시스템" };
const TYPES = ["출장", "교육", "휴일근무", "연장근무"];
const NAME_ONLY = new Set(["휴일근무", "연장근무"]); // 이름만 보여 주는 유형
const TYPE_SET = new Set(TYPES);
const firstLine = (s: string) => String(s).split("\n")[0].trim();

export default async function AttendanceCalendar({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [base, rule, holidays] = await Promise.all([loadBase(), getRule(), getHolidays()]);
  const today = todayKst();
  const lv = base.leaves.filter((l) => TYPES.includes(l.type));
  const months = [...new Set([today.slice(0, 7), addDays(today, 31).slice(0, 7), ...lv.map((l) => l.day.slice(0, 7))])].sort().reverse();
  const month = months.includes(String(sp.month)) ? String(sp.month) : today.slice(0, 7);
  const only = TYPES.includes(String(sp.type)) ? String(sp.type) : "";
  // 근태 기입에서 직접 적은 근무지·업무내용이 있으면 그것으로 (보고서가 없는 날도 반영)
  const ov = new Map(base.overrides.map((o) => [`${o.employee}|${o.day}`, o]));
  const mine = lv.filter((l) => l.day.startsWith(month) && (!only || l.type === only)).map((l) => {
    const o = ov.get(`${l.name}|${l.day}`);
    if (!o) return l;
    const [title, ...rest] = String(l.content).split("\n");
    const work = l.type === "연장근무" ? o.workOt ?? o.work : o.work;
    if (l.type === "휴일근무" || l.type === "연장근무") return work != null ? { ...l, content: work } : l;
    return { ...l, content: [o.place ?? title, work ?? rest.join(" ")].filter(Boolean).join("\n") };
  });
  const deptOf = new Map(base.employees.map((e) => [e.name, e.dept]));

  // 부서별 색 (직원 명부의 부서 순서)
  const deptName = (n: string) => deptOf.get(n) || "(부서 없음)";
  const deptList = [...new Set([...base.employees.map((e) => e.dept).filter(Boolean), ...mine.map((l) => deptName(l.name))])];
  const deptColor = (d: string) => DEPT_COLORS[deptList.indexOf(d) % DEPT_COLORS.length];
  const shownDepts = [...new Set(mine.filter((l) => !NAME_ONLY.has(l.type)).map((l) => deptName(l.name)))]
    .sort((a, b) => deptList.indexOf(a) - deptList.indexOf(b));

  // 출장·교육: 같은 날·유형·목적지끼리 한 줄 (부서가 달라도) / 휴일·연장근무: 그날 일한 사람 이름만 한 줄
  const groups = new Map<string, { day: string; type: string; title: string; dept: string; names: string[]; details: string[] }>();
  for (const l of mine) {
    const title = NAME_ONLY.has(l.type) ? "" : firstLine(l.content);
    const k = `${l.day}|${l.type}|${title}`;
    const g = groups.get(k) ?? { day: l.day, type: l.type, title, dept: "", names: [], details: [] };
    if (!g.names.includes(l.name)) g.names.push(l.name);
    const why = NAME_ONLY.has(l.type) ? `${l.name}: ${firstLine(l.content)}` : String(l.content).split("\n").slice(1).join(" ").trim();
    if (why && !g.details.includes(why)) g.details.push(why);
    groups.set(k, g);
  }
  // 같이 간 사람은 부서 순 → 이름 순. 줄 색은 첫 부서 색, 여러 부서면 이름마다 부서 색
  const byDept = (a: string, b: string) => deptList.indexOf(deptName(a)) - deptList.indexOf(deptName(b));
  for (const g of groups.values()) {
    if (NAME_ONLY.has(g.type)) continue;
    g.names.sort(byDept);
    g.dept = deptName(g.names[0]);
  }
  const deptsOf = (g: { names: string[] }) => [...new Set(g.names.map(deptName))];
  const entries: CalEntry[] = [...groups.values()]
    .sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || deptList.indexOf(a.dept) - deptList.indexOf(b.dept))
    .map((g) => {
      const mixed = !NAME_ONLY.has(g.type) && deptsOf(g).length > 1;
      const names = mixed
        ? g.names.map((n, i) => <span key={n}>{i ? ", " : ""}<span style={{ color: deptColor(deptName(n)) }}>{n}</span></span>)
        : g.names.join(", ");
      return {
        day: g.day, type: g.type,
        color: g.dept ? deptColor(g.dept) : undefined,
        text: NAME_ONLY.has(g.type)
          ? <><b>{g.type}</b> {names}</>
          : <><b>{g.type}</b> {g.title && <>{g.title} · </>}{names}</>,
        title: NAME_ONLY.has(g.type) ? `${g.type}\n${g.details.join("\n")}`
          : `${g.type} ${g.title}${g.details.length ? `\n${g.details.join(" / ")}` : ""}\n`
            + g.names.map((n) => `${n} (${deptName(n)})`).join(", "),
      };
    });
  const hols: Record<string, string | true> = {};
  for (let i = 1; i <= daysInMonth(month); i++) {
    const d = makeDate(+month.slice(0, 4), +month.slice(5), i)!;
    if (isHoliday(d, rule, holidays)) hols[d] = holidays[d] ?? true;
  }

  // 아래 목록: 기간이 이어지는 출장을 한 건으로, 같이 간 사람끼리 묶기
  const trips = new Map<string, { type: string; title: string; from: string; to: string; names: string[] }>();
  for (const t of groupTrips(mine, TYPE_SET)) {
    const k = `${t.type}|${t.title}|${t.from}|${t.to}`;
    const x = trips.get(k) ?? { type: t.type, title: t.title, from: t.from, to: t.to, names: [] };
    x.names.push(t.name);
    trips.set(k, x);
  }
  const list = [...trips.values()].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const count = (t: string) => new Set(mine.filter((l) => l.type === t).map((l) => `${l.day}|${l.name}`)).size;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>근태 캘린더</h1><Suspense><SubNav group="trip" /></Suspense>
          <div className="meta">출장·교육(부서별 색)·휴일근무·연장근무 · 하이웍스 근태현황과 일일 근태 보고서를 합친 내용</div>
        </div>
        <div className="row noprint">
          <Link className="btn" href="/evidence">출장 증빙</Link>
          <PrintButton />
        </div>
      </div>
      <div className="card">
        <div className="card-title noprint" style={{ flexWrap: "wrap" }}>
          <Suspense><ParamSelect name="month" value={month} options={months.map((m) => [m, `${+m.slice(0, 4)}년 ${+m.slice(5)}월`])} /></Suspense>
          <span className="seg">
            <Link href={`/calendar?month=${month}`} className={only ? "" : "on"} scroll={false}>전체</Link>
            {TYPES.map((t) => <Link key={t} href={`/calendar?month=${month}&type=${t}`} className={only === t ? "on" : ""} scroll={false}>{t} {count(t)}</Link>)}
          </span>
          <span className="spacer" />
          <span className="legend" style={{ flexWrap: "wrap" }}>
            {shownDepts.map((d) => <span key={d} className="tag" style={{ color: deptColor(d), background: `${deptColor(d)}1a` }}>{d}</span>)}
            {TYPES.filter((t) => NAME_ONLY.has(t)).map((t) => <span key={t} className={`tag t-${t}`}>{t}</span>)}
          </span>
        </div>
        <h2 className="print-only" style={{ margin: "0 0 8px" }}>{+month.slice(0, 4)}년 {+month.slice(5)}월 근태 캘린더 (출장·교육·휴일근무·연장근무)</h2>
        <MonthCalendar month={month} today={today} holidays={hols} entries={entries} />
        <p className="caption" style={{ marginTop: 8 }}>출장·교육은 부서별 색으로, 같은 날 같은 곳에 간 사람은 부서가 달라도 한 줄로 묶었습니다 (여러 부서면 이름을 부서 색으로). 휴일·연장근무는 그날 일한 사람 이름만 보여 주고, 마우스를 올리면 작업 내용이 보입니다. 휴일근무는 일일 근태 보고서에 체크한 실제 근무일에 표시됩니다. 마우스를 올리면 내용이 보입니다.</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">{+month.slice(5)}월 출장·교육·휴일·연장 목록 <span className="muted" style={{ fontWeight: 400 }}>({list.length}건)</span></div>
        {list.length ? (
          <table className="tbl"><thead><tr><th>기간</th><th>유형</th><th>목적지·사유·작업내용</th><th>인원</th></tr></thead>
            <tbody>{list.map((t) => (
              <tr key={`${t.type}|${t.title}|${t.from}|${t.to}`}>
                <td>{t.from === t.to ? dayLabel(t.from) : `${dayLabel(t.from)} ~ ${dayLabel(t.to)}`}</td>
                <td><span className={`tag t-${t.type}`}>{t.type}</span></td>
                <td style={{ whiteSpace: "normal" }}><b>{t.title || "-"}</b></td>
                <td style={{ whiteSpace: "normal" }}>{t.names.map((n) => `${n}${deptOf.get(n) ? ` (${deptOf.get(n)})` : ""}`).join(", ")}
                  <span className="muted"> · {t.names.length}명</span></td>
              </tr>
            ))}</tbody></table>
        ) : <p className="muted">이 달의 출장·교육·휴일근무·연장근무가 없습니다.</p>}
      </div>
    </>
  );
}
