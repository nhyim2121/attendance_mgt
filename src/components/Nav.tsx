"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// 기간·부서 필터는 화면을 옮겨도 유지한다
const KEEP = ["month", "from", "to", "dept", "all"];

export default function Nav({ items }: { items: { href: string; label: string; group?: string }[] }) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  KEEP.forEach((k) => sp.get(k) && keep.set(k, sp.get(k)!));
  const qs = keep.toString();
  let group: string | undefined;
  return (
    <>
      {items.map((it) => {
        const head = it.group && it.group !== group ? <div className="group">{it.group}</div> : null;
        group = it.group;
        const on = it.href === "/" ? path === "/" : path.startsWith(it.href);
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
