# 매일 18:00 자동 저장: 바뀐 코드를 커밋하고 GitHub(origin main)에 올린다.
# 작업 스케줄러 "CAPS 근태 자동 커밋"이 실행한다. 기록: data/logs/auto-commit.log
# 개인정보·비밀번호(data/, .env.local, 엑셀)는 .gitignore로 빠진다.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$LogDir = Join-Path $Root "data\logs"
New-Item -ItemType Directory -Force $LogDir | Out-Null
$Log = Join-Path $LogDir "auto-commit.log"
function Write-Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Out-File -FilePath $Log -Append -Encoding utf8 }

try {
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -ne "main") { Write-Log "main 브랜치가 아니라서($branch) 건너뜀"; exit 0 }
    git add -A
    $changed = git diff --cached --name-only
    if ($changed) {
        $n = @($changed).Count
        $msgFile = Join-Path $env:TEMP "caps-auto-commit-msg.txt"
        @(
            "자동 저장: $(Get-Date -Format 'yyyy-MM-dd HH:mm') (파일 $n개)",
            "",
            "매일 18:00 작업 스케줄러가 바뀐 코드를 커밋합니다 (scripts/auto_commit.ps1).",
            "",
            "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
        ) | Out-File -FilePath $msgFile -Encoding utf8
        git commit -q -F $msgFile
        if ($LASTEXITCODE -ne 0) { Write-Log "커밋 실패 (코드 $LASTEXITCODE)"; exit 1 }
        Write-Log "커밋함: 파일 $n개"
    } else {
        Write-Log "바뀐 파일 없음"
    }
    # 올릴 커밋이 있으면 올린다 (전에 올리지 못한 것 포함)
    git fetch -q origin main 2>$null
    $ahead = (git rev-list --count origin/main..HEAD 2>$null)
    if ($ahead -and [int]$ahead -gt 0) {
        git push -q origin main
        if ($LASTEXITCODE -eq 0) { Write-Log "GitHub에 올림: 커밋 $ahead개" } else { Write-Log "GitHub 올리기 실패 (코드 $LASTEXITCODE) - 다음 실행 때 다시 시도" ; exit 1 }
    }
} catch {
    Write-Log "오류: $($_.Exception.Message)"
    exit 1
}
