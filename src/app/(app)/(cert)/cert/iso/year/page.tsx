/** ISO 실적문서 연간 작성 현황: 양식 × 1~12월에 작성한 문서 수 (사후심사 전에 빈칸 찾기). 칸을 누르면 그 양식 화면. */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import * as iso from "@/lib/인증/iso27k";
import { todayKst } from "@/lib/time";
import IsoTabs from "../Tabs";

export const metadata = { title: "ISO 27001 연간 작성 현황 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default async function IsoYear({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const today = todayKst();
  const year = /^\d{4}$/.test(String(sp.year)) ? String(sp.year) : today.slice(0, 4);
  const [all, FORMS] = await Promise.all([iso.listDocs(), iso.allForms()]);
  const docs = all.filter((d) => d.day.startsWith(year));
  const nowM = year === today.slice(0, 4) ? +today.slice(5, 7) : year < today.slice(0, 4) ? 12 : 0;
  const cnt = (k: string, m: number) => docs.filter((d) => d.form === k && +d.day.slice(5, 7) === m).length;
  /** 써야 하는데 아직인 달: 매월 = 지난달까지 매달, 반기 = 6·12월, 매년 = 그해 아무 때나 (12월 칸에 표시) */
  const due = (f: iso.IsoForm, m: number) => {
    if (m > nowM) return false;
    if (f.cycle === "매월") return m < nowM && !cnt(f.key, m);
    if (f.cycle === "반기") return (m === 6 || m === 12) && m <= nowM && !docs.some((d) => d.form === f.key && (m === 6 ? +d.day.slice(5, 7) <= 6 : +d.day.slice(5, 7) > 6));
    if (f.cycle === "매년") return m === Math.max(1, nowM) && !docs.some((d) => d.form === f.key);
    return false;
  };

  return (
    <>
      <PageHead href="/cert/iso" title="연간 작성 현황" mark={`${year}년`} desc={<>양식마다 몇 월에 문서를 썼는지 봅니다. <b className="orange">주황 칸</b> = 써야 하는데 아직 (매월·반기·매년 양식).</>}>
        <Link className="btn sm" href={`/cert/iso/year?year=${+year - 1}`}>‹ {+year - 1}</Link>
        <Link className="btn sm" href={`/cert/iso/year?year=${+year + 1}`}>{+year + 1} ›</Link>
      </PageHead>
      <IsoTabs on="year" year={year} />
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl iso-year">
          <thead><tr><th style={{ textAlign: "left" }}>양식</th><th>주기</th>{MONTHS.map((m) => <th key={m}>{m}월</th>)}<th>합계</th></tr></thead>
          <tbody>
            {iso.GROUPS.filter((g) => FORMS.some((f) => f.group === g)).map((g) => [
              <tr key={g} className="iso-yg"><td colSpan={15}>{g}</td></tr>,
              ...FORMS.filter((f) => f.group === g).map((f) => {
                const total = docs.filter((d) => d.form === f.key).length;
                return (
                  <tr key={f.key}>
                    <td style={{ textAlign: "left" }}><Link href={`/cert/iso/doc?form=${f.key}`}><b>{f.title}</b></Link> <small className="muted">{f.code}</small></td>
                    <td><span className="tag">{f.cycle}</span></td>
                    {MONTHS.map((m) => {
                      const c = cnt(f.key, m);
                      return <td key={m}>{c ? <span className="iso-n">{c}</span> : due(f, m) ? <span className="iso-due" title="써야 하는데 아직" /> : <span className="iso-dot">·</span>}</td>;
                    })}
                    <td><b>{total || ""}</b></td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}
