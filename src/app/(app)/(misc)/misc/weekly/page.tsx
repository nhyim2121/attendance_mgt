/** 주간업무일지: 내 일지 쓰기(지난주 차주 계획 자동으로 불러오기·이번 주 기록에서 가져오기) · 팀 모아보기 · 지난 일지.
 *  인쇄(결재용 한 장)·엑셀 내려받기. 관리팀 계정 모두. */
import Link from "next/link";
import { type KpiProps, Kpis, Win } from "@/components/대시/parts";
import { canBid, requireUser } from "@/lib/auth";
import { allRows } from "@/lib/대시/data";
import { DONE_STAGES } from "@/lib/총무/bid";
import { loadBids } from "@/lib/총무/bidStore";
import { addDays, todayKst } from "@/lib/time";
import { carryOver, emptyLog, logAvg, mondayOf, occurrences, weekRange, weekTitle, type WRow } from "@/lib/기타/work";
import { allLogs, loadCoops, loadLog, loadPlans, logsOf, people } from "@/lib/기타/workStore";
import { PrintButton, type Suggest, WeekEditor, WeekPrint } from "../forms";

export const metadata = { title: "주간업무일지 · 통합관리시스템" };
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
let seq = 0;
const sid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = todayKst();
  const thisMon = mondayOf(today);
  const monday = sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? mondayOf(sp.w) : thisMon;
  const view = sp.view === "team" || sp.view === "list" ? sp.view : "me";
  const title = weekTitle(monday), range = weekRange(monday);
  const q = (w: string, v = view) => `/misc/weekly?w=${w}${v !== "me" ? `&view=${v}` : ""}`;

  const [mine, team, logs] = await Promise.all([logsOf(me.id), people(), allLogs()]);
  const log = mine.find((l) => l.monday === monday)?.log ?? null;
  const last = mine.find((l) => l.monday < monday)?.log ?? null;
  const thisWeekLogs = logs.filter((l) => l.monday === monday);

  const kpis: KpiProps[] = [
    { label: `${title} 내 일지`, n: log ? log.rows.length : 0, unit: "건", sub: log ? `평균 진행률 ${logAvg(log)}% · ${log.updatedAt.slice(5, 16)} 저장` : "아직 안 씀", icon: "list", color: "#6d28d9", warn: !log && monday <= thisMon, href: q(monday, "me") },
    { label: "팀 작성", n: thisWeekLogs.length, unit: `/${team.length}명`, sub: team.filter((p) => !thisWeekLogs.some((l) => l.uid === p.id)).map((p) => p.name).join(", ") || "모두 작성", icon: "users", color: "#0c3994", href: q(monday, "team") },
    { label: "내 일지 쌓인 주", n: mine.length, unit: "주", sub: mine[0] ? `최근 ${weekTitle(mine[0].monday)}` : "처음 쓰는 중", icon: "calendarCheck", color: "#15803d", href: q(monday, "list") },
    { label: "끝나지 않은 일", n: log ? log.rows.filter((r) => r.pct < 100).length : last ? last.rows.filter((r) => r.pct < 100).length : 0, unit: "건", sub: "진행률 100% 아닌 업무", icon: "gauge", color: "#e84340", href: q(monday, "me") },
  ];

  return (
    <div className="ud">
      <header className="u-hello ar noprint" style={{ ["--c" as string]: "#6d28d9" }}>
        <span className="u-date"><Link href="/misc">기타</Link> › 주간업무일지</span>
        <h1>주간업무일지 <mark>{title}</mark></h1>
        <p>{range} · 지난주에 적은 &lsquo;차주 계획&rsquo;이 이번 주 일지에 자동으로 들어옵니다. 실적만 채우면 끝.</p>
        <span className="u-cover" aria-hidden>📓</span>
        <div className="u-note"><b>작성 요령</b>업무마다 한 줄 · 실적은 숫자·결과 위주 · 차주 계획은 다음 주 일지로 넘어감</div>
      </header>
      <div className="noprint"><Kpis items={kpis} /></div>

      <div className="wk-nav noprint">
        <Link className="fd-btn" href={q(addDays(monday, -7))}>‹ 지난주</Link>
        <b>{title}</b><span className="muted">{range}</span>
        <Link className="fd-btn" href={q(addDays(monday, 7))}>다음 주 ›</Link>
        {monday !== thisMon && <Link className="fd-btn sm" href={q(thisMon)}>이번 주</Link>}
        <input type="date" form="wk-go" name="w" defaultValue={monday} aria-label="주 고르기" />
        <form id="wk-go" action="/misc/weekly">{view !== "me" && <input type="hidden" name="view" value={view} />}<button className="fd-btn sm">이동</button></form>
        <span className="sp" />
        <div className="u-tabs">
          {([["me", "✏️ 내 일지"], ["team", "👥 팀 모아보기"], ["list", "🗂️ 지난 일지"]] as const).map(([v, t]) => <Link key={v} href={q(monday, v)} className={`tab${view === v ? " on" : ""}`}>{t}</Link>)}
        </div>
      </div>

      {view === "me" && <MyWeek me={me} monday={monday} title={title} range={range} log={log} last={last} />}

      {view === "team" && (
        <div className="u-grid">
          <Win en="TEAM" ko={`${title} 팀 주간업무일지 · ${thisWeekLogs.length}/${team.length}명 작성`} className="s12">
            <div className="fd-btns noprint" style={{ justifyContent: "flex-start", marginBottom: 10 }}>
              <PrintButton label="🖨️ 팀 일지 인쇄" />
              <a className="fd-btn" href={`/api/misc/weekly?w=${monday}&who=team`}>📊 엑셀로 내려받기</a>
            </div>
            {team.map((p) => {
              const l = thisWeekLogs.find((x) => x.uid === p.id)?.log;
              return l ? <WeekPrint key={p.id} screen title={title} range={range} name={p.name} rows={l.rows} issue={l.issue} request={l.request} />
                : <p key={p.id} className="wk-none">📭 <b>{p.name}</b> — {title} 일지를 아직 쓰지 않았습니다.</p>;
            })}
          </Win>
        </div>
      )}

      {view === "list" && (
        <div className="u-grid">
          <Win en="ARCHIVE" ko="내 지난 일지" className="s7">
            {mine.length ? (
              <ul className="u-ev">{mine.map(({ monday: m, log: l }) => (
                <li key={m}><Link href={q(m, "me")}>
                  <span className="dt">{md(m)}</span>
                  <span className="tt"><b>{weekTitle(m)} · {l.rows.map((r) => r.task).filter(Boolean).slice(0, 3).join(", ") || "내용 없음"}</b><small>{weekRange(m)} · {l.rows.length}건 · 저장 {l.updatedAt.slice(5, 16)}</small></span>
                  <span className="fd-tag b">{logAvg(l)}%</span><span />
                </Link></li>
              ))}</ul>
            ) : <p className="muted">아직 쓴 일지가 없습니다.</p>}
          </Win>
          <Win en="TEAM GRID" ko="최근 8주 팀 작성 현황" className="s5">
            <TeamGrid team={team} logs={logs} weeks={Array.from({ length: 8 }, (_, i) => addDays(thisMon, -7 * i))} />
          </Win>
        </div>
      )}
    </div>
  );
}

