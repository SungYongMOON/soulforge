<#
.SYNOPSIS
  Tongs(MCP 문) loopback launcher: brings up the personal ERP MCP
  (server.mjs, default 127.0.0.1:4311) and, only when a private ingress
  binding is supplied, the feature-gated HPP evidence ingress MCP
  (ingress_server.mjs, loopback-only port chosen by that binding).

.DESCRIPTION
  This script is the impure shell around ops/tongs_lane_support.mjs, which
  owns every decision that must stay pure and node:test-covered (heartbeat
  record shape, the reuse-vs-restart decision, the preflight check
  aggregator). This script only: resolves canonical paths, shells out to that
  module's CLI, spawns node when a (re)start is decided, and polls /health.

  Personal ERP MCP and ingress MCP are two independent Node processes on two
  independent ports, not one process on 4311: 4311 is server.mjs's own
  default bind, and ingress_server.mjs has no built-in default port at all —
  its listen_host/listen_port/public_url come only from the private binding
  JSON passed to -IngressConfigPath (see ../schema/ingress_mcp_binding.v1.schema.json
  and ../README.md "HPP evidence ingress MCP"). Omitting -IngressConfigPath
  runs the personal ERP MCP alone, matching the ingress feature's default OFF
  state.

  Every invocation writes one heartbeat JSON per managed service under
  "<StateRoot>/operations/tongs/<service>.heartbeat.v1.json" in the exact
  {status, observed_at, pid, listen} shape (plus schema_version) documented
  in docs/TONGS_LANE_RUNBOOK_V0.md, so a future Vigil probe can read it
  without knowing anything about this launcher.

  -Preflight performs only read-only checks (file presence, lane-root
  containment, and — when -IngressConfigPath is given — a real
  loadIngressMcpConfig() structural validation) and never opens a socket,
  spawns a process, or writes a heartbeat. Use it to verify a lane before
  registering or re-triggering the scheduled task.

  Without -Preflight, this script decides reuse-vs-restart per configured
  service from the current heartbeat and a live process-alive probe, so a
  supervisory recheck (this script invoked again, e.g. by the registered
  task's 5-minute repetition) self-heals a service whose process died without
  depending on Windows Task Scheduler's job-object semantics: worst case is a
  bounded gap of at most one recheck interval, not a silently dead lane.

.NOTES
  Never registers, modifies, or removes a Scheduled Task; see
  register-tongs-task.ps1 for that. Never reads, prints, or generates a
  secret/token/credential value; the ingress binding this script reads is
  structural configuration only (see schema/ingress_mcp_binding.v1.schema.json)
  and carries no bearer token.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$LaneRoot,
  [Parameter(Mandatory = $true)][string]$StateRoot,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [string]$ErpListenHost = "127.0.0.1",
  [int]$ErpListenPort = 4311,
  [string]$ErpBaseUrl = "http://127.0.0.1:4300",
  [string]$IngressConfigPath,
  [int]$MaxHeartbeatAgeMs = 300000,
  [int]$HealthTimeoutSeconds = 30,
  [switch]$Preflight
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
        throw "tongs lane path contains a reparse point: $Cursor"
      }
    }
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) { break }
    $Cursor = $Parent.FullName
  }
}

function Resolve-CanonicalDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Container)) {
    throw "tongs lane required directory is missing: $Absolute"
  }
  return $Absolute
}

function Resolve-CanonicalFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Leaf)) {
    throw "tongs lane required file is missing: $Absolute"
  }
  return $Absolute
}

function Resolve-PlannedDirectory {
  # Like Resolve-CanonicalDirectory, but the leaf (state root's operations/tongs
  # directory) is allowed not to exist yet; only its nearest existing ancestor
  # is checked for a reparse point.
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  $Cursor = $Absolute
  while (-not (Test-Path -LiteralPath $Cursor)) {
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) { throw "tongs lane state root has no existing ancestor: $Absolute" }
    $Cursor = $Parent.FullName
  }
  Assert-NoReparsePath -Path $Cursor
  return $Absolute
}

function Invoke-Support {
  param([Parameter(Mandatory = $true)][string[]]$SupportArguments)
  $Output = & $NodePath $Support @SupportArguments 2>&1
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

function Test-ProcessAlive {
  param($ProcessId)
  if ($null -eq $ProcessId) { return $false }
  $Found = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  return $null -ne $Found
}

function Wait-TongsHealth {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][int]$TimeoutSeconds
  )
  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $Response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
      if ($Response.StatusCode -eq 200) { return $true }
    } catch {
      Start-Sleep -Seconds 1
    }
  } while ((Get-Date) -lt $Deadline)
  return $false
}

