@echo off
rem Restart the background site
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\server_control.ps1 restart
echo.
pause
