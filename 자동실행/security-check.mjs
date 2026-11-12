/** 이 PC(사이트 서버) 보안점검 — PC를 켜서 사이트 감시기(run-server.mjs)가 시작될 때 함께 실행한다 (2026-11-12 사용자 요청).
 *
 * 점검 항목: 백신(Windows Defender 실시간 보호·정의 업데이트·최근 검사), 방화벽(도메인·개인·공용), 윈도우 보안 업데이트(최근 설치일),
 *            사용자 계정 컨트롤(UAC), Guest 계정, 원격 데스크톱, 공유폴더, 디스크 여유 공간, DB 백업(최근 백업 시각)
 * 결과:
 *  - 데이터/logs/security-latest.json (통합 대시보드 'SECURITY' 카드가 읽는다)
 *  - 데이터/logs/security.log 에 한 줄
 *  - 보안 점검 기록 대장(seccheck)에 하루 한 줄 (점검자 '자동 점검'). 같은 날 이미 있으면 그 줄을 최신 결과로 바꾼다.
 * 실행: node 자동실행/security-check.mjs  (관리자 권한 없이 읽기만 한다. 아무것도 바꾸지 않는다)
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const LOGS = join(ROOT, "데이터", "logs");
const BACKUP = join(ROOT, "데이터", "db", "backup");
mkdirSync(LOGS, { recursive: true });
const now = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });

// PowerShell로 윈도우 보안 상태를 한 번에 읽는다 (읽기 전용)
const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$o = [ordered]@{}
$mp = Get-MpComputerStatus
if ($mp) { $o.av = @{ on = [bool]$mp.AntivirusEnabled; rt = [bool]$mp.RealTimeProtectionEnabled; sigAge = [int]$mp.AntivirusSignatureAge; scanAge = [int]$mp.QuickScanAge } }
$o.fw = @(Get-NetFirewallProfile | ForEach-Object { @{ name = [string]$_.Name; on = [bool]$_.Enabled } })
$hf = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
if ($hf) { $o.hotfix = @{ id = [string]$hf.HotFixID; day = $hf.InstalledOn.ToString('yyyy-MM-dd') } }
$lua = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System').EnableLUA
if ($lua -ne $null) { $o.uac = [int]$lua }
$g = Get-LocalUser -Name Guest
if ($g) { $o.guest = [bool]$g.Enabled }
$rdp = (Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server').fDenyTSConnections
if ($rdp -ne $null) { $o.rdp = [int]$rdp }
$o.shares = @(Get-SmbShare | Where-Object { -not $_.Special -and $_.Name -notmatch '\$$' } | ForEach-Object { [string]$_.Name })
$o.disks = @(Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null -and ($_.Used + $_.Free) -gt 0 } | ForEach-Object { @{ name = [string]$_.Name; freeGb = [math]::Round($_.Free / 1GB, 1); pct = [math]::Round($_.Free * 100 / ($_.Used + $_.Free)) } })
$o | ConvertTo-Json -Depth 4 -Compress
`;

function readWindows() {
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", PS],
      { encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 1 << 24 });
    return JSON.parse(out.trim() || "{}");
  } catch (e) {
    return { error: String(e.message).slice(0, 200) };
  }
}

const daysSince = (iso) => Math.floor((Date.now() - new Date(`${iso}T00:00:00+09:00`).getTime()) / 864e5);
const w = readWindows();
/** 항목: [분류, 이름, 상태('ok'|'warn'|'bad'), 설명] */
const items = [];
const add = (kind, name, st, detail) => items.push({ kind, name, st, detail });

