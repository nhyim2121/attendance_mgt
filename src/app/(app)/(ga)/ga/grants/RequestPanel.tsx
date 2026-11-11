"use client";
/** 자료 요청 목록: 요청(메일)마다 자료 표 · 추가/수정/삭제 · 첨부하면 ✅ · 사이트에서 만들 수 있는 자료는 [자료 만들기] · ZIP으로 한꺼번에 */
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  addReqItem, addRequest, deleteReqItem, deleteRequest, generateReqFile, renameReqItem, setReqItem, updateRequest, uploadReqFile,
} from "./requests";
import { deleteGrantFile } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.heic,.tif,.tiff,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";
const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export interface ReqItemView { name: string; note: string; na: boolean; done: boolean; gen: string | null; files: { id: number; fileName: string; size: number }[] }
export interface ReqView { id: string; title: string; from: string; due: string; left: number | null; items: ReqItemView[] }

function Upload({ id, rid, item }: { id: number; rid: string; item: string }) {
  const router = useRouter();
  const [r, act, pending] = useActionState(async (p: Parameters<typeof uploadReqFile>[0], f: FormData) => {
    const out = await uploadReqFile(p, f);
    if (out?.ok) router.refresh();
    return out;
  }, null);
  return (
    <form action={act} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="rid" value={rid} /><input type="hidden" name="item" value={item} />
      <label className={`btn sm${pending ? " busy" : ""}`} title="파일 첨부">
        {pending ? "…" : "📎 첨부"}
        <input type="file" name="file" accept={ACCEPT} multiple hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {r?.error && <span className="red" style={{ fontSize: ".78rem" }}> {r.error}</span>}
    </form>
  );
}

