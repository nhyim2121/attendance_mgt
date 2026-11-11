/** 근태 판정·근무형태·직원별 시트 테스트 (이름은 가짜). */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  attention, buildDays, type DayRow, daySnapshot, employeeSummary, hourlyByWeekday, leaveStatus, missingRows,
  orderByDept, workHoursReport, workTypeIn, workTypeOut,
} from "@/lib/인사노무/analytics";
import { HOLIDAYS_2026 } from "@/lib/config";
import { buildWorkbook, buildZip, employeeRows, exceptionRows, rowKind, safeSheetName, SHEET_COLUMNS } from "@/lib/인사노무/splitter";
import { ts } from "@/lib/time";
import { leave, mini, RULE } from "./helpers";

const T = (s: string) => ts(s.slice(0, 10), +s.slice(11, 13) * 3600 + +s.slice(14, 16) * 60 + +(s.slice(17, 19) || 0));

function records() {
  return mini([
    // 가나다: 9/1(화) ~ 9/7(월)
    ["2026-09-01", "08:20:00", "가나다", "출근"],
    ["2026-09-01", "12:00:00", "가나다", "해제"], // 경비 해제: 판정 제외
    ["2026-09-01", "17:35:00", "가나다", "퇴근"],
    ["2026-09-02", "08:45:00", "가나다", "출근"], // 지각
    ["2026-09-02", "19:10:00", "가나다", "퇴근"], // 연장(19:00)
    // 9/3 기록 없음
    ["2026-09-04", "09:30:00", "가나다", "출근"], // 반반차라 지각 아님
    ["2026-09-04", "17:31:00", "가나다", "퇴근"],
    ["2026-09-05", "08:10:00", "가나다", "출근"], // 토요일
    ["2026-09-05", "15:20:00", "가나다", "퇴근"],
    ["2026-09-07", "08:00:00", "가나다", "출입"],
    ["2026-09-07", "08:01:00", "가나다", "출근"],
    ["2026-09-07", "17:40:00", "가나다", "퇴근"],
    // 라마바: 9/1 ~ 9/3
    ["2026-09-01", "08:00:00", "라마바", "출근"],
    ["2026-09-01", "16:00:00", "라마바", "퇴근"], // 조퇴
    // 9/2 연차
    ["2026-09-03", "08:10:00", "라마바", "출근"], // 퇴근 기록 없음
  ], (n) => (n === "가나다" ? "생산팀" : "품질팀"));
}

const leaves = () => [
  leave("2026-09-04", "가나다", "생산팀", "사원", "반반차", "개인사유\n08:30~10:30"),
  leave("2026-09-02", "라마바", "품질팀", "과장", "연차", "개인사유"),
];
const days = () => buildDays(records(), leaves(), RULE, HOLIDAYS_2026);
const at = (ds: DayRow[], emp: string, d: string) => ds.find((x) => x.emp === emp && x.day === d)!;
const col = (rows: string[][], name: string) => rows.map((r) => r[SHEET_COLUMNS.indexOf(name)]);

