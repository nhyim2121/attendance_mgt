"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { areaOfPath, emojiOf, isOn, menuFor } from "@/lib/대시/menu";

// 기간·부서 필터는 화면을 옮겨도 유지한다 (인사노무 화면끼리)
const KEEP = ["month", "from", "to", "dept", "all", "fy", "asof"];

/** 위쪽 가로 메뉴 (왼쪽 사이드바를 위로 올림, 2026-11-11).
 *  1줄: 로고 · 통합 대시보드 · 업무 영역(마우스를 올리면 그 영역 메뉴가 펼쳐짐) · 사용자 관리 · 로그인한 사람
 *  2줄: 지금 있는 영역의 [대시보드] + 묶음별 메뉴 */
export default function TopNav({ admin, bid = false, who, logout }: {
  admin: boolean; bid?: boolean; who: React.ReactNode; logout: React.ReactNode;
}) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  KEEP.forEach((k) => sp.get(k) && keep.set(k, sp.get(k)!));
  const qs = keep.toString();
  const cur = areaOfPath(path);
  const areas = menuFor(admin);
  const area = areas.find((a) => a.key === cur);
  const href = (key: string, h: string) => (key === "hr" && qs && !h.includes("#") ? `${h}?${qs}` : h);

  return (
    <header className="tnav">
      <div className="tnav-bar">
        <Link href="/" className="tnav-logo" title="통합 대시보드"><img src="/logo.png" alt="주식회사 에쓰엔" /></Link>
        <nav className="tnav-main">
          <Link href="/" className={`tnav-a${path === "/" ? " on" : ""}`}>
            <span className="ch">🏠</span><span className="t">통합 대시보드</span>
          </Link>
          {areas.map((a, i) => (
            <div key={a.key} className={`tnav-area${i >= areas.length / 2 ? " r" : ""}${a.groups.reduce((n, g) => n + g.items.length, 0) > 12 ? " wide" : ""}`}>
              <Link href={a.dash} style={{ ["--c" as string]: a.color }}
                className={`tnav-a${cur === a.key ? " on" : ""}`}>
                <span className="ch">{emojiOf(a.key)}</span><span className="t">{a.label}</span><span className="caret">▾</span>
              </Link>
              <div className="tnav-drop">
                <Link href={a.dash} className={`dash${path === a.dash ? " on" : ""}`}><span className="em">📊</span>{a.label} 대시보드</Link>
                {a.groups.map((g) => (
                  <div key={g.label} className="grp">
                    {g.label && <div className="group">{g.label}</div>}
                    {g.items.map((it) => (
                      <Link key={it.href} href={href(a.key, it.href)} className={isOn(it, path) ? "on" : ""}>
                        <span className="em">{emojiOf(it.href)}</span>{it.label}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!admin && bid && (
            <Link href="/bid" className={`tnav-a${path === "/bid" ? " on" : ""}`}>
              <span className="ch">⚖️</span><span className="t">입찰관리</span>
            </Link>
          )}
        </nav>
        <div className="tnav-who">
          <Link href="/users" title={admin ? "사용자 관리" : "비밀번호 변경"} className={`tnav-a tnav-ico${path === "/users" || path.startsWith("/users/") ? " on" : ""}`}>
            <span className="ch">{admin ? "⚙️" : "🔑"}</span>
          </Link>
          {who}{logout}
        </div>
      </div>
      {area && (
        <nav className="tnav-sub" style={{ ["--c" as string]: area.color }}>
          <Link href={area.dash} className={`tnav-s${path === area.dash ? " on" : ""}`}><span className="em">📊</span>{area.label} 대시보드</Link>
          {area.groups.map((g) => {
            const on = g.items.some((it) => isOn(it, path));
            return (
              <div key={g.label} className="tnav-area">
                <button type="button" className={`tnav-s${on ? " on" : ""}`}>{g.label || "메뉴"}<span className="caret">▾</span></button>
                <div className="tnav-drop">
                  {g.items.map((it) => (
                    <Link key={it.href} href={href(area.key, it.href)} className={isOn(it, path) ? "on" : ""}>
                      <span className="em">{emojiOf(it.href)}</span>{it.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      )}
    </header>
  );
}
