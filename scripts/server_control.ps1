param([ValidateSet("install", "uninstall", "start", "stop", "restart", "status")][string]$Action = "status")
# 근태관리통합시스템 백그라운드 실행 관리 (작업 스케줄러)
$ErrorActionPreference = "Stop"
$TaskName = "CAPS 근태 사이트"
$Root = Split-Path -Parent $PSScriptRoot
$Pyw = Join-Path $Root ".venv\Scripts\pythonw.exe"
$Runner = Join-Path $Root "scripts\run_server.py"
$Port = 8501

function Get-SiteProcesses {
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -in @("python.exe", "pythonw.exe") -and $_.CommandLine -and (
            $_.CommandLine -match "run_server\.py" -or $_.CommandLine -match "streamlit run app\.py.*--server\.port $Port")
    }
}

function Stop-Site {
    try { Disable-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null } catch {}  # 5분 점검이 다시 켜지 않게
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
    $procs = @(Get-SiteProcesses)
    foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    "사이트를 껐습니다 (정리한 프로세스 $($procs.Count)개). 다시 켜려면 site_restart.bat을 실행하세요."
}

function Show-Status {
    $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($t) { "작업 스케줄러: 등록됨 ($($t.State)$(if ($t.State -eq 'Disabled') { ' - 꺼둔 상태, site_restart.bat으로 다시 켜기' }))" } else { "작업 스케줄러: 등록 안 됨" }
    $listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listen) { "사이트: 켜짐 (포트 $Port)" } else { "사이트: 꺼짐" }
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        ForEach-Object { "접속 주소: http://$($_.IPAddress):$Port" }
    $log = Join-Path $Root "data\logs\watchdog.log"
    if (Test-Path $log) { "--- 최근 기록 ---"; Get-Content $log -Encoding UTF8 -Tail 5 }
}

switch ($Action) {
    "install" {
        $user = "$env:USERDOMAIN\$env:USERNAME"
        $act = New-ScheduledTaskAction -Execute $Pyw -Argument "`"$Runner`"" -WorkingDirectory $Root
        $trg = @(New-ScheduledTaskTrigger -AtLogOn -User $user)
        # 감시기 자체가 멈춰도 5분 안에 다시 켜지도록 (이미 돌고 있으면 IgnoreNew로 무시됨)
        $rep = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) `
            -RepetitionDuration (New-TimeSpan -Days 3650)
        $trg += $rep
        $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -MultipleInstances IgnoreNew
        $prin = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $TaskName -Action $act -Trigger $trg -Settings $set -Principal $prin `
            -Description "근태관리통합시스템 사이트를 창 없이 실행하고, 멈추면 자동으로 다시 켭니다." -Force | Out-Null
        "작업 스케줄러에 '$TaskName' 등록 완료 (로그인할 때 자동 실행)."
    }
    "uninstall" {
        Stop-Site
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        "작업 스케줄러에서 '$TaskName'을 지웠습니다."
    }
    "start" { Enable-ScheduledTask -TaskName $TaskName | Out-Null; Start-ScheduledTask -TaskName $TaskName; Start-Sleep -Seconds 8; Show-Status }
    "stop" { Stop-Site }
    "restart" { Stop-Site; Enable-ScheduledTask -TaskName $TaskName | Out-Null; Start-ScheduledTask -TaskName $TaskName; Start-Sleep -Seconds 8; Show-Status }
    "status" { Show-Status }
}
