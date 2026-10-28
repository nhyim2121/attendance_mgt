/** 서버 PC에서 로그인 계정을 만들거나 비밀번호를 바꾼다.
 *
 * 실행 (프로젝트 폴더에서): npm run add-user
 * 비밀번호는 화면에 표시되지 않는다.
 */
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { checkPasswordRule, loginEmail } from "../src/lib/auth-rules";

process.loadEnvFile(".env.local");
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function ask(q: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const w = (rl as unknown as { _writeToOutput: (s: string) => void });
    w._writeToOutput = (s: string) => process.stdout.write(s.startsWith(q) ? q : s.includes("\n") ? "\n" : "");
  }
  return new Promise((res) => rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); res(a); }));
}

const fail = (m: string) => { console.error(m); process.exit(1); };

const id = (await ask("아이디: ")).trim();
if (!id) fail("아이디를 입력해 주세요.");
const { data: old } = await admin.from("profiles").select("id, name, role").eq("login_id", id).maybeSingle();
const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });
const name = (await ask(`이름${old ? ` [${old.name}]` : ""}: `)).trim() || old?.name || id;
const defRole = old?.role ?? (count ? "담당자" : "관리자");
const role = (await ask(`역할 (관리자/담당자) [${defRole}]: `)).trim() || defRole;
if (!["관리자", "담당자"].includes(role)) fail("역할은 관리자 또는 담당자여야 합니다.");
const pw = await ask("비밀번호 (8자 이상, 숫자+문자): ", true);
const rule = checkPasswordRule(pw);
if (rule) fail(rule);
if ((await ask("비밀번호 확인: ", true)) !== pw) fail("비밀번호가 서로 다릅니다.");

if (old) {
  const { error } = await admin.auth.admin.updateUserById(old.id, { password: pw });
  if (error) fail(error.message);
  await admin.from("profiles").update({ name, role }).eq("id", old.id);
} else {
  const { data, error } = await admin.auth.admin.createUser({ email: loginEmail(id), password: pw, email_confirm: true });
  if (error || !data.user) fail(`계정을 만들지 못했습니다: ${error?.message}`);
  const { error: e2 } = await admin.from("profiles").insert({ id: data.user!.id, login_id: id, name, role });
  if (e2) fail(e2.message);
  await admin.from("legacy_users").delete().eq("login_id", id);
}
console.log(`${old ? "수정" : "생성"} 완료: ${id} (${name}, ${role})`);
