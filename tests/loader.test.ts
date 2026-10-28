/** 캡스 파일 읽기 테스트 (이름은 가짜). */
import { describe, expect, it } from "vitest";
import { excelDate, type Grid } from "@/lib/excel";
import {
  applyHeader, combineRecords, detectHeaderRow, findRecordSheet, guessMapping, normalize, toDate, toSeconds,
} from "@/lib/loader";
import { ts } from "@/lib/time";
import { HEADER } from "./helpers";

const N = null;

function rawWithTitle(): Grid {
  return [
    ["출입기록 조회", N, N, N, N],
    ["조회기간: 2026-09-01 ~ 2026-09-30", N, N, N, N],
    [N, N, N, N, N],
    ["출입일자", "출입시간", "사원번호", "성명", "부서"],
    ["2026-09-01", "08:55:10", 1001.0, "김민준", "관리팀"],
    ["2026-09-01", "18:10:00", 1001.0, "김민준", "관리팀"],
    ["합계", N, N, N, N],
  ];
}

describe("헤더·열 매핑", () => {
  it("제목 줄을 건너뛰고 헤더를 찾는다", () => {
    expect(detectHeaderRow(rawWithTitle())).toBe(3);
  });

  it("일자·시간이 나뉜 열", () => {
    const m = guessMapping(applyHeader(rawWithTitle(), 3).columns);
    expect(m.date).toBe("출입일자");
    expect(m.time).toBe("출입시간");
    expect(m.emp_id).toBe("사원번호");
    expect(m.name).toBe("성명");
    expect(m.dept).toBe("부서");
    expect(m.datetime).toBeNull();
  });

  it("합계 행을 버리고 사번을 정리한다", () => {
    const table = applyHeader(rawWithTitle(), 3);
    const { records, dropped } = normalize(table, guessMapping(table.columns));
    expect(records).toHaveLength(2);
    expect(dropped).toBe(1);
    expect(records[0].emp).toBe("김민준(1001)");
    expect(records[0].ts).toBe(ts("2026-09-01", 8 * 3600 + 55 * 60 + 10));
  });

  it("날짜·시각이 한 열", () => {
    const raw: Grid = [["발생일시", "이름"], ["2026-09-01 오후 6:05:00", "이서연"], [excelDate(2026, 9, 2, 8, 30), "이서연"]];
    const table = applyHeader(raw, 0);
    const { records, dropped } = normalize(table, guessMapping(table.columns));
    expect(dropped).toBe(0);
    expect(records.map((r) => r.ts)).toEqual([ts("2026-09-01", 18 * 3600 + 300), ts("2026-09-02", 8 * 3600 + 1800)]);
  });

  it("여러 시각·날짜 형식", () => {
    expect(toSeconds("085512")).toBe(8 * 3600 + 55 * 60 + 12);
    expect(toSeconds(0.5)).toBe(12 * 3600);
    expect(toSeconds(excelDate(1899, 12, 30, 7, 1, 2, true))).toBe(7 * 3600 + 62);
    expect(toSeconds("오전 12:10")).toBe(600);
    expect(toSeconds("25:00")).toBeNull();
    expect(toDate("2026.9.1")).toBe("2026-09-01");
    expect(toDate("20260901")).toBe("2026-09-01");
    expect(toDate("2026년 9월 1일")).toBe("2026-09-01");
  });
});

describe("캡스 월별 파일 형식", () => {
  const capsRaw = (rows: (string | null)[][]): Grid => [HEADER, ...rows];

  it("캡스 헤더 매핑", () => {
    const m = guessMapping(HEADER);
    expect(m.date).toBe("발생일자");
    expect(m.time).toBe("발생시각");
    expect(m.name).toBe("이름");
    expect(m.mode).toBe("모드"); // '구분'(항상 '일반')이 아니라 '모드'
    expect(m.auth).toBe("인증");
    expect(m.work_type).toBe("근무형태");
    expect(m.place).toBe("근무지");
    expect(m.note).toBe("비고");
    expect([m.datetime, m.dept, m.emp_id]).toEqual([null, null, null]);
  });

  it("1월 헤더: 구분 없음, 인원 열", () => {
    const m = guessMapping(["요일", "발생일자", "발생시각", "이름", "근무형태", "모드", "인증", "근무지", "인원"]);
    expect(m.mode).toBe("모드");
    expect(m.note).toBe("인원");
  });

  it("행이 가장 많은 유효 시트를 원본으로", () => {
    const raw = capsRaw(Array.from({ length: 6 }, (_, i) =>
      ["화", "2026-09-01", `08:0${i}:00`, "가나다", "", "일반", "출근", "카드", "", ""]));
    const personal: Grid = [ // 수작업 직원별 시트: B2 제목, B4 헤더
      [N, N, N, N, N],
      [N, "생산팀 가나다", N, N, N],
      [N, N, N, N, N],
      [N, "요일", "발생일자", "발생시각", "이름"],
      [N, "화", "2026-09-01", "08:00:00", "가나다"],
    ];
    const memo: Grid = [["ABB 출퇴근 관련"], ["메모"]];
    expect(findRecordSheet([["abb", memo], ["가나다", personal], ["9월 전체", raw]])).toEqual(["9월 전체", 0]);
  });

  it("빈 행이 섞인 캡스 기록", () => {
    const raw = capsRaw([
      ["화", "2026-09-01", "06:47:28", "가나다", "", "일반", "출근", "카드", "", ""],
      Array(10).fill(N), // 7월 파일의 빈 행
      ["화", "2026-09-01", "17:30:37", "가나다", "정상(17:30)", "일반", "퇴근", "1:N 지문", "", ""],
    ]);
    const { records, dropped } = normalize(applyHeader(raw, 0), guessMapping(HEADER));
    expect(records).toHaveLength(2);
    expect(dropped).toBe(0);
    expect(records.map((r) => r.mode)).toEqual(["출근", "퇴근"]);
    expect(records[1].workType).toBe("정상(17:30)");
    expect(records[0].emp).toBe("가나다");
    expect(records[0].wd).toBe("화");
  });

  it("파일끼리 같은 기록은 하나만", () => {
    const raw = capsRaw([["화", "2026-09-01", "08:00:00", "가나다", "", "일반", "출근", "카드", "", ""]]);
    const { records } = normalize(applyHeader(raw, 0), guessMapping(HEADER));
    expect(combineRecords([records, [...records]])).toHaveLength(1);
  });
});
