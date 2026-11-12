"use client";
/** 데일리 체크 보드 화면 조각: ① TodayBoard ② ProjectsBoard · RemindersBoard ③ HandoverDoc */
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { Contact, Handover, Item, Project, Reminder, Routine } from "@/lib/기타/daily";
import { addItem, carryOver, deleteProject, deleteReminder, removeItem, saveHandover, saveProject, saveReminder, saveRoutines, setMemo, toggleCheck, toggleRead } from "./actions";

const WD = "월화수목금토일";
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const wdOf = (d: string) => WD[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
const dday = (today: string, d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
const ST_CLS: Record<string, string> = { "완료": "ok", "진행 중": "doing", "시작 전": "todo" };
const cycleText = (r: Routine) => (r.cycle === "daily" ? "매일" : r.cycle === "weekly" ? `매주 ${WD[r.wd ?? 0]}` : `매월 ${r.md}일`);

export interface WeekDay {
  day: string; routines: { id: string; text: string; done: boolean }[]; items: Item[];
  sys: { id: string; text: string; sub: string; href: string; left: number; done: boolean }[];
  memo: string; done: number; all: number; state: string;
}

/** 체크를 누르면 바로 바뀐 것처럼 보이고, 저장 후 서버 값으로 맞춘다 */
function useFlip(deps: unknown) {
  const [flip, setFlip] = useState<Set<string>>(new Set());
  useEffect(() => { setFlip(new Set()); }, [deps]);
  const [, start] = useTransition();
  const toggle = (day: string, id: string) => {
    setFlip((s) => { const x = new Set(s); const k = `${day}|${id}`; if (x.has(k)) x.delete(k); else x.add(k); return x; });
    start(() => toggleCheck(day, id));
  };
  const on = (day: string, id: string, done: boolean) => (flip.has(`${day}|${id}`) ? !done : done);
  return { toggle, on };
}

function Check({ on, label, onClick, small }: { on: boolean; label: React.ReactNode; onClick: () => void; small?: boolean }) {
  return (
    <button type="button" className={`db-ck${on ? " on" : ""}${small ? " sm" : ""}`} onClick={onClick} aria-pressed={on}>
      <i aria-hidden="true">✓</i><span>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------- ① 오늘 할 일 · 주간 · 월간
export function TodayBoard({ today, todayInfo, week, wOff, view, month, monthDays, routines }: {
  today: string; todayInfo: WeekDay; week: WeekDay[]; wOff: number; view: "week" | "month"; month: string;
  monthDays: { day: string; inMonth: boolean; done: number; all: number; state: string }[]; routines: Routine[];
}) {
  const { toggle, on } = useFlip(week);
  const [text, setText] = useState("");
  const [memo, setMemoText] = useState(todayInfo.memo);
  const [busy, start] = useTransition();
  const t = todayInfo;
  const doneNow = t.routines.filter((r) => on(today, r.id, r.done)).length + t.sys.filter((s) => on(today, s.id, s.done)).length + t.items.filter((i) => on(today, i.id, i.done)).length;
  const pct = t.all ? Math.round((doneNow / t.all) * 100) : 0;
  const add = () => { const v = text.trim(); if (!v) return; setText(""); start(() => addItem(today, v)); };
  const mPrev = (() => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); })();
  const mNext = (() => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 7); })();

  return (
    <>
      <div className="db-wrap">
        <section className="card db-today">
          <div className="db-th"><b>오늘 할 일</b><span>{md(today)}({wdOf(today)})</span></div>
          <div className="db-prog"><div><span style={{ width: `${pct}%` }} className={pct >= 100 ? "ok" : ""} /></div><b>{doneNow}/{t.all} · {pct >= 100 ? "완료" : doneNow ? "진행 중" : "시작 전"}</b></div>
          <div className="db-grp r"><h4>반복 업무</h4>
            {t.routines.map((r) => <Check key={r.id} on={on(today, r.id, r.done)} label={r.text} onClick={() => toggle(today, r.id)} />)}
            {!t.routines.length && <p className="muted">오늘 해당하는 반복 업무가 없습니다.</p>}
          </div>
          <div className="db-grp s"><h4>사이트가 찾아 준 일 <small>기한 7일 안</small></h4>
            {t.sys.map((s) => (
              <div key={s.id} className="db-sys">
                <Check on={on(today, s.id, s.done)} label={s.text} onClick={() => toggle(today, s.id)} />
                <Link href={s.href} className={`db-dd${s.left < 0 ? " late" : s.left <= 3 ? " soon" : ""}`}>{s.left < 0 ? `${-s.left}일 지남` : s.left === 0 ? "오늘" : `D-${s.left}`}</Link>
              </div>
            ))}
            {!t.sys.length && <p className="muted">7일 안에 다가오는 기한이 없습니다.</p>}
          </div>
          <div className="db-grp t"><h4>오늘만 할 일</h4>
            {t.items.map((i) => (
              <div key={i.id} className="db-sys">
                <Check on={on(today, i.id, i.done)} label={i.text} onClick={() => toggle(today, i.id)} />
                <button type="button" className="db-x" aria-label={`${i.text} 지우기`} onClick={() => start(() => removeItem(today, i.id))}>×</button>
              </div>
            ))}
            <form className="db-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="+ 오늘만 할 일 적기 (엔터)" aria-label="오늘만 할 일" />
            </form>
            {t.items.some((i) => !on(today, i.id, i.done)) && <button type="button" className="btn sm" disabled={busy} onClick={() => start(() => carryOver(today))}>못 한 일 다음 근무일로 넘기기</button>}
          </div>
          <label className="db-memo">오늘 메모
            <textarea rows={2} value={memo} onChange={(e) => setMemoText(e.target.value)} onBlur={() => memo !== t.memo && start(() => setMemo(today, memo))} placeholder="회의 결과, 내일 할 일…" />
          </label>
        </section>

        <section className="card db-week">
          <div className="db-wh">
            <div className="seg">
              <Link href={`/misc/board?w=${wOff}`} className={view === "week" ? "on" : ""}>주간</Link>
              <Link href={`/misc/board?view=month&m=${month}`} className={view === "month" ? "on" : ""}>월간</Link>
            </div>
            {view === "week" ? (
              <>
                <b>{md(week[0].day)} ~ {md(week[4].day)}</b><span className="spacer" />
                <Link className="btn sm" href={`/misc/board?w=${wOff - 1}`}>‹ 지난주</Link>
                <Link className="btn sm" href="/misc/board">오늘</Link>
                <Link className="btn sm" href={`/misc/board?w=${wOff + 1}`}>다음 주 ›</Link>
              </>
            ) : (
              <>
                <b>{+month.slice(0, 4)}년 {+month.slice(5)}월</b><span className="spacer" />
                <Link className="btn sm" href={`/misc/board?view=month&m=${mPrev}`}>‹</Link>
                <Link className="btn sm" href="/misc/board?view=month">이번 달</Link>
                <Link className="btn sm" href={`/misc/board?view=month&m=${mNext}`}>›</Link>
              </>
            )}
          </div>
          {view === "week" ? (
            <div className="db-days">
              {week.map((d) => {
                const done = d.routines.filter((r) => on(d.day, r.id, r.done)).length + d.items.filter((i) => on(d.day, i.id, i.done)).length + d.sys.filter((s) => on(d.day, s.id, s.done)).length;
                const st = !d.all ? "" : done >= d.all ? "완료" : done ? "진행 중" : "시작 전";
                return (
                  <div key={d.day} className={`db-day${d.day === today ? " now" : ""}${d.day < today ? " past" : ""}`}>
                    <div className="db-dh"><b>{md(d.day)} {wdOf(d.day)}</b>{st && <em className={ST_CLS[st]}>{st}</em>}</div>
                    <div className="db-bar"><span style={{ width: `${d.all ? (done / d.all) * 100 : 0}%` }} className={ST_CLS[st] ?? ""} /></div>
                    {d.routines.map((r) => <Check small key={r.id} on={on(d.day, r.id, r.done)} label={r.text} onClick={() => toggle(d.day, r.id)} />)}
                    {d.sys.map((s) => <Check small key={s.id} on={on(d.day, s.id, s.done)} label={s.text} onClick={() => toggle(d.day, s.id)} />)}
                    {d.items.map((i) => <Check small key={i.id} on={on(d.day, i.id, i.done)} label={i.text} onClick={() => toggle(d.day, i.id)} />)}
                    {d.memo && <p className="db-dm">{d.memo}</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="db-month">
              {WD.split("").map((w) => <b key={w}>{w}</b>)}
              {monthDays.map((d) => (
                <div key={d.day} className={`db-md${d.inMonth ? "" : " out"}${d.day === today ? " now" : ""}`}>
                  <span>{+d.day.slice(8)}</span>
                  {d.all > 0 && <em className={ST_CLS[d.state] ?? ""}>{d.done}/{d.all}</em>}
                </div>
              ))}
            </div>
          )}
          <div className="db-legend"><span className="ok">완료</span> 모두 체크 <span className="doing">진행 중</span> 일부 <span className="todo">시작 전</span> 하나도 안 함</div>
        </section>
      </div>
      <RoutineEditor routines={routines} />
    </>
  );
}

function RoutineEditor({ routines }: { routines: Routine[] }) {
  const [list, setList] = useState(routines);
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  useEffect(() => { setList(routines); }, [routines]);
  const set = (i: number, p: Partial<Routine>) => setList(list.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <section className="card home-row db-rt">
      <div className="card-title">반복 업무 <span className="muted" style={{ fontWeight: 400 }}>한 번 정해 두면 그 주기마다 할 일이 자동으로 생깁니다</span><span className="spacer" />
        <button type="button" className="btn sm" onClick={() => setOpen(!open)}>{open ? "닫기" : "고치기"}</button></div>
      {!open ? (
        <div className="db-chips">{routines.map((r) => <span key={r.id}>{r.text} <em>{cycleText(r)}</em></span>)}</div>
      ) : (
        <div className="db-rlist">
          {list.map((r, i) => (
            <div key={r.id || i} className="db-rrow">
              <input value={r.text} onChange={(e) => set(i, { text: e.target.value })} aria-label="반복 업무 이름" />
              <select value={r.cycle} onChange={(e) => set(i, { cycle: e.target.value as Routine["cycle"] })} aria-label="주기">
                <option value="daily">매일 (월~금)</option><option value="weekly">매주</option><option value="monthly">매월</option>
              </select>
              {r.cycle === "weekly" && <select value={r.wd ?? 0} onChange={(e) => set(i, { wd: +e.target.value })} aria-label="요일">{WD.split("").map((w, k) => <option key={w} value={k}>{w}요일</option>)}</select>}
              {r.cycle === "monthly" && <input type="number" min={1} max={31} value={r.md ?? 1} onChange={(e) => set(i, { md: +e.target.value })} aria-label="날짜" style={{ width: 70 }} />}
              <button type="button" className="db-x" aria-label="지우기" onClick={() => setList(list.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="row">
            <button type="button" className="btn sm" onClick={() => setList([...list, { id: "", text: "", cycle: "daily" }])}>+ 반복 업무 추가</button>
            <span className="spacer" />
            <button type="button" className="btn primary sm" disabled={busy} onClick={() => start(async () => { await saveRoutines(list); setOpen(false); })}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- ② 업무(프로젝트)
const EMPTY_P: Project = { id: "", name: "", from: "", to: "", status: "시작 전", pct: 0, area: "", cycle: "비정기", star: 3, memo: "", next: "" };
export function ProjectsBoard({ projects, today }: { projects: Project[]; today: string }) {
  const [f, setF] = useState<"진행 중" | "시작 전" | "완료" | "전체">("진행 중");
  const [edit, setEdit] = useState<Project | null>(null);
  const [busy, start] = useTransition();
  const list = projects.filter((p) => f === "전체" || p.status === f);
  const n = (s: string) => projects.filter((p) => p.status === s).length;
  const set = (p: Partial<Project>) => edit && setEdit({ ...edit, ...p });
  return (
    <section className="card home-row">
      <div className="card-title">업무 · 프로젝트 <span className="muted" style={{ fontWeight: 400 }}>며칠짜리 일은 여기서 기간·진행을 관리 (인수인계서 &apos;진행 중인 업무&apos;로 이어짐)</span><span className="spacer" />
        <div className="seg">{(["진행 중", "시작 전", "완료", "전체"] as const).map((s) => <button key={s} type="button" className={f === s ? "on" : ""} onClick={() => setF(s)}>{s} {s === "전체" ? projects.length : n(s)}</button>)}</div>
        <button type="button" className="btn primary sm" onClick={() => setEdit({ ...EMPTY_P, from: today })}>+ 새 업무</button>
      </div>
      {edit && (
        <form className="db-pform" onSubmit={(e) => { e.preventDefault(); start(async () => { await saveProject(edit); setEdit(null); }); }}>
          <label className="wide">업무명<input value={edit.name} onChange={(e) => set({ name: e.target.value })} required /></label>
          <label>시작<input type="date" value={edit.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label>끝 (기한)<input type="date" value={edit.to} onChange={(e) => set({ to: e.target.value })} /></label>
          <label>진행<select value={edit.status} onChange={(e) => set({ status: e.target.value as Project["status"] })}><option>시작 전</option><option>진행 중</option><option>완료</option></select></label>
          <label>진척 {edit.pct}%<input type="range" min={0} max={100} step={5} value={edit.pct} onChange={(e) => set({ pct: +e.target.value })} /></label>
          <label>업무분장<input value={edit.area} onChange={(e) => set({ area: e.target.value })} placeholder="예: 3-7 교육훈련" /></label>
          <label>주기<select value={edit.cycle} onChange={(e) => set({ cycle: e.target.value })}>{["정기", "비정기", "매년", "반기", "분기", "매월", "수시"].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>중요도<select value={edit.star} onChange={(e) => set({ star: +e.target.value })}>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{"★".repeat(s)}</option>)}</select></label>
          <label className="wide">현재 상태·메모<input value={edit.memo} onChange={(e) => set({ memo: e.target.value })} /></label>
          <label className="wide">다음 할 일<input value={edit.next} onChange={(e) => set({ next: e.target.value })} /></label>
          <div className="row wide"><span className="spacer" />
            {edit.id && <button type="button" className="btn sm danger" onClick={() => { if (confirm("이 업무를 지울까요?")) start(async () => { await deleteProject(edit.id); setEdit(null); }); }}>삭제</button>}
            <button type="button" className="btn sm" onClick={() => setEdit(null)}>취소</button>
            <button className="btn primary sm" disabled={busy}>{busy ? "저장 중…" : "저장"}</button></div>
        </form>
      )}
      <div className="tbl-wrap">
        <table className="tbl db-ptbl">
          <thead><tr><th>업무명</th><th>기간</th><th style={{ width: 220 }}>진행</th><th>업무분장</th><th>주기</th><th>중요도</th><th>메모 · 다음 할 일</th></tr></thead>
          <tbody>{list.map((p) => {
            const left = p.to ? dday(today, p.to) : null;
            return (
              <tr key={p.id} onClick={() => setEdit(p)} className="db-prow">
                <td><b>{p.name}</b></td>
                <td>{p.from && md(p.from)} → {p.to && md(p.to)} {left !== null && p.status !== "완료" && <em className={`db-dd${left < 0 ? " late" : left <= 3 ? " soon" : ""}`}>{left < 0 ? `${-left}일 지남` : `D-${left}`}</em>}</td>
                <td><div className="db-pst"><span className={`db-st ${ST_CLS[p.status]}`}>{p.status}</span><div className="db-bar"><span style={{ width: `${p.pct}%` }} className={ST_CLS[p.status]} /></div><small>{p.pct}%</small></div></td>
                <td>{p.area && <span className="db-tag b">{p.area}</span>}</td>
                <td>{p.cycle && <span className="db-tag p">{p.cycle}</span>}</td>
                <td className="db-star">{"★".repeat(p.star)}</td>
                <td className="muted" style={{ fontSize: ".8rem" }}>{p.memo}{p.next ? ` → ${p.next}` : ""}</td>
              </tr>
            );
          })}{!list.length && <tr><td colSpan={7} className="muted">해당하는 업무가 없습니다. [+ 새 업무]로 추가하세요.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- ② 리마인더 보드 (다 같이)
const EMPTY_R: Reminder = { id: "", title: "", kind: "전체 공지", body: "", from: "", to: "", pin: false, by: "", read: [], at: "" };
export function RemindersBoard({ list, me, today }: { list: Reminder[]; me: string; today: string }) {
  const [f, setF] = useState<"확인 전" | "확인 완료" | "전체">("확인 전");
  const [edit, setEdit] = useState<Reminder | null>(null);
  const [busy, start] = useTransition();
  const live = list.filter((r) => !r.to || r.to >= today);
  const shown = (f === "전체" ? list : live.filter((r) => (f === "확인 완료") === r.read.includes(me))).slice().sort((a, b) => +b.pin - +a.pin);
  const set = (p: Partial<Reminder>) => edit && setEdit({ ...edit, ...p });
  return (
    <section className="card home-row">
      <div className="card-title">리마인더 보드 <span className="muted" style={{ fontWeight: 400 }}>공지·바뀐 규정·참고 자료 — 관리팀이 같이 봅니다</span><span className="spacer" />
        <div className="seg">{(["확인 전", "확인 완료", "전체"] as const).map((s) => <button key={s} type="button" className={f === s ? "on" : ""} onClick={() => setF(s)}>{s} {s === "전체" ? list.length : live.filter((r) => (s === "확인 완료") === r.read.includes(me)).length}</button>)}</div>
        <button type="button" className="btn primary sm" onClick={() => setEdit({ ...EMPTY_R })}>+ 새 리마인더</button>
      </div>
      {edit && (
        <form className="db-pform" onSubmit={(e) => { e.preventDefault(); start(async () => { await saveReminder(edit); setEdit(null); }); }}>
          <label className="wide">제목<input value={edit.title} onChange={(e) => set({ title: e.target.value })} required /></label>
          <label>구분<select value={edit.kind} onChange={(e) => set({ kind: e.target.value })}>{["전체 공지", "규정 변경", "참고", "문서", "안전", "개인"].map((k) => <option key={k}>{k}</option>)}</select></label>
          <label>시작<input type="date" value={edit.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label>끝 (비우면 무기한)<input type="date" value={edit.to} onChange={(e) => set({ to: e.target.value })} /></label>
          <label className="db-pin"><input type="checkbox" checked={edit.pin} onChange={(e) => set({ pin: e.target.checked })} /> 위에 고정 (중요)</label>
          <label className="wide">내용<textarea rows={3} value={edit.body} onChange={(e) => set({ body: e.target.value })} /></label>
          <div className="row wide"><span className="spacer" />
            {edit.id && <button type="button" className="btn sm danger" onClick={() => { if (confirm("이 리마인더를 지울까요?")) start(async () => { await deleteReminder(edit.id); setEdit(null); }); }}>삭제</button>}
            <button type="button" className="btn sm" onClick={() => setEdit(null)}>취소</button>
            <button className="btn primary sm" disabled={busy}>{busy ? "저장 중…" : "저장"}</button></div>
        </form>
      )}
      <div className="db-notes">
        {shown.map((r) => {
          const read = r.read.includes(me);
          return (
            <div key={r.id} className={`db-note${r.pin ? " pin" : ""}${read ? " read" : ""}`}>
              <button type="button" className="db-nt" onClick={() => setEdit(r)}>{r.title}</button>
              <div className="db-tags"><span className="db-tag k">{r.kind}</span>{r.pin && <span className="db-tag r">고정</span>}</div>
              {r.body && <p>{r.body}</p>}
              <small>{r.from || r.to ? `${r.from ? r.from.replaceAll("-", ".") : ""} ~ ${r.to ? r.to.replaceAll("-", ".") : "무기한"}` : "무기한"} · {r.by}</small>
              <div className="db-nf">
                <Check small on={read} label="확인 완료" onClick={() => start(() => toggleRead(r.id))} />
                <span className="muted" title={r.read.join(", ")}>{r.read.length ? `${r.read.length}명 확인` : ""}</span>
              </div>
            </div>
          );
        })}
        {!shown.length && <p className="muted">{f === "확인 전" ? "확인할 리마인더가 없습니다." : "없습니다."}</p>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- ③ 업무 인수인계서
interface DutyRow { key: string; area: string; group: string; task: string; cycle: string; note: string; file: string }
interface FileRow { key: string; name: string; path: string; how: string }
const FINAL: [string, string[]][] = [
  ["문서", ["담당 업무 목록 정리", "진행 중 업무 현황 정리", "관계자·거래처 연락처와 맥락 정리", "파일·시스템 위치 정리", "꼭 알아야 할 것 정리"]],
  ["실행", ["인수자와 미팅", "파일 공유·폴더 접근 권한 이전", "사이트 계정·권한 이전 (사용자·권한 설정)", "인수인계 완료 확인 받기 (메일·메시지)"]],
  ["개인 마무리", ["개인 파일 백업·회사 자료 반납", "메일 자동 응답·전달 설정", "비품·보안카드·열쇠 반납"]],
];
export function HandoverDoc({ me, h, areaOpts, duties, projects, files, today, people }: {
  me: { name: string; dept: string; rank: string }; h: Handover; areaOpts: Record<string, string>; duties: DutyRow[];
  projects: Project[]; files: FileRow[]; today: string; people: string[];
}) {
  const [v, setV] = useState<Handover>(h);
  const [busy, start] = useTransition();
  const [saved, setSaved] = useState(true);
  const set = (p: Partial<Handover>) => { setV({ ...v, ...p }); setSaved(false); };
  const groups = useMemo(() => [...new Set(duties.map((d) => `${d.area} · ${d.group}`))], [duties]);
  const allChecks = FINAL.flatMap(([, xs]) => xs);
  const sec = [
    ["기본 정보", v.taker && v.date ? 1 : v.taker || v.date ? 0.5 : 0],
    ["담당 업무", duties.length ? 1 : 0],
    ["진행 중 업무", projects.length ? 1 : 0.5],
    ["관계자·거래처", v.contacts.length ? 1 : 0],
    ["파일·시스템", 1],
    ["꼭 알아야 할 것", v.tips.length ? 1 : 0],
    ["최종 체크리스트", v.checks.length / allChecks.length],
  ] as const;
  const pct = Math.round((sec.reduce((s, [, x]) => s + x, 0) / sec.length) * 100);
  const contact = (i: number, p: Partial<Contact>) => set({ contacts: v.contacts.map((c, j) => (j === i ? { ...c, ...p } : c)) });

  return (
    <div className="db-ho">
      <aside className="db-toc noprint">
        <div className="card">
          <b>업무 인수인계서</b>
          <div className="db-prog"><div><span style={{ width: `${pct}%` }} className={pct >= 100 ? "ok" : ""} /></div><b>{pct}%</b></div>
          {sec.map(([n, x]) => <a key={n} href={`#ho-${n}`} className="db-tl"><i className={x >= 1 ? "ok" : x > 0 ? "half" : ""}>{x >= 1 ? "✓" : x > 0 ? "…" : ""}</i>{n}</a>)}
          <div className="db-areas"><small>인계할 업무 영역</small>
            {Object.entries(areaOpts).map(([k, l]) => (
              <label key={k}><input type="checkbox" checked={v.areas.includes(k)} onChange={(e) => set({ areas: e.target.checked ? [...v.areas, k] : v.areas.filter((a) => a !== k) })} /> {l}</label>
            ))}
            <small className="muted">영역을 바꾸면 저장 후 담당 업무·폴더가 다시 채워집니다.</small>
          </div>
          <button type="button" className="btn primary" disabled={busy || saved} onClick={() => start(async () => { await saveHandover(v); setSaved(true); })}>{busy ? "저장 중…" : saved ? "저장됨" : "저장"}</button>
          <button type="button" className="btn" onClick={() => window.print()}>인쇄 / PDF</button>
        </div>
      </aside>

      <div className="doc-page sd-doc wide db-hdoc">
        <div className="doc-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="주식회사 에쓰엔" className="doc-logo" />
          <div className="doc-title"><h2>업무 인수인계서</h2><div className="doc-sub">{me.dept} · {me.name} → {v.taker || "인수자"} · 인계일 {v.date ? v.date.replaceAll("-", ".") : "-"}</div></div>
          <table className="doc-sign"><tbody><tr><th rowSpan={2}>확<br />인</th><td>인계자</td><td>인수자</td><td>팀장</td></tr><tr><td /><td /><td /></tr></tbody></table>
        </div>

        <h3 className="doc-h" id="ho-기본 정보">기본 정보</h3>
        <dl className="sd-info">
          <div><dt>인계자</dt><dd>{me.name}</dd></div>
          <div><dt>소속 · 직책</dt><dd>{[me.dept, me.rank].filter(Boolean).join(" · ") || "-"}</dd></div>
          <div><dt>인수자</dt><dd><select className="db-in" value={v.taker} onChange={(e) => set({ taker: e.target.value })}><option value="">(고르기)</option>{people.filter((p) => p !== me.name).map((p) => <option key={p}>{p}</option>)}</select></dd></div>
          <div><dt>인계일</dt><dd><input className="db-in" type="date" value={v.date} min={today} onChange={(e) => set({ date: e.target.value })} /></dd></div>
        </dl>

        <h3 className="doc-h" id="ho-담당 업무">1. 담당 업무 목록 <small className="muted">업무분장에서 자동 · 비고만 적기</small></h3>
        {groups.map((g) => (
          <table key={g} className="doc-tbl full sd-tbl db-dt">
            <thead><tr><th className="l" colSpan={5}>{g}</th></tr><tr><th className="l">업무</th><th>주기</th><th className="l">관련 파일·대장</th><th className="l" style={{ width: "32%" }}>비고 (인계 메모)</th></tr></thead>
            <tbody>{duties.filter((d) => `${d.area} · ${d.group}` === g).map((d) => (
              <tr key={d.key}><td className="l b">{d.task}{d.note && <small className="muted"> · {d.note}</small>}</td><td><span className={`db-tag ${/매일|매주|매월|분기|반기|매년/.test(d.cycle) ? "r" : "b"}`}>{d.cycle}</span></td>
                <td className="l" style={{ fontSize: ".74rem", color: "#0c3994" }}>{d.file}</td>
                <td className="l"><input className="db-in w" value={v.dutyMemo[d.key] ?? ""} onChange={(e) => set({ dutyMemo: { ...v.dutyMemo, [d.key]: e.target.value } })} placeholder="예: 매주 월 오전 발송" /></td></tr>
            ))}</tbody>
          </table>
        ))}

        <h3 className="doc-h" id="ho-진행 중 업무">2. 진행 중인 업무 <small className="muted">② 업무·프로젝트에서 자동</small></h3>
        {projects.length ? (
          <div className="db-doing">{projects.map((p) => (
            <div key={p.id}><b>{p.name}</b><span><em>현재 상태</em> {p.status} {p.pct}%{p.memo ? ` · ${p.memo}` : ""}</span><span><em className="n">다음 할 일</em> {p.next || "-"}</span>
              <small>{p.to ? `기한 ${p.to.replaceAll("-", ".")}` : ""}{p.area ? ` · ${p.area}` : ""}</small></div>
          ))}</div>
        ) : <p className="muted">진행 중인 업무가 없습니다. <Link href="/misc/board?tab=work">② 업무·리마인더</Link>에서 추가하면 여기 들어옵니다.</p>}

        <h3 className="doc-h" id="ho-관계자·거래처">3. 관계자 · 거래처 <small className="muted">이름·연락처뿐 아니라 소통 맥락이 핵심</small></h3>
        <table className="doc-tbl full sd-tbl">
          <thead><tr><th className="l">이름</th><th>구분</th><th className="l">연락처</th><th className="l">소통 맥락</th><th className="noprint" /></tr></thead>
          <tbody>{v.contacts.map((c, i) => (
            <tr key={c.id || i}>
              <td><input className="db-in w" value={c.name} onChange={(e) => contact(i, { name: e.target.value })} placeholder="이름·직함" /></td>
              <td><select className="db-in" value={c.kind} onChange={(e) => contact(i, { kind: e.target.value as Contact["kind"] })}><option>내부</option><option>외부</option></select></td>
              <td><input className="db-in w" value={c.tel} onChange={(e) => contact(i, { tel: e.target.value })} placeholder="전화·메일" /></td>
              <td><input className="db-in w" value={c.note} onChange={(e) => contact(i, { note: e.target.value })} placeholder="예: 오전 통화 선호, 자료는 메일로" /></td>
              <td className="noprint"><button type="button" className="db-x" aria-label="지우기" onClick={() => set({ contacts: v.contacts.filter((_, j) => j !== i) })}>×</button></td>
            </tr>
          ))}</tbody>
        </table>
        <button type="button" className="btn sm noprint" onClick={() => set({ contacts: [...v.contacts, { id: "", name: "", kind: "외부", tel: "", note: "" }] })}>+ 관계자 추가</button>

        <h3 className="doc-h" id="ho-파일·시스템">4. 파일 · 시스템 <small className="muted">대장 폴더·관련 사이트에서 자동 · 특이사항만 적기</small></h3>
        <table className="doc-tbl full sd-tbl">
          <thead><tr><th className="l">항목</th><th className="l">경로</th><th className="l">접근 방법</th><th className="l" style={{ width: "30%" }}>특이사항</th></tr></thead>
          <tbody>{files.map((f) => (
            <tr key={f.key}><td className="l b">{f.name}</td><td className="l" style={{ fontSize: ".74rem", color: "#0c3994", wordBreak: "break-all" }}>{f.path}</td><td className="l" style={{ fontSize: ".78rem" }}>{f.how}</td>
              <td className="l"><input className="db-in w" value={v.fileMemo[f.key] ?? ""} onChange={(e) => set({ fileMemo: { ...v.fileMemo, [f.key]: e.target.value } })} /></td></tr>
          ))}</tbody>
        </table>

        <h3 className="doc-h" id="ho-꼭 알아야 할 것">5. 꼭 알아야 할 것 <small className="muted">어디에도 적혀 있지 않지만, 모르면 문제가 생기는 것</small></h3>
        <div className="db-tips">
          {v.tips.map((t, i) => (
            <div key={i}><b>!</b><input className="db-in w" value={t} onChange={(e) => set({ tips: v.tips.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" className="db-x noprint" aria-label="지우기" onClick={() => set({ tips: v.tips.filter((_, j) => j !== i) })}>×</button></div>
          ))}
        </div>
        <button type="button" className="btn sm noprint" onClick={() => set({ tips: [...v.tips, ""] })}>+ 추가</button>

        <h3 className="doc-h" id="ho-최종 체크리스트">6. 최종 체크리스트 <small className="muted">{v.checks.length}/{allChecks.length}</small></h3>
        <div className="db-final">
          {FINAL.map(([t, xs]) => (
            <div key={t}><b>{t} <small>{xs.filter((x) => v.checks.includes(x)).length}/{xs.length}</small></b>
              {xs.map((x) => <Check small key={x} on={v.checks.includes(x)} label={x} onClick={() => set({ checks: v.checks.includes(x) ? v.checks.filter((c) => c !== x) : [...v.checks, x] })} />)}
            </div>
          ))}
        </div>
        <p className="sd-foot">통합관리시스템 · 데일리 체크 보드 · 인계자·인수자 확인 후 PDF로 인사 서류에 보관</p>
      </div>
    </div>
  );
}
