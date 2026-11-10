@echo off
rem 사이트 업데이트: 새 코드로 빌드한 뒤 바로 사이트를 다시 켠다 (빌드만 하고 재시작을 안 하면 화면이 깨진다)
cd /d "%~dp0.."
echo [1/2] 빌드 중... (1~2분)
call npm run build
if errorlevel 1 (
  echo 빌드에 실패했습니다. 사이트는 그대로 둡니다.
  pause
  exit /b 1
)
echo [2/2] 사이트 다시 켜는 중...
powershell -NoProfile -ExecutionPolicy Bypass -File 자동실행\server_control.ps1 restart
echo.
pause
