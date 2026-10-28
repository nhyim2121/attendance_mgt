"use client";

import { useActionState } from "react";
import { deleteMonthAction, deleteUploadAction, type Result, uploadCaps, uploadHiworks } from "./actions";

export function ResultMsg({ r }: { r: Result | null }) {
  if (!r) return null;
  return (
    <>
      {r.ok && <div className="msg ok">{r.ok}</div>}
      {r.errors?.map((e) => <div key={e} className="msg err">{e}</div>)}
    </>
  );
}

export function CapsForm({ label = "캡스 기록 저장" }: { label?: string }) {
  const [r, action, pending] = useActionState(uploadCaps, null);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <input type="file" name="files" accept=".xls,.xlsx,.csv" multiple required />
      <div><button className="btn primary" disabled={pending}>{pending ? "파일을 읽고 저장하는 중..." : label}</button></div>
      <ResultMsg r={r} />
    </form>
  );
}

export function HiworksForm() {
  const [r, action, pending] = useActionState(uploadHiworks, null);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <input type="file" name="files" accept=".xls,.xlsx" required />
      <div>
        <button className="btn primary" disabled={pending}>
          {pending ? "근태현황 파일을 읽는 중... (시트가 많으면 1분 정도 걸립니다)" : "근태현황 저장"}
        </button>
      </div>
      <ResultMsg r={r} />
    </form>
  );
}

export function DeleteForms({ uploads, months }: { uploads: { id: number; file: string }[]; months: string[] }) {
  const [r1, delUpload, p1] = useActionState(deleteUploadAction, null);
  const [r2, delMonth, p2] = useActionState(deleteMonthAction, null);
  return (
    <div className="grid2">
      <form action={delUpload} className="stack" style={{ gap: 8 }}>
        <label className="field">업로드 번호로 지우기
          <select name="id">{uploads.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.file}</option>)}</select>
        </label>
        <div><button className="btn danger" disabled={p1 || !uploads.length}>이 업로드의 기록 삭제</button></div>
        <ResultMsg r={r1} />
      </form>
      <form action={delMonth} className="stack" style={{ gap: 8 }}>
        <label className="field">월 단위로 지우기
          <select name="month">{months.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" name="confirm" /> 이 달의 캡스 기록을 모두 지웁니다</label>
        <div><button className="btn danger" disabled={p2 || !months.length}>월 기록 삭제</button></div>
        <ResultMsg r={r2} />
      </form>
    </div>
  );
}
