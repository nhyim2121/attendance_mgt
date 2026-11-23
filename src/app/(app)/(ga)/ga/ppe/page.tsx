/** 보호구·피복 관리 (총무 2-1, 관리자만): 한눈에 · 직원 현황표 · 지급 · 구매·입고 · 유지(교체·반납·폐기) · 규정·양식.
 *  대상: 현장직(생산·품질·영업팀, 이병욱 부장 제외) + 일용직, 연구소(사무직). 기준·계산은 src/lib/총무/ppe.ts
 *  첫 화면 배치: 2026-11-20 시안 ①(다음 정기 지급 띠 → 숫자 4개 → 품목 카드 → 지급할 것·최근 지급 → 사람별 현황표 → 바로가기) */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import { LinksCard } from "@/components/대시/client";
import { Win } from "@/components/대시/win";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import * as store from "@/lib/대장/store";
import { loadLinks } from "@/lib/대시/links";
import { loadEmployees } from "@/lib/store";
import {
  activeOnly, buildPeople, byDept, cellOf, requiredItems, dueList, GIVE_KINDS, GROUP_COLOR, isDispose, isGive, itemOf, MATRIX_ITEMS, matrix, nextSeason, PPE_DUTIES, PPE_GROUPS, PPE_ITEMS,
  type PpeGroup, type PpePerson, SEASON_DAYS, SIZE_LABEL, sizeFor, stockOf, ruleText, unitOf, wearingNow, WEAR_PERIODS, returnDue, qtyFor,
} from "@/lib/총무/ppe";
import { loadFiles } from "@/lib/총무/mail";
import { todayKst } from "@/lib/time";
import { addPpeStock, deletePpeFile, givePpe, savePpePerson, signPpeMany, uploadPpeFile } from "./actions";
import { CellView, GroupChip, Msg, Tabs, ymd } from "./ui";

export const metadata = { title: "보호구·피복 관리 · 총무 · 통합관리시스템" };
type Sp = { tab?: string; g?: string; q?: string; item?: string; all?: string; msg?: string; view?: string };

const LOW = 2; // 재고가 이만큼 이하면 '부족'
const TAB_KEYS = ["people", "give", "buy", "keep", "rule"];
const ALIAS: Record<string, string> = { stock: "buy", duty: "rule" }; // 예전 주소

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const t0 = ALIAS[sp.tab ?? ""] ?? sp.tab ?? "";
  const tab = TAB_KEYS.includes(t0) ? t0 : "";
  const today = todayKst();
  const [emps, issues, profiles, stock, links] = await Promise.all([
    loadEmployees(), store.loadRows("ppe"), store.loadRows("ppepeople"), store.loadRows("ppestock"), loadLinks("ppe"),
  ]);
  const everyone = buildPeople(emps, profiles, today, true); // 재직·퇴사 모두 (부서별 직원 화면)
  const people = activeOnly(everyone);                       // 알림·일괄 지급은 지금 관리 중인 사람만
  const g = PPE_GROUPS.includes(sp.g as PpeGroup) ? (sp.g as PpeGroup) : "";
  const linkCard = <LinksCard scope="ppe" links={links} className="s12 pp-links" />;
  return (
    <div className="ud pp">
      <PageHead href="/ga/ppe" desc="현장직(생산·품질·영업팀, 일용직)과 연구소의 보호구·피복 지급·구매·교체·폐기를 관리합니다. 마지막 지급일과 교체 주기로 미지급·교체 시기를 알려 주고, 재고는 입고 − 지급 − 폐기로 계산합니다.">
        <Link className="btn primary" href="/ga/ppe?tab=give">+ 지급하기</Link>
        <Link className="btn" href="/ga/ppe?tab=buy#in">입고 적기</Link>
        <PrintButton label="인쇄" />
      </PageHead>
      <Msg msg={sp.msg} />
      <Tabs tab={tab} />
      {tab === "" && <Dash people={people} issues={issues} stock={stock} today={today} links={linkCard} />}
      {tab === "people" && (sp.view === "table"
        ? <People people={people} issues={issues} today={today} g={g} q={(sp.q ?? "").trim()} />
        : <Circles people={everyone} issues={issues} today={today} g={g} q={(sp.q ?? "").trim()} />)}
      {tab === "give" && <><Give people={people} issues={issues} today={today} g={g} item={sp.item ?? ""} all={sp.all === "1"} /><Unsigned issues={issues} /></>}
      {tab === "buy" && <Buy people={people} issues={issues} stock={stock} today={today} links={linkCard} />}
      {tab === "keep" && <Keep people={people} everyone={everyone} issues={issues} stock={stock} today={today} />}
      {tab === "rule" && <Rule />}
    </div>
  );
}

type Rows = Awaited<ReturnType<typeof store.loadRows>>;
const qtyOf = (r: Rows[number]) => +r.data.qty || 1;

