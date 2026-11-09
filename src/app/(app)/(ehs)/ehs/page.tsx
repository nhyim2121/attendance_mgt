/** 환경안전보건 홈: 이 영역의 업무 대장과 다가오는 기한 (관리자만) */
import AreaBooks from "@/components/대장/AreaBooks";
import { requireAdminPage } from "@/lib/auth";

export const metadata = { title: "환경안전보건 · 통합관리시스템" };

export default async function Page() {
  await requireAdminPage();
  return (
    <>
      <h1>환경안전보건</h1>
      <p className="caption">환경 신고·안전 점검·건강검진 기록. 대장마다 적기·첨부·엑셀 내려받기·예전 엑셀 가져오기가 됩니다.</p>
      <AreaBooks area="ehs" />
    </>
  );
}
