/** /leave/<화면>: 휴가 공간의 각 화면 */
import { notFound, redirect } from "next/navigation";
import type { SearchParams } from "@/lib/인사노무/data";
import LeaveView, { type LeaveTab, TABS } from "../LeaveView";

const isTab = (t: string): t is LeaveTab => t in TABS;

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  return { title: `${isTab(tab) ? TABS[tab] : "휴가"} · 근태관리통합시스템` };
}

export default async function LeaveTabPage({ params, searchParams }: {
  params: Promise<{ tab: string }>; searchParams: Promise<SearchParams>;
}) {
  const { tab } = await params;
  if (!isTab(tab)) notFound();
  const sp = await searchParams;
  const moved: Partial<Record<LeaveTab, [string, Record<string, string>]>> = {
    report: ["status", { view: typeof sp.view === "string" && sp.view === "person" ? "person" : "summary" }],
    adjust: ["register", { sec: "adjust" }], policy: ["register", { sec: "policy" }],
  };
  const m = moved[tab];
  if (m) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
    for (const [k, v] of Object.entries(m[1])) q.set(k, v);
    redirect(`/leave/${m[0]}?${q}`);
  }
  return <LeaveView sp={sp} tab={tab} />;
}
