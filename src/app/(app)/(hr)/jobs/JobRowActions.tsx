"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { copyJob, deleteJob, moveJob, restoreExamples } from "./actions";

export default function JobRowActions({ id, name, first, last }: { id: string; name: string; first: boolean; last: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ id?: string; error?: string }>, go?: boolean) => start(async () => {
    const r = await fn();
    if (r.error) alert(r.error);
    if (go && r.id) router.push(`/jobs/edit?id=${r.id}`); else router.refresh();
  });
  return (
    <span className={`jd-acts${pending ? " busy" : ""}`}>
      <Link className="btn sm" href={`/jobs/view?id=${id}`}>보기</Link>
      <Link className="btn sm" href={`/jobs/edit?id=${id}`}>고치기</Link>
      <a className="btn sm" href={`/api/hr/jobdesc?id=${id}`} title="엑셀">⬇</a>
      <button className="btn sm" title="복사해서 새로 만들기" onClick={() => run(() => copyJob(id), true)}>복사</button>
      <button className="btn sm" title="위로" disabled={first} onClick={() => run(() => moveJob(id, -1))}>↑</button>
      <button className="btn sm" title="아래로" disabled={last} onClick={() => run(() => moveJob(id, 1))}>↓</button>
      <button className="btn sm danger" onClick={() => { if (confirm(`「${name}」 직무기술서를 지울까요?`)) run(() => deleteJob(id)); }}>×</button>
    </span>
  );
}

export function RestoreExamples() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <p className="caption" style={{ margin: "6px 0 0" }}>
      <button className="btn sm" disabled={pending} onClick={() => start(async () => { const r = await restoreExamples(); setMsg(r.ok ?? ""); router.refresh(); })}>
        지운 예시 다시 넣기
      </button> {msg}
    </p>
  );
}
