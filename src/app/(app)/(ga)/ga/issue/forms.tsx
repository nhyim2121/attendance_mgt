"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { attachIssue, removeCert, removeIssue, renewCertAction, saveCertAction, saveIssueAction } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.zip";
const Msg = ({ r }: { r: { ok?: string; error?: string } | null }) => (r ? <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div> : null);

export interface IssueFormValue {
  id?: number; day: string; docType: string; copies: string; via: string; purpose: string; submitTo: string;
  requester: string; fee: string; note: string;
}

/** 발급 기록 적기·고치기 */
export function IssueForm({ v, docTypes, vias, known, back }: {
  v: IssueFormValue; docTypes: [string, string][]; vias: string[]; known: { purpose: string[]; submitTo: string[]; requester: string[] }; back: string;
}) {
  const [r, action, pending] = useActionState(saveIssueAction, null);
  const edit = !!v.id;
  return (
    <form action={action} className="stack" style={{ gap: 10 }} key={r?.ok ?? "form"}>
      <Msg r={r} />
      {edit && <input type="hidden" name="id" value={v.id} />}
      <input type="hidden" name="back" value={back} />
      <div className="row end">
        <label className="field">발급일<input type="date" name="day" defaultValue={v.day} required /></label>
        <label className="field" style={{ flex: 2, minWidth: 240 }}>서류
          <input type="text" name="docType" defaultValue={v.docType} list="ga-doctypes" required placeholder="골라도 되고 직접 적어도 됩니다"
            onChange={(e) => {
              const via = e.currentTarget.form?.elements.namedItem("via") as HTMLInputElement | null;
              const hit = docTypes.find(([d]) => d === e.target.value);
              if (via && hit && !via.value) via.value = hit[1];
            }} />
        </label>
        <label className="field" style={{ width: 70 }}>부수<input type="number" name="copies" min={1} defaultValue={v.copies} /></label>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>발급처<input type="text" name="via" defaultValue={v.via} list="ga-vias" /></label>
      </div>
      <div className="row end">
        <label className="field" style={{ flex: 1, minWidth: 180 }}>용도<input type="text" name="purpose" defaultValue={v.purpose} list="ga-purposes" placeholder="예: 입찰, 대출, 거래처 등록" /></label>
        <label className="field" style={{ flex: 1, minWidth: 180 }}>제출처<input type="text" name="submitTo" defaultValue={v.submitTo} list="ga-submits" placeholder="예: 한국남동발전, ○○은행" /></label>
        <label className="field" style={{ width: 120 }}>요청한 사람<input type="text" name="requester" defaultValue={v.requester} list="ga-requesters" placeholder="본인이면 빈칸" /></label>
        <label className="field" style={{ width: 100 }}>수수료(원)<input type="text" inputMode="numeric" name="fee" defaultValue={v.fee} /></label>
      </div>
      <div className="row end">
        <label className="field" style={{ flex: 1, minWidth: 200 }}>메모<input type="text" name="note" defaultValue={v.note} /></label>
        <label className="field">발급본 <span className="muted">(PDF 등, 있으면)</span><input type="file" name="file" accept={ACCEPT} multiple /></label>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : edit ? "고치기" : "대장에 적기"}</button>
        {edit && <Link className="btn" href={back}>취소</Link>}
      </div>
      <datalist id="ga-doctypes">{docTypes.map(([d]) => <option key={d} value={d} />)}</datalist>
      <datalist id="ga-vias">{vias.map((d) => <option key={d} value={d} />)}</datalist>
      <datalist id="ga-purposes">{known.purpose.map((d) => <option key={d} value={d} />)}</datalist>
      <datalist id="ga-submits">{known.submitTo.map((d) => <option key={d} value={d} />)}</datalist>
      <datalist id="ga-requesters">{known.requester.map((d) => <option key={d} value={d} />)}</datalist>
    </form>
  );
}

export function AttachIssue({ id }: { id: number }) {
  const [r, action, pending] = useActionState(attachIssue, null);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <label className={`btn sm${pending ? " busy" : ""}`} title="발급본 첨부">
        {pending ? "…" : "+ 📎"}
        <input type="file" name="file" accept={ACCEPT} multiple hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {r?.error && <span className="red" style={{ fontSize: ".8rem" }}> {r.error}</span>}
    </form>
  );
}

