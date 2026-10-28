/** 공용 저장소(Supabase Postgres)를 data/db/backup/ 에 날짜별로 백업한다. 최근 30개만 남긴다.
 * 감시기(run-server.mjs)가 사이트를 켤 때마다 실행한다.
 *
 * 복원: README의 '백업에서 복원' 참고
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KEEP = 30;
const ROOT = join(import.meta.dirname, "..");
const DEST = join(ROOT, "data", "db", "backup");
const project = /project_id\s*=\s*"([^"]+)"/.exec(readFileSync(join(ROOT, "supabase", "config.toml"), "utf8"))[1];
const container = `supabase_db_${project}`;

function dump(args) {
  return execFileSync("docker", ["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "--data-only",
    "--no-owner", "--column-inserts", ...args], { maxBuffer: 1 << 30 });
}

try {
  // 앱 데이터 + 로그인 계정 (구조는 supabase/migrations 에서 다시 만든다)
  const sql = Buffer.concat([
    Buffer.from("-- 근태관리통합시스템 백업\nset session_replication_role = replica;\n"),
    dump(["--schema=public"]),
    dump(["--table=auth.users", "--table=auth.identities"]),
  ]);
  mkdirSync(DEST, { recursive: true });
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/[-: ]/g, "").replace(/^(\d{8})/, "$1-");
  const file = join(DEST, `caps-${stamp}.sql.gz`);
  writeFileSync(file, gzipSync(sql));
  const old = readdirSync(DEST).filter((f) => /^caps-.*\.sql\.gz$/.test(f)).sort();
  old.slice(0, Math.max(0, old.length - KEEP)).forEach((f) => unlinkSync(join(DEST, f)));
  console.log(`백업 완료: ${file} (보관 ${Math.min(KEEP, old.length)}개)`);
} catch (exc) {
  console.error(`백업 실패: ${exc.message}`);
  process.exitCode = 1;
}
