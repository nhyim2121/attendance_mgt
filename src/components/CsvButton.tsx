"use client";

/** 표를 CSV(엑셀에서 바로 열림, 한글 깨짐 방지 BOM 포함)로 내려받기 */
export default function CsvButton({ name, head, rows, label = "엑셀(CSV) 내려받기" }: {
  name: string; head: string[]; rows: (string | number)[][]; label?: string;
}) {
  const download = () => {
    const cell = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return <button type="button" className="pill noprint" onClick={download}>⬇ {label}</button>;
}
