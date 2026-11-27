"use client";
/** 근태 대시보드: 요약 한 줄 복사 → 스낵바 */
import { useSnack } from "@/components/ux/Kit";

export default function CopySummary({ text }: { text: string }) {
  const snack = useSnack();
  return (
    <button type="button" className="ux-btn" onClick={async () => {
      try { await navigator.clipboard.writeText(text); snack({ text: "요약을 복사했어요 · 메신저에 붙여넣기" }); }
      catch { snack({ text: "복사하지 못했어요 (브라우저가 막음)" }); }
    }}>요약 복사</button>
  );
}
