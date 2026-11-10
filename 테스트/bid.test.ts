/** 입찰관리: 알림 조건 거르기·다음 마감·정리본·투찰금액 계산 (공고 이름은 가짜). */
import { describe, expect, it } from "vitest";
import { type Bid, calcBid, DEFAULT_WATCH, dLabel, emptyBid, fitScore, matchWatch, nextDeadline, summaryOf } from "@/lib/총무/bid";

const bid = (p: Partial<Bid>): Bid => ({ ...emptyBid(), id: 1, ...p, dates: { ...(p.dates ?? {}) } });

describe("알림 조건", () => {
  it("키워드가 들어가면 걸리고, 빼는 말·금액·구분으로 거른다", () => {
    const b = { name: "○○정수장 유도전동기 구매", kind: "물품", price: 50_000_000, region: "", org: "가짜시", demand: "가짜정수장" };
    expect(matchWatch(DEFAULT_WATCH, b)).toEqual(["전동기", "유도전동기"]);
    expect(matchWatch(DEFAULT_WATCH, { ...b, name: "전동기 임대" })).toBeNull();
    expect(matchWatch({ ...DEFAULT_WATCH, maxPrice: 10_000_000 }, b)).toBeNull();
    expect(matchWatch({ ...DEFAULT_WATCH, kinds: ["공사"] }, b)).toBeNull();
    expect(matchWatch(DEFAULT_WATCH, { ...b, name: "사무용 의자 구매" })).toBeNull();
  });
  it("지역·기관 조건은 적었을 때만 본다", () => {
    const b = { name: "발전기 정비 용역", kind: "용역", price: null, region: "경기도", org: "가짜공사", demand: "" };
    expect(matchWatch({ ...DEFAULT_WATCH, regions: ["충청남도"] }, b)).toBeNull();
    expect(matchWatch({ ...DEFAULT_WATCH, orgs: ["가짜공사"] }, b)).toEqual(["발전기"]);
  });
});

describe("마감·정리본", () => {
  const today = "2026-11-10";
  const b = bid({ name: "소수력 발전기 제작", kind: "물품", demand: "가짜수자원", price: 120_000_000, matched: ["발전기", "소수력"],
    dates: { posted: "2026-11-03", question: "2026-11-09", bidClose: "2026-11-14 10:00", opening: "2026-11-14 11:00", docDue: "2026-11-20" } });
  it("지난 마감은 건너뛰고 가장 가까운 마감을 고른다", () => {
    expect(nextDeadline(b, today)).toMatchObject({ key: "bidClose", left: 4 });
    expect(dLabel(0)).toBe("오늘");
    expect(dLabel(-2)).toBe("2일 지남");
  });
  it("정리본 한 줄과 적합도", () => {
    const s = summaryOf(b, today);
    expect(s.line).toBe("[물품] 가짜수자원 · 추정 1.20억 원 · 투찰 마감 D-4");
    expect(s.points.some((p) => p.startsWith("걸린 키워드: 발전기, 소수력"))).toBe(true);
    expect(fitScore(b, today)).toBe(5);
  });
});

it("투찰금액 = 기초금액 × 사정률 × 낙찰하한율 (원 단위 올림)", () => {
  expect(calcBid(100_000_000, 100, 87.745)).toBe(87_745_000);
  expect(calcBid(123_456_789, 99.5, 87.745)).toBe(Math.ceil(123_456_789 * 0.995 * 0.87745));
});
