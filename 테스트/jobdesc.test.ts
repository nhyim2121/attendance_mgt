import { describe, expect, it } from "vitest";
import { BASICS, cleanJob, JD_EXAMPLES, shareSum } from "@/lib/인사노무/jobdesc";

describe("직무기술서 예시", () => {
  it("업무 비중 합계 100, 직업기초능력은 NCS 10개 안에서", () => {
    for (const j of JD_EXAMPLES) {
      expect(shareSum(j), j.name).toBe(100);
      expect(j.basics.every((b) => BASICS.includes(b)), j.name).toBe(true);
    }
    expect(new Set(JD_EXAMPLES.map((j) => j.id)).size).toBe(JD_EXAMPLES.length);
  });
  it("저장 전 정리: 빈 업무 빼고 예시 표시 지움", () => {
    const c = cleanJob({ ...JD_EXAMPLES[0], tasks: [...JD_EXAMPLES[0].tasks, { name: "", detail: "", share: 0, cycle: "" }] });
    expect(c.tasks.length).toBe(JD_EXAMPLES[0].tasks.length);
    expect(c.example).toBeUndefined();
  });
});
