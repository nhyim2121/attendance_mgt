/** 직원 관리의 인사 일정 계산: 근속, 수습 종료(입사 3개월), 1년 근속(퇴직금·연차 15일), 근속 기념(5·10·15·20·25·30년), 퇴사 예정.
 *  화면과 서버가 같이 쓰는 순수 함수. */
import type { Employee } from "./employees";

const pad = (n: number) => String(n).padStart(2, "0");
/** 날짜에 n개월 더하기 (말일 넘치면 그 달 말일) */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const t = (y * 12 + (m - 1)) + n, yy = Math.floor(t / 12), mm = (t % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${pad(mm)}-${pad(Math.min(day, last))}`;
}
const dms = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const daysTo = (today: string, d: string) => Math.round((dms(d) - dms(today)) / 86_400_000);

/** 근속: 입사일 ~ 기준일(퇴사자는 퇴사일). [년, 개월] */
export function tenure(e: Pick<Employee, "joinDate" | "leaveDate">, today: string): [number, number] | null {
  if (!e.joinDate) return null;
  const end = e.leaveDate && e.leaveDate < today ? e.leaveDate : today;
  if (end < e.joinDate) return [0, 0];
  const [y1, m1, d1] = e.joinDate.split("-").map(Number), [y2, m2, d2] = end.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) months = 0;
  return [Math.floor(months / 12), months % 12];
}
export const tenureText = (t: [number, number] | null) =>
  !t ? "" : t[0] ? `${t[0]}년${t[1] ? ` ${t[1]}개월` : ""}` : `${t[1]}개월`;
/** 근속(년, 소수) — 평균 계산용 */
export const tenureYears = (t: [number, number] | null) => (t ? t[0] + t[1] / 12 : 0);

export interface HrEvent { name: string; dept: string; kind: "수습 종료" | "1년 근속" | "근속 기념" | "퇴사 예정"; label: string; day: string; left: number }

/** 오늘부터 within일 안의 인사 일정 (지난 7일 것도 보여 준다) */
export function hrEvents(emps: Employee[], today: string, within = 45): HrEvent[] {
  const out: HrEvent[] = [];
  const push = (e: Employee, kind: HrEvent["kind"], label: string, day: string) => {
    const left = daysTo(today, day);
    if (left >= -7 && left <= within) out.push({ name: e.name, dept: e.dept, kind, label, day, left });
  };
  for (const e of emps) {
    const gone = e.leaveDate && e.leaveDate < today;
    if (e.leaveDate && !gone) push(e, "퇴사 예정", "마지막 근무일", e.leaveDate);
    if (gone || !e.joinDate) continue;
    push(e, "수습 종료", "입사 3개월 · 수습 평가", addMonths(e.joinDate, 3));
    push(e, "1년 근속", "퇴직금 대상 · 연차 15일 발생", addMonths(e.joinDate, 12));
    const t = tenure(e, today);
    if (t) for (const y of [5, 10, 15, 20, 25, 30]) if (y >= t[0] && y <= t[0] + 1) push(e, "근속 기념", `근속 ${y}년`, addMonths(e.joinDate, y * 12));
  }
  return out.sort((a, b) => a.left - b.left);
}
