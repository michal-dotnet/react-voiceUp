@echo off
chcp 65001 >nul
cd /d "%~dp0.."
set OUT=%~dp0register-migrations.txt
echo Registering the already-applied migrations with Prisma...
echo Register migrations log > "%OUT%"
call npx prisma migrate resolve --applied 20261008200000_init >> "%OUT%" 2>&1
call npx prisma migrate resolve --applied 20261008200100_integrity_checks >> "%OUT%" 2>&1
echo ---- status >> "%OUT%"
call npx prisma migrate status >> "%OUT%" 2>&1
echo Done. Results saved to setup\register-migrations.txt
pause
