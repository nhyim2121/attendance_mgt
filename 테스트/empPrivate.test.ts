/** 주민등록번호 정리·생년월일 계산 테스트 (번호는 가짜). */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
const { birthFromRrn, cleanRrn, maskRrn } = await import("@/lib/인사노무/private");

describe("주민등록번호", () => {
  it("숫자 13자리만 받고 하이픈을 넣는다", () => {
    expect(cleanRrn("9001011234567")).toBe("900101-1234567");
    expect(cleanRrn(" 900101 - 1234567 ")).toBe("900101-1234567");
    expect(cleanRrn("900101-123456")).toBeNull();
    expect(cleanRrn("901301-1234567")).toBeNull(); // 13월
  });
  it("뒷자리 첫 숫자로 1900·2000년대를 가른다", () => {
    expect(birthFromRrn("900101-1234567")).toBe("1990-01-01");
    expect(birthFromRrn("050315-4234567")).toBe("2005-03-15");
    expect(birthFromRrn("900231-1234567")).toBeNull(); // 2월 31일
  });
  it("화면에는 뒷자리 첫 숫자까지만", () => {
    expect(maskRrn("900101-1234567")).toBe("900101-1******");
  });
});
