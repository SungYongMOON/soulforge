<#
.SYNOPSIS
  Registers the fixed Scheduled Task "Soulforge-Tongs-Loopback-v1" that runs
  ops/run-tongs-loopback.ps1 at logon and every 5 minutes thereafter.

.DESCRIPTION
  Mirrors guild_hall/linear_history/ops/register-linear-collect-hpp-task.ps1's
  canonical-path resolution, no-network preflight gate, hidden wscript action
  construction, and post-registration XML attestation with rollback-on-
  failure. Two differences on purpose:

    - Trigger shape: AtLogOn plus an indefinite 5-minute repetition (a
      relaunch opportunity for the reuse-vs-restart supervisor in
      run-tongs-loopback.ps1), not a fixed time-repeating collector interval.
    - If "Soulforge-Tongs-Loopback-v1" already exists, this script only
      reports its current state and stops. It never replaces or updates an
      existing task (unlike the linear script's confirmed-SHA256 replace
      path); removing or changing an existing registration is a separate,
      explicit action outside this script's scope.

  -DryRun (the default whenever -Register is not also given) only computes
  and prints the attested plan digest; it registers nothing. Real
  registration requires -Register, -DryRun:$false, and the caller supplying
  -ExpectedDryRunDigest that matches this exact plan, exactly like the linear
  script's gate. Every path this script mutates is Task Scheduler's own
  store; it never writes into $LaneRoot, $StateRoot, or any bearer/token
  file, and it never reads or prints a secret/credential value (an
  -IngressConfigPath, if given, is structural binding JSON with no bearer
  token in it; see ../schema/ingress_mcp_binding.v1.schema.json).
#>

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
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
  [string]$TaskName = "Soulforge-Tongs-Loopback-v1",
  [string]$ExpectedDryRunDigest,
  [switch]$DryRun,
  [switch]$Register
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($TaskName -ne "Soulforge-Tongs-Loopback-v1") {
  throw "tongs loopback task name is fixed"
}

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "tongs registration path contains a reparse point: $Cursor"
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
    throw "tongs registration required directory is missing: $Absolute"
  }
  return $Absolute
}

function Resolve-CanonicalFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Leaf)) {
    throw "tongs registration required file is missing: $Absolute"
  }
  return $Absolute
}

function Resolve-PlannedDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  $Cursor = $Absolute
  while (-not (Test-Path -LiteralPath $Cursor)) {
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) { throw "tongs registration state root has no existing ancestor: $Absolute" }
    $Cursor = $Parent.FullName
  }
  Assert-NoReparsePath -Path $Cursor
  return $Absolute
}

function Get-Sha256File {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($Hasher.ComputeHash($Stream))).Replace("-", "").ToLowerInvariant() }
    finally { $Hasher.Dispose() }
  } finally { $Stream.Dispose() }
}

function Get-Sha256Text {
  param([Parameter(Mandatory = $true)][string]$Value)
  $Bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $Hasher = [Security.Cryptography.SHA256]::Create()
  try { return "sha256:" + ([BitConverter]::ToString($Hasher.ComputeHash($Bytes))).Replace("-", "").ToLowerInvariant() }
  finally { $Hasher.Dispose() }
}

function ConvertTo-TaskArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains('"')) { throw "tongs registration argument contains an unsupported quote character" }
  if ($Value -notmatch '\s') { return $Value }
  $Escaped = $Value -replace '(\\+)$', '$1$1'
  return '"' + $Escaped + '"'
}

function Get-XmlNodeText {
  param([System.Xml.XmlNode]$Parent, [Parameter(Mandatory = $true)][string]$XPath, [string]$DefaultValue = "")
  if ($null -eq $Parent) { return $DefaultValue }
  $Node = $Parent.SelectSingleNode($XPath)
  if ($null -eq $Node) { return $DefaultValue }
  return [string]$Node.InnerText
}

# ---- resolve and validate every path this task's action will reference ----
$LaneRoot = Resolve-CanonicalDirectory -Path $LaneRoot
$StateRoot = Resolve-PlannedDirectory -Path $StateRoot
$NodePath = Resolve-CanonicalFile -Path $NodePath
$AppRoot = Resolve-CanonicalDirectory -Path (Join-Path $LaneRoot "ui-workspace\apps\dev-erp-mcp")
$OpsRoot = Resolve-CanonicalDirectory -Path (Join-Path $AppRoot "ops")
$Launcher = Resolve-CanonicalFile -Path (Join-Path $OpsRoot "run-tongs-loopback.ps1")
$HiddenLauncher = Resolve-CanonicalFile -Path (Join-Path $OpsRoot "run-tongs-hidden.vbs")
$null = Resolve-CanonicalFile -Path (Join-Path $OpsRoot "tongs_lane_support.mjs")
$null = Resolve-CanonicalFile -Path (Join-Path $AppRoot "server.mjs")