type Me = Awaited<ReturnType<typeof requireUser>>;
type Log = Awaited<ReturnType<typeof loadLog>>;

/** 내 일지: 이번 주 일지가 없으면 지난 일지에서 이어 받는다 */
async function MyWeek({ me, monday, title, range, log, last }: { me: Me; monday: string; title: string; range: string; log: Log; last: Log }) {
  const initial: WRow[] = log ? log.rows : carryOver(last, sid);
  const suggest = await suggestions(me, monday, initial);
  const base = log ?? emptyLog(me.name);
  return (
    <div className="u-grid">
      <Win en="WEEKLY REPORT" ko={`${me.name} · ${title} (${range})`} className="s12">
        <div className="fd-btns noprint" style={{ justifyContent: "flex-start", marginBottom: 10 }}>
          <PrintButton label="🖨️ 인쇄 (결재용 한 장)" />
          <a className="fd-btn" href={`/api/misc/weekly?w=${monday}&who=me`}>📊 엑셀로 내려받기</a>
        </div>
        <WeekEditor key={monday} monday={monday} title={title} range={range} name={me.name} initial={initial}
          issue0={base.issue} request0={base.request} carried={log ? 0 : initial.length} saved={log?.updatedAt ?? ""} suggest={suggest} />
      </Win>
    </div>
  );
}

