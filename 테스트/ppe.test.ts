import { describe, expect, it } from "vitest";
import { activeOnly, addMonths, buildPeople, byDept, cellOf, dueList, groupOfEmp, itemOf, seasonal, stockOf } from "@/lib/총무/ppe";

const row = (id: number, data: Record<string, string>) => ({ id, day: data.day ?? null, data });
const emps = [
  { name: "가생산", dept: "생산팀", rank: "사원" },
  { name: "이병욱", dept: "영업팀", rank: "부장" },
  { name: "나영업", dept: "영업팀", rank: "이사" },
  { name: "다연구", dept: "연구소", rank: "대리" },
  { name: "라관리", dept: "관리팀", rank: "사원" },
  { name: "마퇴사", dept: "품질팀", rank: "과장", leaveDate: "2026-01-31" },
];

describe("보호구·피복 대상", () => {
  it("현장직 = 생산·품질·영업(이병욱 제외), 연구소 = 연구소, 관리팀은 대상 아님", () => {
    expect(groupOfEmp(emps[0])).toBe("현장직");
    expect(groupOfEmp(emps[1])).toBeNull();
    expect(groupOfEmp(emps[2])).toBe("현장직");
    expect(groupOfEmp(emps[3])).toBe("연구소");
    expect(groupOfEmp(emps[4])).toBeNull();
  });

  it("퇴사자·종료된 일용직은 빠지고, 일용직은 명단 대장에서 온다", () => {
    const profiles = [
      row(1, { name: "가생산", shoe: "270", top: "105" }),
      row(2, { name: "바일용", group: "일용직", dept: "OO인력", start: "2026-11-01" }),
      row(3, { name: "사종료", group: "일용직", start: "2026-09-01", end: "2026-10-31" }),
    ];
    const ps = buildPeople(emps, profiles, "2026-11-11");
    expect(ps.map((p) => p.name)).toEqual(["가생산", "나영업", "다연구", "바일용"]);
    expect(ps[0].sizes.shoe).toBe("270");
    expect(ps[3]).toMatchObject({ group: "일용직", daily: true, dept: "OO인력" });
    expect(buildPeople(emps, profiles, "2026-11-11", true).map((p) => p.name)).toContain("사종료");
  });

  it("재직·퇴사 모두 보기: 퇴사자·종료 일용직에 표시, 부서별로 묶고 퇴사자는 뒤로, 알림은 재직자만", () => {
    const profiles = [row(2, { name: "바일용", group: "일용직", start: "2026-11-01" }), row(3, { name: "사종료", group: "일용직", end: "2026-10-31" })];
    const all = buildPeople(emps, profiles, "2026-11-11", true);
    expect(all.find((p) => p.name === "마퇴사")?.retired).toBe("2026-01-31");
    expect(all.find((p) => p.name === "사종료")?.retired).toBe("2026-10-31");
    expect(activeOnly(all).map((p) => p.name)).toEqual(["가생산", "나영업", "다연구", "바일용"]);
    expect(byDept(all).map((d) => [d.dept, d.people.map((p) => p.name)])).toEqual([
      ["생산팀", ["가생산"]], ["품질팀", ["마퇴사"]], ["영업팀", ["나영업"]], ["연구소", ["다연구"]], ["일용직", ["바일용", "사종료"]],
    ]);
  });
});

describe("교체 시기", () => {
  const [field, , lab] = buildPeople(emps, [], "2026-11-11"); // 가생산 · 나영업 · 다연구
  const shoe = itemOf("안전화")!;

  it("말일 넘김 처리", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2025-11-20", 12)).toBe("2026-11-20");
  });

  it("미지급 → 지남 → 30일 안 → 정상, 반납은 지급으로 안 친다", () => {
    expect(cellOf(field, shoe, [], "2026-11-11").status).toBe("none");
    const late = [row(1, { emp: "가생산", item: "안전화", day: "2025-10-01", kind: "정기 지급" })];
    expect(cellOf(field, shoe, late, "2026-11-11")).toMatchObject({ status: "late", next: "2026-10-01", left: -41 });
    const soon = [row(1, { emp: "가생산", item: "안전화", day: "2025-12-01" })];
    expect(cellOf(field, shoe, soon, "2026-11-11").status).toBe("soon");
    const back = [...soon, row(2, { emp: "가생산", item: "안전화", day: "2026-11-01", kind: "반납" })];
    expect(cellOf(field, shoe, back, "2026-11-11").status).toBe("soon");
    // 연구소는 안전화 2년 주기
    expect(cellOf(lab, shoe, [row(3, { emp: "다연구", item: "안전화", day: "2025-10-01" })], "2026-11-11").status).toBe("ok");
  });

  it("방한복은 현장직만, 할 일은 지남 → 미지급 → 곧 순", () => {
    expect(cellOf(lab, itemOf("방한복")!, [], "2026-11-11").status).toBe("na");
    const due = dueList([field], [row(1, { emp: "가생산", item: "안전화", day: "2025-10-01" })], "2026-11-11");
    expect(due[0]).toMatchObject({ item: { name: "안전화" }, cell: { status: "late" } });
    expect(due.slice(1).every((d) => d.cell.status === "none")).toBe(true);
  });

  it("정기 지급 달 알림 (10월: 동계 작업복 이번 달, 방한복 다음 달)", () => {
    expect(seasonal("2026-10-05").map((s) => [s.item.name, s.now])).toEqual([["작업복(동계)", true], ["방한복", false]]);
  });
});

describe("재고", () => {
  it("입고 − 지급, 반납은 재고로 돌리지 않음, 수량 없으면 1개", () => {
    const stock = [row(1, { item: "안전화", size: "270", qty: "10" })];
    const issues = [
      row(2, { item: "안전화", size: "270", qty: "2" }),
      row(3, { item: "안전화", size: "270" }),
      row(4, { item: "안전화", size: "270", kind: "반납", qty: "1" }),
      row(5, { item: "안전모", size: "" }),
    ];
    expect(stockOf(stock, issues)).toEqual([
      { item: "안전화", size: "270", inQty: 10, outQty: 3, left: 7 },
      { item: "안전모", size: "", inQty: 0, outQty: 1, left: -1 },
    ]);
  });
});
