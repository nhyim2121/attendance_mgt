/** 사용자 관리 (관리자): 관리팀 계정 추가·역할 변경·비밀번호 초기화·삭제, 내 비밀번호 변경. */
import PageHead from "@/components/대시/PageHead";
import { Table } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fullKst } from "@/lib/time";
import { DeleteUser, MyPassword, UpsertUser } from "./forms";

export const metadata = { title: "사용자 관리 · 근태관리통합시스템" };

export default async function UsersPage() {
  const me = await requireUser();
  const mine = (
    <div className="card">
      <div className="card-title">내 비밀번호 변경</div>
      <MyPassword />
    </div>
  );
  if (me.role !== "관리자") return <><PageHead href="/users" title="비밀번호 변경" emoji="🔒" desc="내 계정 비밀번호를 바꿉니다." />{mine}</>;

  const admin = createAdminClient();
  const [{ data: users }, { data: legacy }] = await Promise.all([
    admin.from("profiles").select("login_id, name, role, created_at").order("created_at"),
    admin.from("legacy_users").select("login_id, name, role, created_at"),
  ]);
  const rows = [
    ...(users ?? []).map((u) => [u.login_id, u.name, u.role, fullKst(u.created_at), ""]),
    ...(legacy ?? []).map((u) => [u.login_id, u.name, u.role, u.created_at ?? "", "이전 사이트 계정 (첫 로그인 때 옮겨짐)"]),
  ];
  return (
    <>
      <PageHead href="/users" title="사용자 관리" emoji="⚙️" desc="사이트 계정(관리자·담당자) 만들기·권한, 내 비밀번호 변경" />
      {mine}
      <div className="grid-r" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">계정 목록</div>
          <Table head={["아이디", "이름", "역할", "생성일시", "비고"]} rows={rows} />
          <DeleteUser ids={rows.map((r) => r[0]).filter((i) => i !== me.loginId)} />
        </div>
        <div className="card">
          <div className="card-title">계정 추가 · 수정</div>
          <p className="caption">같은 아이디를 넣으면 이름·역할을 바꾸고, 비밀번호를 넣으면 초기화합니다.</p>
          <UpsertUser />
        </div>
      </div>
    </>
  );
}
