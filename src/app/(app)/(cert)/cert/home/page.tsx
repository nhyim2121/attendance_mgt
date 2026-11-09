/** 인증 대시보드 (F안, 관리자만): 유효 인증 수·90일 안 일정·만료 임박, 인증 목록과 일정 */
import AreaDash from "@/components/대시/AreaDash";
import { Card, MiniTable, Tag } from "@/components/대시/parts";
import { requireAdminPage } from "@/lib/auth";
import { ddayText, ddayTone } from "@/lib/대시/data";
import { alertsOf, loadItems } from "@/lib/인증/cert";
import { todayKst } from "@/lib/time";

export const metadata = { title: "인증 · 통합관리시스템" };

const STATUS_TONE: Record<string, string> = { 유효: "g", "진행 중": "b", 만료: "r", "취소·반납": "k" };

export default async function Page() {
  await requireAdminPage();
  const today = todayKst();
  const items = await loadItems();
  const alerts = items.flatMap((c) => alertsOf(c, today).map((a) => ({ c, a }))).sort((x, y) => x.a.left - y.a.left);
  const valid = items.filter((c) => c.status === "유효");
  const expiring = alerts.filter(({ a }) => a.kind === "만료" && a.left <= 30);
  const cats = [...new Set(valid.map((c) => c.category))];
  return (
    <AreaDash area="cert"
      kpis={[
        { label: "유효한 인증", n: valid.length, unit: "개", sub: cats.slice(0, 3).map((k) => `${k} ${valid.filter((c) => c.category === k).length}`).join(" · ") || "인증 현황", icon: "medal", color: "#15803d", href: "/cert" },
        { label: "90일 안 일정", n: alerts.length, unit: "건", sub: "사후심사·갱신·만료", icon: "calendarStar", color: "#b45309", warn: alerts.length > 0, href: "/cert" },
        { label: "만료 임박", n: expiring.length, unit: "개", sub: expiring[0] ? `${expiring[0].c.name} ${ddayText(expiring[0].a.left)}` : "30일 안", icon: "gauge", color: "#e84340", warn: expiring.length > 0, href: "/cert" },
        { label: "진행 중", n: items.filter((c) => c.status === "진행 중").length, unit: "건", sub: "신청·심사 중", icon: "list", color: "#0c3994", href: "/cert" },
      ]}
      quick={[["/cert#add", "인증 등록"], ["/cert", "일정·이력 추가"], ["/cert", "스캔본 올리기"]]}>
      <Card title="인증 목록" more={["전체", "/cert"]}>
        <MiniTable empty="등록한 인증이 없습니다." rows={items.slice(0, 8).map((c) => ({
          href: `/cert/item?id=${c.id}`,
          cells: [<b key="n">{c.name}</b>, c.expires ? `만료 ${c.expires}` : "상시", <Tag key="s" tone={STATUS_TONE[c.status] ?? "k"}>{c.status}</Tag>],
        }))} />
      </Card>
      <Card title="90일 안 심사·갱신 일정">
        <MiniTable empty="90일 안에 오는 일정이 없습니다." rows={alerts.slice(0, 8).map(({ c, a }) => ({
          href: `/cert/item?id=${c.id}`, cells: [c.name, a.label, a.day, <Tag key="d" tone={ddayTone(a.left) || "k"}>{ddayText(a.left)}</Tag>],
        }))} />
      </Card>
    </AreaDash>
  );
}
