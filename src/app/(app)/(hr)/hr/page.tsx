/** 인사노무 대시보드 (F안) */
import AreaDash from "@/components/대시/AreaDash";
import { Bars, Card, HoursLine } from "@/components/대시/parts";
import { hrSnap, WEEK_WARN } from "@/lib/대시/data";
import { todayKst } from "@/lib/time";

export const metadata = { title: "인사노무 · 통합관리시스템" };

export default async function Page() {
  const hr = await hrSnap();
  const today = todayKst();
  const lt = Object.entries(hr.leaveTypes).map(([k, n]) => `${k} ${n}`).join(" · ");
  return (
    <AreaDash area="hr"
      kpis={[
        { label: "오늘 출근", n: hr.present, unit: `/ ${hr.staff}명`, sub: `지각 ${hr.late} · 미출근 ${hr.absent}`, icon: "clock", color: "#0c3994", href: `/daily?day=${today}` },
        { label: "오늘 휴가", n: hr.leave, unit: "명", sub: lt || (hr.trip ? `출장·교육 ${hr.trip}명` : "없음"), icon: "umbrella", color: "#15803d", href: "/leave/calendar" },
        { label: `주 ${WEEK_WARN}시간 이상`, n: hr.near.length, unit: "명", sub: hr.near.length ? hr.near.map((w) => w.emp).slice(0, 3).join(", ") : "이번 주", icon: "gauge", color: "#b45309", warn: hr.near.length > 0, href: "/week52" },
        { label: "연차 사용률", n: hr.usedRate, unit: "%", sub: `잔여 ${hr.remain}일 · ${hr.fy}`, icon: "pie", color: "#0e7490", href: "/leave/status" },
      ]}
      quick={[["/leave/register", "휴가 등록"], ["/sheets?tab=edit", "근태 기입"], ["/employees", "직원 추가"], ["/hr/b/onoff#form", "입퇴사 처리"], ["/hr/b/certificates#form", "증명서 발급"], ["/hr/b/training#form", "교육 기록"], ["/hr/b/payroll#form", "급여 일정"]]}>
      <Card en="HOURS" title="월별 1인 평균 주 근로시간" more={["리포트", "/hours"]}><HoursLine data={hr.monthly} /></Card>
      <Card en="LEAVE USE" title="월별 휴가 사용 건수" more={["휴가 홈", "/leave"]}><Bars data={hr.leaveByMonth.map((m) => ({ label: m.label, n: m.n }))} hiLast /></Card>
    </AreaDash>
  );
}
