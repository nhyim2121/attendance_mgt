/** 업무분장 묶음별 홈 (/hr/g/hire …): 근태 홈과 같은 '홈' 디자인으로 그 묶음(예: 3-1. 직원채용) 내용만 모아 본다.
 *  요약 숫자 · 그래프(월별 기록·진행 상태·입퇴사·부서 인원) · 기한 · 대장별 진행 중 · 관련 사이트.
 *  3-2 근태·휴가는 원래 있는 근태 홈(/attendance)·휴가 홈(/leave)을 쓴다. */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PageHead from "@/components/대시/PageHead";
import SiteLinks from "@/components/대시/SiteLinks";
import EduHome from "@/components/인사노무/EduHome";
import { JoinLeaveBars, StatusBars, TwoBars } from "@/components/인사노무/Charts";
import { Ico, Stat } from "@/components/인사노무/HomeKit";
import PrintButton from "@/components/PrintButton";
import { requireUser } from "@/lib/auth";
import { allRows, ddayText, todos } from "@/lib/대시/data";
import { emojiOf, HR_DASH, menuOf } from "@/lib/대시/menu";
import { bookHref, BOOKS } from "@/lib/대장/books";
import { GUIDE } from "@/lib/대장/guide";
import { alertsOf, isClosed, rowName } from "@/lib/대장/logic";
import { bookOf } from "@/lib/대장/books";
import { buildOrg, DEFAULT_VIEWS, defaultNodes, type OrgNode, type OrgView } from "@/lib/인사노무/org";
import { getSetting } from "@/lib/store";
import { Branch } from "../../../org/OrgTree";
import { loadBase } from "@/lib/인사노무/data";
import { HR_SITES } from "@/lib/인사노무/sites";
import { addDays, todayKst } from "@/lib/time";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const d = HR_DASH[(await params).slug];
  return { title: `${d?.name ?? "인사노무"} 홈 · 통합관리시스템` };
}

