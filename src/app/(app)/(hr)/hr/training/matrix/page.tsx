/** 직원별 법정의무교육 이수 현황표 (관리자): 직원 × 법정교육 → 이수일 / 시간 부족 / 미이수 / 대상 아님 */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import PrintButton from "@/components/PrintButton";
import TrainTabs from "@/components/인사노무/TrainTabs";
import { requireAdminPage } from "@/lib/auth";
import { LEGAL, trainingView } from "@/lib/인사노무/training";

export const metadata = { title: "직원별 이수 현황표 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const year = Number(sp.y) || undefined;
  const v = await trainingView(year);
  const dept = typeof sp.dept === "string" ? sp.dept : "";
  const miss = sp.miss === "1";
  const depts = [...new Set(v.people.map((p) => p.emp.dept || "(부서 없음)"))];
  const rows = v.people.filter((p) => (!dept || (p.emp.dept || "(부서 없음)") === dept) && (!miss || p.done < p.need));
  const missN = v.people.filter((p) => p.done < p.need).length;
  const q = (o: Record<string, string>) => {
    const u = new URLSearchParams({ ...(year ? { y: String(year) } : {}), ...(dept ? { dept } : {}), ...(miss ? { miss: "1" } : {}), ...o });
    for (const [k, val] of [...u]) if (!val) u.delete(k);
    return `?${u}`;
  };

  return (
    <div className="home">
      <PageHead href="/hr/training/matrix" title="직원별 법정교육 이수 현황표" mark={`${v.year}년`} emoji="🎓"
        desc={`교육 실시 대장의 참석자를 직원 관리와 맞춰 자동으로 채웁니다${v.noAccident.on ? " · 무재해 감면으로 안전보건 정기교육 시간 50%" : ""}`}>
        <Link className="pill" href={q({ y: String(v.year - 1) })}>← {v.year - 1}년</Link>
        <Link className="pill" href={q({ miss: miss ? "" : "1" })}>{miss ? "모두 보기" : `미이수자만 (${missN})`}</Link>
        <a className="pill" href={`/api/hr/training-matrix${q({})}`}>엑셀</a>
        <PrintButton className="pill print" label="인쇄" />
      </PageHead>
      <TrainTabs on="matrix" />

      <div className="seg noprint" style={{ marginBottom: 14, marginLeft: 10 }}>
        <Link href={q({ dept: "" })} className={!dept ? "on" : ""}>전체 {v.people.length}</Link>
        {depts.map((d) => <Link key={d} href={q({ dept: d })} className={dept === d ? "on" : ""}>{d} {v.people.filter((p) => (p.emp.dept || "(부서 없음)") === d).length}</Link>)}
      </div>

      <section className="card">
        <div className="tbl-wrap">
          <table className="tbl tr-mx">
            <thead><tr><th>부서</th><th>성명</th><th>직책</th>{LEGAL.map((d) => <th key={d.key} title={d.law}>{d.short}</th>)}<th>이수율</th></tr></thead>
            <tbody>{rows.map((p) => {
              const rate = p.need ? Math.round((p.done / p.need) * 100) : 100;
              return (
                <tr key={p.emp.name}>
                  <td>{p.emp.dept}</td><td><Link href={`/hr/training/card?name=${encodeURIComponent(p.emp.name)}`}><b>{p.emp.name}</b></Link></td><td className="muted">{p.emp.position || p.emp.rank}</td>
                  {LEGAL.map((d) => {
                    const c = p.cells[d.key];
                    return <td key={d.key} className="c">{c.st === "no" || c.st === "part"
                      ? <Link href={`/hr/training/record?t=${d.key}&who=${encodeURIComponent(p.emp.name)}`} className={`tr-c ${c.st}`}>{c.text}</Link>
                      : <span className={`tr-c ${c.st}`}>{c.text}</span>}</td>;
                  })}
                  <td className="c"><b className={rate >= 100 ? "tr-ok" : rate >= 60 ? "orange" : "red"}>{rate}%</b></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {!rows.length && <p className="muted">해당하는 직원이 없습니다.</p>}
        <div className="tr-legend">
          <span><span className="tr-c ok">3/14</span> 이수한 날(마지막)</span>
          <span><span className="tr-c part">3/6h</span> 시간 부족</span>
          <span><span className="tr-c no">미이수</span> 누르면 그 사람으로 보충 교육 기록</span>
          <span><span className="tr-c na">—</span> 대상 아님</span>
        </div>
      </section>
    </div>
  );
}
