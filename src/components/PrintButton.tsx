"use client";

/** 인쇄 / PDF 저장 (브라우저 인쇄 창에서 대상을 'PDF로 저장'으로 고르면 PDF가 된다) */
export default function PrintButton({ label = "인쇄 / PDF 저장", className = "btn" }: { label?: string; className?: string }) {
  return <button type="button" className={`${className} noprint`} onClick={() => window.print()}>🖨 {label}</button>;
}
