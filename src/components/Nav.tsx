"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import AppIcon, { AREA_ICON } from "@/components/AppIcon";
import { areaOfPath, emojiOf, isOn, MENU } from "@/lib/대시/menu";

// 기간·부서 필터는 화면을 옮겨도 유지한다 (인사노무 화면끼리)
const KEEP = ["month", "from", "to", "dept", "all", "fy", "asof"];

/** 사이드바 (F안): 통합 대시보드 + 업무 영역. 영역을 누르면 그 영역 대시보드로 가고,
 *  지금 있는 영역만 펼쳐서 [대시보드] + 묶음별 메뉴를 보인다. */
export default function Nav({ admin }: { admin: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  KEEP.forEach((k) => sp.get(k) && keep.set(k, sp.get(k)!));
  const qs = keep.toString();
  const cur = areaOfPath(path);
  return (
    <>
      <Link href="/" className={`sec${path === "/" ? " on" : ""}`}>
        <span className="sec-l"><AppIcon name="dashboard" color="#0c3994" size="sm" />통합 대시보드</span>
      </Link>
      <div className="group">업무</div>
      {MENU.filter((a) => admin || !a.adminOnly).map((a) => (
        <div key={a.key}>
          <Link href={a.dash} className={`sec${path === a.dash ? " on" : cur === a.key ? " open" : ""}`}>
            <span className="sec-l"><AppIcon name={AREA_ICON[a.key]} color={a.color} size="sm" />{a.label}</span>
            <span className="caret">{cur === a.key ? "▾" : "▸"}</span>
          </Link>
          {cur === a.key && (
            <div className="sec-items">
              <Link href={a.dash} className={`dash${path === a.dash ? " on" : ""}`}>📊 {a.label} 대시보드</Link>
              {a.groups.map((g) => (
                <div key={g.label}>
                  {g.label && <div className="group">{g.label}</div>}
                  {g.items.map((it) => (
                    <Link key={it.href} href={a.key === "hr" && qs && !it.href.includes("#") ? `${it.href}?${qs}` : it.href}
                      className={isOn(it, path) ? "on" : ""}><span className="em">{emojiOf(it.href)}</span>{it.label}</Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="group">시스템</div>
      <Link href="/users" className={`sec${path === "/users" || path.startsWith("/users/") ? " on" : ""}`}>
        <span className="sec-l"><AppIcon name={admin ? "userCog" : "key"} color="#6b7280" size="sm" />{admin ? "사용자 관리" : "비밀번호 변경"}</span>
      </Link>
    </>
  );
}
