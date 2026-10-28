/** 직원 관리: 입사·퇴사를 포함한 직원 명부 등록·수정·삭제. 출퇴근 집계는 이 명부 기준. */
import { Metric } from "@/components/ui";
import { loadBase } from "@/lib/data";
import { statusLabel } from "@/lib/employees";
import * as store from "@/lib/store";
import { addDays, todayKst } from "@/lib/time";
import EmployeeEditor, { AddFromCaps } from "./EmployeeEditor";

export const metadata = { title: "직원 관리 · 근태관리통합시스템" };

export default async function EmployeesPage() {
  const [base, spans] = await Promise.all([loadBase(), store.recordNameSpan()]);
  const emps = base.employees;
  const today = todayKst();
  const status = emps.map((e) => statusLabel(e, today));
  const monthStart = `${today.slice(0, 7)}-01`;
  const joined = emps.filter((e) => e.joinDate && e.joinDate >= monthStart).map((e) => e.name);
  const left = emps.filter((e) => e.leaveDate && e.leaveDate >= monthStart).map((e) => e.name);
  const depts = [...new Set([...emps.map((e) => e.dept).filter(Boolean), "생산팀", "품질팀", "관리팀", "영업팀", "연구소"])].sort();
  const seen = Object.fromEntries(spans.map((s) => [s.name, [s.first_day, s.last_day] as [string, string]]));

  // 캡스에는 찍히는데 명부에 없는 사람 (최근 90일)
  const registered = new Set([...emps.map((e) => e.name), ...emps.map((e) => e.capsName).filter(Boolean)]);
  const recent = spans.filter((s) => s.last_day >= addDays(today, -90) && !registered.has(s.name))
    .sort((a, b) => (a.last_day < b.last_day ? 1 : -1))
    .map((s) => ({ name: s.name, first: s.first_day, last: s.last_day }));

  return (
    <>
      <h1>직원 관리</h1>
      <p className="caption">여기에 등록된 직원만 출퇴근 집계·일일 현황·직원별 시트에 나옵니다. 입사일 전과 퇴사일 뒤의 기록은 집계에서 빠집니다 (퇴사일 = 마지막 근무일). 캡스에 다른 이름으로 찍히는 직원은 &apos;캡스 이름&apos;에 적어 주세요.</p>
      <div className="metrics">
        <Metric label="재직" value={`${status.filter((s) => s === "재직").length}명`} />
        <Metric label="입사 예정" value={`${status.filter((s) => s === "입사 예정").length}명`} />
        <Metric label="퇴사" value={`${status.filter((s) => s === "퇴사").length}명`} />
        <Metric label={`${+today.slice(5, 7)}월 입사 / 퇴사`} value={`${joined.length} / ${left.length}명`}
          title={[joined.length ? `입사: ${joined.join(", ")}` : "", left.length ? `퇴사: ${left.join(", ")}` : ""].filter(Boolean).join(" · ")} />
      </div>
      <div className="card">
        <EmployeeEditor key={JSON.stringify(emps)} emps={emps} depts={depts} today={today} seen={seen} />
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">캡스에는 찍히는데 명부에 없는 사람</div>
        {recent.length ? <AddFromCaps people={recent} /> : <p className="muted">최근 90일 동안 명부에 없는 출입자가 없습니다.</p>}
      </div>
    </>
  );
}
