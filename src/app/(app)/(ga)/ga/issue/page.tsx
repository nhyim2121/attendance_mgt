/** 총무 > 증빙·법인서류 발급 대장: 사업자등록증명·등기부등본·납세증명서 등을 뗄 때마다 한 줄씩 적고 발급본을 붙인다. */
import Link from "next/link";
import { Suspense } from "react";
import { hrefWith } from "@/components/Filters";
import { ParamSelect } from "@/components/ParamControls";
import { Metric } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import * as issue from "@/lib/총무/issue";
import { loadFiles } from "@/lib/총무/mail";
import { dayLabel, daysBetween, todayKst } from "@/lib/time";
import { DeleteFile } from "../mail/forms";
import { AttachIssue, DeleteIssue, IssueForm, type IssueFormValue } from "./forms";

export const metadata = { title: "증빙·법인서류 발급 대장 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;
const one = (v: Sp[string]) => (typeof v === "string" ? v : "");
const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
/** 많이 쓴 순서로 중복 없이 */
const known = (xs: string[]) => {
  const n = new Map<string, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([x]) => x);
};

function formValue(x: issue.Issue, today: string, copy = false): IssueFormValue {
  return {
    ...(copy ? {} : { id: x.id }), day: copy ? today : x.day, docType: x.docType, copies: String(x.copies), via: x.via,
    purpose: x.purpose, submitTo: x.submitTo, requester: x.requester, fee: x.fee === null ? "" : String(x.fee), note: copy ? "" : x.note,
  };
}

