/** 사이트 감시 실행기 (작업 스케줄러가 창 없이 실행).
 *
 * - 이미 8501 포트에서 사이트가 돌고 있으면 아무것도 하지 않고 끝낸다 (중복 실행 방지).
 * - Supabase(Docker)를 켜고, 저장소를 백업한 뒤 사이트를 켠다. 사이트가 멈추면 몇 초 뒤 다시 켠다.
 * - 서버 출력: data/logs/server-YYYYMMDD.log, 재시작 기록: data/logs/watchdog.log
 * 실행: node scripts/run-server.mjs   (먼저 npm run build)
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = join(import.meta.dirname, "..");
const LOGS = join(ROOT, "data", "logs");
const PORT = 8501;
mkdirSync(LOGS, { recursive: true });

const stamp = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
const log = (msg) => appendFileSync(join(LOGS, "watchdog.log"), `${stamp()} ${msg}\n`, "utf8");

function portInUse() {
  return new Promise((res) => {
    const s = createConnection({ host: "127.0.0.1", port: PORT });
    s.setTimeout(1000);
    s.once("connect", () => { s.destroy(); res(true); });
    s.once("error", () => res(false));
    s.once("timeout", () => { s.destroy(); res(false); });
  });
}

const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, windowsHide: true, shell: true, encoding: "utf8" });

async function main() {
  if (await portInUse()) {
    log(`${PORT} 포트에서 이미 사이트가 실행 중이라 감시기를 끝냅니다.`);
    return;
  }
  // Docker Desktop이 막 켜지는 중일 수 있어 최대 5분 기다린다
  for (let i = 0; ; i++) {
    const r = run("npx", ["supabase", "start"]);
    if (r.status === 0) break;
    if (i >= 30) throw new Error(`Supabase를 켜지 못했습니다: ${(r.stderr || r.stdout).slice(-300)}`);
    if (i === 0) log("Supabase(Docker)를 기다리는 중...");
    await sleep(10_000);
  }
  run("node", ["scripts/backup-db.mjs"]);
  if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) {
    log("빌드가 없어 npm run build를 실행합니다.");
    run("npm", ["run", "build"]);
  }

  let quickFails = 0;
  for (;;) {
    const started = Date.now();
    const day = stamp().slice(0, 10).replaceAll("-", "");
    const out = openSync(join(LOGS, `server-${day}.log`), "a");
    const proc = spawn("npm", ["run", "start"], {
      cwd: ROOT, windowsHide: true, shell: true, stdio: ["ignore", out, out],
      env: { ...process.env, NODE_ENV: "production" },
    });
    log(`사이트 시작 (PID ${proc.pid})`);
    const code = await new Promise((res) => proc.on("exit", res));
    log(`사이트가 멈춤 (종료 코드 ${code})`);
    // 켜자마자 계속 멈추면 점점 길게 기다린다 (최대 60초)
    quickFails = Date.now() - started < 60_000 ? quickFails + 1 : 0;
    const wait = Math.min(60, 5 * (quickFails + 1));
    log(`${wait}초 뒤 다시 켭니다.`);
    await sleep(wait * 1000);
  }
}

main().catch((exc) => { // 감시기 자체 오류도 기록 (작업 스케줄러가 다시 실행)
  log(`감시기 오류: ${exc.message}`);
  process.exit(1);
});
