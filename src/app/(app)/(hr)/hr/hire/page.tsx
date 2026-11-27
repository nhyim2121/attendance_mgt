/** 채용관리 (2026-11-27 새로): 채용 진행 대장(공고) + 지원자 관리를 한 화면에.
 *  한눈에(서류→면접→합격→불합격 칸) · 채용공고(마감 D-day·진행막대·단계) · 지원자(체크·파기 기한) · 면접 · 합격·불합격 */
import Link from "next/link";
import { Suspense } from "react";
import { ParamDate, ParamSelect } from "@/components/ParamControls";
import { Badge, Bar, Fab, ParamCheck, Segment, SnackHost, Steps, Tip, UxHead } from "@/components/ux/Kit";
import { HIRE_MENU } from "@/lib/인사노무/attMenu";
import { type SearchParams } from "@/lib/인사노무/data";
import { daysTo } from "@/lib/대장/logic";
import { loadBooks } from "@/lib/대장/store";
import { dayLabel, isDateStr, todayKst } from "@/lib/time";
import { type App, ApplicantCard } from "./HireClient";

export const metadata = { title: "채용관리 · 근태관리통합시스템" };
const VIEWS: [string, string][] = [["home", "한눈에"], ["posts", "채용공고"], ["apps", "지원자"], ["iv", "면접"], ["done", "합격·불합격"]];
const POST_FLOW = ["준비", "공고 중", "서류 심사", "면접", "합격 통보", "입사 완료"];
const COLS: [string, string, string[]][] = [
  ["서류", "#6b7280", ["서류 검토", "서류 합격", ""]],
  ["면접", "#7c3aed", ["면접 예정", "면접 완료"]],
  ["합격", "#1f8a3b", ["최종 합격", "입사 확정"]],
  ["불합격", "#be123c", ["불합격", "지원 취소·포기"]],
];

