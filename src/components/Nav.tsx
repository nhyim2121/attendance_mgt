"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// 기간·부서 필터는 화면을 옮겨도 유지한다
const KEEP = ["month", "from", "to", "dept", "all", "fy", "asof"];
type Item = { href: string; label: string; group?: string; also?: string[] }; // also: 같은 메뉴로 볼 다른 주소

/** 통합관리시스템 업무 영역. 인사노무 안에 근태/휴가 공간이 들어 있다. */
export const SECTIONS = [
  { key: "ga", label: "총무", href: "/ga" },
  { key: "hr", label: "인사노무", href: "/attendance" },
  { key: "ehs", label: "환경안전보건", href: "/ehs" },
  { key: "cert", label: "인증", href: "/cert" },
  { key: "misc", label: "기타", href: "/misc" },
] as const;
const under = (path: string, p: string) => path === p || path.startsWith(`${p}/`);
/** 이 주소가 속한 영역. 통합 대시보드(/)·사용자 관리는 영역 없음, 나머지 기존 화면은 모두 인사노무. */
function sectionOf(path: string): string {
  if (path === "/" || under(path, "/users")) return "";
  return SECTIONS.find((s) => s.key !== "hr" && under(path, s.href))?.key ?? "hr";
}

/** 사이드바: 통합 대시보드 + 업무 영역. 지금 있는 영역만 펼쳐서 그 메뉴를 보인다.
 *  인사노무는 맨 위 [근태]/[휴가]로 공간을 바꾸면 그 공간의 메뉴만 보인다 (/leave 아래가 휴가 공간). */
export default function Nav({ items: attItems, leaveItems, admin }: { items: Item[]; leaveItems: Item[]; admin: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  KEEP.forEach((k) => sp.get(k) && keep.set(k, sp.get(k)!));
  const qs = keep.toString();
  const cur = sectionOf(path);
  const isLeave = under(path, "/leave");
  const items = isLeave ? leaveItems : attItems;
  let group: string | undefined;
  return (
    <>
      <Link href="/" className={path === "/" ? "on" : ""}>통합 대시보드</Link>
      <div className="group">업무</div>
      {SECTIONS.map((s) => (
        <div key={s.key}>
          <Link href={s.href} className={`sec${cur === s.key ? " open" : ""}`}>
            {s.label}<span className="caret">{cur === s.key ? "▾" : "▸"}</span>
          </Link>
          {cur === s.key && s.key === "hr" && (
            <div className="sec-items">
              <div className="space-switch">
                <Link href="/attendance" className={isLeave ? "" : "on"}>근태</Link>
                <Link href="/leave" className={isLeave ? "on" : ""}>휴가</Link>
              </div>
              {items.map((it) => {
                const head = it.group && it.group !== group ? <div className="group">{it.group}</div> : null;
                group = it.group;
                const root = it.href === "/attendance" || it.href === "/leave";
                const on = path === it.href || (!root && path.startsWith(`${it.href}/`))
                  || !!it.also?.some((x) => under(path, x));
                return (
                  <span key={it.href}>
                    {head}
                    <Link href={qs ? `${it.href}?${qs}` : it.href} className={on ? "on" : ""}>{it.label}</Link>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <div className="group">시스템</div>
      <Link href="/users" className={under(path, "/users") ? "on" : ""}>{admin ? "사용자 관리" : "비밀번호 변경"}</Link>
    </>
  );
}
