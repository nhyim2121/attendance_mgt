"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { revertEdits, saveEdits, toggleProofCheck } from "./actions";
import { Kinds, rowTone, kindCls } from "./kinds";
import { AttachInline } from "../evidence/forms";
import { PROOF_CHECK_NAME, type Proof } from "@/lib/인사노무/proof";

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
  leaveInfo?: string; // 휴가 사유·시간 (근태 구분 칸에만)
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
  (k === "in_type" || k === "out_type") && v ? (v.startsWith("연장") ? " ty-ot" : v.startsWith("휴일") || v.startsWith("특근") ? " ty-hol" : v.startsWith("조출") ? " ty-early" : "") : "";
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
  // 오늘 줄 표시 (브라우저에서만 계산: 서버와 날짜가 달라 화면이 어긋나지 않게)
  const [today, setToday] = useState("");
  useEffect(() => setToday(new Date().toLocaleDateString("sv-SE")), []);

  // 보기 방식 (2026-11-23): 표 보기(지금) / 달력 보기(날짜를 누르면 오른쪽 입력판). 고른 보기는 이 브라우저에 기억
  const [view, setView] = useState<"table" | "cal">("table");
  useEffect(() => { try { if (localStorage.getItem("edit-view") === "cal") setView("cal"); } catch { /* 저장소를 못 쓰면 표 보기 */ } }, []);
  const pickView = (v: "table" | "cal") => { setView(v); try { localStorage.setItem("edit-view", v); } catch { /* 무시 */ } };
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
      <div className="ed-views" role="tablist" aria-label="보기 방식">
        <button type="button" role="tab" aria-selected={view === "table"} className={view === "table" ? "on" : ""} onClick={() => pickView("table")}>표 보기</button>
        <button type="button" role="tab" aria-selected={view === "cal"} className={view === "cal" ? "on" : ""} onClick={() => pickView("cal")}>달력 보기</button>
      </div>
      {view === "cal" && <CalView draft={draft} rows={rows} today={today} employee={employee} staff={staff}
        set={set} changed={(i) => COLS.some(([k]) => changed(i, k))} toggleMate={toggleMate} />}
      {view === "table" && <div className="tbl-wrap">
        <table className="tbl edit ed2">
          <thead>
            <tr>
              <th rowSpan={2} className="c-day">일자</th><th rowSpan={2} className="c-st">상태</th>
              <th colSpan={2} className="grp g-in">출근</th><th colSpan={2} className="grp g-out">퇴근</th>
              {COLS.slice(4).map(([k, l, help]) => <th key={k} rowSpan={2} title={help}>{l}</th>)}
              <th rowSpan={2} className="c-att" title="신청서·증빙 파일. 휴일·연장근무는 신청서를 첨부하면 바로 인정됩니다">첨부</th>
            </tr>
            <tr>
              {COLS.slice(0, 4).map(([k, l, help]) => <th key={k} className={`sub${k === "clock_out" ? " g-start" : ""}`} title={help}>{l.replace(/^(출근|퇴근) /, "")}</th>)}
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => (
              <tr key={r.day} className={`${rowTone(r)} ${kindCls(r)}${COLS.some(([k]) => changed(i, k)) ? " changed" : ""}${r.day === today ? " today" : ""}${r.wd === "월" && i > 0 ? " ed-wk" : ""}`}>
                <td className={`c-day${r.wd === "일" || r.holiday ? " sun" : r.wd === "토" ? " sat" : ""}`}>
                  <b>{Number(r.day.slice(8))}</b><span>{r.wd}</span>
                </td>
                <td className="c-st">
                  <div className="st-line"><Kinds r={r} />
                    {!rows[i]?.proof?.missing.length && rows[i]?.proof?.need.length ? <span className="st-proof ok" title="신청서 확인됨">✓ 인정</span> : null}
                  </div>
                </td>
                {COLS.map(([k]) => (
                  <td key={k} className={`c-${k}${k === "clock_out" ? " g-start" : ""}`}>
                    <div className={k === "note" ? "row mates-cell" : ""} style={k === "note" ? { gap: 2, flexWrap: "nowrap" } : undefined}>
                      <input type="text" value={String(r[k])} onChange={(e) => set(i, k, e.target.value)}
                        placeholder="" /* 입력칸에는 직접 입력한 값만 (자동 값은 인쇄에만) */
                        title={r.fromRep?.includes(k) && !changed(i, k) ? "일일 근태 보고서에서 가져온 값 (고쳐 쓰면 근태 기입 값으로 저장)" : undefined}
                        className={`${(k === "clock_in" || k === "clock_out") && !TIME_RE.test(String(r[k]).trim()) ? "bad" : ""}${typeClass(k, String(r[k]))}${r.fromRep?.includes(k) && !changed(i, k) ? " from-rep" : ""}`} />
                      {k === "note" && staff.length > 0 && (
                        <details className="pop">
                          <summary className="ed-icon" title="같이 연장·휴일·출장 근무한 직원 고르기">＋</summary>
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
                <td className="c-att" title={r.edited ? `최근 수정: ${r.edited}` : undefined}><AttachCell employee={employee} day={r.day} proof={rows[i]?.proof} files={rows[i]?.files ?? []} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
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

/** 첨부 칸: 그날 첨부한 신청서·증빙 + 바로 첨부. 휴일·연장근무는 신청서가 없으면 '미인정'.
 *  (2026-11-19) 파일 없이 [☐ 휴일근무 신청서] 를 누르면 '신청서 있음'으로 체크되어 바로 인정, ✓를 다시 누르면 풀린다. */
function AttachCell({ employee, day, proof, files }: { employee: string; day: string; proof?: Proof; files: { id: number; fileName: string; type: string }[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const miss = proof?.missing ?? [];
  const flip = (kind: string) => start(async () => {
    const r = await toggleProofCheck(employee, day, kind);
    if (r.error) alert(r.error);
    router.refresh();
  });
  const checks = files.filter((f) => f.fileName === PROOF_CHECK_NAME);
  return (
    <div className="proof">
      {checks.map((f) => (
        <button key={f.id} type="button" className="proof-chk on" disabled={busy} onClick={() => flip(f.type)} title="누르면 체크를 풉니다">✓ {f.type} 신청서</button>
      ))}
      {files.filter((f) => f.fileName !== PROOF_CHECK_NAME).map((f) => (
        <a key={f.id} className="proof-file" href={`/api/attachment/${f.id}`} target="_blank" rel="noreferrer" title={`${f.type} · ${f.fileName}`}>📎 {f.type}</a>
      ))}
      {miss.map((k) => (
        <button key={k} type="button" className="proof-chk" disabled={busy} onClick={() => flip(k)} title="신청서를 받았으면 누르세요 (파일 첨부 없이 인정)">☐ {k} 신청서</button>
      ))}
      <AttachInline name={employee} type={miss[0] ?? (proof?.need[0] ?? "기타")} from={day} to={day} title={miss[0] ? `${miss[0]} 신청서` : "근태 증빙"}
        label="📎" />
    </div>
  );
}

/** 달력 보기 (2026-11-23 B안): 왼쪽 달력(근태 구분·출퇴근·신청서/퇴근 없음 표시) + 오른쪽 그날 입력판.
 *  표 보기와 같은 입력값(draft)과 자동 저장을 쓴다. */
const WD = ["월", "화", "수", "목", "금", "토", "일"];
const FULL_LEAVE = ["연차", "월차", "공가", "경조휴가", "병가"];
const noOutOf = (r: EditRow) => !!r.clock_in && !r.clock_out && !r.kinds.some((k) => FULL_LEAVE.includes(k));
const needs = (r: EditRow) => !!r.proof?.missing.length || noOutOf(r);
function CalView({ draft, rows, today, employee, staff, set, changed, toggleMate }: {
  draft: EditRow[]; rows: EditRow[]; today: string; employee: string; staff: string[];
  set: (i: number, k: keyof EditRow, v: string) => void; changed: (i: number) => boolean; toggleMate: (i: number, name: string) => void;
}) {
  const [sel, setSel] = useState(() => {
    const f = rows.findIndex(needs);
    const t = rows.findIndex((x) => x.day === new Date().toLocaleDateString("sv-SE"));
    return f >= 0 ? f : t >= 0 ? t : 0;
  });
  if (!draft.length) return null;
  const r = draft[sel] ?? draft[0];
  const lead = Math.max(0, WD.indexOf(draft[0].wd));
  const hm = (t: string) => t.slice(0, 5);
  // 이번 달에 쓴 근무지 (자주 쓰는 순) → 빠른 버튼
  const count = new Map<string, number>();
  for (const x of draft) if (x.place.trim()) count.set(x.place.trim(), (count.get(x.place.trim()) ?? 0) + 1);
  const places = [...count].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 5);
  const nextNeed = () => {
    for (let j = sel + 1; j < draft.length; j++) if (needs(rows[j] ?? draft[j]) || draft[j].kinds.length) return j;
    return Math.min(sel + 1, draft.length - 1);
  };
  const field = (k: keyof EditRow, label: string, ph = "", wide = false) => (
    <label className={`ed-cal-f${wide ? " wide" : ""}`}><span>{label}</span>
      <input type="text" value={String(r[k])} placeholder={ph} onChange={(e) => set(sel, k, e.target.value)}
        className={(k === "clock_in" || k === "clock_out") && !TIME_RE.test(String(r[k]).trim()) ? "bad" : ""} /></label>
  );
  const chip = (k: keyof EditRow, v: string) => (
    <button key={v} type="button" className={`ed-chip${String(r[k]).trim() === v ? " on" : ""}`} onClick={() => set(sel, k, String(r[k]).trim() === v ? "" : v)}>{v}</button>
  );
  return (
    <div className="ed-cal">
      <div className="ed-cal-grid">
        {WD.map((w) => <div key={w} className={`ed-cal-wd${w === "토" ? " sat" : w === "일" ? " sun" : ""}`}>{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
        {draft.map((d, i) => {
          const base = rows[i] ?? d;
          const miss = base.proof?.missing ?? [];
          const ok = !miss.length && !!base.proof?.need.length;
          return (
            <button key={d.day} type="button" onClick={() => setSel(i)}
              className={`ed-cal-day ${rowTone(d)}${i === sel ? " sel" : ""}${d.day === today ? " today" : ""}${changed(i) ? " changed" : ""}`}>
              <b className={d.wd === "일" || d.holiday ? "sun" : d.wd === "토" ? "sat" : ""}>{+d.day.slice(8)}</b>
              {d.kinds.length > 0 && <span className="ed-cal-k">{d.kinds.join(" · ")}</span>}
              {(d.clock_in || d.clock_out) && <span className="ed-cal-t">{hm(d.clock_in) || "?"} → {d.clock_out ? hm(d.clock_out) : <b className="red">?</b>}</span>}
              {miss.length > 0 && <span className="ed-cal-miss">● 신청서 없음</span>}
              {!miss.length && noOutOf(d) && <span className="ed-cal-miss">● 퇴근 없음</span>}
              {ok && <span className="ed-cal-ok">✓ 신청서</span>}
            </button>
          );
        })}
      </div>
      <div className="ed-cal-panel">
        <div className="ed-cal-head">
          <b>{+r.day.slice(5, 7)}월 {+r.day.slice(8)}일 ({r.wd})</b>
          <Kinds r={r} />
        </div>
        <div className="ed-cal-two">{field("clock_in", "출근 시각", "08:30")}{field("clock_out", "퇴근 시각", "17:30")}</div>
        <div className="ed-cal-two">{field("in_type", "출근 근무형태", r.inAuto || "예: 조출(08:00)")}{field("out_type", "퇴근 근무형태", r.outAuto || "예: 연장(20:00)")}</div>
        {(r.inAuto || r.outAuto) && !r.in_type && !r.out_type && (
          <p className="caption" style={{ margin: "-4px 0 0" }}>근무형태를 비워 두면 자동 값({[r.inAuto, r.outAuto].filter(Boolean).join(" ~ ")})으로 인쇄됩니다.</p>)}
        <div className="ed-cal-f wide"><span>근무지</span>
          {places.length > 0 && <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>{places.map((p) => chip("place", p))}</div>}
          <input type="text" value={r.place} placeholder={r.placeHint || "직접 적기"} onChange={(e) => set(sel, "place", e.target.value)} />
        </div>
        {staff.length > 0 && (
          <div className="ed-cal-f wide"><span>같이 근무한 사람 <small className="muted">(고른 사람의 같은 날에도 함께 저장)</small></span>
            <div className="mates-grid">
              {staff.filter((n) => n !== employee).map((n) => (
                <label key={n}><input type="checkbox" checked={splitNote(r.note).includes(n)} onChange={() => toggleMate(sel, n)} />{n}</label>
              ))}
            </div>
          </div>
        )}
        {field("work", "업무내용", r.workHint || "그날 한 업무", true)}
        <div className="ed-cal-f wide"><span>신청서 · 증빙</span>
          <AttachCell employee={employee} day={r.day} proof={rows[sel]?.proof} files={rows[sel]?.files ?? []} />
        </div>
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          <button type="button" className="btn" disabled={sel === 0} onClick={() => setSel(sel - 1)}>‹ 전날</button>
          <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => setSel(nextNeed())}>다음 볼 날 ›</button>
        </div>
        <p className="caption" style={{ margin: 0 }}>적은 내용은 잠시 뒤 자동 저장됩니다 (아래 저장 버튼도 그대로).</p>
      </div>
    </div>
  );
}
