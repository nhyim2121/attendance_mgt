/** 기타(내 업무): 주차 이름, 지난주 일지 이어받기, 반복 일정 펼치기, 달력 주 나누기 */
import { describe, expect, it } from "vitest";
import { carryOver, mondayOf, monthWeeks, occurrences, type Plan, shiftMonth, weekTitle, type WeekLog } from "@/lib/기타/work";

const plan = (p: Partial<Plan>): Plan => ({ id: "p", day: "2026-11-10", end: "", from: "", to: "", title: "t", kind: "회의", place: "", memo: "", repeat: "안 함", until: "", done: [], ...p });

describe("주", () => {
  it("월요일과 주차 이름 (목요일이 속한 달 기준)", () => {
    expect(mondayOf("2026-11-10")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(weekTitle("2026-11-09")).toBe("11월 2주차");
    expect(weekTitle("2026-10-26")).toBe("10월 5주차"); // 목 10/29
    expect(weekTitle("2026-11-30")).toBe("12월 1주차"); // 목 12/3
  });
  it("달력 주와 달 넘기기", () => {
    expect(monthWeeks("2026-11")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("지난주 일지 이어받기", () => {
  it("차주 계획은 이번 주 계획으로, 끝난 일은 계획이 없으면 빠진다", () => {
    const last: WeekLog = { name: "a", issue: "", request: "", updatedAt: "", rows: [
      { id: "1", cat: "총무", task: "비품 정리", prev: "", done: "절반", pct: 50, next: "나머지 정리", note: "x" },
      { id: "2", cat: "입찰", task: "끝난 일", prev: "", done: "끝", pct: 100, next: "", note: "" },
      { id: "3", cat: "입찰", task: "이어서", prev: "", done: "끝", pct: 100, next: "후속 보고", note: "" },
    ] };
    const rows = carryOver(last, () => "n");
    expect(rows.map((r) => [r.task, r.prev, r.pct, r.done])).toEqual([["비품 정리", "나머지 정리", 50, ""], ["이어서", "후속 보고", 0, ""]]);
    expect(carryOver(null, () => "n")).toEqual([]);
  });
});

describe("일정 펼치기", () => {
  it("하루·여러 날·매주·매월·평일", () => {
    expect(occurrences(plan({}), "2026-11-01", "2026-11-30").map((h) => h.day)).toEqual(["2026-11-10"]);
    expect(occurrences(plan({ end: "2026-11-12" }), "2026-11-11", "2026-11-30").map((h) => h.day)).toEqual(["2026-11-11", "2026-11-12"]);
    expect(occurrences(plan({ repeat: "매주", until: "2026-11-24" }), "2026-11-01", "2026-11-30").map((h) => h.day)).toEqual(["2026-11-10", "2026-11-17", "2026-11-24"]);
    expect(occurrences(plan({ day: "2026-01-31", repeat: "매월" }), "2026-02-01", "2026-03-31").map((h) => h.day)).toEqual(["2026-02-28", "2026-03-31"]);
    expect(occurrences(plan({ day: "2026-11-13", repeat: "매일(평일)" }), "2026-11-13", "2026-11-17").map((h) => h.day)).toEqual(["2026-11-13", "2026-11-16", "2026-11-17"]);
  });
  it("반복 일정의 끝냄은 회차별", () => {
    const hits = occurrences(plan({ repeat: "매주", done: ["2026-11-17"] }), "2026-11-10", "2026-11-24");
    expect(hits.map((h) => h.done)).toEqual([false, true, false]);
  });
});