describe("근태 판정", () => {
  it("일별 상태", () => {
    const d = days();
    expect(at(d, "가나다", "2026-09-01").status).toBe("정상");
    expect(at(d, "가나다", "2026-09-02").status).toBe("지각");
    expect(at(d, "가나다", "2026-09-03").status).toBe("기록 없음");
    expect(at(d, "가나다", "2026-09-04").status).toBe("정상");
    expect(at(d, "가나다", "2026-09-05").status).toBe("휴일근무");
    expect(d.some((x) => x.day === "2026-09-06")).toBe(false); // 일요일, 기록 없음 -> 행 없음
    expect(at(d, "라마바", "2026-09-01").status).toBe("조퇴");
    expect(at(d, "라마바", "2026-09-02").status).toBe("연차");
    expect(at(d, "라마바", "2026-09-03").status).toBe("퇴근 기록 없음");
    // 출입 태그보다 '출근' 모드 우선
    expect(at(d, "가나다", "2026-09-07").in).toBe(T("2026-09-07 08:01"));
  });

  it("근무형태 표기", () => {
    expect(workTypeIn(T("2026-09-01 08:20"), false, RULE)).toBe("정상(08:30)");
    // 조출은 자동으로 붙이지 않는다 (근태 기입에서 직접 적을 때만)
    expect(workTypeIn(T("2026-09-01 05:29"), false, RULE)).toBe("정상(08:30)");
    expect(workTypeIn(T("2026-09-05 08:10"), true, RULE)).toBe("휴일(08:30)");
    expect(workTypeOut(T("2026-09-01 18:08"), false, RULE)).toBe("정상(17:30)");
    expect(workTypeOut(T("2026-09-01 20:11"), false, RULE)).toBe("연장(20:00)");
    expect(workTypeOut(T("2026-09-05 15:20"), true, RULE)).toBe("휴일(15:00)");
  });

  it("직원별 요약", () => {
    const s = Object.fromEntries(employeeSummary(days()).map((r) => [r.emp, r]));
    expect(s["가나다"].late).toBe(1);
    expect(s["가나다"].noRecord).toBe(1);
    expect(s["가나다"].holidayWork).toBe(1);
    expect(s["가나다"].leaveUsed).toBe(0.25);
    expect(s["라마바"].leaveUsed).toBe(1);
    expect(s["라마바"].early).toBe(1);
  });

  it("시간대 표는 경비 설정/해제 제외", () => {
    expect(hourlyByWeekday(records())[1][12]).toBe(0); // 화요일 12시
  });
});

