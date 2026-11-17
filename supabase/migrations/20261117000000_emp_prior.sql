-- 재입사 직원 (2026-11-17): 지금 입사일·퇴사일 말고 '이전 근무 기간'을 여러 개 적는다.
-- prior = [{"join":"2022-12-05","leave":"2026-01-31"}, ...]  (그 기간의 출입 기록도 재직으로 집계)
alter table public.employees add column if not exists prior jsonb not null default '[]'::jsonb;

create or replace function public.save_employees(p_rows jsonb, p_user text)
returns integer language plpgsql security invoker set search_path = public as $$
begin
  delete from employees where true;
  insert into employees (name, caps_name, emp_id, dept, rank, position, phone, ext, email, join_date, leave_date, note,
                         ord, prior, edited_by)
  select r.name, coalesce(r.caps_name, ''), coalesce(r.emp_id, ''), coalesce(r.dept, ''), coalesce(r.rank, ''),
         coalesce(r.position, ''), coalesce(r.phone, ''), coalesce(r.ext, ''), coalesce(r.email, ''),
         r.join_date, r.leave_date, coalesce(r.note, ''), r.ord, coalesce(r.prior, '[]'::jsonb), p_user
  from jsonb_to_recordset(p_rows) as r(name text, caps_name text, emp_id text, dept text, rank text, position text,
                                       phone text, ext text, email text, join_date date, leave_date date, note text,
                                       ord integer, prior jsonb);
  return jsonb_array_length(p_rows);
end $$;
