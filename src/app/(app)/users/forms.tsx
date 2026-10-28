"use client";

import { useActionState } from "react";
import { changeMyPassword, deleteUser, upsertUser } from "./actions";

type Res = { ok?: string; error?: string } | null;
const Msg = ({ r }: { r: Res }) => (r ? <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div> : null);

export function MyPassword() {
  const [r, action, pending] = useActionState(changeMyPassword, null);
  return (
    <form action={action} className="stack" style={{ gap: 10, maxWidth: 420 }}>
      <label className="field">현재 비밀번호<input type="password" name="cur" autoComplete="current-password" required /></label>
      <label className="field">새 비밀번호 (8자 이상, 숫자+문자)<input type="password" name="pw" autoComplete="new-password" required /></label>
      <label className="field">새 비밀번호 확인<input type="password" name="pw2" autoComplete="new-password" required /></label>
      <Msg r={r} />
      <div><button className="btn" disabled={pending}>변경</button></div>
    </form>
  );
}

export function UpsertUser() {
  const [r, action, pending] = useActionState(upsertUser, null);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <label className="field">아이디<input type="text" name="id" required /></label>
      <label className="field">이름<input type="text" name="name" required /></label>
      <label className="field" title="관리자: 업로드 삭제·사용자 관리 가능 / 담당자: 조회·업로드·기입">역할
        <select name="role" defaultValue="담당자"><option>관리자</option><option>담당자</option></select>
      </label>
      <label className="field">비밀번호 (새 계정은 필수)<input type="password" name="pw" autoComplete="new-password" /></label>
      <Msg r={r} />
      <div><button className="btn primary" disabled={pending}>저장</button></div>
    </form>
  );
}

export function DeleteUser({ ids }: { ids: string[] }) {
  const [r, action, pending] = useActionState(deleteUser, null);
  if (!ids.length) return null;
  return (
    <details className="pop left" style={{ marginTop: 10 }}>
      <summary className="btn sm">계정 삭제</summary>
      <form action={action} className="pop-body stack" style={{ gap: 8 }}>
        <select name="id">{ids.map((i) => <option key={i}>{i}</option>)}</select>
        <Msg r={r} />
        <div><button className="btn danger" disabled={pending}>삭제</button></div>
      </form>
    </details>
  );
}
