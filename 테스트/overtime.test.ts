/** 휴일·연장 근무 탭의 연장근무 줄 → 근태(연장근무) + 퇴근 근무형태 '연장(HH:MM)' */
import { describe, expect, it } from "vitest";
import { isOtRow, otUntil, renderReportHtml, reportToLeaves, type ReportRow } from "@/lib/인사노무/daily";

const row = (p: Partial<ReportRow>): ReportRow => ({
  section: "휴일근무", ord: 1, dept: "생산팀", rank: "차장", name: "가나다", types: "2026-11-10", title: "1공장 / 모터조립",
  detail: "", value: "", note: "", day: "2026-11-10", ...p,
});

describe("연장근무 (휴일·연장 근무 탭)", () => {
  it("value '연장|~20:00'이면 연장근무, 신청 시각을 내용 끝에", () => {
    const r = row({ value: "연장|~20:00" });
    expect(isOtRow(r)).toBe(true);
    expect(otUntil(r)).toBe("20:00");
    const [l] = reportToLeaves([r]);
    expect(l.type).toBe("연장근무");
    expect(l.day).toBe("2026-11-10");
    expect(l.content).toContain("~20:00");
  });
  it("value가 비어 있으면 휴일근무", () => {
    const [l] = reportToLeaves([row({ types: "2026-11-08" })]);
    expect(l.type).toBe("휴일근무");
  });
  it("보고서 표에 구분 배지", () => {
    const html = renderReportHtml("2026-11-10", [row({ value: "연장|~20:00" }), row({ name: "라마바", types: "2026-11-08" })]);
    expect(html).toContain("휴일·연장 근무");
    expect(html).toContain(">연장근무</span>");
    expect(html).toContain(">휴일근무</span>");
    expect(html).not.toContain("~20:00");
  });
});
