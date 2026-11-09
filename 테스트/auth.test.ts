/** 로그인 규칙과 이전 사이트 비밀번호 확인 테스트. */
import { describe, expect, it } from "vitest";
import { checkPasswordRule, loginEmail, verifyLegacyPassword } from "@/lib/auth-rules";
import { loadMailConfig, parseAddresses } from "@/lib/mailer";

// 이전 사이트(Python core.auth.hash_password)로 만든 'abcd1234'의 해시
const LEGACY = "pbkdf2_sha256$200000$ca8d1338ec259215818c25019e59a797$31a6cd78767b6c86c9766f1514093ec8c9436788d889012bedf992b5553a0948";

describe("로그인", () => {
  it("이전 사이트 해시를 확인한다", () => {
    expect(verifyLegacyPassword("abcd1234", LEGACY)).toBe(true);
    expect(verifyLegacyPassword("abcd12345", LEGACY)).toBe(false);
    expect(verifyLegacyPassword("abcd1234", "망가진값")).toBe(false);
  });

  it("비밀번호 규칙", () => {
    expect(checkPasswordRule("short1")).not.toBeNull();
    expect(checkPasswordRule("12345678")).not.toBeNull();
    expect(checkPasswordRule("abcdefgh")).not.toBeNull();
    expect(checkPasswordRule("abcd1234")).toBeNull();
  });

  it("아이디 -> 로그인 이메일", () => {
    expect(loginEmail("snco")).toBe("snco@caps.local");
    expect(loginEmail("관리자")).toMatch(/^u[0-9a-f]+@caps\.local$/);
    expect(loginEmail("Admin")).not.toBe(loginEmail("admin")); // 대소문자 구분
  });
});

describe("메일", () => {
  it("주소 나누기와 설정", () => {
    expect(parseAddresses("a@x.co.kr, b@y.com; 잘못된주소\nA@x.co.kr")).toEqual(
      [["a@x.co.kr", "b@y.com", "A@x.co.kr"], ["잘못된주소"]]);
    expect(loadMailConfig({})).toBeNull();
    const cfg = loadMailConfig({ HIWORKS_SMTP_USER: "me@x.co.kr", HIWORKS_SMTP_PASSWORD: "pw" });
    expect([cfg?.host, cfg?.port, cfg?.senderName]).toEqual(["smtps.hiworks.com", 465, "관리팀"]);
  });
});
