-- 근태 기입: 인원(note)과 업무내용(work)을 따로 적는다
alter table public.overrides add column if not exists work text;
comment on column public.overrides.note is '인원 (같이 근무한 직원 이름)';
comment on column public.overrides.work is '업무내용';
