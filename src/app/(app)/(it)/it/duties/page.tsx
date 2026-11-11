/** 보안전산 업무분장·업무 목록 (설정: src/lib/보안전산/duties.ts) */
import DutiesView from "@/components/대시/DutiesView";
import { requireAdminPage } from "@/lib/auth";

export const metadata = { title: "업무분장 · 보안전산 · 통합관리시스템" };

export default async function Page() {
  await requireAdminPage();
  return <DutiesView area="it" />;
}
