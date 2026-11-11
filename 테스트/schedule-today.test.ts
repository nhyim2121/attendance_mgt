/** 휴가일정의 보고일 휴가 → 근태현황 '휴가'로 올리고, 휴가일정에서는 그 날짜(와 지난 날짜)만 뺀다 */
import { describe, expect, it } from "vitest";
import { renderReportHtml, type ReportRow, scheduleToday } from "@/lib/인사노무/daily";

const S = (p: Partial<ReportRow>): ReportRow => ({ section: "휴가일정", ord: 1, dept: "연구소", rank: "사원", name: "가나다",
  types: "", title: "연차", detail: "", value: "", note: "", ...p });

describe("휴가일정 → 근태현황 (보고일)", () => {
  it("보고일 연차는 근태현황 휴가로, 휴가일정에는 남은 날짜와 출근 예정만", () => {
    const out = scheduleToday("2026-11-23", [S({ types: "2026-11-23,2026-11-24,2026-11-30", value: "11/25(수), 12/1(화)", note: "개인사유" })]);
    const att = out.find((r) => r.section === "근태")!;
    expect(att.types).toBe("연차");
    expect(att.title).toBe("개인사유");
    const sch = out.find((r) => r.section === "휴가일정")!;
    expect(sch.types).toBe("2026-11-24,2026-11-30");
    expect(sch.value).toBe("11/25(수), 12/1(화)");
  });
  it("하루짜리 묶음이 보고일이면 그 묶음과 출근 예정을 함께 뺀다", () => {
    const out = scheduleToday("2026-11-13", [S({ types: "2026-11-13,2026-11-23", value: "11/16(월), 11/24(화)" })]);
    const sch = out.find((r) => r.section === "휴가일정")!;
    expect(sch.types).toBe("2026-11-23");
    expect(sch.value).toBe("11/24(화)");
  });
  it("외출은 시간을 그대로, 남은 날짜가 없으면 휴가일정 줄이 사라짐", () => {
    const out = scheduleToday("2026-11-16", [S({ title: "외출", detail: "16:30~17:30", types: "2026-11-11,2026-11-13,2026-11-16" })]);
    expect(out.filter((r) => r.section === "휴가일정")).toHaveLength(0);
    expect(out[0]).toMatchObject({ section: "근태", types: "외출", detail: "16:30~17:30" });
  });
  it("이미 근태현황에 같은 휴가가 있으면 다시 올리지 않음", () => {
    const att: ReportRow = { ...S({}), section: "근태", types: "연차" };
    const out = scheduleToday("2026-11-23", [att, S({ types: "2026-11-23", value: "11/24(화)" })]);
    expect(out.filter((r) => r.section === "근태")).toHaveLength(1);
  });
  it("보고서: 휴가 칸에 나오고 요약 숫자도 셈", () => {
    const html = renderReportHtml("2026-11-23", [S({ types: "2026-11-23", value: "11/24(화)" })]);
    expect(html).toContain(">휴가<span");
    expect(html).not.toContain("휴가 일정");
  });
});
