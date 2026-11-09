"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { addEventAction, attachCert, removeEvent, removeItem, saveItemAction } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";
const Msg = ({ r }: { r: { ok?: string; error?: string } | null }) => (r ? <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div> : null);
type Preset = { name: string; category: string; issuer: string; years: number | null; audit: string };

/** 날짜 + n년 - 1일 (유효기간 끝) */
function plusYears(d: string, n: number): string {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y + n, m - 1, dd) - 86400000);
  return t.toISOString().slice(0, 10);
}

export interface ItemFormValue {
  id?: number; category: string; name: string; certNo: string; issuer: string; acquired: string; validFrom: string;
  expires: string; nextAudit: string; nextAuditLabel: string; status: string; note: string;
}

export function ItemForm({ v, presets, categories, statuses }: { v: ItemFormValue; presets: Preset[]; categories: readonly string[]; statuses: readonly string[] }) {
  const [r, action, pending] = useActionState(saveItemAction, null);
  const [years, setYears] = useState<number | null>(null);
  const edit = !!v.id;
  const el = (f: HTMLFormElement | null, n: string) => f?.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null;
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <Msg r={r} />
      {edit && <input type="hidden" name="id" value={v.id} />}
      <div className="row end">
        <label className="field" style={{ flex: 2, minWidth: 240 }}>인증 이름
          <input type="text" name="name" defaultValue={v.name} list="cert-presets" required placeholder="골라도 되고 직접 적어도 됩니다"
            onChange={(e) => {
              const p = presets.find((x) => x.name === e.target.value), f = e.currentTarget.form;
              if (!p || !f) return;
              setYears(p.years);
              const cat = el(f, "category"), iss = el(f, "issuer"), lab = el(f, "nextAuditLabel");
              if (cat) cat.value = p.category;
              if (iss && !iss.value) iss.value = p.issuer;
              if (lab && !lab.value) lab.value = p.audit;
            }} />
        </label>
        <label className="field">분류<select name="category" defaultValue={v.category}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field">상태<select name="status" defaultValue={v.status}>{statuses.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <div className="row end">
        <label className="field" style={{ flex: 1, minWidth: 160 }}>인증·등록 번호<input type="text" name="certNo" defaultValue={v.certNo} /></label>
        <label className="field" style={{ flex: 1, minWidth: 180 }}>인증기관·주관기관<input type="text" name="issuer" defaultValue={v.issuer} /></label>
        <label className="field">처음 취득일<input type="date" name="acquired" defaultValue={v.acquired} /></label>
      </div>
      <div className="row end">
        <label className="field">유효기간 시작
          <input type="date" name="validFrom" defaultValue={v.validFrom} onChange={(e) => {
            const exp = el(e.currentTarget.form, "expires");
            if (exp && !exp.value && years && e.target.value) exp.value = plusYears(e.target.value, years);
          }} />
        </label>
        <label className="field">유효기간 끝 <span className="muted">(기한 없으면 빈칸)</span><input type="date" name="expires" defaultValue={v.expires} /></label>
        <label className="field">다음 심사·보고일<input type="date" name="nextAudit" defaultValue={v.nextAudit} /></label>
        <label className="field" style={{ flex: 1, minWidth: 150 }}>무슨 일정<input type="text" name="nextAuditLabel" defaultValue={v.nextAuditLabel} placeholder="예: 1차 사후심사, 갱신심사" /></label>
      </div>
      <div className="row end">
        <label className="field" style={{ flex: 1, minWidth: 220 }}>메모<textarea name="note" rows={2} defaultValue={v.note} placeholder="예: 담당 컨설팅사, 유지 조건(연구원 2명 이상) 등" /></label>
        {!edit && <label className="field">인증서 스캔본<input type="file" name="file" accept={ACCEPT} multiple /></label>}
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : edit ? "고치기" : "등록"}</button>
        {edit && <Link className="btn" href={`/cert/item?id=${v.id}`}>취소</Link>}
      </div>
      {years && <p className="caption" style={{ margin: 0 }}>보통 유효기간 {years}년 — 시작일을 넣으면 끝나는 날이 채워집니다. 실제 인증서 날짜로 꼭 확인하세요.</p>}
      <datalist id="cert-presets">{presets.map((p) => <option key={p.name} value={p.name} />)}</datalist>
    </form>
  );
}

/** 이력 추가: 갱신이면 새 만료일, 심사면 다음 심사일도 같이 */
export function EventForm({ itemId, today, kinds }: { itemId: number; today: string; kinds: readonly string[] }) {
  const [r, action, pending] = useActionState(addEventAction, null);
  const [kind, setKind] = useState("사후심사");
  return (
    <form action={action} className="stack" style={{ gap: 10 }} key={r?.ok ?? "ev"}>
      <Msg r={r} />
      <input type="hidden" name="itemId" value={itemId} />
      <div className="row end">
        <label className="field">날짜<input type="date" name="day" defaultValue={today} required /></label>
        <label className="field">무슨 일<select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="field" style={{ flex: 1, minWidth: 220 }}>내용<input type="text" name="title" placeholder="예: 연구원 추가(홍길동) 변경신고, 1차 사후심사 적합" /></label>
      </div>
      <div className="row end">
        {kind === "갱신" && <label className="field">새 유효기간 끝<input type="date" name="newExpires" /></label>}
        <label className="field">다음 심사·보고일 <span className="muted">(정해졌으면)</span><input type="date" name="nextAudit" /></label>
        <label className="field" style={{ width: 150 }}>다음 일정 이름<input type="text" name="nextAuditLabel" placeholder="예: 2차 사후심사" /></label>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>메모<input type="text" name="note" /></label>
        <label className="field">첨부<input type="file" name="file" accept={ACCEPT} multiple /></label>
        <button className="btn primary" disabled={pending}>{pending ? "저장 중…" : "이력 적기"}</button>
      </div>
    </form>
  );
}

export function AttachCert({ refKey, label = "+ 📎" }: { refKey: string; label?: string }) {
  const [r, action, pending] = useActionState(attachCert, null);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="ref" value={refKey} />
      <label className={`btn sm${pending ? " busy" : ""}`}>
        {pending ? "…" : label}
        <input type="file" name="file" accept={ACCEPT} multiple hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {r?.error && <span className="red" style={{ fontSize: ".8rem" }}> {r.error}</span>}
    </form>
  );
}

export function DeleteEvent({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="x" disabled={pending} title="이력 삭제" onClick={() => {
      if (!confirm("이 이력을 지울까요? 첨부도 같이 지워집니다.")) return;
      start(async () => { await removeEvent(id); router.refresh(); });
    }}>×</button>
  );
}

export function DeleteItem({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn sm danger" disabled={pending} onClick={() => {
      if (!confirm(`${name}을(를) 지울까요? 이력과 첨부가 모두 지워집니다.\n끝난 인증은 지우지 말고 상태를 '만료'나 '취소·반납'으로 두면 기록이 남습니다.`)) return;
      start(async () => { await removeItem(id); });
    }}>삭제</button>
  );
}
