-- ISO 27001:2022 업무실적문서 (관리자만). form = 양식 키(예: 601-01), data = { v: {칸 id: 글}, rows: {표 id: 늘린 줄 수} }
create table if not exists public.iso_docs (
  id bigint generated always as identity primary key,
  form text not null,
  day date not null default current_date,
  title text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists iso_docs_form_idx on public.iso_docs (form, day);

alter table public.iso_docs enable row level security;
drop policy if exists "iso_docs admin" on public.iso_docs;
create policy "iso_docs admin" on public.iso_docs for all to authenticated using (public.is_admin()) with check (public.is_admin());
