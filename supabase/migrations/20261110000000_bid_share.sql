-- 입찰관리 공유: 담당자(윤정아 차장님)도 입찰 대장과 그 첨부를 읽고 쓴다. 다른 총무 대장·첨부는 그대로 관리자만.
drop policy if exists "ledger_rows bid" on public.ledger_rows;
create policy "ledger_rows bid" on public.ledger_rows for all to authenticated
  using (book = 'bids') with check (book = 'bids');

drop policy if exists "ga_files bid" on public.ga_files;
create policy "ga_files bid" on public.ga_files for all to authenticated
  using (exists (select 1 from public.ledger_rows r where r.book = 'bids' and ga_files.ref = 'lg:' || r.id))
  with check (exists (select 1 from public.ledger_rows r where r.book = 'bids' and ga_files.ref = 'lg:' || r.id));
