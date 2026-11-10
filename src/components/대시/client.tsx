"use client";
/** 통합 디자인 대시보드의 움직이는 부품: 시계, 이번 주 할 일(분류 탭), 할 일 4칸, 메모, 바로가기 모음(추가·지우기). */
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addLink, addMemo, addTodo4, clearDoneTodo4, deleteLink, deleteMemo, deleteTodo4, starMemo, toggleTodo4 } from "./actions";
import { Win } from "./win";

// ---------------------------------------------------------------- 시계
export interface ClockProps {
  strip: { label: string; n: number; today: boolean }[]; stripLabel: string;
  bar?: { label: string; n: number; of: number };
  next?: { title: string; when: string; href: string } | null;
}
const EN_DAY = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const EN_MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function Clock({ strip, stripLabel, bar, next }: ClockProps) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const h = now?.getHours() ?? 0, pad = (n: number) => String(n).padStart(2, "0");
  const pct = bar && bar.of ? Math.round((bar.n / bar.of) * 100) : 0;
  return (
    <Win en="CLOCK" ko="오늘·이번 주" className="s3">
      <div className="u-clock">
        <div className="wd">{now ? `${EN_DAY[now.getDay()]} · ${EN_MON[now.getMonth()]} ${now.getDate()}` : " "}</div>
        <div className="t">{now ? `${pad(h % 12 || 12)}:${pad(now.getMinutes())}` : "--:--"}<small>{now ? `:${pad(now.getSeconds())} ${h < 12 ? "AM" : "PM"}` : " "}</small></div>
        <div className="city">SEOUL</div>
      </div>
      <div className="u-strip-l">{stripLabel}</div>
      <div className="u-strip">{strip.map((d) => <div key={d.label} className={d.today ? "on" : ""}>{d.label}<b>{d.n || "–"}</b></div>)}</div>
      {bar && (
        <div className="u-att"><div><span>{bar.label}</span><span><b>{bar.n}</b> / {bar.of}명 · {pct}%</span></div><div className="u-prog"><i style={{ width: `${pct}%` }} /></div></div>
      )}
      {next && <Link className="u-next" href={next.href}><b>NEXT</b>{next.title}<small>{next.when}</small></Link>}
    </Win>
  );
}

// ---------------------------------------------------------------- 이번 주 할 일
export interface TodoView { cat: string; icon: string; title: string; sub: string; href: string; dday: string; tone: string; color: string }
const TABS = ["전체", "문서", "만기·갱신", "기한", "인사"];

export function TodoCard({ items, note, limit = 8, className = "s6" }: { items: TodoView[]; note?: string; limit?: number; className?: string }) {
  const tabs = TABS.filter((t) => t === "전체" || items.some((x) => x.cat === t));
  const [tab, setTab] = useState("전체");
  const [all, setAll] = useState(false);
  const list = items.filter((x) => tab === "전체" || x.cat === tab);
  const shown = all ? list : list.slice(0, limit);
  return (
    <Win en="THIS WEEK" ko={note ? `이번 주 할 일 · ${note}` : "이번 주 할 일"} className={className}>
      {tabs.length > 2 && (
        <div className="u-tabs">{tabs.map((t) => (
          <button key={t} type="button" className={t === tab ? "on" : ""} onClick={() => { setTab(t); setAll(false); }}>
            {t}{t !== "전체" && <i>{items.filter((x) => x.cat === t).length}</i>}
          </button>
        ))}</div>
      )}
      {shown.length ? (
        <ul className="u-wk">
          {shown.map((t, i) => (
            <li key={i}><Link href={t.href}>
              <span className="e">{t.icon}</span>
              <span className="tt"><b>{t.title}</b><small>{t.sub}</small></span>
              <span className={`chip ${t.cat === "문서" ? "b" : t.cat === "만기·갱신" ? "o" : t.cat === "인사" ? "g" : ""}`}>{t.cat}</span>
              <span className={`dd ${t.tone}`}>{t.dday}</span>
            </Link></li>
          ))}
        </ul>
      ) : <p className="fd-empty">이번 주 안에 처리할 일이 없습니다.</p>}
      {list.length > limit && (
        <button type="button" className="u-more" onClick={() => setAll(!all)}>{all ? "접기" : `${list.length - limit}건 더 보기`}</button>
      )}
    </Win>
  );
}

// ---------------------------------------------------------------- 할 일 4칸 (내 것)
export interface Todo4View { id: string; text: string; q: 1 | 2 | 3 | 4; done: boolean }
const Q: [1 | 2 | 3 | 4, string][] = [[1, "급하고 중요"], [2, "중요·안 급함"], [3, "급함·안 중요"], [4, "미뤄도 됨"]];

