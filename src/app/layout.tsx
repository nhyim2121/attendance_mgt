import type { Metadata } from "next";
import "./globals.css";
import "./f.css";
import "./d.css";

export const metadata: Metadata = {
  title: "통합관리시스템",
  description: "에쓰엔 통합관리시스템: 총무 · 인사노무(근태·휴가) · 환경안전보건 · 인증 · 기타",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
