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
  # M3: loopback is a code-enforced property, not a documentation claim — this
  # launcher must refuse to even attempt a non-loopback bind rather than rely
  # solely on server.mjs's own assertSafeBindHost (which an inherited
  # ERP_MCP_ALLOW_INSECURE_HTTP=1 can loosen; see the EnvironmentOverrides
  # below, which pin that variable to "0" for exactly this reason).
  [ValidateScript({
    if ($_ -ne "127.0.0.1") {
      throw "tongs lane requires -ErpListenHost 127.0.0.1 (loopback only); refusing '$_'"
    }
    $true
  })]
  [string]$ErpListenHost = "127.0.0.1",
  [int]$ErpListenPort = 4311,
  [string]$ErpBaseUrl = "http://127.0.0.1:4300",
  [string]$IngressConfigPath,
  # M2: must stay >= 2x the registered task's own PT5M repetition interval;
  # see ops/tongs_lane_support.mjs's TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS /
  # TONGS_REGISTERED_TRIGGER_INTERVAL_MS, the one place this constant is
  # actually owned. This default is a literal copy, not a re-derivation, so a
  # human calling this script without -MaxHeartbeatAgeMs gets the same number
  # `node ops/tongs_lane_support.mjs decide` would default to on its own.
  [int]$MaxHeartbeatAgeMs = 720000,
  [int]$HealthTimeoutSeconds = 30,
  [switch]$Preflight
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# How many rotated copies of each child's out/err log this launcher keeps
# alongside the live file (m11: Start-Process's redirect truncates on every
# start, which used to destroy exactly the crash evidence M1 needed).
$LogRotationKeep = 5

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
  # m1: under $ErrorActionPreference = "Stop", a native command's stderr
  # lines become terminating NativeCommandError records when merged with
  # 2>&1, which killed the intended "throw a clean message" catch below and
  # surfaced a raw parser error instead (observed for real in C16/C17 of the
  # 2026-09-06 review). Scope the relaxation to just this one call.
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

# heartbeat 쓰기 실패를 무시하지 않는다: write-heartbeat가 exit 0 + {"ok":true}가
# 아니면 즉시 throw한다(호출부에서 Out-Null로 결과를 버리던 예전 방식은 실패를
# 조용히 삼켰다).
function Assert-HeartbeatWritten {
  param([Parameter(Mandatory = $true)]$Result)
  if ($Result.ExitCode -ne 0 -or -not [bool]$Result.Json.ok) {
    throw "tongs lane heartbeat write failed: $($Result.Json | ConvertTo-Json -Depth 4 -Compress)"
  }
}

# M1: a bare Get-Process -Id proves only that SOME process currently holds
# this pid number, not that it is still the same process this lane started —
# Windows freely reissues pid numbers once a process exits. Corroborate with
# the process image name and, when the caller has a reference timestamp (the
# heartbeat's own observed_at), that this process did not start AFTER that
# heartbeat was written. An optional command-line fragment additionally
# proves it is running THIS lane's entry file, not an unrelated node.exe.
function Test-ProcessAlive {
  # $NotStartedAfter is deliberately untyped (plain [datetime] or $null), not
  # [Nullable[datetime]]: PowerShell's parameter binder does not reliably
  # preserve a Nullable<T> wrapper when a non-null value is passed in (the
  # bound variable ends up a plain DateTime with no .HasValue/.Value),
  # which made the intended null-check silently misbehave when this was
  # tried as [Nullable[datetime]] — caught only by actually running this
  # function against a real live pid, not by the parser or `node --check`.
  param(
    $ProcessId,
    $NotStartedAfter,
    [string]$ExpectedCommandLineFragment
  )
  if ($null -eq $ProcessId) { return $false }
  $Found = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($null -eq $Found) { return $false }
  if ($Found.ProcessName -ne "node") { return $false }
  if ($null -ne $NotStartedAfter) {
    try {
      # A few seconds of slop: this launcher writes the heartbeat strictly
      # after the process it names has already started, but clock/API
      # granularity is not sub-second-exact across the two calls.
      if ($Found.StartTime -gt ([datetime]$NotStartedAfter).AddSeconds(5)) { return $false }
    } catch {
      # StartTime can throw Win32Exception for a process this account
      # cannot query fully; without a reference to compare, do not treat
      # that alone as proof of a mismatch.
    }
  }
  if ($ExpectedCommandLineFragment) {
    $CommandLine = $null
    try {
      $CimProcess = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
      $CommandLine = [string]$CimProcess.CommandLine
    } catch {
      $CommandLine = $null
    }
    if ([string]::IsNullOrEmpty($CommandLine) -or -not $CommandLine.Contains($ExpectedCommandLineFragment)) {
      return $false
    }
  }
  return $true
}

