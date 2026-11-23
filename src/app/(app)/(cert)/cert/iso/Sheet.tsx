"use client";
/** ISO 실적문서 한 장: 양식 모양 그대로 그리고, 칸·문단을 눌러 바로 적는다. 잠시 뒤 자동 저장. */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Block, Cell, Sheet as SheetT } from "@/lib/인증/iso27k";
import { growIsoTable, saveIsoDoc } from "./actions";

const ALIGN: Record<string, React.CSSProperties["textAlign"]> = { CENTER: "center", RIGHT: "right", LEFT: "left", JUSTIFY: "left", DISTRIBUTE: "justify" };

/** 적는 칸 (글자가 늘면 칸도 늘어남). 처음 값만 넣고 그다음은 브라우저가 들고 있다 */
function Edit({ id, value, onChange, readOnly, style }: { id: string; value: string; onChange: (id: string, v: string) => void; readOnly?: boolean; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerText !== value) ref.current.innerText = value; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (readOnly) return <div className="iso-tx" style={style}>{value}</div>;
  return <div ref={ref} className="iso-tx iso-ed" style={style} contentEditable="plaintext-only" suppressContentEditableWarning
    spellCheck={false} onInput={(e) => onChange(id, (e.currentTarget as HTMLDivElement).innerText.replace(/\n$/, ""))} />;
}

export default function Sheet({ docId, sheet, values, readOnly }: { docId?: number; sheet: SheetT; values: Record<string, string>; readOnly?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"" | "편집 중" | "저장 중…" | "저장됨" | string>("");
  const vals = useRef<Record<string, string>>({ ...values });
  const base = useRef<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, start] = useTransition();

  const save = async () => {
    if (!docId) return;
    setState("저장 중…");
    // 양식 글과 같은 칸은 빼고, 바뀐 칸만 저장
    const v: Record<string, string> = {};
    for (const [k, x] of Object.entries(vals.current)) if (base.current[k] !== x) v[k] = x;
    const r = await saveIsoDoc(docId, { v });
    setState(r.error ? `저장 실패: ${r.error}` : `저장됨 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`);
  };
  const onChange = (id: string, v: string) => {
    vals.current[id] = v;
    setState("편집 중");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 900);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void save(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grow = (table: string, d: number) => start(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; await save(); }
    await growIsoTable(docId!, table, d);
    router.refresh();
  });

  const text = (id: string, tpl: string) => {
    base.current[id] = tpl;
    return vals.current[id] ?? tpl;
  };

  const cell = (c: Cell) => (
    <td key={c.id} rowSpan={c.rs > 1 ? c.rs : undefined} colSpan={c.cs > 1 ? c.cs : undefined}
      style={{ height: c.h || undefined, background: c.bg, borderTop: c.bd[0], borderRight: c.bd[1], borderBottom: c.bd[2], borderLeft: c.bd[3], verticalAlign: c.va === "top" ? "top" : c.va === "bottom" ? "bottom" : "middle" }}>
      {c.edit && <Edit id={c.id} value={text(c.id, c.text)} onChange={onChange} readOnly={readOnly}
        style={{ textAlign: ALIGN[c.align] ?? "left", fontSize: `${c.pt}pt`, fontWeight: c.bold ? 700 : 400, color: c.bold ? undefined : undefined }} />}
      {c.blocks.map(block)}
    </td>
  );

  function block(b: Block) {
    if (b.k === "p") {
      if (!b.edit) return <div key={b.id} className="iso-p" style={{ fontSize: `${b.pt}pt`, minHeight: `${b.pt * 1.5}pt`, textAlign: ALIGN[b.align] ?? "left", fontWeight: b.bold ? 700 : 400 }}>{b.text}</div>;
      return <Edit key={b.id} id={b.id} value={text(b.id, b.text)} onChange={onChange} readOnly={readOnly}
        style={{ fontSize: `${b.pt}pt`, textAlign: ALIGN[b.align] ?? "left", fontWeight: b.bold ? 700 : 400, whiteSpace: "pre-wrap" }} />;
    }
    const w = b.cols.reduce((s, x) => s + x, 0);
    return (
      <div key={b.id} className="iso-tblwrap">
        <table className="iso-tbl" style={{ width: `${(Math.min(w, 680) / 680) * 100}%` }}>
          <colgroup>{b.cols.map((x, i) => <col key={i} style={{ width: `${(x / w) * 100}%` }} />)}</colgroup>
          <tbody>{b.rows.map((row, i) => <tr key={i}>{row.map(cell)}</tr>)}</tbody>
        </table>
        {b.addRow && docId && !readOnly && (
          <div className="iso-grow noprint">
            <button type="button" className="btn sm" disabled={pending} onClick={() => grow(b.id, 1)}>+ 줄 추가</button>
            <button type="button" className="btn sm" disabled={pending} onClick={() => grow(b.id, -1)}>− 늘린 줄 빼기</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {docId && !readOnly && <div className="iso-state noprint" aria-live="polite">{pending ? "줄 바꾸는 중…" : state || "칸을 눌러 바로 적으면 자동 저장됩니다"}</div>}
      <div className="iso-page doc-page" style={{ padding: `${sheet.margin.t}px ${sheet.margin.r}px ${sheet.margin.b}px ${sheet.margin.l}px` }}>
        {sheet.blocks.map(block)}
      </div>
    </>
  );
}
