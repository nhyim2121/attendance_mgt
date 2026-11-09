/** 새 사이트(F안) 대시보드 부품: 배너·숫자 카드·빠른 추가·전체 메뉴·작은 표·그래프. 서버 컴포넌트. */
import Link from "next/link";
import { emojiOf, type MenuArea } from "@/lib/대시/menu";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function dateLong(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 ${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}요일`;
}

/** 통합 대시보드 배너 */
export function Hello({ today, name, todo }: { today: string; name: string; todo: number }) {
  return (
    <header className="fd-hello">
      <span className="fd-date">{dateLong(today)}</span>
      <h1>안녕하세요, <em>{name}</em>님</h1>
      <p>{todo ? <>처리할 일이 <b>{todo}</b>건 있습니다.</> : "오늘 처리할 일이 없습니다."}</p>
    </header>
  );
}

/** 업무별 대시보드 배너 (영역 색) */
export function AreaHello({ area }: { area: MenuArea }) {
  return (
    <header className="fd-hello ar" style={{ ["--c" as string]: area.color }}>
      <div className="fd-crumb"><Link href="/">통합 대시보드</Link> › {area.label}</div>
      <div className="fd-ah">
        <span className="fd-pico">{emojiOf(area.key)}</span>
        <div><h1>{area.label} 대시보드</h1><p>{area.desc}</p></div>
      </div>
    </header>
  );
}

export interface KpiProps { label: string; n: number | string; unit: string; sub?: string; icon: string; color: string; warn?: boolean; href: string }
export function Kpis({ items }: { items: KpiProps[] }) {
  return (
    <div className="fd-kpis">
      {items.map((k) => (
        <Link key={k.label} href={k.href} className={`fd-card fd-kpi${k.warn ? " warn" : ""}`}>
          <span className="em">{emojiOf(k.icon)}</span>
          <div className="kb"><div className="l">{k.label}</div>
          <div className="n">{k.n}<small>{k.unit}</small></div>
          <div className="t">{k.sub || " "}</div></div>
        </Link>
      ))}
    </div>
  );
}

export function QuickAdd({ items }: { items: [href: string, label: string][] }) {
  return (
    <div className="fd-card fd-w">
      <h4>⚡ 빠른 추가</h4>
      <div className="fd-qb">{items.map(([h, l]) => <Link key={l} href={h}>＋ {l}</Link>)}</div>
    </div>
  );
}

/** 카드 제목 + 오른쪽 '전체 ›' 링크 */
export function Card({ title, more, children, className = "" }: { title: string; more?: [string, string]; children: React.ReactNode; className?: string }) {
  return (
    <section className={`fd-card ${className}`}>
      <h3>{title}{more && <small><Link href={more[1]}>{more[0]} ›</Link></small>}</h3>
      {children}
    </section>
  );
}

/** 작은 표: 줄마다 누르면 이동 */
export function MiniTable({ rows, empty = "없습니다." }: { rows: { href: string; cells: React.ReactNode[] }[]; empty?: string }) {
  if (!rows.length) return <p className="fd-empty">{empty}</p>;
  return (
    <table className="fd-nt"><tbody>
      {rows.map((r, i) => (
        <tr key={i}>{r.cells.map((c, j) => <td key={j}><Link href={r.href}>{c}</Link></td>)}</tr>
      ))}
    </tbody></table>
  );
}

export const Tag = ({ tone = "k", children }: { tone?: string; children: React.ReactNode }) => <span className={`fd-tag ${tone}`}>{children}</span>;

/** 영역 전체 메뉴 (아이콘 카드) */
export function AreaMenu({ area }: { area: MenuArea }) {
  return (
    <section className="fd-card fd-menu">
      <h3>{area.label} 전체 메뉴</h3>
      {area.groups.map((g) => (
        <div key={g.label}>
          {g.label && <div className="fd-gtitle" style={{ ["--c" as string]: area.color }}>{g.label}</div>}
          <div className="fd-ahome">
            {g.items.map((it) => (
              <Link key={it.href} href={it.href} className="fd-acard" style={{ ["--c" as string]: area.color }}>
                <span className="fd-em">{emojiOf(it.href)}</span>
                <div><b>{it.label}</b>{it.desc && <span className="d">{it.desc}</span>}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** 업무 영역 바로가기 (통합 대시보드 아래) */
export function AreaTiles({ areas }: { areas: MenuArea[] }) {
  return (
    <div className="fd-areas">
      {areas.map((a) => (
        <Link key={a.key} href={a.dash} className="fd-area" style={{ ["--c" as string]: a.color }}>
          <span className="fd-em lg">{emojiOf(a.key)}</span>
          {a.label}
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 그래프 (SVG)
const empty = <p className="fd-empty">아직 자료가 없습니다.</p>;

/** 세로 막대 (부서별 인원·월별 휴가) */
export function Bars({ data, unit = "", hiLast = false }: { data: { label: string; n: number }[]; unit?: string; hiLast?: boolean }) {
  if (!data.length || data.every((d) => !d.n)) return empty;
  const W = Math.max(380, data.length * 46), H = 190, base = 160, max = Math.max(...data.map((d) => d.n), 1);
  const step = (W - 30) / data.length, bw = Math.min(38, step * 0.62);
  return (
    <svg className="fd-ch" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1="24" x2={W} y1={base} y2={base} stroke="#e7eaf0" />
      {data.map((d, i) => {
        const x = 30 + i * step + (step - bw) / 2, h = (d.n / max) * 125;
        const last = hiLast && i === data.length - 1;
        return (
          <g key={d.label}>
            <rect x={x} y={base - h} width={bw} height={h} rx="5" fill={last ? "#e84340" : i ? "#2a56b8" : "#0c3994"} opacity={hiLast ? 1 : 1 - Math.min(i, 6) * 0.08} />
            <text x={x + bw / 2} y={base - h - 6} fontSize="11" fontWeight="700" textAnchor="middle" fill="#37352f">{d.n}{unit}</text>
            <text x={x + bw / 2} y={178} fontSize="10" textAnchor="middle" fill="#787774">{d.label.length > 5 ? `${d.label.slice(0, 5)}…` : d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 월별 1인 평균 주 근로시간 (면 그래프 + 48시간 주의선) */
export function HoursLine({ data }: { data: { label: string; hours: number }[] }) {
  if (!data.length) return empty;
  const W = 480, lo = Math.min(36, ...data.map((d) => d.hours)) - 2, hi = Math.max(50, ...data.map((d) => d.hours)) + 1;
  const n = Math.max(data.length - 1, 1);
  const x = (i: number) => 40 + (i * (W - 56)) / n, y = (t: number) => 160 - ((t - lo) / (hi - lo)) * 140;
  const pts = data.map((d, i) => `${x(i)},${y(d.hours)}`).join(" ");
  return (
    <svg className="fd-ch" viewBox={`0 0 ${W} 190`} role="img">
      <defs><linearGradient id="fd-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c3994" stopOpacity=".35" /><stop offset="1" stopColor="#0c3994" stopOpacity="0" /></linearGradient></defs>
      {[40, 44].map((t) => (
        <g key={t}><line x1="34" x2={W} y1={y(t)} y2={y(t)} stroke="#eee" /><text x="30" y={y(t) + 3} fontSize="9" fill="#999" textAnchor="end">{t}h</text></g>
      ))}
      <line x1="34" x2={W} y1={y(48)} y2={y(48)} stroke="#e84340" strokeDasharray="4 4" />
      <text x={W - 4} y={y(48) - 4} fontSize="9" fill="#e84340" textAnchor="end">주 48시간 주의선</text>
      {data.length > 1 && <polygon points={`${x(0)},160 ${pts} ${x(data.length - 1)},160`} fill="url(#fd-ag)" />}
      <polyline points={pts} fill="none" stroke="#0c3994" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={x(i)} cy={y(d.hours)} r="3.5" fill="#fff" stroke="#0c3994" strokeWidth="2" />
          <text x={x(i)} y={178} fontSize="10" textAnchor="middle" fill="#787774">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}
