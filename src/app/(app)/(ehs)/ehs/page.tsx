/** 환경안전보건 대시보드 (관리자만) — 01 히어로: 무재해 일수를 크게 (산재 처리 대장의 마지막 재해일부터, 2026-11-12) */
import BookArea from "@/components/대시/BookArea";
import { requireAdminPage } from "@/lib/auth";
import { loadBooks } from "@/lib/대장/store";
import { daysBetween, todayKst } from "@/lib/time";

export const metadata = { title: "환경안전보건 · 통합관리시스템" };

export default async function Page() {
  await requireAdminPage();
  const today = todayKst();
  const inj = (await loadBooks(["injuries"])).map((r) => r.day).filter((d): d is string => !!d && d <= today).sort();
  const last = inj.at(-1);
  const y = today.slice(0, 4);
  const thisYear = inj.filter((d) => d.startsWith(y)).length;
  return (
    <BookArea area="ehs" layout="hero" hero={{
      label: "무재해", n: last ? daysBetween(last, today) : "기록 없음", unit: last ? "일째" : "",
      sub: last ? `마지막 재해 ${last.replaceAll("-", ".")} · 올해 ${thisYear}건` : "산재 처리 대장에 재해 기록이 없습니다", href: "/hr/b/injuries",
    }} />
  );
}
