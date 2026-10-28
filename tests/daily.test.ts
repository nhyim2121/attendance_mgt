/** 일일 근태현황 보고서·일일 현황판·직원 명부·기입값 테스트 (가짜 이름). */
import { describe, expect, it } from "vitest";
import { boardCounts, buildDays, dailyBoard, type Override } from "@/lib/analytics";
import { HOLIDAYS_2026 } from "@/lib/config";
import {
  mergeLeaves, prefillFromLeaves, renderReportHtml, reportCounts, reportToLeaves, type ReportRow, summaryText,
  weekendBefore,
} from "@/lib/daily";
import { activeNames, applyEmployees, type Employee, employment, isEmployed } from "@/lib/employees";
import { employeeRows, SHEET_COLUMNS } from "@/lib/splitter";
import { ts } from "@/lib/time";
import { leave, mini, RULE } from "./helpers";

const DAY = "2026-10-26"; // 월요일
const row = (r: Partial<ReportRow>): ReportRow => ({
  section: "", ord: 0, dept: "", rank: "", name: "", types: "", title: "", detail: "", value: "", note: "", ...r,
});

function rows(): ReportRow[] {
  return [
    row({ section: "근태", ord: 1, dept: "생산팀", rank: "대리", name: "가나다", types: "연차", title: "개인사유", detail: "10/26(월)~28(수) 3일" }),
    row({ section: "근태", ord: 2, dept: "생산팀", rank: "대리", name: "라마바", types: "반차", title: "오전반차", detail: "08:30~13:30" }),
    row({ section: "근태", ord: 3, dept: "생산팀", rank: "차장", name: "사아자", types: "출장", title: "김포발전소", detail: "신품 전동기 납품" }),
    row({ section: "근태", ord: 4, dept: "영업팀", rank: "이사", name: "차카타", types: "출장", title: "김포발전소", detail: "신품 전동기 납품" }),
    row({ section: "도제", ord: 1, dept: "생산팀", rank: "도제", name: "파하가", value: "-", note: "10/21(수)~10/30(금) 출근 예정" }),
    row({ section: "휴가일정", ord: 1, dept: "관리팀", rank: "사원", name: "나다라", value: "10/30(금)", note: "10/29(목) 1일 연차" }),
    row({ section: "휴일근무", ord: 1, dept: "품질팀", rank: "부장", name: "다라마", types: "2026-10-24,2026-10-25", title: "에쓰엔", note: "온도상승시험" }),
  ];
}
const withDay = (rs: ReportRow[], day = DAY) => rs.map((r) => ({ ...r, day }));
const col = (rs: string[][], name: string) => rs.map((r) => r[SHEET_COLUMNS.indexOf(name)]);

