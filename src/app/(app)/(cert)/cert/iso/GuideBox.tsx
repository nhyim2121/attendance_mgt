/** 양식 하나의 작성 방법 (ISO 27001:2022 요구사항·목적·언제·누가·순서·심사 때 보는 점) */
import { guideOf, KEEP_NOTE } from "@/lib/인증/iso27k-guide";
import type { IsoForm } from "@/lib/인증/iso27k";

export default function GuideBox({ form, open, full }: { form: IsoForm; open?: boolean; full?: boolean }) {
  const g = guideOf(form.key, form.group);
  const body = (
    <div className="iso-guide-b">
      <div className="iso-guide-iso">{g.iso.map((x) => <span key={x} className="tag">{x}</span>)}</div>
      <p><b>목적</b> {g.purpose}</p>
      <div className="iso-guide-2">
        <p><b>언제</b> {g.when}</p>
        <p><b>누가</b> {g.who}</p>
      </div>
      <b>작성 순서</b>
      <ol>{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      {g.check?.length ? <><b>심사 때 보는 점</b><ul>{g.check.map((s, i) => <li key={i}>{s}</li>)}</ul></> : null}
      {g.generic && <p className="caption">추가 양식이라 분류({form.group})의 기본 설명입니다.</p>}
      {!full && <p className="caption" style={{ margin: 0 }}>{KEEP_NOTE}</p>}
    </div>
  );
  if (full) return <section className="card iso-guide-full"><h3>{form.title} <small className="muted">{form.code}</small></h3>{body}</section>;
  return (
    <details className="card iso-guide noprint" open={open}>
      <summary>📘 작성 방법 <small>ISO/IEC 27001:2022 · {g.iso[0]}{g.iso.length > 1 ? ` 외 ${g.iso.length - 1}` : ""}</small></summary>
      {body}
    </details>
  );
}
