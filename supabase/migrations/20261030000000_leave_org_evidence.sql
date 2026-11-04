-- 휴가 관리, 조직도(직책·연락처), 출장 증빙 첨부

-- ---------------------------------------------------------------- 직원 명부: 조직도용 직책·연락처
alter table public.employees
  add column position text not null default '',   -- 직책 (팀장, 공장장 등)
  add column phone text not null default '',      -- 휴대전화
  add column ext text not null default '',        -- 내선번호
  add column email text not null default '';

create or replace function public.save_employees(p_rows jsonb, p_user text)
returns integer language plpgsql security invoker set search_path = public as $$
begin
  delete from employees where true;
  insert into employees (name, caps_name, emp_id, dept, rank, position, phone, ext, email, join_date, leave_date, note,
                         ord, edited_by)
  select r.name, coalesce(r.caps_name, ''), coalesce(r.emp_id, ''), coalesce(r.dept, ''), coalesce(r.rank, ''),
         coalesce(r.position, ''), coalesce(r.phone, ''), coalesce(r.ext, ''), coalesce(r.email, ''),
         r.join_date, r.leave_date, coalesce(r.note, ''), r.ord, p_user
  from jsonb_to_recordset(p_rows) as r(name text, caps_name text, emp_id text, dept text, rank text, position text,
                                       phone text, ext text, email text, join_date date, leave_date date, note text,
                                       ord integer);
  return jsonb_array_length(p_rows);
end $$;

-- ---------------------------------------------------------------- 휴가 등록 (사이트에서 직접)
-- 연차·월차는 기간(시작~종료, 휴일 제외), 반차·반반차·외출은 하루. 외출은 시각(시작~종료)으로 시간을 센다.
create table public.vacations (
  id bigint generated always as identity primary key,
  name text not null,
  type text not null,
  start_day date not null,
  end_day date not null,
  start_time text not null default '',
  end_time text not null default '',
  reason text not null default '',
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  check (end_day >= start_day)
);
create index vacations_day_idx on public.vacations (start_day, end_day);

-- 연차 조정: 이월·포상 부여(+), 선사용·차감(-) 등. fy = 회계연도 (시작하는 해)
create table public.leave_adjust (
  id bigint generated always as identity primary key,
  name text not null,
  fy integer not null,
  days numeric not null,
  reason text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 근태 증빙 (하이웍스 전자결재 출장 신청서 등)
create table public.attachments (
  id bigint generated always as identity primary key,
  name text not null,
  day_from date not null,
  day_to date not null,
  type text not null default '출장',
  title text not null default '',
  file_name text not null,
  mime text not null default 'application/octet-stream',
  size integer not null default 0,
  content bytea not null,
  uploaded_by text not null default '',
  created_at timestamptz not null default now(),
  check (day_to >= day_from)
);
create index attachments_day_idx on public.attachments (day_from, day_to);

alter table public.vacations enable row level security;
alter table public.leave_adjust enable row level security;
alter table public.attachments enable row level security;

create policy "vacations all" on public.vacations for all to authenticated using (true) with check (true);
create policy "leave_adjust all" on public.leave_adjust for all to authenticated using (true) with check (true);
create policy "attachments read" on public.attachments for select to authenticated using (true);
create policy "attachments insert" on public.attachments for insert to authenticated with check (true);
create policy "attachments delete" on public.attachments for delete to authenticated using (true);
