# VoiceUp: delete all data from voiceup_dev EXCEPT the admin users, the categories and the organizations.
# Also deletes the uploaded images. A full backup is made first (database + images) in setup\.
# Your passwords and the DATABASE_URL are never printed or written to the log.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $PSScriptRoot 'reset-data.txt'
Set-Location $root
"VoiceUp reset log $(Get-Date -Format s)" | Set-Content -Encoding utf8 $log
function Log($t) { Write-Host $t; Add-Content -Encoding utf8 $log $t }

$countSql = @"
SELECT 'admins', count(*) FROM "User" WHERE role = 'ADMIN'
UNION ALL SELECT 'other users', count(*) FROM "User" WHERE role <> 'ADMIN'
UNION ALL SELECT 'issues', count(*) FROM "PublicIssue"
UNION ALL SELECT 'images', count(*) FROM "MediaAttachment"
UNION ALL SELECT 'comments', count(*) FROM "IssueComment"
UNION ALL SELECT 'categories', count(*) FROM "Category"
UNION ALL SELECT 'organizations', count(*) FROM "Organization";
"@

# Everything that belongs to issues and users. Category and Organization are not listed, so they stay.
$deleteSql = @"
BEGIN;
TRUNCATE TABLE "AuditLog", "Notification", "ContentReport", "IssueMergeHistory",
  "IssueStatusHistory", "ExternalResponse", "IssueAssignment", "MediaAttachment",
  "ProposedSolution", "IssueComment", "IssueFollow", "GuestConfirmation",
  "IssueConfirmation", "PublicIssue";
DELETE FROM "User" WHERE role <> 'ADMIN';
COMMIT;
"@

# Windows PowerShell removes the double quotes from arguments passed to psql.exe, so the
# SQL (which needs "User" in quotes) is written to temporary files and run with psql -f.
$utf8 = New-Object Text.UTF8Encoding($false)
$countFile = Join-Path $env:TEMP 'voiceup-reset-count.sql'
$deleteFile = Join-Path $env:TEMP 'voiceup-reset-delete.sql'
[IO.File]::WriteAllText($countFile, $countSql, $utf8)
[IO.File]::WriteAllText($deleteFile, $deleteSql, $utf8)

try {
  # 1. Which database? (no secrets printed)
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
  Log "---- 1. Database: host=$($u.Host) database=$db"
  if (@('localhost', '127.0.0.1', '::1') -notcontains $u.Host) { throw 'DATABASE_URL is not a local database. Stopping.' }
  if ($db -ne 'voiceup_dev') { throw "DATABASE_URL points to '$db', expected voiceup_dev. Stopping." }
  if ($env:NODE_ENV -eq 'production') { throw 'NODE_ENV is production. Stopping.' }
  $bin = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin' -Directory -ErrorAction SilentlyContinue | Select-Object -Last 1 -ExpandProperty FullName
  if (-not $bin) { throw 'PostgreSQL bin folder not found.' }
  $psql = Join-Path $bin 'psql.exe'; $pgdump = Join-Path $bin 'pg_dump.exe'
  $uploadDir = if ($env:UPLOAD_DIR) { $env:UPLOAD_DIR } else { 'uploads' }
  if (-not [IO.Path]::IsPathRooted($uploadDir)) { $uploadDir = Join-Path $root $uploadDir }

  # 2. What is there now (read only)
  Log '---- 2. Before:'
  $before = & $psql $env:DATABASE_URL -tAF ': ' -f $countFile
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the database with psql.' }
  $before | ForEach-Object { Log "  $_" }
  $admins = [int](($before | Where-Object { $_ -like 'admins:*' }) -replace '\D', '')
  if ($admins -lt 1) { throw 'No admin user found. Stopping, so you do not lose access.' }
  $imageFiles = @(Get-ChildItem $uploadDir -File -ErrorAction SilentlyContinue)
  Log "  image files in uploads: $($imageFiles.Count)"

  # 3. Backup
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dump = Join-Path $PSScriptRoot "backup-voiceup_dev-$stamp.dump"
  Log "---- 3. Backup -> $dump"
  & $pgdump --dbname=$env:DATABASE_URL -Fc -f $dump
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dump)) { throw 'Database backup failed. Nothing was deleted.' }
  if ($imageFiles.Count -gt 0) {
    $imgBackup = Join-Path $PSScriptRoot "backup-uploads-$stamp"
    New-Item -ItemType Directory -Path $imgBackup | Out-Null
    Copy-Item $imageFiles.FullName $imgBackup
    Log "  images copied to $imgBackup"
  }

  # 4. Confirmation
  Write-Host ''
  Write-Host 'This deletes all users except admins, all issues, images, comments, notifications and the audit log.' -ForegroundColor Yellow
  Write-Host 'Categories and organizations are kept. A backup was made above.' -ForegroundColor Yellow
  $answer = Read-Host 'Type DELETE to continue (anything else cancels)'
  if ($answer -ne 'DELETE') { throw 'Cancelled by you. Nothing was deleted (the backup files stay).' }

  # 5. Delete (one transaction: all or nothing)
  Log '---- 5. Deleting data'
  $out = & $psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $deleteFile 2>&1
  $out | ForEach-Object { Log "  $_" }
  if ($LASTEXITCODE -ne 0) { throw 'Delete failed and was rolled back. Nothing was deleted.' }
  if ($imageFiles.Count -gt 0) {
    Remove-Item $imageFiles.FullName -Force
    Log "  deleted $($imageFiles.Count) image files from uploads"
  }

  # 6. Result
  Log '---- 6. After:'
  & $psql $env:DATABASE_URL -tAF ': ' -f $countFile | ForEach-Object { Log "  $_" }
  Log ''
  Log 'DONE. You can log in with the admin account as before.'
  Log "To restore everything: pg_restore --clean --dbname=<DATABASE_URL> `"$dump`" and copy the images back."
}
catch { Log "ERROR: $($_.Exception.Message)" }
finally {
  Remove-Item $countFile, $deleteFile -ErrorAction SilentlyContinue
  Write-Host ''
  Read-Host 'Press Enter to close'
}
