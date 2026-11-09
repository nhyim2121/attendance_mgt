-- 총무: 증빙·법인서류 발급 대장, 인증서 관리 (관리자만)
create table if not exists public.ga_issue (
  id bigint generated always as identity primary key,
  day date not null,                         -- 발급일
  doc_type text not null,                    -- 사업자등록증명, 법인등기사항증명서 ...
  copies integer not null default 1,
  via text not null default '',              -- 발급처: 홈택스·정부24·인터넷등기소 ...
  purpose text not null default '',          -- 용도
  submit_to text not null default '',        -- 제출처
  requester text not null default '',        -- 요청한 사람 (본인이면 빈칸)
  fee integer,                               -- 수수료(원)
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ga_issue_day_idx on public.ga_issue (day);

-- 인증서는 파일·비밀번호를 저장하지 않는다. 무엇이 어디 있고 언제 끝나는지만.
create table if not exists public.ga_cert (
  id bigint generated always as identity primary key,
  name text not null,                        -- 예: 법인 범용 공동인증서
  kind text not null default '공동인증서(범용)',
  issuer text not null default '',           -- 발급기관·은행
  usage text not null default '',            -- 쓰는 곳: 홈택스, 나라장터, 은행 ...
  holder text not null default '',           -- 보관자
  location text not null default '',         -- 보관 위치: USB, 보안토큰, PC ...
  issued date,
  expires date,
  active boolean not null default true,      -- false = 폐기·안 씀
  note text not null default '',             -- 갱신 이력도 여기 한 줄씩
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ga_issue enable row level security;
alter table public.ga_cert enable row level security;
drop policy if exists "ga_issue admin" on public.ga_issue;
drop policy if exists "ga_cert admin" on public.ga_cert;
create policy "ga_issue admin" on public.ga_issue for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ga_cert admin" on public.ga_cert for all to authenticated using (public.is_admin()) with check (public.is_admin());
