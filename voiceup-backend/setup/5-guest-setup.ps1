# VoiceUp: finish guest-confirmations setup locally. No data is reset or deleted.
# Secrets (passwords, JWT secret) are never printed or logged.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $PSScriptRoot 'guest-setup.txt'
Set-Location $root
"VoiceUp guest setup log $(Get-Date -Format s)" | Set-Content -Encoding utf8 $log
function Log($t) { Write-Host $t; Add-Content -Encoding utf8 $log $t }
function Run($label, [scriptblock]$cmd) {
  Log "---- $label"
  $out = & $cmd 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  Add-Content -Encoding utf8 $log ($out | Out-String)
  $out | Write-Host
  Log "exit code: $code"
  return $code
}
$expectedMigration = '20261018120000_guest_confirmations'

try {
  # 1. Load .env into this process and verify the targets (no secrets printed).
  $envFile = Join-Path $root '.env'
  if (-not (Test-Path $envFile)) { throw '.env not found.' }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
      $v = $Matches[2]; if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      Set-Item -Path "Env:$($Matches[1])" -Value $v
    }
  }
  function Describe($name) {
    $u = [Uri]((Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value)
    $db = $u.AbsolutePath.TrimStart('/'); $user = $u.UserInfo.Split(':')[0]
    Log ("{0}: host={1} port={2} database={3} user={4}" -f $name, $u.Host, $u.Port, $db, $user)
    return @{ Host = $u.Host; Db = $db }
  }
  Log '---- 1. Database targets'
  $dev = Describe 'DATABASE_URL'
  $test = Describe 'DATABASE_URL_TEST'
  Log "NODE_ENV=$env:NODE_ENV"
  if (@('localhost', '127.0.0.1', '::1') -notcontains $dev.Host) { throw 'DATABASE_URL is not a local database. Stopping.' }
  if ($dev.Db -ne 'voiceup_dev') { throw "DATABASE_URL points to '$($dev.Db)', expected voiceup_dev. Stopping." }
  if (-not $test.Db.EndsWith('_test') -or $test.Db -eq $dev.Db) { throw 'DATABASE_URL_TEST must be a separate *_test database. Stopping.' }
  if ($env:NODE_ENV -eq 'production') { throw 'NODE_ENV is production. Stopping.' }
  Log 'OK: local development database confirmed.'

  # 2. Migration status; apply only if the single expected migration is pending.
  $null = Run '2a. prisma migrate status (before)' { npx prisma migrate status }
  $status = (Get-Content $log -Raw)
  $pending = [regex]::Matches($status, '(?m)^\s*(\d{14}_[a-z0-9_]+)\s*$') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  $pendingOther = $pending | Where-Object { $_ -ne $expectedMigration }
  if ($pendingOther) { throw "Unexpected pending migrations: $($pendingOther -join ', '). Stopping." }
  if ($pending -contains $expectedMigration) {
    if ((Run '2b. prisma migrate deploy' { npx prisma migrate deploy }) -ne 0) { throw 'migrate deploy failed.' }
  } else { Log 'No pending migration to apply.' }
  $null = Run '2c. prisma migrate status (after)' { npx prisma migrate status }

  # 3. Generate client, typecheck, lint, tests (tests use the separate *_test database).
  if ((Run '3a. prisma generate' { npx prisma generate }) -ne 0) { throw 'prisma generate failed.' }
  $null = Run '3b. typecheck' { npm run typecheck }
  $null = Run '3c. lint' { npm run lint }
  $testCode = Run '3d. tests' { npm test }

  # 4. Backend on localhost:3000: reuse a running one, otherwise start it in a new window.
  Log '---- 4. Backend'
  $listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($listening) { Log 'A server is already listening on port 3000 (npm run dev reloads on file changes).' }
  else {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm run dev' -WorkingDirectory $root
    Log 'Started "npm run dev" in a new window.'
  }
  $ready = $false
  for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    Start-Sleep -Seconds 2
    $c = curl.exe -s -o NUL -w '%{http_code}' http://localhost:3000/api/health/ready
    if ($c -eq '200') { $ready = $true }
  }
  Log "health/ready: $(if ($ready) { '200 OK' } else { 'NOT READY' })"
  if (-not $ready) { throw 'Backend did not become ready on port 3000.' }

  # 5. Swagger and login endpoint (with deliberately wrong credentials: no real password used).
  Log '---- 5. Swagger and login'
  Log ("GET /api/docs/ -> " + (curl.exe -s -o NUL -w '%{http_code}' http://localhost:3000/api/docs/))
  Log ("GET /api/docs/openapi.json -> " + (curl.exe -s -o NUL -w '%{http_code}' http://localhost:3000/api/docs/openapi.json))
  $tmp = Join-Path $env:TEMP 'voiceup-body.json'
  '{"email":"nobody@example.com","password":"wrong-password"}' | Set-Content -Encoding ascii $tmp
  $login = curl.exe -s -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" http://localhost:3000/api/auth/login
  Log "POST /api/auth/login (wrong credentials, expect INVALID_CREDENTIALS) -> $login"

  # 6. Guest confirmation without JWT on a published issue; the test confirmation is withdrawn after.
  Log '---- 6. Guest confirmation'
  $issues = (curl.exe -s 'http://localhost:3000/api/issues?pageSize=1') | ConvertFrom-Json
  $issue = $issues.data | Select-Object -First 1
  if (-not $issue) { Log 'No published issue exists, so the live guest check was skipped (automated tests cover it).' }
  else {
    $id = $issue.id
    '{}' | Set-Content -Encoding ascii $tmp
    $r = curl.exe -s -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "http://localhost:3000/api/issues/$id/confirmations" | ConvertFrom-Json
    if ($r.data.guestToken) {
      Log "guest POST (no JWT) -> confirmed=$($r.data.confirmed) guestConfirmationCount=$($r.data.guestConfirmationCount) label='$($r.data.guestConfirmationLabel)'"
      $tok = $r.data.guestToken
      $dup = curl.exe -s -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "X-Guest-Token: $tok" --data-binary "@$tmp" "http://localhost:3000/api/issues/$id/confirmations"
      Log "duplicate with same token -> $dup (expect 409)"
      '{"note":"free text"}' | Set-Content -Encoding ascii $tmp
      $note = curl.exe -s -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "http://localhost:3000/api/issues/$id/confirmations"
      Log "guest with note -> $note (expect 400)"
      '{"body":"guest comment"}' | Set-Content -Encoding ascii $tmp
      $cm = curl.exe -s -o NUL -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "http://localhost:3000/api/issues/$id/comments"
      Log "guest comment -> $cm (expect 401)"
      $del = curl.exe -s -X DELETE -H "X-Guest-Token: $tok" "http://localhost:3000/api/issues/$id/confirmations" | ConvertFrom-Json
      Log "guest withdraw (cleanup) -> confirmed=$($del.data.confirmed) guestConfirmationCount=$($del.data.guestConfirmationCount)"
    } else {
      Log "guest POST failed: $($r | ConvertTo-Json -Compress)"
    }
  }
  Remove-Item $tmp -ErrorAction SilentlyContinue
  Log ''
  Log "DONE. Tests exit code: $testCode (0 = all passed)."
}
catch { Log "ERROR: $($_.Exception.Message)" }
finally { Write-Host ''; Read-Host 'Press Enter to close' }
