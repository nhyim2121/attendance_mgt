/** 정비적격심사 현장심사: '관련 자격증 및 관련 학과 적용' 기술자 등급 표 + 요청서류 첨부 (2026-11-19, 품질팀 업무협조).
 *  자료 = 자격증·선임 관리 대장(licenses) + 직원 명부 근무 기간 + 사람별 이전 경력·학력(settings 'qual_people').
 *  기준 = 발전5사 정비적격기업 통합관리지침 부록-1 기술분야, 붙임3·4 요청서류. 계산은 lib/인사노무/qualGrade.ts */
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
import { CERT_DEFAULT, CERT_MORE, certIn, GRADES, QUAL_DOCS, SAFETY_CERTS, SAFETY_DEFAULT, ym } from "@/lib/인사노무/qualGrade";
import { loadFiles } from "@/lib/총무/mail";
import { isDateStr, todayKst } from "@/lib/time";
import { bulkInclude, saveQualCerts } from "./actions";
import QualDocForm, { QualCareerEditor, QualPersonForm } from "./QualDocForm";

export const metadata = { title: "정비적격심사 기술자 등급 · 통합관리시스템" };
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const dot = (d: string) => d.replaceAll("-", ".");

export default async function QualPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const day = isDateStr(sp.day) ? sp.day : todayKst();
  const [{ lines, people, settings, safety, allCerts }, files, qf] = await Promise.all([qualLines(day), loadFiles("lg:"), loadFiles("qual:doc:")]);
  const book = "/hr/b/licenses";
  const tech = people.filter((p) => lines.some((l) => l.emp === p.name));
  const count = GRADES.map((g) => ({ ...g, n: tech.filter((p) => p.grade === g.name).length }));
  const sum = tech.reduce((t, p) => t + p.point, 0);
  const groups = [...new Set(QUAL_DOCS.map((d) => `${d.area}|${d.group}`))];
  const certSel = settings.certs?.length ? settings.certs : CERT_DEFAULT;
  const certAll = [...new Set([...CERT_DEFAULT, ...CERT_MORE, ...certSel])];
  const unlisted = allCerts.filter((n) => !certIn(n, certAll));
  const safeSel = settings.safety?.length ? settings.safety : SAFETY_DEFAULT;
  const out = people.filter((p) => !p.tech);

  return (
    <>
      <PageHead href="/hr/qual" title="정비적격심사 기술자 등급" emoji="🧰"
        desc="현장심사 '관련 자격증 및 관련 학과 적용' 표와 요청서류. 자격증·선임 관리 대장과 직원 명부로 기준일 경력·등급을 계산합니다." />

      <div className="filters noprint">
        <Suspense><ParamDate name="day" value={day} label="기준일" /></Suspense>
        <Link className="btn" href={`${book}#form`}>+ 자격증 적기 (자격증·선임 관리)</Link>
        <span style={{ marginLeft: "auto" }} className="row">
          <a className="btn" href={`/api/qual?day=${day}`}>⬇ 엑셀로 내려받기</a>
          <PrintButton />
        </span>
      </div>

      <details className="card fold noprint" style={{ marginBottom: 16 }}>
        <summary className="card-title" style={{ cursor: "pointer" }}>관련 자격증 · 안전관리 자격 고르기 <span className="muted" style={{ fontWeight: 400 }}>등급에 쓸 자격 {certSel.length}개 · 안전 가점 자격 {safeSel.length}개</span></summary>
        <form action={saveQualCerts}>
          <b>관련 자격증</b> <small className="muted">체크한 이름으로 끝나는 국가기술자격만 기술자 등급에 씁니다 (예: 용접기능사 → 전기용접기능사도 해당). 기본값 = 회사 지원 자격증 표</small>
          <div className="qual-pick">{certAll.map((c) => <label key={c}><input type="checkbox" name="certs" value={c} defaultChecked={certSel.includes(c)} /> {c}</label>)}</div>
          {unlisted.length > 0 && <p className="caption" style={{ margin: "0 0 6px" }}>대장에 있지만 위 목록에 없는 자격: {unlisted.join(", ")} — 쓰려면 아래에 적으세요.</p>}
          <label className="field" style={{ maxWidth: 520 }}>더 넣을 자격 (쉼표로)<input name="extra" placeholder="예: 공조냉동기계기사, 전기기능장" /></label>
          <b style={{ display: "block", marginTop: 12 }}>안전관리분야 국가기술자격</b> <small className="muted">큐넷 직무분야 &lsquo;안전관리&rsquo;(안전관리·비파괴검사) + 지도사. 가점(+2점)은 기사·기술사·지도사만 체크해 두었습니다</small>
          {SAFETY_CERTS.map((g) => (
            <div key={g.group}><small className="muted">{g.group}</small>
              <div className="qual-pick">{g.items.map((c) => <label key={c}><input type="checkbox" name="safety" value={c} defaultChecked={safeSel.includes(c)} /> {c}</label>)}</div></div>
          ))}
          <button className="btn primary">저장</button>
        </form>
      </details>

      <form id="qual-bulk" action={bulkInclude} />
      <div className="card">
        <div className="card-title">2. 관련 자격증 및 관련 학과 적용<span className="spacer" />
          <span className="noprint row" style={{ gap: 6, fontWeight: 400 }}>
            <input type="hidden" name="op" value="out" form="qual-bulk" />
            <button className="btn sm danger" form="qual-bulk" title="체크한 직원을 기술인력에서 뺍니다 (아래 '빠진 직원'에서 되돌릴 수 있음)">선택한 직원 제외</button>
          </span><span className="muted" style={{ fontWeight: 400 }}>기준일: {dot(day)}</span></div>
        <div className="tbl-wrap"><table className="tbl qual-tbl">
          <thead><tr><th>성명</th><th>자격증</th><th>취득월일</th><th>자격취득후 근무경력</th><th>총 근무경력</th><th>기술자 등급</th><th className="noprint">근거</th><th className="noprint">자격증 사본</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const fl = l.id ? files.get(ledger.rowRef(l.id)) ?? [] : [];
              const showTotal = !l.cert || (l.best && l.byTotal); // 총 근무경력: 자격증 없는 실무 경력자, 또는 경력으로 등급이 정해진 사람
              return (
                <tr key={`${l.emp}${l.id ?? ""}`}>
                  <td>{l.first && <><input type="checkbox" name="names" value={l.emp} form="qual-bulk" className="noprint" aria-label={`${l.emp} 선택`} /> <b>{l.emp}</b> <small className="muted noprint">{l.dept}</small></>}</td>
                  <td>{l.id ? <Link href={`${book}?edit=${l.id}#form`} title="고치기">{l.cert}</Link> : <span className="muted">-</span>}</td>
                  <td>{l.cert ? (l.got ? dot(l.got) : <span className="red">취득일 없음</span>) : ""}</td>
                  <td>{l.cert ? ym(l.after) : ""}</td>
                  <td>{showTotal ? ym(l.total) : ""}</td>
                  <td>{l.best ? (l.grade ? <b>{l.grade}</b> : <span className="muted">해당 없음</span>) : <span className="muted" title="이 사람은 다른 줄의 등급으로 셉니다">({l.grade || "-"})</span>}</td>
                  <td className="noprint muted" style={{ fontSize: ".82rem" }}>{l.why}</td>
                  <td className="noprint">
                    {fl.map((a) => (
                      <span key={a.id} className="row" style={{ gap: 4 }}>
                        <a className="file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName} <small>{kb(a.size)}</small></a>
                        <DeleteFile id={a.id} name={a.fileName} />
                      </span>
                    ))}
                    {l.id && <AttachRow id={l.id} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <div className="metrics" style={{ marginTop: 12 }}>
          <div className="metric"><div className="l">기술인력</div><div className="v">{tech.length}명</div></div>
          {count.map((g) => <div key={g.name} className="metric"><div className="l">{g.name} ({g.point}점)</div><div className="v">{g.n}명</div></div>)}
          <div className="metric"><div className="l">등급 점수 합 (참고)</div><div className="v">{sum}점</div></div>
        </div>
        <p className="caption noprint">
          당사 경력은 직원 명부의 입사일(재입사 전 근무 포함)부터 기준일까지 자동으로 셉니다. 다른 회사의 관련 경력·학력은 아래 &lsquo;사람별 경력·학력&rsquo;에,
          자격증은 <Link href={book}>자격증·선임 관리</Link>에 적습니다. 한 사람이 자격증이 여럿이면 가장 높은 등급 하나로 셉니다.
          배점 산식(30점 만점 환산)은 지침에 따로 없어 합만 참고로 보여 줍니다.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">기술인력 입사 및 경력정보 <span className="muted" style={{ fontWeight: 400 }}>착안사항 1. 기술인력 — 1인당 평균 근무연수</span>
          <span className="spacer" /><a className="btn sm noprint" href={`/api/qual?day=${day}`}>⬇ 엑셀 (두 번째 시트)</a></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>연번</th><th>성명</th><th>부서</th><th>직급</th><th>담당 분야</th><th>입사일</th><th>4대보험 취득일</th><th>당사 근무</th><th>이전 관련 경력</th><th>총 근무경력</th><th>보유 자격증</th></tr></thead>
          <tbody>
            {tech.map((p, i) => {
              const diff = p.insured && p.join && p.insured !== p.join;
              return (
                <tr key={p.name}>
                  <td>{i + 1}</td><td><b>{p.name}</b></td><td>{p.dept}</td><td>{p.rank}</td><td>{p.role}</td>
                  <td>{p.join ? dot(p.join) : <span className="red">없음</span>}{p.prior.length > 0 && <><br /><small className="muted">재입사 · 이전 {p.prior.map(dot).join(", ")}</small></>}</td>
                  <td className={diff ? "orange" : undefined} title={diff ? "명부 입사일과 다릅니다" : undefined}>{p.insured ? dot(p.insured) : <span className="red">미입력</span>}</td>
                  <td>{ym(p.company)}</td><td>{p.prev ? ym(p.prev) : "-"}</td><td><b>{ym(p.total)}</b></td>
                  <td>{p.certNames.join(", ") || "-"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><th colSpan={7}>기술인력 {tech.length}명 · 1인당 평균</th>
            <th>{tech.length ? ym(Math.round(tech.reduce((t, p) => t + p.company, 0) / tech.length)) : "-"}</th><th />
            <th>{tech.length ? `${ym(Math.round(tech.reduce((t, p) => t + p.total, 0) / tech.length))} (${(tech.reduce((t, p) => t + p.total, 0) / tech.length / 12).toFixed(1)}년)` : "-"}</th><th /></tr></tfoot>
        </table></div>
        <p className="caption noprint">당사 근무 = 명부 입사일(재입사 전 근무 포함)~기준일. 이전 관련 경력은 유사 제조·정비회사 경력증명서로 확인되는 것만 &lsquo;사람별 경력·학력&rsquo;에 적으세요.
          4대보험 취득일이 주황색이면 명부 입사일과 다른 것입니다.</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">안전관리분야 국가기술자격자 <span className="muted" style={{ fontWeight: 400 }}>3. 설비/작업장/안전 › 4) 안전관리(현장정비) 가점 +2점 · 기사·기술사·지도사</span>
          <span className="spacer" /><b className={safety.length ? "green" : "red"}>{safety.length ? "가점 대상 +2점" : "보유자 없음"}</b></div>
        {safety.length ? (
          <table className="tbl"><thead><tr><th>성명</th><th>자격증</th><th>취득월일</th></tr></thead>
            <tbody>{safety.map((s) => <tr key={`${s.emp}${s.cert}`}><td><b>{s.emp}</b></td><td>{s.cert}</td><td>{s.got ? dot(s.got) : "-"}</td></tr>)}</tbody></table>
        ) : <p className="muted" style={{ margin: 0 }}>자격증·선임 관리 대장에 산업안전기사·건설안전기사·산업안전지도사 같은 자격이 적힌 재직자가 없습니다. 있으면 <Link href={`${book}#form`}>자격증 적기</Link>로 넣어 주세요. (산업기사는 해당 없음, 안전관리분야 최대 10점)</p>}
      </div>

      {out.length > 0 && (
        <div className="card noprint" style={{ marginTop: 16 }}>
          <form action={bulkInclude} className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="hidden" name="op" value="in" />
            <b>빠진 직원 {out.length}명</b>
            {out.map((p) => <label key={p.name} className="check"><input type="checkbox" name="names" value={p.name} /> {p.name} <small className="muted">{p.dept}{p.person.note ? ` · ${p.person.note}` : ""}</small></label>)}
            <button className="btn sm">선택한 직원 다시 넣기</button>
          </form>
        </div>
      )}

      <details className="card fold noprint" style={{ marginTop: 16 }}>
        <summary className="card-title" style={{ cursor: "pointer" }}>사람별 경력·학력 <span className="muted" style={{ fontWeight: 400 }}>이전 직장 관련 경력(경력증명서·경력수첩으로 확인되는 것), 관련 학과 졸업</span></summary>
        <p className="caption">기술인력 부서: {settings.depts.join(", ")} · 자격증이 있으면 부서와 관계없이 포함. 4대보험에 없는 사람(상시 근무 아님)은 &lsquo;제외&rsquo;로 두세요.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>성명</th><th>부서·직급</th><th>자격증</th><th>등급</th><th>다른 회사 근무 (4대보험 이력)</th><th>포함 · 이전 경력(직접) · 학력 · 졸업일 · 4대보험 · 분야 · 메모</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.name} className={lines.some((l) => l.emp === p.name) ? undefined : "muted"}>
                <td><b>{p.name}</b></td>
                <td>{p.dept} · {p.rank}</td>
                <td>{p.certs ? `${p.certs}개` : "-"}</td>
                <td>{p.grade || "-"}</td>
                <td><QualCareerEditor name={p.name} careers={p.person.careers ?? []} day={day} /></td>
                <td><QualPersonForm name={p.name} p={p.person} tech={settings.depts.includes(p.dept) || p.certs > 0} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </details>

      <div className="card noprint" style={{ marginTop: 16 }}>
        <div className="card-title">요청서류 <span className="muted" style={{ fontWeight: 400 }}>붙임3 품질분야 · 붙임4 기술분야 — 항목마다 + 📎로 올려 두세요</span></div>
        <div className="tbl-wrap"><table className="tbl qual-docs">
          <thead><tr><th>분야</th><th>평가요소</th><th>요청서류</th><th>비고</th><th>첨부</th></tr></thead>
          <tbody>
            {groups.flatMap((g) => {
              const items = QUAL_DOCS.filter((d) => `${d.area}|${d.group}` === g);
              return items.map((d, i) => {
                const fl = qf.get(`qual:doc:${d.key}`) ?? [];
                return (
                  <tr key={d.key}>
                    {i === 0 && <td rowSpan={items.length}><b>{d.area}</b><br /><small>{d.group}</small></td>}
                    <td>{d.item}</td>
                    <td><ul style={{ margin: 0, paddingLeft: 16 }}>{d.docs.map((x) => <li key={x}>{x}</li>)}</ul></td>
                    <td className="muted" style={{ fontSize: ".82rem" }}>{d.note}</td>
                    <td>
                      {fl.map((a) => (
                        <span key={a.id} className="row" style={{ gap: 4 }}>
                          <a className="file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName} <small>{kb(a.size)}</small></a>
                          <DeleteFile id={a.id} name={a.fileName} />
                        </span>
                      ))}
                      {fl.length === 0 && <span className="red" style={{ fontSize: ".8rem" }}>없음 </span>}
                      <QualDocForm docKey={d.key} />
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">기술자 등급 기준 <span className="muted" style={{ fontWeight: 400 }}>부록-1 기술분야 1. 기술인력</span></div>
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
        <p className="caption">인정대상: 4대 보험에 가입된 상시 근무 인원 · 기술인력은 조직표상 설계·제작·정비·기술관리·품질관리·전문연구 부서 인원 ·
          유사 제조·정비회사 근무경력은 확인 가능하면 근무연수로 인정 · 경력수첩은 자격증으로 인정 불가 · &lsquo;기능사 이상 관련 직무교육 이수자&rsquo;는 자동으로 따지지 않음</p>
      </div>
    </>
  );
}
