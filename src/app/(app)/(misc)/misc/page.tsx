/** 기타 대시보드 (F안, 관리자만) */
import BookArea from "@/components/대시/BookArea";
import { requireAdminPage } from "@/lib/auth";

export const metadata = { title: "기타 · 통합관리시스템" };

export default async function Page() {
  await requireAdminPage();
  return <BookArea area="misc" />;
}
