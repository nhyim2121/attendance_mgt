/** 열 이름 별칭, 근무 기준, 공휴일. */

// 표준 필드 -> 엑셀에서 쓰일 수 있는 열 이름 (앞쪽일수록 우선)
// 캡스 내보내기: 요일 | 발생일자 | 발생시각 | 이름 | 근무형태 | 구분 | 모드 | 인증 | 근무지 | 비고(인원)
export const COLUMN_ALIASES = {
  datetime: ["출입일시", "발생일시", "인증일시", "이벤트일시", "일시", "datetime"],
  date: ["발생일자", "출입일자", "인증일자", "일자", "날짜", "date"],
  time: ["발생시각", "출입시간", "발생시간", "인증시간", "출입시각", "시각", "시간", "time"],
  emp_id: ["사원번호", "사번", "직원번호", "개인번호", "emp_id"],
  name: ["이름", "성명", "사원명", "직원명", "name"],
  dept: ["부서명", "부서", "소속", "dept"],
  door: ["출입문", "출입문명", "단말기명", "단말기", "리더기", "door"],
  mode: ["모드", "출입구분", "인증모드", "mode"],
  auth: ["인증", "인증방식", "auth"],
  work_type: ["근무형태"],
  place: ["근무지", "장소"],
  note: ["비고", "인원"],
} as const;

export type Field = keyof typeof COLUMN_ALIASES;
export const FIELDS = Object.keys(COLUMN_ALIASES) as Field[];

export const WEEKDAYS_KR = ["월", "화", "수", "목", "금", "토", "일"];

// 근태 판정에서 제외할 캡스 모드 (경비 설정/해제)
export const ALARM_MODES = new Set(["해제", "세트"]);

// 하이웍스 근태 유형
export const LEAVE_DAY_VALUE: Record<string, number> = { 연차: 1, 반차: 0.5, 반반차: 0.25 }; // 휴가 사용일수
export const FULL_DAY_TYPES = new Set(["연차", "공가"]); // 하루 종일 부재
export const EXCUSED_TYPES = new Set(["연차", "반차", "반반차", "외출", "공가", "출장", "교육", "외근"]); // 지각/조퇴 판정 제외
export const TRAVEL_TYPES = new Set(["출장", "교육", "외근"]); // 출퇴근 시각을 기준 시각으로 채우는 유형

// 2026년 공휴일·대체공휴일 (근태현황 일일보고가 없는 날과 대조해 확인)
export const HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴",
  "2026-03-02": "삼일절 대체공휴일",
  "2026-05-01": "노동절",
  "2026-05-05": "어린이날",
  "2026-05-25": "부처님오신날 대체공휴일",
  "2026-06-03": "지방선거",
  "2026-06-06": "현충일",
  "2026-07-17": "제헌절",
  "2026-08-17": "광복절 대체공휴일",
  "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴",
  "2026-10-05": "개천절 대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
};

/** 근무 기준과 근무형태 자동 표기 규칙. 시각은 자정 이후 분. */
export interface WorkRule {
  start: number; // 출근 기준 (08:30 = 510)
  end: number; // 퇴근 기준 (17:30 = 1050)
  graceMin: number; // 지각 유예(분)
  workdays: number[]; // 월=0 ... 일=6
  overtimeMin: number; // 퇴근 기준보다 이만큼 늦으면 '연장'
  roundMin: number; // 연장/휴일 시각 절사 단위(분)
  labelAll: boolean; // true면 평범한 날에도 근무형태 '정상(08:30)' 기입 (수작업 시트는 비워 둠)
}

export const DEFAULT_RULE: WorkRule = {
  start: 8 * 60 + 30,
  end: 17 * 60 + 30,
  graceMin: 0,
  workdays: [0, 1, 2, 3, 4],
  overtimeMin: 60,
  roundMin: 30,
  labelAll: false,
};

export type Holidays = Record<string, string>; // 'YYYY-MM-DD' -> 이름
