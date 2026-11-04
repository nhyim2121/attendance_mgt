/** 예전 주소: 근태 기입은 직원별 시트의 '근태 기입' 탭으로 합쳤다. */
import { redirect } from "next/navigation";
import type { SearchParams } from "@/lib/data";

export default async function EditRedirect({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ tab: "edit" });
  for (const k of ["month", "emp"]) if (typeof sp[k] === "string") q.set(k, sp[k] as string);
  redirect(`/sheets?${q.toString()}`);
}
