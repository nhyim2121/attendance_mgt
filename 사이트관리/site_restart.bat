@echo off
rem Restart the background site
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File 자동실행\server_control.ps1 restart
echo.
pause
