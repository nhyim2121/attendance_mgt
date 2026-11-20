/** 총무 대시보드 (관리자만). 총무 업무는 하나씩 다시 만드는 중 (2026-11-20) — 다 만든 업무만 여기에 올린다.
 *  지금: 보호구·피복 관리 */
import Link from "next/link";
import AreaDash from "@/components/대시/AreaDash";
import { Card } from "@/components/대시/parts";
import { requireAdminPage } from "@/lib/auth";

export const metadata = { title: "총무 · 통합관리시스템" };

export default async function GaHome() {
  await requireAdminPage();
  return (
    <AreaDash area="ga" layout="hero-cards" kpis={[]} quick={[["/ga/ppe", "보호구·피복 관리"]]}>
      <Card en="BUILDING" title="총무 업무 만드는 중">
        <p className="muted" style={{ margin: 0 }}>총무 업무를 하나씩 새로 만들고 있습니다. 첫 번째는 <Link href="/ga/ppe">🦺 보호구·피복 관리</Link>입니다.</p>
      </Card>
    </AreaDash>
  );
}
