@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules call npm install
start "" http://localhost:3000
node server.js
pause
