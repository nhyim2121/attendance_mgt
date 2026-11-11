/** 업무 영역 폴더(총무·인사노무·환경안전보건·보안전산·인증·기타)의 '자료' 폴더를 백업하고 바뀐 내용을 기록한다.
 *
 * - <영역>/자료 안의 파일이 지난번과 달라졌을 때만 <영역>/백업/자료-날짜-시각.zip 을 만든다.
 * - 무엇이 추가·변경·삭제됐는지 <영역>/작업기록.md 맨 아래에 한 줄씩 적는다.
 * - 보관: 영역마다 최근 30개. 지난번 상태는 <영역>/백업/.상태.json 에 둔다.
 * - 실행: 매일 18:00 자동 커밋 작업, 사이트를 켤 때(run-server.mjs), 또는 직접 `node 자동실행/backup-files.mjs`
 * - 자료·백업·작업기록은 개인정보가 있을 수 있어 GitHub에 올리지 않는다 (.gitignore).
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import JSZip from "jszip";

const ROOT = join(import.meta.dirname, "..");
export const AREAS = ["총무", "인사노무", "환경안전보건", "보안전산", "인증", "기타"];
const KEEP = 30;

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const when = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

/** 폴더 안 모든 파일: 상대 경로 -> 내용 해시 (Office 임시 파일 ~$ 는 뺀다) */
function scan(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && !e.name.startsWith("~$") && e.name !== "Thumbs.db" && e.name !== "desktop.ini") {
        out[relative(dir, p).replaceAll("\\", "/")] = createHash("sha1").update(readFileSync(p)).digest("hex");
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

for (const area of AREAS) {
  const base = join(ROOT, area);
  const src = join(base, "자료");
  const bak = join(base, "백업");
  const logFile = join(base, "작업기록.md");
  if (!existsSync(base)) continue;
  mkdirSync(src, { recursive: true });
  mkdirSync(bak, { recursive: true });
  if (!existsSync(logFile)) writeFileSync(logFile, `# ${area} 작업기록\n\n자료 폴더에서 바뀐 파일이 자동으로 적힙니다 (백업할 때마다).\n직접 메모를 적어도 됩니다.\n\n`);

  const stateFile = join(bak, ".상태.json");
  const prev = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
  const cur = scan(src);
  const added = Object.keys(cur).filter((k) => !(k in prev));
  const changed = Object.keys(cur).filter((k) => k in prev && prev[k] !== cur[k]);
  const removed = Object.keys(prev).filter((k) => !(k in cur));
  if (!added.length && !changed.length && !removed.length) continue;

  let zipName = "";
  if (Object.keys(cur).length) {
    const zip = new JSZip();
    for (const k of Object.keys(cur)) zip.file(k, readFileSync(join(src, k)), { date: statSync(join(src, k)).mtime });
    zipName = `자료-${stamp}.zip`;
    writeFileSync(join(bak, zipName), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  }
  writeFileSync(stateFile, JSON.stringify(cur));

  const list = (label, xs) => (xs.length ? [`${label} ${xs.length}개: ${xs.join(", ")}`] : []);
  const parts = [...list("추가", added), ...list("변경", changed), ...list("삭제", removed)];
  appendFileSync(logFile, `- ${when} ${parts.join(" / ")}${zipName ? ` → 백업 ${zipName}` : ""}\n`);

  // 오래된 백업 정리 (최근 KEEP개만)
  const zips = readdirSync(bak).filter((f) => /^자료-\d{8}-\d{6}\.zip$/.test(f)).sort();
  for (const f of zips.slice(0, Math.max(0, zips.length - KEEP))) unlinkSync(join(bak, f));
  console.log(`${area}: ${parts.join(" / ")}`);
}
