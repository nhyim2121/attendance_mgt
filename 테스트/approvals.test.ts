/** 하이웍스 '근무계획 수립이력' 읽기 테스트 (가짜 이름). */
import { describe, expect, it } from "vitest";
import { approvalsToLeaves, parseApprovalFile, parseTitle } from "@/lib/인사노무/approvals";
import { outingHours } from "@/lib/인사노무/vacation";

const table = (rows: string[][]) => "<h3>근무계획수립이력_2026년_10월</h3><table>"
  + [["기안일", "제목", "기안자", "결재완료일", "결재상태"], ...rows]
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") + "</table>";
const weekday = (d: string) => { const w = new Date(d).getDay(); return w !== 0 && w !== 6; };

describe("하이웍스 결재 제목", () => {
  it("휴가·연장·휴일근무", () => {
    expect(parseTitle("휴가 신청(가나다) - 2026년 11월 2일(1일)/연차")).toMatchObject({ kind: "휴가", type: "연차", dayFrom: "2026-11-02", dayTo: "2026-11-02", amount: "1일" });
    expect(parseTitle("휴가 신청(가나다) - 2026년 10월 27일~2026년 10월 29일(3일)/연차")).toMatchObject({ dayFrom: "2026-10-27", dayTo: "2026-10-29" });
    expect(parseTitle("휴가 신청(가나다) - 2026년 10월 30일(1시간 30분)/외출")).toMatchObject({ type: "외출", amount: "1시간 30분" });
    expect(parseTitle("휴가 신청(가나다) - 2026년 10월 30일(1일)/경조사")).toMatchObject({ type: "경조휴가" });
    expect(parseTitle("휴가 취소(가나다) - 2026년 10월 6일(4시간)/반차")).toMatchObject({ kind: "휴가취소", type: "반차" });
    expect(parseTitle("연장 근무 신청(가나다) - 2026년 10월 29일(17:30 ~ 23:00)")).toMatchObject({ kind: "연장근무", timeFrom: "17:30", timeTo: "23:00" });
    expect(parseTitle("연장근무 신청 (가나다) - 2026년 10월 30일(17:30~18:30)")).toMatchObject({ kind: "연장근무", timeTo: "18:30" });
    expect(parseTitle("휴(무)일근무신청(가나다) - 2026년 10월 31일")).toMatchObject({ kind: "휴일근무", dayFrom: "2026-10-31" });
  });

  it("결재완료만, 취소는 지우기, 시간 연차는 반차·반반차·외출로", () => {
    const list = parseApprovalFile(table([
      ["2026-10-01 09:00:00", "휴가 신청(가나다) - 2026년 10월 5일(1일)/연차", "가나다", "2026-10-01 10:00:00", "결재완료"],
      ["2026-10-01 09:00:01", "휴가 신청(가나다) - 2026년 10월 6일(4시간)/반차", "가나다", "", "반려"],
      ["2026-10-01 09:00:02", "휴가 신청(라마바) - 2026년 10월 7일(1일)/연차", "라마바", "", "관리자 기안 취소"],
      ["2026-10-01 09:00:03", "휴가 신청(가나다) - 2026년 10월 8일(3시간 30분)/연차", "가나다", "2026-10-01 10:00:00", "결재완료"],
      ["2026-10-01 09:00:04", "휴가 신청(가나다) - 2026년 10월 9일~2026년 10월 12일(2일)/연차", "가나다", "x", "결재완료"],
      ["2026-10-01 09:00:05", "휴가 취소(가나다) - 2026년 10월 5일(1일)/연차", "가나다", "x", "결재완료"],
      ["2026-10-01 09:00:06", "휴(무)일 근무 신청(라마바) - 2026년 10월 10일", "라마바", "x", "결재완료"],
    ]));
    expect(list).toHaveLength(7);
    const { leaves, cancels } = approvalsToLeaves(list, weekday);
    expect(cancels.has("2026-10-05|가나다|연차")).toBe(true);
    expect(leaves.some((l) => l.day === "2026-10-06" || l.day === "2026-10-07")).toBe(false); // 반려·관리자 취소
    expect(leaves.find((l) => l.day === "2026-10-08")).toMatchObject({ type: "외출" });
    expect(outingHours(leaves.find((l) => l.day === "2026-10-08")!.content)).toBe(3.5);
    // 10/9(금)~10/12(월): 주말은 빼고 근무일만
    expect(leaves.filter((l) => l.type === "연차").map((l) => l.day)).toEqual(["2026-10-05", "2026-10-09", "2026-10-12"]);
    expect(leaves.find((l) => l.type === "휴일근무")).toMatchObject({ day: "2026-10-10", name: "라마바" });
  });

  it("다른 파일은 거부", () => {
    expect(() => parseApprovalFile("<table><tr><td>이름</td></tr></table>")).toThrow(/근무계획 수립이력/);
  });
});
