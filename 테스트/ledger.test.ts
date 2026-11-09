import { describe, expect, it } from "vitest";
import { BOOKS, bookOf } from "../src/lib/대장/books";
import { alertsOf, cleanData, filterRows, isClosed, parseGrid } from "../src/lib/대장/logic";

describe("업무 대장", () => {
  it("설정: 대장 이름·칸 이름이 겹치지 않고 기준 날짜·이름 칸이 있다", () => {
    expect(new Set(BOOKS.map((b) => b.key)).size).toBe(BOOKS.length);
    for (const b of BOOKS) {
      const ks = b.fields.map((f) => f.k);
      expect(new Set(ks).size, b.key).toBe(ks.length);
      expect(ks, b.key).toContain(b.day);
      expect(ks, b.key).toContain(b.title1);
      for (const k of b.filters ?? []) expect(ks, b.key).toContain(k);
      if (b.closed) expect(ks).toContain(b.closed.k);
    }
  });
  it("입력 정리: 날짜·금액·필수 칸, 주행거리 계산", () => {
    const b = bookOf("drivelog")!;
    expect(cleanData(b, { day: "", plate: "12가3456" }).error).toMatch(/운행일/);
    const c = cleanData(b, { day: "2026.11.9", plate: "12가3456", kmFrom: "10,000", kmTo: "10,120", fuel: "50,000원" });
    expect(c.error).toBeUndefined();
    expect(c.day).toBe("2026-11-09");
    expect(c.data).toMatchObject({ kmFrom: "10000", kmTo: "10120", km: "120", fuel: "50000" });
  });
  it("기한 알림: 끝난 줄은 빼고, 지남·임박 단계", () => {
    const b = bookOf("vehicles")!;
    const today = "2026-11-09";
    const a = alertsOf(b, { plate: "1", insEnd: "2026-11-12", inspEnd: "2027-03-01" }, today);
    expect(a).toEqual([{ field: "insEnd", label: "보험 만기", day: "2026-11-12", left: 3, level: "soon" }]);
    expect(alertsOf(b, { plate: "1", insEnd: "2026-11-01" }, today)[0].level).toBe("late");
    expect(alertsOf(b, { plate: "1", insEnd: "2026-11-01", status: "매각·반납" }, today)).toEqual([]);
    expect(isClosed(b, { status: "매각·반납" })).toBe(true);
  });
  it("예전 엑셀: 머리글 이름·다른 이름으로 칸 맞추기", () => {
    const b = bookOf("fixtures")!;
    const p = parseGrid(b, [["비품관리대장"], ["No", "품 명", "구매일", "수량", "설치장소", "금액"], [1, "노트북", "2025-03-02", 2, "2층", "1,500,000"]]);
    expect(p.rows).toEqual([{ name: "노트북", bought: "2025-03-02", qty: "2", place: "2층", price: "1,500,000" }]);
    expect(cleanData(b, p.rows[0]).data.price).toBe("1500000");
  });
  it("거르기: 연도·끝난 줄·찾기", () => {
    const b = bookOf("fixtures")!;
    const rows = [
      { id: 1, book: "fixtures", day: "2025-01-01", data: { name: "노트북", status: "사용 중" }, batch: "" },
      { id: 2, book: "fixtures", day: "2026-01-01", data: { name: "의자", status: "폐기" }, batch: "" },
    ];
    expect(filterRows(b, rows, {}).map((r) => r.id)).toEqual([1]);
    expect(filterRows(b, rows, { closed: "1", y: "2026" }).map((r) => r.id)).toEqual([2]);
    expect(filterRows(b, rows, { q: "노트" }).map((r) => r.id)).toEqual([1]);
  });
});
