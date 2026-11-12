/** 보안전산(IT) 대시보드 (관리자만): 숫자 카드 · 다가오는 기한 · 업무분장 IT-1~7 · 최근 기록 */
import AreaDash from "@/components/대시/AreaDash";
import { Card, type KpiProps, MiniTable, Tag } from "@/components/대시/parts";
import { requireAdminPage } from "@/lib/auth";
import { bookStats, ddayText, ddayTone, recentRows, todos } from "@/lib/대시/data";
import { menuOf } from "@/lib/대시/menu";
import { IT_DUTIES } from "@/lib/보안전산/duties";
import { dayLabel } from "@/lib/time";

export const metadata = { title: "보안전산 · 통합관리시스템" };

export default async function Page() {
  await requireAdminPage();
  const m = menuOf("it");
  const [stats, list, recent] = await Promise.all([bookStats("it"), todos(true), recentRows("it", 7)]);
  const st = (k: string) => stats.find((s) => s.key === k)!;
  const mine = list.filter((t) => t.area === "it");
  const sec = [st("seccheck"), st("incidents"), st("backups"), st("accessreview")];
  const secOpen = sec.reduce((t, s) => t + s.open, 0);
  const kpis: KpiProps[] = [
    { label: "다가오는 기한", n: mine.length, unit: "건", sub: mine[0] ? `${mine[0].title.slice(0, 16)} ${ddayText(mine[0].left)}` : "없음", icon: "gauge", color: "#e84340", warn: mine.length > 0, href: st("itroutine").href },
    { label: "전산장비", n: st("itassets").open, unit: "대", sub: `전체 ${st("itassets").total}대 (폐기 제외)`, icon: st("itassets").href, color: m.color, href: st("itassets").href },
    { label: "처리 중 요청·장애", n: st("helpdesk").open, unit: "건", sub: `이번 달 접수 ${st("helpdesk").thisMonth}건`, icon: st("helpdesk").href, color: "#0e7490", warn: st("helpdesk").open > 0, href: st("helpdesk").href },
    { label: "보안 조치 필요", n: secOpen, unit: "건", sub: "점검·사고·백업·접속기록 미결", icon: st("seccheck").href, color: "#be123c", warn: secOpen > 0, href: st("seccheck").href },
  ];
  const quick: [string, string][] = [
    [`${st("helpdesk").href}#form`, "전산 요청 접수"], [`${st("accounts").href}#form`, "계정 발급·회수"], [`${st("seccheck").href}#form`, "보안 점검 기록"],
    [`${st("backups").href}#form`, "백업 확인"], [`${st("visitors").href}#form`, "방문자 기록"], [`${st("itassets").href}#form`, "전산장비 등록"],
  ];
  return (
    <AreaDash area="it" kpis={kpis} quick={quick} layout="split">
      <Card en="DUTIES" title="업무분장 IT-1 ~ IT-7" more={["업무 목록", "/it/duties"]}>
        <MiniTable rows={IT_DUTIES.map((g) => {
          const ss = g.books.map(st);
          const alerts = ss.reduce((t, s) => t + s.alerts, 0);
          return {
            href: `/it/duties#${g.no}`,
            cells: [`${g.emoji} ${g.no} ${g.name}`, <span key="n" className="fd-sub">대장 {g.books.length}개 · 기록 {ss.reduce((t, s) => t + s.total, 0)}건</span>,
              alerts ? <Tag key="a" tone="r">기한 {alerts}</Tag> : <Tag key="a" tone="k">-</Tag>],
          };
        })} />
      </Card>
      <Card en="DUE" title="다가오는 기한">
        <MiniTable empty="다가오는 기한이 없습니다. 정기 업무 대장에 다음 예정일을 적어 두면 여기에 뜹니다." rows={mine.slice(0, 7).map((t) => ({
          href: t.href, cells: [t.title, t.sub.split(" · ")[0], <Tag key="d" tone={ddayTone(t.left) || "k"}>{ddayText(t.left)}</Tag>],
        }))} />
      </Card>
      <Card en="RECENT" title="최근 기록">
        <MiniTable empty="아직 기록이 없습니다." rows={recent.map(({ b, r, name }) => ({
          href: `${st(b.key).href}?edit=${r.id}#form`, cells: [r.day ? dayLabel(r.day, true) : "-", name, <span key="b" className="fd-sub">{b.title}</span>],
        }))} />
      </Card>
    </AreaDash>
  );
}
