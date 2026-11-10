/** 통합 디자인 대시보드 부품: 배너·숫자 카드·빠른 추가·메뉴 목록·작은 표·그래프·휴가·일정. 서버 컴포넌트.
 *  틀은 1차 B(남색 배너·숫자 카드), 창은 2차 F, 메뉴 목록은 1차 D, 형광펜·동그라미는 3차 L. */
import Link from "next/link";
import { Win } from "./win";
import { emojiOf, type MenuArea } from "@/lib/대시/menu";

export { Win };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function dateLong(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 ${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}요일`;
}

/** 배너 위 쪽지: 가장 급한 일 하나 */
export interface NoteProps { title: string; sub: string; href: string }
function Note({ note }: { note?: NoteProps | null }) {
  if (!note) return <div className="u-note"><b>오늘의 한 줄</b>급한 기한이 없습니다. 차분히 처리해요.</div>;
  return <Link className="u-note" href={note.href}><b>가장 급한 일</b>{note.title}<small>{note.sub}</small></Link>;
}
const Count = ({ n }: { n: number }) => <span className="u-circ"><b>{n}</b></span>;

/** 통합 대시보드 배너 */
export function Hello({ today, name, todo, note }: { today: string; name: string; todo: number; note?: NoteProps | null }) {
  return (
    <header className="u-hello">
      <span className="u-date">{dateLong(today)}</span>
      <h1>안녕하세요, <mark>{name}님</mark></h1>
      <p>{todo ? <>이번 주 안에 처리할 일이 <Count n={todo} />건 있습니다.</> : "이번 주 안에 처리할 일이 없습니다."}</p>
      <span className="u-cover" aria-hidden>🏢</span>
      <Note note={note} />
    </header>
  );
}

/** 업무별 대시보드 배너 (영역 색) */
export function AreaHello({ area, todo, note }: { area: MenuArea; todo: number; note?: NoteProps | null }) {
  return (
    <header className="u-hello ar" style={{ ["--c" as string]: area.color }}>
      <span className="u-date"><Link href="/">통합 대시보드</Link> › {area.label}</span>
      <h1>{area.label} <mark>대시보드</mark></h1>
      <p>{todo ? <>{area.desc} · 이번 주 안에 처리할 일 <Count n={todo} />건</> : area.desc}</p>
      <span className="u-cover" aria-hidden>{emojiOf(area.key)}</span>
      <Note note={note} />
    </header>
  );
}

export interface KpiProps { label: string; n: number | string; unit: string; sub?: string; icon: string; color: string; warn?: boolean; href: string }
export function Kpis({ items }: { items: KpiProps[] }) {
  return (
    <div className="u-kpis">
      {items.map((k) => (
        <Link key={k.label} href={k.href} className={`u-kpi${k.warn ? " warn" : ""}`}>
          <div className="h"><span style={{ ["--c" as string]: k.color }}>{emojiOf(k.icon)}</span>{k.label}</div>
          <div className="n">{k.warn ? <span className="u-circ">{k.n}</span> : k.n}<small>{k.unit}</small></div>
          <div className="t">{k.sub || " "}</div>
        </Link>
      ))}
    </div>
  );
}

export function QuickAdd({ items, className = "" }: { items: [href: string, label: string][]; className?: string }) {
  return (
    <Win en="QUICK ADD" ko="빠른 추가" className={className}>
      <div className="u-qb">{items.map(([h, l]) => <Link key={l} href={h}><b>+</b>{l}</Link>)}</div>
    </Win>
  );
}

/** 창 하나 (제목 + 오른쪽 '더 보기') */
export function Card({ title, en, more, children, className = "" }: { title: string; en: string; more?: [string, string]; children: React.ReactNode; className?: string }) {
  return <Win en={en} ko={title} more={more} className={className}>{children}</Win>;
}

/** 작은 표: 줄마다 누르면 이동 */
export function MiniTable({ rows, empty = "없습니다." }: { rows: { href: string; cells: React.ReactNode[] }[]; empty?: string }) {
  if (!rows.length) return <p className="fd-empty">{empty}</p>;
  return (
    <table className="fd-nt u-nt"><tbody>
      {rows.map((r, i) => (
        <tr key={i}>{r.cells.map((c, j) => <td key={j}><Link href={r.href}>{c}</Link></td>)}</tr>
      ))}
    </tbody></table>
  );
}

export const Tag = ({ tone = "k", children }: { tone?: string; children: React.ReactNode }) => <span className={`fd-tag ${tone}`}>{children}</span>;

/** 메뉴 목록 (1차 D 노션형): 영역 색 머리글 아래 이모지 목록. 영역 하나만 주면 묶음별로 나눠 세운다. */
export function MenuLists({ areas }: { areas: MenuArea[] }) {
  const one = areas.length === 1;
  const cols = one
    ? areas[0].groups.map((g) => ({ a: areas[0], head: g.label || areas[0].label, groups: [{ ...g, label: "" }] }))
    : areas.map((a) => ({ a, head: a.label, groups: a.groups }));
  return (
    <div className="u-menu">
      {cols.map(({ a, head, groups }, i) => (
        <div key={i} style={{ ["--c" as string]: a.color }}>
          <Link href={a.dash} className="u-mh">{emojiOf(a.key)} {head} <small>{a.en}</small></Link>
          {groups.map((g) => (
            <div key={g.label}>
              {g.label && <div className="u-mg">{g.label}</div>}
              {g.items.map((it) => <Link key={it.href} href={it.href} title={it.desc}><span>{emojiOf(it.href)}</span>{it.label}</Link>)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 영역 전체 메뉴 (업무별 대시보드 아래) */
export function AreaMenu({ area }: { area: MenuArea }) {
  return <Win en="MENU" ko={`${area.label} 전체 메뉴`} className="s12"><MenuLists areas={[area]} /></Win>;
}

/** 이번 주 휴가·출장 */
export function Leaves({ items, today }: { items: { day: string; name: string; type: string }[]; today: string }) {
  if (!items.length) return <p className="fd-empty">이번 주 휴가·출장이 없습니다.</p>;
  return (
    <ul className="u-lv">{items.map((l, i) => (
      <li key={i} className={l.day < today ? "past" : ""}><span>{WEEK[new Date(`${l.day}T00:00:00Z`).getUTCDay()]} {+l.day.slice(8)}일 · {l.name}</span>
        <Tag tone={l.type.includes("반") ? "b" : ["출장", "교육", "외근"].includes(l.type) ? "v" : l.type === "외출" ? "o" : "g"}>{l.type}</Tag></li>
    ))}</ul>
  );
}

/** 다가오는 일정 (이번 주 뒤의 기한) */
export interface SchedItem { day: string; title: string; sub: string; href: string; left: number; area: MenuArea }
export function Schedule({ items }: { items: SchedItem[] }) {
  if (!items.length) return <p className="fd-empty">다가오는 일정이 없습니다.</p>;
  return (
    <ul className="u-ev">{items.map((e, i) => (
      <li key={i}><Link href={e.href}>
        <span className="dt">{+e.day.slice(5, 7)}/{+e.day.slice(8)}</span>
        <span className="tt"><b>{e.title}</b><small>{e.sub}</small></span>
        <span className="ar" style={{ ["--c" as string]: e.area.color }}>{e.area.label}</span>
        <span className="dd">D-{e.left}</span>
      </Link></li>
    ))}</ul>
  );
}

// ---------------------------------------------------------------- 그래프 (SVG)
const empty = <p className="fd-empty">아직 자료가 없습니다.</p>;

/** 세로 막대 (부서별 인원·월별 휴가) */
export function Bars({ data, unit = "", hiLast = false }: { data: { label: string; n: number }[]; unit?: string; hiLast?: boolean }) {
  if (!data.length || data.every((d) => !d.n)) return empty;
  const W = Math.max(380, data.length * 46), H = 190, base = 160, max = Math.max(...data.map((d) => d.n), 1);
  const step = (W - 30) / data.length, bw = Math.min(40, step * 0.62);
  return (
    <svg className="fd-ch" viewBox={`0 0 ${W} ${H}`} role="img">
      {[0.5, 1].map((r) => <line key={r} x1="24" x2={W} y1={base - r * 125} y2={base - r * 125} stroke="#eef1f6" />)}
      <line x1="24" x2={W} y1={base} y2={base} stroke="#d9dee8" />
      {data.map((d, i) => {
        const x = 30 + i * step + (step - bw) / 2, h = (d.n / max) * 125;
        const last = hiLast && i === data.length - 1;
        return (
          <g key={d.label}>
            <rect x={x} y={base - h} width={bw} height={h} rx="6" fill={last ? "#e84340" : "#0c3994"} opacity={hiLast ? (last ? 1 : 0.85) : 1 - Math.min(i, 6) * 0.1} />
            <text x={x + bw / 2} y={base - h - 6} fontSize="12" fontWeight="800" textAnchor="middle" fill="#141a26">{d.n}{unit}</text>
            <text x={x + bw / 2} y={178} fontSize="10" textAnchor="middle" fill="#7a8396">{d.label.length > 5 ? `${d.label.slice(0, 5)}…` : d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 월별 1인 평균 주 근로시간 (면 그래프 + 48시간 주의선, 이번 달 점은 노랑) */
export function HoursLine({ data }: { data: { label: string; hours: number }[] }) {
  if (!data.length) return empty;
  const W = 480, lo = Math.min(36, ...data.map((d) => d.hours)) - 2, hi = Math.max(50, ...data.map((d) => d.hours)) + 1;
  const n = Math.max(data.length - 1, 1), last = data.length - 1;
  const x = (i: number) => 40 + (i * (W - 56)) / n, y = (t: number) => 160 - ((t - lo) / (hi - lo)) * 140;
  const pts = data.map((d, i) => `${x(i)},${y(d.hours)}`).join(" ");
  return (
    <svg className="fd-ch" viewBox={`0 0 ${W} 190`} role="img">
      <defs><linearGradient id="fd-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c3994" stopOpacity=".3" /><stop offset="1" stopColor="#0c3994" stopOpacity="0" /></linearGradient></defs>
      {[40, 44].map((t) => (
        <g key={t}><line x1="34" x2={W} y1={y(t)} y2={y(t)} stroke="#eef1f6" /><text x="30" y={y(t) + 3} fontSize="9" fill="#9aa3b2" textAnchor="end">{t}h</text></g>
      ))}
      <line x1="34" x2={W} y1={y(48)} y2={y(48)} stroke="#e84340" strokeDasharray="5 4" />
      <text x={W - 4} y={y(48) - 4} fontSize="9" fill="#e84340" textAnchor="end">주 48시간 주의선</text>
      {data.length > 1 && <polygon points={`${x(0)},160 ${pts} ${x(last)},160`} fill="url(#fd-ag)" />}
      <polyline points={pts} fill="none" stroke="#0c3994" strokeWidth="2.6" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={x(i)} cy={y(d.hours)} r={i === last ? 6 : 3.5} fill={i === last ? "#ffd600" : "#fff"} stroke="#0c3994" strokeWidth="2" />
          <text x={x(i)} y={178} fontSize="10" textAnchor="middle" fill="#7a8396">{d.label}</text>
        </g>
      ))}
      <text x={x(last)} y={y(data[last].hours) - 11} fontSize="11" fontWeight="800" textAnchor="middle" fill="#141a26">{data[last].hours}h</text>
    </svg>
  );
}
