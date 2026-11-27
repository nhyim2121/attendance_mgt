/** 직원별 근태 = 근태 기입 (2026-11-27): 휴일·연장 달력은 근태 캘린더로 옮기고, 여기에는 근태 기입만. */
import PageHead from "@/components/대시/PageHead";
import type { SearchParams } from "@/lib/인사노무/data";
import EditView from "../edit/EditView";

export const metadata = { title: "근태 기입 · 근태관리통합시스템" };

export default async function PersonPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return <><PageHead href={"/person"} /><EditView sp={sp} /></>;
}
