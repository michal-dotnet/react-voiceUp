@echo off
chcp 65001 >nul
cd /d "%~dp0"
set OUT=%~dp0install-postgres.txt
echo ============================================================
echo  VoiceUp - PostgreSQL 17 installation
echo  The PostgreSQL installer window will open.
echo  - Keep the default folders and port 5432.
echo  - YOU choose the password for the "postgres" user there.
echo    Remember it: the next VoiceUp script will ask for it.
echo  - You can skip "Stack Builder" at the end.
echo ============================================================
echo.
where winget >nul 2>&1
if errorlevel 1 (
  echo winget was not found on this computer. > "%OUT%"
  echo winget was not found. Install PostgreSQL 17 manually from postgresql.org.
  pause
  exit /b 1
)
echo PostgreSQL install log > "%OUT%"
winget install --id PostgreSQL.PostgreSQL.17 --exact --interactive --source winget
echo winget exit code: %errorlevel% >> "%OUT%"
echo ---- install folders >> "%OUT%"
dir /b "C:\Program Files\PostgreSQL" >> "%OUT%" 2>&1
echo ---- services >> "%OUT%"
powershell -NoProfile -Command "Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Format-Table -AutoSize Name,Status | Out-String -Width 200" >> "%OUT%" 2>&1
echo ---- psql >> "%OUT%"
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" ("C:\Program Files\PostgreSQL\17\bin\psql.exe" --version >> "%OUT%" 2>&1) else (echo psql.exe not found >> "%OUT%")
echo ---- done >> "%OUT%"
echo.
echo Finished. Results saved to install-postgres.txt. You can close this window.
pause
