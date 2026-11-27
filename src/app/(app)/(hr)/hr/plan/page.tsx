/** 인력계획 (2026-11-27 새로): 직원채용·조직 관리를 합친 묶음의 대시보드.
 *  현원(부서별 정원 대비) · 인력 충원계획(요청→승인→공고→완료) · 조직도 · 직무기술서 · 업무분장 */
import Link from "next/link";
import { Suspense } from "react";
import { ParamDate } from "@/components/ParamControls";
import { Badge, Bar, Modal, ParamCheck, Segment, SnackHost, Steps, Tip, UxHead } from "@/components/ux/Kit";
import { PLAN_MENU } from "@/lib/인사노무/attMenu";
import { loadBase, type SearchParams } from "@/lib/인사노무/data";
import { activeNames, asOf } from "@/lib/인사노무/employees";
import { type HirePlan, PLAN_STAGES } from "@/lib/인사노무/hrPlan";
import { loadJobs } from "@/lib/인사노무/jobdescData";
import { loadRows } from "@/lib/대장/store";
import * as store from "@/lib/store";
import { isDateStr, todayKst } from "@/lib/time";
import { CapacityInput, PlanActions, PlanFab } from "./PlanClient";

export const metadata = { title: "인력계획 · 근태관리통합시스템" };
const VIEWS: [string, string][] = [["home", "현원"], ["plans", "충원계획"], ["org", "조직도"], ["jobs", "직무기술서"], ["duty", "업무분장"]];
const COLORS = ["#0c3994", "#0e7490", "#7c3aed", "#b45309", "#be123c", "#4b5563", "#1f8a3b", "#c2410c"];

