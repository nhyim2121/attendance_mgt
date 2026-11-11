/** 사용자 관리 (관리자): 관리팀 계정 추가·역할 변경·비밀번호 초기화·삭제, 내 비밀번호 변경. */
import PageHead from "@/components/대시/PageHead";
import { Table } from "@/components/ui";
import { loadPerms, requireUser } from "@/lib/auth";
import { isCustom, permsOf } from "@/lib/perm";
import PermMatrix from "./PermMatrix";
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
  const table = await loadPerms();
  const permUsers = (users ?? []).map((u) => ({
    loginId: u.login_id as string, name: u.name as string, role: u.role as string,
    custom: isCustom(table, u.login_id, u.role), perms: permsOf(table, u.login_id, u.role),
  }));
  const rows = [
    ...(users ?? []).map((u) => [u.login_id, u.name, u.role, fullKst(u.created_at), ""]),
    ...(legacy ?? []).map((u) => [u.login_id, u.name, u.role, u.created_at ?? "", "이전 사이트 계정 (첫 로그인 때 옮겨짐)"]),
  ];
  return (
    <>
      <PageHead href="/users" title="사용자·권한 설정" emoji="⚙️" desc="계정 만들기, 계정별 권한(영역마다 읽기·등록·수정·삭제), 내 비밀번호 변경" />
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
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">계정별 권한</div>
        <p className="caption">업무 영역마다 <b>읽기</b>(화면 보기)·<b>등록</b>(새로 추가·파일 올리기)·<b>수정</b>(저장·변경)·<b>삭제</b>를 계정별로 정합니다.
          읽기가 없는 영역은 메뉴에서 숨겨지고 화면도 열리지 않습니다. [역할 기본값]인 계정은 지금까지처럼 역할(담당자 = 인사노무·기타)을 따릅니다.
          사용자·권한 설정 화면은 관리자만 쓸 수 있습니다.</p>
        <PermMatrix users={permUsers} />
      </div>
    </>
  );
}
