/** 직원별 근태 > 근태 기입 (/sheets?tab=edit). 예전 [시트·엑셀]은 데이터 관리 > 내려받기로 옮겼다. */
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SubNav from "@/components/인사노무/SubNav";
import type { SearchParams } from "@/lib/인사노무/data";
import EditView from "../edit/EditView";

export const metadata = { title: "근태 기입 · 근태관리통합시스템" };

export default async function SheetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  if (sp.tab !== "edit") {
    const q = new URLSearchParams({ tab: "download" });
    for (const [k, v] of Object.entries(sp)) if (k !== "tab" && typeof v === "string") q.set(k, v);
    redirect(`/upload?${q}`);
  }
  return <><h1 className="noprint">직원별 근태</h1><Suspense><SubNav group="staff" /></Suspense><EditView sp={sp} /></>;
}