export default async function PlanPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const today = todayKst();
  const at = isDateStr(sp.day) ? String(sp.day) : today;
  const v = VIEWS.some(([x]) => x === sp.v) ? String(sp.v) : "home";
  const withApp = sp.app !== "0";
  const [base, cap, plans] = await Promise.all([loadBase(), store.getSetting<Record<string, number>>("hr_capacity", {}), store.getSetting<HirePlan[]>("hr_plans", [])]);
  const act = base.employees.filter((e) => activeNames([e], at, at).length).map((e) => asOf(e, at)).filter((e) => withApp || !/일학습/.test(e.dept));
  const byDept = new Map<string, typeof act>();
  for (const e of act) byDept.set(e.dept || "부서 없음", [...(byDept.get(e.dept || "부서 없음") ?? []), e]);
  const depts = [...byDept.keys()];
  const cur = act.length;
  const capTotal = depts.reduce((t, d) => t + (cap[d] ?? 0), 0);
  const hasCap = depts.some((d) => cap[d] !== undefined);
  const need = depts.reduce((t, d) => t + Math.max(0, (cap[d] ?? byDept.get(d)!.length) - byDept.get(d)!.length), 0);
  const month = at.slice(0, 7);
  const joined = base.employees.filter((e) => (e.joinDate ?? "").startsWith(month)).length;
  const left = base.employees.filter((e) => (e.leaveDate ?? "").startsWith(month)).length;
  const open = plans.filter((p) => p.stage < PLAN_STAGES.length);

  const kpi = [
    { label: "현원", v: cur, u: "명", c: "#0c3994", tip: "기준일에 재직 중인 직원 (직원 명부)", sub: `${depts.length}개 부서` },
    { label: "정원", v: hasCap ? capTotal : "-", u: hasCap ? "명" : "", c: "#0e7490", tip: "부서별 정원 합계 — 아래 부서별 인원에서 숫자를 넣으면 저장", sub: hasCap ? "부서별 정원 합" : "아래에서 넣어 주세요" },
    { label: "충원 필요", v: need, u: "명", c: "#be123c", tip: "부서마다 (정원 − 현원) 합. 정원을 안 넣은 부서는 0", sub: open.length ? `진행 중 충원계획 ${open.length}건` : "진행 중 계획 없음", badge: need > 0 },
    { label: "이번 달 입퇴사", v: `${joined} / ${left}`, u: "명", c: "#7c3aed", tip: "기준일이 든 달의 입사 / 퇴사", sub: `입사 ${joined} · 퇴사 ${left}` },
  ];

  const jobs = v === "jobs" ? (await loadJobs()).jobs : [];
  const revs = v === "duty" ? (await loadRows("revisions").catch(() => [])).slice(0, 30) : [];

  return (
    <SnackHost>
      <div className="ux-page">
        <UxHead crumb="인사노무 › 인력계획" title="인력계획" menu={PLAN_MENU} right={<>직원 명부 기준 {at}</>} />
        <div className="ux-bar-row noprint">
          <Suspense><Segment name="v" value={v} label="보기" options={VIEWS.map(([x, l]) => [x, l, x === "plans" && open.length ? open.length : undefined])} /></Suspense>
          <Suspense><ParamDate name="day" label="기준일" value={at} /></Suspense>
          <Suspense><ParamCheck name="app" on={withApp} label="일학습병행 포함" /></Suspense>
        </div>

        {v === "home" && <>
          <div className="ux-cards">
            {kpi.map((k, i) => (
              <div key={k.label} className="ux-card ux-rise" style={{ animationDelay: `${0.05 + i * 0.07}s` }}>
                <span className="ux-card-l" style={{ color: k.c }}><span className="dot" style={{ background: k.c }} />{k.label}<Tip text={k.tip} />{k.badge && <Badge bounce>!</Badge>}</span>
                <span className="ux-num">{k.v}<small>{k.u}</small></span>
                <span className="ux-sub">{k.sub}</span>
              </div>
            ))}
          </div>
          <section className="ux-panel ux-rise" style={{ animationDelay: ".3s" }}>
            <h2>부서별 인원<small>정원 칸에 숫자를 넣으면 저장 · 부서 이름을 누르면 명단</small></h2>
            {depts.map((d, i) => {
              const ppl = byDept.get(d)!, c = cap[d] ?? null;
              return (
                <div key={d} className="ux-dept" style={{ gridTemplateColumns: "110px 1fr 170px" }}>
                  <Modal className="ux-plain" title={`${d} · ${ppl.length}명`} trigger={<b style={{ color: COLORS[i % COLORS.length], textDecoration: "underline dotted" }}>{d}</b>}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{ppl.map((e) => <span key={e.name} style={{ border: "1px solid #e3e7ef", borderRadius: 99, padding: "5px 12px", fontSize: 14 }}>{e.name} <small className="ux-sub">{e.rank}</small></span>)}</div>
                  </Modal>
                  <Bar pct={c ? (ppl.length / c) * 100 : 100} color={c && ppl.length < c ? "#be123c" : COLORS[i % COLORS.length]} label={`${d} 정원 대비 현원`} />
                  <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                    <b>{ppl.length}</b> / <CapacityInput dept={d} value={c} />명
                    {c !== null && c > ppl.length && <span style={{ color: "#be123c", fontWeight: 800 }}>−{c - ppl.length}</span>}
                  </span>
                </div>
              );
            })}
          </section>
        </>}

        {v === "plans" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {plans.length ? plans.map((p, i) => (
              <div key={p.id} className="ux-panel ux-rise" style={{ animationDelay: `${0.05 + i * 0.07}s` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 16 }}>{p.title}</b><span className="ux-sub">{p.dept} · {p.n}명{p.why ? ` · ${p.why}` : ""}</span>
                  {p.stage >= PLAN_STAGES.length && <Badge tone="green">완료</Badge>}
                  <span className="ux-sub" style={{ marginLeft: "auto" }}>{p.when ? `희망 입사 ${p.when}` : ""} · 요청 {p.created}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                  <Steps steps={PLAN_STAGES} at={p.stage} color="#0e7490" />
                  <span style={{ marginLeft: "auto" }}><PlanActions plan={p} /></span>
                </div>
              </div>
            )) : <div className="ux-panel"><p className="ux-sub" style={{ margin: 0 }}>충원계획이 없습니다. 오른쪽 아래 [충원 요청]으로 올리세요.</p></div>}
          </section>
        )}

        {v === "org" && (
          <section className="ux-panel ux-rise">
            <h2>조직 한눈에<small>부서별 인원 · 크게 보기·인쇄는 조직도 화면에서</small></h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
              {depts.map((d, i) => (
                <div key={d} className="ux-rise" style={{ border: `2px solid ${COLORS[i % COLORS.length]}`, borderRadius: 12, padding: "10px 12px", animationDelay: `${0.05 + i * 0.06}s` }}>
                  <div style={{ fontWeight: 800, color: COLORS[i % COLORS.length] }}>{d} <small className="ux-sub">{byDept.get(d)!.length}명</small></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>{byDept.get(d)!.map((e) => <span key={e.name} style={{ background: "#f4f6fa", borderRadius: 8, padding: "3px 8px", fontSize: 12.5 }}>{e.name} <small className="ux-sub">{e.rank}</small></span>)}</div>
                </div>
              ))}
            </div>
            <p style={{ margin: "12px 0 0" }}><Link href="/org">조직도 크게 보기 · 사내용/대외용 인쇄 ›</Link></p>
          </section>
        )}

        {v === "jobs" && (
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {jobs.map((j, i) => {
              const filled = [j.purpose, j.tasks.length, j.knowledge.length, j.skills.length, j.edu, j.kpis.length].filter(Boolean).length;
              const pct = Math.round((filled / 6) * 100);
              return (
                <Link key={j.id} href={`/jobs?id=${encodeURIComponent(j.id)}`} className="ux-card ux-rise" style={{ animationDelay: `${0.03 + i * 0.03}s`, textDecoration: "none" }}>
                  <span className="ux-card-l"><b style={{ fontSize: 15, color: "#1b2333" }}>{j.name}</b>
                    <span className="ux-tag" style={{ marginLeft: "auto", color: j.example ? "#8a5a00" : pct === 100 ? "#1f6b35" : "#4b5563", background: j.example ? "#fff3d6" : pct === 100 ? "#e3f4e8" : "#eceff4" }}>{j.example ? "예시 그대로" : pct === 100 ? "작성 완료" : "작성 중"}</span></span>
                  <span className="ux-sub">{j.dept}{j.updated ? ` · ${j.updated}` : ""}</span>
                  <Bar pct={pct} color="#0e7490" label={`${j.name} 작성 정도`} />
                </Link>
              );
            })}
            {!jobs.length && <div className="ux-panel"><Link href="/jobs">직무기술서 화면 ›</Link></div>}
          </section>
        )}

        {v === "duty" && (
          <section className="ux-panel ux-rise">
            <h2>업무분장 · 규정 개정 이력<small><Link href="/hr/duties">업무분장·업무 목록</Link> · <Link href="/hr/b/revisions">개정 대장</Link></small></h2>
            {revs.length ? (
              <table className="ux-list"><thead><tr><th>시행일</th><th>문서</th><th>개정</th><th>바뀐 내용</th><th>신고·게시</th></tr></thead>
                <tbody>{revs.map((r) => <tr key={r.id}><td>{r.data.day}</td><td><b>{r.data.doc}</b></td><td>{r.data.rev}</td><td>{r.data.change}</td>
                  <td><span className="ux-tag" style={{ color: /필요/.test(r.data.report ?? "") ? "#be123c" : "#1f6b35", background: /필요/.test(r.data.report ?? "") ? "#ffe4e8" : "#e3f4e8" }}>{r.data.report || "-"}</span></td></tr>)}</tbody></table>
            ) : <p className="ux-sub">개정 이력이 없습니다. <Link href="/hr/b/revisions#form">개정 대장에 적기 ›</Link></p>}
          </section>
        )}

        <PlanFab depts={depts} />
      </div>
    </SnackHost>
  );
}
