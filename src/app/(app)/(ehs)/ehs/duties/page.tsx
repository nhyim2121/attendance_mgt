/** 환경안전보건 업무분장·업무 목록 (설정: src/lib/대시/duties.ts) */
import DutiesView from "@/components/대시/DutiesView";
import { requireAdminPage } from "@/lib/auth";

export const metadata = { title: "업무분장 · 환경안전보건 · 통합관리시스템" };

export default async function Page() {
  await requireAdminPage();
  return <DutiesView area="ehs" />;
}
