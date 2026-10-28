/** 근태현황(하이웍스 정리) 파일 파싱 테스트. */
import { describe, expect, it } from "vitest";
import { excelDate, type Grid } from "@/lib/excel";
import { parseDailySheet, parseHiworks, parseHolidayTables, parseRoster, sheetDate } from "@/lib/hiworks";

const N = null;

function dailyRaw(): Grid {
  //  A  B(구분) C(부서)   D(직급) E(성명)  F연차 G반차 H반반차 I외출 J출장 K근무지 L비고
  return [
    [N, N, N, N, N, N, N, N, N, N, N, N],
    [N, "구분", "부서", "직급", "성명", "근  태  현  황", N, N, N, N, "근무지\n(목적지/사유/시간)", "비고"],
    [N, N, N, N, N, "연차", "반차", "반반차", "외출", "출장", N, N],
    [N, 1, "영업팀", "이사", "가나다", "o", N, N, N, N, "개인사유", N],
    [N, 2, N, N, N, N, N, N, N, "o", "신승에너지\n회사소개", "10/15(목) 근태"],
    [N, 3, N, "부장", "라마바", N, N, "o ", "O", N, "개인사유\n15:30~17:30", N],
    [N, N, N, N, N, N, N, N, N, N, N, N],
    [N, 4, "생산팀", "도제", "사아자", "OFF-JT(학교)", N, N, N, N, N, N],
    [N, N, N, N, N, "o", N, N, N, N, N, N], // 표 아래 낙서
    [N, "일학습병행(도제) 관련", N, N, N, N, N, N, N, N, N, N],
    [N, 1, "생산팀", "도제", "차카타", "o", N, N, N, N, N, N], // 참고 표: 읽지 않음
  ];
}

const triples = (xs: { day: string; name: string; type: string }[]) => new Set(xs.map((x) => `${x.day}|${x.name}|${x.type}`));

describe("근태현황 파일", () => {
  it("시트 이름의 날짜", () => {
    expect(sheetDate("26.10.27(화)")).toBe("2026-10-27");
    expect(sheetDate("26..04.22(수)")).toBe("2026-04-22");
    expect(sheetDate("26.08.07(금")).toBe("2026-08-07");
    expect(sheetDate("26.08.03참고")).toBeNull();
    expect(sheetDate("26.04.04~04.05(주말)")).toBeNull();
    expect(sheetDate("명단")).toBeNull();
  });

  it("일일보고 시트", () => {
    const recs = parseDailySheet(dailyRaw(), "2026-10-16", "26.10.16(금)");
    expect(triples(recs)).toEqual(new Set([
      "2026-10-16|가나다|연차",
      "2026-10-15|가나다|출장", // 비고의 '10/15(목) 근태'
      "2026-10-16|라마바|반반차",
      "2026-10-16|라마바|외출",
      "2026-10-16|사아자|OFF-JT(학교)",
    ]));
    expect(recs.find((r) => r.name === "라마바")!.dept).toBe("영업팀"); // 병합된 부서 칸
    expect(recs.some((r) => r.name === "차카타")).toBe(false);
  });

  it("명단과 통합문서", () => {
    const rosterRaw: Grid = [[N, N, N], ["구분", "부서", "성명"], [1, "품질팀", "가나다"], [2, "생산팀", "라마바"]];
    expect(parseRoster(rosterRaw).map((r) => r.name)).toEqual(["가나다", "라마바"]);
    const { roster, leaves, skipped } = parseHiworks([
      ["명단", rosterRaw], ["26.10.16(금)", dailyRaw()], ["26.04.04~04.05(주말)", [[1]]],
    ]);
    expect(roster).toHaveLength(2);
    expect(leaves).toHaveLength(5);
    expect(skipped).toEqual(["26.04.04~04.05(주말)"]);
  });

  it("휴일근무 표 (작업내용 병합)", () => {
    const raw: Grid = [
      [N, "휴일근무 관련", N, N, N, N, N, N],
      [N, "구분", "부서", "직급", "성명", "근무일자", N, "작업내용"],
      [N, N, N, N, N, excelDate(2026, 9, 12), excelDate(2026, 9, 13), N],
      [N, 1, "품질팀", "부장", "가나다", "o", N, "에쓰엔\n온도상승시험"],
      [N, 2, N, "과장", "라마바", "o", "o", N],
      [N, 3, "생산팀", "과장", "사아자", N, "o", "신공장\n페인트 작업"],
    ];
    const recs = parseHolidayTables(raw, "2026-09-14");
    expect(new Set(recs.map((r) => `${r.day}|${r.name}|${r.content.split("\n")[0]}`))).toEqual(new Set([
      "2026-09-12|가나다|에쓰엔",
      "2026-09-12|라마바|에쓰엔",
      "2026-09-13|라마바|에쓰엔",
      "2026-09-13|사아자|신공장",
    ]));
    expect(new Set(recs.map((r) => r.type))).toEqual(new Set(["휴일근무"]));
  });

  it("유형이 다르면 위 내용을 이어받지 않는다", () => {
    const raw = dailyRaw();
    raw[5][10] = N;
    expect(parseDailySheet(raw, "2026-10-16").find((r) => r.name === "라마바")!.content).toBe("");
  });

  it("보조 숫자는 근태가 아니다", () => {
    const raw = dailyRaw();
    raw[3][6] = "5"; // 가나다 반차 칸에 보조 숫자
    raw[5][9] = "0"; // 라마바 출장 칸에 'o' 대신 '0'
    const recs = parseDailySheet(raw, "2026-10-16");
    expect(recs.some((r) => r.type === "5")).toBe(false);
    expect(recs.some((r) => r.name === "라마바" && r.type === "출장")).toBe(true);
  });
});