$IngressRequested = -not [string]::IsNullOrEmpty($IngressConfigPath)
if ($IngressRequested) {
  $IngressConfigPath = Resolve-CanonicalFile -Path $IngressConfigPath
  $null = Resolve-CanonicalFile -Path (Join-Path $AppRoot "ingress_server.mjs")
}

$LauncherSha256 = Get-Sha256File -Path $Launcher
$HiddenLauncherSha256 = Get-Sha256File -Path $HiddenLauncher
$IngressConfigSha256 = $null
if ($IngressRequested) { $IngressConfigSha256 = Get-Sha256File -Path $IngressConfigPath }

# ---- no-network preflight gate: refuse to register a lane that cannot even pass -Preflight ----
$LauncherArguments = [Collections.Generic.List[string]]::new()
$LauncherArguments.AddRange([string[]]@(
  "-LaneRoot", $LaneRoot,
  "-StateRoot", $StateRoot,
  "-NodePath", $NodePath,
  "-ErpListenHost", $ErpListenHost,
  "-ErpListenPort", "$ErpListenPort",
  "-ErpBaseUrl", $ErpBaseUrl,
  "-MaxHeartbeatAgeMs", "$MaxHeartbeatAgeMs",
  "-HealthTimeoutSeconds", "$HealthTimeoutSeconds"
))
if ($IngressRequested) { $LauncherArguments.AddRange([string[]]@("-IngressConfigPath", $IngressConfigPath)) }

$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)

$PreflightArguments = @("-File", $Launcher) + $LauncherArguments.ToArray() + @("-Preflight")
$PreflightOutput = @(& $PowerShellExe -NoProfile -NonInteractive -ExecutionPolicy Bypass @PreflightArguments 2>&1)
$PreflightExitCode = $LASTEXITCODE
try {
  $Preflight = ($PreflightOutput -join [Environment]::NewLine) | ConvertFrom-Json
} catch {
  throw "tongs loopback no-network preflight returned invalid aggregate output"
}
if ($PreflightExitCode -ne 0 -or $Preflight.ok -ne $true -or $Preflight.network_used -ne $false) {
  throw "tongs loopback no-network preflight did not attest the lane (ok=$($Preflight.ok))"
}

# ---- build the fixed hidden action: wscript -> run-tongs-hidden.vbs -> powershell -File run-tongs-loopback.ps1 ----
$CommandArguments = @(
  "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass",
  "-File", $Launcher
) + $LauncherArguments.ToArray()
$HiddenActionArgumentLine = (@(
  "//B", "//NoLogo", $HiddenLauncher, $PowerShellExe
) + $CommandArguments | ForEach-Object { ConvertTo-TaskArgument -Value ([string]$_) }) -join " "
$WScriptExe = Join-Path $env:WINDIR "System32\wscript.exe"
$ActionSha256 = Get-Sha256Text -Value ($WScriptExe + "`n" + $HiddenActionArgumentLine)

# ---- existing-task handling: report, never replace ----
$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Existing) {
  $Info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
  $Report = [ordered]@{
    schema_version = "soulforge.tongs_lane.registration_report.v1"
    outcome        = "already_registered"
    task_name      = $TaskName
    task_state     = ([string]$Existing.State).ToLowerInvariant()
    last_run_time  = $(if ($Info) { [string]$Info.LastRunTime } else { $null })
    last_result    = $(if ($Info) { [int64]$Info.LastTaskResult } else { $null })
  }
  Write-Output ($Report | ConvertTo-Json -Depth 4 -Compress)
  Write-Output "Soulforge-Tongs-Loopback-v1 is already registered; this script reports state and makes no change. Disable/unregister it yourself first if a real change is intended."
  return
}

$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$CurrentUser = $CurrentIdentity.Name
$CurrentSid = $CurrentIdentity.User.Value
$Plan = [ordered]@{
  schema_version          = "soulforge.tongs_lane.registration_plan.v1"
  task_name               = $TaskName
  trigger_kind            = "at_logon_plus_repetition"
  repetition_interval     = "PT5M"
  user_sid                = $CurrentSid
  lane_root               = $LaneRoot
  state_root              = $StateRoot
  erp_listen              = "$($ErpListenHost):$($ErpListenPort)"
  ingress_requested        = $IngressRequested
  launcher_sha256         = $LauncherSha256
  hidden_launcher_sha256  = $HiddenLauncherSha256
  ingress_config_sha256   = $IngressConfigSha256
  action_sha256           = $ActionSha256
}
$PlanDigest = Get-Sha256Text -Value ($Plan | ConvertTo-Json -Depth 4 -Compress)

