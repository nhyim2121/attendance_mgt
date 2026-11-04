import type { NextConfig } from "next";

// 예전 Streamlit 사이트 주소(즐겨찾기) → 새 화면 주소
const OLD_PATHS: Record<string, string> = {
  대시보드: "/",
  일일_현황: "/daily",
  일일_근태현황: "/report",
  개인별_조회: "/person",
  근태_기입: "/edit",
  직원별_분할: "/sheets",
  파일_업로드: "/upload",
  직원_관리: "/employees",
  사용자_관리: "/users",
};

const nextConfig: NextConfig = {
  async redirects() {
    // 브라우저에 따라 한글 주소가 그대로 오거나 %인코딩되어 오므로 둘 다 연결
    return Object.entries(OLD_PATHS).flatMap(([old, to]) =>
      [...new Set([`/${old}`, `/${encodeURIComponent(old)}`])].map((source) => ({ source, destination: to, permanent: false })),
    );
  },
  // exceljs·xlsx는 서버에서만 쓰고 번들하지 않는다
  serverExternalPackages: ["exceljs", "xlsx", "nodemailer"],
  experimental: {
    // 캡스 월별 파일·근태현황 파일 업로드 (예전 Streamlit 설정 200MB, 실제 파일은 수 MB)
    serverActions: { bodySizeLimit: "50mb" },
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
