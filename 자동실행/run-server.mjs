/** 사이트 감시 실행기 (작업 스케줄러가 창 없이 실행).
 *
 * - 이미 8501 포트에서 사이트가 돌고 있으면 아무것도 하지 않고 끝낸다 (중복 실행 방지).
 * - Supabase(Docker)를 켜고, 저장소를 백업한 뒤 사이트를 켠다. 사이트가 멈추면 몇 초 뒤 다시 켠다.
 * - 10분마다 DB 백업(바뀌었을 때만), 1시간마다 업무 자료 폴더 백업.
 * - 08~20시 2시간마다 입찰 공고 자동 불러오기 (/api/bid/fetch, .env.local BID_CRON_KEY).
 * - 서버 출력: 데이터/logs/server-YYYYMMDD.log, 재시작 기록: 데이터/logs/watchdog.log
 * 실행: node 자동실행/run-server.mjs   (먼저 npm run build)
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = join(import.meta.dirname, "..");
const LOGS = join(ROOT, "데이터", "logs");
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

/** .env.local 의 한 값 (감시기는 Next가 아니라서 직접 읽는다) */
function envValue(name) {
  try {
    const line = readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch { return ""; }
}

/** 입찰 공고 자동 불러오기: 한국 시각 08~20시, 2시간마다 */
function scheduleBidFetch() {
  let last = 0;
  setInterval(async () => {
    const hour = Number(stamp().slice(11, 13));
    if (hour < 8 || hour > 20 || Date.now() - last < 2 * 3600e3) return;
    const key = envValue("BID_CRON_KEY");
    if (!key || !envValue("DATA_GO_KR_KEY")) return;
    last = Date.now();
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/bid/fetch`, { method: "POST", headers: { "x-cron-key": key }, signal: AbortSignal.timeout(10 * 60e3) });
      const j = await res.json().catch(() => ({}));
      log(`입찰 공고 자동 불러오기: ${j.message ?? res.status}`);
    } catch (e) { log(`입찰 공고 자동 불러오기 실패: ${e.message}`); }
  }, 5 * 60e3);
}

/** 자동 백업: 사이트가 켜져 있는 동안 10분마다 DB(바뀌었을 때만 새 파일), 1시간마다 업무 자료 폴더 */
function scheduleBackups() {
  let busy = false, tick = 0;
  setInterval(() => {
    if (busy) return;
    busy = true;
    tick++;
    const jobs = ["node 자동실행/backup-db.mjs", ...(tick % 6 === 0 ? ["node 자동실행/backup-files.mjs"] : [])];
    const next = () => {
      const cmd = jobs.shift();
      if (!cmd) { busy = false; return; }
      const p = spawn(cmd, { cwd: ROOT, windowsHide: true, shell: true, stdio: "ignore" });
      p.on("exit", (code) => { if (code) log(`자동 백업 실패 (${cmd}, 코드 ${code})`); next(); });
      p.on("error", (e) => { log(`자동 백업 실패 (${cmd}): ${e.message}`); next(); });
    };
    next();
  }, 10 * 60e3);
}

// shell: true에는 명령을 문자열 하나로 넘긴다 (인자 배열을 같이 넘기면 Node가 DEP0190 경고를 띄움)
const run = (cmd) => spawnSync(cmd, { cwd: ROOT, windowsHide: true, shell: true, encoding: "utf8" });

async function main() {
  if (await portInUse()) {
    log(`${PORT} 포트에서 이미 사이트가 실행 중이라 감시기를 끝냅니다.`);
    return;
  }
  // Docker Desktop이 꺼져 있으면 직접 켠다 (로그아웃·절전 뒤 자동 시작이 안 되는 경우 대비)
  if (run("docker info").status !== 0) {
    const exe = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
    if (existsSync(exe)) {
      log("Docker Desktop이 꺼져 있어 켭니다.");
      spawn(exe, [], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    }
  }
  // Docker Desktop이 막 켜지는 중일 수 있어 최대 5분 기다린다
  for (let i = 0; ; i++) {
    const r = run("npx supabase start");
    if (r.status === 0) break;
    if (i >= 30) throw new Error(`Supabase를 켜지 못했습니다: ${(r.stderr || r.stdout).slice(-300)}`);
    if (i === 0) log("Supabase(Docker)를 기다리는 중...");
    await sleep(10_000);
  }
  run("node 자동실행/backup-db.mjs");
  run("node 자동실행/backup-files.mjs"); // 업무 영역 자료 폴더 백업·작업기록
  if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) {
    log("빌드가 없어 npm run build를 실행합니다.");
    run("npm run build");
  }

  scheduleBidFetch();
  scheduleBackups();
  let quickFails = 0;
  for (;;) {
    const started = Date.now();
    const day = stamp().slice(0, 10).replaceAll("-", "");
    const out = openSync(join(LOGS, `server-${day}.log`), "a");
    const proc = spawn("npm run start", {
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
