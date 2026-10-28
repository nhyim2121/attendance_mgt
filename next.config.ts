import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs·xlsx는 서버에서만 쓰고 번들하지 않는다
  serverExternalPackages: ["exceljs", "xlsx", "nodemailer"],
  experimental: {
    // 캡스 월별 파일·근태현황 파일 업로드 (예전 Streamlit 설정 200MB, 실제 파일은 수 MB)
    serverActions: { bodySizeLimit: "50mb" },
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
