-- 여러 업무 대장(비품·차량·방문자·SW·보호구·기숙사·지원사업·입찰·교육·자격증·건강검진·폐수·점검·회의·할 일 ...)을
-- 한 표에 담는다. 어떤 칸이 있는지는 프로그램의 대장 설정(src/lib/대장/books.ts)이 정한다. 관리자만.
create table if not exists public.ledger_rows (
  id bigint generated always as identity primary key,
  book text not null,                 -- 대장 이름 (예: fixtures, vehicles)
  day date,                           -- 대장의 기준 날짜 (정렬·연도 거르기)
  data jsonb not null default '{}',   -- 칸 값
  batch text not null default '',     -- 엑셀에서 가져온 묶음 (되돌리기용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ledger_rows_book_idx on public.ledger_rows (book, day);
alter table public.ledger_rows enable row level security;
drop policy if exists "ledger_rows admin" on public.ledger_rows;
create policy "ledger_rows admin" on public.ledger_rows for all to authenticated using (public.is_admin()) with check (public.is_admin());
