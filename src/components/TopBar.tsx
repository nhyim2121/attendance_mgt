"use client";
/** 화면 위쪽 줄 (통합 디자인, 1차 C): 사이드바 접기 · 메뉴 찾기 · 촘촘하게 보기.
 *  접기·촘촘하게는 이 브라우저에 기억한다. 화면을 옮기면 창 제목(영어)이 뒤섞였다가 맞춰진다 (2차 F). */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { emojiOf, menuFor } from "@/lib/대시/menu";

const KEYS = { rail: "u-rail", dense: "u-dense" } as const;
type Pref = keyof typeof KEYS;
const read = (k: Pref) => { try { return localStorage.getItem(KEYS[k]) === "1"; } catch { return false; } };
const write = (k: Pref, v: boolean) => { try { localStorage.setItem(KEYS[k], v ? "1" : "0"); } catch { /* 저장 못 해도 화면은 바뀜 */ } };
const shell = () => document.querySelector(".shell");

function scramble() {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#@%&";
  document.querySelectorAll<HTMLElement>("main.main [data-scr]").forEach((el, k) => {
    const t = el.dataset.scr ?? "";
    let n = 0;
    const id = setInterval(() => {
      n++;
      el.textContent = t.split("").map((c, i) => (c === " " || c === "-" || i < n / 2 ? c : A[(Math.random() * A.length) | 0])).join("");
      if (n / 2 >= t.length) { el.textContent = t; clearInterval(id); }
    }, 26 + k * 3);
  });
}

export default function TopBar({ admin, areas = null }: { admin: boolean; areas?: string[] | null }) {
  const path = usePathname();
  const router = useRouter();
  const [rail, setRail] = useState(false);
  const [dense, setDense] = useState(false);
  const [q, setQ] = useState("");
  const items = menuFor(admin, areas).flatMap((a) => a.groups.flatMap((g) => g.items.map((it) => ({ ...it, area: a.label }))));

  useEffect(() => {
    const r = read("rail"), d = read("dense");
    setRail(r); setDense(d);
    shell()?.classList.toggle("rail", r);
    shell()?.classList.toggle("dense", d);
  }, []);
  useEffect(() => { scramble(); }, [path]);

  const flip = (k: Pref, v: boolean) => {
    (k === "rail" ? setRail : setDense)(v);
    shell()?.classList.toggle(k, v);
    write(k, v);
  };
  const go = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const hit = items.find((it) => it.label === t) ?? items.find((it) => it.label.includes(t) || it.desc?.includes(t));
    if (hit) { setQ(""); router.push(hit.href); }
  };

  return (
    <div className="u-top">
      <button type="button" className="fold" title={rail ? "메뉴 펴기" : "메뉴 접기"} onClick={() => flip("rail", !rail)}>{rail ? "»" : "«"}</button>
      <form className="srch" onSubmit={(e) => { e.preventDefault(); go(q); }}>
        <input value={q} list="u-menu-list" placeholder="🔍 메뉴 찾기 (예: 연차, 공문)"
          onChange={(e) => { setQ(e.target.value); if (items.some((it) => it.label === e.target.value)) go(e.target.value); }} />
        <datalist id="u-menu-list">{items.map((it) => <option key={it.href} value={it.label}>{`${emojiOf(it.href)} ${it.area}`}</option>)}</datalist>
      </form>
      <button type="button" className={`tog${dense ? " on" : ""}`} onClick={() => flip("dense", !dense)}><i />촘촘하게</button>
    </div>
  );
}
