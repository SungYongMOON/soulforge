<#
.SYNOPSIS
  Stops one or both Tongs(MCP 문) loopback services, verified against this
  lane's own heartbeat and the port it claims — never an arbitrary process.

.DESCRIPTION
  run-tongs-loopback.ps1 had no stop path at all (2026-09-06 review, m4): the
  only documented rollback was "Stop-Process by pid", trusting whatever pid a
  heartbeat file happened to name. That is exactly the pid M1 found could be
  wrong (a dead child's pid written as "ready" while the real incumbent kept
  running unrecorded). This script closes that hole with its own
  verification, reusing the same evidence run-tongs-loopback.ps1's Sync-
  TongsService now requires before it will call a pid "ready":

    1. Read the named service's heartbeat (StateRoot only; this script never
       touches a LaneRoot, never spawns anything, never writes a secret).
    2. If it names a pid, require that pid to be alive, be a "node" process,
       and be the CURRENT owner of the exact host:port the SAME heartbeat
       names (via Get-NetTCPConnection) before doing anything to it.
    3. Only a pid that clears all three checks is stopped. Anything else
       (already gone, or alive but not verifiably this lane's own listener)
       is reported, not touched — "does it only kill its own children" is a
       real property here, not just true because nothing has a kill path yet.
    4. After stopping, poll until the process has exited AND the port is
       free, then write heartbeat status "stopped" (pid/listen null) so the
       next tick's decide() starts a fresh service instead of reading a
       heartbeat that still claims a pid that is gone.

  Never registers, modifies, or removes a Scheduled Task. Never reads,
  prints, or generates a secret/token/credential value.
#>

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory = $true)][string]$StateRoot,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [ValidateSet("erp_mcp", "ingress_mcp")]
  [string[]]$Service = @("erp_mcp", "ingress_mcp"),
  [int]$TimeoutSeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "tongs stop path contains a reparse point: $Cursor"
      }
    }
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) { break }
    $Cursor = $Parent.FullName
  }
}

function Resolve-CanonicalFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Leaf)) {
    throw "tongs stop required file is missing: $Absolute"
  }
  return $Absolute
}

function Resolve-PlannedDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  $Cursor = $Absolute
  while (-not (Test-Path -LiteralPath $Cursor)) {
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) { throw "tongs stop state root has no existing ancestor: $Absolute" }
    $Cursor = $Parent.FullName
  }
  Assert-NoReparsePath -Path $Cursor
  return $Absolute
}

function Invoke-Support {
  param([Parameter(Mandatory = $true)][string[]]$SupportArguments)
  $PreviousEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $Output = & $NodePath $Support @SupportArguments 2>&1
  } finally {
    $ErrorActionPreference = $PreviousEap
  }
  $Combined = ($Output -join [Environment]::NewLine)
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) {
    throw "tongs_lane_support invocation crashed (exit $LASTEXITCODE): $Combined"
  }
  try {
    $Parsed = $Combined | ConvertFrom-Json
  } catch {
    throw "tongs_lane_support returned non-JSON output: $Combined"
  }
  return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Json = $Parsed }
}

function Get-TongsPortOwnerProcessId {
  param(
    [Parameter(Mandatory = $true)][string]$ListenHostAddress,
    [Parameter(Mandatory = $true)][int]$ListenPort
  )
  $Connections = @(Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -eq $ListenHostAddress })
  if ($Connections.Count -eq 0) { return $null }
  return [int]$Connections[0].OwningProcess
}

$StateRoot = Resolve-PlannedDirectory -Path $StateRoot
$NodePath = Resolve-CanonicalFile -Path $NodePath
$Support = Resolve-CanonicalFile -Path (Join-Path (Split-Path -Parent $PSCommandPath) "tongs_lane_support.mjs")

$Results = @()
foreach ($Name in $Service) {
  $Read = Invoke-Support -SupportArguments @("read-heartbeat", "--state-root", $StateRoot, "--service", $Name)
  if (-not $Read.Json.present -or $null -eq $Read.Json.record.pid -or $null -eq $Read.Json.record.listen) {
    $Results += [ordered]@{ service = $Name; outcome = "not_running" }
    continue
  }

  $RecordedPid = [int]$Read.Json.record.pid
  $ListenParts = ([string]$Read.Json.record.listen).Split(":")
  $ListenHostAddress = $ListenParts[0]
  $ListenPort = [int]$ListenParts[1]

  $Found = Get-Process -Id $RecordedPid -ErrorAction SilentlyContinue
  if ($null -eq $Found) {
    # The heartbeat's own pid is already gone; nothing to stop, but the
    # heartbeat itself is now stale evidence — clear it so the next tick
    # does not read a "ready" pid that no longer exists.
    Invoke-Support -SupportArguments @(
      "write-heartbeat", "--state-root", $StateRoot, "--service", $Name, "--status", "stopped"
    ) | Out-Null
    $Results += [ordered]@{ service = $Name; outcome = "already_stopped"; pid = $RecordedPid }
    continue
  }

  $PortOwner = Get-TongsPortOwnerProcessId -ListenHostAddress $ListenHostAddress -ListenPort $ListenPort
  $Verified = ($Found.ProcessName -eq "node") -and ($null -ne $PortOwner) -and ($PortOwner -eq $RecordedPid)
  if (-not $Verified) {
    # Fail closed: a pid that is alive but not verifiably the current owner
    # of the port this exact heartbeat names is not this lane's child to
    # kill — report it and let a human decide, never guess.
    $Results += [ordered]@{
      service = $Name; outcome = "verification_failed"; pid = $RecordedPid
      process_name = $Found.ProcessName; port_owner_pid = $PortOwner
    }
    continue
  }

  if (-not $PSCmdlet.ShouldProcess("$Name (pid $RecordedPid, $($Read.Json.record.listen))", "stop verified Tongs process")) {
    $Results += [ordered]@{ service = $Name; outcome = "skipped_by_confirm"; pid = $RecordedPid }
    continue
  }

  Stop-Process -Id $RecordedPid -Force
  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Milliseconds 200
    $StillAlive = $null -ne (Get-Process -Id $RecordedPid -ErrorAction SilentlyContinue)
    $PortStillOwned = (Get-TongsPortOwnerProcessId -ListenHostAddress $ListenHostAddress -ListenPort $ListenPort) -eq $RecordedPid
  } while ((Get-Date) -lt $Deadline -and ($StillAlive -or $PortStillOwned))

  if ($StillAlive -or $PortStillOwned) {
    $Results += [ordered]@{ service = $Name; outcome = "stop_incomplete"; pid = $RecordedPid }
    continue
  }

  Invoke-Support -SupportArguments @(
    "write-heartbeat", "--state-root", $StateRoot, "--service", $Name, "--status", "stopped"
  ) | Out-Null
  $Results += [ordered]@{ service = $Name; outcome = "stopped"; pid = $RecordedPid }
}

$OverallOk = (@($Results | Where-Object { $_.outcome -eq "verification_failed" -or $_.outcome -eq "stop_incomplete" })).Count -eq 0
$Summary = [ordered]@{
  schema_version = "soulforge.tongs_lane.stop_summary.v1"
  ok             = $OverallOk
  results        = $Results
}
Write-Output ($Summary | ConvertTo-Json -Depth 6 -Compress)
if (-not $OverallOk) { exit 1 }
exit 0
