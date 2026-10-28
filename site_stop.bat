@echo off
rem Stop the background site (it starts again at next logon)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\server_control.ps1 stop
echo.
pause
