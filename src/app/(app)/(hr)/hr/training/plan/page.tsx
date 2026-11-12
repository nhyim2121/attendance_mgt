/** 연간 교육 계획·실적표 (관리자) — 회사 엑셀 양식처럼 과정 × 1~12월 (계획 / 실적 인원), 이수율, 비고(기관)
 *  ?view=doc 이면 교육/훈련 계획서(결재란 · 팀명 · 작성일자 · 작성자 · NO·교육대상·교육과정명·교육시간·교육월·교육기관(장소)·비고) 인쇄 양식 */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import { loadBooks } from "@/lib/대장/store";
import { loadBase } from "@/lib/인사노무/data";
import { courseOf, trainingView } from "@/lib/인사노무/training";
import { todayKst } from "@/lib/time";

export const metadata = { title: "연간 교육 계획·실적표 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const key = (s: string) => (s || "").replace(/\s+/g, "").replace(/[()（）]/g, "");
const KIND_ORDER = ["법정의무", "안전보건", "신입사원", "직무", "리더십·관리자", "자격 취득", "외부 위탁", "e러닝", "사내", "기타"];

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireAdminPage();
  const sp = await searchParams;
  const today = todayKst();
  const y = Number(one(sp.y)) || +today.slice(0, 4);
  const doc = one(sp.view) === "doc";
  const [all, base, tv] = await Promise.all([loadBooks(["trainplan", "training"]), loadBase(), trainingView(y)]);
  const plans = all.filter((r) => r.book === "trainplan" && r.day?.startsWith(String(y)) && r.data.status !== "취소")
    .sort((a, b) => (a.day ?? "").localeCompare(b.day ?? "") || a.id - b.id);
  const done = all.filter((r) => r.book === "training" && r.day?.startsWith(String(y)));

  if (doc) {
    const team = one(sp.team) || "관리팀", wrote = one(sp.d) || today;
    return (
      <div className="home">
        <div className="noprint">
          <PageHead href="/hr/training/plan" title="교육/훈련 계획서" mark={`${y}년`} emoji="🎓" desc="연간 교육 계획 대장으로 회사 양식 계획서를 만듭니다. 팀명·작성일자는 아래에서 바꿔 인쇄하세요.">
            <Link className="pill" href={`?y=${y}`}>계획·실적표</Link>
            <Link className="pill" href={`?y=${y + 1}&view=doc`}>{y + 1}년</Link>
            <Link className="pill" href="/hr/b/trainplan#form">+ 계획 추가</Link>
            <PrintButton className="pill print" label="인쇄 / PDF" />
          </PageHead>
          <form className="tr-docf">
            <input type="hidden" name="y" value={y} /><input type="hidden" name="view" value="doc" />
            <label>팀명 <input name="team" defaultValue={team} /></label>
            <label>작성일자 <input type="date" name="d" defaultValue={wrote} /></label>
            <button className="btn sm">바꾸기</button>
          </form>
        </div>
        <div className="tr-paper rep">
          <table className="tr-rh"><tbody>
            <tr>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <td rowSpan={3} className="logo"><img src="/logo.png" alt="회사 로고" /></td>
              <td rowSpan={3} className="ttl" style={{ letterSpacing: ".15em" }}>( {y} )년 교육 / 훈련<br />계획서</td>
              <th>작 성</th><th>검 토</th><th>승 인</th>
            </tr>
            <tr><td className="sg" /><td className="sg" /><td className="sg" /></tr>
            <tr><td className="dt">/ &nbsp; /</td><td className="dt">/ &nbsp; /</td><td className="dt">/ &nbsp; /</td></tr>
          </tbody></table>
          <table className="tr-rb"><tbody><tr>
            <th>팀 명</th><td>{team}</td><th>작성일자</th><td>{wrote.replaceAll("-", ".")}</td><th>작성자</th><td>{user.name}</td>
          </tr></tbody></table>
          <table className="tr-rb pl"><thead><tr><th>NO</th><th>교육대상</th><th>교육과정명</th><th>교육시간</th><th>교육월</th><th>교육기관<br />(장소)</th><th>비 고</th></tr></thead>
            <tbody>
              {plans.map((p, i) => (
                <tr key={p.id}><td>{i + 1}</td><td>{p.data.target}</td><td className="l">{p.data.name}</td><td>{p.data.hours}</td>
                  <td>{+(p.day ?? "").slice(5, 7)}</td><td>{p.data.org}</td><td className="l">{(p.data.note ?? "").split("\n")[0]}</td></tr>
              ))}
              {Array.from({ length: Math.max(0, 14 - plans.length) }, (_, i) => <tr key={`e${i}`}><td>&nbsp;</td><td /><td /><td /><td /><td /><td /></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 과정별 묶기: 같은 교육명(띄어쓰기 무시)이면 한 줄
  type Line = { k: string; kind: string; name: string; target: string; org: string; plan: number[]; act: number[] };
  const lines = new Map<string, Line>();
  const get = (name: string, kind: string, target: string, org: string) => {
    const k = key(name);
    let l = lines.get(k);
    if (!l) { l = { k, kind: kind || "기타", name, target, org, plan: Array(12).fill(0), act: Array(12).fill(0) }; lines.set(k, l); }
    if (!l.target && target) l.target = target;
    if (!l.org && org) l.org = org;
    return l;
  };
  for (const p of plans) get(p.data.name ?? "", p.data.kind ?? "", p.data.target ?? "", p.data.org ?? "").plan[+p.day!.slice(5, 7) - 1] += +p.data.n || 1;
  for (const r of done) {
    const c = courseOf(r, base.employees);
    get(r.data.name ?? "", r.data.kind ?? "", "", r.data.by ?? "").act[+r.day!.slice(5, 7) - 1] += +r.data.n || c.done.length || 1;
  }
  const rows = [...lines.values()].sort((a, b) => (KIND_ORDER.indexOf(a.kind) + 99) % 99 - (KIND_ORDER.indexOf(b.kind) + 99) % 99 || a.name.localeCompare(b.name));
  const kinds: { kind: string; n: number }[] = [];
  for (const r of rows) { const g = kinds.at(-1); if (g && g.kind === r.kind) g.n++; else kinds.push({ kind: r.kind, n: 1 }); }
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const curM = y === +today.slice(0, 4) ? +today.slice(5, 7) : 0;
  const na = tv.noAccident.on;
  let idx = 0, prevKind = "";

  return (
    <div className="home">
      <PageHead href="/hr/training/plan" title="연간 교육 계획·실적표" mark={`${y}년`} emoji="🎓"
        desc={`연간 교육 계획(계획 인원)과 교육 실시 대장(실적 인원)을 월별로 맞춰 봅니다 · 담당자 ${user.name}`}>
        <Link className="pill" href={`?y=${y - 1}`}>← {y - 1}년</Link>
        <Link className="pill" href={`?y=${y + 1}`}>{y + 1}년 →</Link>
        <Link className="pill" href={`?y=${y}&view=doc`}>계획서 양식</Link>
        <Link className="pill" href="/hr/b/trainplan#form">+ 계획 추가</Link>
        <Link className="pill" href="/hr/b/trainplan">계획 대장 (목록·고치기)</Link>
        <PrintButton className="pill print" label="인쇄" />
      </PageHead>
      <div className="tr-planwrap">
        <section className="card tr-planmain">
          <div className="tbl-wrap">
            <table className="tr-pg">
              <thead>
                <tr><th rowSpan={2}>번호</th><th rowSpan={2}>교육구분</th><th rowSpan={2}>교육명</th><th rowSpan={2}>교육<br />대상자</th><th rowSpan={2}>구분</th><th colSpan={12}>{y}년</th><th rowSpan={2}>이수율</th><th rowSpan={2}>비고</th></tr>
                <tr>{Array.from({ length: 12 }, (_, i) => <th key={i} className={i + 1 === curM ? "now" : ""}>{i + 1}월</th>)}</tr>
              </thead>
              <tbody>{rows.map((r) => {
                idx++;
                const firstOfKind = prevKind !== r.kind;
                prevKind = r.kind;
                const g = kinds.find((k) => k.kind === r.kind)!;
                const p = sum(r.plan), a = sum(r.act);
                const rate = p ? Math.round((Math.min(a, p) / p) * 100) : null;
                return [
                  <tr key={`${r.k}p`} className="pl">
                    <td rowSpan={2}>{idx}</td>
                    {firstOfKind && <td rowSpan={g.n * 2} className="kd">{r.kind}</td>}
                    <td rowSpan={2} className="nm">{r.name}</td><td rowSpan={2}>{r.target}</td><td className="gb">계획</td>
                    {r.plan.map((n, i) => <td key={i} className={n ? "on" : ""}>{n || ""}</td>)}
                    <td rowSpan={2} className={rate === null ? "" : rate >= 100 ? "ok" : "low"}>{rate === null ? "-" : `${rate}%`}</td>
                    <td rowSpan={2} className="org">{r.org}</td>
                  </tr>,
                  <tr key={`${r.k}a`} className="ac">
                    <td className="gb">실적</td>
                    {r.act.map((n, i) => <td key={i} className={n ? "on" : r.plan[i] && i + 1 < curM ? "miss" : ""}>{n || (r.plan[i] && i + 1 < curM ? "미실시" : "")}</td>)}
                  </tr>,
                ];
              })}</tbody>
            </table>
          </div>
          {!rows.length && <p className="muted">이 해의 계획·실시 기록이 없습니다.</p>}
          <p className="muted" style={{ fontSize: ".76rem", marginTop: 8 }}>숫자는 인원(명). 계획은 연간 교육 계획의 &apos;계획 인원&apos;, 실적은 교육 실시 대장의 참석 인원입니다. 같은 교육명(띄어쓰기 무시)끼리 한 줄로 묶습니다.</p>
        </section>

        <aside className="card tr-side">
          <div className="card-title">상황별 추가 교육</div>
          <ul className="tr-sit">
            <li><b>신규 채용 시</b><small>직무 배치 전 필수 · 8시간 이상 (일용·1주 이하 1시간, 1개월 이하 4시간)</small></li>
            <li><b>작업내용 변경 시</b><small>부서 이동·업무 변경 시 · 2시간 이상 (일용 1시간)</small></li>
            <li><b>특별교육</b><small>위험 작업(별표 5) 배치 시 · 16시간 이상</small></li>
          </ul>
          <div className="tr-sit2">
            <div><b>사무직·판매직</b><small>반기별 {na ? "3시간 (무재해 50%)" : "6시간 이상"}</small><small>연간 총 {na ? 6 : 12}시간</small></div>
            <div><b>현장직 등 그 밖</b><small>반기별 {na ? "6시간 (무재해 50%)" : "12시간 이상"}</small><small>연간 총 {na ? 12 : 24}시간</small></div>
            <div><b>관리감독자</b><small>연간 16시간 이상</small><small>감면 대상 아님</small></div>
          </div>
          <p className="muted" style={{ fontSize: ".72rem", margin: "8px 0 0" }}>산업안전보건법 시행규칙 별표 4{na ? ` · 제27조① 무재해 감면 적용 (${tv.noAccident.prevYear}년 산재 0건)` : ""}</p>
        </aside>
      </div>
    </div>
  );
}
