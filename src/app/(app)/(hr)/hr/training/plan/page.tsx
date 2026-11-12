/** 연간 교육 계획 (관리자) — A안 간트 타임라인 + B안 월별 그래프·보드 + C안 구분별 진척을 한 화면에 (2026-11-12)
 *  ?view=doc 이면 교육/훈련 계획서(결재란 · 팀명 · 작성일자 · 작성자 · NO·교육대상·교육과정명·교육시간·교육월·교육기관(장소)·비고) 인쇄 양식 */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import PrintButton from "@/components/PrintButton";
import DocHead, { SdH } from "@/components/인사노무/DocHead";
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
          <PageHead href="/hr/training/plan" title="교육/훈련 계획서" mark={`${y}년`} emoji="🎓" desc="연간 교육 계획 대장으로 계획서를 만듭니다. 팀명·작성일자는 아래에서 바꿔 인쇄하세요.">
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
        <div className="doc-page sd-doc">
          <DocHead eyebrow="3-7 교육훈련 · 교육·훈련 계획서" title={`${y}년 교육·훈련 계획서`} appr
            chips={[team, `작성 ${wrote.replaceAll("-", ".")} · ${user.name}`, `${plans.length}개 과정`, `예산 ${plans.reduce((s, p) => s + (+p.data.budget || 0), 0).toLocaleString()}원`]} />
          <SdH>교육 과정</SdH>
          <table className="doc-tbl full sd-tbl">
            <thead><tr><th style={{ width: 40 }}>No</th><th>교육월</th><th>구분</th><th className="l">교육과정명</th><th>교육대상</th><th>교육시간</th><th>교육기관·장소</th><th className="l">비고</th></tr></thead>
            <tbody>
              {plans.map((p, i) => (
                <tr key={p.id}><td>{i + 1}</td><td className="b">{+(p.day ?? "").slice(5, 7)}월</td><td>{p.data.kind}</td><td className="l b">{p.data.name}</td>
                  <td>{p.data.target}</td><td>{p.data.hours}</td><td>{p.data.org}</td><td className="l">{(p.data.note ?? "").split("\n")[0]}</td></tr>
              ))}
              {!plans.length && <tr><td colSpan={8} className="muted">연간 교육 계획 대장에 {y}년 계획이 없습니다.</td></tr>}
            </tbody>
          </table>
          <p className="sd-foot">통합관리시스템 · 연간 교육 계획 대장 기준</p>
        </div>
      </div>
    );
  }

  // 과정별 묶기: 같은 교육명(띄어쓰기 무시)이면 한 줄. 칸마다 계획(대장 고치기)·실시(결과 보고서)로 가는 주소를 같이 둔다
  type Line = { k: string; kind: string; name: string; target: string; org: string; plan: number[]; act: number[]; planHref: string[]; actHref: string[] };
  const lines = new Map<string, Line>();
  const get = (name: string, kind: string, target: string, org: string) => {
    const k = key(name);
    let l = lines.get(k);
    if (!l) { l = { k, kind: kind || "기타", name, target, org, plan: Array(12).fill(0), act: Array(12).fill(0), planHref: Array(12).fill(""), actHref: Array(12).fill("") }; lines.set(k, l); }
    if (!l.target && target) l.target = target;
    if (!l.org && org) l.org = org;
    return l;
  };
  for (const p of plans) {
    const l = get(p.data.name ?? "", p.data.kind ?? "", p.data.target ?? "", p.data.org ?? ""), m = +p.day!.slice(5, 7) - 1;
    l.plan[m] += +p.data.n || 1; l.planHref[m] ||= `/hr/b/trainplan?edit=${p.id}#form`;
  }
  for (const r of done) {
    const c = courseOf(r, base.employees), m = +r.day!.slice(5, 7) - 1;
    const l = get(r.data.name ?? "", r.data.kind ?? "", "", r.data.by ?? "");
    l.act[m] += +r.data.n || c.done.length || 1; l.actHref[m] ||= `/hr/training/sheet?id=${r.id}`;
  }
  const ord = (k: string) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? 99 : i; };
  const rows = [...lines.values()].sort((a, b) => ord(a.kind) - ord(b.kind) || a.name.localeCompare(b.name));
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const curM = y === +today.slice(0, 4) ? +today.slice(5, 7) : y < +today.slice(0, 4) ? 13 : 0; // 지난해면 모든 달이 지난 달
  const missed = (l: Line, i: number) => l.plan[i] > 0 && !l.act[i] && i + 1 < curM;
  const rate = (p: number, a: number) => (p ? Math.round((Math.min(a, p) / p) * 100) : null);

  // A: 요약 숫자
  const P = sum(rows.map((r) => sum(r.plan))), A = sum(rows.map((r) => Math.min(sum(r.act), sum(r.plan) || sum(r.act))));
  const doneCourses = rows.filter((r) => sum(r.plan) && sum(r.act) >= sum(r.plan)).length;
  const thisMonth = curM >= 1 && curM <= 12 ? rows.filter((r) => r.plan[curM - 1] && !r.act[curM - 1]) : [];
  const missN = rows.reduce((s, r) => s + r.plan.filter((_, i) => missed(r, i)).length, 0);
  // B: 월별 인원
  const mP = Array.from({ length: 12 }, (_, i) => sum(rows.map((r) => r.plan[i]))), mA = Array.from({ length: 12 }, (_, i) => sum(rows.map((r) => r.act[i])));
  const mMax = Math.max(1, ...mP, ...mA);
  // C: 구분별 진척
  const kinds = [...new Set(rows.map((r) => r.kind))].map((kind) => {
    const ls = rows.filter((r) => r.kind === kind);
    const p = sum(ls.map((r) => sum(r.plan))), a = sum(ls.map((r) => Math.min(sum(r.act), sum(r.plan) || sum(r.act))));
    return { kind, n: ls.length, p, a, pct: rate(p, a) ?? 100 };
  });
  const tone = (p: number) => (p >= 100 ? "#1f8a5b" : p >= 60 ? "#2a78d6" : "#d9730d");
  const na = tv.noAccident.on;

  return (
    <div className="home">
      <PageHead href="/hr/training/plan" title="연간 교육 계획" mark={`${y}년`} emoji="🎓"
        desc={`연간 교육 계획(계획 인원)과 교육 실시 기록(실시 인원)을 맞춰 봅니다 · 담당자 ${user.name}`}>
        <Link className="pill" href={`?y=${y - 1}`}>← {y - 1}년</Link>
        <Link className="pill" href={`?y=${y + 1}`}>{y + 1}년 →</Link>
        <Link className="pill" href="/hr/b/trainplan#form">+ 계획 추가</Link>
        <Link className="pill" href={`?y=${y}&view=doc`}>계획서 인쇄</Link>
        <Link className="pill" href="/hr/b/trainplan">계획 대장</Link>
      </PageHead>

      <section className="card hstats">
        <div className="tp-k"><span>계획 과정</span><b>{rows.filter((r) => sum(r.plan)).length}<small>개</small></b></div>
        <div className="tp-k"><span>실시 완료 과정</span><b className="ok">{doneCourses}<small>개</small></b></div>
        <div className="tp-k"><span>계획 대비 실시 인원</span><b>{A}<small>/ {P}명</small></b></div>
        <div className="tp-k"><span>이수율</span><b>{rate(P, A) ?? 0}<small>%</small></b></div>
        <div className="tp-k"><span>이번 달 예정</span><b className="plan">{thisMonth.length}<small>건</small></b></div>
        <div className="tp-k"><span>미실시 (지난 달)</span><b className={missN ? "bad" : ""}>{missN}<small>건</small></b></div>
      </section>

      <div className="tp-top home-row">
        <section className="card">
          <div className="card-title">월별 인원 <span className="muted" style={{ fontWeight: 400 }}>계획 / 실시</span><span className="spacer" />
            <span className="tp-lg p">계획</span><span className="tp-lg a">실시</span></div>
          <div className="tp-chart">
            {mP.map((p, i) => (
              <div key={i} className={`tp-col${i + 1 === curM ? " now" : ""}`} title={`${i + 1}월 계획 ${p}명 · 실시 ${mA[i]}명`}>
                <div className="tp-bars"><span className="p" style={{ height: `${(p / mMax) * 100}%` }} /><span className="a" style={{ height: `${(mA[i] / mMax) * 100}%` }} /></div>
                <b>{i + 1}월</b><small>{p || mA[i] ? `${mA[i]}/${p}` : "-"}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-title">구분별 진척</div>
          <div className="tp-rings">
            {kinds.map((k) => (
              <a key={k.kind} href={`#k-${k.kind}`} className="tp-ring">
                <span className="r" style={{ background: `conic-gradient(${tone(k.pct)} ${k.pct}%, #e6ebf3 0)` }}><i>{k.pct}%</i></span>
                <span><b>{k.kind}</b><small>{k.n}개 과정 · {k.a}/{k.p}명</small></span>
              </a>
            ))}
            {!kinds.length && <p className="muted">계획이 없습니다.</p>}
          </div>
        </section>
      </div>

      <section className="card home-row">
        <div className="card-title">과정별 타임라인 <span className="muted" style={{ fontWeight: 400 }}>칸을 누르면 계획(고치기) · 실시(결과 보고서)</span><span className="spacer" />
          <span className="tp-lg p">계획</span><span className="tp-lg a">실시</span><span className="tp-lg m">미실시</span></div>
        <div className="tbl-wrap">
          <table className="tp-g">
            <thead><tr><th className="l">교육명 · 대상</th>{Array.from({ length: 12 }, (_, i) => <th key={i} className={i + 1 === curM ? "now" : ""}>{i + 1}월</th>)}<th>진척</th><th className="l">기관</th></tr></thead>
            <tbody>
              {kinds.map((k) => [
                <tr key={`h${k.kind}`} id={`k-${k.kind}`} className="kh">
                  <td colSpan={15}><span className="r sm" style={{ background: `conic-gradient(${tone(k.pct)} ${k.pct}%, #e6ebf3 0)` }} /><b>{k.kind}</b><small>{k.n}개 과정 · 계획 {k.p}명 중 {k.a}명 실시 · {k.pct}%</small></td>
                </tr>,
                ...rows.filter((r) => r.kind === k.kind).map((r) => {
                  const p = sum(r.plan), a = sum(r.act), pc = rate(p, a);
                  return (
                    <tr key={r.k}>
                      <td className="l"><b>{r.name}</b>{r.target && <small>{r.target}</small>}</td>
                      {r.plan.map((pn, i) => {
                        const an = r.act[i], cls = an ? "a" : missed(r, i) ? "m" : pn ? "p" : "";
                        const href = an ? r.actHref[i] : pn ? r.planHref[i] : "";
                        return <td key={i} className={i + 1 === curM ? "now" : ""}>{cls ? <Link href={href} className={`tp-c ${cls}`} title={`${i + 1}월 계획 ${pn}명 · 실시 ${an}명`}>{an || pn}</Link> : null}</td>;
                      })}
                      <td className="pr"><div className="tp-pbar"><span style={{ width: `${pc ?? 100}%`, background: tone(pc ?? 100) }} /></div><b>{a}/{p || "-"}</b></td>
                      <td className="l org">{r.org}</td>
                    </tr>
                  );
                }),
              ])}
              {!rows.length && <tr><td colSpan={15} className="muted" style={{ padding: 16 }}>이 해의 계획·실시 기록이 없습니다. [+ 계획 추가]로 시작하세요.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card home-row">
        <div className="card-title">월별 보드 <span className="muted" style={{ fontWeight: 400 }}>달마다 할 교육 · 이번 달 강조</span></div>
        <div className="tp-board">
          {Array.from({ length: 12 }, (_, i) => {
            const items = rows.filter((r) => r.plan[i] || r.act[i]).map((r) => ({ r, st: r.act[i] ? "완료" : missed(r, i) ? "미실시" : "예정" }));
            const miss = items.filter((x) => x.st === "미실시").length;
            return (
              <div key={i} className={`tp-mon${i + 1 === curM ? " now" : ""}${i + 1 < curM ? " past" : ""}`}>
                <div className="tp-mh"><b>{i + 1}월</b><span className={miss ? "bad" : ""}>{items.length ? (miss ? `미실시 ${miss}` : `${items.length}건`) : "없음"}</span></div>
                {items.map(({ r, st }) => (
                  <Link key={r.k} href={st === "완료" ? r.actHref[i] : r.planHref[i]} className="tp-mi">
                    <em className={st === "완료" ? "a" : st === "미실시" ? "m" : "p"}>{st}</em><span>{r.name}</span><small>{r.act[i]}/{r.plan[i]}</small>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card home-row tp-law">
        <div className="card-title">상황별 추가 교육 · 법정 기준 <span className="muted" style={{ fontWeight: 400 }}>산업안전보건법 시행규칙 별표 4{na ? ` · 무재해 감면 적용 (${tv.noAccident.prevYear}년 산재 0건)` : ""}</span></div>
        <div className="tp-lawg">
          <div><b>신규 채용 시</b><small>직무 배치 전 · 8시간 이상 (일용 1시간)</small></div>
          <div><b>작업내용 변경 시</b><small>부서 이동·업무 변경 · 2시간 이상</small></div>
          <div><b>특별교육</b><small>위험 작업 배치 · 16시간 이상</small></div>
          <div><b>사무직·판매직 정기</b><small>반기 {na ? "3시간 (50% 감면)" : "6시간"} · 연 {na ? 6 : 12}시간</small></div>
          <div><b>현장직 등 정기</b><small>반기 {na ? "6시간 (50% 감면)" : "12시간"} · 연 {na ? 12 : 24}시간</small></div>
          <div><b>관리감독자</b><small>연 16시간 · 감면 대상 아님</small></div>
        </div>
      </section>
    </div>
  );
}