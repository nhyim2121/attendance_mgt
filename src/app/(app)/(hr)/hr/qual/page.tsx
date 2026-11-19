/** 정비적격심사 현장심사: '관련 자격증 및 관련 학과 적용' 기술자 등급 표 (2026-11-19, 품질팀 업무협조).
 *  자료 = 자격증·선임 관리 대장(licenses) + 직원 명부 근무 기간. 등급 기준은 lib/인사노무/qualGrade.ts */
import Link from "next/link";
import { Suspense } from "react";
import PageHead from "@/components/대시/PageHead";
import { ParamDate } from "@/components/ParamControls";
import PrintButton from "@/components/PrintButton";
import { AttachRow } from "@/components/대장/forms";
import { DeleteFile } from "@/app/(app)/(ga)/ga/mail/forms";
import { requireAdminPage } from "@/lib/auth";
import * as ledger from "@/lib/대장/store";
import { qualLines } from "@/lib/인사노무/qualData";
import { GRADES, ym } from "@/lib/인사노무/qualGrade";
import { loadFiles } from "@/lib/총무/mail";
import { isDateStr, todayKst } from "@/lib/time";
import QualDocForm from "./QualDocForm";

export const metadata = { title: "정비적격심사 기술자 등급 · 통합관리시스템" };
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const dot = (d: string) => d.replaceAll("-", ".");

export default async function QualPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const day = isDateStr(sp.day) ? sp.day : todayKst();
  const [lines, files, qf] = await Promise.all([qualLines(day), loadFiles("lg:"), loadFiles("qual:")]);
  const docs = qf.get("qual:docs") ?? [];
  const book = "/hr/b/licenses";
  const count = GRADES.map((g) => ({ ...g, n: new Set(lines.filter((l) => l.grade === g.name).map((l) => l.emp)).size }));

  return (
    <>
      <PageHead href="/hr/qual" title="정비적격심사 기술자 등급" emoji="🧰"
        desc="현장심사 '관련 자격증 및 관련 학과 적용' 표. 자격증·선임 관리 대장과 직원 명부로 기준일 경력·등급을 계산합니다." />

      <div className="filters noprint">
        <Suspense><ParamDate name="day" value={day} label="기준일" /></Suspense>
        <Link className="btn" href={`${book}#form`}>+ 자격증 적기 (자격증·선임 관리)</Link>
        <span style={{ marginLeft: "auto" }} className="row">
          <a className="btn" href={`/api/qual?day=${day}`}>⬇ 엑셀로 내려받기</a>
          <PrintButton />
        </span>
      </div>

      <div className="card">
        <div className="card-title">2. 관련 자격증 및 관련 학과 적용<span className="spacer" /><span className="muted" style={{ fontWeight: 400 }}>기준일: {dot(day)}</span></div>
        <div className="tbl-wrap"><table className="tbl qual-tbl">
          <thead><tr><th>성명</th><th>자격증</th><th>취득일</th><th>자격취득후 근무경력</th><th>총 근무경력</th><th>기술자 등급</th><th className="noprint">근거</th><th className="noprint">첨부</th></tr></thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
              자격증·선임 관리 대장에 적힌 자격증이 없습니다. <Link href={`${book}#form`}>자격증 적기</Link></td></tr>}
            {lines.map((l, i) => {
              const fl = files.get(ledger.rowRef(l.id)) ?? [];
              const first = i === 0 || lines[i - 1].emp !== l.emp;
              return (
                <tr key={l.id}>
                  <td>{first && <b>{l.emp}</b>}</td>
                  <td><Link href={`${book}?edit=${l.id}#form`} title="고치기 (이전 경력·학력은 '추가 항목')">{l.cert}</Link></td>
                  <td>{l.got ? dot(l.got) : <span className="red">취득일 없음</span>}</td>
                  <td>{ym(l.after)}</td>
                  <td>{ym(l.total)}{l.data.prev ? <small className="muted"> (이전 {ym(+l.data.prev)} 포함)</small> : null}</td>
                  <td>{l.grade ? <b>{l.grade} <small className="muted">{l.point}점</small></b> : <span className="muted">해당 없음</span>}</td>
                  <td className="noprint muted" style={{ fontSize: ".82rem" }}>{l.why}</td>
                  <td className="noprint">
                    {fl.map((a) => (
                      <span key={a.id} className="row" style={{ gap: 4 }}>
                        <a className="file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName} <small>{kb(a.size)}</small></a>
                        <DeleteFile id={a.id} name={a.fileName} />
                      </span>
                    ))}
                    <AttachRow id={l.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p className="caption noprint">
          당사 경력은 직원 명부의 입사일(재입사 전 근무 기간 포함)부터 기준일까지 자동으로 셉니다. 다른 회사 경력·학력은 자격증 이름을 눌러
          &lsquo;추가 항목&rsquo;의 <b>이전 직장 관련 경력</b>·<b>그중 자격취득 후</b>·<b>관련 학과 학력·졸업일</b>에 적으면 반영됩니다.
          심사에 넣지 않을 자격증은 &lsquo;정비적격심사: 제외&rsquo;로 두세요.
        </p>
        <div className="metrics">
          {count.map((g) => <div key={g.name} className="metric"><div className="l">{g.name} ({g.point}점)</div><div className="v">{g.n}명</div></div>)}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">기술자 등급 기준</div>
        <div className="tbl-wrap"><table className="tbl qual-rule">
          <thead><tr><th>구분</th><th>고급기술자</th><th>중급기술자</th><th>초급기술자</th></tr></thead>
          <tbody>
            <tr><th>배점 (인당)</th><td>7점</td><td>5점</td><td>3점</td></tr>
            <tr><th>자격 기준</th>
              <td>기술사, 기능장 실무자<br />기사 자격 후 5년 이상 실무자<br />산업기사 자격 후 8년 이상 실무자<br />기능사 자격 후 10년 이상 실무자</td>
              <td>기사 자격 후 2년 이상 실무자<br />산업기사 자격 후 3년 이상 실무자<br />기능사 자격 후 5년 이상 실무자<br />학사 후 2년 이상 실무자<br />전문학사 후 3년 이상 실무자<br />관련근무 5년 이상 실무자</td>
              <td>기능사, 산업기사 자격 이상 취득자<br />기능사 이상 관련 직무교육 이수자<br />학사, 전문학사 후 1년 이상 실무자<br />고졸 후 2년 이상 실무자<br />관련 근무경력 3년 이상 실무자</td></tr>
          </tbody>
        </table></div>
        <p className="caption">&lsquo;기능사 이상 관련 직무교육 이수자&rsquo;는 기록이 없어 자동으로 따지지 않습니다.</p>
      </div>

      <div className="card noprint" style={{ marginTop: 16 }}>
        <div className="card-title">심사 서류 묶음 <span className="muted" style={{ fontWeight: 400 }}>관리대장·자격증 사본·경력증명서 등</span><span className="spacer" /><QualDocForm /></div>
        {docs.length === 0 ? <p className="muted">아직 올린 서류가 없습니다. 사람별 자격증 사본은 위 표의 + 📎로, 공통 서류는 여기에 올리세요.</p> : (
          <ul className="stack" style={{ gap: 6, margin: 0, paddingLeft: 0, listStyle: "none" }}>
            {docs.map((a) => (
              <li key={a.id} className="row" style={{ gap: 6 }}>
                <a className="file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName} <small>{kb(a.size)}</small></a>
                <small className="muted">{a.createdAt.slice(0, 10)}</small>
                <DeleteFile id={a.id} name={a.fileName} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
