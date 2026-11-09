"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import AppIcon, { AREA_ICON } from "@/components/AppIcon";
import { hubOf } from "@/lib/hub";
import { type Area, bookHref, booksIn } from "@/lib/대장/books";

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
// 관리자 한 사람만 쓰는 영역
const ADMIN_ONLY: string[] = ["ga", "cert", "ehs", "misc"];
/** 영역 홈 + 그 영역 대장들 */
const areaItems = (home: string, label: string, area: Area) => [{ href: home, label }, ...booksIn(area).map((b) => ({ href: bookHref(b), label: b.title }))];
// 인증 메뉴
const CERT_ITEMS = [{ href: "/cert", label: "인증 현황" }];
// 총무 메뉴 (관리자만)
const GA_ITEMS = [
  { href: "/ga", label: "총무 홈" },
  { href: "/ga/mail", label: "문서 수발 대장" },
  { href: "/ga/issue", label: "증빙·법인서류 발급" },
  { href: "/ga/certs", label: "공동인증서 관리" },
];
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
      <Link href="/" className={`sec${path === "/" ? " on" : ""}`}>
        <span className="sec-l"><AppIcon name="dashboard" color="#0c3994" size="sm" />통합 대시보드</span>
      </Link>
      <div className="group">업무</div>
      {SECTIONS.filter((s) => admin || !ADMIN_ONLY.includes(s.key)).map((s) => (
        <div key={s.key}>
          <Link href={s.href} className={`sec${cur === s.key ? " open" : ""}`}>
            <span className="sec-l"><AppIcon name={AREA_ICON[s.key]} color={hubOf(s.key).color} size="sm" />{s.label}</span>
            <span className="caret">{cur === s.key ? "▾" : "▸"}</span>
          </Link>
          {cur === s.key && s.key === "ga" && (
            <div className="sec-items">
              {[...GA_ITEMS, ...booksIn("ga").map((b) => ({ href: bookHref(b), label: b.title }))].map((it) => (
                <Link key={it.href} href={it.href} className={path === it.href || (it.href !== "/ga" && under(path, it.href)) ? "on" : ""}>{it.label}</Link>
              ))}
            </div>
          )}
          {cur === s.key && (s.key === "ehs" || s.key === "misc") && (
            <div className="sec-items">
              {areaItems(s.href, `${s.label} 홈`, s.key).map((it) => (
                <Link key={it.href} href={it.href} className={path === it.href || (it.href !== s.href && under(path, it.href)) ? "on" : ""}>{it.label}</Link>
              ))}
            </div>
          )}
          {cur === s.key && s.key === "cert" && (
            <div className="sec-items">
              {CERT_ITEMS.map((it) => <Link key={it.href} href={it.href} className={under(path, it.href) ? "on" : ""}>{it.label}</Link>)}
            </div>
          )}
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
      <Link href="/users" className={`sec${under(path, "/users") ? " on" : ""}`}>
        <span className="sec-l"><AppIcon name={admin ? "userCog" : "key"} color="#6b7280" size="sm" />{admin ? "사용자 관리" : "비밀번호 변경"}</span>
      </Link>
    </>
  );
}
