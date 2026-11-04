-- 근태 기입: 연장근무 업무내용을 따로 적는다 (work = 조출·휴일·출장 등 업무내용, work_ot = 연장 업무)
alter table public.overrides add column if not exists work_ot text;
comment on column public.overrides.work_ot is '연장 업무내용';
