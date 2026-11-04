/** 휴가 종류별 색 [글자색, 바탕색]. globals.css의 .t-<유형> 과 같은 값 (휴가 캘린더·휴가 홈·연차 현황 공용). */
export const LEAVE_COLORS: Record<string, [string, string]> = {
  연차: ["#0c3994", "#e3eafa"],
  월차: ["#1f8a3b", "#e3f4e8"],
  반차: ["#0f766e", "#d5f2ee"],
  반반차: ["#4d7c0f", "#ecf7d8"],
  외출: ["#c2410c", "#fdebdc"],
  공가: ["#475569", "#e8edf3"],
  경조휴가: ["#be185d", "#fce7f3"],
  병가: ["#b91c1c", "#fee2e2"],
};
export const leaveFg = (t: string) => LEAVE_COLORS[t]?.[0] ?? "#0c3994";
export const leaveBg = (t: string) => LEAVE_COLORS[t]?.[1] ?? "#eef0f4";
