/** 직원별 근태 = 근태 기입 (2026-11-27): 휴일·연장 달력은 근태 캘린더로 옮기고, 여기에는 근태 기입만.
 *  2026-11-28 새 UI: 고정헤더(햄버거 드로어·뒤로가기), 그 달 요약 카드(모달·툴팁·바운스 뱃지·진행막대), 다음 직원 플로팅버튼 */
import { SnackHost, UxHead } from "@/components/ux/Kit";
import { ATT_MENU } from "@/lib/인사노무/attMenu";
import type { SearchParams } from "@/lib/인사노무/data";
import EditView from "../edit/EditView";

export const metadata = { title: "직원별 근태 · 근태관리통합시스템" };

export default async function PersonPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return (
    <SnackHost>
      <div className="ux-page">
        <UxHead crumb="인사노무 › 근태관리" title="직원별 근태" menu={ATT_MENU} />
        <div><EditView sp={sp} /></div>
      </div>
    </SnackHost>
  );
}