export default async function IssuePage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const today = todayKst();
  const [all, files] = await Promise.all([issue.loadIssues(), loadFiles("issue:")]);
  const years = [...new Set([today.slice(0, 4), ...all.map((x) => x.day.slice(0, 4))])].sort().reverse();
  const y = years.includes(one(sp.y)) ? one(sp.y) : "";
  const doc = one(sp.doc), q = one(sp.q).trim().toLowerCase();
  const rows = all.filter((x) => (!y || x.day.startsWith(y)) && (!doc || x.docType === doc)
    && (!q || [x.docType, x.via, x.purpose, x.submitTo, x.requester, x.note].some((s) => s.toLowerCase().includes(q))));
  const editId = Number(sp.edit) || 0, copyId = Number(sp.copy) || 0;
  const editing = editId ? all.find((x) => x.id === editId) ?? null : null;
  const copying = !editing && copyId ? all.find((x) => x.id === copyId) ?? null : null;
  const back = hrefWith(sp, "/ga/issue", { edit: null, copy: null });

  // 서류별 가장 최근 발급 (등기부등본 '3개월 이내' 같은 조건 확인용)
  const latest = new Map<string, issue.Issue>();
  for (const x of all) if (!latest.has(x.docType)) latest.set(x.docType, x);
  const thisYear = all.filter((x) => x.day.startsWith(today.slice(0, 4)));
  const docTypes = known([...issue.DOC_TYPES.map(([d]) => d), ...all.map((x) => x.docType)]);

  return (
    <>
      <h1>증빙·법인서류 발급 대장</h1>
      <p className="caption">사업자등록증명·등기부등본·납세증명서 같은 서류를 뗄 때마다 한 줄씩 적고, 발급본(PDF)을 붙여 두면 다음에 같은 서류가 필요할 때 바로 찾아 쓸 수 있습니다.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">발급처 바로가기 <span className="muted" style={{ fontWeight: 400 }}>(새 창)</span></div>
        <div className="row" style={{ gap: 6 }}>
          {Object.entries(issue.VIAS).filter(([, u]) => u).map(([n, u]) => <a key={n} className="btn sm" href={u} target="_blank" rel="noreferrer">{n} ↗</a>)}
        </div>
      </div>

      <div className="card" id="form">
        <div className="card-title">{editing ? `${editing.docType} (${dayLabel(editing.day)}) 고치기` : copying ? `${copying.docType} 다시 떼기` : "새로 적기"}</div>
        <IssueForm key={editing?.id ?? (copying ? `c${copying.id}` : "new")} back={back}
          docTypes={issue.DOC_TYPES} vias={Object.keys(issue.VIAS)}
          known={{ purpose: known(all.map((x) => x.purpose)), submitTo: known(all.map((x) => x.submitTo)), requester: known(all.map((x) => x.requester)) }}
          v={editing ? formValue(editing, today) : copying ? formValue(copying, today, true)
            : { day: today, docType: "", copies: "1", via: "", purpose: "", submitTo: "", requester: "", fee: "", note: "" }} />
      </div>

      <div className="metrics" style={{ marginTop: 16 }}>
        <Metric label={`${today.slice(0, 4)}년 발급`} value={`${thisYear.length}건 · ${thisYear.reduce((t, x) => t + x.copies, 0)}부`} />
        <Metric label={`${today.slice(0, 4)}년 수수료`} value={won(thisYear.reduce((t, x) => t + (x.fee ?? 0), 0))} />
      </div>

      {latest.size > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">서류별 최근 발급 <span className="muted" style={{ fontWeight: 400 }}>· 제출처가 "3개월 이내 발급분"을 요구하면 여기서 확인하세요</span></div>
          <div className="row" style={{ gap: 8 }}>
            {[...latest.values()].map((x) => {
              const d = daysBetween(x.day, today);
              return (
                <Link key={x.docType} className={`chip${d > 90 ? " old" : ""}`} href={hrefWith(sp, "/ga/issue", { doc: x.docType })} title="이 서류만 보기">
                  {x.docType} <b>{dayLabel(x.day, true)}</b> <span className="muted">({d}일 전)</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="filters">
        <Suspense><ParamSelect name="y" label="연도" value={y} options={[["", "전체"], ...years.map((v) => [v, `${v}년`] as [string, string])]} /></Suspense>
        <Suspense><ParamSelect name="doc" label="서류" value={doc} options={[["", "전체"], ...docTypes.filter((d) => all.some((x) => x.docType === d)).map((d) => [d, d] as [string, string])]} /></Suspense>
        <form className="field" action="/ga/issue">
          찾기
          {Object.entries(sp).filter(([k, v]) => typeof v === "string" && !["q", "edit", "copy"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}
          <input type="search" name="q" defaultValue={one(sp.q)} placeholder="용도·제출처·요청한 사람" />
        </form>
      </div>

      <div className="card">
        <div className="tbl-wrap"><table className="tbl ga-mail">
          <thead><tr><th>발급일</th><th>서류</th><th>부수</th><th>발급처</th><th>용도</th><th>제출처</th><th>요청</th><th>수수료</th><th>발급본</th><th /></tr></thead>
          <tbody>
            {rows.map((x) => {
              const fl = files.get(issue.issueRef(x.id)) ?? [];
              return (
                <tr key={x.id} className={editId === x.id ? "editing" : ""}>
                  <td>{dayLabel(x.day, true)}</td>
                  <td style={{ whiteSpace: "normal", minWidth: 160 }}><b>{x.docType}</b>{x.note && <div className="muted">{x.note}</div>}</td>
                  <td style={{ textAlign: "center" }}>{x.copies}</td>
                  <td>{issue.VIAS[x.via] ? <a href={issue.VIAS[x.via]} target="_blank" rel="noreferrer">{x.via}</a> : x.via}</td>
                  <td style={{ whiteSpace: "normal" }}>{x.purpose}</td>
                  <td style={{ whiteSpace: "normal" }}>{x.submitTo}</td>
                  <td>{x.requester}</td>
                  <td style={{ textAlign: "right" }}>{x.fee !== null ? won(x.fee) : ""}</td>
                  <td style={{ whiteSpace: "normal" }}>
                    {fl.map((a) => (
                      <div key={a.id} className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                        <a className="file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName} <small>{kb(a.size)}</small></a>
                        <DeleteFile id={a.id} name={a.fileName} />
                      </div>
                    ))}
                    <AttachIssue id={x.id} />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <Link className="btn sm" href={`${hrefWith(sp, "/ga/issue", { edit: String(x.id), copy: null })}#form`}>고치기</Link>
                      <Link className="btn sm" title="같은 서류·제출처로 다시 적기" href={`${hrefWith(sp, "/ga/issue", { copy: String(x.id), edit: null })}#form`}>복사</Link>
                      <DeleteIssue id={x.id} label={`${dayLabel(x.day)} ${x.docType}`} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        {!rows.length && <p className="muted">{all.length ? "조건에 맞는 기록이 없습니다." : "아직 적은 발급 기록이 없습니다. 위에서 처음 한 줄을 적어 보세요."}</p>}
      </div>
    </>
  );
}
