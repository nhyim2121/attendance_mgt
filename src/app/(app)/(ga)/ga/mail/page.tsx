/** 총무 > 문서 수발 대장: 공문·우편·등기·팩스·택배를 받거나 보낼 때 한 줄씩 적고 스캔본을 붙인다. */
import Link from "next/link";
import { Suspense } from "react";
import { hrefWith } from "@/components/Filters";
import { ParamSelect } from "@/components/ParamControls";
import { Metric } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth";
import * as mail from "@/lib/총무/mail";
import { addDays, dayLabel, todayKst } from "@/lib/time";
import { AttachBtn, DeleteFile, DeleteMail, ImportForm, MailForm, type MailFormValue, StatusBtn, UndoImport } from "./forms";

export const metadata = { title: "문서 수발 대장 · 통합관리시스템" };
type Sp = Record<string, string | string[] | undefined>;

/** 대장 한 줄 → 입력칸 값 (copy면 새로 적기용: 번호·날짜·상태는 새로) */
function formValue(x: mail.Mail, today: string, copy = false): MailFormValue {
  return {
    ...(copy ? {} : { id: x.id, no: mail.mailNo(x) }), dir: x.dir, day: copy ? today : x.day, kind: x.kind, party: x.party,
    title: x.title, refNo: copy ? "" : x.refNo, route: x.route, status: copy ? "완료" : x.status, due: copy ? "" : x.due ?? "",
    note: copy ? "" : x.note, replyOf: copy || !x.replyOf ? "" : String(x.replyOf), cost: x.cost === null ? "" : String(x.cost),
  };
}
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
/** 우체국 등기번호(13자리)면 배송 조회 주소 */
const epost = (x: mail.Mail) => {
  const n = x.refNo.replace(/[\s-]/g, "");
  return (x.kind === "등기" || x.kind === "우편") && /^\d{13}$/.test(n)
    ? `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${n}` : "";
};

