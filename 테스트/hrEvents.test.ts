/** 직원 관리 인사 일정·근속 계산 테스트 (이름은 가짜). */
import { describe, expect, it } from "vitest";
import type { Employee } from "@/lib/인사노무/employees";
import { addMonths, hrEvents, tenure, tenureText } from "@/lib/인사노무/hrEvents";

const emp = (name: string, joinDate: string | null, leaveDate: string | null = null): Employee => ({
  name, capsName: "", empId: "", dept: "생산팀", rank: "", position: "", phone: "", ext: "", email: "", joinDate, leaveDate, note: "", ord: 0,
});

describe("인사 일정", () => {
  it("개월 더하기는 말일을 넘지 않는다", () => {
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2026-10-15", 12)).toBe("2027-10-15");
  });
  it("근속은 입사일 하루 전까지 채워야 한 달", () => {
    expect(tenureText(tenure(emp("가", "2019-03-04"), "2026-11-09"))).toBe("7년 8개월");
    expect(tenureText(tenure(emp("나", "2026-10-10"), "2026-11-09"))).toBe("0개월");
    expect(tenureText(tenure(emp("다", "2020-01-01", "2023-06-30"), "2026-11-09"))).toBe("3년 5개월");
    expect(tenure(emp("라", null), "2026-11-09")).toBeNull();
  });
  it("수습 종료·1년 근속·근속 기념·퇴사 예정을 가까운 순으로", () => {
    const list = hrEvents([
      emp("수습", "2026-08-20"), emp("일년", "2025-11-20"), emp("오년", "2021-12-01"), emp("퇴사", "2020-01-01", "2026-11-30"),
      emp("지난퇴사", "2020-01-01", "2026-10-01"), emp("먼일", "2026-03-01"),
    ], "2026-11-09");
    expect(list.map((x) => [x.name, x.kind, x.day])).toEqual([
      ["수습", "수습 종료", "2026-11-20"], ["일년", "1년 근속", "2025-11-20".replace("2025", "2026")], ["퇴사", "퇴사 예정", "2026-11-30"], ["오년", "근속 기념", "2026-12-01"],
    ]);
  });
});
