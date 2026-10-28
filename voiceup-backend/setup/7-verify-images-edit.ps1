# VoiceUp: verify image upload + editing before approval. Read-only for voiceup_dev.
# Runs typecheck, lint, tests (separate voiceup_test database only) and build. No migrations, no data changes.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $PSScriptRoot 'verify-images-edit.txt'
Set-Location $root
"VoiceUp verify log $(Get-Date -Format s)" | Set-Content -Encoding utf8 $log
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
  # Load .env into this process (like 6-fix-guest-table.ps1) so tests get DATABASE_URL_TEST. Nothing is printed.
  $envFile = Join-Path $root '.env'
  if (-not (Test-Path $envFile)) { throw '.env not found.' }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
      $v = $Matches[2]; if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      Set-Item -Path "Env:$($Matches[1])" -Value $v
    }
  }
  if (-not $env:DATABASE_URL_TEST) { throw 'DATABASE_URL_TEST is not set in .env.' }
  $t = [Uri]$env:DATABASE_URL_TEST
  Log "---- 0. Test database: host=$($t.Host) database=$($t.AbsolutePath.TrimStart('/'))"
  if (-not $t.AbsolutePath.EndsWith('_test')) { throw 'DATABASE_URL_TEST does not end with _test. Stopping.' }
  $results = [ordered]@{}
  $results['typecheck'] = Run '1. typecheck' { npm run typecheck }
  $results['lint'] = Run '2. lint' { npm run lint }
  $results['new tests'] = Run '3. new tests (issueEditingAndImages)' { npx vitest run tests/issueEditingAndImages.test.ts }
  $results['all tests'] = Run '4. all tests' { npm test }
  $results['build'] = Run '5. build' { npm run build }
  Log ''
  Log 'SUMMARY (0 = OK):'
  foreach ($k in $results.Keys) { Log ("  {0}: {1}" -f $k, $results[$k]) }
}
catch { Log "ERROR: $($_.Exception.Message)" }
finally {
  Write-Host ''
  Read-Host 'Press Enter to close'
}
