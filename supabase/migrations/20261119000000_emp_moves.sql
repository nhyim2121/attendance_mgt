-- 보직 이력 (2026-11-19): 부서·직급이 바뀐 직원. 조직도 등은 기준일의 부서·직급으로 보여 준다.
-- moves = [{"until":"2026-08-01","dept":"영업팀","rank":"사원"}, ...]  (until 날까지 그 부서·직급, 그 뒤는 다음 줄 또는 지금 값)
alter table public.employees add column if not exists moves jsonb not null default '[]'::jsonb;

create or replace function public.save_employees(p_rows jsonb, p_user text)
returns integer language plpgsql security invoker set search_path = public as $$
begin
  delete from employees where true;
  insert into employees (name, caps_name, emp_id, dept, rank, position, phone, ext, email, join_date, leave_date, note,
                         ord, prior, moves, edited_by)
  select r.name, coalesce(r.caps_name, ''), coalesce(r.emp_id, ''), coalesce(r.dept, ''), coalesce(r.rank, ''),
         coalesce(r.position, ''), coalesce(r.phone, ''), coalesce(r.ext, ''), coalesce(r.email, ''),
         r.join_date, r.leave_date, coalesce(r.note, ''), r.ord, coalesce(r.prior, '[]'::jsonb),
         coalesce(r.moves, '[]'::jsonb), p_user
  from jsonb_to_recordset(p_rows) as r(name text, caps_name text, emp_id text, dept text, rank text, position text,
                                       phone text, ext text, email text, join_date date, leave_date date, note text,
                                       ord integer, prior jsonb, moves jsonb);
  return jsonb_array_length(p_rows);
end $$;
