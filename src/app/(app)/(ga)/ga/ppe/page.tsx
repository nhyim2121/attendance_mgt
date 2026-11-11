/** 보호구·피복 관리 (총무 2-1, 관리자만): 대시보드 · 개인별 현황표 · 일괄 지급 · 재고·입고 · 업무분장·지급 기준.
 *  대상: 현장직(생산·품질·영업팀, 이병욱 부장 제외) + 일용직, 연구소(사무직). 기준·계산은 src/lib/총무/ppe.ts */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import { Win } from "@/components/대시/win";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import * as store from "@/lib/대장/store";
import { loadEmployees } from "@/lib/store";
import {
  activeOnly, buildPeople, byDept, cellOf, requiredItems, dueList, GIVE_KINDS, GROUP_COLOR, isGive, itemOf, MATRIX_ITEMS, matrix, PPE_DUTIES, PPE_GROUPS, PPE_ITEMS,
  type PpeGroup, type PpePerson, seasonal, SIZE_LABEL, sizeFor, STATUS_LABEL, stockOf,
} from "@/lib/총무/ppe";
import { todayKst } from "@/lib/time";
import { addPpeStock, givePpe, savePpePerson, signPpeMany } from "./actions";
import { CellView, GroupChip, Msg, Tabs, ymd } from "./ui";

export const metadata = { title: "보호구·피복 관리 · 총무 · 통합관리시스템" };
type Sp = { tab?: string; g?: string; q?: string; item?: string; all?: string; msg?: string; view?: string };

const LOW = 2; // 재고가 이만큼 이하면 '부족'

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = ["people", "give", "stock", "duty"].includes(sp.tab ?? "") ? sp.tab! : "";
  const today = todayKst();
  const [emps, issues, profiles, stock] = await Promise.all([
    loadEmployees(), store.loadRows("ppe"), store.loadRows("ppepeople"), store.loadRows("ppestock"),
  ]);
  const everyone = buildPeople(emps, profiles, today, true); // 재직·퇴사 모두 (부서별 직원 화면)
  const people = activeOnly(everyone);                       // 알림·일괄 지급은 지금 관리 중인 사람만
  const g = PPE_GROUPS.includes(sp.g as PpeGroup) ? (sp.g as PpeGroup) : "";
  return (
    <div className="ud pp">
      <PageHead href="/ga/ppe" desc="현장직(생산·품질·영업팀, 일용직)과 연구소의 개인별 보호구·피복 지급을 관리합니다. 마지막 지급일과 교체 주기로 미지급·교체 시기를 알려 주고, 재고는 입고 − 지급으로 계산합니다.">
        <Link className="btn primary" href="/ga/ppe?tab=give">+ 일괄 지급</Link>
        <a className="btn" href="/api/ledger/ppe">지급 기록 엑셀</a>
        <PrintButton label="인쇄" />
      </PageHead>
      <Msg msg={sp.msg} />
      <Tabs tab={tab} />
      {tab === "" && <Dash people={people} issues={issues} stock={stock} today={today} />}
      {tab === "people" && (sp.view === "table"
        ? <People people={people} issues={issues} today={today} g={g} q={(sp.q ?? "").trim()} />
        : <Circles people={everyone} issues={issues} today={today} g={g} q={(sp.q ?? "").trim()} />)}
      {tab === "give" && <Give people={people} issues={issues} today={today} g={g} item={sp.item ?? ""} all={sp.all === "1"} />}
      {tab === "stock" && <Stock issues={issues} stock={stock} today={today} />}
      {tab === "duty" && <Duty />}
    </div>
  );
}

type Rows = Awaited<ReturnType<typeof store.loadRows>>;

