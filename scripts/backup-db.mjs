/** 공용 저장소(Supabase Postgres)를 data/db/backup/ 에 백업한다.
 *
 * - 작업 스케줄러 "CAPS 근태 DB 백업"이 10분마다, 감시기(run-server.mjs)가 사이트를 켤 때마다 실행한다.
 * - 바로 전 백업과 내용이 같으면 새로 만들지 않는다 (데이터가 바뀌었을 때만 저장).
 * - 보관: 최근 14일 동안의 백업은 모두, 그 이전은 날짜마다 마지막 1개만 남긴다.
 * - 기록: data/logs/backup.log (저장·실패만 적는다)
 *
 * 복원: README의 '백업에서 복원' 참고
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const KEEP_ALL_DAYS = 14;
const ROOT = join(import.meta.dirname, "..");
const DEST = join(ROOT, "data", "db", "backup");
const LOGS = join(ROOT, "data", "logs");
const project = /project_id\s*=\s*"([^"]+)"/.exec(readFileSync(join(ROOT, "supabase", "config.toml"), "utf8"))[1];
const container = `supabase_db_${project}`;

const now = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
function log(msg) {
  mkdirSync(LOGS, { recursive: true });
  appendFileSync(join(LOGS, "backup.log"), `${now()} ${msg}\n`, "utf8");
}

function dump(args) {
  return execFileSync("docker", ["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "--data-only",
    "--no-owner", "--column-inserts", ...args], { maxBuffer: 1 << 30, windowsHide: true });
}

// pg_dump가 매번 무작위 키로 쓰는 \restrict / \unrestrict 줄은 빼고 비교한다
const sha = (buf) => createHash("sha256")
  .update(buf.toString("utf8").replace(/^\\(un)?restrict \S+$/gm, "")).digest("hex");
const list = () => readdirSync(DEST).filter((f) => /^caps-\d{8}-\d{6}\.sql\.gz$/.test(f)).sort();

/** 최근 14일은 모두, 그 이전은 날짜(caps-YYYYMMDD)마다 마지막 1개만 남긴다. */
function prune() {
  const cutoff = new Date(Date.now() - KEEP_ALL_DAYS * 86400_000)
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 10).replaceAll("-", "");
  const files = list();
  const lastOfDay = new Map(files.map((f) => [f.slice(5, 13), f])); // 정렬돼 있어 마지막 것이 남는다
  for (const f of files) {
    const day = f.slice(5, 13);
    if (day < cutoff && lastOfDay.get(day) !== f) unlinkSync(join(DEST, f));
  }
}

try {
  // 앱 데이터 + 로그인 계정 (구조는 supabase/migrations 에서 다시 만든다)
  const sql = Buffer.concat([
    Buffer.from("-- 근태관리통합시스템 백업\nset session_replication_role = replica;\n"),
    dump(["--schema=public"]),
    dump(["--table=auth.users", "--table=auth.identities"]),
  ]);
  mkdirSync(DEST, { recursive: true });
  const prev = list().at(-1);
  if (prev && sha(gunzipSync(readFileSync(join(DEST, prev)))) === sha(sql)) {
    console.log(`바뀐 내용이 없어 건너뜁니다 (마지막 백업: ${prev})`);
  } else {
    const stamp = now().replace(/[-: ]/g, "").replace(/^(\d{8})/, "$1-");
    const file = `caps-${stamp}.sql.gz`;
    writeFileSync(join(DEST, file), gzipSync(sql));
    log(`백업 저장: ${file}`);
    console.log(`백업 완료: ${join(DEST, file)}`);
  }
  prune();
} catch (exc) {
  log(`백업 실패: ${exc.message.split("\n")[0]}`);
  console.error(`백업 실패: ${exc.message}`);
  process.exitCode = 1;
}
