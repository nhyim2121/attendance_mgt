-- 총무: 문서 수발 대장 (공문·우편·등기·팩스·택배의 수신·발신)
-- 총무 영역은 관리자 한 사람만 쓰므로 표 권한도 관리자만 (public.is_admin()).
create table if not exists public.ga_mail (
  id bigint generated always as identity primary key,
  dir text not null check (dir in ('수신', '발신')),
  year integer not null,
  seq integer not null,                     -- 그 해 수신/발신 일련번호 → 2026-수신-001
  day date not null,
  kind text not null default '공문',        -- 공문 / 우편 / 등기 / 팩스 / 택배 / 기타
  party text not null default '',           -- 보낸 곳(수신) · 받는 곳(발신)
  title text not null default '',
  ref_no text not null default '',          -- 문서번호·등기번호·송장번호·팩스번호
  route text not null default '',           -- 전달·처리 (수신: 누구에게 전달, 발신: 결재·발송 방법 등)
  status text not null default '완료',      -- 처리 중 / 완료
  due date,                                 -- 회신·처리 기한 (있을 때만)
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dir, year, seq)
);
create index if not exists ga_mail_day_idx on public.ga_mail (day);

-- 총무 첨부 파일 (스캔본·발송본). ref = 'mail:<id>' 처럼 어느 대장의 어느 줄인지
create table if not exists public.ga_files (
  id bigint generated always as identity primary key,
  ref text not null,
  file_name text not null,
  mime text not null default 'application/octet-stream',
  size integer not null default 0,
  content bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists ga_files_ref_idx on public.ga_files (ref);

alter table public.ga_mail enable row level security;
alter table public.ga_files enable row level security;
drop policy if exists "ga_mail admin" on public.ga_mail;
drop policy if exists "ga_files admin" on public.ga_files;
create policy "ga_mail admin" on public.ga_mail for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ga_files admin" on public.ga_files for all to authenticated using (public.is_admin()) with check (public.is_admin());
