"use client";
/** 기타(내 업무) 화면의 입력 부품: 주간업무일지 편집기 · 업무협조 등록/목록/상태/진행 기록 · 개인일정 등록/끝냄 */
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { type Coop, COOP_DIR, COOP_STATUS, DEPT_COLOR, DEPT_EMOJI, DEPTS, type Plan, PLAN_KINDS, REPEATS, statusTone, WCATS, type WRow } from "@/lib/기타/work";
import { addCoopLog, removeCoop, removePlan, removeWeek, saveCoopForm, savePlanForm, saveWeek, setCoopStatus, togglePlanDone } from "./actions";

type Res = { ok?: string; error?: string } | null;
const Msg = ({ r }: { r: Res }) => (r?.error ? <p className="fd-err">{r.error}</p> : r?.ok ? <p className="u-okmsg">{r.ok}</p> : null);
const rid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blank = (cat = ""): WRow => ({ id: rid(), cat, task: "", prev: "", done: "", pct: 0, next: "", note: "" });

/** 인쇄 단추 */
export function PrintButton({ label = "🖨️ 인쇄" }: { label?: string }) {
  return <button type="button" className="fd-btn" onClick={() => window.print()}>{label}</button>;
}

// ---------------------------------------------------------------- 주간업무일지
export interface Suggest { cat: string; task: string; done: string; from: string }

