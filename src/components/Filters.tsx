import { Suspense } from "react";
import { type Filtered, loadBase } from "@/lib/data";
import FilterBar from "./FilterBar";

/** 화면 위 기간·부서·명단 필터 (서버에서 값 채움) */
export default async function Filters({ f, children }: { f: Filtered; children?: React.ReactNode }) {
  const base = await loadBase();
  return (
    <Suspense>
      <FilterBar months={base.months.map((m) => m.month).reverse()} month={f.filter.month} from={f.filter.from}
        to={f.filter.to} depts={f.depts} chosen={f.filter.depts} onlyRoster={f.filter.onlyRoster}
        hasRoster={base.roster.length > 0}>{children}</FilterBar>
    </Suspense>
  );
}

/** 주소 값을 바꾼 링크 */
export function hrefWith(sp: Record<string, string | string[] | undefined>, path: string,
  patch: Record<string, string | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  for (const [k, v] of Object.entries(patch)) (v === null ? q.delete(k) : q.set(k, v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