/** 이번 주 기록에서 일지 줄 후보: 내가 맡은 업무협조 · 개인일정 · 진행 건·할 일(관리자) · 입찰(공유 계정) */
async function suggestions(me: Me, monday: string, rows: WRow[]): Promise<Suggest[]> {
  const sun = addDays(monday, 6);
  const inWeek = (d?: string) => !!d && d.slice(0, 10) >= monday && d.slice(0, 10) <= sun;
  const admin = me.role === "관리자";
  const [coops, plans, ledger, bids] = await Promise.all([loadCoops(), loadPlans(me.id), admin ? allRows() : Promise.resolve([]), canBid(me) ? loadBids() : Promise.resolve([])]);
  const out: Suggest[] = [];
  for (const c of coops) {
    if (c.owner !== me.name && c.by !== me.name) continue;
    const notes = c.log.filter((l) => inWeek(l.at) && !l.text.startsWith("상태:") && !l.text.endsWith("등록"));
    if (inWeek(c.doneAt)) out.push({ cat: "업무협조", task: `[${c.dept}] ${c.title}`, done: `완료${c.result ? ` — ${c.result}` : ""}`, from: "업무협조" });
    else if (notes.length || inWeek(c.asked) || inWeek(c.due)) out.push({ cat: "업무협조", task: `[${c.dept}] ${c.title}`, done: notes.map((l) => `${md(l.at)} ${l.text}`).join(" / ") || `${c.status}${c.due ? ` (기한 ${md(c.due)})` : ""}`, from: "업무협조" });
  }
  for (const p of plans) {
    if (p.kind === "개인") continue;
    for (const h of occurrences(p, monday, sun)) {
      if (h.multi && h.day !== h.start && h.day !== monday) continue;
      out.push({ cat: p.kind === "교육" ? "인사·노무" : "기타", task: p.title, done: `${md(h.day)} ${p.kind}${p.place ? ` · ${p.place}` : ""}${h.done ? " 완료" : ""}`, from: "개인일정" });
    }
  }
  for (const r of ledger) {
    if (r.book !== "tasks") continue;
    const d = r.data as Record<string, string>;
    if (inWeek(d.due) || inWeek(r.day ?? "")) out.push({ cat: "기타", task: d.title ?? "할 일", done: `${d.status || "진행 중"}${d.due ? ` (기한 ${md(d.due)})` : ""}`, from: "할 일" });
  }
  for (const b of bids) {
    if (b.stage === "새 공고") continue;
    const hit = Object.entries(b.dates).filter(([, v]) => inWeek(v));
    if (hit.length || (inWeek(b.bidAt) && !DONE_STAGES.includes(b.stage))) out.push({ cat: "입찰", task: b.name, done: `${b.stage}${b.dates.bidClose ? ` · 투찰 마감 ${md(b.dates.bidClose)}` : ""}`, from: "입찰" });
  }
  const have = rows.map((r) => r.task);
  return out.filter((s, i) => !have.some((t) => t && (t.includes(s.task) || s.task.includes(t))) && out.findIndex((x) => x.task === s.task && x.from === s.from) === i).slice(0, 30);
}

function TeamGrid({ team, logs, weeks }: { team: { id: string; name: string }[]; logs: { uid: string; monday: string; log: { rows: WRow[] } }[]; weeks: string[] }) {
  return (
    <table className="wk-grid">
      <thead><tr><th>주</th>{team.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead>
      <tbody>{weeks.map((w) => (
        <tr key={w}><th><Link href={`/misc/weekly?w=${w}&view=team`}>{weekTitle(w)}</Link></th>
          {team.map((p) => {
            const l = logs.find((x) => x.uid === p.id && x.monday === w)?.log;
            return <td key={p.id}>{l ? <span className="fd-tag g">{l.rows.length}건</span> : <span className="fd-tag k">—</span>}</td>;
          })}
        </tr>
      ))}</tbody>
    </table>
  );
}
