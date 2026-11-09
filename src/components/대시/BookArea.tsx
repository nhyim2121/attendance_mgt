/** 대장만 있는 영역(환경안전보건·기타)의 대시보드: 대장별 숫자 카드 + 다가오는 기한 + 최근 기록 */
import AreaDash from "./AreaDash";
import { Card, type KpiProps, MiniTable, Tag } from "./parts";
import { bookStats, ddayText, ddayTone, recentRows, todos } from "@/lib/대시/data";
import { menuOf } from "@/lib/대시/menu";
import { dayLabel } from "@/lib/time";

export default async function BookArea({ area }: { area: "ehs" | "misc" }) {
  const m = menuOf(area);
  const [stats, list, recent, openRows] = await Promise.all([bookStats(area), todos(true), recentRows(area, 6), recentRows(area, 6, true)]);
  const mine = list.filter((t) => t.area === area);
  const kpis: KpiProps[] = [
    { label: "다가오는 기한", n: mine.length, unit: "건", sub: mine[0] ? `${mine[0].title.slice(0, 16)} ${ddayText(mine[0].left)}` : "없음", icon: "gauge", color: "#e84340", warn: mine.length > 0, href: stats[0]?.href ?? m.dash },
    ...(stats.length === 1
      ? [
        { label: "진행 중", n: stats[0].open, unit: "건", sub: stats[0].title, icon: "list", color: m.color, href: stats[0].href },
        { label: "끝난 일", n: stats[0].closed, unit: "건", sub: "완료·보류", icon: "calendarCheck", color: "#15803d", href: stats[0].href },
        { label: "이번 달 추가", n: stats[0].thisMonth, unit: "건", sub: `전체 ${stats[0].total}건`, icon: "calendar", color: "#0c3994", href: stats[0].href },
      ]
      : stats.slice(0, 3).map((s) => ({ label: s.title, n: s.total, unit: "건", sub: s.alerts ? `기한 ${s.alerts}건 · 이번 달 ${s.thisMonth}건` : `이번 달 ${s.thisMonth}건`,
        icon: s.href, color: m.color, warn: s.alerts > 0, href: s.href }))),
  ];
  const quick: [string, string][] = stats.map((s) => [`${s.href}#form`, `${s.title.replace(/ (관리|대장|일지)$/, "")} 기록`]);
  return (
    <AreaDash area={area} kpis={kpis} quick={quick}>
      {stats.length === 1 ? (
        <Card title="진행 중인 일" more={["전체", stats[0].href]}>
          <MiniTable empty="진행 중인 일이 없습니다." rows={openRows.map(({ r, name }) => ({
            href: `${stats[0].href}?edit=${r.id}#form`,
            cells: [name, r.data.status ? <Tag key="s" tone={r.data.status === "진행 중" ? "b" : "k"}>{r.data.status}</Tag> : "", r.data.due ? `기한 ${dayLabel(r.data.due)}` : ""],
          }))} />
        </Card>
      ) : (
        <Card title="다가오는 기한">
          <MiniTable empty="다가오는 기한이 없습니다." rows={mine.slice(0, 6).map((t) => ({
            href: t.href, cells: [t.title, t.sub.split(" · ")[0], <Tag key="d" tone={ddayTone(t.left) || "k"}>{ddayText(t.left)}</Tag>],
          }))} />
        </Card>
      )}
      <Card title="최근 기록">
        <MiniTable empty="아직 기록이 없습니다." rows={recent.map(({ b, r, name }) => ({
          href: `${stats.find((s) => s.key === b.key)!.href}?edit=${r.id}#form`, cells: [r.day ? dayLabel(r.day, true) : "-", name, <span key="b" className="fd-sub">{b.title}</span>],
        }))} />
      </Card>
    </AreaDash>
  );
}