// ================================================================== 대시보드
function Dash({ people, issues, stock, today }: { people: PpePerson[]; issues: Rows; stock: Rows; today: string }) {
  const due = dueList(people, issues, today);
  const cnt = (s: string) => due.filter((d) => d.cell.status === s).length;
  const unsigned = issues.filter((r) => isGive(r.data.kind) && r.data.sign !== "받음");
  const thisYear = today.slice(0, 4);
  const yearN = issues.filter((r) => isGive(r.data.kind) && (r.day ?? "").startsWith(thisYear)).reduce((t, r) => t + (+r.data.qty || 1), 0);
  const low = stockOf(stock, issues).filter((x) => x.left <= LOW);
  const seas = seasonal(today);
  const byG = (gr: PpeGroup) => people.filter((p) => p.group === gr);

  return (
    <div className="gr-main">
      <div className="gr-cards pp-cards">
        {PPE_GROUPS.map((gr) => (
          <Link key={gr} href={`/ga/ppe?tab=people&g=${gr}`} className="gr-card" style={{ ["--c" as string]: GROUP_COLOR[gr] }}>
            <span>{gr}</span><b>{byG(gr).length}</b><small>{gr === "일용직" ? "투입 중" : "관리 대상"}</small>
          </Link>
        ))}
        <Link href="/ga/ppe?tab=give" className="gr-card" style={{ ["--c" as string]: "#dc2626" }}>
          <span>미지급 · 교체 지남</span><b>{cnt("none") + cnt("late")}</b><small>미지급 {cnt("none")} · 지남 {cnt("late")}</small>
        </Link>
        <div className="gr-card" style={{ ["--c" as string]: "#d97706" }}>
          <span>30일 안 교체</span><b>{cnt("soon")}</b><small>{thisYear}년 지급 {yearN}개</small>
        </div>
        <div className="gr-card" style={{ ["--c" as string]: "#0e7490" }}>
          <span>수령 확인 안 됨</span><b>{unsigned.length}</b><small>서명 받기</small>
        </div>
      </div>

      {seas.map(({ item, now }) => {
        const tg = people.filter((p) => item.cycle[p.group] !== undefined);
        const need = tg.filter((p) => ["none", "late", "soon"].includes(cellOf(p, item, issues, today).status));
        return (
          <div key={item.name} className={`pp-season ${now ? "now" : ""}`}>
            <b>{now ? "📣 이번 달" : "🗓️ 다음 달"}은 {item.name} 정기 지급 달입니다.</b>
            <span>대상 {tg.length}명 중 받을 사람 {need.length}명</span>
            {need.length > 0 && <Link className="btn sm primary" href={`/ga/ppe?tab=give&item=${encodeURIComponent(item.name)}`}>일괄 지급하기</Link>}
          </div>
        );
      })}

      <div className="pp-two">
        <Win en="TO GIVE" ko={`지급할 것 · ${due.length}건`} more={["일괄 지급", "/ga/ppe?tab=give"]}>
          {due.length ? (
            <table className="tbl pp-mini"><tbody>
              {due.slice(0, 14).map(({ p, item, cell }) => (
                <tr key={`${p.name}${item.name}`}>
                  <td><Link href={`/ga/ppe/person?name=${encodeURIComponent(p.name)}`}><b>{p.name}</b></Link> <small className="muted">{p.dept}</small></td>
                  <td>{item.name}</td>
                  <td><span className={`pp-cell ${cell.status}`}>{STATUS_LABEL[cell.status]}{cell.left !== undefined && cell.status !== "none" ? ` ${cell.left < 0 ? `${-cell.left}일` : `D-${cell.left}`}` : ""}</span></td>
                  <td><Link className="btn sm" href={`/ga/ppe?tab=give&item=${encodeURIComponent(item.name)}`}>지급</Link></td>
                </tr>
              ))}
            </tbody></table>
          ) : <p className="fd-empty">미지급·교체할 것이 없습니다.</p>}
          {due.length > 14 && <p className="caption">그 밖 {due.length - 14}건은 <Link href="/ga/ppe?tab=people">개인별 현황</Link>에서 보세요.</p>}
        </Win>

        <Win en="SIGN" ko={`수령 확인 안 된 지급 · ${unsigned.length}건`}>
          {unsigned.length ? (
            <form action={signPpeMany}>
              <input type="hidden" name="back" value="/ga/ppe" />
              <table className="tbl pp-mini"><tbody>
                {unsigned.slice(0, 14).map((r) => (
                  <tr key={r.id}>
                    <td style={{ width: 28 }}><input type="checkbox" name="id" value={r.id} defaultChecked aria-label={`${r.data.emp} 수령 확인`} /></td>
                    <td><Link href={`/ga/ppe/person?name=${encodeURIComponent(r.data.emp ?? "")}`}><b>{r.data.emp}</b></Link></td>
                    <td>{r.data.item} <small className="muted">{r.data.size}</small></td>
                    <td>{ymd(r.data.day)}</td>
                  </tr>
                ))}
              </tbody></table>
              <button className="btn sm primary" style={{ marginTop: 8 }}>고른 것 수령 확인(받음)</button>
            </form>
          ) : <p className="fd-empty">모두 수령 확인했습니다.</p>}
        </Win>
      </div>

      <div className="pp-two">
        <Win en="RATE" ko="구분별 지급 현황 (주기 안에 받은 사람)">
          <table className="tbl pp-rate">
            <thead><tr><th>품목</th>{PPE_GROUPS.map((gr) => <th key={gr}>{gr}</th>)}</tr></thead>
            <tbody>{MATRIX_ITEMS.map((item) => (
              <tr key={item.name}>
                <td><b>{item.name}</b></td>
                {PPE_GROUPS.map((gr) => {
                  if (item.cycle[gr] === undefined) return <td key={gr} className="pp-na">·</td>;
                  const tg = people.filter((p) => p.group === gr);
                  const ok = tg.filter((p) => ["ok", "soon"].includes(cellOf(p, item, issues, today).status)).length;
                  const pct = tg.length ? Math.round((ok / tg.length) * 100) : 0;
                  return (
                    <td key={gr}>
                      <div className="pp-bar"><i style={{ width: `${pct}%`, background: GROUP_COLOR[gr] }} /></div>
                      <small>{ok}/{tg.length}명</small>
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        </Win>

        <div className="gr-main">
          <Win en="STOCK" ko={`재고 부족 (${LOW}개 이하)`} more={["재고·입고", "/ga/ppe?tab=stock"]}>
            {low.length ? (
              <ul className="pp-list">{low.map((x) => (
                <li key={`${x.item}${x.size}`}><span>{x.item} {x.size && <small className="muted">{x.size}</small>}</span><b className={x.left <= 0 ? "red" : "orange"}>{x.left}개</b></li>
              ))}</ul>
            ) : <p className="fd-empty">{stock.length ? "부족한 재고가 없습니다." : "입고 기록이 아직 없습니다. 재고·입고 탭에서 적으면 재고를 계산합니다."}</p>}
          </Win>
          <Win en="RECENT" ko="최근 지급" more={["지급 기록 전체", "/ga/b/ppe"]}>
            {issues.length ? (
              <ul className="pp-list">{issues.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <span><Link href={`/ga/ppe/person?name=${encodeURIComponent(r.data.emp ?? "")}`}><b>{r.data.emp}</b></Link> · {r.data.item} {r.data.size && <small className="muted">{r.data.size}</small>}{r.data.kind === "반납" && <small className="red"> 반납</small>}</span>
                  <small className="muted">{ymd(r.data.day)}</small>
                </li>
              ))}</ul>
            ) : <p className="fd-empty">아직 지급 기록이 없습니다. [일괄 지급]으로 시작하거나, 예전 엑셀 지급대장을 <Link href="/ga/b/ppe">지급 기록 전체</Link>에서 가져오세요.</p>}
          </Win>
        </div>
      </div>
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
            {cols.map((i) => <th key={i.name} title={PPE_GROUPS.map((x) => `${x} ${cycleText(i.cycle[x])}`).join(" · ")}>{i.name}</th>)}
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
const cycleText = (n: number | undefined) => (n === undefined ? "대상 아님" : n === 0 ? "처음 1회·파손 때" : n % 12 === 0 ? `${n / 12}년마다` : `${n}개월마다`);

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
          <b>{it.name}</b> ({it.kind}{it.kcs ? " · KCs 안전인증 대상" : ""}) 지급 기준: {PPE_GROUPS.map((x) => `${x} ${cycleText(it.cycle[x])}`).join(" / ")}{it.note ? ` — ${it.note}` : ""}
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
              <label>수량(1인)<input name="qty" defaultValue="1" inputMode="numeric" /></label>
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

// ================================================================== 재고·입고
function Stock({ issues, stock, today }: { issues: Rows; stock: Rows; today: string }) {
  const lines = stockOf(stock, issues);
  return (
    <div className="pp-two">
      <Win en="STOCK" ko="품목·사이즈별 재고 (입고 − 지급)">
        {lines.length ? (
          <table className="tbl pp-mini">
            <thead><tr><th>품목</th><th>사이즈</th><th style={{ textAlign: "right" }}>입고</th><th style={{ textAlign: "right" }}>지급</th><th style={{ textAlign: "right" }}>재고</th></tr></thead>
            <tbody>{lines.map((x) => (
              <tr key={`${x.item}|${x.size}`}>
                <td><b>{x.item}</b></td><td>{x.size}</td>
                <td style={{ textAlign: "right" }}>{x.inQty}</td><td style={{ textAlign: "right" }}>{x.outQty}</td>
                <td style={{ textAlign: "right" }} className={x.left <= 0 ? "red" : x.left <= LOW ? "orange" : ""}><b>{x.left}</b></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="fd-empty">입고·지급 기록이 없습니다.</p>}
        <p className="caption">지급만 있고 입고가 없으면 재고가 마이너스로 보입니다. 처음 쓸 때는 지금 있는 수량을 &lsquo;입고&rsquo;로 한 번 적어 두세요 (비고: 기초 재고).</p>
      </Win>
      <div className="gr-main">
        <Win en="IN" ko="입고 적기">
          <form action={addPpeStock} className="pp-form">
            <input type="hidden" name="back" value="/ga/ppe?tab=stock" />
            <label>입고일 *<input type="date" name="day" defaultValue={today} required /></label>
            <label>품목 *<input name="item" list="pp-items" required /></label>
            <label>사이즈<input name="size" placeholder="예: 270, 105, FREE" /></label>
            <label>수량 *<input name="qty" inputMode="numeric" required /></label>
            <label>구입처<input name="vendor" /></label>
            <label>금액(원)<input name="price" inputMode="numeric" /></label>
            <label>안전인증번호<input name="kcs" placeholder="KCs 대상만" /></label>
            <label className="grow">비고<input name="note" /></label>
            <datalist id="pp-items">{PPE_ITEMS.map((i) => <option key={i.name} value={i.name} />)}</datalist>
            <button className="btn primary">입고 기록</button>
          </form>
        </Win>
        <Win en="LOG" ko="최근 입고" more={["입고 대장 전체", "/ga/b/ppestock"]}>
          {stock.length ? (
            <ul className="pp-list">{stock.slice(0, 10).map((r) => (
              <li key={r.id}><span>{r.data.item} {r.data.size && <small className="muted">{r.data.size}</small>} · {r.data.qty}개{r.data.vendor ? ` · ${r.data.vendor}` : ""}</span><small className="muted">{ymd(r.data.day)}</small></li>
            ))}</ul>
          ) : <p className="fd-empty">아직 입고 기록이 없습니다.</p>}
        </Win>
      </div>
    </div>
  );
}

// ================================================================== 업무분장·지급 기준
function Duty() {
  return (
    <div className="gr-main">
      <Win en="DUTIES" ko="업무분장 2-1. 피복 및 보호구 — 하는 일" more={["총무 업무분장 전체", "/ga/duties"]}>
        <table className="tbl pp-mini">
          <thead><tr><th>단계</th><th>하는 일</th><th>주기</th><th>근거·메모</th></tr></thead>
          <tbody>{PPE_DUTIES.map((d) => (
            <tr key={d.step}><td><b>{d.step}</b></td><td style={{ whiteSpace: "normal" }}>{d.task}</td><td>{d.cycle}</td><td className="fd-sub" style={{ whiteSpace: "normal" }}>{d.note}</td></tr>
          ))}</tbody>
        </table>
      </Win>
      <Win en="STANDARD" ko="품목별 지급 기준 (회사 기준 초안 — 고치려면 알려 주세요)">
        <div className="tbl-wrap">
          <table className="tbl pp-mini">
            <thead><tr><th>품목</th><th>종류</th>{PPE_GROUPS.map((x) => <th key={x}>{x}</th>)}<th>정기 지급 달</th><th>KCs</th><th>메모</th></tr></thead>
            <tbody>{PPE_ITEMS.map((i) => (
              <tr key={i.name}>
                <td><b>{i.name}</b></td><td>{i.kind}</td>
                {PPE_GROUPS.map((x) => <td key={x} className={i.cycle[x] === undefined ? "pp-na" : ""}>{i.kind === "소모품" ? "필요할 때" : cycleText(i.cycle[x])}</td>)}
                <td>{i.season ? `${i.season}월` : ""}</td><td>{i.kcs ? "✔" : ""}</td>
                <td className="fd-sub" style={{ whiteSpace: "normal" }}>{i.note}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Win>
      <Win en="LAW" ko="법 근거와 참고">
        <ul className="pp-law">
          <li><b>산업안전보건기준에 관한 규칙 제32조(보호구의 지급 등)</b> — 작업조건에 맞는 보호구를 작업하는 근로자 수 이상으로 지급하고 착용하도록 해야 합니다. 근로자는 지급받은 보호구를 착용해야 합니다(제2항).</li>
          <li><b>같은 규칙 제33조(보호구의 관리)</b> — 지급한 보호구를 상시 점검하여 이상이 있으면 수리하거나 다른 것으로 교환해 항상 사용할 수 있도록 관리합니다.</li>
          <li><b>산업안전보건법 제84조</b> — 안전화·안전모는 안전인증 대상 보호구이므로 KCs 인증품을 써야 합니다. 입고할 때 인증번호를 적어 두세요.</li>
          <li><b>지급대장</b>은 지급·착용 지시의 증빙이 되므로 수령 확인(서명)까지 남겨 두세요. 사업주는 지급뿐 아니라 착용 관리·감독 의무도 집니다.</li>
          <li>참고: <a href="https://www.law.go.kr/법령/산업안전보건기준에관한규칙" target="_blank" rel="noreferrer">국가법령정보센터 — 산업안전보건기준에 관한 규칙</a> · <a href="https://portal.kosha.or.kr" target="_blank" rel="noreferrer">안전보건공단 포털</a></li>
        </ul>
      </Win>
    </div>
  );
}
