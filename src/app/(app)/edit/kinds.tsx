/** 근태 기입 공용 (서버·브라우저): 근태 구분 칩과 줄 색. */
/** 근태 구분 칩: 같은 날 여러 근태(예: 반차 + 출장 + 연장근무)를 색으로 나눠 보여 준다 */
export function Kinds({ r }: { r: { kinds: string[]; status: string } }) {
  if (!r.kinds.length) return <span className="muted" style={{ fontSize: ".8rem" }}>{r.status}</span>;
  return <span className="kinds">{r.kinds.map((k) => <span key={k} className={`tag t-${k}`}>{k}</span>)}</span>;
}
/** 줄 색: 휴일근무 > 연장근무 > 휴가 > 출장·교육 */
export const rowTone = (r: { kinds: string[] }) =>
  r.kinds.includes("휴일근무") ? "tone-hol" : r.kinds.includes("연장근무") ? "tone-ot" : r.kinds.includes("조기출근") ? "tone-early"
    : r.kinds.some((k) => ["연차", "월차", "반차", "반반차", "외출", "공가", "경조휴가", "병가"].includes(k)) ? "tone-leave"
      : r.kinds.some((k) => ["출장", "교육", "외근"].includes(k)) ? "tone-trip" : "";
