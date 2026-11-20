"use client";
/** 정비적격심사 등급표 인쇄: A4 가로 한 장에 꽉 차게 (2026-11-20).
 *  인쇄 직전 .qv-page를 종이 폭으로 놓고 재서, 폭·높이 중 먼저 닿는 쪽에 맞춰 키우거나 줄인다. 너무 길면 폭에만 맞춰 다음 장으로 넘긴다. */
import { useEffect } from "react";

const [W, H] = [1095, 755]; // A4 가로 297×210mm − 여백 5mm (96dpi px), 약간의 안전 여유

export default function QvPrintFit() {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".qv-page");
    if (!el) return;
    const before = () => {
      el.style.zoom = "";
      el.classList.add("qv-printing");
      const parts = [...el.querySelectorAll<HTMLElement>(":scope > .qv-print")]; // 인쇄되는 칸만 잰다 (요약 + 등급표)
      const size = (z: number) => {           // 확대 z일 때 종이 폭에 맞는 화면 폭으로 놓고 잰 실제 크기
        el.style.width = `${W / z}px`;
        return { w: Math.max(...parts.map((p) => p.scrollWidth)) * z, h: parts.reduce((t, p) => t + p.offsetHeight + 10, 0) * z };
      };
      let z = 1.6;                            // 크게부터 줄여 가며 한 장(폭·높이)에 들어가는 첫 배율
      for (; z > 1; z -= 0.05) { const s = size(z); if (s.w <= W + 1 && s.h <= H) break; }
      if (z <= 1) {                           // 1배로도 넘치면: 폭은 맞추고, 높이가 조금 넘치면 한 장으로 줄이고, 많이 넘치면 여러 장
        const s = size(1);
        z = Math.min(1, W / s.w);
        if (s.h * z > H && s.h * z < H * 1.35) z = Math.min(z, H / s.h);
        el.style.width = `${W / z}px`;
      }
      el.style.zoom = String(z);
    };
    const after = () => { el.style.zoom = ""; el.style.width = ""; el.classList.remove("qv-printing"); };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  return null;
}