$EffectiveDryRun = (-not $Register) -or $DryRun
if ($EffectiveDryRun) {
  Write-Output "tongs loopback task dry-run attested: plan_digest=$PlanDigest trigger=at_logon+PT5M mutation=false"
  return
}
if (-not $ExpectedDryRunDigest -or $ExpectedDryRunDigest -notmatch '^sha256:[0-9a-f]{64}$' -or $ExpectedDryRunDigest -ne $PlanDigest) {
  throw "tongs loopback registration requires the matching dry-run plan digest"
}
if (-not $PSCmdlet.ShouldProcess($TaskName, "register the hidden logon+5-minute Tongs loopback task")) {
  Write-Output "tongs loopback task registration skipped"
  return
}

$Action = New-ScheduledTaskAction -Execute $WScriptExe -Argument $HiddenActionArgumentLine -WorkingDirectory $AppRoot
# -AtLogOn has no -RepetitionInterval parameter set of its own; the
# documented workaround is to harvest a throwaway "Once" trigger's Repetition
# CIM instance and copy it onto the real trigger.
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$RepetitionSource = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
$Trigger.Repetition = $RepetitionSource.Repetition
$Trigger.Repetition.StopAtDurationEnd = $false
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden

try {
  $null = Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal `
    -Settings $Settings `
    -Description "Soulforge Tongs(MCP 문) loopback lane: personal ERP MCP (+ ingress MCP when configured), self-healing recheck every 5 minutes." `
    -Force -ErrorAction Stop

  $ExportedTaskXml = Export-ScheduledTask -TaskName $TaskName
  [xml]$RegisteredXml = $ExportedTaskXml
  $TaskNode = $RegisteredXml.SelectSingleNode("/*[local-name()='Task']")
  $TriggersNode = $TaskNode.SelectSingleNode("./*[local-name()='Triggers']")
  $SettingsNode = $TaskNode.SelectSingleNode("./*[local-name()='Settings']")
  $PrincipalNode = $TaskNode.SelectSingleNode("./*[local-name()='Principals']/*[local-name()='Principal']")
  $ExecNode = $TaskNode.SelectSingleNode("./*[local-name()='Actions']/*[local-name()='Exec']")
  $TriggerNodes = @($TriggersNode.ChildNodes | Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element })

  $RegisteredKind = $(if ($TriggerNodes.Count -eq 1) { $TriggerNodes[0].LocalName } else { $null })
  $RegisteredInterval = Get-XmlNodeText -Parent $(if ($TriggerNodes.Count -eq 1) { $TriggerNodes[0] } else { $null }) -XPath "./*[local-name()='Repetition']/*[local-name()='Interval']"
  $RegisteredStopAtDurationEnd = Get-XmlNodeText -Parent $(if ($TriggerNodes.Count -eq 1) { $TriggerNodes[0] } else { $null }) -XPath "./*[local-name()='Repetition']/*[local-name()='StopAtDurationEnd']"
  $RegisteredCommand = Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Command']"
  $RegisteredArguments = Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Arguments']"
  $RegisteredWorkingDirectory = Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='WorkingDirectory']"
  $RegisteredHidden = Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='Hidden']"
  $RegisteredMultipleInstances = Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='MultipleInstancesPolicy']"
  $RegisteredLogon = Get-XmlNodeText -Parent $PrincipalNode -XPath "./*[local-name()='LogonType']"

  $RegistrationValid = $TriggerNodes.Count -eq 1 `
    -and $RegisteredKind -eq "LogonTrigger" `
    -and $RegisteredInterval -eq "PT5M" `
    -and $RegisteredStopAtDurationEnd -ne "true" `
    -and $RegisteredHidden -eq "true" `
    -and $RegisteredMultipleInstances -eq "IgnoreNew" `
    -and $RegisteredLogon -eq "InteractiveToken" `
    -and $RegisteredCommand -eq $WScriptExe `
    -and $RegisteredArguments -eq $HiddenActionArgumentLine `
    -and $RegisteredWorkingDirectory -eq $AppRoot
  if (-not $RegistrationValid) { throw "registered tongs loopback task failed exported XML attestation" }

  $ExportedTaskSha256 = Get-Sha256Text -Value $ExportedTaskXml
  Write-Output "tongs loopback task registered and XML-attested: trigger=at_logon+PT5M exported_xml_sha256=$ExportedTaskSha256"
  Write-Output "Next step (manual, not run by this script): re-run run-tongs-loopback.ps1 -Preflight with the same arguments once more against the live registration, per AGENTS.md's lane-transition rule."
} catch {
  $RegistrationFailure = $_
  try {
    $Created = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($Created) {
      Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    }
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
      throw "new tongs loopback task remained after rollback"
    }
  } catch {
    Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    throw "tongs loopback registration failed and rollback failed; the task was disabled: $($RegistrationFailure.Exception.Message)"
  }
  throw "tongs loopback registration failed; the new task was removed: $($RegistrationFailure.Exception.Message)"
}
