"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { revertEdits, saveEdits } from "./actions";
import { Kinds, rowTone } from "./kinds";
import { AttachInline } from "../evidence/forms";
import type { Proof } from "@/lib/인사노무/proof";

export interface EditRow {
  day: string;
  wd: string;
  status: string;
  clock_in: string;
  in_type: string;
  clock_out: string;
  out_type: string;
  place: string;
  note: string; // 인원
  work: string; // 업무내용 (조출·휴일·출장 등)
  work_ot: string; // 연장 업무내용
  workHint: string; // 하이웍스·보고서의 사유 (업무내용이 비었을 때 회색으로)
  placeHint: string; // 보고서·하이웍스에서 자동으로 채워지는 근무지 (회색 안내)
  noteHint: string; // 자동으로 채워지는 같이 간 사람 (인쇄에만 씀)
  inAuto: string; // 자동 계산된 출근 근무형태 (인쇄에만 씀)
  fromRep?: string[]; // 일일 근태 보고서에서 가져온 칸 (파란 글씨)
  outAuto: string; // 자동 계산된 퇴근 근무형태 (인쇄에만 씀)
  kinds: string[]; // 근태 구분: 휴가·출장 종류 + 휴일근무·연장근무
  holiday: boolean;
  edited: string; // 최근 수정 (수정자 MM-DD HH:MM)
  proof?: Proof; // 휴일·연장근무 신청서 확인 (2026-11부터)
  files?: { id: number; fileName: string; type: string }[]; // 그날 첨부 (신청서·증빙)
}

const COLS: [keyof EditRow, string, string][] = [
  ["clock_in", "출근 시각", "예: 08:00 또는 08:00:00. 비우면 기록 없음"],
  ["in_type", "출근 근무형태", "예: 조출(08:00), 정상출근(08:30)"],
  ["clock_out", "퇴근 시각", "예: 18:30"],
  ["out_type", "퇴근 근무형태", "예: 연장(20:00), 휴일(17:30)"],
  ["place", "근무지", ""],
  ["note", "인원", "같이 근무한 직원 ([+ 인원]으로 고르기)"],
  ["work", "업무내용", "조출·휴일근무·출장 등 그날 한 업무. 비우면 하이웍스·보고서의 사유가 회색으로 보입니다"],
];
const typeClass = (k: string, v: string) =>
  (k === "in_type" || k === "out_type") && v ? (v.startsWith("연장") ? " ty-ot" : v.startsWith("휴일") ? " ty-hol" : v.startsWith("조출") ? " ty-early" : "") : "";
const TIME_RE = /^$|^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
/** 비고(인원) 칸의 낱말 중 직원 이름 */
const splitNote = (s: string) => s.split(/[\s,·/]+/).map((x) => x.trim()).filter(Boolean);

