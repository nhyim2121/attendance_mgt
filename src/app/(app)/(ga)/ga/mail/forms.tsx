"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { attachMail, importLedger, removeFile, removeMail, saveMail, toggleMailStatus, undoLedger } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.eml,.txt,.zip";
const KINDS = ["공문", "우편", "등기", "팩스", "택배", "이메일", "기타"];

export interface MailFormValue {
  id?: number; no?: string; dir: string; day: string; kind: string; party: string; title: string; refNo: string;
  route: string; status: string; due: string; note: string; replyOf: string; cost: string;
}
/** 회신으로 고를 받은 문서 */
export interface ReplyOption { id: number; no: string; party: string; title: string; open: boolean }

/** 새로 적기 / 고치기 */
export function MailForm({ v, parties, back, replies }: { v: MailFormValue; parties: string[]; back: string; replies: ReplyOption[] }) {
  const [r, action, pending] = useActionState(saveMail, null);
  const [dir, setDir] = useState(v.dir);
  const inbound = dir === "수신";
  const edit = !!v.id;
  return (
    <form action={action} className="stack" style={{ gap: 10 }} key={r?.ok ?? "form"}>
      {r && <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div>}
      {edit && <input type="hidden" name="id" value={v.id} />}
      <input type="hidden" name="back" value={back} />
      <div className="row end">
        <div className="field">구분
          <div className="seg">
            {["수신", "발신"].map((d) => (
              <label key={d} className={dir === d ? "on" : ""}>
                <input type="radio" name="dir" value={d} checked={dir === d} onChange={() => setDir(d)} hidden />{d === "수신" ? "📥 받음" : "📤 보냄"}
              </label>
            ))}
          </div>
        </div>
        <label className="field">종류
          <select name="kind" defaultValue={v.kind}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        </label>
        <label className="field">{inbound ? "받은 날" : "보낸 날"}<input type="date" name="day" defaultValue={v.day} required /></label>
        {!inbound && (
          <label className="field" style={{ minWidth: 220, maxWidth: 360 }}>회신하는 받은 문서 <span className="muted">(있으면)</span>
            <select name="replyOf" defaultValue={v.replyOf} onChange={(e) => {
              const o = replies.find((x) => String(x.id) === e.target.value), form = e.currentTarget.form;
              if (!o || !form) return;
              const party = form.elements.namedItem("party") as HTMLInputElement, title = form.elements.namedItem("title") as HTMLInputElement;
              if (!party.value) party.value = o.party;
              if (!title.value) title.value = `[회신] ${o.title}`;
            }}>
              <option value="">없음</option>
              {replies.map((o) => <option key={o.id} value={o.id}>{o.open ? "● " : ""}{o.no} {o.party} · {o.title}</option>)}
            </select>
          </label>
        )}
        <label className="field" style={{ flex: 1, minWidth: 200 }}>{inbound ? "보낸 곳" : "받는 곳"}
          <input type="text" name="party" defaultValue={v.party} list="ga-parties" placeholder={inbound ? "예: 한국남동발전" : "예: 고용노동부 부천지청"} />
        </label>
      </div>
      <div className="row end">
        <label className="field" style={{ flex: 2, minWidth: 260 }}>제목·내용<input type="text" name="title" defaultValue={v.title} placeholder="예: 2026년 하반기 안전점검 협조 요청" /></label>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>문서·등기번호<input type="text" name="refNo" defaultValue={v.refNo} placeholder="공문번호·등기·송장번호" /></label>
      </div>
      <div className="row end">
        <label className="field" style={{ flex: 1, minWidth: 180 }}>{inbound ? "전달·처리" : "발송 방법·비고"}
          <input type="text" name="route" defaultValue={v.route} placeholder={inbound ? "예: 대표님께 전달, 공사팀 회신 필요" : "예: 우체국 등기, 팩스 02-000-0000"} />
        </label>
        {!inbound && <label className="field" style={{ width: 110 }}>발송 요금(원)<input type="text" inputMode="numeric" name="cost" defaultValue={v.cost} placeholder="예: 3530" /></label>}
        <label className="field">상태
          <select name="status" defaultValue={v.status}><option>완료</option><option>처리 중</option></select>
        </label>
        <label className="field">기한 <span className="muted">(있으면)</span><input type="date" name="due" defaultValue={v.due} /></label>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>메모<input type="text" name="note" defaultValue={v.note} /></label>
      </div>
      <div className="row end">
        <label className="field">스캔본·발송본 <span className="muted">(여러 개 가능)</span><input type="file" name="file" accept={ACCEPT} multiple /></label>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : edit ? `${v.no} 고치기` : "대장에 적기"}</button>
        {edit && <Link className="btn" href={back}>취소</Link>}
      </div>
      <datalist id="ga-parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>
    </form>
  );
}

/** 줄마다: 첨부 추가 */
export function AttachBtn({ id }: { id: number }) {
  const [r, action, pending] = useActionState(attachMail, null);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <label className={`btn sm${pending ? " busy" : ""}`} title="스캔본 첨부">
        {pending ? "…" : "+ 📎"}
        <input type="file" name="file" accept={ACCEPT} multiple hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {r?.error && <span className="red" style={{ fontSize: ".8rem" }}> {r.error}</span>}
    </form>
  );
}

/** 처리 중 ↔ 완료 */
export function StatusBtn({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className={`mstat ${status === "처리 중" ? "open" : "done"}`} disabled={pending} title="눌러서 상태 바꾸기"
      onClick={() => start(async () => { await toggleMailStatus(id, status); router.refresh(); })}>
      {status}
    </button>
  );
}

export function DeleteMail({ id, no }: { id: number; no: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn sm danger" disabled={pending} title="삭제" onClick={() => {
      if (!confirm(`${no} 을(를) 대장에서 지울까요? 첨부 파일도 같이 지워집니다.\n(번호는 비워 둔 채로 남습니다)`)) return;
      start(async () => { await removeMail(id); router.refresh(); });
    }}>×</button>
  );
}

export function DeleteFile({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="x" disabled={pending} title="첨부 삭제" onClick={() => {
      if (!confirm(`${name} 첨부를 지울까요?`)) return;
      start(async () => { await removeFile(id); router.refresh(); });
    }}>×</button>
  );
}

/** 예전 엑셀 대장 가져오기 */
export function ImportForm() {
  const [r, action, pending] = useActionState(importLedger, null);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      {r && <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div>}
      <div className="row end">
        <label className="field">엑셀 대장<input type="file" name="file" accept=".xlsx,.xls,.csv" required /></label>
        <label className="field">수신/발신 칸이 없으면
          <select name="dir" defaultValue="수신"><option value="수신">모두 받은 문서로</option><option value="발신">모두 보낸 문서로</option></select>
        </label>
        <button className="btn primary" disabled={pending}>{pending ? "가져오는 중…" : "가져오기"}</button>
      </div>
    </form>
  );
}

export function UndoImport({ batch, n }: { batch: string; n: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn sm danger" disabled={pending} onClick={() => {
      if (!confirm(`「${batch}」에서 가져온 ${n}건을 모두 지울까요?`)) return;
      start(async () => { await undoLedger(batch); router.refresh(); });
    }}>되돌리기 ({n}건 지우기)</button>
  );
}