export function DeleteIssue({ id, label }: { id: number; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn sm danger" disabled={pending} title="삭제" onClick={() => {
      if (!confirm(`${label} 기록을 지울까요? 첨부한 발급본도 같이 지워집니다.`)) return;
      start(async () => { await removeIssue(id); router.refresh(); });
    }}>×</button>
  );
}

// ---------------------------------------------------------------- 인증서
export interface CertFormValue {
  id?: number; name: string; kind: string; issuer: string; usage: string; holder: string; location: string;
  issued: string; expires: string; active: boolean; note: string;
}

export function CertForm({ v, kinds }: { v: CertFormValue; kinds: string[] }) {
  const [r, action, pending] = useActionState(saveCertAction, null);
  const edit = !!v.id;
  return (
    <form action={action} className="stack" style={{ gap: 10 }} key={r?.ok ?? "form"}>
      <Msg r={r} />
      {edit && <input type="hidden" name="id" value={v.id} />}
      <div className="row end">
        <label className="field" style={{ flex: 2, minWidth: 220 }}>이름<input type="text" name="name" defaultValue={v.name} required placeholder="예: 법인 범용 공동인증서" /></label>
        <label className="field">종류<select name="kind" defaultValue={v.kind}>{kinds.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="field" style={{ flex: 1, minWidth: 150 }}>발급기관·은행<input type="text" name="issuer" defaultValue={v.issuer} placeholder="예: 한국정보인증, 기업은행" /></label>
      </div>
      <div className="row end">
        <label className="field" style={{ flex: 2, minWidth: 220 }}>쓰는 곳<input type="text" name="usage" defaultValue={v.usage} placeholder="예: 홈택스, 나라장터, 4대보험, 인터넷뱅킹" /></label>
        <label className="field" style={{ width: 120 }}>보관자<input type="text" name="holder" defaultValue={v.holder} /></label>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>보관 위치<input type="text" name="location" defaultValue={v.location} placeholder="예: 보안USB(금고), 총무 PC" /></label>
      </div>
      <div className="row end">
        <label className="field">발급(갱신)일<input type="date" name="issued" defaultValue={v.issued} /></label>
        <label className="field">만료일<input type="date" name="expires" defaultValue={v.expires} /></label>
        <label className="field">상태<select name="active" defaultValue={v.active ? "1" : "0"}><option value="1">사용 중</option><option value="0">폐기·안 씀</option></select></label>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>메모·갱신 이력<textarea name="note" rows={Math.min(4, v.note.split("\n").length)} defaultValue={v.note} /></label>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : edit ? "고치기" : "등록"}</button>
        {edit && <Link className="btn" href="/ga/certs">취소</Link>}
      </div>
      <p className="caption" style={{ margin: 0 }}>🔒 인증서 파일과 비밀번호는 여기에 저장하지 않습니다. 무엇이 어디에 있고 언제 끝나는지만 적어 두세요.</p>
    </form>
  );
}

/** 갱신: 새 만료일을 고르고 [갱신함] */
export function RenewCert({ id, suggest }: { id: number; suggest: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [exp, setExp] = useState(suggest);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>갱신함</button>;
  return (
    <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
      <input type="date" value={exp} onChange={(e) => setExp(e.target.value)} title="새 만료일" />
      <button className="btn sm primary" disabled={pending} onClick={() => start(async () => {
        const r = await renewCertAction(id, exp);
        if (r.error) setErr(r.error); else { setOpen(false); router.refresh(); }
      })}>저장</button>
      <button className="btn sm" onClick={() => setOpen(false)}>취소</button>
      {err && <span className="red" style={{ fontSize: ".8rem" }}>{err}</span>}
    </span>
  );
}

export function DeleteCert({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn sm danger" disabled={pending} title="삭제" onClick={() => {
      if (!confirm(`${name}을(를) 목록에서 지울까요? 안 쓰는 인증서는 지우지 않고 '폐기·안 씀'으로 두면 이력이 남습니다.`)) return;
      start(async () => { await removeCert(id); router.refresh(); });
    }}>×</button>
  );
}
