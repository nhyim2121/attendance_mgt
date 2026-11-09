-- 직원 민감 정보 (생년월일·주민등록번호·급여). 관리자만 읽고 쓴다.
-- 주민등록번호는 프로그램에서 AES-256-GCM으로 암호화해 넣는다 (키: .env.local EMP_SECRET_KEY). 여기에는 암호문만 있다.
-- 직원 첨부 파일은 ga_files ref='empfile:<이름>'.
create table if not exists public.emp_private (
  name text primary key,              -- 직원 이름 (employees.name)
  birth date,
  rrn_enc text not null default '',   -- 암호화한 주민등록번호
  rrn_mask text not null default '',  -- 화면용 (예: 900101-1******)
  salary_type text not null default '',  -- 월급 / 연봉 / 시급
  salary bigint,                      -- 원
  salary_note text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.emp_private enable row level security;
drop policy if exists "emp_private admin" on public.emp_private;
create policy "emp_private admin" on public.emp_private for all to authenticated using (public.is_admin()) with check (public.is_admin());
