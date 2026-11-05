-- 하이웍스 '휴가현황(종류별)' 내보내기 (연도별 직원 연차 생성·사용·잔여). 같은 연도 파일을 올리면 통째로 바뀐다.
create table if not exists public.leave_status (
  fy integer not null,
  name text not null,
  login_id text not null default '',
  emp_no text not null default '',
  join_date date,
  state text not null default '',
  granted numeric not null default 0,       -- 올해 생성
  grant_detail jsonb not null default '{}', -- {"정기":15,"포상":0,"기타":0}
  used jsonb not null default '{}',         -- {"연차":4,"외출":0.6875,...} (일)
  remain numeric not null default 0,        -- 하이웍스 잔여
  months jsonb not null default '{}',       -- {"2026-01":{"연차":1},...}
  exported_at text not null default '',     -- 하이웍스에서 내려받은 시각 'YYYY-MM-DD HH:MM'
  file text not null default '',
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now(),
  primary key (fy, name)
);
alter table public.leave_status enable row level security;
drop policy if exists "leave_status all" on public.leave_status;
create policy "leave_status all" on public.leave_status for all to authenticated using (true) with check (true);