# M1/m4: Get-NetTCPConnection's OwningProcess for the exact loopback
# host:port this service binds — the one authority for "who really holds
# this port right now", independent of whatever any heartbeat file claims.
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

# m11: Start-Process's -RedirectStandardOutput/-RedirectStandardError always
# truncates, so a crash's evidence used to die with it on the very next tick.
# Keep the last $LogRotationKeep copies instead (<name>.1 newest .. .N
# oldest) and always start the fresh tick with an empty current file.
function Invoke-TongsLogRotation {
  param(
    [Parameter(Mandatory = $true)][string]$LogPath,
    [Parameter(Mandatory = $true)][int]$Keep
  )
  if (-not (Test-Path -LiteralPath $LogPath)) { return }
  # Best-effort: a restart decided while the previous child is still alive
  # (exactly M1's adopt scenario) means that process may still hold this
  # exact path open, and Windows refuses to rename a file another handle
  # references even though it happily lets a fresh Start-Process reopen the
  # same path for writing. Rotation losing one tick's history here is a
  # cosmetic loss (m11 is a minor); it must never block the start attempt
  # itself, so every step below is swallow-and-continue, not throw.
  try {
    $Oldest = "$LogPath.$Keep"
    if (Test-Path -LiteralPath $Oldest) { Remove-Item -LiteralPath $Oldest -Force -ErrorAction Stop }
    for ($index = $Keep - 1; $index -ge 1; $index--) {
      $From = "$LogPath.$index"
      if (Test-Path -LiteralPath $From) { Move-Item -LiteralPath $From -Destination "$LogPath.$($index + 1)" -Force -ErrorAction Stop }
    }
    Move-Item -LiteralPath $LogPath -Destination "$LogPath.1" -Force -ErrorAction Stop
  } catch {
    # Leave $LogPath where it is; Start-Process will reopen/truncate it for
    # the new child regardless (already relied upon before rotation existed).
  }
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
# --state-root: Vigil projects the heartbeat only from the shared state root
# (SOULFORGE_STATE_ROOT > SOULFORGE_OWNER_ROOT/guild_hall/state, see
# guild_hall/shared/soulforge_state_root.mjs), so preflight refuses a -StateRoot
# that differs from it whenever this host declares one (check
# state_root_matches_shared_state_root; not applicable when the environment
# declares no shared root). A heartbeat written anywhere else is never read.
$ErpPreflight = Invoke-Support -SupportArguments @(
  "preflight", "--node-path", $NodePath, "--entry-path", $ErpEntry, "--lane-root", $AppRoot,
  "--state-root", $StateRoot
)
$IngressPreflight = $null
if ($IngressRequested) {
  $IngressPreflight = Invoke-Support -SupportArguments @(
    "preflight", "--node-path", $NodePath, "--entry-path", $IngressEntry,
    "--lane-root", $AppRoot, "--ingress-config", $IngressConfigPath,
    "--state-root", $StateRoot
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
# M1: the health probe used to be trusted on its own to mean "the process I
# just spawned is ready". It is not bound to that process at all — it only
# proves SOMETHING answers on the port. When a restart is decided while the
# previous server still owns the port, the new child dies (EADDRINUSE)
# almost immediately, the OLD process answers /health, and the launcher used
# to write "ready" with the dead child's pid (2026-09-06 review, C15). The
# fix threads one more fact through every branch: who does
# Get-NetTCPConnection say actually owns this port right now, and is that
# the pid we are about to call "ready"? "ready" is written only when that
# question has a verified yes; otherwise the outcome is "adopt" (a still-
# healthy incumbent already holds the port — record ITS pid, spawn nothing)
# or "error" (fail closed; never guess).
function Sync-TongsService {
  param(
    [Parameter(Mandatory = $true)][string]$Service,
    [Parameter(Mandatory = $true)][string]$ListenHostAddress,
    [Parameter(Mandatory = $true)][int]$ListenPort,
    [Parameter(Mandatory = $true)][string]$Listen,
    [Parameter(Mandatory = $true)][string]$HealthUri,
    [Parameter(Mandatory = $true)][string]$EntryPath,
    [Parameter(Mandatory = $true)][scriptblock]$StartBlock
  )

  # The full canonical entry path, not just its leaf filename: a bare
  # "server.mjs" would also match an unrelated process running, say,
  # "other_server.mjs" (Contains() is a plain substring test). $EntryPath is
  # already an absolute, reparse-checked path (Resolve-CanonicalFile above),
  # so it is specific enough to rule that out.
  $Read = Invoke-Support -SupportArguments @("read-heartbeat", "--state-root", $StateRoot, "--service", $Service)
  $ExistingPid = $null
  $ExistingObservedAt = $null
  if ($Read.Json.present) {
    if ($null -ne $Read.Json.record.pid) { $ExistingPid = [int]$Read.Json.record.pid }
    if ($Read.Json.record.observed_at) {
      try { $ExistingObservedAt = [datetime]$Read.Json.record.observed_at } catch { $ExistingObservedAt = $null }
    }
  }
  $Alive = Test-ProcessAlive -ProcessId $ExistingPid -NotStartedAfter $ExistingObservedAt -ExpectedCommandLineFragment $EntryPath

  $Decision = Invoke-Support -SupportArguments @(
    "decide", "--state-root", $StateRoot, "--service", $Service,
    "--process-alive", $(if ($Alive) { "true" } else { "false" }),
    "--max-heartbeat-age-ms", $MaxHeartbeatAgeMs
  )

  if ($Decision.Json.action -eq "reuse") {
    # Alive and fresh by the last tick's own account, but re-probe health now
    # instead of repeating whatever that heartbeat already claimed: a process
    # can stay alive while its listener wedges. Also require that the port's
    # real owner right now is the SAME pid Test-ProcessAlive just verified —
    # never report "ready" for a pid whose port some other process answers.
    $Healthy = Wait-TongsHealth -Uri $HealthUri -TimeoutSeconds 3
    $PortOwner = Get-TongsPortOwnerProcessId -ListenHostAddress $ListenHostAddress -ListenPort $ListenPort
    $Verified = $Healthy -and ($null -ne $PortOwner) -and ($PortOwner -eq $ExistingPid)
    $Status = if ($Verified) { "ready" } else { "degraded" }
    Assert-HeartbeatWritten (Invoke-Support -SupportArguments @(
      "write-heartbeat", "--state-root", $StateRoot, "--service", $Service,
      "--status", $Status, "--pid", $ExistingPid, "--listen", $Listen
    ))
    return [ordered]@{ service = $Service; action = "reuse"; reason = $Decision.Json.reason; pid = $ExistingPid; status = $Status }
  }

  Assert-HeartbeatWritten (Invoke-Support -SupportArguments @(
    "write-heartbeat", "--state-root", $StateRoot, "--service", $Service, "--status", "starting"
  ))

  $LogDirectory = Join-Path $StateRoot "operations\tongs\logs"
  New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
  $OutLog = Join-Path $LogDirectory "$Service.out.log"
  $ErrLog = Join-Path $LogDirectory "$Service.err.log"
  Invoke-TongsLogRotation -LogPath $OutLog -Keep $LogRotationKeep
  Invoke-TongsLogRotation -LogPath $ErrLog -Keep $LogRotationKeep

  $NewProcess = & $StartBlock $OutLog $ErrLog
  # A short, deterministic grace period: long enough for an immediate
  # EADDRINUSE crash to manifest as HasExited, short enough to stay well
  # under $HealthTimeoutSeconds for the genuine-success case.
  Start-Sleep -Milliseconds 400
  $NewProcess.Refresh()

  $Healthy = $false
  if (-not $NewProcess.HasExited) {
    $Healthy = Wait-TongsHealth -Uri $HealthUri -TimeoutSeconds $HealthTimeoutSeconds
    $NewProcess.Refresh()
  }

  $Action = "start"
  $Status = $null
  $ReportedPid = $NewProcess.Id
  if (-not $NewProcess.HasExited -and $Healthy) {
    $PortOwner = Get-TongsPortOwnerProcessId -ListenHostAddress $ListenHostAddress -ListenPort $ListenPort
    if ($PortOwner -eq $NewProcess.Id) { $Status = "ready" }
  }

  if ($null -eq $Status) {
    # The new child either already exited or never proved it owns the port.
    # Find out whether a still-healthy incumbent is squatting the port
    # instead of guessing: adopt it (never restart it) if verified, else
    # fail closed.
    $IncumbentPid = Get-TongsPortOwnerProcessId -ListenHostAddress $ListenHostAddress -ListenPort $ListenPort
    $IncumbentAlive = ($null -ne $IncumbentPid) -and ($IncumbentPid -ne $NewProcess.Id) `
      -and (Test-ProcessAlive -ProcessId $IncumbentPid -ExpectedCommandLineFragment $EntryPath)
    $IncumbentHealthy = $IncumbentAlive -and (Wait-TongsHealth -Uri $HealthUri -TimeoutSeconds 3)
    if ($IncumbentHealthy) {
      $Action = "adopt"
      $Status = "ready"
      $ReportedPid = $IncumbentPid
    } else {
      $Status = "error"
    }
  }

  Assert-HeartbeatWritten (Invoke-Support -SupportArguments @(
    "write-heartbeat", "--state-root", $StateRoot, "--service", $Service,
    "--status", $Status, "--pid", $ReportedPid, "--listen", $Listen
  ))
  return [ordered]@{ service = $Service; action = $Action; reason = $Decision.Json.reason; pid = $ReportedPid; status = $Status }
}

# 동시 실행 잠금: MultipleInstances=IgnoreNew가 Task Scheduler 자체 중복 실행은
# 막아 주지만, 수동 실행이 등록된 tick과 겹치거나 수동 실행 두 개가 겹치는
# 경우까지는 막지 못한다(둘 다 decide+spawn하면 M1과 같은 경합이 재현된다).
# 락을 못 얻으면 조용히, 실패로 취급하지 않고 종료한다 — 이미 다른 실행이
# 이 lane을 보고 있다는 뜻이기 때문이다.
$LockAcquired = $false
try {
  $LockResult = Invoke-Support -SupportArguments @("acquire-lock", "--state-root", $StateRoot, "--pid", "$PID")
  if (-not [bool]$LockResult.Json.acquired) {
    $LockedSummary = [ordered]@{
      schema_version = "soulforge.tongs_lane.run_summary.v1"
      ok             = $true
      locked_by_pid  = [int]$LockResult.Json.holder_pid
      results        = @()
    }
    Write-Output ($LockedSummary | ConvertTo-Json -Depth 6 -Compress)
    exit 0
  }
  $LockAcquired = $true

  $Results = @()

  $ErpListen = "$($ErpListenHost):$($ErpListenPort)"
  $Results += Sync-TongsService -Service "erp_mcp" -ListenHostAddress $ErpListenHost -ListenPort $ErpListenPort `
    -Listen $ErpListen -HealthUri "http://$ErpListen/health" -EntryPath $ErpEntry -StartBlock {
    param($OutLog, $ErrLog)
    Start-TongsChildProcess -OutLog $OutLog -ErrLog $ErrLog `
      -ChildArguments @((ConvertTo-ProcessArgument -Value $ErpEntry)) `
      -EnvironmentOverrides @{
        ERP_MCP_HOST                = $ErpListenHost
        ERP_MCP_PORT                = "$ErpListenPort"
        ERP_MCP_ERP_BASE_URL        = $ErpBaseUrl
        ERP_MCP_PUBLIC_URL          = "http://$ErpListen"
        # M3: this launcher pins loopback itself; an inherited "1" in the
        # logon session must never loosen a child it spawns.
        ERP_MCP_ALLOW_INSECURE_HTTP = "0"
      }
  }

  if ($IngressRequested) {
    $IngressListen = [string]$IngressPreflight.Json.resolved_listen
    if ($IngressPreflight.Json.ingress_enabled -eq $false) {
      # A structurally valid but disabled binding must never be spawned:
      # ingress_server.mjs throws ingress_mcp_feature_off before it ever
      # calls listen(), so spawning here only burns a full
      # HealthTimeoutSeconds wait every 5 minutes for a process that can
      # never come up (m5). Record the honest, intentional state instead.
      Assert-HeartbeatWritten (Invoke-Support -SupportArguments @(
        "write-heartbeat", "--state-root", $StateRoot, "--service", "ingress_mcp", "--status", "stopped"
      ))
      $Results += [ordered]@{ service = "ingress_mcp"; action = "skipped"; reason = "ingress_disabled"; pid = $null; status = "stopped" }
    } else {
      $IngressListenParts = $IngressListen.Split(":")
      $Results += Sync-TongsService -Service "ingress_mcp" -ListenHostAddress $IngressListenParts[0] `
        -ListenPort ([int]$IngressListenParts[1]) -Listen $IngressListen -HealthUri "http://$IngressListen/health" `
        -EntryPath $IngressEntry -StartBlock {
        param($OutLog, $ErrLog)
        Start-TongsChildProcess -OutLog $OutLog -ErrLog $ErrLog `
          -ChildArguments @(
            (ConvertTo-ProcessArgument -Value $IngressEntry),
            "--config",
            (ConvertTo-ProcessArgument -Value $IngressConfigPath)
          ) `
          -EnvironmentOverrides @{ ERP_MCP_ALLOW_INSECURE_HTTP = "0" }
      }
    }
  }

  # "degraded" also fails the overall run: a wedged listener that Task
  # Scheduler sees as a successful (exit 0) tick forever is a silent-failure
  # hole in exactly the same family as M1 (m3).
  $OverallOk = (@($Results | Where-Object { $_.status -eq "error" -or $_.status -eq "degraded" })).Count -eq 0
  $Summary = [ordered]@{
    schema_version = "soulforge.tongs_lane.run_summary.v1"
    ok             = $OverallOk
    results        = $Results
  }
  Write-Output ($Summary | ConvertTo-Json -Depth 6 -Compress)
  if (-not $OverallOk) { exit 1 }
  exit 0
} finally {
  if ($LockAcquired) {
    Invoke-Support -SupportArguments @("release-lock", "--state-root", $StateRoot, "--pid", "$PID") | Out-Null
  }
}
