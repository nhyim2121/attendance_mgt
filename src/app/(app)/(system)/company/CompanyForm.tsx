"use client";
import { useActionState } from "react";
import { COMPANY_FIELDS, type Company } from "@/lib/company";
import { saveCompanyAction } from "./actions";

export default function CompanyForm({ c }: { c: Company }) {
  const [r, action, pending] = useActionState(saveCompanyAction, null);
  return (
    <form action={action} className="co-form">
      <div className="co-grid">
        {COMPANY_FIELDS.map((f) => (
          <label key={f.key} className={`field${f.wide ? " co-wide" : ""}`}>
            {f.label}
            {f.long
              ? <textarea name={f.key} defaultValue={c[f.key]} placeholder={f.hint} rows={4} />
              : <input type="text" name={f.key} defaultValue={c[f.key]} placeholder={f.hint} />}
          </label>
        ))}
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <button className="btn" disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
        {r && <div className={`msg ${r.ok ? "ok" : "err"}`}>{r.ok ?? r.error}</div>}
      </div>
    </form>
  );
}
