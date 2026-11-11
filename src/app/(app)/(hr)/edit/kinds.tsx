/** 근태 기입 공용 (서버·브라우저): 근태 구분 칩과 줄 색. */
/** 휴가 종류 (근태 구분 칸에만 보이고 근무형태·근무지·인원·업무내용 칸에는 넣지 않음) */
export const LEAVE_KINDS = ["연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가", "포상"];
export const isLeaveText = (v: string) => /^(연차|월차|반차|반반차|외출|공가|경조|병가|포상)/.test(v.trim());

/** 근태 구분 칩: 같은 날 여러 근태(예: 반차 + 출장 + 연장근무)를 색으로 나눠 보여 준다. 휴가는 사유·시간을 칩 아래에 */
export function Kinds({ r }: { r: { kinds: string[]; status: string; leaveInfo?: string } }) {
  if (!r.kinds.length) return <span className="muted" style={{ fontSize: ".8rem" }}>{r.status}</span>;
  return <>
    <span className="kinds">{r.kinds.map((k) => <span key={k} className={`tag t-${k}`}>{k}</span>)}</span>
    {r.leaveInfo && <span className="leave-info">{r.leaveInfo}</span>}
  </>;
}
/** 줄에 붙이는 근태별 표시 (시각 색): 휴일근무 = 빨강, 연장·조출 = 파랑, 휴가 = 진한 검정 */
export const kindCls = (r: { kinds: string[] }) => [
  r.kinds.includes("휴일근무") ? "k-hol" : "", r.kinds.includes("연장근무") ? "k-ot" : "",
  r.kinds.includes("조기출근") ? "k-early" : "", r.kinds.some((k) => LEAVE_KINDS.includes(k)) ? "k-leave" : "",
].filter(Boolean).join(" ");
/** 줄 색: 휴일근무 > 연장근무 > 휴가 > 출장·교육 */
export const rowTone = (r: { kinds: string[] }) =>
  r.kinds.includes("휴일근무") ? "tone-hol" : r.kinds.includes("연장근무") ? "tone-ot" : r.kinds.includes("조기출근") ? "tone-early"
    : r.kinds.some((k) => LEAVE_KINDS.includes(k)) ? "tone-leave"
      : r.kinds.some((k) => ["출장", "교육", "외근"].includes(k)) ? "tone-trip" : "";