export default async function HirePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const today = todayKst();
  const v = VIEWS.some(([x]) => x === sp.v) ? String(sp.v) : "home";
  const ivDay = isDateStr(sp.day) ? String(sp.day) : today;
  const showClosed = sp.closed === "1";
  const rows = await loadBooks(["recruit", "applicants"]);
  const posts = rows.filter((r) => r.book === "recruit").sort((a, b) => String(b.data.posted ?? "").localeCompare(String(a.data.posted ?? "")));
  const openPost = (d: Record<string, string>) => !["입사 완료", "채용 취소"].includes(d.status ?? "");
  const shownPosts = posts.filter((p) => showClosed || openPost(p.data));
  const postOpts: [string, string][] = [["", showClosed ? "모든 공고" : "진행 중 공고 전체"], ...shownPosts.map((p): [string, string] => [p.data.position ?? "", `${p.data.position ?? ""}${p.data.channel ? ` (${p.data.channel})` : ""}`])];
  const post = String(sp.post ?? "");
  const apps: App[] = rows.filter((r) => r.book === "applicants").map((r) => ({
    id: r.id, name: r.data.name ?? "", posting: r.data.posting ?? "", stage: r.data.stage || "서류 검토", interview: r.data.interview ?? "",
    years: r.data.years ?? "", score: r.data.score ?? "", notice: r.data.notice ?? "", purge: r.data.purge ?? "", got: r.data.got ?? r.day ?? "",
  })).filter((a) => (!post || a.posting.includes(post)) && (showClosed || !["입사 확정", "지원 취소·포기"].includes(a.stage) || a.got >= today.slice(0, 7)));

  const ivToday = apps.filter((a) => a.interview === ivDay);
  const waitNotice = apps.filter((a) => (a.stage === "최종 합격" || a.stage === "불합격") && !a.notice);
  const purgeSoon = apps.filter((a) => a.purge && daysTo(today, a.purge) <= 14 && a.stage === "불합격");
  const kpi = [
    { label: "진행 중 공고", v: posts.filter((p) => openPost(p.data)).length, u: "건", c: "#7c3aed", tip: "진행이 '입사 완료·채용 취소'가 아닌 공고 (채용 진행 대장)", sub: posts.filter((p) => openPost(p.data)).map((p) => p.data.position).slice(0, 2).join(" · ") || "없음" },
    { label: "지원자", v: apps.length, u: "명", c: "#0c3994", tip: "지원자 관리 대장 (고른 공고)", sub: `면접 ${apps.filter((a) => a.stage.startsWith("면접")).length} · 합격 ${apps.filter((a) => a.stage === "최종 합격").length}` },
    { label: ivDay === today ? "오늘 면접" : `${dayLabel(ivDay)} 면접`, v: ivToday.length, u: "건", c: "#0e7490", tip: "면접일이 기준일인 지원자", sub: ivToday.map((a) => a.name).join(", ") || "없음", badge: ivToday.length > 0 },
    { label: "통보·파기 할 일", v: waitNotice.length + purgeSoon.length, u: "건", c: "#be123c", tip: "결과를 정했지만 통보일이 없는 사람 + 서류 반환·파기 기한이 14일 안인 불합격자 (채용절차법)", sub: `통보 ${waitNotice.length} · 파기 ${purgeSoon.length}` },
  ];

  return (
    <SnackHost>
      <div className="ux-page">
        <UxHead crumb="인사노무 › 채용관리" title="채용관리" menu={HIRE_MENU} />
        <div className="ux-bar-row noprint">
          <Suspense><Segment name="v" value={v} label="보기" options={VIEWS.map(([x, l]) => [x, l, x === "iv" && ivToday.length ? ivToday.length : undefined])} /></Suspense>
          <Suspense><ParamSelect name="post" label="공고" value={post} options={postOpts} /></Suspense>
          <Suspense><ParamDate name="day" label="면접일" value={ivDay} /></Suspense>
          <Suspense><ParamCheck name="closed" on={showClosed} label="마감·끝난 것도" /></Suspense>
        </div>

        {v === "home" && <>
          <div className="ux-cards">
            {kpi.map((k, i) => (
              <div key={k.label} className="ux-card ux-rise" style={{ animationDelay: `${0.05 + i * 0.07}s` }}>
                <span className="ux-card-l" style={{ color: k.c }}><span className="dot" style={{ background: k.c }} />{k.label}<Tip text={k.tip} />{k.badge && <Badge bounce>오늘</Badge>}</span>
                <span className={`ux-num${k.v ? "" : " zero"}`}>{k.v}<small>{k.u}</small></span>
                <span className="ux-sub">{k.sub}</span>
              </div>
            ))}
          </div>
          <div className="ux-kanban">
            {COLS.map(([t, c, st], i) => {
              const xs = apps.filter((a) => st.includes(a.stage));
              return (
                <section key={t} className="ux-col ux-rise" style={{ animationDelay: `${0.3 + i * 0.08}s` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: c }} /><b>{t}</b><span className="ux-sub" style={{ marginLeft: "auto" }}>{xs.length}명</span></div>
                  {xs.map((a) => <ApplicantCard key={a.id} a={a} />)}
                  {!xs.length && <span className="ux-sub">없음</span>}
                </section>
              );
            })}
          </div>
        </>}

        {v === "posts" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {shownPosts.length ? shownPosts.map((p, i) => {
              const d = p.data, left = d.deadline ? daysTo(today, d.deadline) : null;
              const span = d.posted && d.deadline ? Math.max(1, daysTo(d.posted, d.deadline)) : 0;
              const pv = span ? Math.min(100, Math.max(0, (daysTo(d.posted, today) / span) * 100)) : 0;
              const at = Math.max(0, POST_FLOW.indexOf(d.status ?? "준비"));
              return (
                <Link key={p.id} href={`/hr/b/recruit?id=${p.id}`} className="ux-panel ux-rise" style={{ animationDelay: `${0.05 + i * 0.07}s`, textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 16 }}>{d.position}</b><span className="ux-sub">{[d.dept, d.n ? `${d.n}명` : "", d.channel, d.posted && `${d.posted} ~ ${d.deadline ?? ""}`].filter(Boolean).join(" · ")}</span>
                    {left !== null && <span style={{ marginLeft: "auto" }}><Badge tone={left < 0 ? "navy" : left <= 7 ? "red" : "amber"}>{left < 0 ? "마감" : left === 0 ? "D-day" : `D-${left}`}</Badge></span>}
                  </div>
                  {span > 0 && <div style={{ margin: "10px 0" }}><Bar pct={pv} color="#7c3aed" label="공고 기간 진행" /></div>}
                  <Steps steps={POST_FLOW.slice(1)} at={Math.max(0, at - 1) + (d.status === "입사 완료" ? 1 : 0)} color="#7c3aed" />
                  <div className="ux-sub" style={{ marginTop: 8 }}>지원 {apps.filter((a) => d.position && a.posting.includes(d.position)).length || d.applicants || 0}명{d.interview ? ` · 면접 ${d.interview}` : ""}{d.hired ? ` · 합격 ${d.hired}` : ""}</div>
                </Link>
              );
            }) : <div className="ux-panel"><p className="ux-sub" style={{ margin: 0 }}>공고가 없습니다. 오른쪽 아래 [새 공고]로 채용 진행 대장에 적으세요.</p></div>}
          </section>
        )}

        {v === "apps" && (
          <section className="ux-panel ux-rise">
            <table className="ux-list">
              <thead><tr><th>지원자</th><th>공고</th><th>접수</th><th>경력</th><th>단계</th><th><span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>반환·파기 기한<Tip text="채용절차법: 불합격자가 서류 반환을 청구할 수 있는 기간(회사가 14~180일 중 정함) 동안 보관하고, 지나면 파기합니다." /></span></th></tr></thead>
              <tbody>{apps.map((a) => (
                <tr key={a.id}><td><Link href={`/hr/applicant?id=${a.id}`}><b>{a.name}</b></Link></td><td>{a.posting}</td><td>{a.got}</td><td>{a.years ? `${a.years}년` : ""}</td>
                  <td><span className="ux-tag" style={tagStyle(a.stage)}>{a.stage}</span></td>
                  <td className={a.purge && daysTo(today, a.purge) <= 14 ? "" : "ux-sub"} style={a.purge && daysTo(today, a.purge) <= 14 ? { color: "#be123c", fontWeight: 700 } : undefined}>{a.purge || "—"}</td></tr>
              ))}</tbody>
            </table>
            {!apps.length && <p className="ux-sub">지원자가 없습니다.</p>}
          </section>
        )}

        {v === "iv" && (
          <section className="ux-panel ux-rise">
            <h2>{dayLabel(ivDay, true)} 면접 {ivToday.length}건</h2>
            {ivToday.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>{ivToday.map((a) => <ApplicantCard key={a.id} a={a} />)}</div> : <p className="ux-sub">이날 면접이 없습니다.</p>}
            <h2 style={{ marginTop: 16 }}>앞으로 면접</h2>
            <table className="ux-list"><tbody>{apps.filter((a) => a.interview > ivDay).sort((x, y) => x.interview.localeCompare(y.interview)).map((a) => <tr key={a.id}><td style={{ width: 120 }}>{dayLabel(a.interview)}</td><td><b>{a.name}</b></td><td className="ux-sub">{a.posting}</td></tr>)}</tbody></table>
          </section>
        )}

        {v === "done" && (
          <section className="ux-panel ux-rise">
            <table className="ux-list"><thead><tr><th>지원자</th><th>결과</th><th>공고</th><th>통보일</th><th>다음 할 일</th></tr></thead>
              <tbody>{apps.filter((a) => ["최종 합격", "입사 확정", "불합격"].includes(a.stage)).map((a) => (
                <tr key={a.id}><td><b>{a.name}</b></td><td><span className="ux-tag" style={tagStyle(a.stage)}>{a.stage}</span></td><td>{a.posting}</td><td>{a.notice || <span style={{ color: "#be123c", fontWeight: 700 }}>통보 전</span>}</td>
                  <td className="ux-sub">{a.stage === "불합격" ? (a.purge ? `서류 반환·파기 ${a.purge}` : "반환·파기 기한 정하기") : a.stage === "최종 합격" ? "입사일 정하기 → 입퇴사 처리" : "입사 준비"}</td></tr>
              ))}</tbody></table>
          </section>
        )}

        <Fab href="/hr/b/recruit#form" label="새 공고" />
      </div>
    </SnackHost>
  );
}

function tagStyle(stage: string): React.CSSProperties {
  if (stage === "최종 합격" || stage === "입사 확정") return { color: "#1f6b35", background: "#e3f4e8" };
  if (stage === "불합격" || stage.startsWith("지원 취소")) return { color: "#a3122f", background: "#ffe4e8" };
  if (stage.startsWith("면접")) return { color: "#5b21b6", background: "#efe7ff" };
  return { color: "#4b5563", background: "#eceff4" };
}
