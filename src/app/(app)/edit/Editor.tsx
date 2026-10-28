"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { revertEdits, saveEdits } from "./actions";

export interface EditRow {
  day: string;
  wd: string;
  status: string;
  clock_in: string;
  in_type: string;
  clock_out: string;
  out_type: string;
  place: string;
  note: string;
  edited: string; // 최근 수정 (수정자 MM-DD HH:MM)
}

const COLS: [keyof EditRow, string, string][] = [
  ["clock_in", "출근 시각", "예: 08:00 또는 08:00:00. 비우면 기록 없음"],
  ["in_type", "출근 근무형태", "예: 조출(08:00), 정상출근(08:30)"],
  ["clock_out", "퇴근 시각", "예: 18:30"],
  ["out_type", "퇴근 근무형태", "예: 연장(20:00), 휴일(17:30)"],
  ["place", "근무지", ""],
  ["note", "비고", ""],
];
const TIME_RE = /^$|^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export default function Editor({ employee, rows }: { employee: string; rows: EditRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(rows);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [revert, setRevert] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const changed = (i: number, k: keyof EditRow) => draft[i][k].trim() !== rows[i][k].trim();
  const changes = draft.map((r, i) => {
    const ch: Record<string, string> = {};
    for (const [k] of COLS) if (changed(i, k)) ch[k] = r[k].trim();
    return Object.keys(ch).length ? { employee, day: r.day, ...ch } : null;
  }).filter((x) => x !== null);
  const bad = draft.flatMap((r) => (["clock_in", "clock_out"] as const).filter((k) => !TIME_RE.test(r[k].trim()))
    .map((k) => `${r.day} ${r[k]}`));
  const edited = rows.filter((r) => r.edited);

  const set = (i: number, k: keyof EditRow, v: string) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) => start(async () => {
    const r = await fn();
    setMsg(r);
    if (r.ok) router.refresh();
  });

  return (
    <>
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}
      {msg?.error && <div className="msg err">{msg.error}</div>}
      {bad.length > 0 && <div className="msg err">시각 형식이 맞지 않습니다 (HH:MM): {bad.join(", ")}</div>}
      <div className="tbl-wrap">
        <table className="tbl edit">
          <thead><tr>
            <th>일자</th><th>요일</th><th>상태</th>
            {COLS.map(([k, l, help]) => <th key={k} title={help}>{l}</th>)}
            <th>최근 수정</th>
          </tr></thead>
          <tbody>
            {draft.map((r, i) => (
              <tr key={r.day} className={COLS.some(([k]) => changed(i, k)) ? "changed" : ""}>
                <td className="ro">{r.day}</td><td className="ro">{r.wd}</td><td className="ro">{r.status}</td>
                {COLS.map(([k]) => (
                  <td key={k} style={{ minWidth: k === "place" || k === "note" ? 160 : 96 }}>
                    <input type="text" value={r[k]} onChange={(e) => set(i, k, e.target.value)}
                      className={(k === "clock_in" || k === "clock_out") && !TIME_RE.test(r[k].trim()) ? "bad" : ""} />
                  </td>
                ))}
                <td className="ro">{r.edited}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={pending || !changes.length || bad.length > 0}
          onClick={() => run(() => saveEdits(changes as Parameters<typeof saveEdits>[0]))}>
          저장 ({changes.length}일 변경)
        </button>
        <button className="btn" disabled={pending || !changes.length} onClick={() => setDraft(rows)}>편집 취소</button>
        <details className="pop left">
          <summary className="btn" aria-disabled={!edited.length}>수정 되돌리기</summary>
          {edited.length > 0 && (
            <div className="pop-body stack" style={{ gap: 6 }}>
              <span className="caption" style={{ margin: 0 }}>원래 값(캡스·하이웍스)으로 되돌릴 날짜</span>
              {edited.map((r) => (
                <label key={r.day} className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={revert.includes(r.day)}
                    onChange={(e) => setRevert((v) => (e.target.checked ? [...v, r.day] : v.filter((x) => x !== r.day)))} />
                  {r.day} ({r.wd}) <span className="muted">{r.edited}</span>
                </label>
              ))}
              <div><button className="btn danger" disabled={pending || !revert.length}
                onClick={() => run(() => revertEdits(employee, revert))}>되돌리기</button></div>
            </div>
          )}
        </details>
      </div>
    </>
  );
}
