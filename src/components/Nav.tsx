"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { areaOfPath, emojiOf, isOn, menuFor } from "@/lib/대시/menu";

// 기간·부서 필터는 화면을 옮겨도 유지한다 (인사노무 화면끼리)
const KEEP = ["month", "from", "to", "dept", "all", "fy", "asof"];

/** 사이드바 (통합 디자인, 1차 B 남색 + 1차 D 펼침 목록): 통합 대시보드 + 업무 영역.
 *  영역을 누르면 그 영역 대시보드로 가고, 지금 있는 영역만 펼쳐서 [대시보드] + 묶음별 메뉴를 보인다.
 *  사이드바를 접으면(1차 C) 이모지 칸만 남는다. */
export default function Nav({ admin, bid = false }: { admin: boolean; bid?: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  KEEP.forEach((k) => sp.get(k) && keep.set(k, sp.get(k)!));
  const qs = keep.toString();
  const cur = areaOfPath(path);
  return (
    <>
      <Link href="/" className={`sec${path === "/" ? " on" : ""}`} title="통합 대시보드">
        <span className="sec-l"><span className="ch">🏠</span><span className="t">통합 대시보드</span></span>
      </Link>
      <div className="group">업무</div>
      {menuFor(admin).map((a) => (
        <div key={a.key}>
          <Link href={a.dash} title={a.label} style={{ ["--c" as string]: a.color }}
            className={`sec${path === a.dash ? " on" : cur === a.key ? " open" : ""}`}>
            <span className="sec-l"><span className="ch">{emojiOf(a.key)}</span><span className="t">{a.label}</span></span>
            <span className="caret">{cur === a.key ? "▾" : "▸"}</span>
          </Link>
          {cur === a.key && (
            <div className="sec-items">
              <Link href={a.dash} className={`dash${path === a.dash ? " on" : ""}`}><span className="em">📊</span>{a.label} 대시보드</Link>
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
      {!admin && bid && (
        <Link href="/bid" className={`sec${path === "/bid" ? " on" : ""}`} title="입찰관리">
          <span className="sec-l"><span className="ch">⚖️</span><span className="t">입찰관리</span></span>
        </Link>
      )}
      <div className="group">시스템</div>
      <Link href="/users" className={`sec${path === "/users" || path.startsWith("/users/") ? " on" : ""}`} title={admin ? "사용자 관리" : "비밀번호 변경"}>
        <span className="sec-l"><span className="ch">{admin ? "⚙️" : "🔑"}</span><span className="t">{admin ? "사용자 관리" : "비밀번호 변경"}</span></span>
      </Link>
    </>
  );
}
