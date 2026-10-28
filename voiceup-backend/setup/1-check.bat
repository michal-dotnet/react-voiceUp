@echo off
chcp 65001 >nul
cd /d "%~dp0"
set OUT=%~dp0setup-check.txt
echo VoiceUp environment check > "%OUT%"
echo ---- node >> "%OUT%"
where node >> "%OUT%" 2>&1
node -v >> "%OUT%" 2>&1
echo ---- npm >> "%OUT%"
call npm -v >> "%OUT%" 2>&1
echo ---- psql on PATH >> "%OUT%"
where psql >> "%OUT%" 2>&1
echo ---- PostgreSQL install folders >> "%OUT%"
dir /b "C:\Program Files\PostgreSQL" >> "%OUT%" 2>&1
echo ---- PostgreSQL services >> "%OUT%"
powershell -NoProfile -Command "Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Format-Table -AutoSize Name,Status | Out-String -Width 200" >> "%OUT%" 2>&1
echo ---- port 5432 >> "%OUT%"
powershell -NoProfile -Command "(Test-NetConnection -ComputerName localhost -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded" >> "%OUT%" 2>&1
echo ---- docker >> "%OUT%"
where docker >> "%OUT%" 2>&1
echo ---- done >> "%OUT%"
echo Check finished. Results saved to setup-check.txt
timeout /t 5
