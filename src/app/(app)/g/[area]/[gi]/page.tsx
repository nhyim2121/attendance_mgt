/** 대시보드가 따로 없는 묶음의 첫 화면 (2026-11-28 B′안): 묶음 이름과 안내만. 화면 바로가기 카드는 레이아웃의 GroupBar가 위에 보여 준다. */
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { menuFor } from "@/lib/대시/menu";

export default async function GroupHub({ params }: { params: Promise<{ area: string; gi: string }> }) {
  const { area, gi } = await params;
  const user = await requireUser();
  const a = menuFor(user.role === "관리자").find((x) => x.key === area);
  const g = a?.groups[Number(gi)];
  if (!a || !g) notFound();
  return (
    <div className="ux-title" style={{ marginTop: 4 }}>
      <div><small>{a.label}</small><h1>{g.label.replace(/^[\dA-Z]+(-\d+)?\.\s*/, "")}</h1></div>
      <span className="r">위 카드에서 화면을 골라 들어가세요 · {g.items.length}개</span>
    </div>
  );
}
