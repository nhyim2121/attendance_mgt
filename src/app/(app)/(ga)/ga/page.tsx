/** 총무 대시보드 (F안, 관리자만): 처리 중인 문서·대장 기한·공동인증서 만료 */
import AreaDash from "@/components/대시/AreaDash";
import { Card, MiniTable, Tag } from "@/components/대시/parts";
import { requireAdminPage } from "@/lib/auth";
import { bookStats, ddayText, ddayTone, todos } from "@/lib/대시/data";
import { certAlert, loadCerts } from "@/lib/총무/issue";
import { loadOpenMails, mailNo } from "@/lib/총무/mail";
import { daysBetween, dayLabel, todayKst } from "@/lib/time";

export const metadata = { title: "총무 · 통합관리시스템" };

export default async function GaHome() {
  await requireAdminPage();
  const today = todayKst();
  const [open, certs, stats, list] = await Promise.all([loadOpenMails(), loadCerts(), bookStats("ga"), todos(true)]);
  const dueCerts = certs.filter((c) => certAlert(c, today));
  const st = (k: string) => stats.find((s) => s.key === k);
  const gaDue = list.filter((t) => t.area === "ga" && t.cat !== "문서");
  const nextMail = open.filter((m) => m.due).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  return (
    <AreaDash area="ga"
      kpis={[
        { label: "처리 중인 문서", n: open.length, unit: "건", sub: nextMail ? `회신 기한 ${dayLabel(nextMail.due!)}` : "문서 수발 대장", icon: "mail", color: "#0e7490", warn: open.length > 0, href: "/ga/mail?open=1" },
        { label: "대장 기한", n: gaDue.length, unit: "건", sub: gaDue[0] ? `${gaDue[0].title.slice(0, 18)} ${ddayText(gaDue[0].left)}` : "차량·SW·입찰 등", icon: "car", color: "#e84340", warn: gaDue.length > 0, href: "/ga/b/vehicles" },
        { label: "공동인증서 만료", n: dueCerts.length, unit: "개", sub: "60일 안", icon: "key", color: "#b45309", warn: dueCerts.length > 0, href: "/ga/certs" },
        { label: "비품", n: st("fixtures")?.open ?? 0, unit: "건", sub: `이번 달 운행 ${st("drivelog")?.thisMonth ?? 0}건`, icon: "box", color: "#0c3994", href: "/ga/b/fixtures" },
      ]}
      quick={[["/ga/mail#form", "받은·보낸 공문 등록"], ["/ga/issue#form", "서류 발급 기록"], ["/ga/b/fixtures#form", "비품 추가"], ["/ga/b/drivelog#form", "차량 운행 기록"], ["/ga/b/visitors#form", "방문자 기록"]]}>
      <Card en="DOCS" title="처리 중인 문서" more={["문서 수발 대장", "/ga/mail"]}>
        <MiniTable empty="처리 중인 문서가 없습니다." rows={open.slice(0, 6).map((m) => ({
          href: `/ga/mail?y=${m.year}&edit=${m.id}#form`,
          cells: [mailNo(m), <Tag key="d" tone={m.dir === "수신" ? "b" : "o"}>{m.dir}</Tag>, m.party, m.title,
            m.due ? <Tag key="due" tone={ddayTone(daysBetween(today, m.due)) || "k"}>{ddayText(daysBetween(today, m.due))}</Tag> : ""],
        }))} />
      </Card>
      <Card en="DUE" title="다가오는 만기·기한" more={["법인차량", "/ga/b/vehicles"]}>
        <MiniTable empty="30일 안에 오는 만기가 없습니다." rows={gaDue.slice(0, 6).map((t) => ({
          href: t.href, cells: [t.title, t.sub.split(" · ")[0], <Tag key="d" tone={ddayTone(t.left) || "k"}>{ddayText(t.left)}</Tag>],
        }))} />
      </Card>
    </AreaDash>
  );
}
