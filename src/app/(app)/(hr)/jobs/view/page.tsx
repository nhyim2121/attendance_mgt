/** 직무기술서 보기·인쇄 (A4 세로 양식). ?id= 한 장 · ?all=1 전체(한 직무 한 장) · ?blank=1 빈 양식 */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import { BASICS, blankJob, type JobDesc, NCS_SOURCE, shareSum } from "@/lib/인사노무/jobdesc";
import { loadJobs, loadUnits, peopleOf, type Unit, unitLabel } from "@/lib/인사노무/jobdescData";
import * as store from "@/lib/store";

export const metadata = { title: "직무기술서 · 인사노무 · 통합관리시스템" };

function Sheet({ j, units, company, blank }: { j: JobDesc; units: Unit[]; company: string; blank?: boolean }) {
  const L = ({ xs }: { xs: string[] }) => (xs.length ? <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul> : <div className="jd-empty" />);
  const tasks = blank ? Array.from({ length: 7 }, () => ({ name: "", detail: "", share: 0, cycle: "" })) : j.tasks;
  return (
    <div className="doc-page person jd-sheet">
      <h2 className="jd-h">직 무 기 술 서</h2>
      <table className="jd-t">
        <colgroup><col style={{ width: "15%" }} /><col style={{ width: "35%" }} /><col style={{ width: "15%" }} /><col style={{ width: "35%" }} /></colgroup>
        <tbody>
          <tr className="sec"><th colSpan={4}>1. 직무 확인</th></tr>
          <tr><th>직무명</th><td><b>{j.name}</b></td><th>소속</th><td>{unitLabel(j, units)}</td></tr>
          <tr><th>담당자</th><td colSpan={3}>{peopleOf(j, units).join(", ")}</td></tr>
          <tr><th>보고 대상</th><td>{j.reportTo}</td><th>대상 직급</th><td>{j.grade}</td></tr>
          <tr><th>NCS 분류</th><td colSpan={3} className="sm">{j.ncs}</td></tr>
          <tr><th>NCS 능력단위</th><td colSpan={3} className="sm">{j.ncsUnits.join(" · ")}</td></tr>
          <tr className="sec"><th colSpan={4}>2. 직무 개요</th></tr>
          <tr><th>직무 목적</th><td colSpan={3} className="tall">{j.purpose}</td></tr>
          <tr><th>책임과 권한</th><td colSpan={3} className="tall">{j.authority}</td></tr>
        </tbody>
      </table>
      <table className="jd-t">
        <colgroup><col style={{ width: "4%" }} /><col style={{ width: "22%" }} /><col /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} /></colgroup>
        <tbody>
          <tr className="sec"><th colSpan={5}>3. 주요 업무</th></tr>
          <tr className="hd"><th>#</th><th>업무</th><th>세부 내용</th><th>비중(%)</th><th>주기</th></tr>
          {tasks.map((x, i) => (
            <tr key={i}><td className="c">{i + 1}</td><td><b>{x.name}</b></td><td>{x.detail}</td><td className="c">{x.share || ""}</td><td className="c">{x.cycle}</td></tr>
          ))}
          <tr className="hd"><th colSpan={3}>합계</th><th>{blank ? "100" : shareSum(j)}</th><th /></tr>
        </tbody>
      </table>
      <table className="jd-t">
        <colgroup><col style={{ width: "15%" }} /><col /><col /><col /></colgroup>
        <tbody>
          <tr className="sec"><th colSpan={4}>4. 직무 요건 (필요 능력)</th></tr>
          <tr className="hd"><th /><th>필요 지식</th><th>필요 기술</th><th>직무수행태도</th></tr>
          <tr><th>능력</th><td><L xs={j.knowledge} /></td><td><L xs={j.skills} /></td><td><L xs={j.attitudes} /></td></tr>
          <tr><th>직업기초능력</th><td colSpan={3}><div className="jd-basics">{BASICS.map((b) => <span key={b}>{j.basics.includes(b) ? "■" : "□"} {b}</span>)}</div></td></tr>
          <tr className="sec"><th colSpan={4}>5. 자격 요건</th></tr>
          <tr><th>학력·전공</th><td>{j.edu}</td><th>경력</th><td>{j.career}</td></tr>
          <tr><th>자격·면허</th><td colSpan={3}>{j.licenses.join(" · ")}</td></tr>
          <tr className="sec"><th colSpan={4}>6. 근무 환경 · 성과 · 교육</th></tr>
          <tr><th>근무 환경</th><td colSpan={3}>{j.env}</td></tr>
          <tr><th>성과 지표</th><td colSpan={3}>{j.kpis.join(" · ")}</td></tr>
          <tr><th>필요 교육</th><td colSpan={3}>{j.training.join(" · ")}</td></tr>
        </tbody>
      </table>
      <div className="jd-foot">
        <span>작성·개정일 {j.updated || "20   .    .    ."}</span><span>작성자 {j.writer || "            "}</span>
        <span>확인 ____________ (서명)</span><b>{company}</b>
      </div>
      {!blank && <p className="jd-src">{NCS_SOURCE}. 업무·필요 지식·기술·태도·비중은 회사 업무(홈페이지 snco.co.kr 사업·공정 소개) 기준.</p>}
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; all?: string; blank?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const [{ jobs }, { units }, co] = await Promise.all([loadJobs(), loadUnits(), store.getSetting<{ name?: string }>("org_company", {})]);
  const company = co.name || "(주)에쓰엔";
  const blank = sp.blank === "1";
  const list = blank ? [{ ...blankJob(), tasks: [] }] : sp.all === "1" ? jobs : jobs.filter((j) => j.id === sp.id);
  const one = list.length === 1 && !blank ? list[0] : null;
  return (
    <>
      <div className="noprint">
        <PageHead href="/jobs" title={blank ? "직무기술서 빈 양식" : one ? "직무기술서" : "직무기술서 전체"} mark={one?.name}>
          <Link className="btn" href="/jobs">← 목록</Link>
          {one && <Link className="btn" href={`/jobs/edit?id=${one.id}`}>고치기</Link>}
          {!blank && <a className="btn" href={one ? `/api/hr/jobdesc?id=${one.id}` : "/api/hr/jobdesc"}>⬇ 엑셀</a>}
          <PrintButton />
        </PageHead>
        {!blank && list.length > 1 && <p className="caption">{list.length}개 직무 · 인쇄하면 한 직무에 한 장씩 나옵니다.</p>}
      </div>
      {list.length ? <div className="doc">{list.map((j) => <Sheet key={j.id} j={j} units={units} company={company} blank={blank} />)}</div>
        : <p>없는 직무기술서입니다. <Link href="/jobs">목록으로</Link></p>}
    </>
  );
}
