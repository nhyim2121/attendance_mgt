import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "근태관리통합시스템",
  description: "CAPS 출입기록 · 하이웍스 근태 통합 관리",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
