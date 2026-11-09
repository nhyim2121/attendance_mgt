"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import type { Field } from "@/lib/대장/books";
import { attachLedger, importLedgerFile, removeLedgerRow, saveLedger, undoLedgerImport } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.heic,.tif,.tiff,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";
const Msg = ({ r }: { r: { ok?: string; error?: string } | null }) => (r ? <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div> : null);

function Input({ f, v, lists }: { f: Field; v: string; lists: Record<string, string[]> }) {
  const name = `f_${f.k}`;
  switch (f.type) {
    case "textarea": return <textarea name={name} rows={2} defaultValue={v} placeholder={f.placeholder} />;
    case "date": return <input type="date" name={name} defaultValue={v} required={f.req} />;
    case "time": return <input type="time" name={name} defaultValue={v} />;
    case "number": return <input type="text" inputMode="decimal" name={name} defaultValue={v} placeholder={f.placeholder} />;
    case "money": return <input type="text" inputMode="numeric" name={name} defaultValue={v} placeholder="원" />;
    case "select": return (
      <select name={name} defaultValue={v}>
        <option value="">-</option>
        {(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
        {v && !f.options?.includes(v) && <option>{v}</option>}
      </select>
    );
    default: return <input type="text" name={name} defaultValue={v} required={f.req} placeholder={f.placeholder}
      list={f.type === "emp" ? "lg-emps" : f.type === "suggest" ? `lg-${f.k}` : lists[f.k]?.length ? `lg-${f.k}` : undefined} />;
  }
}

/** 대장 한 줄 적기·고치기 */
export function LedgerForm({ book, fields, v, id, back, emps, lists }: {
  book: string; fields: Field[]; v: Record<string, string>; id?: number; back: string; emps: string[]; lists: Record<string, string[]>;
}) {
  const [r, action, pending] = useActionState(saveLedger, null);
  return (
    <form action={action} className="stack" style={{ gap: 10 }} key={r?.ok ?? "form"}>
      <Msg r={r} />
      <input type="hidden" name="book" value={book} />
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="back" value={back} />
      <div className="lg-fields">
        {fields.map((f) => (
          <label key={f.k} className={`field${f.wide || f.type === "textarea" ? " wide" : ""}`}>
            {f.label}{f.req && <span className="red"> *</span>}
            <Input f={f} v={v[f.k] ?? ""} lists={lists} />
          </label>
        ))}
      </div>
      <div className="row end">
        <label className="field">첨부 <span className="muted">(사진·스캔본, 여러 개)</span><input type="file" name="file" accept={ACCEPT} multiple /></label>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : id ? "고치기" : "대장에 적기"}</button>
        {id && <Link className="btn" href={back}>취소</Link>}
      </div>
      <datalist id="lg-emps">{emps.map((e) => <option key={e} value={e} />)}</datalist>
      {Object.entries(lists).map(([k, xs]) => <datalist key={k} id={`lg-${k}`}>{xs.map((x) => <option key={x} value={x} />)}</datalist>)}
    </form>
  );
}

export function AttachRow({ id }: { id: number }) {
  const [r, action, pending] = useActionState(attachLedger, null);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <label className={`btn sm${pending ? " busy" : ""}`} title="첨부">
        {pending ? "…" : "+ 📎"}
        <input type="file" name="file" accept={ACCEPT} multiple hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {r?.error && <span className="red" style={{ fontSize: ".8rem" }}> {r.error}</span>}
    </form>
  );
}

export function DeleteRow({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn sm danger" disabled={pending} title="삭제" onClick={() => {
      if (!confirm(`「${name}」을(를) 지울까요? 첨부도 같이 지워집니다.`)) return;
      start(async () => { await removeLedgerRow(id); router.refresh(); });
    }}>×</button>
  );
}

export function ImportForm({ book }: { book: string }) {
  const [r, action, pending] = useActionState(importLedgerFile, null);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <Msg r={r} />
      <input type="hidden" name="book" value={book} />
      <div className="row end">
        <label className="field">엑셀 대장<input type="file" name="file" accept=".xlsx,.xls,.xlsm,.csv" required /></label>
        <button className="btn primary" disabled={pending}>{pending ? "가져오는 중…" : "가져오기"}</button>
      </div>
    </form>
  );
}

export function UndoImport({ book, batch, n }: { book: string; batch: string; n: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn sm danger" disabled={pending} onClick={() => {
      if (!confirm(`「${batch}」에서 가져온 ${n}줄을 모두 지울까요?`)) return;
      start(async () => { await undoLedgerImport(book, batch); router.refresh(); });
    }}>되돌리기 ({n}줄 지우기)</button>
  );
}
