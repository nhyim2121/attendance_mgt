/** 하이웍스 '휴가현황(종류별)' 읽기와 연차 현황 반영 테스트 (가짜 이름). */
import { describe, expect, it } from "vitest";
import type { Sheets } from "@/lib/excel";
import { applyHwStatus, exportTime, hwDeducted, parseLeaveStatus } from "@/lib/leaveStatus";
import { DEFAULT_POLICY, type LeaveBalance } from "@/lib/vacation";

const N = null;
const head = [
  ["이름", "아이디", "사번", "입사일", "계정 상태", "올해\n생성", "생성내역", N, N, "사용현황", N, N, N, N, N, N, N, N, "잔여"],
  [N, N, N, N, N, N, "정기", "포상", "기타", "연차", "포상", "월차", "경조사", "반반차", "공가", "외출", "반차", "병가", N],
];
const year: Sheets[number] = ["20261105114941_휴가현황(종류별)", [
  ["휴가현황(종류별)_2026_전직원"], [],
  ...head,
  ["가나다", "abc", 20240701, "2024-07-01", "정상", 15, 15, 0, 0, 4, 0, 0, 0, 0.75, 0, 0.6875, 2.5, 0, 7.0625],
  ["라마바", "def", 20260101, "2026-01-02", "정상", 11, 11, 0, 0, 0, 0, 4, 2, 0.5, 0, 0.5, 0, 0, 6],
]];
const month: Sheets[number] = ["2026-11", [
  ["월별 현황(2026-11)_전직원"], [],
  ["이름", "아이디", "사번", "입사일", "계정 상태", "사용현황", N, N, N, N, N, N, N, N],
  [N, N, N, N, N, "연차", "포상", "월차", "경조사", "반반차", "공가", "외출", "반차", "병가"],
  ["가나다", "abc", 20240701, "2024-07-01", "정상", 1, 0, 0, 0, 0, 0, 0.125, 0, 0],
]];

describe("하이웍스 휴가현황(종류별)", () => {
  it("연도·생성·사용·잔여·월별을 읽는다", () => {
    const { fy, rows } = parseLeaveStatus([year, month], "20261105114941_휴가현황(종류별).xls", "2026-11-06 09:00");
    expect(fy).toBe(2026);
    expect(rows).toHaveLength(2);
    const a = rows[0];
    expect(a).toMatchObject({ name: "가나다", joinDate: "2024-07-01", granted: 15, remain: 7.0625, exportedAt: "2026-11-05 11:49" });
    expect(a.used).toEqual({ 연차: 4, 반반차: 0.75, 외출: 0.6875, 반차: 2.5 });
    expect(a.months["2026-11"]).toEqual({ 연차: 1, 외출: 0.125 });
    expect(hwDeducted(a)).toBe(7.9375); // 15 - 7.9375 = 7.0625
    expect(rows[1].used).toMatchObject({ 월차: 4, 경조휴가: 2 }); // 경조사 -> 경조휴가
    expect(hwDeducted(rows[1])).toBe(5); // 경조휴가는 빼지 않음 -> 11 - 5 = 6
  });

  it("다른 파일이면 오류", () => {
    expect(() => parseLeaveStatus([["x", [["근무계획수립이력"]]]], "a.xls", "")).toThrow(/휴가현황/);
    expect(exportTime("a.xls")).toBeNull();
  });

  it("연차 현황을 하이웍스 숫자로 바꾸고 사이트 계산을 남긴다", () => {
    const { rows } = parseLeaveStatus([year], "20261105114941_휴가현황(종류별).xls", "");
    const b = { name: "가나다", total: 15, used: 3, planned: 1, remain: 11, counts: { 연차: 3 }, typeDays: {} } as unknown as LeaveBalance;
    const other = { name: "없는사람", total: 15, used: 0, planned: 0, remain: 15 } as unknown as LeaveBalance;
    const [x, y] = applyHwStatus([b, other], rows, DEFAULT_POLICY);
    expect(x).toMatchObject({ total: 15, used: 7.9375, planned: 0, remain: 7.0625, annual: 15, outingHours: 5.5 });
    expect(x.site).toEqual({ total: 15, used: 3, planned: 1, remain: 11 });
    expect(x.counts).toMatchObject({ 연차: 3, 반차: 1 });
    expect(y).toBe(other);
  });
});
