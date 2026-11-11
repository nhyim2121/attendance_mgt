import { describe, expect, it } from "vitest";
import { genKindOf, parseGrantName, parseReqItems, stageFromFolder, stagePercent, yearsIn } from "@/lib/총무/grants";

describe("지원사업 폴더 이름 읽기", () => {
  it("번호·연도·사업명·주관기관", () => {
    expect(parseGrantName("12.2026년도 기술사업화 패키지 지원사업_중소벤처기업부"))
      .toEqual({ year: "2026", name: "2026년도 기술사업화 패키지 지원사업", agency: "중소벤처기업부", tag: "" });
    expect(parseGrantName("1.2022년 충남 공동 근로복지기금_서산시_진행중"))
      .toEqual({ year: "2022", name: "2022년 충남 공동 근로복지기금", agency: "서산시", tag: "진행중" });
    expect(parseGrantName("18)2022년 ICT융합 스마트공장 보급,확산 지원사업_중소벤처기업부(충남TP)").agency).toBe("중소벤처기업부(충남TP)");
    expect(parseGrantName("원자력컨설팅_진행중")).toEqual({ year: "", name: "원자력컨설팅", agency: "", tag: "진행중" });
  });
});

describe("자료 요청 메일 → 목록", () => {
  const mail = `2. 기초자료

* 보유하고 계신 자료만 회신주시면 됩니다.

- 사업자등록증 사본
- 법인등기부등본 (법인인 경우)
- 조직도 (부서/팀별 인원 포함)
- 최근 3개년(2023~2025) 근로자 총 인원 수 (연말 기준)
- 현재 사업의 한국표준산업분류코드 & 신사업 한국표준산업분류코드

이상입니다.`;
  it("'-' 줄만 자료로", () => {
    expect(parseReqItems(mail)).toEqual([
      "사업자등록증 사본", "법인등기부등본 (법인인 경우)", "조직도 (부서/팀별 인원 포함)",
      "최근 3개년(2023~2025) 근로자 총 인원 수 (연말 기준)", "현재 사업의 한국표준산업분류코드 & 신사업 한국표준산업분류코드",
    ]);
  });
  it("사이트에서 만들 수 있는 자료", () => {
    expect(genKindOf("조직도 (부서/팀별 인원 포함)")).toBe("org");
    expect(genKindOf("최근 3개년(2023~2025) 근로자 총 인원 수 (연말 기준)")).toBe("headcount");
    expect(genKindOf("사업자등록증 사본")).toBeNull();
    expect(yearsIn("최근 3개년(2023~2025)", 2026)).toEqual([2023, 2024, 2025]);
  });
});

describe("단계", () => {
  it("폴더로 단계 짐작, 진행률", () => {
    expect(stageFromFolder("2. 선정·진행")).toBe("run");
    expect(stagePercent("notice")).toBe(0);
    expect(stagePercent("done")).toBe(100);
  });
});
