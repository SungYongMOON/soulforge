[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Source,

  [Parameter(Mandatory = $true)]
  [string]$Destination,

  [switch]$Json
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
  throw "runtime DATA source does not exist"
}

$SourcePath = (Resolve-Path -LiteralPath $Source).Path.TrimEnd("\")
$DestinationPath = [System.IO.Path]::GetFullPath($Destination).TrimEnd("\")
$separator = [System.IO.Path]::DirectorySeparatorChar

if ($DestinationPath -eq $SourcePath `
    -or $DestinationPath.StartsWith("$SourcePath$separator", [System.StringComparison]::OrdinalIgnoreCase) `
    -or $SourcePath.StartsWith("$DestinationPath$separator", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "runtime DATA source and destination must not overlap"
}

New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null

$robocopyArgs = @(
  $SourcePath,
  $DestinationPath,
  "/E",
  "/COPY:DAT",
  "/DCOPY:DAT",
  "/R:2",
  "/W:5",
  "/XJ",
  "/FFT",
  "/NP",
  "/NFL",
  "/NDL",
  "/NJH",
  "/NJS",
  "/XF",
  ".env",
  ".env.*",
  "*.env",
  "*.key",
  "*.pem",
  "*credential*",
  "*token*",
  "*.session",
  "dev-erp.db",
  "dev-erp.db-wal",
  "dev-erp.db-shm",
  "/XD",
  ".git",
  ".codex",
  "codex-home",
  "secret",
  "secrets",
  "credential",
  "credentials"
)

& robocopy.exe @robocopyArgs | Out-Null
$RobocopyExitCode = $LASTEXITCODE
if ($RobocopyExitCode -gt 7) {
  throw "runtime DATA backup failed with robocopy exit code $RobocopyExitCode"
}

$result = [ordered]@{
  schema = "dev_erp.runtime_data_backup.v1"
  kind = "copy_only_runtime_data_backup"
  checked_at = [DateTimeOffset]::Now.ToString("o")
  source = $SourcePath
  destination = $DestinationPath
  robocopy_exit_code = $RobocopyExitCode
  copy_only = $true
  delete_or_purge_used = $false
  live_sqlite_excluded = $true
  secret_like_names_excluded = $true
  reparse_points_excluded = $true
  ok = $true
}

if ($Json) {
  $result | ConvertTo-Json -Depth 4
} else {
  Write-Output "runtime DATA backup OK (copy-only, robocopy=$RobocopyExitCode)"
}
