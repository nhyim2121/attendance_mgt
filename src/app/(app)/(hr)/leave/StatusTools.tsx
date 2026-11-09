"use client";

/** 연차 현황 표의 행 도구: 내역(휴가 기록 추가·수정·삭제)과 하이웍스 숫자 직접 수정. */
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  deleteHwRowAction, grantLeaveAction, type LeaveInput, type LeaveRef, removeLeaveAction, restoreLeaveAction, saveHwRowAction, saveLeaveAction,
} from "./actions";

type Res = { ok?: string; error?: string } | null;
const Msg = ({ r }: { r: Res }) => (r ? <div className={`msg ${r.ok ? "ok" : "err"}`} style={{ margin: "6px 0" }}>{r.ok ?? r.error}</div> : null);
const n4 = (x: number) => String(Math.round(x * 10000) / 10000);
const dayText = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8)}(${"일월화수목금토"[new Date(`${d}T00:00:00`).getDay()]})`;
const srcText = (s: string) => (s === "사이트" ? "일일 근태 보고서" : s === "휴가관리" ? "휴가 등록" : s === "하이웍스 결재" ? "하이웍스 결재" : "근태현황 파일");

export interface ItemView { day: string; type: string; applied?: string; days: number; hours: number; content: string; src: string; planned: boolean }
export interface HiddenView { key: string; day: string; type: string; content: string; src: string; by: string }

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Res>(null);
  const run = (fn: () => Promise<Res>, after?: () => void) => start(async () => {
    const r = await fn();
    setMsg(r);
    if (r?.ok) { after?.(); router.refresh(); }
  });
  return { pending, msg, run };
}

/** - 1 + 숫자 칸 (하이웍스 생성 칸 모양) */
export function Stepper({ value, step, min, max, onChange, disabled, width = 64 }: {
  value: number; step: number; min?: number; max?: number; onChange: (n: number) => void; disabled?: boolean; width?: number;
}) {
  const [text, setText] = useState(n4(value));
  const [last, setLast] = useState(value);
  if (value !== last) { setLast(value); setText(n4(value)); }
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(n * 10000) / 10000));
  return (
    <span className="stepper">
      <button type="button" disabled={disabled || (min !== undefined && value <= min)} onClick={() => onChange(clamp(value - step))}>−</button>
      <input type="text" inputMode="decimal" style={{ width }} value={text} disabled={disabled}
        onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(clamp(n)); }}
        onBlur={() => setText(n4(value))} />
      <button type="button" disabled={disabled || (max !== undefined && value >= max)} onClick={() => onChange(clamp(value + step))}>+</button>
    </span>
  );
}

/** 시작일부터 근무일 n개째 날 */
function nthWorkday(start: string, n: number, off: Set<string>): string {
  let d = new Date(`${start}T00:00:00Z`), left = Math.max(1, Math.round(n));
  for (let i = 0; i < 400; i++) {
    const s = d.toISOString().slice(0, 10);
    if (!off.has(s) && --left === 0) return s;
    d = new Date(d.getTime() + 86400000);
  }
  return start;
}
const FIXED: Record<string, number> = { 반차: 0.5, 반반차: 0.25 };

/** 휴가 한 건 입력 칸 (추가·수정 공용): 종류 · 날짜 · 일수(− + 버튼) · 비고 */
function LeaveEditor({ init, types, ranges, pending, onSave, onCancel, label, offDays, hoursPerDay }: {
  init: { type: string; start: string; days: number; reason: string; name: string }; types: string[]; ranges: string[]; pending: boolean; label: string;
  onSave: (v: LeaveInput) => void; onCancel: () => void; offDays: Set<string>; hoursPerDay: number;
}) {
  const [type, setType] = useState(init.type);
  const [start, setStart] = useState(init.start);
  const [reason, setReason] = useState(init.reason);
  const range = ranges.includes(type);
  const step = type === "외출" ? 0.5 / hoursPerDay : 1;
  const [days, setDays] = useState(init.days);
  const value = FIXED[type] ?? days;
  const end = range ? nthWorkday(start, days, offDays) : start;
  const changeType = (t: string) => {
    setType(t);
    if (t === "외출") setDays((d) => (d > 0 && d < 4 / hoursPerDay ? d : 1 / hoursPerDay));
    else if (ranges.includes(t)) setDays((d) => (d >= 1 ? Math.round(d) : 1));
  };
  const save = () => onSave({
    name: init.name, type, start, end, startTime: "", endTime: "", reason,
    hours: type === "외출" ? Math.round(days * hoursPerDay * 2) / 2 : undefined,
  });
  return (
    <div className="row end" style={{ gap: 8, flexWrap: "wrap", background: "#f5f8ff", padding: 8, borderRadius: 6 }}>
      <label className="field">종류
        <select value={type} onChange={(e) => changeType(e.target.value)}>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="field">{range ? "시작일" : "날짜"}<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label className="field">일수
        <Stepper value={value} step={step} disabled={type in FIXED} onChange={setDays}
          min={type === "외출" ? step : 1} max={type === "외출" ? 3.5 / hoursPerDay : 60} /></label>
      <span className="caption" style={{ margin: 0, paddingBottom: 8, minWidth: 90 }}>
        {type === "외출" ? `= ${n4(days * hoursPerDay)}시간` : range && days > 1 ? `~ ${dayText(end)}` : type in FIXED ? "고정" : ""}</span>
      <label className="field" style={{ flex: 1, minWidth: 140 }}>비고<input type="text" placeholder="내용을 입력하세요" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <button type="button" className="btn sm primary" disabled={pending} onClick={save}>{label}</button>
      <button type="button" className="btn sm" disabled={pending} onClick={onCancel}>취소</button>
    </div>
  );
}

/** 사유 칸에서 시각·시간 글자를 뺀다 (일수 칸으로 다시 넣으므로) */
const plainReason = (c: string) => c.split("\n")[0].replace(/\(?\s*\d{1,2}:\d{2}\s*[~\-]\s*\d{1,2}:\d{2}\s*\)?|\(?\s*(외출\s*)?\d+(\.\d+)?\s*시간(\s*\d+\s*분)?\s*\)?|\(?\s*\d+\s*분\s*\)?/g, "").replace(/\s+/g, " ").trim();

/** '내역' 팝업: 휴가 기록을 보고 고치고 지우고 더한다 */
export function LeaveItems({ name, title, note, items, hidden, types, ranges, today, offDays, hoursPerDay }: {
  name: string; title: string; note: string; items: ItemView[]; hidden: HiddenView[]; types: string[]; ranges: string[]; today: string;
  offDays: string[]; hoursPerDay: number;
}) {
  const { pending, msg, run } = useRun();
  const [edit, setEdit] = useState<number | "new" | null>(null);
  const off = useMemo(() => new Set(offDays), [offDays]);
  const common = { types, ranges, pending, offDays: off, hoursPerDay, onCancel: () => setEdit(null) };
  const refOf = (it: ItemView): LeaveRef => ({ name, day: it.day, type: it.applied || it.type, content: it.content, src: it.src });
  return (
    <details className="pop">
      <summary className="btn sm">내역</summary>
      <div className="pop-body" style={{ minWidth: 640 }}>
        <b>{title}</b>
        <p className="caption" style={{ margin: "4px 0 8px" }}>{note}</p>
        <Msg r={msg} />
        <table className="tbl"><thead><tr><th>일자</th><th>유형</th><th className="num">차감</th><th>내용</th><th>출처</th><th /></tr></thead>
          <tbody>{items.map((it, i) => edit === i ? (
            <tr key={i}><td colSpan={6}>
              <LeaveEditor label="고치기" {...common}
                init={{ name, type: it.type === "외출" ? "외출" : it.applied || it.type, start: it.day, reason: plainReason(it.content),
                  days: it.type === "외출" ? (it.hours || 1) / hoursPerDay : 1 }}
                onSave={(v) => run(() => saveLeaveAction(refOf(it), v), () => setEdit(null))} />
            </td></tr>
          ) : (
            <tr key={i} className={it.planned ? "planned" : ""}>
              <td>{dayText(it.day)}</td>
              <td>{it.type}{it.applied && it.applied !== it.type && <span className="muted"> ({it.applied} 신청)</span>}</td>
              <td className="num">{it.days ? n4(it.days) : ""}</td>
              <td>{it.content.split("\n")[0]}{it.type === "외출" && it.hours ? ` (${it.hours}h)` : ""}</td>
              <td className="muted">{srcText(it.src)}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn sm" disabled={pending} onClick={() => setEdit(i)}>수정</button>{" "}
                <button className="btn sm danger" disabled={pending} onClick={() => {
                  if (confirm(`${dayText(it.day)} ${it.applied || it.type} 기록을 지울까요?`)) run(() => removeLeaveAction(refOf(it)));
                }}>삭제</button>
              </td>
            </tr>
          ))}
          {!items.length && <tr><td colSpan={6} className="muted">이 회계연도 휴가 기록이 없습니다.</td></tr>}
          </tbody></table>
        <div style={{ marginTop: 8 }}>
          {edit === "new"
            ? <LeaveEditor label="추가" {...common} init={{ name, type: "연차", start: today, days: 1, reason: "" }}
                onSave={(v) => run(() => saveLeaveAction(null, v), () => setEdit(null))} />
            : <button className="btn sm" onClick={() => setEdit("new")}>+ 휴가 추가</button>}
        </div>
        {hidden.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <b style={{ fontSize: 13 }}>지운 기록 {hidden.length}건</b>
            <table className="tbl" style={{ marginTop: 4 }}><tbody>{hidden.map((h) => (
              <tr key={h.key} className="muted"><td>{dayText(h.day)}</td><td>{h.type}</td><td>{h.content.split("\n")[0]}</td><td>{srcText(h.src)}</td><td>{h.by}</td>
                <td><button className="btn sm" disabled={pending} onClick={() => run(() => restoreLeaveAction(h.key))}>되살리기</button></td></tr>
            ))}</tbody></table>
          </div>
        )}
        <p className="caption" style={{ marginTop: 8, marginBottom: 0 }}>
          고치거나 더한 휴가는 <b>휴가 등록</b>에 들어가고, 근태현황 파일·보고서에서 온 원래 기록은 숨겨집니다 (근태 판정·캘린더·보고서에도 같이 반영).
          지운 기록은 위 목록에서 되살릴 수 있습니다. 위쪽 하이웍스 숫자는 그대로이니, 하이웍스 숫자를 바꾸려면 옆의 <b>숫자 수정</b>을 쓰세요.
        </p>
      </div>
    </details>
  );
}

const USE_TYPES = ["연차", "포상", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가"];
const DEDUCT = ["연차", "포상", "월차", "반차", "반반차", "외출"];

/** 하이웍스 숫자(생성·유형별 사용·잔여) 직접 수정. 하이웍스 줄이 없으면 사이트 계산으로 채워 새로 넣는다. */
export function HwEdit({ fy, name, init, isNew, joinDate, exportedAt, edited, hoursPerDay }: {
  fy: number; name: string; isNew: boolean; joinDate: string | null; exportedAt: string; edited: string; hoursPerDay: number;
  init: { grant: { 정기: number; 포상: number; 기타: number }; used: Record<string, number>; remain: number };
}) {
  const { pending, msg, run } = useRun();
  const str = (x: number | undefined) => (x ? n4(x) : "");
  const [g, setG] = useState({ 정기: str(init.grant.정기), 포상: str(init.grant.포상), 기타: str(init.grant.기타) });
  const [u, setU] = useState<Record<string, string>>(Object.fromEntries(USE_TYPES.map((t) => [t, str(init.used[t])])));
  const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const granted = num(g.정기) + num(g.포상) + num(g.기타);
  const auto = Math.round((granted - DEDUCT.reduce((t, k) => t + num(u[k]), 0)) * 10000) / 10000;
  const [remain, setRemain] = useState(isNew || Math.abs(auto - init.remain) < 0.0001 ? "" : n4(init.remain));
  const bad = [...Object.values(g), ...Object.values(u), remain].some((s) => s.trim() !== "" && !Number.isFinite(Number(s)));
  const save = () => run(() => saveHwRowAction(fy, name, {
    grant: { 정기: num(g.정기), 포상: num(g.포상), 기타: num(g.기타) },
    used: Object.fromEntries(USE_TYPES.map((t) => [t, num(u[t])])), remain: remain.trim() === "" ? null : num(remain), joinDate, exportedAt,
  }));
  const box = (label: string, value: string, on: (s: string) => void, hint?: string) => (
    <label className="field" key={label} title={hint}>{label}<input type="text" inputMode="decimal" size={6} value={value} onChange={(e) => on(e.target.value)} /></label>
  );
  return (
    <details className="pop">
      <summary className="btn sm" title={edited ? `직접 수정: ${edited}` : undefined}>{isNew ? "숫자 넣기" : "숫자 수정"}</summary>
      <div className="pop-body" style={{ minWidth: 520 }}>
        <b>{name} · 하이웍스 숫자 {isNew ? "넣기" : "수정"}</b>
        <p className="caption" style={{ margin: "4px 0 8px" }}>
          {isNew ? "하이웍스 파일에 없는 직원입니다. 사이트 계산으로 채워 두었으니 하이웍스 숫자로 고쳐 저장하세요." : "하이웍스 파일에서 온 숫자를 고칩니다."}
          {" "}모두 일 단위입니다 (외출 1시간 = {n4(1 / hoursPerDay)}일). 새 하이웍스 파일을 올리면 고친 숫자는 파일 숫자로 바뀝니다.
          {edited && <> 마지막 수정: {edited}</>}
        </p>
        <Msg r={msg} />
        <div className="caption" style={{ margin: "4px 0 2px", fontWeight: 700 }}>생성 (합계 {n4(granted)}일)</div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {(["정기", "포상", "기타"] as const).map((k) => box(k, g[k], (s) => setG((x) => ({ ...x, [k]: s }))))}
        </div>
        <div className="caption" style={{ margin: "8px 0 2px", fontWeight: 700 }}>사용 (일) · 잔여에서 빼는 것: {DEDUCT.join("·")}</div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {USE_TYPES.map((t) => box(t === "외출" ? `외출${num(u[t]) ? ` (${n4(num(u[t]) * hoursPerDay)}h)` : ""}` : t, u[t], (s) => setU((x) => ({ ...x, [t]: s }))))}
        </div>
        <div className="row end" style={{ gap: 6, marginTop: 8 }}>
          {box("잔여", remain, setRemain, "비우면 생성 − 사용으로 자동 계산")}
          <span className="caption" style={{ margin: 0, paddingBottom: 6 }}>비우면 자동: <b>{n4(auto)}</b>일</span>
          <span className="spacer" />
          <button className="btn sm primary" disabled={pending || bad} onClick={save}>저장</button>
          {!isNew && <button className="btn sm danger" disabled={pending} onClick={() => {
            if (confirm(`${name}의 하이웍스 숫자를 지우고 사이트 계산으로 보이게 할까요?`)) run(() => deleteHwRowAction(fy, name));
          }}>삭제</button>}
        </div>
        {bad && <div className="msg err" style={{ marginTop: 6 }}>숫자만 넣어 주세요.</div>}
      </div>
    </details>
  );
}

const GRANT_TYPES = ["연차", "포상", "월차"] as const;

/** 휴가 생성 창 (하이웍스 '휴가 생성'과 같은 모양): 종류 · 현재 · 생성(− +) · 비고 */
export function GrantEdit({ fy, name, range, current }: {
  fy: number; name: string; range: string; current: Record<(typeof GRANT_TYPES)[number], number>;
}) {
  const { pending, msg, run } = useRun();
  const empty = () => Object.fromEntries(GRANT_TYPES.map((t) => [t, { days: 0, note: "" }])) as Record<string, { days: number; note: string }>;
  const [v, setV] = useState(empty);
  const set = (t: string, p: Partial<{ days: number; note: string }>) => setV((x) => ({ ...x, [t]: { ...x[t], ...p } }));
  return (
    <details className="pop">
      <summary className="btn sm">생성</summary>
      <div className="pop-body" style={{ minWidth: 520 }}>
        <b>{name} · 휴가 생성</b>
        <p className="caption" style={{ margin: "4px 0 8px" }}>휴가 적용기준: {range}</p>
        <Msg r={msg} />
        <table className="tbl grant-tbl">
          <thead><tr><th>종류</th><th className="num">현재</th><th style={{ textAlign: "center" }} title="더할 일수 (− 로 줄이기)">생성</th><th>비고</th></tr></thead>
          <tbody>{GRANT_TYPES.map((t) => (
            <tr key={t}>
              <td>{t}</td><td className="num">{n4(current[t])}</td>
              <td style={{ textAlign: "center" }}><Stepper value={v[t].days} step={1} min={-60} max={60} onChange={(n) => set(t, { days: n })} /></td>
              <td><input type="text" placeholder="내용을 입력하세요" value={v[t].note} onChange={(e) => set(t, { note: e.target.value })} style={{ width: "100%" }} /></td>
            </tr>
          ))}</tbody>
        </table>
        <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 10 }}>
          <button type="button" className="btn" disabled={pending} onClick={() => setV(empty())}>취소</button>
          <button type="button" className="btn primary" disabled={pending || GRANT_TYPES.every((t) => !v[t].days)}
            onClick={() => run(() => grantLeaveAction(fy, name, GRANT_TYPES.map((t) => ({ type: t, days: v[t].days, note: v[t].note }))), () => setV(empty()))}>저장</button>
        </div>
        <p className="caption" style={{ marginTop: 8, marginBottom: 0 }}>
          저장하면 <b>연차 조정</b>에 &apos;○○ 생성&apos;으로 남고 총 부여·잔여에 더해집니다 (하이웍스 숫자를 쓰는 중이면 그 숫자도 같이 늘어남).
          잘못 넣었으면 휴가 등록·설정 &gt; 연차 조정에서 지우세요. 입사 1년 미만 월차는 매달 자동으로 생기므로 따로 넣지 않아도 됩니다.
        </p>
      </div>
    </details>
  );
}
