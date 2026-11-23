"use client";
/** 문서 제목·작성일 (바꾸면 바로 저장) */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteIsoDoc, saveIsoDoc } from "./actions";

/** 삭제 (한 번 더 묻기) */
export function DeleteDoc({ id, name }: { id: number; name: string }) {
  return (
    <form action={deleteIsoDoc} onSubmit={(e) => { if (!confirm(`「${name}」을(를) 지울까요? 되돌릴 수 없습니다.`)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn danger">삭제</button>
    </form>
  );
}

export default function Meta({ id, title, day }: { id: number; title: string; day: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const save = async (patch: { title?: string; day?: string }) => {
    const r = await saveIsoDoc(id, patch);
    setMsg(r.error ?? "");
    if (!r.error) router.refresh();
  };
  return (
    <div className="iso-meta">
      <label>문서 이름<input type="text" defaultValue={title} onBlur={(e) => e.target.value !== title && save({ title: e.target.value })} /></label>
      <label>작성일<input type="date" defaultValue={day} onChange={(e) => e.target.value && save({ day: e.target.value })} /></label>
      {msg && <span className="red">{msg}</span>}
    </div>
  );
}
