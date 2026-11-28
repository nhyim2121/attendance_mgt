"use client";
/** 위쪽 메뉴 (2026-11-28 B′안, 사이드바 없앰):
 *  1줄 = 업무 영역(인사노무·총무·…) · 메뉴 찾기 · 계정, 2줄 = 그 영역의 묶음(인력계획·채용관리·근태관리…).
 *  묶음을 누르면 그 묶음의 대시보드가 첫 화면. 하위 화면은 메뉴에 늘어놓지 않고 대시보드의 '바로가기' 카드로 들어간다(GroupBar).
 *  하위 화면에서는 [‹ 묶음 대시보드]와 같은 묶음 화면 알약이 보인다. */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { areaOfPath, emojiOf, isOn, menuFor, type MenuArea, type MenuGroup, type MenuItem } from "@/lib/대시/menu";

const clean = (label: string) => label.replace(/^[\dA-Z]+(-\d+)?\.\s*/, "");
/** 묶음의 대시보드(첫 화면): '대시보드'·'홈' 이름 화면, 없으면 묶음 안내 화면(/g/영역/번호) */
export function groupDash(area: MenuArea, gi: number): string {
  const g = area.groups[gi];
  const d = g.items.find((it) => /대시보드$|홈$/.test(it.label) && !it.href.includes("#") && !it.href.includes("?"));
  return d ? d.href : `/g/${area.key}/${gi}`;
}
/** 지금 주소가 속한 묶음 번호 (없으면 -1) */
function groupOf(area: MenuArea, path: string): number {
  return area.groups.findIndex((g, gi) => groupDash(area, gi) === path || g.items.some((it) => isOn(it, path)));
}

export default function SiteNav({ admin, bid, areas, who, logout }: {
  admin: boolean; bid: boolean; areas: string[] | null; who: React.ReactNode; logout: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const menu = menuFor(admin, areas).filter((a) => a.groups.length);
  const curKey = path.startsWith("/g/") ? path.split("/")[2] : areaOfPath(path);
  const cur = menu.find((a) => a.key === curKey);
  const gi = cur ? groupOf(cur, path) : -1;
  const items = menu.flatMap((a) => a.groups.flatMap((g) => g.items.map((it) => ({ ...it, area: a.label }))));
  const go = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const hit = items.find((it) => it.label === t) ?? items.find((it) => it.label.includes(t) || it.desc?.includes(t));
    if (hit) { setQ(""); router.push(hit.href); }
  };

  return (
    <header className="tn noprint">
      <div className="tn-1">
        <Link href={admin ? "/" : "/bid"} className="tn-logo" title="처음 화면"><span className="tn-mark">SN</span><b>근태관리통합</b></Link>
        <nav className="tn-areas" aria-label="업무 영역">
          {admin && <Link href="/" className={path === "/" ? "on" : ""}>홈</Link>}
          {!admin && bid && <Link href="/bid" className={path.startsWith("/bid") ? "on" : ""}>입찰관리</Link>}
          {menu.map((a) => <Link key={a.key} href={a.dash} className={a.key === curKey ? "on" : ""}>{a.label}</Link>)}
        </nav>
        <form className="tn-srch" onSubmit={(e) => { e.preventDefault(); go(q); }}>
          <input value={q} list="tn-menu-list" placeholder="메뉴 찾기 (예: 연차, 공문)" aria-label="메뉴 찾기"
            onChange={(e) => { setQ(e.target.value); if (items.some((it) => it.label === e.target.value)) go(e.target.value); }} />
          <datalist id="tn-menu-list">{items.map((it) => <option key={`${it.area}${it.href}${it.label}`} value={it.label}>{it.area}</option>)}</datalist>
        </form>
        <div className="tn-me">
          {admin && (
            <details className="pop">
              <summary className="tn-more">설정 ▾</summary>
              <div className="pop-body tn-drop">
                <Link href="/company">회사 정보</Link>
                <Link href="/users">사용자·권한</Link>
                <Link href="/settings">근무 기준·공휴일</Link>
                <Link href="/upload">데이터 관리 (캡스·하이웍스)</Link>
              </div>
            </details>
          )}
          {!admin && <Link href="/users" className="tn-more">비밀번호</Link>}
          <span className="tn-who">{who}</span>{logout}
        </div>
      </div>
      {cur && (
        <nav className="tn-2" aria-label={`${cur.label} 묶음`}>
          {cur.groups.map((g, i) => (
            <Link key={`${g.label}${i}`} href={groupDash(cur, i)} className={i === gi ? "on" : ""}>{clean(g.label) || cur.label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/** 본문 위: 묶음 대시보드면 '바로가기' 카드, 하위 화면이면 [‹ 묶음 대시보드] + 같은 묶음 화면 알약 */
export function GroupBar({ admin, areas }: { admin: boolean; areas: string[] | null }) {
  const path = usePathname();
  const menu = menuFor(admin, areas).filter((a) => a.groups.length);
  const curKey = path.startsWith("/g/") ? path.split("/")[2] : areaOfPath(path);
  const cur = menu.find((a) => a.key === curKey);
  if (!cur) return null;
  const gi = groupOf(cur, path);
  if (gi < 0) return null;
  const g: MenuGroup = cur.groups[gi];
  const dash = groupDash(cur, gi);
  const screens: MenuItem[] = g.items.filter((it) => it.href !== dash);
  if (!screens.length) return null;
  const name = clean(g.label) || cur.label;
  if (path === dash) {
    return (
      <section className="tn-tiles noprint" aria-label={`${name} 화면`}>
        {screens.map((it, i) => (
          <Link key={`${it.href}${it.label}`} href={it.href} className="tn-tile" style={{ animationDelay: `${i * 0.03}s` }} title={it.desc}>
            <span className="tn-tile-t"><span className="em">{emojiOf(it.href)}</span>{it.label}<span className="ar">›</span></span>
            {it.desc && <span className="tn-tile-d">{it.desc}</span>}
          </Link>
        ))}
      </section>
    );
  }
  return (
    <div className="tn-crumb noprint">
      <Link href={dash} className="tn-back">‹ {name} {dash.startsWith("/g/") ? "" : "대시보드"}</Link>
      <div className="tn-pills">
        {screens.map((it) => <Link key={`${it.href}${it.label}`} href={it.href} className={isOn(it, path) ? "on" : ""}>{it.label}</Link>)}
      </div>
    </div>
  );
}
