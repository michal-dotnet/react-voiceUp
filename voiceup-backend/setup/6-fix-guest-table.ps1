# VoiceUp: apply the one pending migration (GuestConfirmation table) and verify the API.
# Never resets or deletes data. Stops before any change if anything is unexpected.
# Your email, password and access token are never printed or written to the log.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $PSScriptRoot 'fix-guest-table.txt'
Set-Location $root
"VoiceUp fix log $(Get-Date -Format s)" | Set-Content -Encoding utf8 $log
function Log($t) { Write-Host $t; Add-Content -Encoding utf8 $log $t }
function Run($label, [scriptblock]$cmd) {
  Log "---- $label"
  $out = & $cmd 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  Add-Content -Encoding utf8 $log ($out | Out-String)
  $out | Write-Host
  Log "exit code: $code"
  return @{ Code = $code; Text = ($out | Out-String) }
}
$expected = '20261018120000_guest_confirmations'
$tables = @('User', 'Category', 'Organization', 'PublicIssue', 'IssueConfirmation', 'GuestConfirmation',
  'IssueFollow', 'IssueComment', 'ProposedSolution', 'MediaAttachment', 'IssueAssignment',
  'ExternalResponse', 'IssueStatusHistory', 'IssueMergeHistory', 'ContentReport', 'Notification', 'AuditLog')
$tmp = Join-Path $env:TEMP 'voiceup-fix-body.json'
$api = 'http://localhost:3000/api'
$utf8 = New-Object Text.UTF8Encoding($false)

