param([ValidateSet("install", "uninstall", "start", "stop", "restart", "status", "lock-ports")][string]$Action = "status")
# 근태관리통합시스템 백그라운드 실행 관리 (작업 스케줄러)
$ErrorActionPreference = "Stop"
$TaskName = "CAPS 근태 사이트"
$Root = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node.exe).Source
$Runner = Join-Path $Root "scripts\run-server.mjs"
$Port = 8501

function Get-SiteProcesses {
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -in @("node.exe", "cmd.exe") -and $_.CommandLine -and (
            $_.CommandLine -match "run-server\.mjs" -or $_.CommandLine -match "next(\.js)?`"? start" -or
            $_.CommandLine -match "npm-cli\.js`"? run start" -or $_.CommandLine -match "npm run start")
    }
}

function Stop-Site {
    try { Disable-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null } catch {}  # 5분 점검이 다시 켜지 않게
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
    $procs = @(Get-SiteProcesses)
    foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    "사이트를 껐습니다 (정리한 프로세스 $($procs.Count)개). 데이터베이스(Supabase)는 계속 켜져 있습니다. 다시 켜려면 site_restart.bat을 실행하세요."
}

function Show-Status {
    $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($t) { "작업 스케줄러: 등록됨 ($($t.State)$(if ($t.State -eq 'Disabled') { ' - 꺼둔 상태, site_restart.bat으로 다시 켜기' }))" } else { "작업 스케줄러: 등록 안 됨" }
    $listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listen) { "사이트: 켜짐 (포트 $Port)" } else { "사이트: 꺼짐" }
    $db = docker ps --filter "name=supabase_db_caps-attendance-app" --format "{{.Status}}" 2>$null
    if ($db) { "데이터베이스: 켜짐 ($db)" } else { "데이터베이스: 꺼짐 (Docker Desktop이 켜져 있는지 확인하세요)" }
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        ForEach-Object { "접속 주소: http://$($_.IPAddress):$Port" }
    $log = Join-Path $Root "data\logs\watchdog.log"
    if (Test-Path $log) { "--- 최근 기록 ---"; Get-Content $log -Encoding UTF8 -Tail 5 }
}

switch ($Action) {
    "install" {
        $user = "$env:USERDOMAIN\$env:USERNAME"
        $act = New-ScheduledTaskAction -Execute $Node -Argument "`"$Runner`"" -WorkingDirectory $Root
        $trg = @(New-ScheduledTaskTrigger -AtLogOn -User $user)
        # 감시기 자체가 멈춰도 5분 안에 다시 켜지도록 (이미 돌고 있으면 IgnoreNew로 무시됨)
        $rep = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) `
            -RepetitionDuration (New-TimeSpan -Days 3650)
        $trg += $rep
        $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -MultipleInstances IgnoreNew -Hidden
        $prin = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $TaskName -Action $act -Trigger $trg -Settings $set -Principal $prin `
            -Description "근태관리통합시스템 사이트(Next.js + Supabase)를 창 없이 실행하고, 멈추면 자동으로 다시 켭니다." -Force | Out-Null
        "작업 스케줄러에 '$TaskName' 등록 완료 (로그인할 때 자동 실행)."
    }
    "uninstall" {
        Stop-Site
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        "작업 스케줄러에서 '$TaskName'을 지웠습니다."
    }
    "start" { Enable-ScheduledTask -TaskName $TaskName | Out-Null; Start-ScheduledTask -TaskName $TaskName; Start-Sleep -Seconds 15; Show-Status }
    "stop" { Stop-Site }
    "restart" { Stop-Site; Enable-ScheduledTask -TaskName $TaskName | Out-Null; Start-ScheduledTask -TaskName $TaskName; Start-Sleep -Seconds 15; Show-Status }
    "status" { Show-Status }
    "lock-ports" {
        # 데이터베이스 포트(54321~54329)를 다른 PC에서 들어오지 못하게 막는다 (관리자 권한 PowerShell에서 실행)
        New-NetFirewallRule -DisplayName "CAPS 근태 DB 외부 차단" -Direction Inbound -Protocol TCP -LocalPort 54320-54329 `
            -RemoteAddress Any -Action Block -Profile Any -ErrorAction Stop | Out-Null
        "방화벽 규칙 'CAPS 근태 DB 외부 차단'을 만들었습니다 (54320~54329 포트 외부 접속 차단)."
    }
}