export function Todo4Card({ items }: { items: Todo4View[] }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [q, setQ] = useState<1 | 2 | 3 | 4>(1);
  const left = items.filter((x) => !x.done).length;
  const pct = items.length ? Math.round(((items.length - left) / items.length) * 100) : 0;
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    start(() => addTodo4(t, q));
  };
  return (
    <Win en="TO-DO" ko="할 일 4칸 · 나만 보임" className={`s6 u-t4${pending ? " busy" : ""}`}>
      <form className="u-tin" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="새 할 일 적기… (Enter)" maxLength={200} />
        <select value={q} onChange={(e) => setQ(Number(e.target.value) as 1 | 2 | 3 | 4)} aria-label="칸">{Q.map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select>
        <span className="u-pill">{left} LEFT</span>
      </form>
      <div className="u-prog"><i style={{ width: `${pct}%` }} /></div>
      <div className="u-mx">
        {Q.map(([n, l]) => {
          const r = items.filter((x) => x.q === n);
          return (
            <div key={n} className={`q${n}`}>
              <h5>■ {l}<em>{String(r.length).padStart(2, "0")}</em></h5>
              <ul>{r.map((x) => (
                <li key={x.id} className={x.done ? "done" : ""}>
                  <button type="button" className="ck" onClick={() => start(() => toggleTodo4(x.id))} aria-label={x.done ? "안 끝남으로" : "끝냄"} />
                  <span onClick={() => start(() => toggleTodo4(x.id))}>{x.text}</span>
                  <button type="button" className="x" title="지우기" onClick={() => start(() => deleteTodo4(x.id))}>×</button>
                </li>
              ))}</ul>
            </div>
          );
        })}
      </div>
      {items.some((x) => x.done) && <button type="button" className="u-more" onClick={() => start(() => clearDoneTodo4())}>끝낸 일 치우기</button>}
    </Win>
  );
}

// ---------------------------------------------------------------- 메모 (내 것)
export interface MemoView { id: string; text: string; star: boolean }
export function MemoCard({ items }: { items: MemoView[] }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const list = [...items].sort((a, b) => Number(b.star) - Number(a.star));
  return (
    <Win en="MEMO" ko="메모 · 나만 보임" tape="y" className={`s3 u-memo${pending ? " busy" : ""}`}>
      {list.map((m) => (
        <div key={m.id} className="mm">
          <span>{m.text}</span>
          <button type="button" className={m.star ? "on" : ""} title="별표" onClick={() => start(() => starMemo(m.id))}>{m.star ? "★" : "☆"}</button>
          <button type="button" className="x" title="지우기" onClick={() => confirm("이 메모를 지울까요?") && start(() => deleteMemo(m.id))}>×</button>
        </div>
      ))}
      {!list.length && <p className="fd-empty">떠오르는 걸 적어 두세요.</p>}
      <form className="u-min" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(""); start(() => addMemo(t)); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="메모 적기…" maxLength={300} />
        <button aria-label="메모 추가">+</button>
      </form>
    </Win>
  );
}

// ---------------------------------------------------------------- 바로가기 모음
export type LinkView = { group: string; name: string; url: string };

export function LinksCard({ scope, links, className = "s3" }: { scope: string; links: LinkView[]; className?: string }) {
  const groups = [...new Set(links.map((x) => x.group))];
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [res, act, saving] = useActionState(addLink, null);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dlg.current?.showModal(); else dlg.current?.close(); }, [open]);
  useEffect(() => { if (res?.ok) setOpen(false); }, [res]);
  return (
    <Win en="LINKS" ko="바로가기 모음" tape="b" className={`${className} u-links`}>
      {groups.map((g) => (
        <div key={g}>
          <div className="lg">{g}</div>
          {links.map((x, i) => x.group !== g ? null : (
            <div key={`${i}${x.name}`} className="lk">
              <a href={x.url} target="_blank" rel="noopener noreferrer">{x.name}</a>
              <button type="button" className="del" title="지우기" disabled={pending}
                onClick={() => confirm(`'${x.name}' 바로가기를 지울까요?`) && start(() => deleteLink(scope, i, x.name))}>×</button>
            </div>
          ))}
        </div>
      ))}
      {!links.length && <p className="fd-empty">아직 바로가기가 없습니다.</p>}
      <button type="button" className="add" onClick={() => setOpen(true)}>+ 바로가기 추가</button>
      <dialog ref={dlg} className="fd-modal" onClose={() => setOpen(false)}>
        <form action={act}>
          <h2>🔗 바로가기 추가 <button type="button" className="x" onClick={() => setOpen(false)}>×</button></h2>
          <input type="hidden" name="scope" value={scope} />
          <div className="fd-fgrid">
            <label>이름<input name="name" placeholder="예: 나라장터" required autoFocus /></label>
            <label>분류<input name="group" list={`lg-${scope}`} defaultValue={groups[0] ?? "업무"} placeholder="예: 입찰" />
              <datalist id={`lg-${scope}`}>{groups.map((g) => <option key={g} value={g} />)}</datalist></label>
            <label className="wide">주소<input name="url" placeholder="https://" required /></label>
          </div>
          <p className="fd-empty">이 대시보드에만 추가됩니다. 다른 업무 대시보드에도 두려면 거기서도 추가하세요.</p>
          {res?.error && <p className="fd-err">{res.error}</p>}
          <div className="fd-btns">
            <button type="button" className="fd-btn" onClick={() => setOpen(false)}>취소</button>
            <button className="fd-btn pri" disabled={saving}>{saving ? "추가하는 중…" : "추가"}</button>
          </div>
        </form>
      </dialog>
    </Win>
  );
}
