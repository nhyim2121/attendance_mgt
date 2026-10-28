@echo off
rem CAPS attendance site - serve on the office network. Closing this window stops the site.
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] .venv not found. Run the setup steps in README.md first.
  pause
  exit /b 1
)

echo Backing up database...
".venv\Scripts\python.exe" scripts\backup_db.py

echo.
echo ============================================================
echo  CAPS attendance site
echo  This PC:     http://localhost:8501
echo  Other PCs:   http://(IPv4 address below):8501
ipconfig | findstr /c:"IPv4"
echo  Keep this window open. Closing it stops the site.
echo ============================================================
echo.

set PYTHONIOENCODING=utf-8
".venv\Scripts\python.exe" -m streamlit run app.py --server.address 0.0.0.0 --server.port 8501 --server.headless true --browser.gatherUsageStats false
pause