if (w.error) add("기타", "윈도우 상태 읽기", "warn", `읽지 못함: ${w.error}`);
if (w.av) {
  add("백신 설치·업데이트", "실시간 보호", w.av.on && w.av.rt ? "ok" : "bad", w.av.on && w.av.rt ? "켜짐" : "꺼짐 — Windows 보안에서 켜 주세요");
  add("백신 설치·업데이트", "백신 정의", w.av.sigAge <= 3 ? "ok" : w.av.sigAge <= 7 ? "warn" : "bad", `${w.av.sigAge}일 전 업데이트`);
  add("백신 설치·업데이트", "빠른 검사", w.av.scanAge <= 7 ? "ok" : "warn", w.av.scanAge > 3650 ? "검사 기록 없음" : `${w.av.scanAge}일 전`);
} else if (!w.error) add("백신 설치·업데이트", "Windows Defender", "warn", "상태를 읽지 못함 (다른 백신을 쓰면 그 백신에서 확인)");
if (Array.isArray(w.fw)) {
  const off = w.fw.filter((p) => !p.on).map((p) => p.name);
  add("방화벽·공유기 설정·펌웨어", "윈도우 방화벽", off.length ? "bad" : "ok", off.length ? `꺼진 프로필: ${off.join(", ")}` : "도메인·개인·공용 모두 켜짐");
}
if (w.hotfix) {
  const d = daysSince(w.hotfix.day);
  add("윈도우·SW 보안 업데이트", "윈도우 업데이트", d <= 45 ? "ok" : d <= 90 ? "warn" : "bad", `최근 설치 ${w.hotfix.day} (${w.hotfix.id}, ${d}일 전)`);
}
if (w.uac !== undefined) add("PC 화면보호기·비밀번호", "사용자 계정 컨트롤(UAC)", w.uac === 1 ? "ok" : "bad", w.uac === 1 ? "켜짐" : "꺼짐");
if (w.guest !== undefined) add("PC 화면보호기·비밀번호", "Guest 계정", w.guest ? "bad" : "ok", w.guest ? "사용 중 — 꺼 주세요" : "사용 안 함");
if (w.rdp !== undefined) add("기타", "원격 데스크톱", w.rdp === 1 ? "ok" : "warn", w.rdp === 1 ? "꺼짐" : "켜짐 — 쓰지 않으면 꺼 주세요");
if (Array.isArray(w.shares)) add("공유폴더·NAS 권한", "공유폴더", w.shares.length ? "warn" : "ok", w.shares.length ? `공유 중: ${w.shares.join(", ")} (권한 확인)` : "공유 없음");
for (const dk of w.disks ?? []) add("기타", `디스크 ${dk.name}:`, dk.pct >= 15 ? "ok" : dk.pct >= 8 ? "warn" : "bad", `여유 ${dk.freeGb}GB (${dk.pct}%)`);
// 랜섬웨어 대비: DB 백업이 최근에 있는지
let lastBackup = "";
if (existsSync(BACKUP)) {
  const f = readdirSync(BACKUP).filter((x) => /^caps-\d{8}-\d{6}\.sql\.gz$/.test(x)).sort().at(-1);
  if (f) lastBackup = statSync(join(BACKUP, f)).mtime.toISOString();
}
const bh = lastBackup ? (Date.now() - new Date(lastBackup).getTime()) / 3600_000 : Infinity;
add("랜섬웨어 대비 점검", "DB 백업", bh <= 26 ? "ok" : bh <= 72 ? "warn" : "bad",
  lastBackup ? `최근 백업 ${new Date(lastBackup).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16)}` : "백업 파일 없음");

const bad = items.filter((i) => i.st === "bad"), warn = items.filter((i) => i.st === "warn");
const result = { at: now(), ok: !bad.length && !warn.length, bad: bad.length, warn: warn.length, items };
writeFileSync(join(LOGS, "security-latest.json"), JSON.stringify(result, null, 2), "utf8");
appendFileSync(join(LOGS, "security.log"),
  `${result.at} 보안점검: ${bad.length ? `위험 ${bad.length}` : ""}${bad.length && warn.length ? ", " : ""}${warn.length ? `주의 ${warn.length}` : ""}${result.ok ? "모두 양호" : ""}${[...bad, ...warn].length ? ` — ${[...bad, ...warn].map((i) => `${i.name}: ${i.detail}`).join(" / ")}` : ""}\n`, "utf8");

// 보안 점검 기록 대장(seccheck)에 하루 한 줄 (Supabase DB, docker)
try {
  const project = /project_id\s*=\s*"([^"]+)"/.exec(readFileSync(join(ROOT, "supabase", "config.toml"), "utf8"))[1];
  const day = result.at.slice(0, 10);
  const found = [...bad, ...warn].map((i) => `[${i.st === "bad" ? "위험" : "주의"}] ${i.name}: ${i.detail}`).join("\n");
  const data = {
    day, kind: "기타", target: "사이트 서버 PC 자동 점검 (백신·방화벽·업데이트·계정·공유폴더·디스크·백업)",
    result: bad.length || warn.length ? "조치 필요" : "양호", found: found || "이상 없음", by: "자동 점검",
  };
  const json = JSON.stringify(data).replaceAll("'", "''");
  const sql = `do $$ begin
    if exists (select 1 from public.ledger_rows where book = 'seccheck' and day = '${day}' and data->>'by' = '자동 점검') then
      update public.ledger_rows set data = '${json}'::jsonb, updated_at = now() where book = 'seccheck' and day = '${day}' and data->>'by' = '자동 점검';
    else
      insert into public.ledger_rows (book, day, data) values ('seccheck', '${day}', '${json}'::jsonb);
    end if; end $$;`;
  execFileSync("docker", ["exec", "-i", `supabase_db_${project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, windowsHide: true, timeout: 60_000 });
} catch (e) {
  appendFileSync(join(LOGS, "security.log"), `${now()} 보안 점검 기록 대장에 쓰지 못함: ${String(e.message).slice(0, 200)}\n`, "utf8");
}
console.log(`보안점검 완료: 위험 ${bad.length}, 주의 ${warn.length} (${join(LOGS, "security-latest.json")})`);
