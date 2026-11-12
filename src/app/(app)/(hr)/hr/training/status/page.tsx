/** 법정의무교육 수강현황 (관리자): 기간(반기) 안 교육 과정별 대상·수료·미수료·수료율 + 개인별 수료 여부·수료증 제출 — A4 인쇄 양식 */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import { courseStatus } from "@/lib/인사노무/training";
import { dayLabel, todayKst } from "@/lib/time";

export const metadata = { title: "교육 수강현황 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const dot = (s: string) => s.replaceAll("-", ".");

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const today = todayKst();
  const y = Number(one(sp.y)) || +today.slice(0, 4);
  const h = one(sp.h) || (today.slice(5) <= "06-30" && y === +today.slice(0, 4) ? "1" : "2");
  const from = one(sp.from) || (h === "1" ? `${y}-01-01` : h === "y" ? `${y}-01-01` : `${y}-07-01`);
  const to = one(sp.to) || (h === "1" ? `${y}-06-30` : `${y}-12-31`);
  const v = await courseStatus(from, to);
  const period = h === "1" ? "상반기" : h === "y" ? "연간" : "하반기";
  const lo = v.courses.map((c) => c.row.day!).sort()[0], hi = v.courses.map((c) => c.row.data.until || c.row.day!).sort().at(-1);
  const sum = v.courses.reduce((a, c) => ({ t: a.t + c.target.length, d: a.d + c.done.length }), { t: 0, d: 0 });
  const pct = (d: number, t: number) => (t ? `${((d / t) * 100).toFixed(1)}%` : "-");
  // 부서별 묶음 (명부 순서)
  const groups: { dept: string; rows: typeof v.people }[] = [];
  for (const p of v.people) {
    const dept = p.emp.dept || "(부서 없음)";
    const g = groups.find((x) => x.dept === dept);
    if (g) g.rows.push(p); else groups.push({ dept, rows: [p] });
  }
  const certN = v.people.filter((p) => p.cert).length;
  let no = 0;

  return (
    <div className="home">
      <div className="noprint">
        <PageHead href="/hr/training/status" title="교육 수강현황" mark={`${y}년 ${period}`} emoji="🎓"
          desc="교육 실시 대장의 수강 대상자·수료자·수료증 제출자로 과정별·개인별 현황을 만듭니다 (기록 화면에서 '수강 관리'를 켜고 입력)">
          <Link className="pill" href={`?y=${y}&h=1`}>상반기</Link>
          <Link className="pill" href={`?y=${y}&h=2`}>하반기</Link>
          <Link className="pill" href={`?y=${y}&h=y`}>연간</Link>
          <Link className="pill" href={`?y=${y - 1}&h=${h}`}>← {y - 1}년</Link>
          <PrintButton className="pill print" label="인쇄 / PDF" />
        </PageHead>
      </div>

      <div className="tr-paper st">
        <h1 className="tr-st-h">{y}년 {period} 법정의무교육 수강현황</h1>
        <p className="tr-st-sub">교육기간: {lo ? `${dot(lo)} ~ ${dot(hi!)}` : "-"} &nbsp;|&nbsp; 기준일: {dayLabel(today, true)}</p>
        <h3 className="tr-st-t">1. 과정별 수료 현황 요약</h3>
        <table className="tr-sx"><thead><tr><th style={{ width: 40 }}>No</th><th>과정명</th><th>대상</th><th>수료</th><th>미수료</th><th>수료율</th></tr></thead>
          <tbody>
            {v.courses.map((c, i) => (
              <tr key={c.row.id}><td>{i + 1}</td>
                <td className="l"><Link href={`/hr/training/sheet?id=${c.row.id}`}>{c.row.data.name}</Link>{c.row.data.hours ? ` (${c.row.data.hours}H)` : ""}</td>
                <td>{c.target.length}</td><td>{c.done.length}</td><td className={c.target.length - c.done.length ? "bad" : ""}>{c.target.length - c.done.length}</td><td>{pct(c.done.length, c.target.length)}</td></tr>
            ))}
            {!v.courses.length && <tr><td colSpan={6}>이 기간에 기록된 교육이 없습니다.</td></tr>}
            <tr className="sum"><td colSpan={2}>합 계</td><td>{sum.t}</td><td>{sum.d}</td><td className={sum.t - sum.d ? "bad" : ""}>{sum.t - sum.d}</td><td>{pct(sum.d, sum.t)}</td></tr>
          </tbody>
        </table>

        <h3 className="tr-st-t">2. 개인별 수료 현황</h3>
        <div className="tbl-wrap">
          <table className="tr-sx p">
            <thead>
              <tr><th rowSpan={2}>구분</th><th rowSpan={2}>부서</th><th rowSpan={2}>성명</th><th colSpan={Math.max(1, v.courses.length)}>수료 여부</th><th rowSpan={2}>수료증<br />제출여부</th></tr>
              <tr>{v.courses.map((c) => <th key={c.row.id} className="cn">{c.row.data.name}</th>)}</tr>
            </thead>
            <tbody>{groups.flatMap((g) => g.rows.map((p, i) => (
              <tr key={p.emp.name}>
                <td>{++no}</td>
                {i === 0 && <td rowSpan={g.rows.length} className="dp">{g.dept}</td>}
                <td className="nm"><Link href={`/hr/training/card?name=${encodeURIComponent(p.emp.name)}`}>{p.emp.name}</Link></td>
                {p.marks.map((m, j) => <td key={j} className={m === "미수료" ? "bad" : m === "-" ? "na" : ""}>{m}</td>)}
                <td className="cf">{p.cert ? "O" : ""}</td>
              </tr>
            )))}</tbody>
          </table>
        </div>
        <p className="tr-st-foot">※ 수료증 제출자(O) {certN}명 (빈칸: 미제출) &nbsp; ※ 표기: 수료 / <b className="bad">미수료</b> / - (수강 대상 아님){hi && hi >= today ? ` ※ 교육기간 중(~${+hi.slice(5, 7)}.${+hi.slice(8)}) 수강 완료 시 수료 처리` : ""}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="tr-st-logo"><img src="/logo.png" alt="회사 로고" /></div>
      </div>
    </div>
  );
}
