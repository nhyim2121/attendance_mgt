@echo off
rem CAPS attendance site - run in this window (Next.js + Supabase). Closing this window stops the site.
rem The background site (Task Scheduler) must be stopped first: site_stop.bat
cd /d "%~dp0"

if not exist "node_modules" (
  echo [ERROR] node_modules not found. Run the setup steps in README.md first.
  pause
  exit /b 1
)

echo Starting database (Supabase / Docker)...
call npx supabase start
if errorlevel 1 (
  echo [ERROR] Supabase did not start. Is Docker Desktop running?
  pause
  exit /b 1
)

echo Backing up database...
node scripts\backup-db.mjs

if not exist ".next\BUILD_ID" call npm run build

echo.
echo ============================================================
echo  CAPS attendance site
echo  This PC:     http://localhost:8501
echo  Other PCs:   http://(IPv4 address below):8501
ipconfig | findstr /c:"IPv4"
echo  Keep this window open. Closing it stops the site.
echo ============================================================
echo.

call npm run start
pause
