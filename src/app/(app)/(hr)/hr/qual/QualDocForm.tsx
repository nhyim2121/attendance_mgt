"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Career, QualPerson } from "@/lib/인사노무/qualGrade";
import { careerMonths, ym } from "@/lib/인사노무/qualGrade";
import { EDU } from "@/lib/인사노무/qualGrade";
import { attachQualDoc, readCareerPdf, saveQualCareers, saveQualPerson } from "./actions";

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

/** 다른 회사 근무 이력: 건강보험 자격득실확인서·고용보험 가입이력 PDF를 올리면 읽어서 채우고, 관련 경력을 체크해 저장 */
export function QualCareerEditor({ name, careers, day }: { name: string; careers: Career[]; day: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Career[]>(careers);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(rows) !== JSON.stringify(careers);
  const set = (i: number, p: Partial<Career>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const upload = (f: File | undefined) => {
    if (!f) return;
    const fd = new FormData();
    fd.set("name", name);
    fd.set("file", f);
    start(async () => {
      const r = await readCareerPdf(fd);
      if (r.error) { setMsg(r.error); return; }
      const add = (r.careers ?? []).filter((c) => !rows.some((x) => x.company === c.company && x.from === c.from));
      setRows((rs) => [...rs, ...add].sort((a, b) => a.from.localeCompare(b.from)));
      setMsg(r.note || `${add.length}곳을 읽었습니다. 관련 경력(유사 제조·정비회사)을 체크하고 저장하세요.`);
      router.refresh();
    });
  };
  return (
    <div className="qual-cr">
      {rows.length > 0 && (
        <table className="tbl"><thead><tr><th>관련</th><th>회사</th><th>입사</th><th>퇴사</th><th>기간</th><th /></tr></thead>
          <tbody>{rows.map((c, i) => (
            <tr key={i} className={c.related ? undefined : "muted"}>
              <td><input type="checkbox" checked={c.related} onChange={(e) => set(i, { related: e.target.checked })} aria-label="관련 경력" /></td>
              <td><input value={c.company} onChange={(e) => set(i, { company: e.target.value })} aria-label="회사" /></td>
              <td><input type="date" value={c.from} onChange={(e) => set(i, { from: e.target.value })} aria-label="입사" /></td>
              <td><input type="date" value={c.to} onChange={(e) => set(i, { to: e.target.value })} aria-label="퇴사" /></td>
              <td>{ym(careerMonths([{ ...c, related: true }], day))}</td>
              <td><button type="button" className="btn sm ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="지우기">×</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
        <label className={`btn sm${pending ? " busy" : ""}`} title="건강보험 자격득실확인서 또는 고용보험 가입이력내역서 (공단에서 내려받은 PDF)">
          {pending ? "읽는 중…" : "📄 4대보험 이력 PDF"}
          <input type="file" accept=".pdf" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <button type="button" className="btn sm" onClick={() => setRows((rs) => [...rs, { company: "", from: "", to: "", related: true }])}>+ 직접 적기</button>
        <button type="button" className="btn sm primary" disabled={!dirty || pending} onClick={() => start(async () => {
          const r = await saveQualCareers(name, rows);
          setMsg(r?.ok ?? r?.error ?? "");
          router.refresh();
        })}>저장</button>
        <small className="muted">관련 경력 합 {ym(careerMonths(rows, day))}</small>
        {msg && <small className="orange">{msg}</small>}
      </div>
    </div>
  );
}
