"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// 기간·부서 필터는 화면을 옮겨도 유지한다
const KEEP = ["month", "from", "to", "dept", "all", "fy", "asof"];
type Item = { href: string; label: string; group?: string; also?: string[] }; // also: 같은 메뉴로 볼 다른 주소

/** 사이드바 메뉴. 맨 위 [근태]/[휴가]로 공간을 바꾸면 그 공간의 메뉴만 보인다 (/leave 아래가 휴가 공간). */
export default function Nav({ items: attItems, leaveItems }: { items: Item[]; leaveItems: Item[] }) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  KEEP.forEach((k) => sp.get(k) && keep.set(k, sp.get(k)!));
  const qs = keep.toString();
  const isLeave = path === "/leave" || path.startsWith("/leave/");
  const items = isLeave ? leaveItems : attItems;
  let group: string | undefined;
  return (
    <>
      <div className="space-switch">
        <Link href="/" className={isLeave ? "" : "on"}>근태</Link>
        <Link href="/leave" className={isLeave ? "on" : ""}>휴가</Link>
      </div>
      {items.map((it) => {
        const head = it.group && it.group !== group ? <div className="group">{it.group}</div> : null;
        group = it.group;
        const root = it.href === "/" || it.href === "/leave";
        const on = path === it.href || (!root && path.startsWith(`${it.href}/`)) || !!it.also?.some((x) => path === x || path.startsWith(`${x}/`));
        return (
          <span key={it.href}>
            {head}
            <Link href={qs ? `${it.href}?${qs}` : it.href} className={on ? "on" : ""}>{it.label}</Link>
          </span>
        );
      })}
    </>
  );
}
