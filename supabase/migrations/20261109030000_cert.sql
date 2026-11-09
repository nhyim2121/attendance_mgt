-- 인증 영역: 회사가 가진 인증·지정·확인(ISO, 벤처, 이노비즈, 기업부설연구소, AEO, 병역지정업체 ...)과 그 이력 (관리자만)
create table if not exists public.cert_items (
  id bigint generated always as identity primary key,
  category text not null default '기업 인증·확인',  -- 경영시스템 / 기업 인증·확인 / 연구·인력 / 제품·조달 / 지식재산 / 기타
  name text not null,                               -- 예: ISO 9001, 벤처기업확인, 기업부설연구소
  cert_no text not null default '',                 -- 인증·등록 번호
  issuer text not null default '',                  -- 인증기관·주관기관
  acquired date,                                    -- 처음 취득일
  valid_from date,                                  -- 이번 유효기간 시작
  expires date,                                     -- 유효기간 끝 (없으면 기한 없음)
  next_audit date,                                  -- 다음 사후심사·갱신심사·정기보고 일정
  next_audit_label text not null default '',        -- 예: 1차 사후심사, 갱신심사, 정기 현황보고
  status text not null default '유효',              -- 유효 / 진행 중 / 만료 / 취소·반납
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 취득·심사·갱신·변경신고·현장실사 같은 이력. 첨부는 ga_files ref='certev:<id>', 인증서 자체는 ref='cert:<id>'
create table if not exists public.cert_events (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.cert_items (id) on delete cascade,
  day date not null,
  kind text not null default '기타',                -- 신청 / 취득 / 사후심사 / 갱신 / 변경신고 / 현장실사 / 보고·제출 / 만료 / 취소 / 기타
  title text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists cert_events_item_idx on public.cert_events (item_id, day);

alter table public.cert_items enable row level security;
alter table public.cert_events enable row level security;
drop policy if exists "cert_items admin" on public.cert_items;
drop policy if exists "cert_events admin" on public.cert_events;
create policy "cert_items admin" on public.cert_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "cert_events admin" on public.cert_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