const md = (d?: string | null) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "");
const BOARD: [string, string[], string][] = [
  ["서류", ["서류 검토", "서류 합격"], "#2a78d6"], ["면접", ["면접 예정", "면접 완료"], "#eb6834"],
  ["합격", ["최종 합격", "입사 확정"], "#1baf7a"], ["불합격·포기", ["불합격", "지원 취소·포기"], "#9aa3b2"],
];
const COLORS = ["#0c3994", "#2a78d6", "#eb6834", "#1baf7a", "#7c3aed", "#e84340", "#b45309"];

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (slug === "work") redirect("/attendance");
  if (slug === "leave") redirect("/leave");
  const d = HR_DASH[slug];
  if (!d) notFound();
  const user = await requireUser();
  const admin = user.role === "관리자";
  if (slug === "edu" && admin) return <EduHome />; // 교육훈련 홈은 전용 화면 (2026-11-12)
  const today = todayKst(), month = today.slice(0, 7);
  const group = menuOf("hr").groups.find((g) => g.label === d.group)!;
  const items = group.items.filter((i) => !i.href.startsWith("/hr/g/") && (admin || !i.admin));
  const books = BOOKS.filter((b) => b.area === "hr" && items.some((i) => i.href === bookHref(b)));
  const keys = new Set(books.map((b) => b.key));

  const [all, list, base] = await Promise.all([admin ? allRows() : Promise.resolve([]), todos(admin), loadBase()]);
  const rows = all.filter((r) => keys.has(r.book));
  const bookOf = (k: string) => books.find((b) => b.key === k)!;
  const open = rows.filter((r) => !isClosed(bookOf(r.book), r.data));
  const hrefs = books.map(bookHref);
  const due = list.filter((t) => hrefs.some((h) => t.href.startsWith(h)));
  const late = due.filter((t) => t.left !== null && t.left < 0).length;
  const soon = due.filter((t) => t.left !== null && t.left >= 0 && t.left <= 7).length;

  // 최근 6개월 월별 기록·끝난 일
  const months = Array.from({ length: 6 }, (_, i) => addDays(`${month}-15`, -30 * (5 - i)).slice(0, 7));
  const monthly = months.map((m) => {
    const inM = rows.filter((r) => r.day?.startsWith(m));
    return { label: `${+m.slice(5)}월`, rec: inM.length, done: inM.filter((r) => isClosed(bookOf(r.book), r.data)).length };
  });
  const perBook = books.map((b, i) => ({ label: b.title, n: open.filter((r) => r.book === b.key).length, color: COLORS[i % COLORS.length] }));

  // 인원 (채용·조직)
  const active = base.employees.filter((e) => (!e.leaveDate || e.leaveDate >= today) && (!e.joinDate || e.joinDate <= today));
  const deptMap = new Map<string, number>();
  for (const e of active) deptMap.set(e.dept || "(부서 없음)", (deptMap.get(e.dept || "(부서 없음)") ?? 0) + 1);
  const y = today.slice(0, 4);
  const joinLeave = Array.from({ length: +month.slice(5) }, (_, i) => {
    const m = `${y}-${String(i + 1).padStart(2, "0")}`;
    return { month: `${i + 1}월`, join: base.employees.filter((e) => e.joinDate?.startsWith(m)).length, leave: base.employees.filter((e) => e.leaveDate?.startsWith(m)).length };
  });
  const apps = rows.filter((r) => r.book === "applicants");
  const openOf = (key: string) => rows.filter((r) => r.book === key && !isClosed(bookOf(key), r.data))
    .sort((a, b) => (b.day ?? "").localeCompare(a.day ?? "") || b.id - a.id).slice(0, 6);
  const sites = HR_SITES[slug] ?? [];
  const rowsBy = (k: string) => all.filter((r) => r.book === k);

  // ---------------------------------------------------------------- 화면 조각 (묶음마다 레이아웃이 다르다, 2026-11-12)
  const head = (
    <PageHead href={`/hr/g/${slug}`} title={`${d.name} 홈`} mark={d.group.split(".")[0]} emoji={d.emoji}
      desc={`${d.group} · ${items.map((i) => i.label).join(" · ")}`}>
      {admin && books.slice(0, 4).map((b) => <Link key={b.key} className="pill" href={`${bookHref(b)}#form`}>+ {b.title}</Link>)}
      <PrintButton className="pill print" label="인쇄" />
    </PageHead>
  );
  const stats = (
    <section className="card hstats">
      {(slug === "hire" || slug === "org" || slug === "people") && <Stat icon="people" label="재직 인원" value={active.length} unit="명" sub={`부서 ${deptMap.size}개`} />}
      {(slug === "hire" || slug === "people") && <Stat icon="swap" label="올해 입사·퇴사" value={`${joinLeave.reduce((t, m) => t + m.join, 0)}·${joinLeave.reduce((t, m) => t + m.leave, 0)}`} unit="명" sub="직원 관리 기준" />}
      <Stat icon="flow" label="진행 중" value={open.length} unit="건" sub={`전체 ${rows.length}건`} />
      <Stat icon="alert" label="기한 7일 안" value={soon} unit="건" sub={late ? `지난 기한 ${late}건` : "지난 기한 없음"} />
      <Stat icon="cal" label="이번 달 기록" value={rows.filter((r) => r.day?.startsWith(month)).length} unit="건" sub={`${+month.slice(5)}월`} />
      {slug === "hire"
        ? <Stat icon="clip" label="지원자" value={apps.length} unit="명" sub={`면접 ${apps.filter((r) => ["면접 예정", "면접 완료"].includes(r.data.stage)).length} · 합격 ${apps.filter((r) => ["최종 합격", "입사 확정"].includes(r.data.stage)).length}`} />
        : <Stat icon="bars" label="관리 대장" value={books.length} unit="개" sub={books.map((b) => b.title).slice(0, 2).join(", ")} />}
    </section>
  );
  const monthlyCard = (
    <section className="card">
      <div className="card-title"><Ico name="chart" />월별 기록 <span className="muted" style={{ fontWeight: 400 }}>(최근 6개월)</span></div>
      <TwoBars data={monthly} x="label" a={["rec", "기록"]} b={["done", "끝난 일"]} unit="건" />
    </section>
  );
  const perBookCard = (
    <section className="card">
      <div className="card-title"><Ico name="flow" />대장별 진행 중</div>
      <StatusBars data={perBook} total={Math.max(1, ...perBook.map((p) => p.n))} unit="건" />
    </section>
  );
  const dueCard = (
    <section className="card">
      <div className="card-title"><Ico name="alert" />기한·알림 <span className="muted" style={{ fontWeight: 400 }}>{due.length}건</span></div>
      {due.length ? (
        <table className="tbl"><tbody>{due.slice(0, 10).map((t) => (
          <tr key={t.href + t.title}><td style={{ width: 80 }} className={t.left !== null && t.left <= 7 ? "red" : "orange"}><b>{ddayText(t.left)}</b></td>
            <td><Link href={t.href}><b>{t.title}</b></Link><div className="muted" style={{ fontSize: ".78rem" }}>{t.sub}</div></td></tr>
        ))}</tbody></table>
      ) : <p className="muted">다가오는 기한이 없습니다.</p>}
    </section>
  );
  const sitesCard = (
    <section className="card">
      <div className="card-title"><Ico name="clip" />관련 사이트</div>
      {sites.length ? <SiteLinks sites={sites} big /> : <p className="muted">등록한 사이트가 없습니다.</p>}
    </section>
  );
  const bookCard = (b: (typeof books)[number]) => {
    const l = openOf(b.key);
    return (
      <section key={b.key} className="card" id={`bk-${b.key}`}>
        <div className="card-title">{emojiOf(b.key)} {b.title}<span className="spacer" /><Link className="btn sm" href={bookHref(b)}>전체</Link></div>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: ".82rem" }}>{GUIDE[b.key] ?? b.desc}</p>
        {l.length ? (
          <table className="tbl"><tbody>{l.map((r) => {
            const a = alertsOf(b, r.data, today)[0];
            return (
              <tr key={r.id}><td style={{ width: 56 }}>{md(r.day)}</td>
                <td><Link href={b.detail ? `${b.detail}?id=${r.id}` : `${bookHref(b)}?edit=${r.id}#form`}><b>{rowName(b, r.data)}</b></Link></td>
                <td style={{ textAlign: "right" }}>{a && <span className={a.left <= 7 ? "red" : "orange"} style={{ fontSize: ".78rem", fontWeight: 700 }}>{a.label} {ddayText(a.left)}</span>}</td></tr>
            );
          })}</tbody></table>
        ) : <p className="muted">진행 중인 기록이 없습니다.</p>}
      </section>
    );
  };
  const bookCards = admin ? <div className="grid2 home-row">{books.map(bookCard)}</div> : null;
  const board = slug === "hire" && admin ? (
    <section className="card">
      <div className="card-title"><Ico name="people" />지원자 보드 <span className="muted" style={{ fontWeight: 400 }}>이름을 누르면 정리본</span>
        <span className="spacer" /><Link className="btn sm" href="/hr/b/applicants#form">+ 지원자 등록</Link></div>
      <div className="u-board">
        {BOARD.map(([col, st]) => {
          const l = apps.filter((r) => st.includes(r.data.stage || "서류 검토")).sort((a, b) => (b.day ?? "").localeCompare(a.day ?? "")).slice(0, 30);
          return (
            <div key={col}>
              <h5>{col} <em>{l.length}</em></h5>
              {l.map((r) => (
                <Link key={r.id} href={`/hr/applicant?id=${r.id}`} className="u-bcard">
                  <b>{r.data.name}</b>{r.data.score && <span>{r.data.score}점</span>}
                  <small>{[r.data.posting, r.data.years ? `경력 ${r.data.years}년` : "", r.data.interview ? `면접 ${md(r.data.interview)}` : ""].filter(Boolean).join(" · ")}</small>
                </Link>
              ))}
              {!l.length && <p className="fd-empty">없음</p>}
            </div>
          );
        })}
      </div>
    </section>
  ) : null;

  // 08 Z 패턴 — 직원채용: 공고·모집 → 지원자 → 입사, 시선이 Z로 단계를 따라간다
  if (slug === "hire") {
    const recruit = books.find((b) => b.key === "recruit"), onoff = books.find((b) => b.key === "onoff");
    return (
      <div className="home">
        {head}{stats}
        <div className="lay-z">
          <div className="z-step">① 공고 · 모집</div>
          <div className="z-row">{recruit && admin ? bookCard(recruit) : monthlyCard}{dueCard}</div>
          <div className="z-step">② 지원자 · 면접</div>
          {board ?? perBookCard}
          <div className="z-row rev">
            <section className="card">
              <div className="card-title"><Ico name="pie" />지원자 진행 단계</div>
              <StatusBars data={BOARD.map(([l, st, c]) => ({ label: l, n: apps.filter((r) => st.includes(r.data.stage || "서류 검토")).length, color: c }))} total={Math.max(1, apps.length)} />
            </section>
            {perBookCard}
          </div>
          <div className="z-step">③ 입사 · 마무리</div>
          <div className="z-row">
            <section className="card">
              <div className="card-title"><Ico name="swap" />월별 입사·퇴사 <span className="muted" style={{ fontWeight: 400 }}>({y}년)</span></div>
              <JoinLeaveBars data={joinLeave} />
            </section>
            {onoff && admin ? bookCard(onoff) : sitesCard}
          </div>
        </div>
        <div className="grid2 home-row">{monthlyCard}{sitesCard}</div>
        {admin && <div className="grid2 home-row">{books.filter((b) => b.key !== "recruit" && b.key !== "onoff").map(bookCard)}</div>}
      </div>
    );
  }

  // 05 사이드바 — 노무: 대장 종류가 많다. 왼쪽 목록에서 고르면 오른쪽 해당 대장으로
  if (slug === "labor") {
    return (
      <div className="home">
        {head}{stats}
        <div className="lay-side">
          <div className="col side">
            <section className="card lay-nav">
              <div className="card-title"><Ico name="flow" />노무 대장</div>
              {books.map((b) => {
                const n = open.filter((r) => r.book === b.key).length;
                const a = due.filter((t) => t.href.startsWith(bookHref(b))).length;
                return (
                  <a key={b.key} href={`#bk-${b.key}`} className="lay-navi">
                    <span>{emojiOf(b.key)} {b.title}</span>
                    {a > 0 && <em className="r">기한 {a}</em>}<em>{n}</em>
                  </a>
                );
              })}
            </section>
            {sitesCard}
          </div>
          <div className="col">
            {dueCard}
            {admin ? books.map(bookCard) : perBookCard}
            {monthlyCard}
          </div>
        </div>
      </div>
    );
  }

  // 09 풀블리드 — 조직: 조직도를 화면 끝까지 넓게
  if (slug === "org") {
    const [nodes, saved] = await Promise.all([getSetting<OrgNode[] | null>("org_nodes", null), getSetting<OrgView[] | null>("org_views", null)]);
    const view = (saved?.length ? saved : DEFAULT_VIEWS)[0];
    const org = buildOrg(nodes?.length ? nodes : defaultNodes(base.employees), base.employees, today, view.depts, view.exclude ?? []);
    return (
      <div className="home">
        {head}{stats}
        <section className="lay-bleed wide">
          <div className="card-title"><Ico name="org" />조직도 <span className="muted" style={{ fontWeight: 400 }}>{today} 기준 · {view.name}</span><span className="spacer" /><Link className="btn sm" href="/org">조직도 화면 (보기·인쇄)</Link></div>
          <div className="ot-scroll"><div className="ot">
            <ul>{org.roots.slice(0, 1).map((r) => <Branch key={r.node.id} b={r} v={view} />)}</ul>
          </div></div>
          {org.roots.length > 1 && <div className="ot ot-foot"><ul className="ot-sep">{org.roots.slice(1).map((r) => <Branch key={r.node.id} b={r} v={view} />)}</ul></div>}
        </section>
        <div className="grid2 home-row">
          <section className="card">
            <div className="card-title"><Ico name="people" />부서별 재직 인원</div>
            <StatusBars data={[...deptMap].map(([dept, n], i) => ({ label: dept, n, color: COLORS[i % COLORS.length] }))} total={Math.max(1, active.length)} />
          </section>
          {dueCard}
        </div>
        {bookCards}
      </div>
    );
  }

  // 04 카드 그리드 — 인사: 사람 단위 업무, 직원 카드를 같은 크기로
  if (slug === "people") {
    const lic = rowsBy("licenses");
    const evals = rowsBy("evaluations");
    const yrs = (j: string | null) => (j ? Math.floor((Date.parse(today) - Date.parse(j)) / (365.25 * 864e5)) : null);
    return (
      <div className="home">
        {head}{stats}
        <div className="card-title" style={{ margin: "4px 0 10px" }}><Ico name="people" />직원 카드 <span className="muted" style={{ fontWeight: 400 }}>{active.length}명 · 누르면 개인별 근태·인사 정보</span><span className="spacer" /><Link className="btn sm" href="/employees">직원 관리</Link></div>
        <div className="lay-cards">
          {active.map((e) => {
            const myLic = lic.filter((r) => r.data.emp === e.name);
            const renew = myLic.map((r) => r.data.renew).filter(Boolean).sort()[0];
            const ev = evals.filter((r) => r.data.emp === e.name && !isClosed(bookOf("evaluations"), r.data)).length;
            const y2 = yrs(e.joinDate);
            return (
              <Link key={e.name} href={`/person?emp=${encodeURIComponent(e.name)}`} className="lay-card" style={{ ["--lc" as string]: "#0c3994", minHeight: 0 }}>
                <div className="lc-h"><b>{e.name}</b><small>{[e.rank, e.position].filter(Boolean).join(" · ")}</small></div>
                <small>{e.dept || "(부서 없음)"}{e.joinDate ? ` · 입사 ${e.joinDate.replaceAll("-", ".")}` : ""}</small>
                <div className="lc-n">
                  <span>근속 <b>{y2 ?? "-"}</b></span>
                  <span>자격증 <b>{myLic.length}</b></span>
                  {ev > 0 && <span className="warn">평가 <b>{ev}</b></span>}
                </div>
                {renew && <small className={renew < today ? "red" : ""}>보수교육·갱신 {renew.replaceAll("-", ".")}</small>}
              </Link>
            );
          })}
        </div>
        <div className="grid2 home-row">{dueCard}{perBookCard}</div>
        {bookCards}
      </div>
    );
  }

  return (
    <div className="home">
      {head}{stats}
      <div className="grid2 home-row">{monthlyCard}{perBookCard}</div>
      <div className="grid2 home-row">{dueCard}{sitesCard}</div>
      {bookCards}
    </div>
  );
}