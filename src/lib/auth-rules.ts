/** 로그인 아이디·비밀번호 규칙 (사이트와 서버 PC 스크립트 공용). */
import { pbkdf2Sync, timingSafeEqual } from "node:crypto";

/** 아이디 -> Supabase 로그인용 이메일 (영문 소문자·숫자 아이디는 그대로, 그 밖은 16진수로) */
export function loginEmail(loginId: string): string {
  const id = loginId.trim();
  if (/^[a-z0-9._-]+$/.test(id)) return `${id}@caps.local`;
  return `u${Buffer.from(id, "utf8").toString("hex")}@caps.local`;
}

export function checkPasswordRule(pw: string): string | null {
  if (pw.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (/^\d+$/.test(pw) || /^\p{L}+$/u.test(pw)) return "비밀번호에 숫자와 문자를 섞어 주세요.";
  return null;
}

/** 이전 사이트의 PBKDF2-SHA256 해시 확인 ('pbkdf2_sha256$반복$salt$digest') */
export function verifyLegacyPassword(password: string, stored: string): boolean {
  try {
    const [, iters, salt, digest] = stored.split("$");
    const dk = pbkdf2Sync(password, Buffer.from(salt, "hex"), Number(iters), 32, "sha256");
    const want = Buffer.from(digest, "hex");
    return want.length === dk.length && timingSafeEqual(dk, want);
  } catch {
    return false;
  }
}
