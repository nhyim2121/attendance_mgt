"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { ORG_FIELDS, type OrgField, type OrgView } from "@/lib/org";
import { saveViewsAction } from "./actions";

type Res = { ok?: string; error?: string } | null;

/** 조직도 보기(용도) 추가·수정·삭제 */
export default function ViewEditor({ views, depts, people }: { views: OrgView[]; depts: string[]; people: string[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(views);
  const [msg, setMsg] = useState<Res>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<OrgView>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(views);

  return (
    <>
      {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.ok ?? msg.error}</div>}
      <div className="tbl-wrap"><table className="tbl edit">
        <thead><tr><th>보기 이름</th><th>제목</th><th>표시 항목 (부서·성명은 항상)</th><th>부서</th><th>뺄 사람</th><th>인원 수</th><th>모양</th><th /></tr></thead>
        <tbody>
          {rows.map((v, i) => (
            <tr key={v.id}>
              <td><input type="text" value={v.name} onChange={(e) => set(i, { name: e.target.value })} style={{ minWidth: 100 }} /></td>
              <td><input type="text" value={v.title} onChange={(e) => set(i, { title: e.target.value })} style={{ minWidth: 120 }} /></td>
              <td style={{ whiteSpace: "normal", minWidth: 260 }}>
                {(Object.entries(ORG_FIELDS) as [OrgField, string][]).map(([k, l]) => (
                  <label key={k} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={v.fields.includes(k)} onChange={() => set(i, { fields: toggle(v.fields, k) })} /> {l}
                  </label>
                ))}
              </td>
              <td>
                <details className="pop left">
                  <summary className="btn sm">{v.depts.length ? `${v.depts.length}개 부서` : "전체"}</summary>
                  <div className="pop-body stack" style={{ gap: 4, minWidth: 180 }}>
                    {depts.map((d) => (
                      <label key={d}><input type="checkbox" checked={v.depts.includes(d)} onChange={() => set(i, { depts: toggle(v.depts, d) })} /> {d}</label>
                    ))}
                    <span className="caption" style={{ margin: 0 }}>아무것도 고르지 않으면 전체 부서</span>
                  </div>
                </details>
              </td>
              <td>
                <details className="pop left">
                  <summary className="btn sm">{v.exclude?.length ? `${v.exclude.length}명 뺌` : "없음"}</summary>
                  <div className="pop-body" style={{ minWidth: 200, maxHeight: 320, overflow: "auto" }}>
                    <span className="caption" style={{ margin: "0 0 6px", display: "block" }}>체크한 사람은 이 보기의 조직도에 나오지 않습니다.</span>
                    {people.map((p) => (
                      <label key={p} style={{ display: "block" }}>
                        <input type="checkbox" checked={(v.exclude ?? []).includes(p)} onChange={() => set(i, { exclude: toggle(v.exclude ?? [], p) })} /> {p}
                      </label>
                    ))}
                  </div>
                </details>
              </td>
              <td><input type="checkbox" checked={v.showCount} onChange={(e) => set(i, { showCount: e.target.checked })} /></td>
              <td>
                <select value={v.layout} onChange={(e) => set(i, { layout: e.target.value as OrgView["layout"] })}>
                  <option value="chart">조직도</option><option value="table">명단 표</option>
                </select>
              </td>
              <td><button className="btn sm danger" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>삭제</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => setRows((rs) => [...rs, {
          id: `v${Date.now()}`, name: "새 보기", title: "조직도", fields: ["rank"], depts: [], showCount: false, layout: "chart", exclude: [],
        }])}>+ 보기 추가</button>
        <button className="btn primary" disabled={pending || !dirty} onClick={() => start(async () => {
          const r = await saveViewsAction(rows);
          setMsg(r);
          if (r.ok) router.refresh();
        })}>저장</button>
        <button className="btn" disabled={pending || !dirty} onClick={() => setRows(views)}>편집 취소</button>
      </div>
    </>
  );
}

export function PrintButton() {
  return <button className="btn" onClick={() => window.print()}>인쇄 / PDF 저장</button>;
}

// A4 가로에서 여백 4mm(globals.css의 @page org)를 뺀 크기(px), 약간의 안전 여유 포함
const [W, H] = [1084, 736];

/** 상위 상자를 첫·마지막 하위 상자의 가운데로 옮긴다 (--s: 상자와 연결선을 옮길 거리). 아래 단계부터 재서 올라온다. */
function alignParents(el: HTMLElement) {
  const items = [...el.querySelectorAll<HTMLElement>(".ot li")].reverse();
  items.forEach((li) => li.style.setProperty("--s", "0px"));
  const mid = (li: Element) => {
    const r = li.querySelector(":scope > .ot-card")!.getBoundingClientRect();
    return r.left + r.width / 2;
  };
  for (const li of items) {
    const kids = li.querySelector(":scope > ul")?.children;
    if (!kids?.length) continue;
    const card = li.querySelector<HTMLElement>(":scope > .ot-card")!;
    const scale = card.getBoundingClientRect().width / card.offsetWidth; // 배율이 걸린 화면 거리 -> CSS px
    const s = ((mid(kids[0]) + mid(kids[kids.length - 1])) / 2 - mid(li)) / scale;
    li.style.setProperty("--s", `${s}px`);
  }
}

/** 조직도를 화면 너비에 맞춰(너무 작아지면 가로 스크롤) 줄이고, 인쇄할 때는 A4 가로 한 장에 꽉 차게 키우거나 줄인다. */
export function FitPrint({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let printing = false;
    const natural = () => {
      el.style.zoom = "";
      return [el.querySelector(".ot")?.scrollWidth ?? el.scrollWidth, el.scrollHeight];
    };
    const screen = () => {
      el.classList.remove("ot-print");
      const [w] = natural();
      const z = Math.min(1, el.clientWidth / w);
      el.style.zoom = z < 1 ? String(Math.max(z, 0.7)) : "";
      alignParents(el);
    };
    const print = () => {
      printing = true;
      el.classList.add("ot-print");
      const size = (card: number, row: number) => {
        el.style.setProperty("--ot-card", `${card}px`);
        el.style.setProperty("--ot-row", `${row}px`);
      };
      const high = () => el.getBoundingClientRect().height; // 배율을 적용한 실제 높이 (줄 높이 반올림 때문에 곱셈과 다르다)
      let [card, row] = [100, 3];
      el.style.width = "2000px"; // 잴 때는 브라우저 창 너비의 영향(제목 줄바꿈 등)을 받지 않게
      size(card, row);
      const [w, h] = natural();
      let z = Math.min(1.8, W / w, H / h);
      el.style.zoom = String(z);
      for (; z < 1.8 && w * (z + 0.01) <= W; z += 0.01) {
        el.style.zoom = String(z + 0.01);
        if (high() > H) { el.style.zoom = String(z); break; }
      }
      // 한쪽이 먼저 차면 남는 쪽은 상자를 넓히고(가로) 줄을 띄워(세로) 마저 채운다
      for (; card < 240; card += 2) {
        size(card + 2, row);
        if (natural()[0] * z > W) { size(card, row); break; }
      }
      el.style.zoom = String(z);
      for (; row < 16; row += 0.25) {
        size(card, row + 0.25);
        if (high() > H) { size(card, row); break; }
      }
      el.style.width = "";
      alignParents(el);
    };
    // 인쇄 창이 열릴 때도 resize가 올 수 있다. 그때 화면 맞춤이 돌면 인쇄용 크기가 지워진다
    const resize = () => { if (!printing) screen(); };
    const done = () => { printing = false; screen(); };
    screen();
    document.fonts.ready.then(() => { if (!printing) screen(); }); // 글꼴이 늦게 오면 상자 폭이 바뀐다
    window.addEventListener("resize", resize);
    window.addEventListener("beforeprint", print);
    window.addEventListener("afterprint", done);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("beforeprint", print);
      window.removeEventListener("afterprint", done);
    };
  }, []);
  useEffect(() => { if (ref.current) alignParents(ref.current); }); // 보기·기준일을 바꾸면 상자가 달라진다
  return <div ref={ref} className="ot-fit">{children}</div>;
}
