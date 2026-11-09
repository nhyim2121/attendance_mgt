-- 문서 수발 대장 보강
-- reply_of: 이 발신 문서가 어느 수신 문서에 대한 회신인지
-- cost: 발송 요금(원), batch: 예전 엑셀 대장에서 한꺼번에 가져온 묶음 (가져오기 되돌리기용)
alter table public.ga_mail add column if not exists reply_of bigint references public.ga_mail (id) on delete set null;
alter table public.ga_mail add column if not exists cost integer;
alter table public.ga_mail add column if not exists batch text not null default '';
create index if not exists ga_mail_batch_idx on public.ga_mail (batch) where batch <> '';
