"use client";
/** 화면 제목 앞에 그 화면의 메뉴 이모지를 붙인다 (D 디자인). 대시보드·직원 관리처럼 이모지를 직접 그리는 화면은 건드리지 않는다. */
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { areaOfPath, emojiOf, isOn, MENU } from "@/lib/대시/menu";

function emojiFor(path: string): string | null {
  const area = MENU.find((a) => a.key === areaOfPath(path));
  const items = (area ? [area] : MENU).flatMap((a) => a.groups.flatMap((g) => g.items));
  const hit = items.filter((it) => isOn(it, path)).sort((a, b) => b.href.length - a.href.length)[0];
  if (hit) return emojiOf(hit.href);
  if (path.startsWith("/users")) return "⚙️";
  return area ? emojiOf(area.key) : null;
}

export default function PageMark() {
  const path = usePathname();
  useEffect(() => {
    const set = () => {
      const h = document.querySelector<HTMLElement>("main.main > h1, main.main .topbar h1");
      if (!h || h.closest(".fd, .ep")) return;
      const e = emojiFor(path);
      if (e) h.dataset.emoji = e; else delete h.dataset.emoji;
    };
    set();
    const main = document.querySelector("main.main");
    if (!main) return;
    const ob = new MutationObserver(set);
    ob.observe(main, { childList: true, subtree: false });
    return () => ob.disconnect();
  }, [path]);
  return null;
}