// ================================================================== 한눈에 (시안 ①)
function Dash({ people, issues, stock, today, links }: { people: PpePerson[]; issues: Rows; stock: Rows; today: string; links: React.ReactNode }) {
  const due = dueList(people, issues, today);
  const of = (s: string) => due.filter((d) => d.cell.status === s);
  const byItem = (list: typeof due) => MATRIX_ITEMS.map((i) => [i.name, list.filter((d) => d.item.name === i.name).length] as const).filter(([, n]) => n).map(([n, c]) => `${n} ${c}`).join(" · ");
  const unsigned = issues.filter((r) => isGive(r.data.kind) && r.data.sign !== "받음");
  const stockLines = stockOf(stock, issues);
  const ns = nextSeason(today);
  const soonest = of("soon")[0];
  const kpi = (tone: string, label: string, list: unknown[], unit: string, sub: string, href: string) => (
    <Link href={href} className={`pp2-kpi ${tone}`}>
      <span><i />{label}</span>
      <b>{list.length}<small> {unit}</small></b>
      <em>{sub || "없음"}</em>
    </Link>
  );
  // 지금 지급할 것: 품목·상태별로 묶어 한 줄
  const groups = new Map<string, typeof due>();
  for (const d of due) { const k = `${d.cell.status}|${d.item.name}`; groups.set(k, [...(groups.get(k) ?? []), d]); }
  return (
    <div className="pp2">
      <div className="pp2-band">
        <div><span>다음 정기 지급</span><b>{ns.item} · {+ns.day.slice(0, 4)}년 {+ns.day.slice(5, 7)}월 {+ns.day.slice(8)}일</b></div>
        <strong>D-{ns.left}</strong>
        <div><span>지금 입는 근무복</span><b>{wearingNow(today).map((w) => `${w.set} (${w.label})`).join(" · ") || "-"}</b></div>
        <div className="pp2-chips">
          {SEASON_DAYS.map((s) => {
            const day = `${today.slice(0, 4)}-${s.md}`;
            const given = day < today && issues.some((r) => itemOf(r.data.item ?? "")?.set === s.item && isGive(r.data.kind) && (r.data.day ?? "") >= day && (r.data.day ?? "") <= `${today.slice(0, 4)}-12-31`);
            return <Link key={s.md} href={`/ga/ppe?tab=give&item=${encodeURIComponent(`${s.item} 상의`)}`} className={`${given ? "done" : ""} ${ns.day.endsWith(s.md) ? "next" : ""}`}>{s.item} {+s.md.slice(0, 2)}/{+s.md.slice(3)}{given ? " ✓" : ""}</Link>;
          })}
        </div>
      </div>

      <div className="pp2-kpis">
        {kpi("none", "아직 안 받은 사람", of("none"), "명", byItem(of("none")), "/ga/ppe?tab=give")}
        {kpi("late", "교체 시기 지남", of("late"), "건", byItem(of("late")), "/ga/ppe?tab=give")}
        {kpi("soon", "30일 안에 교체", of("soon"), "건", soonest?.cell.next ? `가장 빠름 ${ymd(soonest.cell.next)}` : "", "/ga/ppe?tab=give")}
        {kpi("sign", "수령 서명 안 받음", unsigned, "건", unsigned[0] ? `${ymd(unsigned[0].data.day)} ${unsigned[0].data.item} 등` : "", "/ga/ppe?tab=give#sign")}
      </div>

      <section className="pp2-sec">
        <h2>품목별 지급 현황 <small>주기 안에 받은 사람 / 받아야 할 사람 · 재고</small></h2>
        <div className="pp2-items">
          {MATRIX_ITEMS.map((it) => {
            const tg = people.filter((p) => it.cycle[p.group] !== undefined);
            const got = tg.filter((p) => ["ok", "soon"].includes(cellOf(p, it, issues, today).status)).length;
            const pct = tg.length ? Math.round((got / tg.length) * 100) : 0;
            const left = stockLines.filter((x) => x.item === it.name).reduce((t, x) => t + x.left, 0);
            const hasStock = stockLines.some((x) => x.item === it.name);
            const todo = due.filter((d) => d.item.name === it.name && d.cell.status !== "soon").length;
            const g0 = PPE_GROUPS.find((x) => it.cycle[x]);
            return (
              <Link key={it.name} href={`/ga/ppe?tab=give&item=${encodeURIComponent(it.name)}`} className="pp2-item">
                <div><b>{it.name}</b><small>{g0 ? ruleText(it, g0) : it.kind}</small></div>
                <p><b>{got}</b> / {tg.length}명</p>
                <div className="pp-bar"><i style={{ width: `${pct}%`, background: pct === 100 ? "var(--green)" : "#0f2a5c" }} /></div>
                <div className="pp2-foot">
                  <span>재고 <b className={hasStock && left <= LOW ? "orange" : ""}>{hasStock ? `${left}${unitOf(it.name)}` : "-"}</b></span>
                  {todo ? <span className="red"><b>{todo}명 지급할 것</b></span> : hasStock && left <= LOW ? <span className="orange"><b>재고 부족</b></span> : <span className="green"><b>{tg.length ? "다 받음" : "대상 없음"}</b></span>}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="pp2-two">
        <section className="pp2-sec card">
          <h2>지금 지급할 것 <small>품목마다 한 번에 지급</small></h2>
          {groups.size ? [...groups.entries()].map(([k, list]) => {
            const [st, item] = k.split("|");
            return (
              <div key={k} className="pp2-todo">
                <span className={`pp2-tag ${st}`}>{st === "none" ? "미지급" : st === "late" ? "교체 지남" : "곧 교체"}</span>
                <b>{item}</b>
                <span className="who">{list.slice(0, 8).map((d) => `${d.p.name}${st === "soon" && d.cell.next ? ` ${ymd(d.cell.next).slice(3)}` : ""}`).join(" · ")}{list.length > 8 ? ` 외 ${list.length - 8}명` : ""}</span>
                <Link className="btn sm primary" href={`/ga/ppe?tab=give&item=${encodeURIComponent(item)}`}>{list.length}명 지급</Link>
              </div>
            );
          }) : <p className="fd-empty">미지급·교체할 것이 없습니다.</p>}
        </section>
        <section className="pp2-sec card">
          <h2>최근 지급 <Link href="/ga/b/ppe" className="more">전체 기록</Link></h2>
          {issues.length ? (
            <ul className="pp2-recent">{issues.slice(0, 8).map((r) => (
              <li key={r.id}>
                <span className="d">{ymd(r.data.day).slice(3)}</span>
                <Link href={`/ga/ppe/person?name=${encodeURIComponent(r.data.emp ?? "")}`}><b>{r.data.emp}</b></Link>
                <span className="i">{r.data.item}{r.data.size ? ` · ${r.data.size}` : ""}{r.data.kind && r.data.kind !== "정기 지급" ? ` (${r.data.kind})` : ""}</span>
                {isGive(r.data.kind) && (r.data.sign === "받음" ? <span className="green">✓ 받음</span> : <span className="blue"><b>서명 안 받음</b></span>)}
              </li>
            ))}</ul>
          ) : <p className="fd-empty">아직 지급 기록이 없습니다. [+ 지급하기]로 시작하거나, 예전 엑셀 지급대장을 <Link href="/ga/b/ppe">지급 기록 전체</Link>에서 가져오세요.</p>}
        </section>
      </div>

      <MatrixCard people={people} issues={issues} today={today} />
      <div className="u-grid">{links}</div>
    </div>
  );
}

/** 사람별 현황표 (한눈에 아래쪽). 전체 기능(찾기·인쇄)은 직원 현황표 탭 */
function MatrixCard({ people, issues, today }: { people: PpePerson[]; issues: Rows; today: string }) {
  const rows = matrix(people, issues, today);
  const n = (gr: PpeGroup) => people.filter((p) => p.group === gr).length;
  return (
    <section className="pp2-sec card">
      <h2>사람별 현황표
        <span className="pp2-seg">
          <Link href="/ga/ppe?tab=people&view=table" className="on">전체 {people.length}</Link>
          {PPE_GROUPS.map((gr) => <Link key={gr} href={`/ga/ppe?tab=people&view=table&g=${gr}`}>{gr} {n(gr)}</Link>)}
        </span>
      </h2>
      <div className="pp2-legend"><i className="pp-cell ok">정상</i><i className="pp-cell soon">30일 안 교체</i><i className="pp-cell late">교체 지남</i><i className="pp-cell none">미지급</i><i className="pp-na">· 대상 아님</i><i>✍ 서명 안 받음</i></div>
      <div className="tbl-wrap">
        <table className="tbl pp-matrix">
          <thead><tr><th>이름</th><th>부서 · 구분</th><th>사이즈 (상·하·화)</th>{MATRIX_ITEMS.map((i) => <th key={i.name}>{i.name}</th>)}</tr></thead>
          <tbody>{rows.map(({ p, cells }) => (
            <tr key={p.name}>
              <td style={{ textAlign: "left" }}><Link href={`/ga/ppe/person?name=${encodeURIComponent(p.name)}`}><b>{p.name}</b></Link></td>
              <td style={{ textAlign: "left" }} className="fd-sub">{p.dept} · <b style={{ color: GROUP_COLOR[p.group] }}>{p.group}</b></td>
              <td>{[p.sizes.top, p.sizes.bottom, p.sizes.shoe].map((x) => x || "—").join(" · ")}</td>
              {MATRIX_ITEMS.map((i) => <td key={i.name}><CellView c={cells.get(i.name)!} title={`${p.name} ${i.name}`} /></td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!rows.length && <p className="fd-empty">관리 대상이 없습니다.</p>}
    </section>
  );
}

/** 수령 확인 안 된 지급 (지급 탭 아래) */
function Unsigned({ issues }: { issues: Rows }) {
  const unsigned = issues.filter((r) => isGive(r.data.kind) && r.data.sign !== "받음");
  return (
    <div id="sign" style={{ marginTop: 14 }}>
      <Win en="SIGN" ko={`수령 서명 안 받은 지급 · ${unsigned.length}건`}>
        {unsigned.length ? (
          <form action={signPpeMany}>
            <input type="hidden" name="back" value="/ga/ppe?tab=give" />
            <table className="tbl pp-mini"><tbody>
              {unsigned.slice(0, 30).map((r) => (
                <tr key={r.id}>
                  <td style={{ width: 28 }}><input type="checkbox" name="id" value={r.id} defaultChecked aria-label={`${r.data.emp} 수령 확인`} /></td>
                  <td><Link href={`/ga/ppe/person?name=${encodeURIComponent(r.data.emp ?? "")}`}><b>{r.data.emp}</b></Link></td>
                  <td>{r.data.item} <small className="muted">{r.data.size}</small></td>
                  <td>{ymd(r.data.day)}</td>
                </tr>
              ))}
            </tbody></table>
            <button className="btn sm primary" style={{ marginTop: 8 }}>고른 것 종이 서명 받음으로</button>
            <p className="caption">화면에 전자서명을 받으려면 이름을 눌러 개인 화면에서 서명하세요.</p>
          </form>
        ) : <p className="fd-empty">모두 수령 확인했습니다.</p>}
      </Win>
    </div>
  );
}

// ================================================================== 부서별 직원 (동그라미)
function Circles({ people, issues, today, g, q }: { people: PpePerson[]; issues: Rows; today: string; g: PpeGroup | ""; q: string }) {
  const list = people.filter((p) => (!g || p.group === g) && (!q || `${p.name} ${p.dept} ${p.rank}`.includes(q)));
  const href = (x: string) => `/ga/ppe?tab=people${x ? `&g=${x}` : ""}`;
  const retiredN = list.filter((p) => p.retired).length;
  return (
    <Win en="PEOPLE" ko={`부서별 직원 · ${list.length}명 (재직 ${list.length - retiredN} · 퇴사·종료 ${retiredN})`}>
      <div className="gr-filter">
        <div className="pp-seg">
          <Link href={href("")} className={!g ? "on" : ""}>전체</Link>
          {PPE_GROUPS.map((x) => <Link key={x} href={href(x)} className={g === x ? "on" : ""}>{x}</Link>)}
        </div>
        <form action="/ga/ppe" className="row" style={{ gap: 6 }}>
          <input type="hidden" name="tab" value="people" />{g && <input type="hidden" name="g" value={g} />}
          <input name="q" defaultValue={q} placeholder="이름·팀 찾기" />
          <button className="btn sm">찾기</button>
        </form>
        <span className="pp-legend">
          <i className="pp-ring-key ok" />정상 <i className="pp-ring-key soon" />30일 안 교체 <i className="pp-ring-key bad" />미지급·교체 지남 <i className="pp-ring-key off" />퇴사·종료
          <Link className="btn sm" href={`/ga/ppe?tab=people&view=table${g ? `&g=${g}` : ""}`}>표로 보기</Link>
        </span>
      </div>

      {byDept(list).map(({ dept, group, people: ps }) => (
        <section key={dept} className="pp-dept" style={{ ["--c" as string]: GROUP_COLOR[group] }}>
          <h4><span>{dept}</span> <GroupChip g={group} /> <small>{ps.filter((p) => !p.retired).length}명{ps.some((p) => p.retired) ? ` · 퇴사·종료 ${ps.filter((p) => p.retired).length}명` : ""}</small></h4>
          <div className="pp-circles">
            {ps.map((p) => {
              const mine = issues.filter((r) => r.data.emp === p.name);
              const unsigned = mine.filter((r) => isGive(r.data.kind) && r.data.sign !== "받음").length;
              const st = p.retired ? [] : requiredItems(p.group).map((i) => cellOf(p, i, issues, today).status);
              const bad = st.filter((s) => s === "none" || s === "late").length, soon = st.filter((s) => s === "soon").length;
              const tone = p.retired ? "off" : bad ? "bad" : soon ? "soon" : "ok";
              const tip = [`${p.name} ${p.rank}`, `지급 ${mine.length}건`, bad && `미지급·교체 지남 ${bad}`, soon && `30일 안 교체 ${soon}`, unsigned && `서명 안 됨 ${unsigned}`, p.retired && `${p.daily ? "종료" : "퇴사"} ${p.retired}`].filter(Boolean).join(" · ");
              return (
                <Link key={p.name} href={`/ga/ppe/person?name=${encodeURIComponent(p.name)}`} className={`pp-person ${tone}`} title={tip}>
                  <span className="pp-avatar">
                    {p.name}
                    {bad > 0 && <b className="pp-badge bad">{bad}</b>}
                    {!bad && soon > 0 && <b className="pp-badge soon">{soon}</b>}
                    {unsigned > 0 && <b className="pp-badge sign" title="서명 안 됨">✍{unsigned}</b>}
                  </span>
                  <small>{p.retired ? `${p.daily ? "종료" : "퇴사"} ${ymd(p.retired).slice(0, 5)}` : p.rank || (p.daily ? p.dept : "")}</small>
                  <em>{mine.length ? `${mine.length}건` : "기록 없음"}</em>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      {!list.length && <p className="fd-empty">해당하는 사람이 없습니다.</p>}
      <p className="caption">동그라미를 누르면 그 사람의 지급 기록 전체(등록·고치기·삭제)와 전자서명 화면이 열립니다. 대상은 직원 명부의 팀으로 정합니다 (현장직: 생산·품질·영업팀, 영업팀 이병욱 부장 제외 / 연구소). 퇴사자도 기록 확인용으로 함께 보이며 알림에서는 빠집니다.</p>
      <DailyForm today={today} open={g === "일용직" && !list.length} />
    </Win>
  );
}

function DailyForm({ today, open }: { today: string; open: boolean }) {
  return (
    <details className="fold pp-noprint" style={{ marginTop: 14 }} open={open}>
      <summary>+ 일용직 등록</summary>
      <form action={savePpePerson} className="pp-form">
        <input type="hidden" name="back" value="/ga/ppe?tab=people&g=일용직" />
        <input type="hidden" name="group" value="일용직" />
        <label>이름 *<input name="name" required /></label>
        <label>업체·인력사무소<input name="dept" /></label>
        <label>투입일<input type="date" name="start" defaultValue={today} /></label>
        <label>종료일<input type="date" name="end" /></label>
        <label>상의<input name="top" placeholder="예: 105" /></label>
        <label>하의<input name="bottom" placeholder="예: 32" /></label>
        <label>안전화(mm)<input name="shoe" placeholder="예: 270" /></label>
        <button className="btn primary">등록</button>
      </form>
      <p className="caption">종료일이 지나면 &lsquo;종료&rsquo;로 흐리게 보이고 알림에서 빠집니다 (기록은 남음). 일용직은 투입하는 날 안전화·안전모를 지급하세요.</p>
    </details>
  );
}

// ================================================================== 개인별 현황표 (표로 보기)
function People({ people, issues, today, g, q }: { people: PpePerson[]; issues: Rows; today: string; g: PpeGroup | ""; q: string }) {
  const list = people.filter((p) => (!g || p.group === g) && (!q || `${p.name} ${p.dept} ${p.rank}`.includes(q)));
  const rows = matrix(list, issues, today);
  const cols = MATRIX_ITEMS.filter((i) => !g || i.cycle[g] !== undefined);
  const href = (x: string, view = "&view=table") => `/ga/ppe?tab=people${view}${x ? `&g=${x}` : ""}`;
  return (
    <Win en="PEOPLE" ko={`개인별 보호구·피복 지급 현황 · ${g || "전체"} ${list.length}명 (${ymd(today)} 기준)`}>
      <div className="gr-filter pp-noprint">
        <div className="pp-seg">
          <Link href={href("")} className={!g ? "on" : ""}>전체</Link>
          {PPE_GROUPS.map((x) => <Link key={x} href={href(x)} className={g === x ? "on" : ""}>{x}</Link>)}
        </div>
        <form action="/ga/ppe" className="row" style={{ gap: 6 }}>
          <input type="hidden" name="tab" value="people" /><input type="hidden" name="view" value="table" />{g && <input type="hidden" name="g" value={g} />}
          <input name="q" defaultValue={q} placeholder="이름·팀 찾기" />
          <button className="btn sm">찾기</button>
        </form>
        <span className="pp-legend"><i className="pp-cell ok">정상</i><i className="pp-cell soon">30일 안 교체</i><i className="pp-cell late">교체 지남</i><i className="pp-cell none">미지급</i><i>✍ 수령 확인 안 됨</i>
          <Link className="btn sm" href={href(g, "")}>부서별 동그라미로 보기</Link></span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl pp-matrix">
          <thead><tr>
            <th>구분</th><th>소속</th><th>이름</th><th>상의</th><th>하의</th><th>안전화</th>
            {cols.map((i) => <th key={i.name} title={PPE_GROUPS.map((x) => `${x} ${ruleText(i, x)}`).join(" · ")}>{i.name}</th>)}
          </tr></thead>
          <tbody>{rows.map(({ p, cells }) => (
            <tr key={p.name}>
              <td><GroupChip g={p.group} /></td>
              <td className="fd-sub">{p.dept}</td>
              <td><Link href={`/ga/ppe/person?name=${encodeURIComponent(p.name)}`}><b>{p.name}</b></Link> <small className="muted">{p.rank}</small></td>
              <td>{p.sizes.top}</td><td>{p.sizes.bottom}</td><td>{p.sizes.shoe}</td>
              {cols.map((i) => <td key={i.name}><CellView c={cells.get(i.name)!} title={`${p.name} ${i.name}`} /></td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!list.length && <p className="fd-empty">해당하는 사람이 없습니다.</p>}
      <p className="caption pp-noprint">재직 중인 사람만 보이는 인쇄용 표입니다. 사이즈가 비어 있으면 이름을 눌러 개인 화면에서 적거나, <Link href="/ga/b/ppepeople">사이즈·명단 대장</Link>에 엑셀로 한꺼번에 가져오세요.</p>
      <DailyForm today={today} open={false} />
    </Win>
  );
}

// ================================================================== 일괄 지급
function Give({ people, issues, today, g, item, all }: { people: PpePerson[]; issues: Rows; today: string; g: PpeGroup | ""; item: string; all: boolean }) {
  const it = itemOf(item);
  const tg = people
    .filter((p) => !g || p.group === g)
    .filter((p) => all || !it || !Object.keys(it.cycle).length || it.cycle[p.group] !== undefined);
  const back = `/ga/ppe?tab=give&item=${encodeURIComponent(item)}${g ? `&g=${g}` : ""}${all ? "&all=1" : ""}`;
  return (
    <div className="gr-main">
      <Win en="STEP 1" ko="품목과 대상 고르기">
        <form action="/ga/ppe" className="gr-filter" style={{ marginBottom: 0 }}>
          <input type="hidden" name="tab" value="give" />
          <select name="item" defaultValue={item} required>
            <option value="">품목 고르기</option>
            {(["보호구", "피복", "소모품"] as const).filter((k) => PPE_ITEMS.some((i) => i.kind === k)).map((k) => (
              <optgroup key={k} label={k}>{PPE_ITEMS.filter((i) => i.kind === k).map((i) => <option key={i.name}>{i.name}</option>)}</optgroup>
            ))}
          </select>
          <select name="g" defaultValue={g}>
            <option value="">구분 전체</option>{PPE_GROUPS.map((x) => <option key={x}>{x}</option>)}
          </select>
          <label className="check"><input type="checkbox" name="all" value="1" defaultChecked={all} /> 지급 기준에 없는 사람도 보기</label>
          <button className="btn sm primary">사람 불러오기</button>
        </form>
        {it && <p className="caption" style={{ marginBottom: 0 }}>
          <b>{it.name}</b> ({it.kind}{it.kcs ? " · KCs 안전인증 대상" : ""}) 지급 기준: {PPE_GROUPS.filter((x) => it.cycle[x] !== undefined).map((x) => `${x} ${ruleText(it, x)}`).join(" / ")}{it.note ? ` — ${it.note}` : ""}
          {it.kind === "피복" && <><br />신입직원은 다음 유니폼 제작 때까지 기존(퇴사자) 유니폼을 입습니다 — 새로 줄 때만 체크하세요 (규정 제7조, 팀장 판단).</>}
        </p>}
      </Win>

      {it && (
        <Win en="STEP 2" ko={`${it.name} 지급 · ${tg.length}명`}>
          <form action={givePpe}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="item" value={it.name} />
            <div className="pp-form" style={{ marginBottom: 10 }}>
              <label>지급일 *<input type="date" name="day" defaultValue={today} required /></label>
              <label>지급 사유<select name="kind" defaultValue={it.season ? "정기 지급" : "신규 지급"}>{GIVE_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label>수량(1인)<input name="qty" defaultValue={String(Math.max(...PPE_GROUPS.filter((x) => it.cycle[x] !== undefined).map((x) => qtyFor(it, x)), 1))} inputMode="numeric" /></label>
              <label>수령 확인<select name="sign" defaultValue="안 받음"><option>안 받음</option><option>받음</option></select></label>
              <label className="grow">비고<input name="note" placeholder="예: 2026 동계 정기 지급" /></label>
            </div>
            <div className="tbl-wrap">
              <table className="tbl pp-give">
                <thead><tr><th>지급</th><th>구분</th><th>소속</th><th>이름</th><th>마지막 지급</th><th>상태</th><th>{it.size ? SIZE_LABEL[it.size] : "규격·사이즈"}</th></tr></thead>
                <tbody>{tg.map((p) => {
                  const c = cellOf(p, it, issues, today);
                  const need = ["none", "late", "soon"].includes(c.status);
                  const size = sizeFor(p, it) || c.size || "";
                  return (
                    <tr key={p.name} className={need ? "" : "inactive"}>
                      <td><input type="checkbox" name="who" value={`${p.name}|${p.group}`} defaultChecked={need} aria-label={`${p.name} 지급`} /></td>
                      <td><GroupChip g={p.group} /></td>
                      <td className="fd-sub">{p.dept}</td>
                      <td><b>{p.name}</b></td>
                      <td>{ymd(c.last) || "-"}</td>
                      <td><CellView c={c} /></td>
                      <td><input name={`size_${p.name}`} defaultValue={size} className="pp-size" placeholder={it.size ? "사이즈" : ""} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            {!tg.length && <p className="fd-empty">대상이 없습니다. 구분을 바꾸거나 &lsquo;지급 기준에 없는 사람도 보기&rsquo;를 켜 보세요.</p>}
            <p className="caption">미지급·교체 시기가 된 사람은 미리 체크해 두었습니다. 사이즈는 개인 사이즈를 불러온 것이며, 여기서 고치면 이번 지급에만 적용됩니다.</p>
            <button className="btn primary">고른 사람에게 지급 기록</button>
          </form>
        </Win>
      )}
    </div>
  );
}

// ================================================================== 구매·입고
function Buy({ people, issues, stock, today, links }: { people: PpePerson[]; issues: Rows; stock: Rows; today: string; links: React.ReactNode }) {
  const lines = stockOf(stock, issues);
  const due = dueList(people, issues, today);
  const ins = stock.filter((r) => !isDispose(r.data.kind));
  // 구매 필요: 지급할 사람(미지급·지남·30일 안) − 재고, 품목·사이즈별
  const need = new Map<string, { item: string; size: string; n: number }>();
  for (const d of due) {
    const size = sizeFor(d.p, d.item) || "";
    const k = `${d.item.name}|${size}`;
    need.set(k, { item: d.item.name, size, n: (need.get(k)?.n ?? 0) + 1 });
  }
  const buy = [...need.values()].map((x) => {
    const left = lines.find((l) => l.item === x.item && l.size === x.size)?.left ?? 0;
    return { ...x, left, buy: Math.max(0, x.n - Math.max(0, left)) };
  }).filter((x) => x.buy > 0);
  return (
    <div className="gr-main">
      <div className="pp-two">
        <Win en="TO BUY" ko={`사야 할 것 · ${buy.length}종`}>
          {buy.length ? (
            <table className="tbl pp-mini">
              <thead><tr><th>품목</th><th>사이즈</th><th style={{ textAlign: "right" }}>지급할 사람</th><th style={{ textAlign: "right" }}>재고</th><th style={{ textAlign: "right" }}>살 수량</th></tr></thead>
              <tbody>{buy.map((x) => (
                <tr key={`${x.item}|${x.size}`}><td><b>{x.item}</b></td><td>{x.size || <span className="muted">사이즈 없음</span>}</td>
                  <td style={{ textAlign: "right" }}>{x.n}</td><td style={{ textAlign: "right" }}>{x.left}</td><td style={{ textAlign: "right" }} className="red"><b>{x.buy}{unitOf(x.item)}</b></td></tr>
              ))}</tbody>
            </table>
          ) : <p className="fd-empty">지금 지급할 사람만큼 재고가 있습니다.</p>}
          <p className="caption">미지급·교체 지남·30일 안 교체인 사람 수에서 같은 사이즈 재고를 뺀 수량입니다. 예비분은 더해서 주문하세요.</p>
        </Win>
        <Win en="STOCK" ko="품목·사이즈별 재고 (입고 − 지급 − 폐기)">
          {lines.length ? (
            <table className="tbl pp-mini">
              <thead><tr><th>품목</th><th>사이즈</th><th style={{ textAlign: "right" }}>입고</th><th style={{ textAlign: "right" }}>지급</th><th style={{ textAlign: "right" }}>폐기</th><th style={{ textAlign: "right" }}>재고</th></tr></thead>
              <tbody>{lines.map((x) => (
                <tr key={`${x.item}|${x.size}`}>
                  <td><b>{x.item}</b></td><td>{x.size}</td>
                  <td style={{ textAlign: "right" }}>{x.inQty}</td><td style={{ textAlign: "right" }}>{x.outQty}</td><td style={{ textAlign: "right" }}>{x.disQty || ""}</td>
                  <td style={{ textAlign: "right" }} className={x.left <= 0 ? "red" : x.left <= LOW ? "orange" : ""}><b>{x.left}</b></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="fd-empty">입고 기록이 없습니다. 처음 쓸 때는 지금 있는 수량을 &lsquo;입고&rsquo;로 한 번 적어 두세요 (비고: 기초 재고).</p>}
        </Win>
      </div>
      <div className="pp-two">
        <div id="in"><Win en="IN" ko="입고 적기 (구매해서 들어온 것)">
          <form action={addPpeStock} className="pp-form">
            <input type="hidden" name="back" value="/ga/ppe?tab=buy" />
            <input type="hidden" name="kind" value="입고" />
            <label>입고일 *<input type="date" name="day" defaultValue={today} required /></label>
            <label>품목 *<input name="item" list="pp-items" required /></label>
            <label>사이즈<input name="size" placeholder="예: 270, 105, FREE" /></label>
            <label>수량 *<input name="qty" inputMode="numeric" required /></label>
            <label>구입처<input name="vendor" placeholder="예: 이카운트 거래처명" /></label>
            <label>금액(원)<input name="price" inputMode="numeric" /></label>
            <label>안전인증번호<input name="kcs" placeholder="안전화·안전모 KCs" /></label>
            <label className="grow">비고<input name="note" /></label>
            <ItemList />
            <button className="btn primary">입고 기록</button>
          </form>
        </Win></div>
        <Win en="LOG" ko="최근 입고" more={["입고·폐기 대장 전체", "/ga/b/ppestock"]}>
          {ins.length ? (
            <ul className="pp-list">{ins.slice(0, 10).map((r) => (
              <li key={r.id}><span>{r.data.item} {r.data.size && <small className="muted">{r.data.size}</small>} · {r.data.qty}{unitOf(r.data.item ?? "")}{r.data.vendor ? ` · ${r.data.vendor}` : ""}{r.data.price ? ` · ${Number(r.data.price).toLocaleString()}원` : ""}</span><small className="muted">{ymd(r.data.day)}</small></li>
            ))}</ul>
          ) : <p className="fd-empty">아직 입고 기록이 없습니다.</p>}
        </Win>
      </div>
      <div className="u-grid">{links}</div>
    </div>
  );
}

const ItemList = () => <datalist id="pp-items">{PPE_ITEMS.map((i) => <option key={i.name} value={i.name} />)}</datalist>;

// ================================================================== 유지 (교체·반납·폐기·점검)
const KEEP_KINDS = ["교체(파손·분실)", "반납", "추가 지급"] as const;
function Keep({ people, everyone, issues, stock, today }: { people: PpePerson[]; everyone: PpePerson[]; issues: Rows; stock: Rows; today: string }) {
  const ret = returnDue(everyone, issues, today);
  const retired = everyone.filter((p) => p.retired && !p.daily);
  const log = [
    ...issues.filter((r) => (KEEP_KINDS as readonly string[]).includes(r.data.kind ?? "")).map((r) => ({ id: `i${r.id}`, day: r.data.day ?? "", kind: r.data.kind!, what: `${r.data.item ?? ""}${r.data.size ? ` ${r.data.size}` : ""}`, who: r.data.emp ?? "", note: r.data.note ?? "", qty: qtyOf(r) })),
    ...stock.filter((r) => isDispose(r.data.kind)).map((r) => ({ id: `s${r.id}`, day: r.data.day ?? "", kind: "폐기", what: `${r.data.item ?? ""}${r.data.size ? ` ${r.data.size}` : ""}`, who: "", note: r.data.note ?? "", qty: +r.data.qty || 0 })),
  ].sort((a, b) => b.day.localeCompare(a.day));
  const year = today.slice(0, 4);
  const cnt = (k: string) => log.filter((x) => x.kind === k && x.day.startsWith(year)).reduce((t, x) => t + x.qty, 0);
  return (
    <div className="gr-main">
      <div className="gr-cards pp-keep-cards">
        <div className="gr-card" style={{ ["--c" as string]: "#c2410c" }}><span>교체 ({year})</span><b>{cnt("교체(파손·분실)")}</b><small>파손·분실·오염</small></div>
        <div className="gr-card" style={{ ["--c" as string]: "#0c3994" }}><span>반납 ({year})</span><b>{cnt("반납")}</b><small>퇴사·일용직 종료</small></div>
        <div className="gr-card" style={{ ["--c" as string]: "#6b7280" }}><span>폐기 ({year})</span><b>{cnt("폐기")}</b><small>재고에서 뺌</small></div>
        <div className="gr-card" style={{ ["--c" as string]: "#1f8a3b" }}><span>다음 점검</span><b style={{ fontSize: "1.3rem" }}>{nextQuarter(today)}</b><small>분기마다 착용·보관 상태</small></div>
      </div>
      <div className="pp-two">
        <Win en="REPLACE" ko="교체 · 반납 · 추가 지급 (한 사람)">
          <form action={givePpe} className="pp-form">
            <input type="hidden" name="back" value="/ga/ppe?tab=keep" />
            <label>날짜 *<input type="date" name="day" defaultValue={today} required /></label>
            <label>구분 *<select name="kind" defaultValue="교체(파손·분실)">{KEEP_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
            <label>받은·돌려준 사람 *<select name="who" required defaultValue="">
              <option value="" disabled>사람 고르기</option>
              {PPE_GROUPS.map((gr) => <optgroup key={gr} label={gr}>{people.filter((p) => p.group === gr).map((p) => <option key={p.name} value={`${p.name}|${p.group}`}>{p.name} ({p.dept})</option>)}</optgroup>)}
              {retired.length > 0 && <optgroup label="퇴사자 (반납)">{retired.map((p) => <option key={p.name} value={`${p.name}|${p.group}`}>{p.name} ({p.dept}, {ymd(p.retired)} 퇴사)</option>)}</optgroup>}
            </select></label>
            <label>품목 *<input name="item" list="pp-items" required /></label>
            <label>사이즈<input name="size" placeholder="비우면 개인 사이즈" /></label>
            <label>수량<input name="qty" defaultValue="1" inputMode="numeric" /></label>
            <input type="hidden" name="sign" value="안 받음" />
            <label className="grow">사유 *<input name="note" required placeholder="예: 밑창 마모, 안전모 균열, 분실, 퇴사 반납" /></label>
            <ItemList />
            <button className="btn primary">기록</button>
          </form>
          <p className="caption"><b>교체 조건 (규정 제7조)</b>: 피복지급신청서 접수(사진 필히 첨부) + 노후·파손된 피복 반납 후 지급. 본인의 명백한 과실(고의 훼손·분실)은 지급하지 않습니다. 훼손으로 못 입게 되면 피복훼손보고서(별지 제2호)를 받습니다.</p>
          <p className="caption">교체·추가 지급은 재고에서 빠지고, 다음 교체일이 이 날짜부터 다시 계산됩니다. 반납품은 다시 쓰지 않는 것으로 보고 재고에 더하지 않습니다(다시 쓸 수 있으면 입고로 적으세요).</p>
        </Win>
        <Win en="DISPOSE" ko="폐기 (재고에서 빼기)">
          <form action={addPpeStock} className="pp-form">
            <input type="hidden" name="back" value="/ga/ppe?tab=keep" />
            <input type="hidden" name="kind" value="폐기" />
            <label>폐기일 *<input type="date" name="day" defaultValue={today} required /></label>
            <label>품목 *<input name="item" list="pp-items" required /></label>
            <label>사이즈<input name="size" /></label>
            <label>수량 *<input name="qty" inputMode="numeric" required /></label>
            <label className="grow">사유 *<input name="note" required placeholder="예: 반납품 재사용 불가, 유효기간 지남, 불량" /></label>
            <button className="btn">폐기 기록</button>
          </form>
          <h4 className="pp2-h4">점검할 것 (분기)</h4>
          <ul className="pp-law">
            <li><b>안전모</b> — 균열·변형, 턱끈·내장재 상태. 충격을 받은 것은 바로 교체</li>
            <li><b>안전화</b> — 밑창 마모, 앞코(선심) 변형, 갑피 찢어짐</li>
            <li><b>피복</b> — 찢어짐·심한 오염, 반사띠 손상</li>
            <li><b>보관</b> — 재고는 직사광선·습기 피해서, 사이즈별로 정리</li>
          </ul>
        </Win>
      </div>
      <Win en="RETURN" ko={`퇴직 반납 확인 (규정 제8조) · 최근 1년 퇴사자 ${ret.filter((x) => !x.returned).length}건 남음`}>
        {ret.length ? (
          <table className="tbl pp-mini">
            <thead><tr><th>퇴사자</th><th>퇴사일</th><th>받은 피복</th><th>지급일</th><th style={{ textAlign: "right" }}>수량</th><th>반납</th><th>못 돌려받으면 공제</th></tr></thead>
            <tbody>{ret.map((x, i) => (
              <tr key={i} className={x.returned ? "inactive" : ""}>
                <td><Link href={`/ga/ppe/person?name=${encodeURIComponent(x.p.name)}`}><b>{x.p.name}</b></Link> <small className="muted">{x.p.dept}</small></td>
                <td>{ymd(x.p.retired)}</td><td>{x.item}{x.size ? ` ${x.size}` : ""}</td><td>{ymd(x.day)}</td><td style={{ textAlign: "right" }}>{x.qty}</td>
                <td>{x.returned ? <span className="green">✓ 반납</span> : <b className="red">아직</b>}</td>
                <td>{x.returned ? "" : <>지급금액의 <b>{x.rate}</b>{x.price ? ` (${Math.round(Number(x.price) * (x.rate === "전액" ? 1 : x.rate === "2/3" ? 2 / 3 : 0.5)).toLocaleString()}원)` : ""}</>}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="fd-empty">최근 1년 안에 퇴사한 사람 중 1년 안에 받은 피복이 있는 사람이 없습니다.</p>}
        <p className="caption">퇴직 전 1년 안에 받은 피복은 세탁해서 전량 반납합니다. 반납하면 위 [교체·반납] 칸에서 퇴사자를 골라 &lsquo;반납&rsquo;으로 적으세요. 못 돌려받으면 지급 후 1개월 미만 전액 · 1~6개월 미만 2/3 · 6개월~1년 미만 1/2을 급료·퇴직금에서 공제합니다 (재활용 못 할 상태면 미반납으로 봄).</p>
      </Win>
      <Win en="LOG" ko={`교체·반납·폐기 기록 · ${log.length}건`}>
        {log.length ? (
          <table className="tbl pp-mini">
            <thead><tr><th>날짜</th><th>구분</th><th>품목</th><th>사람</th><th style={{ textAlign: "right" }}>수량</th><th>사유</th></tr></thead>
            <tbody>{log.slice(0, 50).map((x) => (
              <tr key={x.id}><td>{ymd(x.day)}</td><td><span className={`pp2-tag ${x.kind === "폐기" ? "gray" : x.kind === "반납" ? "sign" : "late"}`}>{x.kind}</span></td><td>{x.what}</td>
                <td>{x.who ? <Link href={`/ga/ppe/person?name=${encodeURIComponent(x.who)}`}>{x.who}</Link> : ""}</td><td style={{ textAlign: "right" }}>{x.qty}</td><td className="fd-sub" style={{ whiteSpace: "normal" }}>{x.note}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="fd-empty">아직 교체·반납·폐기 기록이 없습니다.</p>}
      </Win>
    </div>
  );
}
/** 다음 분기 첫날 (점검) */
function nextQuarter(today: string) {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const q = Math.floor((m - 1) / 3) + 1;
  return q === 4 ? `${y + 1}.01` : `${y}.${String(q * 3 + 1).padStart(2, "0")}`;
}

// ================================================================== 규정·양식
async function Rule() {
  const files = await loadFiles("ppe:");
  const box = (ref: string, title: string, hint: string) => {
    const list = files.get(ref) ?? [];
    return (
      <>
        {list.length ? (
          <ul className="pp2-files">{list.map((a) => (
            <li key={a.id}>
              <a href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📄 {a.fileName}</a>
              <small className="muted">{ymd(a.createdAt.slice(0, 10))} · {Math.max(1, Math.round(a.size / 1024))}KB</small>
              <a className="btn sm" href={`/api/ga/file/${a.id}?download`}>내려받기</a>
              <form action={deletePpeFile}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value="/ga/ppe?tab=rule" /><button className="btn sm ghost" aria-label={`${a.fileName} 지우기`}>×</button></form>
            </li>
          ))}</ul>
        ) : <p className="fd-empty">{hint}</p>}
        <form action={uploadPpeFile} className="pp2-up">
          <input type="hidden" name="ref" value={ref} /><input type="hidden" name="back" value="/ga/ppe?tab=rule" />
          <input type="file" name="file" multiple required aria-label={`${title} 파일`} />
          <button className="btn sm primary">올리기</button>
        </form>
      </>
    );
  };
  return (
    <div className="gr-main">
      <div className="pp-two">
        <Win en="RULE" ko="피복 관리 규정">
          {box("ppe:rule", "피복 관리 규정", "피복 관리 규정 파일(PDF·한글)을 올려 두세요. 최신본을 맨 아래에 올리면 됩니다.")}
          <h4 className="pp2-h4">규정 요점 — SN-MI-1042 (관리팀 주관, 23.09.27 제정)</h4>
          <ul className="pp-law">
            <li><b>적용 (제2·3조)</b> — 본사 직원. 피복 = 회사 지정 제복·제모·작업화와 부속 장구류</li>
            <li><b>책임 (제4조)</b> — 지급은 관리팀 주관, 피복관리대장(별지 1호) 정리, 부서장은 착용 지도, 훼손 시 피복훼손보고서(별지 2호), 세탁·수리는 자비</li>
            <li><b>정기 지급일·착용 기간 (제5조)</b> — {WEAR_PERIODS.map((w) => w.set + " " + w.label).join(" · ")} / 지급 춘추복 3/25 · 하복 4/25 · 춘추복 9/10 · 동복 10/15. 기후에 따라 기간 조정 가능</li>
            <li><b>수령 확인 (제5조④)</b> — 사원피복지급현황 기록부(별지 3호)에 서명</li>
            <li><b>지급 기준 (제7조)</b> — 하계 상·하의 현장직 3벌/1년 · 춘추 상·하의 현장직 2벌/2년 · 동계 상·하의 현장직 1벌/2년 · 점퍼(춘추·동계) 전 직원 1벌/2년 · 안전화 현장직 1켤레/1년, 사무직 1켤레/2년. 현장 업무가 잦은 사무직은 현장직 기준</li>
            <li><b>신입직원</b> — 다음 유니폼 제작 때까지 기존(퇴사자) 유니폼. 주관팀장 판단으로 신규 지급 가능</li>
            <li><b>교체</b> — 기간을 정해 부서별로 일괄 회수 후 교체. 노후·훼손은 피복지급신청서(사진 첨부)+헌 피복 반납, 본인 과실은 지급 안 함. 안전화는 들어온 시점 기준</li>
            <li><b>관리 (제6조)</b> — 지급받은 근무복을 임의로 바꾸지 않고 단정하게 착용</li>
            <li><b>반납 (제8조)</b> — 퇴직 시 1년 안에 받은 피복 전량 반납, 못 하면 공제(1개월 미만 전액 · 6개월 미만 2/3 · 1년 미만 1/2)</li>
          </ul>
        </Win>
        <Win en="FORMS" ko="양식">
          {box("ppe:form", "양식", "규정의 별지 서식을 올려 두세요: 제1호 피복관리대장 · 제2호 피복훼손보고서 · 제3호 사원피복지급현황 기록부 (+ 피복지급신청서).")}
          <h4 className="pp2-h4">이 화면에서 바로 뽑기</h4>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <Link className="btn sm" href="/ga/ppe?tab=people&view=table">개인별 현황표 (인쇄)</Link>
            <a className="btn sm" href="/api/ledger/ppe">지급대장 엑셀</a>
            <a className="btn sm" href="/api/ledger/ppepeople">사이즈 명단 엑셀</a>
            <a className="btn sm" href="/api/ledger/ppestock">입고·폐기 엑셀</a>
          </div>
        </Win>
      </div>
      <Win en="STANDARD" ko="품목별 지급 기준 (피복 관리 규정 제7조 · 연구소 = 사무직)">
        <div className="tbl-wrap">
          <table className="tbl pp-mini">
            <thead><tr><th>품목</th><th>종류</th>{PPE_GROUPS.map((x) => <th key={x}>{x}</th>)}<th>정기 지급 달</th><th>KCs</th><th>메모</th></tr></thead>
            <tbody>{PPE_ITEMS.map((i) => (
              <tr key={i.name}>
                <td><b>{i.name}</b></td><td>{i.kind}</td>
                {PPE_GROUPS.map((x) => <td key={x} className={i.cycle[x] === undefined ? "pp-na" : ""}>{i.kind === "소모품" ? "필요할 때" : ruleText(i, x)}</td>)}
                <td>{i.season ? `${i.season.join("·")}월` : ""}</td><td>{i.kcs ? "✔" : ""}</td>
                <td className="fd-sub" style={{ whiteSpace: "normal" }}>{i.note}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Win>
      <div className="pp-two">
        <Win en="DUTIES" ko="하는 일 (업무분장 2-1. 피복 및 보호구)">
          <table className="tbl pp-mini">
            <thead><tr><th>단계</th><th>하는 일</th><th>주기</th></tr></thead>
            <tbody>{PPE_DUTIES.map((d) => (
              <tr key={d.step}><td><b>{d.step}</b></td><td style={{ whiteSpace: "normal" }}>{d.task}{d.note && <small className="muted" style={{ display: "block" }}>{d.note}</small>}</td><td>{d.cycle}</td></tr>
            ))}</tbody>
          </table>
        </Win>
        <Win en="LAW" ko="법 근거">
          <ul className="pp-law">
            <li><b>산업안전보건기준에 관한 규칙 제32조(보호구의 지급 등)</b> — 작업조건에 맞는 보호구를 작업하는 근로자 수 이상으로 지급하고 착용하도록 해야 합니다.</li>
            <li><b>같은 규칙 제33조(보호구의 관리)</b> — 지급한 보호구를 상시 점검하여 이상이 있으면 수리하거나 교환해 항상 쓸 수 있게 관리합니다.</li>
            <li><b>산업안전보건법 제84조</b> — 안전화·안전모는 안전인증 대상이므로 KCs 인증품을 써야 합니다. 입고할 때 인증번호를 적어 두세요.</li>
            <li><b>지급대장</b>은 지급·착용 지시의 증빙이므로 수령 서명까지 남겨 두세요.</li>
            <li>참고: <a href="https://www.law.go.kr/법령/산업안전보건기준에관한규칙" target="_blank" rel="noreferrer">국가법령정보센터</a> · <a href="https://portal.kosha.or.kr" target="_blank" rel="noreferrer">안전보건공단 포털</a></li>
          </ul>
        </Win>
      </div>
    </div>
  );
}
