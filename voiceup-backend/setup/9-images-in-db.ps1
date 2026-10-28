# VoiceUp: store images in the database. Applies the new migration to voiceup_dev,
# regenerates the Prisma client, then runs the typecheck and the tests (voiceup_test only).
# Stop "npm run dev" of the backend before running this. No data is deleted.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $PSScriptRoot 'images-in-db.txt'
Set-Location $root
"VoiceUp images-in-db log $(Get-Date -Format s)" | Set-Content -Encoding utf8 $log
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
try {
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
  Log "---- 0. Database: host=$($u.Host) database=$db"
  if (@('localhost', '127.0.0.1', '::1') -notcontains $u.Host) { throw 'DATABASE_URL is not a local database. Stopping.' }
  if ($db -ne 'voiceup_dev') { throw "DATABASE_URL points to '$db', expected voiceup_dev. Stopping." }
  if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
    throw 'The backend is running on port 3000. Stop it (Ctrl+C in its window) and run this again.'
  }

  $results = [ordered]@{}
  $results['migrate status (before)'] = Run '1. prisma migrate status (before)' { npx prisma migrate status }
  $results['migrate deploy'] = Run '2. prisma migrate deploy' { npx prisma migrate deploy }
  if ($results['migrate deploy'] -ne 0) { throw 'The migration failed (nothing else was changed). Send me the log.' }
  $results['generate'] = Run '3. prisma generate' { npx prisma generate }
  $results['typecheck'] = Run '4. typecheck' { npm run typecheck }
  $results['lint'] = Run '5. lint' { npm run lint }
  $results['tests'] = Run '6. tests (voiceup_test only)' { npm test }
  Log ''
  Log 'SUMMARY (0 = OK):'
  foreach ($k in $results.Keys) { Log ("  {0}: {1}" -f $k, $results[$k]) }
  Log 'Start the backend again with "npm run dev".'
}
catch { Log "ERROR: $($_.Exception.Message)" }
finally {
  Write-Host ''
  Read-Host 'Press Enter to close'
}
