"use client";

/** 메뉴 하나에 묶인 화면들 사이를 오가는 탭 (기간·부서 필터는 유지). */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const KEEP = ["month", "from", "to", "dept", "all", "day"];
type Tab = { href: string; label: string; tab?: string }; // tab: 같은 주소 안의 ?tab= 값 (없으면 tab 없음)

const GROUPS: Record<string, Tab[]> = {
  staff: [{ href: "/person", label: "출퇴근기록" }, { href: "/sheets", label: "근태 기입", tab: "edit" }],
  trip: [{ href: "/calendar", label: "근태 캘린더" }, { href: "/evidence", label: "출장 증빙" }],
  hours: [{ href: "/hours", label: "기간 리포트" }, { href: "/depts", label: "부서별 근무" }],
};

export default function SubNav({ group }: { group: keyof typeof GROUPS }) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  KEEP.forEach((k) => sp.get(k) && keep.set(k, sp.get(k)!));
  return (
    <div className="tabs noprint">
      {GROUPS[group].map((t) => {
        const q = new URLSearchParams(keep);
        if (t.tab) q.set("tab", t.tab);
        // 근태 기입은 직원 이름도 넘긴다 (시트 미리보기에서 보던 직원)
        if (t.tab === "edit" && sp.get("preview")) q.set("emp", sp.get("preview")!);
        const on = path === t.href && (sp.get("tab") ?? "") === (t.tab ?? "");
        return <Link key={t.label} href={q.size ? `${t.href}?${q}` : t.href} className={on ? "on" : ""} scroll={false}>{t.label}</Link>;
      })}
    </div>
  );
}