describe("직원별 시트", () => {
  it("행 형식", () => {
    const d = days();
    let rows = employeeRows(d.filter((x) => x.emp === "라마바"), RULE);
    expect(col(rows, "모드")[0]).toBe("출근");
    expect(col(rows, "발생시각").slice(0, 3)).toEqual(["08:00:00", "16:00:00", "연차"]);
    // 출근만 있는 날(9/3)은 찍힌 시각과 사유를 적고 노란색
    const last = rows[rows.length - 1];
    expect([last[0], last[1], last[SHEET_COLUMNS.indexOf("모드")]]).toEqual(["목", "2026-09-03", "출근"]);
    expect(last[SHEET_COLUMNS.indexOf("확인")]).toContain("퇴근 기록 없음");
    expect(rowKind(last)).toBe("missing");
    expect(col(rows, "확인")[0]).toBe("조퇴");

    rows = employeeRows(d.filter((x) => x.emp === "가나다"), RULE);
    expect(col(rows.filter((r) => r[1] === "2026-09-02"), "근무형태")).toEqual(["", "연장(19:00)"]); // 평범한 출근은 비워 둠
    expect(col(rows.filter((r) => r[1] === "2026-09-05"), "근무형태")).toEqual(["휴일(08:30)", "휴일(15:00)"]);
    // 휴가: 확인 칸엔 종류만, 시각은 근무형태 (오전 반반차 08:30~10:30 -> 출근 형태 '반반차(10:30)'), 사유는 비고
    const d4 = rows.filter((r) => r[1] === "2026-09-04");
    expect(col(d4, "근무형태")[0]).toBe("반반차(10:30)");
    expect(col(d4, "비고")[0]).toBe("개인사유");
    expect(col(d4, "확인")[0]).toBe("반반차");
  });

  it("시트 이름 규칙", () => {
    const used = new Set<string>();
    expect(safeSheetName("a/b:c", used)).toBe("a_b_c");
    expect(safeSheetName("A_B_C", used)).toBe("A_B_C_2");
    expect(safeSheetName("가".repeat(40), used)).toHaveLength(31);
  });

  it("엑셀 배치", async () => {
    const recs = records(), d = days();
    const summary = employeeSummary(d).map((s) => [s.emp, s.dept, s.workDays]);
    const data = await buildWorkbook({ records: recs, days: d, employees: ["가나다", "라마바"], rule: RULE, summary, label: "9월" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(data).buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["9월 전체", "요약", "확인 필요", "가나다", "라마바"]);
    const ws = wb.getWorksheet("가나다")!;
    expect(ws.getCell("B2").value).toBe("생산팀 가나다");
    expect(ws.getCell("B4").value).toBe("요일");
    expect(ws.getCell("D5").value).toBe("08:20:00");
    expect(wb.getWorksheet("9월 전체")!.rowCount).toBe(recs.length + 1);
    // 이름을 누르면 직원 시트로, 직원 시트에서 요약으로
    expect(wb.getWorksheet("요약")!.getCell("A2").formula).toBe(`HYPERLINK("#'가나다'!A1","가나다")`);
    expect(ws.getCell("B1").formula).toBe(`HYPERLINK("#'요약'!A1","← 요약")`);
    const ex = wb.getWorksheet("확인 필요")!;
    expect(ex.rowCount).toBe(exceptionRows(d, ["가나다", "라마바"]).length + 1);
    expect(ex.getCell("B2").formula).toContain("#'가나다'!A1");
  });

  it("확인 필요 목록은 직원 순서·날짜순, 근태 내용 포함", () => {
    const recs = mini([
      ["2026-09-01", "09:00:00", "가나다", "출근"], ["2026-09-01", "17:40:00", "가나다", "퇴근"], // 지각
      ["2026-09-02", "09:10:00", "가나다", "출근"], // 지각 + 퇴근 누락
      ["2026-09-03", "08:10:00", "가나다", "출근"], ["2026-09-03", "17:40:00", "가나다", "퇴근"], // 정상
      ["2026-09-04", "08:10:00", "가나다", "출근"], ["2026-09-04", "17:40:00", "가나다", "퇴근"],
    ]);
    const lv = [leave("2026-09-02", "가나다", "생산팀", "", "반차", "오후반차")];
    const d = buildDays(recs, lv, RULE, HOLIDAYS_2026);
    const rows = exceptionRows(d, ["가나다"]);
    expect(rows.map((r) => [r[2], r[4], r[5], r[6], r[7]])).toEqual([
      ["2026-09-01", "지각", "09:00", "17:40", ""],
      ["2026-09-02", "퇴근 기록 없음", "09:10", "", "반차: 오후반차"], // 반차면 지각 판정 안 함
    ]);
    expect(exceptionRows(buildDays(recs, null, RULE, HOLIDAYS_2026), ["가나다"])[1][4]).toBe("지각, 퇴근 기록 없음");
  });

  it("부서끼리 묶기", () => {
    const rows = [{ n: "a", d: "품질" }, { n: "b", d: "생산" }, { n: "c", d: "" }, { n: "e", d: "품질" }];
    expect(orderByDept(rows, (r) => r.d).map((r) => r.n)).toEqual(["a", "e", "b", "c"]);
  });

  it("ZIP", async () => {
    const zip = await JSZip.loadAsync(await buildZip(records(), days(), ["가나다", "라마바"], RULE, "9월"));
    expect(Object.keys(zip.files).sort()).toEqual(["9월 가나다.xlsx", "9월 라마바.xlsx"]);
  });

  it("퇴근 태그만 있는 날, 출장 시각 채우기, 일행", () => {
    const recs = mini([
      ["2026-09-07", "17:44:33", "가나다", "퇴근"], // 교육 다녀와서 퇴근만 찍음
      ["2026-09-08", "08:20:00", "가나다", "출근"], // 출장: 오전에 나감
      ["2026-09-08", "10:25:00", "가나다", "출입"],
      ["2026-09-08", "08:10:00", "라마바", "출근"],
      ["2026-09-08", "17:40:00", "라마바", "퇴근"],
      ["2026-09-09", "08:00:00", "라마바", "출근"],
      ["2026-09-09", "17:41:00", "라마바", "출입"], // 퇴근 모드 없음
    ]);
    const lv = [
      leave("2026-09-07", "가나다", "생산팀", "", "교육", "서산 운전학원\n지게차"),
      leave("2026-09-08", "가나다", "생산팀", "", "출장", "원동취수장\n교체작업"),
      leave("2026-09-08", "다라마", "생산팀", "", "출장", "원동취수장\n교체작업"),
    ];
    const d = buildDays(recs, lv, RULE, HOLIDAYS_2026);
    const d7 = at(d, "가나다", "2026-09-07");
    expect(d7.inSrc).toBe("하이웍스");
    expect(d7.in).toBe(T("2026-09-07 08:30"));
    expect(d7.out).toBe(T("2026-09-07 17:44:33"));
    const d8 = at(d, "가나다", "2026-09-08");
    expect(d8.outSrc).toBe("하이웍스");
    expect(d8.out).toBe(T("2026-09-08 17:30"));
    expect(d8.mates).toBe("다라마");
    expect(at(d, "라마바", "2026-09-09").status).toBe("퇴근 기록 없음");

    const rows = employeeRows(d.filter((x) => x.emp === "가나다"), RULE);
    expect(col(rows, "근무형태")).toEqual(["정상출근(08:30)", "", "", "정상퇴근(17:30)"]);
    expect(col(rows, "인증")).toEqual(["하이웍스", "카드", "카드", "하이웍스"]);
    expect(col(rows, "근무지")[0]).toBe("서산 운전학원");
    expect(col(rows, "비고")[2]).toBe("다라마");
    const r = employeeRows(d.filter((x) => x.emp === "라마바"), RULE);
    const last = r[r.length - 1];
    expect([last[1], last[2], last[SHEET_COLUMNS.indexOf("확인")]])
      .toEqual(["2026-09-09", "08:00:00", "퇴근 기록 없음(마지막 태그 17:41)"]);
  });

  it("기록 없는 날은 날짜와 사유만", () => {
    const rows = employeeRows(days().filter((x) => x.emp === "가나다"), RULE).filter((r) => r[1] === "2026-09-03");
    expect(rows).toHaveLength(1);
    expect(rows[0].slice(2, -1).every((v) => v === "")).toBe(true);
    expect(rows[0][SHEET_COLUMNS.indexOf("확인")]).toBe("기록 없음");
    expect(rowKind(rows[0])).toBe("blank");
  });
});

describe("대시보드 집계", () => {
  it("카드·누락·리포트·휴가·관리 대상", () => {
    const d = days();
    expect(daySnapshot(d, "2026-09-02")).toEqual({ 출근: 1, 지각: 1, 미출근: 0, 휴가: 1 }); // 가나다 지각, 라마바 연차

    const miss = missingRows(d);
    expect(new Set(miss.map((m) => `${m.emp}|${m.label}`))).toEqual(new Set(["가나다|미출근", "라마바|퇴근 누락"]));
    expect(miss[0].day >= miss[miss.length - 1].day).toBe(true); // 최근 날짜 먼저

    const rep = Object.fromEntries(workHoursReport(d, RULE).map((r) => [r.emp, r]));
    expect(rep["가나다"].std).toBe(40); // 평일 9/1·2·3·4·7 = 5일 x 8h
    expect(rep["가나다"].overtime).toBe(1.5); // 9/2 19:10 퇴근 -> 17:30 이후 100분 -> 30분 단위 90분
    expect(rep["가나다"].holiday).toBe(6.5); // 9/5(토) 08:10~15:20 = 7h10m - 휴게 30분 -> 30분 단위 6.5h

    const ls = Object.fromEntries(leaveStatus(leaves(), ["가나다", "라마바"], "2026-09-30").map((r) => [r.name, r]));
    expect(ls["가나다"].annual).toBe(0.25);
    expect(ls["라마바"].annual).toBe(1);

    const groups = Object.fromEntries(attention(d, workHoursReport(d, RULE), ["경비"]));
    expect(groups["휴일 출근 직원"]).toEqual(["가나다"]);
    expect(groups["명단에 없는 출입자"]).toEqual(["경비"]);
  });

  it("08:30 전 출근은 실제근로에서 제외", () => {
    const recs = mini([["2026-09-01", "07:30:00", "가나다", "출근"], ["2026-09-01", "17:30:00", "가나다", "퇴근"]]);
    const rep = workHoursReport(buildDays(recs, null, RULE, HOLIDAYS_2026), RULE);
    expect(rep[0].actual).toBe(8); // 08:30~17:30 - 휴게 1h
  });
});
