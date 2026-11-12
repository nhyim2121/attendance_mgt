/** 교육결과 보고서 (A4, 관리자) — 시스템 문서 디자인: 개요 · 교육 내용 · 참석자(서명·평가) · 평가·특기사항 */
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHead from "@/components/대시/PageHead";
import DocHead, { SdH } from "@/components/인사노무/DocHead";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import { loadRow } from "@/lib/대장/store";
import { loadBase } from "@/lib/인사노무/data";
import { courseOf, gradesOf } from "@/lib/인사노무/training";

export const metadata = { title: "교육결과 보고서 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const dot = (s?: string) => (s ? s.replaceAll("-", ".") : "");

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const r = await loadRow(Number(sp.id));
  if (!r || r.book !== "training") notFound();
  const { employees } = await loadBase();
  const d = r.data, day = r.day ?? "";
  const c = courseOf(r, employees);
  const gr = gradesOf(d.grades);
  const deptOf = new Map(employees.map((e) => [e.name, e.dept]));
  const extra = (d.who ?? "").split(/[,\n]+/).map((x) => x.trim()).filter((x) => x && !c.done.includes(x) && !/전\s*직원/.test(x));
  const list = [...c.done.map((n) => ({ dept: deptOf.get(n) ?? "", name: n })), ...extra.map((n) => ({ dept: "외부", name: n }))];
  const miss = c.target.filter((n) => !c.done.includes(n));
  const time = /시간 ([^·]+)/.exec(d.note ?? "")?.[1]?.trim() ?? "";
  const note = (d.note ?? "").replace(/^시간 [^·]+(· )?/, "").trim();
  const rowsN = Math.max(8, Math.ceil(list.length / 2));
  const pairs = Array.from({ length: rowsN }, (_, i) => [list[i], list[i + rowsN]] as const);
  const inHouse = d.kind === "사내";
  const gCount = (g: string) => Object.values(gr).filter((x) => x === g).length;
  const tone = d.effect === "효과 있음" ? "ok" : d.effect ? "warn" : null;

  return (
    <div className="home">
      <div className="noprint">
        <PageHead href="/hr/training/sheet" title="교육결과 보고서" emoji="🎓" desc={sp.saved ? "저장했습니다. 교육 실시 대장·연간 계획에 반영되었습니다." : "A4로 인쇄하거나 PDF로 저장하세요"}>
          <PrintButton className="pill print" label="인쇄 / PDF" />
          <Link className="pill" href={`/hr/training/record?id=${r.id}`}>고치기</Link>
          <Link className="pill" href={`/hr/b/training?edit=${r.id}#form`}>대장에서 보기·첨부</Link>
        </PageHead>
      </div>

      <div className="doc-page sd-doc">
        <DocHead eyebrow="3-7 교육훈련 · 교육결과 보고서" title={d.name} appr
          chips={[`${dot(day)}${d.until && d.until !== day ? ` ~ ${dot(d.until)}` : ""}`, d.hours && `${d.hours}시간`, d.kind, d.place,
            tone && [`효과성 ${d.effect}`, tone]]} />

        <SdH>교육 개요</SdH>
        <dl className="sd-info">
          <div><dt>교육일시</dt><dd>{dot(day)} {time}</dd></div>
          <div><dt>교육시간</dt><dd>{d.hours ? `${d.hours}시간` : "-"}</dd></div>
          <div><dt>장소·방법</dt><dd>{d.place || "-"}</dd></div>
          <div><dt>구분</dt><dd>{d.kind || "-"}</dd></div>
          <div><dt>교육기관</dt><dd>{inHouse ? "자체교육" : d.by || "-"}</dd></div>
          <div><dt>강사</dt><dd>{inHouse ? d.by || "-" : "-"}</dd></div>
          <div><dt>참석 인원</dt><dd>{list.length}명{c.target.length > c.done.length ? ` / 대상 ${c.target.length}명` : ""}</dd></div>
          <div><dt>비용</dt><dd>{d.cost ? `${(+d.cost).toLocaleString()}원` : "-"}</dd></div>
        </dl>

        <SdH>교육 내용</SdH>
        <div className="sd-box">{d.content || <span className="muted">(교육 내용을 적지 않았습니다)</span>}</div>

        <SdH>참석자 · 서명 · 평가 <small>평가: 우수 A · 양호 B · 미흡 C</small></SdH>
        <table className="doc-tbl full sd-tbl sign">
          <thead><tr><th>No</th><th>부서</th><th>성명</th><th>서명</th><th>평가</th><th className="gap" /><th>No</th><th>부서</th><th>성명</th><th>서명</th><th>평가</th></tr></thead>
          <tbody>{pairs.map(([a, b], i) => (
            <tr key={i}>
              <td>{a ? i + 1 : ""}</td><td>{a?.dept}</td><td className="b">{a?.name}</td><td /><td className={`g ${a ? gr[a.name] ?? "" : ""}`}>{a ? gr[a.name] ?? "" : ""}</td>
              <td className="gap" />
              <td>{b ? i + 1 + rowsN : ""}</td><td>{b?.dept}</td><td className="b">{b?.name}</td><td /><td className={`g ${b ? gr[b.name] ?? "" : ""}`}>{b ? gr[b.name] ?? "" : ""}</td>
            </tr>
          ))}</tbody>
        </table>

        <SdH>평가 · 특기사항</SdH>
        <dl className="sd-info two">
          <div><dt>효과성 평가</dt><dd>{d.effect || "-"}{d.effectHow ? ` · ${d.effectHow}` : ""}</dd></div>
          <div><dt>개인 평가</dt><dd>{Object.keys(gr).length ? `A ${gCount("A")} · B ${gCount("B")} · C ${gCount("C")}` : "-"}</dd></div>
          <div><dt>후속 조치</dt><dd>{d.follow || "-"}</dd></div>
          <div><dt>다음 교육</dt><dd>{dot(d.next) || "-"}</dd></div>
          {miss.length > 0 && <div className="full"><dt>미수료</dt><dd className="red">{miss.join(", ")}</dd></div>}
          <div className="full"><dt>특기사항</dt><dd>{note || "-"}</dd></div>
        </dl>
        <p className="sd-foot">통합관리시스템 · 교육 실시 대장 #{r.id} · 위와 같이 교육을 실시하였음을 보고합니다.</p>
      </div>
    </div>
  );
}
