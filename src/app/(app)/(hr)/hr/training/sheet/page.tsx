/** 교육결과 보고서 인쇄 (A4, 관리자) — 회사 양식(작성·검토·승인 / 교육명·실시일자·시간·장소·교육기관·강사 / 교육 내용 + 교육참가자·싸인·평가 / 특기사항).
 *  참가자가 한 장에 다 들어가지 않으면 다음 장에 참석자 서명부가 이어진다. */
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHead from "@/components/대시/PageHead";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import { loadRow } from "@/lib/대장/store";
import { loadBase } from "@/lib/인사노무/data";
import { courseOf, gradesOf } from "@/lib/인사노무/training";

export const metadata = { title: "교육결과 보고서 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const FIRST = 24; // 첫 장 오른쪽 참가자 칸 수

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const r = await loadRow(Number(sp.id));
  if (!r || r.book !== "training") notFound();
  const { employees } = await loadBase();
  const d = r.data, day = r.day ?? "";
  const c = courseOf(r, employees);
  const deptOf = new Map(employees.map((e) => [e.name, e.dept]));
  const extra = (d.who ?? "").split(/[,\n]+/).map((x) => x.trim()).filter((x) => x && !c.done.includes(x) && !/전\s*직원/.test(x));
  const list = [...c.done.map((n) => ({ dept: deptOf.get(n) ?? "", name: n })), ...extra.map((n) => ({ dept: "외부", name: n }))];
  const miss = c.target.filter((n) => !c.done.includes(n));
  const time = /시간 ([^·]+)/.exec(d.note ?? "")?.[1]?.trim() ?? "";
  const note = (d.note ?? "").replace(/^시간 [^·]+(· )?/, "").trim();
  const first = Array.from({ length: FIRST }, (_, i) => list[i] ?? null);
  const rest = list.slice(FIRST);
  const restRows = Math.max(12, Math.ceil(rest.length / 2));
  const pairs = Array.from({ length: restRows }, (_, i) => [rest[i], rest[i + restRows]] as const);
  const dot = (s: string) => s.replaceAll("-", ".");
  const gr = gradesOf(d.grades);

  return (
    <div className="home">
      <div className="noprint">
        <PageHead href="/hr/training/sheet" title="교육결과 보고서" emoji="🎓" desc={sp.saved ? "저장했습니다. 교육 실시 대장·연간 계획에 반영되었습니다." : "A4로 인쇄하거나 PDF로 저장하세요"}>
          <PrintButton className="pill print" label="인쇄 / PDF" />
          <Link className="pill" href={`/hr/training/record?id=${r.id}`}>고치기</Link>
          <Link className="pill" href={`/hr/b/training?edit=${r.id}#form`}>대장에서 보기·첨부</Link>
          <Link className="pill" href="/hr/g/edu">교육훈련 홈</Link>
        </PageHead>
      </div>

      <div className="tr-paper rep">
        <table className="tr-rh"><tbody>
          <tr>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <td rowSpan={3} className="logo"><img src="/logo.png" alt="회사 로고" /></td>
            <td rowSpan={3} className="ttl">교육결과 보고서</td>
            <th>작 성</th><th>검 토</th><th>승 인</th>
          </tr>
          <tr><td className="sg" /><td className="sg" /><td className="sg" /></tr>
          <tr><td className="dt">/ &nbsp; /</td><td className="dt">/ &nbsp; /</td><td className="dt">/ &nbsp; /</td></tr>
        </tbody></table>

        <table className="tr-rb"><colgroup><col style={{ width: "14%" }} /><col style={{ width: "23%" }} /><col style={{ width: "9%" }} /><col style={{ width: "13%" }} /><col style={{ width: "9%" }} /><col style={{ width: "18%" }} /><col style={{ width: "14%" }} /></colgroup>
          <tbody>
            <tr><th>교 육 명</th><td colSpan={6} className="big">{d.name}</td></tr>
            <tr><th>실 시 일 자</th><td>{dot(day)}{d.until && d.until !== day ? ` ~ ${dot(d.until)}` : ""}{time ? <><br /><small>{time}</small></> : null}</td>
              <th>시간</th><td>{d.hours ? `${d.hours}HR` : ""}</td><th>장 소</th><td colSpan={2}>{d.place}</td></tr>
            <tr><th>교 육 기 관</th><td colSpan={3}>{d.kind === "사내" ? "자체교육" : d.by}</td><th>강 사</th><td colSpan={2}>{d.kind === "사내" ? d.by : ""}</td></tr>
          </tbody>
        </table>

        <table className="tr-rc"><colgroup><col /><col style={{ width: "17%" }} /><col style={{ width: "7%" }} /></colgroup>
          <thead><tr><th>교 육 내 용</th><th>교육참가자 / 싸인</th><th>평가</th></tr></thead>
          <tbody>
            {first.map((p, i) => (
              <tr key={i}>
                {i === 0 && <td rowSpan={FIRST} className="body">{d.content}
                  {miss.length > 0 && <p className="miss">미수료(대상자 중): {miss.join(", ")}</p>}</td>}
                <td className="nm">{p?.name}</td><td className="gr">{p ? gr[p.name] ?? "" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="tr-rb"><tbody>
          <tr><th style={{ width: "14%" }}>특 기 사 항</th><td style={{ height: 40 }}>{[d.effect ? `효과성 평가: ${d.effect}${d.effectHow ? ` (${d.effectHow})` : ""}` : "", d.follow ? `후속 조치: ${d.follow}` : "", note, d.next ? `다음 교육 예정 ${dot(d.next)}` : "", rest.length ? `참가자 ${list.length}명 (다음 장 서명부에 이어짐)` : `참가자 ${list.length}명`].filter(Boolean).join(" · ")}</td></tr>
        </tbody></table>
        <p className="tr-eval">범례 : 우수 : A, &nbsp; 양호 : B, &nbsp; 미흡 : C</p>
      </div>

      {rest.length > 0 && (
        <div className="tr-paper rep brk">
          <h3 style={{ marginTop: 0 }}>참석자 서명부 (이어서) — {d.name}</h3>
          <table className="tr-doc c sign"><thead><tr><th>No</th><th>부서</th><th>성명</th><th>서명</th><th>평가</th><th>No</th><th>부서</th><th>성명</th><th>서명</th><th>평가</th></tr></thead>
            <tbody>{pairs.map(([a, b], i) => (
              <tr key={i}><td>{a ? FIRST + i + 1 : ""}</td><td>{a?.dept}</td><td>{a?.name}</td><td /><td>{a ? gr[a.name] ?? "" : ""}</td>
                <td>{b ? FIRST + i + 1 + restRows : ""}</td><td>{b?.dept}</td><td>{b?.name}</td><td /><td>{b ? gr[b.name] ?? "" : ""}</td></tr>
            ))}</tbody></table>
        </div>
      )}
    </div>
  );
}
