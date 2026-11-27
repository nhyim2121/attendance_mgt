/** 근태관리 > 일학습병행(도제) (2026-11-27 새로): 도제 학습근로자의 월별 출근·근무시간·지각, 일일 보고서 도제 칸 비고(외부평가 등),
 *  인력 제도 대장의 일학습병행 사업 기간·다음 할 일. */
import Link from "next/link";
import { Suspense } from "react";
import { ParamSelect } from "@/components/ParamControls";
import { Badge, Bar, Fab, Modal, SnackHost, Steps, Tip, UxHead } from "@/components/ux/Kit";
import { netHours } from "@/lib/인사노무/dashboard";
import { getRule, loadBase, rosterDays, type SearchParams } from "@/lib/인사노무/data";
import { ATT_MENU } from "@/lib/인사노무/attMenu";
import { activeNames } from "@/lib/인사노무/employees";
import { loadRows } from "@/lib/대장/store";
import * as store from "@/lib/store";
import { dayLabel, daysInMonth, todayKst, tsHM } from "@/lib/time";

const mm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const metadata = { title: "일학습병행(도제) · 근태관리통합시스템" };

export default async function ApprenticePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [rule, base] = await Promise.all([getRule(), loadBase()]);
  const today = todayKst();
  const months = [...new Set([today.slice(0, 7), ...base.months.map((m) => m.month)])].sort().reverse();
  const month = months.includes(String(sp.month)) ? String(sp.month) : today.slice(0, 7);
  const from = `${month}-01`, to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const apprentices = base.employees.filter((e) => /일학습|도제/.test(e.dept) && activeNames([e], from, to).length).map((e) => e.name);
  const who = apprentices.includes(String(sp.emp)) ? String(sp.emp) : apprentices[0] ?? "";
  const { days } = who ? await rosterDays(from, to < today ? to : today) : { days: [] };
  const mine = days.filter((d) => d.emp === who).sort((a, b) => a.day.localeCompare(b.day));
  const work = mine.filter((d) => d.in !== null);
  const hours = Math.round(work.reduce((t, d) => t + (netHours(d, rule) ?? 0), 0) * 10) / 10;
  const late = mine.filter((d) => d.late);
  const absent = mine.filter((d) => !d.holiday && d.status === "기록 없음");
  const workdays = mine.filter((d) => !d.holiday).length;
  const sched = rule.byEmp?.[who];
  // 일일 보고서 도제 칸 (그 달)
  const rep = (await store.loadReportRows().catch(() => [])).filter((r) => r.section === "도제" && r.name === who && (r.day ?? "").startsWith(month));
  const notes = [...new Map(rep.filter((r) => r.note?.trim()).map((r) => [r.note.trim(), r.day ?? ""])).entries()];
  // 인력 제도 대장: 일학습병행 사업
  const progs = (await loadRows("programs").catch(() => [])).filter((r) => /일학습/.test(r.data.kind ?? "") && (!r.data.who || r.data.who.includes(who)));
  const prog = progs.find((r) => r.data.status !== "종료") ?? progs[0];
  const stage = (() => {
    if (!prog) return 0;
    const f = prog.data.from ?? "", t = prog.data.to ?? "";
    if (!f || today < f) return 0;
    if (t && today > t) return 4;
    const n = String(prog.data.next ?? "");
    return /외부평가/.test(n) ? 3 : /내부평가/.test(n) ? 2 : 1;
  })();
  const kpi: { label: string; v: string | number; u: string; c: string; tip: string; list: [string, string][]; bounce?: boolean }[] = [
    { label: "출근일", v: work.length, u: `/ ${workdays}일`, c: "#0c3994", tip: "캡스 출근 기록이 있는 날 (휴일 제외 근무일 대비)", list: work.map((d) => [dayLabel(d.day), `${d.in !== null ? tsHM(d.in) : ""} ~ ${d.out !== null ? tsHM(d.out) : "미체크"}`]) },
    { label: "근무시간", v: hours, u: "시간", c: "#0e7490", tip: "출퇴근 시각에서 휴게시간을 뺀 실근로시간 합", list: work.map((d) => [dayLabel(d.day), `${Math.round((netHours(d, rule) ?? 0) * 10) / 10}시간`]) },
    { label: "지각", v: late.length, u: "회", c: "#c2410c", tip: "개인 근무 기준 시각을 넘어 출근", list: late.map((d) => [dayLabel(d.day), d.in !== null ? tsHM(d.in) : ""]) },
    { label: "결근", v: absent.length, u: "일", c: "#be123c", tip: "근무일인데 캡스 기록·휴가가 없는 날 (오늘까지)", list: absent.filter((d) => d.day <= today).map((d) => [dayLabel(d.day), "기록 없음"]), bounce: absent.some((d) => d.day <= today) },
  ];

  return (
    <SnackHost>
      <div className="ux-page">
        <UxHead crumb="인사노무 › 근태관리" title="일학습병행(도제)" menu={ATT_MENU} />
        <div className="ux-bar-row noprint">
          <Suspense><ParamSelect name="month" label="월" value={month} options={months.map((m) => [m, `${m.slice(0, 4)}년 ${+m.slice(5)}월`])} /></Suspense>
          {apprentices.length > 1 && <Suspense><ParamSelect name="emp" label="학습근로자" value={who} options={apprentices.map((n) => [n, n])} /></Suspense>}
          <span className="ux-sub" style={{ marginLeft: "auto" }}>{who ? <>학습근로자 <b>{who}</b>{sched ? ` · 근무 ${sched.workdays ? sched.workdays.map((w) => "월화수목금토일"[w] ?? "").join("·") + " " : ""}${mm(sched.start ?? rule.start)}~${mm(sched.end ?? rule.end)}` : ""}</> : "일학습병행 직원이 없습니다 (직원 관리에서 부서를 '일학습'으로)."}</span>
        </div>

        {prog && (
          <section className="ux-panel ux-rise">
            <h2>{prog.data.name}<small>{prog.data.from ?? ""} ~ {prog.data.to ?? ""} · {prog.data.status ?? ""}</small></h2>
            <Steps steps={["시작", "학습 (OJT·Off-JT)", "내부평가", "외부평가", "수료"]} at={stage} color="#1f8a3b" />
            {prog.data.next && <p className="ux-sub" style={{ margin: "10px 0 0" }}>다음 할 일: <b style={{ color: "#1b2333" }}>{prog.data.next}</b>{prog.data.nextDue ? ` · ${prog.data.nextDue}까지` : ""}</p>}
          </section>
        )}

        <div className="ux-cards">
          {kpi.map((k, i) => (
            <Modal key={k.label} className="ux-plain" title={`${who} · ${k.label} · ${+month.slice(5)}월`} trigger={
              <span className="ux-card" style={{ animation: "ux-rise .45s ease both", animationDelay: `${0.05 + i * 0.07}s` }}>
                <span className="ux-card-l" style={{ color: k.c }}><span className="dot" style={{ background: k.c }} />{k.label}<Tip text={k.tip} />{k.bounce && <Badge bounce>확인</Badge>}</span>
                <span className={`ux-num${Number(k.v) ? "" : " zero"}`}>{k.v}<small>{k.u}</small></span>
                {k.label === "출근일" ? <Bar pct={workdays ? (work.length / workdays) * 100 : 0} color={k.c} label="출근률" /> : <span className="ux-sub">{k.list.length ? `${k.list.length}건` : "없음"}</span>}
              </span>}>
              {k.list.length ? <table className="ux-list"><tbody>{k.list.map(([a, b], j) => <tr key={j}><td>{a}</td><td>{b}</td></tr>)}</tbody></table> : <p className="ux-sub">없습니다.</p>}
            </Modal>
          ))}
        </div>

        <div className="ux-grid2">
          <section className="ux-panel ux-rise" style={{ animationDelay: ".35s" }}>
            <h2>날짜별 출퇴근<small>{+month.slice(5)}월</small></h2>
            {mine.length ? (
              <table className="ux-list"><thead><tr><th>날짜</th><th>출근</th><th>퇴근</th><th>근태</th></tr></thead>
                <tbody>{mine.filter((d) => !d.holiday || d.in !== null).map((d) => (
                  <tr key={d.day}><td>{dayLabel(d.day)}</td><td>{d.in !== null ? tsHM(d.in) : "-"}</td><td>{d.out !== null ? tsHM(d.out) : "-"}</td>
                    <td>{d.late ? <span className="ux-tag" style={{ color: "#c2410c", background: "#ffedd5" }}>지각</span> : null} {d.leave || (d.status === "기록 없음" && !d.holiday ? <span className="ux-tag" style={{ color: "#be123c", background: "#ffe4e8" }}>기록 없음</span> : "")}</td></tr>
                ))}</tbody></table>
            ) : <p className="ux-sub">이 달 기록이 없습니다.</p>}
          </section>
          <section className="ux-panel ux-rise" style={{ animationDelay: ".42s" }}>
            <h2>보고서 도제 칸 메모<small>일일 근태 보고서에서</small></h2>
            {notes.length ? <table className="ux-list"><tbody>{notes.map(([n, d]) => <tr key={n}><td style={{ width: 90 }} className="ux-sub">{d ? dayLabel(d) : ""}</td><td>{n}</td></tr>)}</tbody></table>
              : <p className="ux-sub">이 달 보고서에 적은 메모가 없습니다.</p>}
            <p className="ux-sub" style={{ marginTop: 10 }}>사업 기간·다음 할 일은 <Link href="/hr/b/programs">인력 제도 대장</Link>에서 고칩니다.</p>
          </section>
        </div>
        <Fab href={who ? `/person?emp=${encodeURIComponent(who)}&month=${month}` : "/person"} label="근태 기입" icon="pen" />
      </div>
    </SnackHost>
  );
}
