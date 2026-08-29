[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$SourceScriptPath,
  [Parameter(Mandatory = $true)][string]$LocalRoot,
  [Parameter(Mandatory = $true)][string]$ActivityRoot
)

# Report-only launcher for the "Soulforge-Codex-Retention-Refresh" scheduled
# task. It only ever re-runs codex_retention_automation_cli.mjs, which itself
# rejects every destructive option (--apply/--delete/--archive/--remove/
# --prune/--branch-delete and the approve/apply/verify/delete/archive/remove/
# prune subcommands). This launcher adds no additional authority.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "codex retention refresh path contains a reparse point"
      }
    }
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) { break }
    $Cursor = $Parent.FullName
  }
}

$NodePath = [IO.Path]::GetFullPath($NodePath)
$SourceScriptPath = [IO.Path]::GetFullPath($SourceScriptPath)
$LocalRoot = [IO.Path]::GetFullPath($LocalRoot)
$ActivityRoot = [IO.Path]::GetFullPath($ActivityRoot)

foreach ($RequiredFile in @($NodePath, $SourceScriptPath)) {
  if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
    throw "codex retention refresh required file is missing"
  }
}
if (-not (Test-Path -LiteralPath $LocalRoot -PathType Container)) {
  throw "codex retention refresh local root is missing"
}
foreach ($ProtectedPath in @($NodePath, $SourceScriptPath, $LocalRoot)) {
  Assert-NoReparsePath -Path $ProtectedPath
}

$LockPath = Join-Path $ActivityRoot "codex_retention_refresh.instance.lock"
New-Item -ItemType Directory -Force -Path $ActivityRoot | Out-Null
Assert-NoReparsePath -Path $ActivityRoot

$InstanceLock = $null
try {
  try {
    $InstanceLock = [IO.File]::Open($LockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  } catch [IO.IOException] {
    Write-Output "codex retention refresh already running; duplicate launch ignored"
    return
  }

  & $NodePath $SourceScriptPath --local-root $LocalRoot --activity-root $ActivityRoot
  exit $LASTEXITCODE
} finally {
  if ($InstanceLock) { $InstanceLock.Dispose() }
}
