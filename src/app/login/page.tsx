import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const metadata = { title: "로그인 · 근태관리통합시스템" };

async function hasAccounts(): Promise<boolean> {
  const admin = createAdminClient();
  const [a, b] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("legacy_users").select("login_id", { count: "exact", head: true }),
  ]);
  return (a.count ?? 0) + (b.count ?? 0) > 0;
}

export default async function LoginPage() {
  await connection(); // 요청마다 계정 유무를 다시 확인
  const ready = await hasAccounts();
  return (
    <div className="login">
      <div className="card">
        <h1>근태관리통합시스템</h1>
        <p className="caption">CAPS 출입기록 · 하이웍스 근태 통합 관리</p>
        {ready ? <LoginForm /> : (
          <div className="msg warn">
            등록된 계정이 없습니다. 서버 PC의 프로젝트 폴더에서 관리자 계정을 먼저 만들어 주세요.
            {"\n\n"}<code>npm run add-user</code>{"\n\n"}만든 뒤 이 화면을 새로고침하세요.
          </div>
        )}
      </div>
    </div>
  );
}
