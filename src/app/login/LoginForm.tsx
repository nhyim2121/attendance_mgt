"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action}>
      <label className="field">아이디<input type="text" name="id" autoComplete="username" required autoFocus /></label>
      <label className="field">비밀번호<input type="password" name="pw" autoComplete="current-password" required /></label>
      {error && <div className="msg err">{error}</div>}
      <button className="btn primary" disabled={pending}>{pending ? "확인 중..." : "로그인"}</button>
    </form>
  );
}
