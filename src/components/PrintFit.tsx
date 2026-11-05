"use client";

/** 인쇄할 때 화면 내용을 A4 한 장에 꽉 차게 줄이거나 키운다 (모든 페이지 공용, 레이아웃에 한 번).
 * - 인쇄 버튼에서 고른 방향(<html data-print>), 없으면 문서형(.doc-page)은 A4 세로, 그 밖에는 A4 가로
 * - 여러 장이 맞는 문서(직원별 내역서 여러 명, 첨부 이미지)는 그대로 둔다
 * - 근태 기입 여러 명은 한 사람에 한 장: 가장 긴 장이 A4 한 장에 들어가게
 * - 인쇄 직전에 인쇄 모양(.measuring)으로 바꿔 높이를 재고, 넘치면 너비를 넓혀 가며 한 장에 맞춘다 (키우지는 않음) */
import { useEffect } from "react";

const MM = 96 / 25.4; // 1mm = px
const MARGIN = 5; // globals.css @page 여백(mm)과 같게
const SAFE = 0.95; // 잰 높이와 실제 인쇄 높이의 차이(글꼴·줄바꿈)를 감안한 여유

export default function PrintFit() {
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("main.main");
    if (!main) return;
    const reset = () => {
      document.documentElement.classList.remove("measuring");
      main.style.zoom = "";
      main.style.width = "";
    };
    const before = () => {
      reset();
      if (main.querySelector(".org-sheet")) return; // 조직도는 자체 맞춤
      if (main.querySelectorAll(".doc-page.person").length > 1 || main.querySelector(".doc-fig")) return; // 여러 장 문서
      document.documentElement.classList.add("measuring");
      // 인쇄 버튼에서 고른 방향 (없으면 문서형은 세로, 그 밖은 가로)
      const pick = document.documentElement.getAttribute("data-print");
      const portrait = pick ? pick === "port" : !!main.querySelector(".doc-page");
      const W = ((portrait ? 210 : 297) - 2 * MARGIN) * MM, H = ((portrait ? 297 : 210) - 2 * MARGIN) * MM * SAFE;
      // 배율 z로 줄이면 배치 너비는 W/z, 인쇄 높이는 (그 너비에서의 높이) × z. 이것이 H가 되도록 몇 번 맞춘다.
      let z = 1;
      for (let i = 0; i < 5; i++) {
        main.style.width = `${W / z}px`;
        // 근태 기입 여러 명: 한 사람이 한 장이므로 가장 긴 한 장을 기준으로 맞춘다
        const pages = main.querySelectorAll<HTMLElement>(".edit-print");
        const h = pages.length > 1 ? Math.max(...[...pages].map((p) => p.offsetHeight)) : main.scrollHeight;
        if (!h) break;
        const nz = Math.max(0.35, Math.min(1, H / h)); // 키우지 않는다
        if (Math.abs(nz - z) < 0.005) { z = nz; break; }
        z = nz;
      }
      main.style.width = `${W / z}px`;
      main.style.zoom = String(z);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", reset);
    };
  }, []);
  return null;
}
