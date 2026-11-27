/** 예전 주소: 근태 기입(?tab=edit)은 직원별 근태(/person)로, 시트·엑셀은 데이터 관리 > 내려받기로 옮겼다. */
import { redirect } from "next/navigation";
import type { SearchParams } from "@/lib/인사노무/data";

export default async function SheetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(sp.tab === "edit" ? {} : { tab: "download" });
  for (const [k, v] of Object.entries(sp)) if (k !== "tab" && typeof v === "string") q.set(k, v);
  redirect(sp.tab === "edit" ? (q.size ? `/person?${q}` : "/person") : `/upload?${q}`);
}
