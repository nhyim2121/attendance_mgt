/** 하이웍스 근태 한 건과 정렬·중복 제거 (브라우저에서도 쓰므로 엑셀 라이브러리와 분리). */
import type { DateStr } from "./time";

/** 하이웍스 근태 한 건 (사이트 일일 보고서에서 만든 것도 같은 형식) */
export interface Leave {
  day: DateStr;
  name: string;
  dept: string;
  rank: string;
  type: string;
  content: string;
  note: string;
  sheet: string;
}

/** 연차 현황 '내역'에서 지운 휴가 (근태현황 파일·일일 보고서·하이웍스 결재에서 온 것). 설정 'leave_hidden'에 쌓는다. */
export interface HiddenLeave {
  day: DateStr;
  name: string;
  type: string; // 원래 기록의 유형 (신청 유형)
  content: string;
  src: string;
  by: string;
  at: string;
}
export const leaveKey = (l: { day: string; name: string; type: string }) => `${l.day}|${l.name}|${l.type}`;

/** 근태 정렬: 일자, 이름 */
export function sortLeaves(lv: Leave[]): Leave[] {
  return lv.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** 일자·이름·유형이 같은 근태는 하나만 (keep: 앞/뒤 중 남길 것) */
export function dedupeLeaves(lv: Leave[], keep: "first" | "last" = "first"): Leave[] {
  const k = (l: Leave) => `${l.day}|${l.name}|${l.type}`;
  if (keep === "first") {
    const seen = new Set<string>();
    return lv.filter((l) => !seen.has(k(l)) && seen.add(k(l)));
  }
  const last = new Map<string, number>();
  lv.forEach((l, i) => last.set(k(l), i));
  return lv.filter((l, i) => last.get(k(l)) === i);
}
