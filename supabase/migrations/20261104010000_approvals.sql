-- 하이웍스 전자결재 '근무계획 수립이력' (휴가 신청·취소, 연장근무, 휴(무)일근무)
-- key = 기안자|기안일|제목 (같은 파일을 여러 번 올려도 한 번만)
create table if not exists public.approvals (
  key text primary key,
  drafted_at text not null,
  title text not null,
  name text not null,
  done_at text not null default '',
  status text not null,              -- 결재완료 / 반려 / 관리자 기안 취소 ...
  kind text not null,                -- 휴가 / 휴가취소 / 연장근무 / 휴일근무 / 기타
  type text not null default '',     -- 연차·반차·외출 ... (휴가), 연장근무, 휴일근무
  day_from date,
  day_to date,
  amount text not null default '',   -- '1일', '4시간', '1시간 30분' ...
  time_from text not null default '',
  time_to text not null default '',
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now()
);
create index if not exists approvals_day_idx on public.approvals (day_from, day_to);
alter table public.approvals enable row level security;
drop policy if exists "approvals all" on public.approvals;
create policy "approvals all" on public.approvals for all to authenticated using (true) with check (true);