try {
  # 1. Which database? (read only, no secrets printed)
  $envFile = Join-Path $root '.env'
  if (-not (Test-Path $envFile)) { throw '.env not found.' }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
      $v = $Matches[2]; if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      Set-Item -Path "Env:$($Matches[1])" -Value $v
    }
  }
  $u = [Uri]$env:DATABASE_URL
  $db = $u.AbsolutePath.TrimStart('/')
  Log "---- 1. DATABASE_URL: host=$($u.Host) port=$($u.Port) database=$db user=$($u.UserInfo.Split(':')[0]); NODE_ENV=$env:NODE_ENV"
  if (@('localhost', '127.0.0.1', '::1') -notcontains $u.Host) { throw 'DATABASE_URL is not a local database. Stopping.' }
  if ($db -ne 'voiceup_dev') { throw "DATABASE_URL points to '$db', expected voiceup_dev. Stopping." }
  if ($env:NODE_ENV -eq 'production') { throw 'NODE_ENV is production. Stopping.' }
  $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue | Select-Object -Last 1 -ExpandProperty FullName
  if (-not $psql) { throw 'psql.exe not found.' }

  # 2. Migration status and existing tables (read only)
  $status = Run '2a. prisma migrate status (before)' { npx prisma migrate status }
  if ($status.Text -match '(?i)failed') { throw 'A failed migration is recorded. Stopping without changes.' }
  $pending = [regex]::Matches($status.Text, '(?m)^\s*(\d{14}_[a-z0-9_]+)\s*$') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  Log "Pending migrations: $(if ($pending) { $pending -join ', ' } else { 'none' })"
  $existing = & $psql $env:DATABASE_URL -tAc "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1"
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the table list with psql.' }
  $missing = $tables | Where-Object { $existing -notcontains $_ }
  Log "---- 2b. Tables required by the code but missing: $(if ($missing) { $missing -join ', ' } else { 'none' })"
  $other = $pending | Where-Object { $_ -ne $expected }
  if ($other) { throw "Unexpected pending migrations: $($other -join ', '). Stopping without changes." }
  $otherMissing = $missing | Where-Object { $_ -ne 'GuestConfirmation' }
  if ($otherMissing) { throw "Other tables are missing too ($($otherMissing -join ', ')). Stopping without changes." }

  # 3. Apply only the expected migration (adds one empty table; existing data untouched)
  if ($pending -contains $expected) {
    if ($existing -contains 'GuestConfirmation') { throw 'The table exists but the migration is not recorded. Stopping without changes.' }
    $deploy = Run "3a. prisma migrate deploy ($expected)" { npx prisma migrate deploy }
    if ($deploy.Code -ne 0) { throw 'migrate deploy failed.' }
  } else { Log '---- 3. No pending migration.' }
  $after = Run '3b. prisma migrate status (after)' { npx prisma migrate status }
  if ($after.Code -ne 0) { throw 'Migrations are still not up to date.' }
  $existing = & $psql $env:DATABASE_URL -tAc "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1"
  $missing = $tables | Where-Object { $existing -notcontains $_ }
  if ($missing) { throw "Still missing: $($missing -join ', ')" }
  Log 'OK: all 17 tables required by the code exist.'

  # 4. Automated checks (tests use the separate voiceup_test database only)
  $null = Run '4a. typecheck' { npm run typecheck }
  $tests = Run '4b. tests' { npm test }

  # 5. Server on port 3000 (reuse a running one; it does not need a restart for a new table)
  Log '---- 5. Backend'
  if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
    Log 'A server is already listening on port 3000.'
  } else {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm run dev' -WorkingDirectory $root
    Log 'Started "npm run dev" in a new window.'
  }
  $ready = $false
  for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    Start-Sleep -Seconds 2
    if ((curl.exe -s -o NUL -w '%{http_code}' "$api/health/ready") -eq '200') { $ready = $true }
  }
  if (-not $ready) { throw 'Backend did not become ready on port 3000.' }
  Log 'health/ready: 200'

  # 6. Real user: login, GET /issues/mine, POST /issues (test issue, deleted right after)
  Log '---- 6. API with your user'
  Write-Host 'Tip: switch the keyboard to ENGLISH before typing.' -ForegroundColor Yellow
  $email = Read-Host 'Email of your VoiceUp user'
  $secure = Read-Host 'Password of that user' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  [IO.File]::WriteAllText($tmp, (@{ email = $email; password = $plain } | ConvertTo-Json -Compress), $utf8)
  $plain = $null
  $login = curl.exe -s -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "$api/auth/login" | ConvertFrom-Json
  Remove-Item $tmp -ErrorAction SilentlyContinue
  if (-not $login.data.accessToken) { throw "Login failed: $($login.error.code)" }
  Log 'POST /api/auth/login -> 200'
  $auth = "Authorization: Bearer $($login.data.accessToken)"

  $mineCode = curl.exe -s -o $tmp -w '%{http_code}' -H $auth "$api/issues/mine?pageSize=50"
  $mine = Get-Content -Encoding UTF8 $tmp -Raw | ConvertFrom-Json
  Log "GET /api/issues/mine -> $mineCode, total=$($mine.meta.total)"
  if ($mineCode -ne '200') { throw "GET /api/issues/mine failed: $(Get-Content -Encoding UTF8 $tmp -Raw)" }
  Log 'Your issues (look for duplicates created by the earlier failed POSTs):'
  foreach ($i in $mine.data) { Log ("  {0}  {1}  {2}  {3}" -f $i.createdAt, $i.moderationStatus, $i.id, $i.title) }

  $category = ((curl.exe -s "$api/categories") | ConvertFrom-Json).data | Select-Object -First 1
  if (-not $category) { throw 'No category found for the POST test.' }
  [IO.File]::WriteAllText($tmp, (@{ title = 'VoiceUp fix check (deleted automatically)'; description = 'Automatic check of POST /api/issues. This issue is deleted right away.'; categoryId = $category.id; area = 'Test' } | ConvertTo-Json -Compress), $utf8)
  $postCode = curl.exe -s -o "$tmp.out" -w '%{http_code}' -X POST -H $auth -H 'Content-Type: application/json' --data-binary "@$tmp" "$api/issues"
  $created = Get-Content -Encoding UTF8 "$tmp.out" -Raw | ConvertFrom-Json
  Log "POST /api/issues -> $postCode, moderationStatus=$($created.data.moderationStatus)"
  if ($postCode -ne '201') { throw "POST /api/issues failed: $(Get-Content -Encoding UTF8 "$tmp.out" -Raw)" }
  $delCode = curl.exe -s -o NUL -w '%{http_code}' -X DELETE -H $auth "$api/issues/$($created.data.id)"
  Log "DELETE test issue -> $delCode (expect 204)"
  $again = (curl.exe -s -H $auth "$api/issues/mine?pageSize=1") | ConvertFrom-Json
  Log "GET /api/issues/mine after cleanup -> total=$($again.meta.total) (before: $($mine.meta.total))"

  Log ''
  Log "DONE. Tests exit code: $($tests.Code) (0 = all passed)."
}
catch { Log "ERROR: $($_.Exception.Message)" }
finally {
  Remove-Item $tmp, "$tmp.out" -ErrorAction SilentlyContinue
  $auth = $null; $login = $null; $plain = $null
  Write-Host ''
  Read-Host 'Press Enter to close'
}
