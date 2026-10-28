# VoiceUp local setup. Asks for every password in this window; nothing is shown or sent anywhere.
# Native tools (npm, psql) write warnings to stderr; failures are checked explicitly via exit codes.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $PSScriptRoot 'setup-voiceup.txt'
Set-Location $root
"VoiceUp setup log $(Get-Date -Format s)" | Set-Content -Encoding utf8 $log
function Log($text) { Write-Host $text; Add-Content -Encoding utf8 $log $text }
function Plain($secure) { [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)) }

try {
  $psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
  if (-not (Test-Path $psql)) { throw 'psql.exe was not found. Is PostgreSQL 17 installed?' }

  Write-Host ''
  Write-Host '=== Step 1 of 4: database ===' -ForegroundColor Cyan
  $pgPass = Plain (Read-Host 'Password of the "postgres" user (chosen during the PostgreSQL install)' -AsSecureString)
  Write-Host 'Tip: switch the keyboard to ENGLISH before typing passwords (Hebrew letters are not allowed).' -ForegroundColor Yellow
  Write-Host 'Choose a NEW password for the VoiceUp database user "voiceup":'
  Write-Host '  at least 8 characters; English letters, digits and symbols like ! @ # $ % - _ (no spaces or quotes)'
  $appPass = Plain (Read-Host 'New "voiceup" database password' -AsSecureString)
  if ($appPass -notmatch '^[\x21-\x7E]{8,}$' -or $appPass -match "['`"\\]") {
    throw 'The voiceup password must be at least 8 characters: English letters, digits or symbols, without spaces, quotes or backslashes. Check that the keyboard is set to English.'
  }
  $appPassUrl = [Uri]::EscapeDataString($appPass)

  $env:PGPASSWORD = $pgPass
  & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "SELECT 1" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not connect as "postgres". Check the password.' }
  $exists = & $psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='voiceup'"
  if ($exists -eq '1') {
    & $psql -h localhost -U postgres -d postgres -q -c "ALTER ROLE voiceup WITH LOGIN CREATEDB PASSWORD '$appPass'"
  } else {
    & $psql -h localhost -U postgres -d postgres -q -c "CREATE ROLE voiceup WITH LOGIN CREATEDB PASSWORD '$appPass'"
  }
  foreach ($db in 'voiceup_dev','voiceup_test') {
    $has = & $psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'"
    if ($has -ne '1') { & $psql -h localhost -U postgres -d postgres -q -c "CREATE DATABASE $db OWNER voiceup" }
  }
  Remove-Item Env:PGPASSWORD
  Log 'Database: user voiceup and databases voiceup_dev, voiceup_test are ready.'

  Write-Host ''
  Write-Host '=== Step 2 of 4: admin account and JWT secret (.env file) ===' -ForegroundColor Cyan
  $adminEmail = Read-Host 'Email for the first VoiceUp admin account'
  Write-Host 'Choose a password for that VoiceUp admin account (at least 12 characters):'
  $adminPass = Plain (Read-Host 'VoiceUp admin password' -AsSecureString)
  if ($adminPass.Length -lt 12) { throw 'The admin password must be at least 12 characters.' }
  if ($adminPass -notmatch '^[\x20-\x7E]+$') { throw 'Use English letters, digits and symbols only (check the keyboard language).' }
  if ($adminPass -match '["\r\n]') { throw 'The admin password cannot contain double quotes.' }
  Write-Host 'Choose the JWT secret: a long random text used to sign logins (at least 32 characters, no spaces or quotes):'
  $jwt = Plain (Read-Host 'JWT secret' -AsSecureString)
  if ($jwt.Length -lt 32) { throw 'The JWT secret must be at least 32 characters.' }
  if ($jwt -notmatch '^[\x21-\x7E]+$' -or $jwt -match '"') { throw 'The JWT secret must use English letters, digits and symbols, without spaces or double quotes.' }
  $envText = @"
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgresql://voiceup:$appPassUrl@localhost:5432/voiceup_dev
DATABASE_URL_TEST=postgresql://voiceup:$appPassUrl@localhost:5432/voiceup_test
JWT_SECRET=$jwt
JWT_EXPIRES_IN_SECONDS=7200
CORS_ORIGINS=http://localhost:5173
UPLOAD_DIR=uploads
SEED_ADMIN_EMAIL=$adminEmail
SEED_ADMIN_PASSWORD="$adminPass"
SEED_ADMIN_NAME=VoiceUp Admin
"@
  [IO.File]::WriteAllText((Join-Path $root '.env'), $envText, (New-Object Text.UTF8Encoding($false)))
  Log '.env written (passwords and the JWT secret are only in .env, not in this log).'

  Write-Host ''
  Write-Host '=== Step 3 of 4: npm install (a few minutes) ===' -ForegroundColor Cyan
  npm install 2>&1 | Tee-Object -Variable out | Write-Host
  if ($LASTEXITCODE -ne 0) {
    Add-Content $log (($out | Select-Object -Last 20) | Out-String)
    Log 'npm install failed (probably a blocked Prisma download). Retrying without it...'
    npm install --ignore-scripts 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    # The client generator does not need the blocked engine; point Prisma at an existing file.
    $env:PRISMA_SCHEMA_ENGINE_BINARY = (Get-Command node).Source
    npx prisma generate 2>&1 | Tee-Object -Variable out | Write-Host
    Add-Content $log ($out | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed.' }
    $script:engineBlocked = $true
  }
  Log 'npm install: OK'

  Write-Host ''
  Write-Host '=== Step 4 of 4: migrations, seed and tests ===' -ForegroundColor Cyan
  $migrated = $false
  if (-not $script:engineBlocked) {
    npx prisma migrate deploy 2>&1 | Tee-Object -Variable out | Write-Host
    Add-Content $log ($out | Out-String)
    $migrated = ($LASTEXITCODE -eq 0)
  }
  if (-not $migrated) {
    Log 'prisma migrate deploy unavailable; applying the migration SQL files with psql instead.'
    $env:PGPASSWORD = $appPass
    $count = & $psql -h localhost -U voiceup -d voiceup_dev -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
    if ([int]$count -eq 0) {
      Get-ChildItem (Join-Path $root 'prisma\migrations') -Directory | Sort-Object Name | ForEach-Object {
        & $psql -h localhost -U voiceup -d voiceup_dev -v ON_ERROR_STOP=1 -q -f (Join-Path $_.FullName 'migration.sql')
        if ($LASTEXITCODE -ne 0) { throw "Migration $($_.Name) failed." }
        Log "Applied $($_.Name)"
      }
    } else { Log 'Tables already exist; skipped migrations.' }
    Remove-Item Env:PGPASSWORD
  }
  npm run db:seed 2>&1 | Tee-Object -Variable out | Write-Host
  Add-Content $log ($out | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Seed failed.' }
  $env:DATABASE_URL_TEST = "postgresql://voiceup:$appPassUrl@localhost:5432/voiceup_test"
  npm test 2>&1 | Tee-Object -Variable out | Write-Host
  Add-Content $log (($out | Select-Object -Last 15) | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Some tests failed.' }
  Log ''
  Log 'ALL DONE. Start the server with:  npm run dev   then open http://localhost:3000/api/docs'
}
catch {
  Log "ERROR: $($_.Exception.Message)"
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $pgPass = $null; $appPass = $null; $adminPass = $null; $jwt = $null
  Write-Host ''
  Read-Host 'Press Enter to close'
}
