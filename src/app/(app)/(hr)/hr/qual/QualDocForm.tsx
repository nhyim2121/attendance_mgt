"use client";
import { useActionState } from "react";
import { attachQualDoc } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.heic,.tif,.tiff,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

/** 심사 서류 묶음에 파일 올리기 (여러 개) */
export default function QualDocForm() {
  const [r, action, pending] = useActionState(attachQualDoc, null);
  return (
    <form action={action} className="row noprint" style={{ gap: 8, alignItems: "center" }}>
      <label className={`btn${pending ? " busy" : ""}`}>
        {pending ? "올리는 중…" : "+ 📎 서류 올리기"}
        <input type="file" name="file" accept={ACCEPT} multiple hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {r && <span className={r.ok ? "green" : "red"} style={{ fontSize: ".85rem" }}>{r.ok ?? r.error}</span>}
    </form>
  );
}