function Request({ id, rq }: { id: number; rq: ReqView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(false);
  const [add, setAdd] = useState("");
  const run = (fn: () => Promise<unknown>) => start(async () => {
    const r = await fn() as { ok?: string; error?: string } | void;
    setMsg(r && (r.error || r.ok) ? (r.error ?? r.ok ?? "") : "");
    router.refresh();
  });
  const ok = rq.items.filter((x) => x.files.length > 0 || x.done).length;
  const na = rq.items.filter((x) => x.na && !x.files.length).length;
  const nFiles = rq.items.reduce((t, x) => t + x.files.length, 0);
  return (
    <div className={`rq${pending ? " busy" : ""}`}>
      {editing ? (
        <form className="rq-new" onSubmit={(e) => {
          e.preventDefault(); const f = new FormData(e.currentTarget);
          run(() => updateRequest(id, rq.id, String(f.get("title")), String(f.get("from")), String(f.get("due")))); setEditing(false);
        }}>
          <input name="title" defaultValue={rq.title} placeholder="요청 제목" required />
          <input name="from" defaultValue={rq.from} placeholder="요청한 곳" />
          <input name="due" type="date" defaultValue={rq.due} />
          <span><button className="btn sm primary">저장</button> <button type="button" className="btn sm" onClick={() => setEditing(false)}>취소</button></span>
        </form>
      ) : (
        <div className="rq-head">
          <h4>📋 {rq.title}</h4>
          {rq.from && <span className="fd-sub">{rq.from}</span>}
          {rq.due && <span className={`fd-tag ${rq.left !== null && rq.left <= 2 ? "r" : "o"}`}>기한 {rq.due.slice(5).replace("-", "/")}{rq.left !== null ? ` (${rq.left < 0 ? `${-rq.left}일 지남` : rq.left === 0 ? "오늘" : `D-${rq.left}`})` : ""}</span>}
          <span className="rq-st ok">준비 {ok}/{rq.items.length - na}</span>
          {na > 0 && <span className="rq-st na">보유 안 함 {na}</span>}
          <span className="sp" />
          {nFiles > 0 && <a className="btn sm" href={`/api/ga/grant-zip?id=${id}&rq=${rq.id}`}>⬇ 첨부 모두 ZIP</a>}
          <button className="btn sm" onClick={() => setEditing(true)}>✏️ 고치기</button>
          <button className="btn sm danger" onClick={() => { if (confirm(`「${rq.title}」 요청과 첨부한 자료 ${nFiles}개를 지울까요?`)) run(() => deleteRequest(id, rq.id)); }}>삭제</button>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="rq-tbl">
          <thead><tr><th>#</th><th>자료</th><th>상태</th><th>첨부</th><th>메모</th><th /></tr></thead>
          <tbody>
            {rq.items.map((it, i) => {
              const has = it.files.length > 0 || it.done;
              const st = has ? "ok" : it.na ? "na" : "todo";
              return (
                <tr key={it.name} className={st}>
                  <td className="no">{i + 1}</td>
                  <td className="nm">{it.name}</td>
                  <td className="st"><span className={`rq-st ${st}`}>{st === "ok" ? "✅ 준비됨" : st === "na" ? "➖ 보유 안 함" : "⬜ 준비 중"}</span></td>
                  <td>
                    <div className="gs-files">
                      {it.files.map((a) => (
                        <span key={a.id} className="gs-file">
                          <a href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer">📄 {a.fileName}</a> <small>{kb(a.size)}</small>
                          <button type="button" className="gs-x" title="파일 지우기" onClick={() => { if (confirm(`「${a.fileName}」을(를) 지울까요?`)) run(() => deleteGrantFile(a.id)); }}>×</button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input className="rq-note" defaultValue={it.note} placeholder="메모" onBlur={(e) => { if (e.target.value !== it.note) run(() => setReqItem(id, rq.id, it.name, { note: e.target.value })); }} />
                  </td>
                  <td>
                    <span className="rq-acts">
                      <Upload id={id} rid={rq.id} item={it.name} />
                      {it.gen && <button className="btn sm rq-gen" title={`직원 명부로 '${it.gen}' 엑셀을 만들어 첨부`} onClick={() => run(() => generateReqFile(id, rq.id, it.name))}>⚙️ 자료 만들기</button>}
                      {!it.files.length && <button className="btn sm" title="직접 완료 표시 (파일 없이 회신하는 경우)" onClick={() => run(() => setReqItem(id, rq.id, it.name, { done: !it.done, na: false }))}>{it.done ? "완료 취소" : "✔ 완료"}</button>}
                      {!it.files.length && <button className="btn sm" onClick={() => run(() => setReqItem(id, rq.id, it.name, { na: !it.na, done: false }))}>{it.na ? "보유함" : "보유 안 함"}</button>}
                      <button className="btn sm" title="이름 고치기" onClick={() => { const v = prompt("자료 이름", it.name); if (v && v.trim() && v !== it.name) run(() => renameReqItem(id, rq.id, it.name, v)); }}>✏️</button>
                      <button className="btn sm" title="자료 빼기" onClick={() => { if (confirm(`「${it.name}」을(를) 목록에서 뺄까요?${it.files.length ? ` 첨부 ${it.files.length}개도 지워집니다.` : ""}`)) run(() => deleteReqItem(id, rq.id, it.name)); }}>×</button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form className="gs-add" onSubmit={(e) => { e.preventDefault(); const v = add; setAdd(""); run(() => addReqItem(id, rq.id, v)); }}>
        <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="자료 더하기 (예: 4대보험 가입자명부)" />
        <button className="btn sm" disabled={!add.trim() || pending}>+ 자료</button>
      </form>
      {msg && <p className="caption" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}

export default function RequestPanel({ id, reqs }: { id: number; reqs: ReqView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(reqs.length === 0);
  return (
    <div>
      {reqs.map((rq) => <Request key={rq.id} id={id} rq={rq} />)}
      <details className="u-fold" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>＋ 자료 요청 추가 (요청 메일의 자료 목록을 붙여 넣으면 표로 바뀝니다)</summary>
        <form className="rq-new" style={{ marginTop: 8 }} onSubmit={(e) => {
          e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget;
          start(async () => {
            await addRequest(id, String(f.get("title")), String(f.get("from")), String(f.get("due")), String(f.get("text")));
            form.reset(); setOpen(false); router.refresh();
          });
        }}>
          <input name="title" placeholder="제목 (예: 기초자료 요청)" required />
          <input name="from" placeholder="요청한 곳 (예: 푸른노무법인)" />
          <input name="due" type="date" title="회신 기한" />
          <button className="btn primary" disabled={pending}>{pending ? "만드는 중…" : "목록 만들기"}</button>
          <textarea name="text" required placeholder={"메일 본문에서 자료 목록 부분을 붙여 넣으세요.\n- 사업자등록증 사본\n- 법인등기부등본\n- 조직도 (부서/팀별 인원 포함)\n…"} />
        </form>
      </details>
    </div>
  );
}