/** 주간업무일지 편집기: 표에서 바로 고치고 저장. 인쇄하면 결재용 양식 모양으로 나온다. */
export function WeekEditor({ monday, title, range, name, initial, issue0, request0, carried, saved, suggest }: {
  monday: string; title: string; range: string; name: string; initial: WRow[]; issue0: string; request0: string;
  carried: number; saved: string; suggest: Suggest[];
}) {
  const [rows, setRows] = useState<WRow[]>(initial.length ? initial : [blank("총무")]);
  const [issue, setIssue] = useState(issue0);
  const [request, setRequest] = useState(request0);
  const [dirty, setDirty] = useState(false);
  const [res, setRes] = useState<Res>(null);
  const [pending, start] = useTransition();
  const [used, setUsed] = useState<string[]>([]);

  const edit = (i: number, k: keyof WRow, v: string | number) => { setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setDirty(true); };
  const move = (i: number, d: number) => { setRows((rs) => { const a = [...rs]; const j = i + d; if (j < 0 || j >= a.length) return rs; [a[i], a[j]] = [a[j], a[i]]; return a; }); setDirty(true); };
  const drop = (i: number) => { setRows((rs) => rs.filter((_, j) => j !== i)); setDirty(true); };
  const add = (r: WRow = blank(rows[rows.length - 1]?.cat ?? "총무")) => { setRows((rs) => [...rs, r]); setDirty(true); };
  const save = () => start(async () => { const r = await saveWeek(monday, rows, issue, request); setRes(r); if (r?.ok) setDirty(false); });

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); } };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("keydown", key); };
  });
  const avg = rows.length ? Math.round(rows.reduce((t, r) => t + r.pct, 0) / rows.length) : 0;
  const filled = rows.filter((r) => r.task.trim());

  return (
    <>
      <div className="wk-edit noprint">
        {carried > 0 && !saved && <p className="wk-carry">📥 지난주 일지에서 <b>{carried}건</b>을 불러왔습니다. 지난주에 적은 &lsquo;차주 계획&rsquo;이 <b>이번 주 계획</b> 칸에 들어가 있어요. 실적만 채우고 저장하세요.</p>}
        <div className="wk-scroll">
          <table className="wk-t">
            <thead><tr><th className="c-cat">구분</th><th className="c-task">업무</th><th className="c-prev">이번 주 계획</th><th className="c-done">금주 실적</th><th className="c-pct">진행률</th><th className="c-next">차주 계획</th><th className="c-note">비고</th><th className="c-ctl" /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td><input list="wk-cats" value={r.cat} onChange={(e) => edit(i, "cat", e.target.value)} placeholder="구분" /></td>
                  <td><textarea rows={2} value={r.task} onChange={(e) => edit(i, "task", e.target.value)} placeholder="업무명" /></td>
                  <td><textarea rows={2} value={r.prev} onChange={(e) => edit(i, "prev", e.target.value)} placeholder="(지난주 차주 계획)" className="muted" /></td>
                  <td><textarea rows={3} value={r.done} onChange={(e) => edit(i, "done", e.target.value)} placeholder="이번 주에 한 일" /></td>
                  <td className="pct">
                    <select value={r.pct} onChange={(e) => edit(i, "pct", +e.target.value)}>{Array.from({ length: 11 }, (_, k) => k * 10).map((n) => <option key={n} value={n}>{n}%</option>)}</select>
                    <i style={{ ["--p" as string]: `${r.pct}%` }} className={r.pct >= 100 ? "full" : ""} />
                  </td>
                  <td><textarea rows={3} value={r.next} onChange={(e) => edit(i, "next", e.target.value)} placeholder="다음 주에 할 일" /></td>
                  <td><textarea rows={2} value={r.note} onChange={(e) => edit(i, "note", e.target.value)} /></td>
                  <td className="ctl">
                    <button type="button" title="위로" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                    <button type="button" title="아래로" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>▼</button>
                    <button type="button" title="이 줄 지우기" className="x" onClick={() => drop(i)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="wk-cats">{WCATS.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="wk-bar">
          <button type="button" className="fd-btn" onClick={() => add()}>＋ 줄 추가</button>
          <span className="wk-avg">업무 {filled.length}건 · 평균 진행률 <b>{avg}%</b></span>
        </div>

        {suggest.length > 0 && (
          <details className="wk-sug" open={!saved}>
            <summary>🧲 이번 주 기록에서 가져오기 <small>업무협조·개인일정·할 일·입찰에서 찾은 {suggest.length}건 — 누르면 표에 한 줄로 들어갑니다</small></summary>
            <ul>
              {suggest.map((s, i) => {
                const k = `${s.from}${s.task}`;
                return (
                  <li key={i} className={used.includes(k) ? "used" : ""}>
                    <button type="button" disabled={used.includes(k)} onClick={() => { add({ ...blank(s.cat), task: s.task, done: s.done, pct: s.done.includes("완료") ? 100 : 50 }); setUsed((u) => [...u, k]); }}>＋</button>
                    <span className="fd-tag k">{s.from}</span><b>{s.task}</b><small>{s.done}</small>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        <div className="wk-2">
          <label>🚩 문제점·이슈<textarea rows={3} value={issue} onChange={(e) => { setIssue(e.target.value); setDirty(true); }} placeholder="막힌 일, 위험, 결정이 필요한 것" /></label>
          <label>🙋 건의·협조 요청<textarea rows={3} value={request} onChange={(e) => { setRequest(e.target.value); setDirty(true); }} placeholder="다른 부서·윗선에 요청할 것" /></label>
        </div>
        <Msg r={res} />
        <div className="fd-btns wk-save">
          <span className="muted">{dirty ? "● 저장 안 한 내용이 있습니다 (Ctrl+S)" : saved ? `마지막 저장 ${saved.slice(5, 16)}` : ""}</span>
          {saved && <button type="button" className="fd-btn" onClick={() => { if (confirm(`${title} 일지를 지울까요?`)) start(() => removeWeek(monday)); }}>지우기</button>}
          <button type="button" className="fd-btn pri" disabled={pending} onClick={save}>{pending ? "저장하는 중…" : "💾 저장"}</button>
        </div>
      </div>
      <WeekPrint title={title} range={range} name={name} rows={filled} issue={issue} request={request} />
    </>
  );
}

/** 인쇄용 일지 한 장 (화면에서는 안 보임) */
export function WeekPrint({ title, range, name, rows, issue, request, screen = false }: { title: string; range: string; name: string; rows: WRow[]; issue: string; request: string; screen?: boolean }) {
  return (
    <div className={`wk-paper${screen ? " screen" : " only-print"}`}>
      <h2>주간업무일지 <small>{title} ({range})</small></h2>
      <p className="wk-who">작성자 <b>{name}</b></p>
      <table>
        <thead><tr><th style={{ width: "9%" }}>구분</th><th style={{ width: "15%" }}>업무</th><th style={{ width: "18%" }}>이번 주 계획</th><th>금주 실적</th><th style={{ width: "7%" }}>진행률</th><th style={{ width: "20%" }}>차주 계획</th><th style={{ width: "9%" }}>비고</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((r) => (
            <tr key={r.id}><td>{r.cat}</td><td><b>{r.task}</b></td><td>{r.prev}</td><td>{r.done}</td><td className="c">{r.pct}%</td><td>{r.next}</td><td>{r.note}</td></tr>
          )) : <tr><td colSpan={7} className="c">작성한 내용이 없습니다.</td></tr>}
        </tbody>
      </table>
      {(issue || request) && (
        <table className="wk-foot"><tbody>
          {issue && <tr><th>문제점·이슈</th><td>{issue}</td></tr>}
          {request && <tr><th>건의·협조 요청</th><td>{request}</td></tr>}
        </tbody></table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 업무협조
/** 업무협조 등록·고치기 */
export function CoopForm({ c, owners, me, dept0 }: { c?: Coop; owners: string[]; me: string; dept0?: string }) {
  const [res, act, saving] = useActionState(saveCoopForm, null);
  return (
    <form action={act} className="u-bform">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="cp-dir">
        {COOP_DIR.map((d) => <label key={d}><input type="radio" name="dir" value={d} defaultChecked={(c?.dir ?? "받은 요청") === d} /> {d === "받은 요청" ? "📥 받은 요청 (타부서 → 우리)" : "📤 보낸 요청 (우리 → 타부서)"}</label>)}
      </div>
      <div className="g">
        <label>부서 *<select name="dept" defaultValue={c?.dept ?? dept0 ?? "품질"}>{DEPTS.map((d) => <option key={d} value={d}>{DEPT_EMOJI[d]} {d}</option>)}</select></label>
        <label className="w2">협조 내용 *<input name="title" defaultValue={c?.title} required placeholder="예: 11월 출하 거래명세서 발행 요청" /></label>
        <label>상대 담당자<input name="partner" defaultValue={c?.partner} placeholder="예: 품질 이○○ 과장" /></label>
        <label>우리 담당<input name="owner" list="cp-owners" defaultValue={c?.owner ?? me} /><datalist id="cp-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist></label>
        <label>요청일<input type="date" name="asked" defaultValue={c?.asked} /></label>
        <label>기한<input type="date" name="due" defaultValue={c?.due} /></label>
        <label>상태<select name="status" defaultValue={c?.status ?? "접수"}>{COOP_STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="ck"><input type="checkbox" name="prio" value="긴급" defaultChecked={c?.prio === "긴급"} /> 🔥 긴급</label>
        <label className="w2">자세한 내용<textarea name="detail" rows={3} defaultValue={c?.detail} placeholder="필요한 자료, 수량, 받을 곳 등" /></label>
        <label className="w2">처리 결과<textarea name="result" rows={2} defaultValue={c?.result} placeholder="끝나면 어떻게 처리했는지" /></label>
      </div>
      <Msg r={res} />
      <div className="fd-btns"><button className="fd-btn pri" disabled={saving}>{saving ? "저장하는 중…" : c ? "고친 내용 저장" : "＋ 업무협조 등록"}</button></div>
    </form>
  );
}

/** 상태 단추 */
export function CoopStatusBar({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div className={`u-stages${pending ? " busy" : ""}`}>
      {COOP_STATUS.map((s) => <button key={s} type="button" className={s === status ? "on" : ""} disabled={pending || s === status} onClick={() => start(() => setCoopStatus(id, s))}>{s}</button>)}
    </div>
  );
}

/** 진행 기록 (댓글처럼 한 줄씩) */
export function CoopLogBox({ id, log }: { id: string; log: Coop["log"] }) {
  const [t, setT] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="cp-log">
      <ul>{[...log].reverse().map((l, i) => <li key={i}><small>{l.at.slice(5, 16)} · {l.by}</small>{l.text}</li>)}</ul>
      <form onSubmit={(e) => { e.preventDefault(); if (t.trim()) start(async () => { await addCoopLog(id, t); setT(""); }); }}>
        <input value={t} onChange={(e) => setT(e.target.value)} placeholder="진행 상황 한 줄 (예: 품질팀 회신 받음, 내일 자료 전달)" />
        <button className="fd-btn pri" disabled={pending || !t.trim()}>기록</button>
      </form>
    </div>
  );
}

export function DeleteCoop({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="fd-btn danger" disabled={pending} onClick={() => { if (confirm("이 업무협조를 지울까요?")) start(() => removeCoop(id)); }}>지우기</button>;
}

export interface CoopRow { c: Coop; left: number | null }
/** 업무협조 목록: 부서·방향·상태·찾기 */
export function CoopList({ items, dept0 = "" }: { items: CoopRow[]; dept0?: string }) {
  const [dept, setDept] = useState(dept0);
  const [dir, setDir] = useState("");
  const [st, setSt] = useState("open");
  const [q, setQ] = useState("");
  const shown = useMemo(() => items.filter(({ c }) =>
    (!dept || c.dept === dept) && (!dir || c.dir === dir)
    && (st === "" || (st === "open" ? c.status !== "완료" && c.status !== "보류" : c.status === st))
    && (!q || `${c.title} ${c.detail} ${c.partner} ${c.owner} ${c.result}`.toLowerCase().includes(q.toLowerCase())),
  ).sort((a, b) => (st === "완료" ? b.c.doneAt.localeCompare(a.c.doneAt) : (a.left ?? 9999) - (b.left ?? 9999))), [items, dept, dir, st, q]);
  const cnt = (d: string) => items.filter(({ c }) => c.dept === d && c.status !== "완료" && c.status !== "보류").length;
  return (
    <div className="cp-list">
      <div className="u-tabs">
        <button type="button" className={dept === "" ? "on" : ""} onClick={() => setDept("")}>전체</button>
        {DEPTS.map((d) => <button key={d} type="button" className={dept === d ? "on" : ""} onClick={() => setDept(d)}>{DEPT_EMOJI[d]} {d}<i>{cnt(d)}</i></button>)}
      </div>
      <div className="cp-fil">
        <select value={dir} onChange={(e) => setDir(e.target.value)}><option value="">받은·보낸 모두</option>{COOP_DIR.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={st} onChange={(e) => setSt(e.target.value)}><option value="open">진행 중인 것</option><option value="">전체 상태</option>{COOP_STATUS.map((s) => <option key={s}>{s}</option>)}</select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 내용·담당자 찾기" />
        <span className="muted">{shown.length}건</span>
      </div>
      {shown.length ? (
        <ul className="cp-rows">
          {shown.map(({ c, left }) => (
            <li key={c.id}><Link href={`/misc/coop?id=${c.id}`}>
              <span className="dp" style={{ ["--c" as string]: DEPT_COLOR[c.dept] }}>{DEPT_EMOJI[c.dept]} {c.dept}</span>
              <span className="tt"><b>{c.prio === "긴급" && "🔥 "}{c.title}</b><small>{c.dir === "받은 요청" ? "📥" : "📤"} {c.dir} · {c.partner || "상대 미정"} → {c.owner}{c.log.length > 1 ? ` · 기록 ${c.log.length - 1}` : ""}</small></span>
              <span className={`fd-tag ${statusTone(c.status)}`}>{c.status}</span>
              <span className={`dd${left !== null && left < 0 && c.status !== "완료" ? " late" : ""}`}>
                {c.status === "완료" ? `${+c.doneAt.slice(5, 7)}/${+c.doneAt.slice(8, 10)} 완료` : left === null ? "기한 없음" : left < 0 ? `${-left}일 지남` : left === 0 ? "오늘" : `D-${left}`}
              </span>
            </Link></li>
          ))}
        </ul>
      ) : <p className="muted">조건에 맞는 업무협조가 없습니다.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- 개인일정
/** 일정 넣기·고치기 */
export function PlanForm({ p, day }: { p?: Plan; day: string }) {
  const [res, act, saving] = useActionState(savePlanForm, null);
  const [allday, setAllday] = useState(p ? !p.from : false);
  const [rep, setRep] = useState(p?.repeat ?? "안 함");
  return (
    <form action={act} className="u-bform" key={p?.id ?? day}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="g">
        <label className="w2">일정 *<input name="title" defaultValue={p?.title} required placeholder="예: 품질팀 협의, 한전 현장설명회" /></label>
        <label>종류<select name="kind" defaultValue={p?.kind ?? "회의"}>{PLAN_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label>날짜 *<input type="date" name="day" defaultValue={p?.day ?? day} required /></label>
        <label>끝 날짜 <small>(여러 날)</small><input type="date" name="end" defaultValue={p?.end} /></label>
        <label className="ck"><input type="checkbox" name="allday" checked={allday} onChange={(e) => setAllday(e.target.checked)} /> 종일</label>
        {!allday && <label>시작<input type="time" name="from" defaultValue={p?.from || "09:00"} /></label>}
        {!allday && <label>끝<input type="time" name="to" defaultValue={p?.to} /></label>}
        <label>장소<input name="place" defaultValue={p?.place} /></label>
        <label>반복<select name="repeat" value={rep} onChange={(e) => setRep(e.target.value as Plan["repeat"])}>{REPEATS.map((r) => <option key={r}>{r}</option>)}</select></label>
        {rep !== "안 함" && <label>반복 끝<input type="date" name="until" defaultValue={p?.until} /></label>}
        <label className="w2">메모<textarea name="memo" rows={2} defaultValue={p?.memo} /></label>
      </div>
      <Msg r={res} />
      <div className="fd-btns">
        {p && <Link className="fd-btn" href={`/misc/plan?d=${p.day}`}>취소</Link>}
        <button className="fd-btn pri" disabled={saving}>{saving ? "저장하는 중…" : p ? "고친 내용 저장" : "＋ 일정 넣기"}</button>
      </div>
    </form>
  );
}

/** 일정 한 줄의 끝냄 체크 */
export function PlanCheck({ id, start, done }: { id: string; start: string; done: boolean }) {
  const [pending, start_] = useTransition();
  return <input type="checkbox" className="pl-ck" checked={done} disabled={pending} title={done ? "끝냄 취소" : "끝냄"} onChange={() => start_(() => togglePlanDone(id, start))} />;
}
export function DeletePlan({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="fd-btn danger" disabled={pending} onClick={() => { if (confirm("이 일정을 지울까요? (반복 일정이면 전부)")) start(() => removePlan(id)); }}>지우기</button>;
}
