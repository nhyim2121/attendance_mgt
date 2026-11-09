/** 예전 주소: 일일 근태현황은 일일 현황의 '근태 보고서' 탭으로 합쳤다. */
import { redirect } from "next/navigation";
import type { SearchParams } from "@/lib/인사노무/data";
import { isDateStr } from "@/lib/time";

export default async function ReportRedirect({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  redirect(`/daily?tab=report${isDateStr(sp.day) ? `&day=${sp.day}` : ""}`);
}
