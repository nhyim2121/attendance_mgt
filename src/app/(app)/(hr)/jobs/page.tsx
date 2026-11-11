/** 직무기술서 목록: 조직도와 이어 직무별 담당자 · 작성 안내(양식 항목) · 참고 사이트 · 인쇄/엑셀 */
import Link from "next/link";
import PageHead from "@/components/대시/PageHead";
import { requireAdminPage } from "@/lib/auth";
import { JD_GUIDE, JD_LINKS, shareSum } from "@/lib/인사노무/jobdesc";
import { groupByDept, loadJobs, loadUnits, peopleOf, teamText, unitLabel } from "@/lib/인사노무/jobdescData";
import JobRowActions, { RestoreExamples } from "./JobRowActions";

export const metadata = { title: "직무기술서 · 인사노무 · 통합관리시스템" };

export default async function JobsPage() {
  await requireAdminPage();
  const [{ jobs, saved }, { units, all }] = await Promise.all([loadJobs(), loadUnits()]);
  const covered = new Set(jobs.flatMap((j) => peopleOf(j, units)));
  const missing = all.filter((p) => !covered.has(p));
  const examples = jobs.filter((j) => j.example).length;
  let n = 0;

  return (
    <>
      <PageHead href="/jobs">
        <Link className="btn primary" href="/jobs/edit">＋ 새 직무기술서</Link>
        <Link className="btn" href="/jobs/view?all=1">🖨 전체 인쇄</Link>
        <a className="btn" href="/api/hr/jobdesc">⬇ 전체 엑셀</a>
        <Link className="btn" href="/jobs/view?blank=1">📄 빈 양식</Link>
      </PageHead>

      {(!saved || examples > 0) && (
        <div className="jd-note">
          💡 아래 {examples}개는 <b>우리 회사 조직도에 맞춰 만든 예시 초안</b>입니다 (<span className="jd-ex">예시</span> 표시).
          실제 업무에 맞게 <b>고치기</b>로 손보면 예시 표시가 사라집니다. 필요 없는 직무는 지우세요.
        </div>
      )}

      <div className="card">
        <div className="card-title">📑 직무기술서 {jobs.length}개 <span className="sp" />
          {missing.length > 0 ? <span className="fd-tag o" title={missing.join(", ")}>직무기술서 없는 사람 {missing.length}명</span>
            : <span className="fd-tag g">전 직원 연결됨</span>}
        </div>
        <div className="tbl-wrap">
          <table className="tbl jd-tbl">
            <thead><tr><th>#</th><th>소속</th><th>직무명</th><th>주 담당</th><th>보조 담당</th><th>직무 목적</th><th>업무</th><th>작성·개정</th><th /></tr></thead>
            <tbody>
              {groupByDept(jobs, units).map(([dept, js]) => [
                <tr key={`g-${dept}`} className="jd-grp"><td colSpan={9}>{dept} <small>{js.length}개</small></td></tr>,
                ...js.map((j, i) => {
                  const sum = shareSum(j), tt = teamText(j, units);
                  n++;
                  return (
                    <tr key={j.id}>
                      <td className="c">{n}</td>
                      <td>{unitLabel(j, units) || <span className="muted">—</span>}</td>
                      <td><Link href={`/jobs/view?id=${j.id}`}><b>{j.name}</b></Link>{j.example && <span className="jd-ex">예시</span>}</td>
                      <td className="jd-ppl"><b>{tt.main || <span className="muted">—</span>}</b></td>
                      <td className="jd-ppl">{tt.sub || <span className="muted">—</span>}</td>
                      <td className="jd-pur">{j.purpose}</td>
                      <td className="c">{j.tasks.length}개{sum !== 100 && <div className="red" style={{ fontSize: ".74rem" }}>비중 {sum}%</div>}</td>
                      <td className="c">{j.updated || "—"}{j.writer && <div className="muted" style={{ fontSize: ".74rem" }}>{j.writer}</div>}</td>
                      <td><JobRowActions id={j.id} name={j.name} first={i === 0} last={i === js.length - 1} /></td>
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        </div>
        {missing.length > 0 && <p className="caption" style={{ marginTop: 8 }}>직무기술서와 이어지지 않은 사람: {missing.join(", ")} — 직무기술서 <b>고치기</b>에서 주 담당이나 보조 담당으로 고르면 이어집니다.</p>}
        <RestoreExamples />
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">✍️ 작성 안내 (양식 항목)</div>
          <table className="tbl jd-guide">
            <tbody>{JD_GUIDE.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
          </table>
          <p className="caption" style={{ marginTop: 8 }}>
            직무분석(무슨 일을 하는지 조사) → <b>직무기술서</b>(일의 내용) → 직무명세서(사람의 자격). 이 양식은 두 문서를 한 장에 합친 꼴입니다.
            채용 공고, 인사평가, 교육 계획, 지원사업·인증 심사(일학습병행·병역지정·컨설팅) 제출에 그대로 씁니다. 1년에 한 번, 조직이 바뀔 때 고칩니다.
          </p>
        </div>
        <div className="card">
          <div className="card-title">🔗 참고 사이트 (양식·예시)</div>
          <ul className="jd-links">
            {JD_LINKS.map(([n, u, note]) => <li key={u}><a href={u} target="_blank" rel="noreferrer"><b>{n}</b></a><div className="muted">{note}</div></li>)}
          </ul>
          <p className="caption">NCS 사이트에서 직무를 찾아 <b>능력단위·필요지식·필요기술·직무수행태도</b>를 옮겨 적으면 공공기관 양식과 같은 수준이 됩니다.</p>
        </div>
      </div>
    </>
  );
}
