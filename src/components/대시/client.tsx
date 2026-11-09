"use client";
/** 새 사이트(F안) 대시보드의 움직이는 부품: 할 일(분류 탭), 바로가기 모음(추가·지우기). */
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addLink, deleteLink } from "./actions";

export interface TodoView { cat: string; icon: string; title: string; sub: string; href: string; dday: string; tone: string; color: string }

const TABS = ["전체", "문서", "만기·갱신", "기한", "인사"];

export function TodoCard({ items, title = "✅ 다가오는 할 일", note, limit = 7 }: { items: TodoView[]; title?: string; note?: string; limit?: number }) {
  const tabs = TABS.filter((t) => t === "전체" || items.some((x) => x.cat === t));
  const [tab, setTab] = useState("전체");
  const [all, setAll] = useState(false);
  const list = items.filter((x) => tab === "전체" || x.cat === tab);
  const shown = all ? list : list.slice(0, limit);
  return (
    <div className="fd-card fd-w">
      <h4>{title}{note && <small>{note}</small>}</h4>
      {tabs.length > 2 && (
        <div className="fd-tabs">{tabs.map((t) => (
          <button key={t} type="button" className={t === tab ? "on" : ""} onClick={() => { setTab(t); setAll(false); }}>
            {t}{t !== "전체" && <i>{items.filter((x) => x.cat === t).length}</i>}
          </button>
        ))}</div>
      )}
      {shown.length ? (
        <table className="fd-nt"><tbody>
          {shown.map((t, i) => (
            <tr key={i}>
              <td className="w"><Link href={t.href}>
                <span className="fd-em">{t.icon}</span>
                <span><b>{t.title}</b><small>{t.sub}</small></span>
              </Link></td>
              <td className={`dd ${t.tone}`}><Link href={t.href}>{t.dday}</Link></td>
            </tr>
          ))}
        </tbody></table>
      ) : <p className="fd-empty">기한이 다가오는 일이 없습니다.</p>}
      {list.length > limit && (
        <button type="button" className="fd-more" onClick={() => setAll(!all)}>{all ? "접기" : `${list.length - limit}건 더 보기`}</button>
      )}
    </div>
  );
}

export type LinkView = { group: string; name: string; url: string };

export function LinksCard({ scope, links, title = "🔗 바로가기 모음" }: { scope: string; links: LinkView[]; title?: string }) {
  const groups = [...new Set(links.map((x) => x.group))];
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [res, act, saving] = useActionState(addLink, null);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dlg.current?.showModal(); else dlg.current?.close(); }, [open]);
  useEffect(() => { if (res?.ok) setOpen(false); }, [res]);
  return (
    <div className="fd-card fd-w fd-links">
      <h4>{title}</h4>
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
      <button type="button" className="add" onClick={() => setOpen(true)}>＋ 바로가기 추가</button>
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
    </div>
  );
}
