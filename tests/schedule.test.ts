/** 휴가일정 (사람별 한 줄) 테스트 (가짜 이름). */
import { describe, expect, it } from "vitest";
import { type ReportRow, returnDays, scheduleText, tidySchedule } from "@/lib/daily";

const row = (r: Partial<ReportRow>): ReportRow => ({
  section: "휴가일정", ord: 0, dept: "", rank: "", name: "가나다", types: "", title: "", detail: "", value: "", note: "", ...r,
});
const weekday = (d: string) => { const w = new Date(d).getDay(); return w !== 0 && w !== 6; };

describe("휴가일정", () => {
  it("예전 줄을 사람·종류·시간별 한 줄로", () => {
    const out = tidySchedule([
      row({ value: "11/9(월)", note: "11/6(금) 외출 16:30~17:30" }),
      row({ value: "11/10(화)", note: "11/9(월) 외출 16:30~17:30" }),
      row({ value: "11/12(목)", note: "11/11(수) 외출 16:30~17:30" }),
      row({ name: "라마바", note: "11/20(금) 연차" }),
      row({ name: "사아자", note: "자유롭게 적은 글" }),
    ], "2026-11-05");
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ title: "외출", types: "2026-11-06,2026-11-09,2026-11-11", detail: "16:30~17:30" });
    expect(out[1]).toMatchObject({ name: "라마바", title: "연차", types: "2026-11-20" });
    expect(out[2]).toMatchObject({ note: "자유롭게 적은 글", types: "" }); // 못 읽는 줄은 그대로
    expect(scheduleText(out[0])).toBe("11/6(금)·11/9(월)·11/11(수) 외출 16:30~17:30");
  });

  it("출근 예정: 이어지는 휴가 묶음마다 다음 근무일", () => {
    expect(returnDays(["2026-11-06"], weekday)).toEqual(["2026-11-09"]); // 금 -> 월
    expect(returnDays(["2026-11-09", "2026-11-10", "2026-11-13"], weekday)).toEqual(["2026-11-11", "2026-11-16"]);
    expect(returnDays(["2026-11-06", "2026-11-09"], weekday)).toEqual(["2026-11-10"]); // 금·월은 주말을 사이에 두고 이어짐
  });

  it("연말 보고서의 1월 일정은 다음 해", () => {
    expect(tidySchedule([row({ note: "1/2(금) 연차" })], "2026-12-30")[0].types).toBe("2027-01-02");
  });
});

import { addWorkHours, leaveUnit, timeLabel } from "@/lib/daily";
describe("휴가 시간", () => {
  it("단위와 끝 시각 (점심 12:00~13:00 제외)", () => {
    expect(leaveUnit("연차")).toBe("day");
    expect(leaveUnit("반차")).toBe(4);
    expect(leaveUnit("반반차")).toBe(2);
    expect(leaveUnit("반차,외출")).toBe("free");
    expect(addWorkHours("08:30", 4)).toBe("13:30"); // 08:30~12:00 3.5h + 13:00~13:30
    expect(addWorkHours("13:30", 4)).toBe("17:30");
    expect(addWorkHours("10:00", 2)).toBe("12:00");
    expect(addWorkHours("11:00", 2)).toBe("14:00");
    expect(timeLabel("16:30~17:30")).toBe("16:30~17:30 (1시간)");
    expect(timeLabel("11:30~13:30")).toBe("11:30~13:30 (1시간)");
    expect(timeLabel("~17:30")).toBe("");
  });
});
