/** ISO 27001:2022 업무실적문서 — 양식 카드 보드 (관리자만). 카드를 누르면 그 양식으로 작성하는 화면. */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import { Metric } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import * as iso from "@/lib/인증/iso27k";
import { todayKst } from "@/lib/time";
import IsoTabs from "./Tabs";

export const metadata = { title: "ISO 27001 실적문서 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;

export default async function IsoBoard({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const year = /^\d{4}$/.test(String(sp.year)) ? String(sp.year) : todayKst().slice(0, 4);
  const [docs, ready] = await Promise.all([iso.listDocs(), iso.templateReady()]);
  const mine = docs.filter((d) => d.day.startsWith(year));
  const by = (k: string) => mine.filter((d) => d.form === k);
  const years = [...new Set([todayKst().slice(0, 4), ...docs.map((d) => d.day.slice(0, 4))])].sort().reverse();
  const done = iso.FORMS.filter((f) => by(f.key).length).length;
  const yearly = iso.FORMS.filter((f) => f.cycle === "매년" || f.cycle === "반기" || f.cycle === "매월");
  const missing = yearly.filter((f) => !by(f.key).length);

  return (
    <>
      <PageHead href="/cert/iso" mark={`${year}년`} desc={<>정보보호경영시스템 업무실적문서 양식 {iso.FORMS.length}종. 양식을 골라 화면에서 바로 적으면 자동 저장되고, 한글 파일(.hwpx)이나 PDF로 뽑을 수 있습니다.</>}>
        <span className="row" style={{ gap: 6 }}>
          {years.map((y) => <Link key={y} className={`btn sm${y === year ? " primary" : ""}`} href={`/cert/iso?year=${y}`}>{y}</Link>)}
        </span>
      </PageHead>
      <IsoTabs on="board" year={year} />
      {!ready && <div className="msg err">양식 파일이 없습니다: 데이터\iso27001\template.hwpx 에 ★ ISO-IEC27001-2022 업무실적문서.hwpx 를 넣어 주세요.</div>}

      <div className="metrics">
        <Metric label="양식" value={`${iso.FORMS.length}종`} />
        <Metric label={`${year}년 작성한 양식`} value={`${done}종`} />
        <Metric label={`${year}년 문서`} value={`${mine.length}건`} />
        <Metric label="매년·매월 쓰는데 아직" value={<span className={missing.length ? "orange" : ""}>{missing.length}종</span>} />
      </div>

      {iso.GROUPS.map((g) => {
        const fs = iso.FORMS.filter((f) => f.group === g);
        return (
          <section key={g} className="iso-group">
            <h2 className="iso-gh">{g} <small>{fs.length}종</small></h2>
            <div className="iso-cards">
              {fs.map((f) => {
                const ds = by(f.key);
                const need = (f.cycle === "매년" || f.cycle === "반기" || f.cycle === "매월") && !ds.length;
                return (
                  <Link key={f.key} href={`/cert/iso/doc?form=${f.key}`} className={`iso-card${need ? " need" : ""}`}>
                    <span className="iso-code">{f.code}{f.key.endsWith("b") ? " (2)" : ""}</span>
                    <b>{f.title}</b>
                    <span className="iso-sub">
                      <span className="tag">{f.cycle}</span>
                      {ds.length ? <span className="green">✓ {ds.length}건 · 최근 {ds[0].day.slice(5).replace("-", "/")}</span>
                        : need ? <span className="orange">올해 아직</span> : <span className="muted">-</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
