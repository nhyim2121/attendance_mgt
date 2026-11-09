/** 통합 대시보드: 업무 영역(인사노무·총무·환경안전보건·인증·기타)의 화면을 앱 아이콘으로 모아 보이는 첫 화면.
 *  처리할 건수(문서·대장 기한·인증 일정)는 해당 아이콘 위 빨간 숫자로 보인다. */
import Link from "next/link";
import AppIcon, { AREA_ICON, iconFor } from "@/components/AppIcon";
import { requireUser } from "@/lib/auth";
import { HUB } from "@/lib/hub";
import { loadOpenMails } from "@/lib/총무/mail";
import { certAlert, loadCerts } from "@/lib/총무/issue";
import { alertsOf, loadItems } from "@/lib/인증/cert";
import { BOOKS, bookHref } from "@/lib/대장/books";
import { alertsOf as rowAlerts } from "@/lib/대장/logic";
import { loadBooks } from "@/lib/대장/store";
import { todayKst } from "@/lib/time";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default async function HubPage() {
  const user = await requireUser();
  const admin = user.role === "관리자";
  const today = todayKst();
  const openMails = admin ? (await loadOpenMails()).length : 0;
  const certDue = admin ? (await loadItems()).flatMap((c) => alertsOf(c, today)).length : 0;
  const dueCerts = admin ? (await loadCerts()).filter((c) => certAlert(c, today)).length : 0;
  // 아이콘(주소)별 처리할 건수
  const badge: Record<string, number> = { "/ga/mail": openMails, "/ga/certs": dueCerts, "/cert": certDue };
  for (const r of admin ? await loadBooks(BOOKS.map((b) => b.key)) : []) {
    const b = BOOKS.find((x) => x.key === r.book)!;
    const n = rowAlerts(b, r.data, today).length;
    if (n) badge[bookHref(b)] = (badge[bookHref(b)] ?? 0) + n;
  }
  const total = Object.values(badge).reduce((a, b) => a + b, 0);
  const [y, m, d] = today.split("-").map(Number);
  const dow = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const sections = HUB.filter((s) => admin || !["ga", "cert", "ehs", "misc"].includes(s.key));
  const alerts: [string, number, string][] = ([
    ["처리 중인 문서", openMails, "/ga/mail"],
    ["대장 기한", total - openMails - dueCerts - certDue, ""],
    ["인증 만료·심사 일정", certDue, "/cert"],
    ["만료 다가오는 공동인증서", dueCerts, "/ga/certs"],
  ] as [string, number, string][]).filter(([, n]) => n > 0);
  const pills = alerts.length === 0
    ? <span className="lh-pill ok">오늘 처리할 알림이 없습니다</span>
    : alerts.map(([l, n, h]) => h
      ? <Link key={l} href={h} className="lh-pill">{l} <b>{n}</b></Link>
      : <span key={l} className="lh-pill">{l} <b>{n}</b> <small>· 빨간 숫자 아이콘</small></span>);
  const dueOf = (links: [string, string][] = []) => links.reduce((a, [, h]) => a + (badge[h] ?? 0), 0);

  return (
    <div className="launch2">
      <header className="l2-hero">
        <div className="l2-text">
          <span className="lh-date">{y}년 {m}월 {d}일 ({dow})</span>
          <h1>안녕하세요, <b>{user.name}</b>님</h1>
          <p>에쓰엔 통합관리시스템 · 오늘 처리할 일 <b>{total}</b>건</p>
          <div className="lh-alerts">{pills}</div>
        </div>
        <Blocks dark />
      </header>

      <div className="l2-stats">
        {sections.map((s) => {
          const due = dueOf(s.links);
          return (
            <Link key={s.key} href={s.href} className="l2-stat" style={{ ["--c" as string]: s.color }}>
              <AppIcon name={AREA_ICON[s.key]} color={s.color} />
              <span className="l2-stat-t"><b>{s.label}</b><small>화면 {s.links?.length ?? 0}개</small></span>
              <span className={`l2-stat-n${due ? " warn" : ""}`}>{due}<small>건</small></span>
            </Link>
          );
        })}
      </div>

      <div className="l2-grid">
        {sections.map((s) => (
          <section key={s.key} className={`l2-sec${(s.links?.length ?? 0) > 6 ? " wide" : ""}`} style={{ ["--c" as string]: s.color }}>
            <div className="l2-head">
              <h2>{s.label}</h2>
              <span>{s.desc.replace(/\s*\(관리자만\)/, "")}</span>
            </div>
            <div className="l2-apps">
              {(s.links ?? []).map(([l, h]) => (
                <Link key={h} href={h} className="l2-app">
                  <AppIcon name={iconFor(h)} color={s.color} />
                  <span className="l2-app-l">{l}</span>
                  {(badge[h] ?? 0) > 0 ? <span className="app-badge">{badge[h]}</span> : <span className="l2-chev">›</span>}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** 로고 색(남색·빨강·회색)으로 쌓은 입체 블록 그림 */
function Blocks({ dark = false }: { dark?: boolean }) { // dark: 남색 배너 위
  return (
    <svg className="lh-art" viewBox="0 0 300 240" aria-hidden>
      <defs>
        <radialGradient id="lh-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={dark ? "#ffffff" : "#0c3994"} stopOpacity=".22" /><stop offset="1" stopColor={dark ? "#ffffff" : "#0c3994"} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="150" cy="200" rx="140" ry="36" fill="url(#lh-glow)" />
      {/* 받침 */}
      <polygon points="150,95 260,150 150,205 40,150" fill={dark ? "#f4f7fd" : "#2a56b8"} />
      <polygon points="40,150 150,205 150,225 40,170" fill={dark ? "#c9d5ee" : "#0c3994"} />
      <polygon points="150,205 260,150 260,170 150,225" fill={dark ? "#9fb2da" : "#0a2b70"} />
      {/* 남색 기둥 (뒤) */}
      <polygon points="185,47 211,60 185,73 159,60" fill="#7da2ef" />
      <polygon points="159,60 185,73 185,153 159,140" fill="#3b6fd6" />
      <polygon points="185,73 211,60 211,140 185,153" fill="#24509f" />
      {/* 빨강 큐브 */}
      <polygon points="115,88 151,106 115,124 79,106" fill="#ff8379" />
      <polygon points="79,106 115,124 115,168 79,150" fill="#e84340" />
      <polygon points="115,124 151,106 151,150 115,168" fill="#b92f2d" />
      {/* 회색 큐브 (앞) */}
      <polygon points="175,143 197,154 175,165 153,154" fill="#e1e4ea" />
      <polygon points="153,154 175,165 175,191 153,180" fill="#adb3bd" />
      <polygon points="175,165 197,154 197,180 175,191" fill="#898989" />
      {/* 떠 있는 흰 큐브 */}
      <g className="lh-float">
        <polygon points="115,30 131,38 115,46 99,38" fill="#ffffff" />
        <polygon points="99,38 115,46 115,62 99,54" fill="#e9edf4" />
        <polygon points="115,46 131,38 131,54 115,62" fill="#cbd3e0" />
      </g>
      <circle className="lh-float2" cx="240" cy="70" r="7" fill="#e84340" opacity=".85" />
      <circle className="lh-float" cx="60" cy="80" r="4.5" fill="#2a56b8" opacity=".6" />
    </svg>
  );
}
