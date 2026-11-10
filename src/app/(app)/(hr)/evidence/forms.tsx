"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { deleteEvidence, uploadEvidence } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.eml,.htm,.html,.txt,.zip";

/** 출장 한 건에 붙이는 작은 첨부 버튼 (파일을 고르면 바로 올린다) */
export function AttachInline({ name, type, from, to, title, label = "+ 신청서 첨부" }: { name: string; type: string; from: string; to: string; title: string; label?: string }) {
  const [r, action, pending] = useActionState(uploadEvidence, null);
  return (
    <form action={action} className="row" style={{ gap: 6 }}>
      <input type="hidden" name="name" value={name} /><input type="hidden" name="type" value={type} />
      <input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} />
      <input type="hidden" name="title" value={title} />
      <label className={`btn sm${pending ? " busy" : ""}`}>
        {pending ? "올리는 중…" : label}
        <input type="file" name="file" accept={ACCEPT} multiple hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {r?.error && <span className="red" style={{ fontSize: ".82rem" }}>{r.error}</span>}
    </form>
  );
}

/** 목록에 없는 출장·교육이나 다른 근태에 직접 첨부 */
export function AttachForm({ names, today }: { names: [string, string][]; today: string }) {
  const [r, action, pending] = useActionState(uploadEvidence, null);
  return (
    <form action={action} className="stack" style={{ gap: 10 }} key={r?.ok ?? "form"}>
      {r && <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div>}
      <div className="row end">
        <label className="field">직원
          <select name="name" required defaultValue="">
            <option value="" disabled>선택</option>
            {names.map(([n, d]) => <option key={n} value={n}>{n}{d ? ` (${d})` : ""}</option>)}
          </select>
        </label>
        <label className="field">근태
          <select name="type" defaultValue="출장">{["출장", "교육", "외근", "휴일근무", "연장근무", "연차", "공가", "경조휴가", "병가", "기타"].map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label className="field">시작일<input type="date" name="from" defaultValue={today} required /></label>
        <label className="field">종료일<input type="date" name="to" defaultValue={today} /></label>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>제목<input type="text" name="title" placeholder="예: 김포발전소 출장 신청서 (결재번호)" /></label>
      </div>
      <div className="row end">
        <input type="file" name="file" accept={ACCEPT} multiple required />
        <button className="btn primary" disabled={pending}>{pending ? "올리는 중…" : "첨부"}</button>
      </div>
      <p className="caption" style={{ margin: 0 }}>
        하이웍스 전자결재 문서를 PDF로 저장(인쇄 → PDF로 저장)하거나 화면 캡처 이미지를 올리세요. 파일당 20MB까지, 여러 개를 한 번에 올릴 수 있습니다.
      </p>
    </form>
  );
}

export function DeleteEvidence({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn sm danger" disabled={pending} title="증빙 삭제" onClick={() => {
      if (!confirm("이 증빙 파일을 삭제할까요?")) return;
      start(async () => {
        await deleteEvidence(id);
        router.refresh();
      });
    }}>×</button>
  );
}
