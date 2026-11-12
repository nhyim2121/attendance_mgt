/** 과정별 수강현황 (관리자): 기간(반기) 안 교육 과정별 대상·수료·미수료·수료율 + 개인별 수료 여부·수료증 — 시스템 문서 디자인 */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import DocHead, { SdH } from "@/components/인사노무/DocHead";
import TrainTabs from "@/components/인사노무/TrainTabs";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import { courseStatus } from "@/lib/인사노무/training";
import { dayLabel, todayKst } from "@/lib/time";

export const metadata = { title: "과정별 수강현황 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const dot = (s: string) => s.replaceAll("-", ".");

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const today = todayKst();
  const y = Number(one(sp.y)) || +today.slice(0, 4);
  const h = one(sp.h) || (today.slice(5) <= "06-30" && y === +today.slice(0, 4) ? "1" : "2");
  const from = h === "2" ? `${y}-07-01` : `${y}-01-01`;
  const to = h === "1" ? `${y}-06-30` : `${y}-12-31`;
  const v = await courseStatus(from, to);
  const period = h === "1" ? "상반기" : h === "y" ? "연간" : "하반기";
  const lo = v.courses.map((c) => c.row.day!).sort()[0], hi = v.courses.map((c) => c.row.data.until || c.row.day!).sort().at(-1);
  const sum = v.courses.reduce((a, c) => ({ t: a.t + c.target.length, d: a.d + c.done.length }), { t: 0, d: 0 });
  const pct = (d: number, t: number) => (t ? Math.round((d / t) * 1000) / 10 : 0);
  const groups: { dept: string; rows: typeof v.people }[] = [];
  for (const p of v.people) {
    const dept = p.emp.dept || "(부서 없음)";
    const g = groups.find((x) => x.dept === dept);
    if (g) g.rows.push(p); else groups.push({ dept, rows: [p] });
  }
  const certN = v.people.filter((p) => p.cert).length;
  const missN = v.people.filter((p) => p.marks.includes("미수료")).length;
  let no = 0;

  return (
    <div className="home">
      <div className="noprint">
        <PageHead href="/hr/training/status" title="이수·수강 현황" mark={`${y}년 ${period}`} emoji="🎓"
          desc="교육 기록에서 '수강 관리'로 넣은 대상자·수료자·수료증 제출자로 과정별·개인별 현황을 만듭니다">
          <Link className="pill" href={`?y=${y - 1}&h=${h}`}>← {y - 1}년</Link>
          <PrintButton className="pill print" label="인쇄 / PDF" />
        </PageHead>
        <TrainTabs on="status" />
        <div className="seg" style={{ marginBottom: 14, marginLeft: 10 }}>
          {([["1", "상반기"], ["2", "하반기"], ["y", "연간"]] as const).map(([k, l]) => <Link key={k} href={`?y=${y}&h=${k}`} className={h === k ? "on" : ""}>{l}</Link>)}
        </div>
      </div>

      <div className="doc-page sd-doc wide">
        <DocHead eyebrow="3-7 교육훈련 · 과정별 수강현황" title={`${y}년 ${period} 교육 수강현황`}
          chips={[lo ? `교육기간 ${dot(lo)} ~ ${dot(hi!)}` : "교육기간 -", `기준일 ${dayLabel(today, true)}`, [`수료율 ${pct(sum.d, sum.t)}%`, sum.d >= sum.t ? "ok" : "warn"], `수료증 제출 ${certN}명`]} />

        <SdH>과정별 수료 현황</SdH>
        <table className="doc-tbl full sd-tbl">
          <thead><tr><th style={{ width: 40 }}>No</th><th className="l">과정명</th><th>대상</th><th>수료</th><th>미수료</th><th style={{ width: 220 }}>수료율</th></tr></thead>
          <tbody>
            {v.courses.map((c, i) => {
              const p = pct(c.done.length, c.target.length);
              return (
                <tr key={c.row.id}><td>{i + 1}</td>
                  <td className="l b"><Link href={`/hr/training/sheet?id=${c.row.id}`}>{c.row.data.name}</Link>{c.row.data.hours ? <small> · {c.row.data.hours}시간</small> : null}</td>
                  <td>{c.target.length}</td><td>{c.done.length}</td><td className={c.target.length - c.done.length ? "red b" : ""}>{c.target.length - c.done.length}</td>
                  <td><div className="sd-bar"><span style={{ width: `${p}%` }} className={p >= 100 ? "ok" : p >= 80 ? "" : "warn"} /><b>{p}%</b></div></td></tr>
              );
            })}
            {!v.courses.length && <tr><td colSpan={6} className="muted">이 기간에 기록된 교육이 없습니다.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={2}>합계</td><td>{sum.t}</td><td>{sum.d}</td><td className={sum.t - sum.d ? "red" : ""}>{sum.t - sum.d}</td><td>{pct(sum.d, sum.t)}%</td></tr></tfoot>
        </table>

        <SdH>개인별 수료 현황 <small>미수료 {missN}명 · 이름을 누르면 교육이력카드</small></SdH>
        <div className="tbl-wrap">
          <table className="doc-tbl full sd-tbl">
            <thead><tr><th style={{ width: 40 }}>No</th><th>부서</th><th>성명</th>{v.courses.map((c) => <th key={c.row.id} className="cn">{c.row.data.name}</th>)}<th>수료증</th></tr></thead>
            <tbody>{groups.flatMap((g) => g.rows.map((p, i) => (
              <tr key={p.emp.name} className={i === 0 ? "grp" : ""}>
                <td>{++no}</td>
                {i === 0 && <td rowSpan={g.rows.length} className="dp">{g.dept}</td>}
                <td className="b"><Link href={`/hr/training/card?name=${encodeURIComponent(p.emp.name)}`}>{p.emp.name}</Link></td>
                {p.marks.map((m, j) => <td key={j}>{m === "-" ? <span className="muted">-</span> : <span className={`sd-pill ${m === "수료" ? "ok" : "bad"}`}>{m}</span>}</td>)}
                <td>{p.cert ? <span className="sd-pill ok">제출</span> : ""}</td>
              </tr>
            )))}</tbody>
          </table>
        </div>
        <p className="sd-foot">표기: 수료 / 미수료 / - (수강 대상 아님){hi && hi >= today ? ` · 교육기간 중(~${+hi.slice(5, 7)}.${+hi.slice(8)}) 수강을 마치면 수료로 바뀝니다` : ""} · 통합관리시스템</p>
      </div>
    </div>
  );
}