export default function Editor({ employee, rows, staff = [] }: { employee: string; rows: EditRow[]; staff?: string[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(rows);
  const [base, setBase] = useState(rows); // 마지막으로 저장한 값 (자동 저장 기준)
  const [autoAt, setAutoAt] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [revert, setRevert] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const changed = (i: number, k: keyof EditRow) => String(draft[i][k]).trim() !== String(base[i][k]).trim();
  const changes = draft.map((r, i) => {
    const ch: Record<string, string> = {};
    for (const [k] of COLS) if (changed(i, k)) ch[k] = String(r[k]).trim();
    if (!Object.keys(ch).length) return null;
    // 인원을 바꿨으면 같이 일한 사람에게도 같은 근무지·인원을 넣는다
    const mates = "note" in ch ? splitNote(r.note).filter((n) => staff.includes(n) && n !== employee) : [];
    return { employee, day: r.day, ...ch, ...(mates.length ? { mates, place: r.place.trim(), work: r.work.trim(), work_ot: r.work_ot.trim() } : {}) };
  }).filter((x) => x !== null);
  const bad = draft.flatMap((r) => (["clock_in", "clock_out"] as const).filter((k) => !TIME_RE.test(r[k].trim()))
    .map((k) => `${r.day} ${r[k]}`));
  const edited = rows.filter((r) => r.edited);

  const set = (i: number, k: keyof EditRow, v: string) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  // 인원 체크: 비고 칸의 이름 목록에 넣고 뺀다 (이름이 아닌 글은 그대로 둔다)
  const toggleMate = (i: number, name: string) => {
    const words = splitNote(draft[i].note);
    const has = words.includes(name);
    const names = words.filter((w) => staff.includes(w));
    const rest = words.filter((w) => !staff.includes(w));
    const next = has ? names.filter((n) => n !== name) : [...names, name];
    set(i, "note", [...staff.filter((s) => next.includes(s)), ...rest].join(" "));
  };
  // 저장·되돌리기 버튼은 서버 값으로 다시 채운다. 자동 저장은 화면을 그대로 둔다 (입력 중 커서가 튕기지 않게)
  const reload = useRef(false);
  useEffect(() => {
    if (!reload.current) return;
    reload.current = false;
    setDraft(rows);
    setBase(rows);
    setRevert([]);
  }, [rows]);
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) => start(async () => {
    reload.current = true;
    const r = await fn();
    setMsg(r);
    if (r.ok) router.refresh();
    else reload.current = false;
  });

  // 자동 저장: 입력을 멈추고 1.5초 뒤 바뀐 날만 저장 (화면은 그대로)
  const autoSave = () => start(async () => {
    const snap = draft;
    const r = await saveEdits(changes as Parameters<typeof saveEdits>[0]);
    if (r.ok) {
      setBase(snap);
      setAutoAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
      if (r.ok.includes("같이 근무한")) setMsg(r);
    } else setMsg(r);
  });
  useEffect(() => {
    if (!changes.length || bad.length || pending) return;
    const t = setTimeout(autoSave, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

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
            <th title="신청서·증빙 파일. 휴일·연장근무는 신청서를 첨부하면 바로 인정됩니다">첨부</th>
          </tr></thead>
          <tbody>
            {draft.map((r, i) => (
              <tr key={r.day} className={`${rowTone(r)}${COLS.some(([k]) => changed(i, k)) ? " changed" : ""}`}>
                <td className="ro">{r.day.slice(5)}</td><td className={`ro${r.holiday ? " hol" : ""}`}>{r.wd}</td>
                <td className="ro"><Kinds r={r} />{rows[i]?.proof?.missing.length ? <div className="proof-miss"><b>미인정</b></div> : rows[i]?.proof?.need.length ? <div className="proof-ok">✅ 인정</div> : null}</td>
                {COLS.map(([k]) => (
                  <td key={k} style={{ minWidth: k === "place" ? 150 : k === "note" ? 200 : k === "work" || k === "work_ot" ? 200 : 96 }}>
                    <div className={k === "note" ? "row mates-cell" : ""} style={k === "note" ? { gap: 4, flexWrap: "nowrap" } : undefined}>
                      <input type="text" value={String(r[k])} onChange={(e) => set(i, k, e.target.value)}
                        placeholder="" /* 입력칸에는 직접 입력한 값만 (자동 값은 인쇄에만) */
                        title={r.fromRep?.includes(k) && !changed(i, k) ? "일일 근태 보고서에서 가져온 값 (고쳐 쓰면 근태 기입 값으로 저장)" : undefined}
                        className={`${(k === "clock_in" || k === "clock_out") && !TIME_RE.test(String(r[k]).trim()) ? "bad" : ""}${typeClass(k, String(r[k]))}${r.fromRep?.includes(k) && !changed(i, k) ? " from-rep" : ""}`} />
                      {k === "note" && staff.length > 0 && (
                        <details className="pop">
                          <summary className="btn sm" title="같이 연장·휴일·출장 근무한 직원 고르기">+ 인원</summary>
                          <div className="pop-body mates-pop">
                            <b>{r.day} ({r.wd}) 같이 근무한 직원</b>
                            <p className="caption" style={{ margin: "2px 0 8px" }}>고른 직원의 같은 날에도 근무지와 인원이 함께 저장됩니다.</p>
                            <div className="mates-grid">
                              {staff.filter((n) => n !== employee).map((n) => (
                                <label key={n}><input type="checkbox" checked={splitNote(r.note).includes(n)} onChange={() => toggleMate(i, n)} />{n}</label>
                              ))}
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                  </td>
                ))}
                <td className="ro" title={r.edited ? `최근 수정: ${r.edited}` : undefined}><AttachCell employee={employee} day={r.day} proof={rows[i]?.proof} files={rows[i]?.files ?? []} /></td>
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
        <button className="btn" disabled={pending || !changes.length} onClick={() => setDraft(base)}>편집 취소</button>
        {pending ? <span className="muted">저장 중…</span>
          : changes.length ? <span style={{ color: "#e07b00" }}>{bad.length ? "시각 형식을 고치면 자동 저장됩니다." : "잠시 후 자동 저장됩니다…"}</span>
            : autoAt ? <span style={{ color: "#1f8a3b" }}>✓ 자동 저장됨 {autoAt}</span> : null}
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

/** 첨부 칸: 그날 첨부한 신청서·증빙 + 바로 첨부. 휴일·연장근무는 신청서가 없으면 '미인정', 첨부하면 바로 인정. */
function AttachCell({ employee, day, proof, files }: { employee: string; day: string; proof?: Proof; files: { id: number; fileName: string; type: string }[] }) {
  const miss = proof?.missing ?? [];
  return (
    <div className="proof">
      {files.map((f) => (
        <a key={f.id} className="proof-file" href={`/api/attachment/${f.id}`} target="_blank" rel="noreferrer" title={`${f.type} · ${f.fileName}`}>📎 {f.type}</a>
      ))}
      {miss.map((k) => <span key={k} className="proof-miss"><b>⚠ {k} 신청서 없음</b></span>)}
      <AttachInline name={employee} type={miss[0] ?? (proof?.need[0] ?? "기타")} from={day} to={day} title={miss[0] ? `${miss[0]} 신청서` : "근태 증빙"}
        label={miss.length ? "+ 신청서" : "+ 첨부"} />
    </div>
  );
}
