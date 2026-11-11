"use client";
/** 한 단계의 준비 서류: 체크 · 서류별 첨부(올리면 완료) · 서류 더하기 · 다음 단계로 넘기기 */
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { addGrantDoc, deleteGrantFile, removeGrantDoc, setGrantStage, toggleGrantDoc, uploadGrantDoc } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.heic,.tif,.tiff,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";
const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export interface DocView { name: string; extra: boolean; done: boolean; files: { id: number; fileName: string; size: number; createdAt: string }[] }

function Upload({ id, stage, doc }: { id: number; stage: string; doc: string }) {
  const router = useRouter();
  const [r, act, pending] = useActionState(async (p: Parameters<typeof uploadGrantDoc>[0], f: FormData) => {
    const out = await uploadGrantDoc(p, f);
    if (out?.ok) router.refresh();
    return out;
  }, null);
  return (
    <form action={act} className="gs-up">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="stage" value={stage} /><input type="hidden" name="doc" value={doc} />
      <label className={`btn sm${pending ? " busy" : ""}`}>
        {pending ? "올리는 중…" : "📎 첨부"}
        <input type="file" name="file" accept={ACCEPT} multiple hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {r?.error && <span className="red" style={{ fontSize: ".8rem" }}>{r.error}</span>}
    </form>
  );
}

export default function StagePanel({ id, stage, label, docs, current, next, isEnd }: {
  id: number; stage: string; label: string; docs: DocView[]; current: boolean;
  next?: { key: string; label: string }; isEnd: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [extra, setExtra] = useState("");
  const run = (fn: () => Promise<unknown>, to?: string) => start(async () => { await fn(); if (to) router.push(to); router.refresh(); });
  const done = docs.filter((d) => d.done).length;
  return (
    <div className={`gs-panel${pending ? " busy" : ""}`}>
      <div className="gs-head">
        <b>{label} · 준비 서류 {done}/{docs.length}</b>
        <span className="gs-bar"><i style={{ width: `${docs.length ? (done / docs.length) * 100 : 0}%` }} /></span>
      </div>
      <ul className="gs-docs">
        {docs.map((d) => (
          <li key={d.name} className={d.done ? "ok" : ""}>
            <label className="gs-check">
              <input type="checkbox" checked={d.done} disabled={pending} onChange={(e) => run(() => toggleGrantDoc(id, stage, d.name, e.target.checked))} />
              <span>{d.name}</span>
              {d.extra && <button type="button" className="gs-x" title="이 서류 항목 빼기 (첨부는 남음)" onClick={(e) => { e.preventDefault(); if (confirm(`「${d.name}」 항목을 뺄까요? 첨부 파일은 지우지 않습니다.`)) run(() => removeGrantDoc(id, stage, d.name)); }}>×</button>}
            </label>
            <div className="gs-files">
              {d.files.map((a) => (
                <span key={a.id} className="gs-file">
                  <a href={`/api/ga/file/${a.id}`} target="_blank" rel="noreferrer" title={a.createdAt.slice(0, 10)}>📄 {a.fileName}</a> <small>{kb(a.size)}</small>
                  <button type="button" className="gs-x" title="파일 지우기" onClick={() => { if (confirm(`「${a.fileName}」 파일을 지울까요?`)) run(() => deleteGrantFile(a.id)); }}>×</button>
                </span>
              ))}
              <Upload id={id} stage={stage} doc={d.name} />
            </div>
          </li>
        ))}
      </ul>
      <form className="gs-add" onSubmit={(e) => { e.preventDefault(); const v = extra; setExtra(""); run(() => addGrantDoc(id, stage, v)); }}>
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="이 사업에만 필요한 서류 더하기 (예: 에너지 진단 보고서)" />
        <button className="btn sm" disabled={!extra.trim() || pending}>+ 서류</button>
      </form>

      <div className="gs-move">
        {!current && !isEnd && <button className="btn" disabled={pending} onClick={() => run(() => setGrantStage(id, stage))}>이 단계로 바꾸기</button>}
        {current && next && (
          <button className="btn primary" disabled={pending}
            onClick={() => { if (done < docs.length && !confirm(`아직 준비 안 된 서류가 ${docs.length - done}개 있습니다. 그래도 「${next.label}」 단계로 넘길까요?`)) return; run(() => setGrantStage(id, next.key), `/ga/grants/item?id=${id}&tab=${next.key}`); }}>
            다음 단계로: {next.label} →
          </button>
        )}
        {current && !isEnd && stage !== "done" && (
          <span className="gs-ends">
            {(stage === "notice" || stage === "prep" || stage === "apply") && (
              <button className="btn" disabled={pending} onClick={() => { if (confirm("미선정으로 끝낼까요? (첨부는 그대로 남습니다)")) run(() => setGrantStage(id, "fail"), `/ga/grants/item?id=${id}&tab=fail`); }}>🙅 미선정</button>
            )}
            {(stage === "agree" || stage === "run" || stage === "report") && (
              <button className="btn" disabled={pending} onClick={() => { if (confirm("협약 해지로 끝낼까요? (첨부는 그대로 남습니다)")) run(() => setGrantStage(id, "cancel"), `/ga/grants/item?id=${id}&tab=cancel`); }}>✂️ 협약 해지</button>
            )}
          </span>
        )}
        <p className="caption" style={{ margin: "6px 0 0" }}>단계를 바꿔도 앞 단계에 첨부한 파일은 모두 그대로 남습니다. 위쪽 단계 탭을 눌러 언제든 다시 볼 수 있습니다.</p>
      </div>
    </div>
  );
}
