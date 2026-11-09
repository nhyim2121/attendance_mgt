import { describe, expect, it } from "vitest";
import { excelDate } from "../src/lib/excel";
import { parseLedger, toDay, toKind } from "../src/lib/총무/mailImport";

describe("예전 문서 수발 대장 가져오기", () => {
  it("날짜 여러 모양", () => {
    expect(toDay("2026.11.9")).toBe("2026-11-09");
    expect(toDay("26-1-05")).toBe("2026-01-05");
    expect(toDay("2026년 3월 2일")).toBe("2026-03-02");
    expect(toDay(excelDate(2025, 12, 31))).toBe("2025-12-31");
    expect(toDay(46000)).toBe("2025-12-09");
    expect(toDay("11/09")).toBeNull();
  });
  it("종류", () => {
    expect(toKind("등기우편")).toBe("등기");
    expect(toKind("FAX")).toBe("팩스");
    expect(toKind("")).toBe("공문");
  });
  it("머리글로 칸을 찾고 수신/발신을 가른다", () => {
    const r = parseLedger([
      ["문서 수발 대장"],
      ["순번", "접수일자", "구분", "발신처", "수신처", "제목", "문서번호", "처리내용", "비고"],
      [1, "2026.11.02", "수신", "한국남동발전", "에쓰엔", "안전점검 협조", "남동-123", "대표 보고", ""],
      [2, "2026.11.03", "발신", "에쓰엔", "부천지청", "회신", "", "", "등기 3,530원"],
      [3, "", "", "", "", "날짜 없음", "", "", ""],
    ], "수신");
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.rows[0]).toMatchObject({ dir: "수신", day: "2026-11-02", party: "한국남동발전", title: "안전점검 협조", refNo: "남동-123", route: "대표 보고" });
    expect(r.rows[1]).toMatchObject({ dir: "발신", party: "부천지청", note: "등기 3,530원" });
  });
});