const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export default async function MailPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const today = todayKst();
  const f = mail.readFilter(sp, +today.slice(0, 4));
  const [all, years, parties, files, cands, batches] = await Promise.all([
    mail.loadMails(f.y), mail.mailYears(+today.slice(0, 4)), mail.knownParties(), mail.loadFiles("mail:"),
    mail.replyCandidates(), mail.importBatches(),
  ]);
  const rows = mail.filterMails(all, f);
  const editId = Number(sp.edit) || 0;
  const editing = editId ? await mail.loadMail(editId) : null;
  const copyId = Number(sp.copy) || 0;
  const copying = !editing && copyId ? await mail.loadMail(copyId) : null;
  const [nos, replies] = await Promise.all([
    mail.mailNos(all.flatMap((x) => (x.replyOf ? [x.replyOf] : []))),
    mail.repliesTo(all.filter((x) => x.dir === "수신").map((x) => x.id)),
  ]);
  const soon = (x: mail.Mail) => x.status === "처리 중" && !!x.due && x.due >= today && x.due <= addDays(today, 3);
  const costSum = all.reduce((t, x) => t + (x.dir === "발신" ? x.cost ?? 0 : 0), 0);
  const back = hrefWith(sp, "/ga/mail", { edit: null, copy: null });
  const late = (x: mail.Mail) => x.status === "처리 중" && !!x.due && x.due < today;
  const open = all.filter((x) => x.status === "처리 중");
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "edit" && k !== "copy") as [string, string][]).toString();

  return (
    <>
      <h1>문서 수발 대장</h1>
      <p className="caption">공문·우편·등기·팩스·택배를 받거나 보낼 때마다 한 줄씩 적습니다. 번호는 해마다 받은 것·보낸 것 따로 자동으로 매겨지고(예: {f.y}-수신-001), 스캔본을 붙여 두면 바로 열어 볼 수 있습니다.</p>

      <div className="card" id="form">
        <div className="card-title">{editing ? `${mail.mailNo(editing)} 고치기` : copying ? `${mail.mailNo(copying)} 처럼 새로 적기` : "새로 적기"}</div>
        <MailForm key={editing?.id ?? (copying ? `c${copying.id}` : "new")} parties={parties} back={back}
          replies={cands.filter((c) => c.id !== editing?.id).map((c) => ({ id: c.id, no: mail.mailNo(c), party: c.party, title: c.title, open: c.status === "처리 중" }))}
          v={editing ? formValue(editing, today) : copying ? formValue(copying, today, true)
            : { dir: "수신", day: today, kind: "공문", party: "", title: "", refNo: "", route: "", status: "완료", due: "", note: "", replyOf: "", cost: "" }} />
        {copying && <p className="caption" style={{ margin: "6px 0 0" }}>상대처·제목·종류를 그대로 가져왔습니다. 번호는 새로 매겨집니다. <Link href={back}>그만두기</Link></p>}
      </div>

      <div className="metrics" style={{ marginTop: 16 }}>
        <Metric label={`${f.y}년 받은 문서`} value={`${all.filter((x) => x.dir === "수신").length}건`} />
        <Metric label={`${f.y}년 보낸 문서`} value={`${all.filter((x) => x.dir === "발신").length}건`} />
        <Metric label="처리 중" value={<Link href={hrefWith(sp, "/ga/mail", { open: "1" })}>{open.length}건</Link>} />
        <Metric label="기한 지남 · 3일 안" value={<><span className={open.some(late) ? "red" : ""}>{open.filter(late).length}건</span>
          <span className="muted"> · </span><span className={open.some(soon) ? "orange" : ""}>{open.filter(soon).length}건</span></>} />
        <Metric label={`${f.y}년 발송 요금`} value={won(costSum)} />
      </div>

      <div className="filters">
        <Suspense><ParamSelect name="y" label="연도" value={String(f.y)} options={years.map((y) => [String(y), `${y}년`])} reset={["m"]} /></Suspense>
        <Suspense><ParamSelect name="m" label="월" value={f.m} options={[["", "전체"], ...Array.from({ length: 12 }, (_, i) => {
          const m = String(i + 1).padStart(2, "0"); return [m, `${i + 1}월`] as [string, string];
        })]} /></Suspense>
        <Suspense><ParamSelect name="dir" label="받음/보냄" value={f.dir} options={[["", "전체"], ["수신", "받음"], ["발신", "보냄"]]} /></Suspense>
        <Suspense><ParamSelect name="kind" label="종류" value={f.kind} options={[["", "전체"], ...mail.KINDS.map((k) => [k, k] as [string, string])]} /></Suspense>
        <form className="field" action="/ga/mail">
          찾기
          {Object.entries(sp).filter(([k, v]) => typeof v === "string" && !["q", "edit"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}
          <input type="search" name="q" defaultValue={f.q} placeholder="상대처·제목·번호" />
        </form>
        <label className="check">
          <Link href={hrefWith(sp, "/ga/mail", { open: f.open ? null : "1" })} scroll={false}>
            <input type="checkbox" readOnly checked={f.open} /> 처리 중만
          </Link>
        </label>
        <a className="btn" href={`/api/ga/mail-export${qs ? `?${qs}` : ""}`} style={{ marginLeft: "auto" }}>⬇ 엑셀로 내려받기</a>
      </div>

      <div className="card">
        <div className="tbl-wrap"><table className="tbl ga-mail">
          <thead><tr><th>번호</th><th>날짜</th><th>종류</th><th>보낸 곳·받는 곳</th><th>제목·내용</th><th>문서·등기번호</th><th>상태</th><th>첨부</th><th /></tr></thead>
          <tbody>
            {rows.map((x) => {
              const fl = files.get(mail.mailRef(x.id)) ?? [];
              const no = mail.mailNo(x);
              return (
                <tr key={x.id} className={editId === x.id ? "editing" : ""}>
                  <td className="no"><span className={`dir d-${x.dir}`}>{x.dir === "수신" ? "받음" : "보냄"}</span>{no}</td>
                  <td>{dayLabel(x.day)}</td>
                  <td><span className="tag kind">{x.kind}</span></td>
                  <td style={{ whiteSpace: "normal", minWidth: 120 }}>{x.party}</td>
                  <td style={{ whiteSpace: "normal", minWidth: 220 }}>
                    <b>{x.title}</b>
                    {x.replyOf && <div className="reply">↩ {nos.get(x.replyOf) ?? "지운 문서"} 에 대한 회신</div>}
                    {(replies.get(x.id) ?? []).map((r) => <div key={r.id} className="reply">↪ 회신함: {mail.mailNo(r)} ({dayLabel(r.day)})</div>)}
                    {x.route && <div className="muted">→ {x.route}</div>}
                    {x.note && <div className="muted">{x.note}</div>}
                  </td>
                  <td>{epost(x) ? <a href={epost(x)} target="_blank" rel="noreferrer" title="우체국 배송 조회">{x.refNo} 🔎</a> : x.refNo}
                    {x.cost !== null && <div className="muted" style={{ fontSize: ".78rem" }}>{won(x.cost)}</div>}</td>
                  <td>
                    <StatusBtn id={x.id} status={x.status} />
                    {x.due && <div className={late(x) ? "red" : soon(x) ? "orange" : "muted"} style={{ fontSize: ".78rem" }}>기한 {dayLabel(x.due)}{late(x) ? " 지남" : ""}</div>}
                  </td>
                  <td style={{ whiteSpace: "normal" }}>
                    {fl.map((a) => (
                      <div key={a.id} className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                        <a className="file" href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📎 {a.fileName} <small>{kb(a.size)}</small></a>
                        <DeleteFile id={a.id} name={a.fileName} />
                      </div>
                    ))}
                    <AttachBtn id={x.id} />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <Link className="btn sm" href={`${hrefWith(sp, "/ga/mail", { edit: String(x.id), copy: null })}#form`}>고치기</Link>
                      <Link className="btn sm" title="같은 상대처·제목으로 새로 적기" href={`${hrefWith(sp, "/ga/mail", { copy: String(x.id), edit: null })}#form`}>복사</Link>
                      <DeleteMail id={x.id} no={no} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        {!rows.length && <p className="muted">{all.length ? "조건에 맞는 문서가 없습니다." : `${f.y}년에 적은 문서가 아직 없습니다. 위에서 처음 한 줄을 적어 보세요.`}</p>}
        {rows.length > 0 && <p className="caption" style={{ marginBottom: 0 }}>{rows.length}건 · 상태 칸을 누르면 처리 중 ↔ 완료가 바뀝니다. 회신을 보낼 때 「회신하는 받은 문서」를 고르면 그 문서는 자동으로 완료됩니다. 등기번호 13자리를 적으면 🔎로 우체국 배송 조회가 열립니다.</p>}
      </div>

      <details className="fold" style={{ marginTop: 16 }}>
        <summary>예전 엑셀 대장 가져오기</summary>
        <div style={{ marginTop: 10 }}>
          <p className="caption">지금까지 엑셀로 쓰던 대장을 그대로 올리면 머리글(날짜·구분·발신처·수신처·제목·문서번호·비고 등)을 보고 칸을 맞춰 넣습니다. 번호는 날짜 순서대로 새로 매겨집니다.</p>
          <ImportForm />
          {batches.length > 0 && (
            <table className="tbl" style={{ marginTop: 12 }}><thead><tr><th>가져온 파일</th><th /></tr></thead>
              <tbody>{batches.map((b) => <tr key={b.batch}><td>{b.batch}</td><td><UndoImport batch={b.batch} n={b.n} /></td></tr>)}</tbody></table>
          )}
        </div>
      </details>
    </>
  );
}
