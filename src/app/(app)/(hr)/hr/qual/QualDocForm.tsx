"use client";
import { useActionState } from "react";
import type { QualPerson } from "@/lib/인사노무/qualGrade";
import { EDU } from "@/lib/인사노무/qualGrade";
import { attachQualDoc, saveQualPerson } from "./actions";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.heic,.tif,.tiff,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

/** 요청서류 항목에 파일 올리기 (여러 개) */
export default function QualDocForm({ docKey }: { docKey: string }) {
  const [r, action, pending] = useActionState(attachQualDoc, null);
  return (
    <form action={action} className="noprint" style={{ display: "inline" }}>
      <input type="hidden" name="key" value={docKey} />
      <label className={`btn sm${pending ? " busy" : ""}`}>
        {pending ? "…" : "+ 📎"}
        <input type="file" name="file" accept={ACCEPT} multiple hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {r?.error && <span className="red" style={{ fontSize: ".8rem" }}> {r.error}</span>}
    </form>
  );
}

/** 사람별 이전 경력·학력·포함 여부 한 줄 */
export function QualPersonForm({ name, p, tech }: { name: string; p: QualPerson; tech: boolean }) {
  const [r, action, pending] = useActionState(saveQualPerson, null);
  const inc = p.include === undefined ? "" : p.include ? "1" : "0";
  return (
    <form action={action} className="qual-pf" key={JSON.stringify(p)}>
      <input type="hidden" name="name" value={name} />
      <select name="include" defaultValue={inc} title="기술인력 포함 여부" aria-label={`${name} 포함`}>
        <option value="">{tech ? "포함 (부서)" : "제외 (부서)"}</option>
        <option value="1">포함</option>
        <option value="0">제외</option>
      </select>
      <span className="qual-ym">
        <input name="prevY" type="number" min={0} max={60} defaultValue={p.prev ? Math.floor(p.prev / 12) : ""} aria-label={`${name} 이전 경력 년`} placeholder="0" />년
        <input name="prevM" type="number" min={0} max={11} defaultValue={p.prev ? p.prev % 12 : ""} aria-label={`${name} 이전 경력 개월`} placeholder="0" />개월
      </span>
      <select name="edu" defaultValue={p.edu ?? ""} aria-label={`${name} 학력`}>
        <option value="">학력 -</option>
        {EDU.map((x) => <option key={x}>{x}</option>)}
      </select>
      <input name="eduDate" type="date" defaultValue={p.eduDate ?? ""} aria-label={`${name} 졸업일`} title="졸업일" />
      <label className="qual-ym" title="4대보험 가입자명부의 고용보험 자격취득일">4대보험<input name="insured" type="date" defaultValue={p.insured ?? ""} aria-label={`${name} 4대보험 취득일`} style={{ width: 140 }} /></label>
      <input name="role" defaultValue={p.role ?? ""} placeholder="담당분야 (비우면 부서로)" aria-label={`${name} 담당분야`} style={{ width: 150 }} />
      <input name="note" defaultValue={p.note ?? ""} placeholder="메모" aria-label={`${name} 메모`} />
      <button className="btn sm" disabled={pending}>{pending ? "…" : "저장"}</button>
      {r && <small className={r.ok ? "green" : "red"}>{r.ok ? "✓" : r.error}</small>}
    </form>
  );
}
