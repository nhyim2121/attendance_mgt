"use client";

/** 인쇄 / PDF 저장 + 용지 방향(세로·가로) 선택.
 * 브라우저 인쇄 창의 방향은 페이지에서 용지를 정해 두면 바꿀 수 없어서, 여기서 고른 방향을 <html data-print>로 넘긴다
 * (globals.css의 @page port / land, PrintFit의 한 장 맞춤이 이 값을 따른다). 기본: 문서형(.doc-page)은 세로, 그 밖은 가로. */
import { useEffect, useState } from "react";

type Orient = "port" | "land";

export default function PrintButton({ label = "인쇄 / PDF 저장", className = "btn" }: { label?: string; className?: string }) {
  const [orient, setOrient] = useState<Orient>("land");
  useEffect(() => {
    setOrient(document.querySelector("main.main .doc-page") ? "port" : "land");
    return () => document.documentElement.removeAttribute("data-print");
  }, []);
  const print = () => {
    document.documentElement.setAttribute("data-print", orient);
    window.print();
  };
  return (
    <span className="print-ctl noprint">
      <span className="seg" role="group" aria-label="용지 방향">
        {([["port", "세로"], ["land", "가로"]] as const).map(([v, l]) => (
          <button key={v} type="button" className={orient === v ? "on" : ""} onClick={() => setOrient(v)}>{l}</button>
        ))}
      </span>
      <button type="button" className={className} onClick={print}>🖨 {label}</button>
    </span>
  );
}
