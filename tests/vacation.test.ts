/** 휴가 관리(회계연도 연차·월차)·대시보드 집계·출장 묶기 테스트 (가짜 이름). */
import { describe, expect, it } from "vitest";
import { buildDays } from "@/lib/analytics";
import { HOLIDAYS_2026 } from "@/lib/config";
import { headcount, nightHours, overtimeHours, personStats, weekHours } from "@/lib/dashboard";
import type { Employee } from "@/lib/employees";
import { groupTrips } from "@/lib/evidence";
import { employeeRows, SHEET_COLUMNS } from "@/lib/splitter";
import {
  addMonths, annualGrant, DEFAULT_POLICY, expandVacations, fyOf, fyRange, leaveBalances, monthlyGrants, outingHours,
  type Vacation,
} from "@/lib/vacation";
import { leave, mini, RULE } from "./helpers";

const P = DEFAULT_POLICY;
const emp = (e: Partial<Employee>): Employee => ({
  name: "", capsName: "", empId: "", dept: "생산팀", rank: "", position: "", phone: "", ext: "", email: "", joinDate: null,
  leaveDate: null, note: "", ord: 0, ...e,
});

describe("회계연도 연차", () => {
  it("회계연도 경계", () => {
    expect(fyOf("2026-03-01", P)).toBe(2026);
    const p4 = { ...P, fyStartMonth: 4 };
    expect(fyOf("2026-03-31", p4)).toBe(2025);
    expect(fyRange(2026, p4)).toEqual(["2026-04-01", "2027-03-31"]);
  });

  it("입사 연도 0, 다음 해 비례, 그 뒤 기본·가산", () => {
    expect(annualGrant("2026-07-01", 2026, P).days).toBe(0);
    // 2025-07-01 입사: 2025년 재직 184일 / 365일 x 15 = 7.56 -> 0.5 단위 올림 8
    expect(annualGrant("2025-07-01", 2026, P)).toMatchObject({ days: 8, years: 1 });
    expect(annualGrant("2025-07-01", 2026, { ...P, prorateRound: "none" }).days).toBe(7.56);
    expect(annualGrant("2025-07-01", 2026, { ...P, prorate: false }).days).toBe(15);
    expect(annualGrant("2024-07-01", 2026, P).days).toBe(15); // 근속 1년
    expect(annualGrant("2023-07-01", 2026, P).days).toBe(15); // 2년
    expect(annualGrant("2022-07-01", 2026, P).days).toBe(16); // 3년
    expect(annualGrant("2000-01-01", 2026, P).days).toBe(25); // 상한
    expect(annualGrant(null, 2026, P).days).toBe(15);
  });

  it("월차: 매달 1일, 10일 이전 입사는 입사월 1일 추가", () => {
    const g = monthlyGrants("2026-03-10", P);
    expect(g[0]).toEqual(["2026-03-10", 1, "10일 이전 입사 (입사월)"]);
    expect(g.slice(1).map(([d]) => d)).toEqual([
      "2026-04-10", "2026-05-10", "2026-06-10", "2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10", "2026-11-10",
      "2026-12-10", "2027-01-10", "2027-02-10",
    ]);
    expect(monthlyGrants("2026-03-11", P)).toHaveLength(11); // 기준일 뒤 입사는 추가 없음
    expect(monthlyGrants("2026-03-05", { ...P, joinExtra: 0 })).toHaveLength(11);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("사용·잔여: 근태현황·보고서·등록 휴가 합산, 외출은 기본 차감 안 함", () => {
    const emps = [emp({ name: "가나다", joinDate: "2026-03-09" }), emp({ name: "라마바", joinDate: "2020-01-02" })];
    const lv = [
      leave("2026-05-04", "가나다", "", "", "연차", ""),
      leave("2026-06-01", "가나다", "", "", "반차", "오후반차"),
      leave("2026-07-01", "라마바", "", "", "반반차", ""),
      leave("2026-07-02", "라마바", "", "", "외출", "병원\n14:00~16:00"),
      leave("2026-12-01", "라마바", "", "", "연차", ""), // 기준일 뒤 = 예정
      leave("2025-12-31", "라마바", "", "", "연차", ""), // 지난 회계연도
    ];
    const adj = [{ id: 1, name: "라마바", fy: 2026, days: 2, reason: "이월", createdBy: "", createdAt: "" }];
    const [a, b] = leaveBalances(emps, lv, adj, 2026, "2026-10-30", P);
    // 가나다: 연차 0, 월차 = 입사월 1 + 4/9..10/9 7개 = 8 (11/9, 12/9 예정 2)
    expect(a).toMatchObject({ annual: 0, monthly: 8, monthlyLater: 2, used: 1.5, remain: 6.5 });
    // 라마바: 근속 5년 = 15 + 2 = 17, 조정 +2
    expect(b).toMatchObject({ annual: 17, adjust: 2, total: 19, used: 0.25, planned: 1, remain: 17.75, outingHours: 2 });
    const [, c] = leaveBalances(emps, lv, adj, 2026, "2026-10-30", { ...P, outingDeduct: true });
    expect(c.used).toBe(0.5);
    expect(outingHours("09:00 ~ 10:30")).toBe(1.5);
  });

  it("등록 휴가 펼치기: 기간은 근무일만", () => {
    const v: Vacation = {
      id: 1, name: "가나다", type: "연차", startDay: "2026-10-08", endDay: "2026-10-13", startTime: "", endTime: "",
      reason: "가족여행", note: "", createdBy: "", createdAt: "",
    };
    const work = (d: string) => !(d in HOLIDAYS_2026) && !["토", "일"].includes("월화수목금토일"[(new Date(d).getUTCDay() + 6) % 7]);
    expect(expandVacations([v], work).map((l) => l.day)).toEqual(["2026-10-08", "2026-10-12", "2026-10-13"]);
    const out = expandVacations([{ ...v, type: "외출", startDay: "2026-10-08", endDay: "2026-10-08", startTime: "14:00", endTime: "16:00" }], work);
    expect(out[0].content).toBe("가족여행\n14:00~16:00");
  });
});

describe("대시보드 집계", () => {
  const recs = mini([
    ["2026-10-26", "07:55:00", "가나다", "출근"], ["2026-10-26", "23:10:00", "가나다", "퇴근"],
    ["2026-10-26", "08:40:00", "라마바", "출근"], ["2026-10-26", "17:35:00", "라마바", "퇴근"],
    ["2026-10-27", "08:20:00", "라마바", "출근"], ["2026-10-27", "19:00:00", "라마바", "퇴근"],
  ]);
  const days = buildDays(recs, [], RULE, HOLIDAYS_2026);
  const d = (e: string, day: string) => days.find((x) => x.emp === e && x.day === day)!;

  it("연장·야간", () => {
    expect(overtimeHours(d("가나다", "2026-10-26"), RULE)).toBe(5.5); // 17:30 -> 23:10, 30분 절사
    expect(nightHours(d("가나다", "2026-10-26"))).toBe(1.17); // 22:00 -> 23:10
    expect(overtimeHours(d("라마바", "2026-10-26"), RULE)).toBe(0);
  });

  it("주간 누적·부서별 순서", () => {
    const w = weekHours(days, "2026-10-27", RULE);
    expect(w.map((x) => [x.emp, x.hours])).toEqual([["라마바", 17.42], ["가나다", 13.67]]);
    const s = personStats(days, RULE);
    const ga = s.find((x) => x.emp === "가나다")!, ra = s.find((x) => x.emp === "라마바")!;
    expect(ga).toMatchObject({ workDays: 1, earlyArrivals: 1, lateStays: 1, firstDays: 1, lastDays: 1 });
    expect(ra).toMatchObject({ workDays: 2, firstDays: 1, lastDays: 1, earliestIn: 8 * 60 + 20 });
  });

  it("인력 변동", () => {
    const h = headcount([
      emp({ name: "a", joinDate: "2026-10-05" }), emp({ name: "b", joinDate: "2020-01-01", leaveDate: "2026-10-20" }),
      emp({ name: "c", joinDate: "2021-01-01" }),
    ], "2026-10-30");
    expect(h).toMatchObject({ active: 2, startActive: 2, turnover: 50 });
    expect(h.byMonth[9]).toEqual({ month: "10월", join: 1, leave: 1 });
  });
});

describe("직원별 시트·증빙", () => {
  it("출근만 찍힌 날도 반차·외출은 시트에 남는다", () => {
    const recs = mini([["2026-10-26", "08:20:00", "가나다", "출근"]]);
    const days = buildDays(recs, [leave("2026-10-26", "가나다", "생산팀", "", "반차", "오후반차")], RULE, HOLIDAYS_2026);
    const [row] = employeeRows(days, RULE);
    expect(row[SHEET_COLUMNS.indexOf("발생시각")]).toBe("08:20:00");
    expect(row[SHEET_COLUMNS.indexOf("확인")]).toBe("퇴근 기록 없음, 반차");
    expect(row[SHEET_COLUMNS.indexOf("비고")]).toBe("반차: 오후반차");
  });

  it("출장 묶기: 같은 목적지로 이어지는 날은 한 건", () => {
    const t = groupTrips([
      leave("2026-10-23", "가나다", "", "", "출장", "김포발전소\n납품"),
      leave("2026-10-26", "가나다", "", "", "출장", "김포발전소\n납품"),
      leave("2026-10-28", "가나다", "", "", "출장", "울산"),
      leave("2026-10-26", "가나다", "", "", "연차", ""),
    ]);
    expect(t.map((x) => [x.title, x.from, x.to, x.days.length])).toEqual([
      ["김포발전소", "2026-10-23", "2026-10-26", 2], ["울산", "2026-10-28", "2026-10-28", 1],
    ]);
  });
});
