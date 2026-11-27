/** 근태 캘린더 > 휴일·연장 달력 (2026-11-27 직원별 근태에서 옮김): 영업팀(임택권)·생산팀·품질팀의 휴일근무·연장근무를 한 달력에. */
import PageHead from "@/components/대시/PageHead";
import SubNav from "@/components/인사노무/SubNav";
import { Suspense } from "react";
import type { SearchParams } from "@/lib/인사노무/data";
import EditView from "../../edit/EditView";

export const metadata = { title: "휴일·연장 달력 · 근태관리통합시스템" };

export default async function WorkCalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return <><PageHead href={"/calendar"} /><Suspense><SubNav group="trip" /></Suspense><EditView sp={sp} mode="cal" /></>;
}
