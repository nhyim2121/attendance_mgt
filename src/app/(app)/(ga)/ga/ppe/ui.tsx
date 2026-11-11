/** 보호구·피복 관리 화면 공통 조각 (서버 컴포넌트) */
import Link from "next/link";
import { type Cell, GROUP_COLOR, type PpeGroup, STATUS_LABEL } from "@/lib/총무/ppe";

/** 2026-11-03 → 26.11.03 */
export const ymd = (d?: string) => (d ? d.slice(2).replace(/-/g, ".") : "");

export function GroupChip({ g }: { g: PpeGroup }) {
  return <span className="gr-chip" style={{ ["--c" as string]: GROUP_COLOR[g] }}>{g}</span>;
}

/** 현황표 한 칸: 마지막 지급일 + 상태 색 */
export function CellView({ c, title }: { c: Cell; title?: string }) {
  if (c.status === "na") return <span className="pp-na">·</span>;
  if (c.status === "none") return <span className="pp-cell none" title={title}>미지급</span>;
  const tip = [title, `지급 ${c.last}`, c.size && `사이즈 ${c.size}`, c.next && `다음 교체 ${c.next}`, c.signed ? "수령 확인" : "수령 확인 안 됨"].filter(Boolean).join(" · ");
  return (
    <span className={`pp-cell ${c.status}`} title={tip}>
      {ymd(c.last)}{!c.signed && <i title="수령 확인 안 됨">✍</i>}
      {c.status !== "ok" && <small>{c.left !== undefined && c.left < 0 ? `${-c.left}일 지남` : c.left !== undefined ? `D-${c.left}` : STATUS_LABEL[c.status]}</small>}
    </span>
  );
}

export const TABS: [key: string, label: string][] = [
  ["", "📊 대시보드"], ["people", "🧍 개인별 현황"], ["give", "🎽 일괄 지급"], ["stock", "📦 재고·입고"], ["duty", "📋 업무분장·기준"],
];
export function Tabs({ tab }: { tab: string }) {
  return (
    <nav className="pp-tabs pp-noprint" aria-label="보호구·피복 관리">
      {TABS.map(([k, label]) => <Link key={k} href={k ? `/ga/ppe?tab=${k}` : "/ga/ppe"} className={tab === k ? "on" : ""}>{label}</Link>)}
      <span className="pp-tabs-sp" />
      <Link href="/ga/b/ppe">지급 기록 전체</Link>
      <Link href="/ga/b/ppepeople">사이즈·명단 대장</Link>
      <Link href="/ga/b/ppestock">입고 대장</Link>
    </nav>
  );
}

export function Msg({ msg }: { msg?: string }) {
  if (!msg) return null;
  const bad = /골라|적어|확인해|없는|실패/.test(msg);
  return <div className={`msg ${bad ? "err" : "ok"} pp-noprint`} style={{ marginBottom: 12 }}>{msg}</div>;
}