# Sets the named environment variables on the current process only long
# enough for Start-Process to snapshot them into the child, then restores the
# prior values. Windows PowerShell 5.1's Start-Process has no -Environment
# parameter (that is a PowerShell 7+ addition), so this is the plain
# CreateProcess-inheritance route instead.
function Start-TongsChildProcess {
  param(
    [Parameter(Mandatory = $true)][hashtable]$EnvironmentOverrides,
    [Parameter(Mandatory = $true)][string[]]$ChildArguments,
    [Parameter(Mandatory = $true)][string]$OutLog,
    [Parameter(Mandatory = $true)][string]$ErrLog
  )
  $Previous = @{}
  foreach ($Key in $EnvironmentOverrides.Keys) {
    $Previous[$Key] = [Environment]::GetEnvironmentVariable($Key)
    [Environment]::SetEnvironmentVariable($Key, [string]$EnvironmentOverrides[$Key])
  }
  try {
    return Start-Process -FilePath $NodePath -ArgumentList $ChildArguments -WorkingDirectory $AppRoot `
      -WindowStyle Hidden -PassThru -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
  } finally {
    foreach ($Key in $Previous.Keys) {
      [Environment]::SetEnvironmentVariable($Key, $Previous[$Key])
    }
  }
}

function ConvertTo-ProcessArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  return '"' + $Value.Replace('"', '""') + '"'
}

$LaneRoot = Resolve-CanonicalDirectory -Path $LaneRoot
$StateRoot = Resolve-PlannedDirectory -Path $StateRoot
$NodePath = Resolve-CanonicalFile -Path $NodePath
$AppRoot = Resolve-CanonicalDirectory -Path (Join-Path $LaneRoot "ui-workspace\apps\dev-erp-mcp")
$Support = Resolve-CanonicalFile -Path (Join-Path $AppRoot "ops\tongs_lane_support.mjs")
$ErpEntry = Resolve-CanonicalFile -Path (Join-Path $AppRoot "server.mjs")

$IngressRequested = -not [string]::IsNullOrEmpty($IngressConfigPath)
$IngressEntry = $null
if ($IngressRequested) {
  $IngressConfigPath = Resolve-CanonicalFile -Path $IngressConfigPath
  $IngressEntry = Resolve-CanonicalFile -Path (Join-Path $AppRoot "ingress_server.mjs")
}

# ---- preflight: read-only, no socket, no process spawn, no heartbeat write ----
$ErpPreflight = Invoke-Support -SupportArguments @(
  "preflight", "--node-path", $NodePath, "--entry-path", $ErpEntry, "--lane-root", $AppRoot
)
$IngressPreflight = $null
if ($IngressRequested) {
  $IngressPreflight = Invoke-Support -SupportArguments @(
    "preflight", "--node-path", $NodePath, "--entry-path", $IngressEntry,
    "--lane-root", $AppRoot, "--ingress-config", $IngressConfigPath
  )
}
# $IngressPreflight stays $null when ingress was never requested; guard the
# property read explicitly instead of counting on -or to short-circuit past
# it inside a hashtable literal value.
$IngressPreflightJson = $null
if ($null -ne $IngressPreflight) { $IngressPreflightJson = $IngressPreflight.Json }
$PreflightOk = ([bool]$ErpPreflight.Json.ok) -and (-not $IngressRequested -or [bool]$IngressPreflightJson.ok)
$PreflightSummary = [ordered]@{
  schema_version    = "soulforge.tongs_lane.preflight_summary.v1"
  ok                = $PreflightOk
  network_used      = $false
  ingress_requested = $IngressRequested
  erp_mcp           = $ErpPreflight.Json
  ingress_mcp       = $IngressPreflightJson
}

if ($Preflight) {
  Write-Output ($PreflightSummary | ConvertTo-Json -Depth 6 -Compress)
  if (-not $PreflightOk) { exit 1 }
  exit 0
}

if (-not $PreflightOk) {
  Write-Output ($PreflightSummary | ConvertTo-Json -Depth 6 -Compress)
  throw "tongs lane preflight failed; refusing to start a process against an unverified lane"
}

# ---- steady-state supervisor: decide reuse vs (re)start per service, then heartbeat ----
function Sync-TongsService {
  param(
    [Parameter(Mandatory = $true)][string]$Service,
    [Parameter(Mandatory = $true)][string]$Listen,
    [Parameter(Mandatory = $true)][string]$HealthUri,
    [Parameter(Mandatory = $true)][scriptblock]$StartBlock
  )

  $Read = Invoke-Support -SupportArguments @("read-heartbeat", "--state-root", $StateRoot, "--service", $Service)
  $ExistingPid = $null
  if ($Read.Json.present -and $null -ne $Read.Json.record.pid) { $ExistingPid = [int]$Read.Json.record.pid }
  $Alive = Test-ProcessAlive -ProcessId $ExistingPid

  $Decision = Invoke-Support -SupportArguments @(
    "decide", "--state-root", $StateRoot, "--service", $Service,
    "--process-alive", $(if ($Alive) { "true" } else { "false" }),
    "--max-heartbeat-age-ms", $MaxHeartbeatAgeMs
  )

  if ($Decision.Json.action -eq "reuse") {
    # Alive and fresh by the last tick's own account, but re-probe health now
    # instead of repeating whatever that heartbeat already claimed: a process
    # can stay alive while its listener wedges.
    $Healthy = Wait-TongsHealth -Uri $HealthUri -TimeoutSeconds 3
    $Status = if ($Healthy) { "ready" } else { "degraded" }
    Invoke-Support -SupportArguments @(
      "write-heartbeat", "--state-root", $StateRoot, "--service", $Service,
      "--status", $Status, "--pid", $ExistingPid, "--listen", $Listen
    ) | Out-Null
    return [ordered]@{ service = $Service; action = "reuse"; reason = $Decision.Json.reason; pid = $ExistingPid; status = $Status }
  }

  Invoke-Support -SupportArguments @(
    "write-heartbeat", "--state-root", $StateRoot, "--service", $Service, "--status", "starting"
  ) | Out-Null

  $LogDirectory = Join-Path $StateRoot "operations\tongs\logs"
  New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
  $NewProcess = & $StartBlock (Join-Path $LogDirectory "$Service.out.log") (Join-Path $LogDirectory "$Service.err.log")

  $Healthy = Wait-TongsHealth -Uri $HealthUri -TimeoutSeconds $HealthTimeoutSeconds
  $Status = if ($Healthy) { "ready" } elseif ($NewProcess.HasExited) { "error" } else { "degraded" }
  Invoke-Support -SupportArguments @(
    "write-heartbeat", "--state-root", $StateRoot, "--service", $Service,
    "--status", $Status, "--pid", $NewProcess.Id, "--listen", $Listen
  ) | Out-Null
  return [ordered]@{ service = $Service; action = "start"; reason = $Decision.Json.reason; pid = $NewProcess.Id; status = $Status }
}

$Results = @()

$ErpListen = "$($ErpListenHost):$($ErpListenPort)"
$Results += Sync-TongsService -Service "erp_mcp" -Listen $ErpListen -HealthUri "http://$ErpListen/health" -StartBlock {
  param($OutLog, $ErrLog)
  Start-TongsChildProcess -OutLog $OutLog -ErrLog $ErrLog `
    -ChildArguments @((ConvertTo-ProcessArgument -Value $ErpEntry)) `
    -EnvironmentOverrides @{
      ERP_MCP_HOST         = $ErpListenHost
      ERP_MCP_PORT         = "$ErpListenPort"
      ERP_MCP_ERP_BASE_URL = $ErpBaseUrl
      ERP_MCP_PUBLIC_URL   = "http://$ErpListen"
    }
}

if ($IngressRequested) {
  $IngressListen = [string]$IngressPreflight.Json.resolved_listen
  $Results += Sync-TongsService -Service "ingress_mcp" -Listen $IngressListen -HealthUri "http://$IngressListen/health" -StartBlock {
    param($OutLog, $ErrLog)
    Start-TongsChildProcess -OutLog $OutLog -ErrLog $ErrLog `
      -ChildArguments @(
        (ConvertTo-ProcessArgument -Value $IngressEntry),
        "--config",
        (ConvertTo-ProcessArgument -Value $IngressConfigPath)
      ) `
      -EnvironmentOverrides @{}
  }
}

$OverallOk = (@($Results | Where-Object { $_.status -eq "error" })).Count -eq 0
$Summary = [ordered]@{
  schema_version = "soulforge.tongs_lane.run_summary.v1"
  ok             = $OverallOk
  results        = $Results
}
Write-Output ($Summary | ConvertTo-Json -Depth 6 -Compress)
if (-not $OverallOk) { exit 1 }
exit 0
