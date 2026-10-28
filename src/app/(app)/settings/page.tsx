/** 근무 기준·공휴일 (모든 사용자 공통) */
import { getHolidays, getRule } from "@/lib/data";
import { hhmm } from "@/lib/time";
import { HolidayForm, RuleForm } from "./forms";

export const metadata = { title: "근무 기준·공휴일 · 근태관리통합시스템" };

export default async function SettingsPage() {
  const [rule, holidays] = await Promise.all([getRule(), getHolidays()]);
  return (
    <>
      <h1>근무 기준·공휴일</h1>
      <p className="caption">여기서 바꾼 기준은 모든 담당자에게 똑같이 적용되고, 지각·조퇴 판정과 근무형태 표기에 바로 반영됩니다.</p>
      <div className="grid2">
        <div className="card">
          <div className="card-title">근무 기준</div>
          <RuleForm rule={{
            start: hhmm(rule.start), end: hhmm(rule.end), grace: rule.graceMin, overtime: rule.overtimeMin,
            round: rule.roundMin, workdays: rule.workdays, labelAll: rule.labelAll,
          }} />
        </div>
        <div className="card">
          <div className="card-title">공휴일</div>
          <HolidayForm text={Object.entries(holidays).sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, n]) => `${d} ${n}`).join("\n")} />
        </div>
      </div>
    </>
  );
}
