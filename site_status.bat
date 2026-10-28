@echo off
rem Show site status and address
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\server_control.ps1 status
echo.
pause
