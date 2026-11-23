/** 직원별 근태 > 휴일·연장 달력 (2026-11-23): 예전 출퇴근기록(그래프·시트·원본) 대신, 근태 기입의 달력에서 휴일근무·연장근무한 날만 보여 준다.
 *  날짜를 누르면 오른쪽 입력판에서 고치고, 근태 기입 탭과 같은 값으로 자동 저장된다. */
import PageHead from "@/components/대시/PageHead";
import SubNav from "@/components/인사노무/SubNav";
import { Suspense } from "react";
import type { SearchParams } from "@/lib/인사노무/data";
import EditView from "../edit/EditView";

export const metadata = { title: "휴일·연장 달력 · 근태관리통합시스템" };

export default async function PersonPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return <><PageHead href={"/person"} /><Suspense><SubNav group="staff" /></Suspense><EditView sp={sp} mode="cal" /></>;
}
