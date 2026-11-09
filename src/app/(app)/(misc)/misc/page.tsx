/** 기타 홈: 이 영역의 업무 대장과 다가오는 기한 (관리자만) */
import AreaBooks from "@/components/대장/AreaBooks";
import { requireAdminPage } from "@/lib/auth";

export const metadata = { title: "기타 · 통합관리시스템" };

export default async function Page() {
  await requireAdminPage();
  return (
    <>
      <h1>기타</h1>
      <p className="caption">다른 영역에 넣기 어려운 진행 건과 할 일. 대장마다 적기·첨부·엑셀 내려받기·예전 엑셀 가져오기가 됩니다.</p>
      <AreaBooks area="misc" />
    </>
  );
}