describe("일일 근태현황 보고서", () => {
  it("근태 판정용 변환과 병합", () => {
    const lv = reportToLeaves(withDay(rows()));
    expect(new Set(lv.map((l) => `${l.name}|${l.type}`))).toEqual(
      new Set(["가나다|연차", "라마바|반차", "사아자|출장", "차카타|출장", "다라마|휴일근무"]));
    expect(new Set(lv.filter((l) => l.type === "휴일근무").map((l) => l.day))).toEqual(new Set(["2026-10-24", "2026-10-25"]));
    const fileLv = [
      leave(DAY, "가나다", "", "", "반차", "옛 내용", "", "s"), // 보고서가 있는 날 -> 보고서가 우선
      leave("2026-10-23", "가나다", "", "", "연차", "", "", "s"), // 다른 날 -> 유지
    ];
    const got = new Set(mergeLeaves(fileLv, withDay(rows()), [DAY]).map((l) => `${l.day}|${l.name}|${l.type}`));
    expect(got.has(`${DAY}|가나다|반차`)).toBe(false);
    expect(got.has(`${DAY}|가나다|연차`)).toBe(true);
    expect(got.has("2026-10-23|가나다|연차")).toBe(true);
  });

  it("미리 채우기와 직전 주말", () => {
    const fileLv = [
      leave(DAY, "가나다", "생산팀", "대리", "반반차", "개인사유\n14:00~17:30", "", "s"),
      leave(DAY, "가나다", "생산팀", "대리", "외출", "개인사유\n14:00~17:30", "", "s"),
    ];
    const pre = prefillFromLeaves(fileLv, DAY);
    expect(pre).toHaveLength(1);
    expect(pre[0].types).toBe("반반차,외출");
    expect(pre[0].detail).toBe("14:00~17:30");
    expect(weekendBefore(DAY)).toEqual(["2026-10-24", "2026-10-25"]);
  });

  it("요약 카드와 표", () => {
    expect(reportCounts(rows())).toEqual({ 휴가: 2, 외출: 0, "출장·교육": 2, "휴일·연장": 1 });
    const html = renderReportHtml(DAY, rows());
    for (const text of ["2026년 10월 26일(월) 근태현황", "근태 현황", "휴가 일정", "휴일·연장", "일학습병행(도제)",
      "10/24(토)", "김포발전소", "신품 전동기 납품", "10/30(금)"]) expect(html).toContain(text);
    expect(html.split("김포발전소").length - 1).toBe(2); // 칸 합치기 없이 사람마다 표시
    expect(html).toContain("border-top:4px solid"); // 요약 카드
    expect(html).not.toContain("display:grid"); // 메일에서 깨지는 CSS 안 씀
    expect(summaryText(rows())).toBe("연차 1, 반차 1, 출장 2");
  });

  it("이스케이프와 빈 보고서", () => {
    const html = renderReportHtml(DAY, [row({ section: "근태", dept: "<b>", name: "<script>x</script>", types: "연차", title: "a & b" })]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b");
    expect(renderReportHtml(DAY, [])).toContain("특이사항이 없습니다");
  });
});

describe("일일 현황판", () => {
  it("평일 집계", () => {
    const recs = mini([
      ["2026-10-26", "08:10:00", "출근자", "출근"], ["2026-10-26", "17:40:00", "출근자", "퇴근"],
      ["2026-10-26", "08:50:00", "지각자", "출근"],
      ["2026-10-23", "08:00:00", "결근자", "출근"], ["2026-10-23", "17:30:00", "결근자", "퇴근"],
      ["2026-10-23", "08:00:00", "가나다", "출근"],
    ]);
    const lv = reportToLeaves(withDay(rows()));
    const days = buildDays(recs, lv, RULE, HOLIDAYS_2026);
    const staff: [string, string][] = ["출근자", "지각자", "결근자", "가나다"].map((n) => [n, "생산팀"]);
    const board = dailyBoard(days, lv, staff, DAY, RULE, ts(DAY, 15 * 3600));
    expect(Object.fromEntries(board.map((b) => [b.emp, b.group]))).toEqual(
      { 출근자: "퇴근", 지각자: "근무 중", 결근자: "기록 없음", 가나다: "휴가" });
    const c = boardCounts(board);
    expect([c.출근, c.퇴근, c.지각, c["기록 없음"], c.휴가, c["근무 중"]]).toEqual([2, 1, 1, 1, 1, 1]);
    expect("미출근" in c).toBe(false);
  });

  it("주말 현황판과 휴일근무", () => {
    const sat = "2026-10-24";
    const recs = mini([["2026-10-24", "08:10:00", "주말출근", "출근"], ["2026-10-24", "15:00:00", "주말출근", "퇴근"],
      ["2026-10-23", "08:00:00", "쉬는사람", "출근"], ["2026-10-23", "08:00:00", "현장근무", "출근"]]);
    const lv = reportToLeaves([row({ section: "근태", dept: "생산팀", name: "현장근무", types: "휴일근무", title: "신공장", detail: "08:30~17:30", day: sat })]);
    const days = buildDays(recs, lv, RULE, HOLIDAYS_2026);
    const staff: [string, string][] = ["주말출근", "쉬는사람", "현장근무"].map((n) => [n, "생산팀"]);
    const board = dailyBoard(days, lv, staff, sat, RULE, null, true);
    expect(Object.fromEntries(board.map((b) => [b.emp, b.group]))).toEqual({ 주말출근: "휴일근무", 쉬는사람: "휴무", 현장근무: "휴일근무" });
    const c = boardCounts(board);
    expect([c.휴일근무, c.대상, c.출근]).toEqual([2, 2, 1]);
    // 캡스 기록 없이 휴일근무를 올린 사람은 직원별 시트에 '휴일근무'와 근무지로 남는다
    const r = employeeRows(days.filter((d) => d.emp === "현장근무"), RULE).find((x) => x[1] === sat)!;
    expect(r[SHEET_COLUMNS.indexOf("발생시각")]).toBe("휴일근무");
    expect(r[SHEET_COLUMNS.indexOf("근무지")]).toBe("신공장");
  });

  it("연장근무 신청이면 퇴근 근무형태에 시각", () => {
    const recs = mini([["2026-10-26", "08:20:00", "가나다", "출근"], ["2026-10-26", "20:05:00", "가나다", "퇴근"]]);
    const lv = reportToLeaves([row({ section: "근태", dept: "생산팀", name: "가나다", types: "연장근무", title: "권선작업", detail: "17:30~20:00", day: DAY })]);
    const days = buildDays(recs, lv, RULE, HOLIDAYS_2026);
    expect(col(employeeRows(days, RULE), "근무형태")).toEqual(["", "연장(20:00)"]);
    expect(boardCounts(dailyBoard(days, lv, [["가나다", "생산팀"]], DAY, RULE)).연장근무).toBe(1);
  });
});

describe("기입값·직원 명부", () => {
  const ov = (o: Partial<Override>): Override => ({
    employee: "가나다", day: "2026-09-02", clockIn: null, inType: null, clockOut: null, outType: null, place: null,
    note: null, editedBy: "lee", editedAt: "", ...o,
  });

  it("기입값 반영", () => {
    const recs = mini([["2026-09-01", "08:20:00", "가나다", "출근"], ["2026-09-01", "17:35:00", "가나다", "퇴근"],
      ["2026-09-02", "17:44:00", "가나다", "퇴근"]]);
    const days = buildDays(recs, null, RULE, HOLIDAYS_2026,
      [ov({ clockIn: "08:00:00", inType: "조출(08:00)", note: "지게차 교육" })]);
    const d2 = days.find((d) => d.day === "2026-09-02")!;
    expect(d2.in).toBe(ts("2026-09-02", 8 * 3600));
    expect(d2.inSrc).toBe("수기입력");
    expect(d2.status).toBe("정상");
    const r2 = employeeRows(days, RULE).filter((r) => r[1] === "2026-09-02");
    expect(col(r2, "근무형태")).toEqual(["조출(08:00)", ""]);
    expect(col(r2, "인증")).toEqual(["수기입력", "카드"]);
    expect(new Set(col(r2, "비고"))).toEqual(new Set(["지게차 교육"]));
  });

  it("퇴근을 지우면 퇴근 기록 없음", () => {
    const recs = mini([["2026-09-01", "08:20:00", "가나다", "출근"], ["2026-09-01", "17:35:00", "가나다", "퇴근"]]);
    const days = buildDays(recs, null, RULE, HOLIDAYS_2026, [ov({ day: "2026-09-01", clockOut: "" })]);
    expect(days[0].status).toBe("퇴근 기록 없음");
  });

  it("재직 기간과 캡스 이름", () => {
    const emp = (e: Partial<Employee>): Employee => ({
      name: "", capsName: "", empId: "", dept: "", rank: "", joinDate: null, leaveDate: null, note: "", ord: 0, ...e,
    });
    const emps = [
      emp({ name: "재직자", dept: "생산팀", rank: "대리" }),
      emp({ name: "퇴사자", dept: "품질팀", joinDate: "2026-01-01", leaveDate: "2026-09-30" }),
      emp({ name: "신입", capsName: "신입A", dept: "관리팀", joinDate: "2026-10-19" }),
    ];
    expect(activeNames(emps, DAY, DAY)).toEqual(["재직자", "신입"]);
    expect(activeNames(emps, "2026-09-01", "2026-09-30")).toEqual(["재직자", "퇴사자"]);
    const spans = employment(emps);
    expect(isEmployed(spans.get("퇴사자"), "2026-09-30")).toBe(true);
    expect(isEmployed(spans.get("퇴사자"), "2026-10-01")).toBe(false);
    const out = applyEmployees(mini([["2026-10-26", "08:00:00", "신입A", "출근"]]), emps);
    expect([out[0].name, out[0].emp, out[0].dept]).toEqual(["신입", "신입", "관리팀"]);
    // 사번이 찍힌 기록도 명부 이름 하나로 묶는다 (일일 캡스 파일)
    const withId = applyEmployees([{ ...mini([["2026-10-26", "08:00:00", "재직자", "출근"]])[0], empId: "2025", emp: "재직자(2025)" }], emps);
    expect([withId[0].emp, withId[0].dept]).toEqual(["재직자", "생산팀"]);
    // 명부에 없는 사람은 그대로
    const outsider = applyEmployees([{ ...mini([["2026-10-26", "08:00:00", "경비", "출근"]])[0], empId: "9", emp: "경비(9)" }], emps);
    expect(outsider[0].emp).toBe("경비(9)");
  });
});
