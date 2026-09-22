[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
<#
  Registers the one scheduled task that runs the night chain:
  `SoulforgeNightChain`, daily at `-DailyAt` (default 00:30) local, hidden,
  running this lane's `ops/night_chain.mjs` against the Owner-controlled chain
  config named by `-ChainConfigPath` (pinned by `-ChainConfigSha256`). The
  chain config itself -- which lanes run, in what order, with what arguments
  -- is NOT an input of this registrar beyond that one file and its digest;
  every per-step lane manifest digest lives inside that config and is checked
  by the runner itself, before any step, on every run.

  `-DailyAt` defaults to 00:30 rather than 00:00/03:00/05:30 (the slots the
  three standalone tasks this chain is meant to replace use) so a transition
  period can hold both this task and a not-yet-unregistered standalone one
  without the two firing at the same minute. The Owner passes a different
  `-DailyAt` once the standalone tasks are retired.

  What it checks before it registers anything:
    * every path it was given is canonical and free of reparse points, and the
      lane root, the chain config's directory and the receipts root do not
      overlap
    * the lane's own manifest hashes to the digest the caller names, so the
      task is pinned to a built lane rather than to whatever is at that path
    * Node and the chain config each hash to the digest the caller names
    * the runner runs once in `--dry` mode and exits 0 -- a preflight that
      verifies the chain config digest and EVERY step's own lane manifest
      digest, resolves the plan, spawns no child, and writes nothing (not even
      the lock)
    * without -Register it stops here and prints the full plan (every value
      above, including `-DailyAt`/`-Deadline`) and a plan digest; -Register
      only proceeds when the caller passes that exact digest back

  After registering it re-reads the task's exported XML and checks the
  trigger, the action line (which carries every runner argument,
  `--chain-config`/`--chain-config-sha256`/`--deadline`/`--scheduled-start`
  included), the working directory, the principal and the settings against
  what it planned; anything that does not match rolls the task back to its
  previous definition (or removes it when there was none).

  It never starts the task, never writes into `--receipts` or any step's own
  receipts directory, and never calls a model. It is run from a non-packaged
  PowerShell session: a packaged session would register a task whose file
  writes land in that package's virtual store.
#>
param(
  [Parameter(Mandatory = $true)][string]$LaneRoot,
  [Parameter(Mandatory = $true)][string]$LaneManifestSha256,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$NodeSha256,
  [Parameter(Mandatory = $true)][string]$ChainConfigPath,
  [Parameter(Mandatory = $true)][string]$ChainConfigSha256,
  [Parameter(Mandatory = $true)][string]$ReceiptsRoot,
  [string]$TaskName = "SoulforgeNightChain",
  # HH:mm, local, every day. See the header for why 00:30 and not 00:00.
  [string]$DailyAt = "00:30",
  # HH:mm, local; passed through to the runner's own `--deadline` verbatim,
  # always together with `--scheduled-start <-DailyAt>` (never a separately
  # typed value, so the two cannot drift). Left unset, no `--deadline` reaches
  # the runner at all.
  [string]$Deadline,
  [string]$ExpectedDryRunDigest,
  [string]$ExpectedExistingTaskSha256,
  [switch]$Register
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Same rule the voice registrar applies (S2, 2026-09-21 review): equal to
# -DailyAt, the runner would anchor the deadline to "the next occurrence of
# that same time" -- a full day later -- silently granting a 24-hour runway.
if ($Deadline -and $Deadline -eq $DailyAt) {
  throw "night chain -Deadline must not equal -DailyAt (it would silently grant a 24-hour runway)"
}

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "night chain path contains a reparse point: $Cursor"
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
  if (-not (Test-Path -LiteralPath $Absolute -PathType Container)) { throw "night chain directory is missing: $Absolute" }
  $Resolved = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Absolute -Force).FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) { throw "night chain directory is not canonical" }
  return $Resolved
}

function Resolve-CanonicalFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Leaf)) { throw "night chain file is missing: $Absolute" }
  $Item = Get-Item -LiteralPath $Absolute -Force
  if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "night chain file is a reparse point" }
  $Resolved = [IO.Path]::GetFullPath($Item.FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) { throw "night chain file is not canonical" }
  return $Resolved
}

function Test-SameOrChildPath {
  param([Parameter(Mandatory = $true)][string]$Parent, [Parameter(Mandatory = $true)][string]$Candidate)
  $Trimmed = $Parent.TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
  if ($Candidate.Equals($Trimmed, [StringComparison]::OrdinalIgnoreCase)) { return $true }
  return $Candidate.StartsWith($Trimmed + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-DisjointPath {
  param([Parameter(Mandatory = $true)][string]$Left, [Parameter(Mandatory = $true)][string]$Right)
  if ((Test-SameOrChildPath -Parent $Left -Candidate $Right) -or (Test-SameOrChildPath -Parent $Right -Candidate $Left)) {
    throw "night chain roots overlap: $Left and $Right"
  }
}

function Assert-Sha256 {
  param([Parameter(Mandatory = $true)][string]$Value, [Parameter(Mandatory = $true)][string]$Label)
  if ($Value -notmatch '^sha256:[0-9a-f]{64}$') { throw "$Label digest is invalid" }
}

# Same "HH:mm" shape the runner's own `--deadline`/`--scheduled-start` regex
# expects (00-23 hours, 00-59 minutes); checked here too so a malformed value
# is a registration-time error, not something only the dry preflight catches.
function Assert-HHmm {
  param([Parameter(Mandatory = $true)][string]$Value, [Parameter(Mandatory = $true)][string]$Label)
  if ($Value -notmatch '^([01][0-9]|2[0-3]):[0-5][0-9]$') { throw "$Label must be HH:mm (00:00-23:59)" }
}

function Get-Sha256File {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { return "sha256:" + ([BitConverter]::ToString($Hasher.ComputeHash($Stream))).Replace("-", "").ToLowerInvariant() }
    finally { $Hasher.Dispose() }
  } finally { $Stream.Dispose() }
}

function Get-Sha256Text {
  param([Parameter(Mandatory = $true)][string]$Value)
  $Hasher = [Security.Cryptography.SHA256]::Create()
  try {
    $Bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return "sha256:" + ([BitConverter]::ToString($Hasher.ComputeHash($Bytes))).Replace("-", "").ToLowerInvariant()
  } finally { $Hasher.Dispose() }
}

function ConvertTo-TaskArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains('"')) { throw "task argument contains an unsupported quote character" }
  if ($Value -notmatch '\s') { return $Value }
  return '"' + ($Value -replace '(\\+)$', '$1$1') + '"'
}

function ConvertTo-SingleQuotedLiteral {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

function Get-XmlNodeText {
  param([System.Xml.XmlNode]$Parent, [Parameter(Mandatory = $true)][string]$XPath, [string]$DefaultValue = "")
  if ($null -eq $Parent) { return $DefaultValue }
  $Node = $Parent.SelectSingleNode($XPath)
  if ($null -eq $Node) { return $DefaultValue }
  return [string]$Node.InnerText
}

if ($TaskName -ne "SoulforgeNightChain") { throw "night chain task name is fixed" }
foreach ($Spec in @(
  @{ Value = $LaneManifestSha256; Label = "lane manifest" },
  @{ Value = $NodeSha256; Label = "Node" },
  @{ Value = $ChainConfigSha256; Label = "chain config" }
)) { Assert-Sha256 -Value $Spec.Value -Label $Spec.Label }
Assert-HHmm -Value $DailyAt -Label "-DailyAt"
if ($Deadline) { Assert-HHmm -Value $Deadline -Label "-Deadline" }

$LaneRoot = Resolve-CanonicalDirectory -Path $LaneRoot
$NodePath = Resolve-CanonicalFile -Path $NodePath
$ChainConfigPath = Resolve-CanonicalFile -Path $ChainConfigPath
$ReceiptsRoot = [IO.Path]::GetFullPath($ReceiptsRoot)
Assert-NoReparsePath -Path $ReceiptsRoot
$LaneManifest = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "LANE_MANIFEST.sha256")
$Entry = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "guild_hall\context_engine\ops\night_chain.mjs")
$HiddenLauncher = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "guild_hall\context_engine\ops\run-night-chain-hidden.vbs")

Assert-DisjointPath -Left $LaneRoot -Right $ReceiptsRoot
Assert-DisjointPath -Left $LaneRoot -Right ([IO.Path]::GetDirectoryName($ChainConfigPath))

$ActualLaneManifestSha256 = Get-Sha256File -Path $LaneManifest
if ($ActualLaneManifestSha256 -ne $LaneManifestSha256) { throw "night chain lane manifest SHA-256 changed" }
$ActualNodeSha256 = Get-Sha256File -Path $NodePath
if ($ActualNodeSha256 -ne $NodeSha256) { throw "night chain Node SHA-256 changed" }
$ActualChainConfigSha256 = Get-Sha256File -Path $ChainConfigPath
if ($ActualChainConfigSha256 -ne $ChainConfigSha256) { throw "night chain config SHA-256 changed" }

# `--node-path` is this registrar's own verified Node, so every step the chain
# spawns runs under the exact binary pinned by `-NodeSha256`, not whatever
# `process.execPath` the task's own environment happened to resolve.
$RunnerArguments = @(
  "--chain-config", $ChainConfigPath,
  "--chain-config-sha256", $ChainConfigSha256,
  "--receipts", $ReceiptsRoot,
  "--node-path", $NodePath
)
# `--scheduled-start` is always `-DailyAt` itself (see the voice registrar's
# own note): a late-starting run's deadline must be pinned to when it was
# *scheduled* to start, never to a separately typed value.
if ($Deadline) {
  $RunnerArguments += @("--deadline", $Deadline, "--scheduled-start", $DailyAt)
}

# Preflight: the same entry point, in the mode that spawns nothing and writes
# nothing -- not even the lock. `$LASTEXITCODE` is captured into its own
# variable before anything else can touch it. $ErrorActionPreference is
# lowered around this one `2>&1` native call (the same fix the workspace
# ledgers registrar carries): under "Stop", PowerShell 5.1 turns any stderr
# line from node -- exactly what the runner prints on a refusal, e.g.
# `[night-chain] night_chain_config_sha256_mismatch` -- into a terminating
# NativeCommandError that pre-empts the specific throw below.
$PriorErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $PreflightOutput = @(& $NodePath $Entry @RunnerArguments "--dry" 2>&1)
  $PreflightExitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $PriorErrorActionPreference
}
if ($PreflightExitCode -ne 0) {
  throw "night chain dry preflight failed (exit $PreflightExitCode): $($PreflightOutput -join ' ')"
}

$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)
$WScriptExe = Join-Path $env:WINDIR "System32\wscript.exe"
# R1a-1 / R1 (2026-09-21 review, voice registrar): `powershell.exe -Command
# "& node ..."` does NOT propagate the native command's exit code as its own,
# and when node cannot even be launched `&` never sets `$LASTEXITCODE` (so a
# bare `exit $LASTEXITCODE` is `exit $null` = 0). The trailing single-quoted
# literal below guards the null case first, then propagates the real code --
# every value this runner returns (0/2/3/4/5/6) reaches Task Scheduler as-is.
$CommandScript = "& " + (ConvertTo-SingleQuotedLiteral -Value $NodePath) + " " `
  + (ConvertTo-SingleQuotedLiteral -Value $Entry) + " " `
  + (($RunnerArguments | ForEach-Object { ConvertTo-SingleQuotedLiteral -Value ([string]$_) }) -join " ") `
  + '; if ($null -eq $LASTEXITCODE) { exit 1 }; exit $LASTEXITCODE'
$HiddenActionArgumentLine = (@(
  "//B", "//NoLogo", $HiddenLauncher, $PowerShellExe,
  "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass",
  "-Command", $CommandScript
) | ForEach-Object { ConvertTo-TaskArgument -Value ([string]$_) }) -join " "

$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$TaskFile = Join-Path $env:WINDIR "System32\Tasks\$TaskName"
$ActualExistingTaskSha256 = $null
$ExistingTaskXml = $null
$ExistingTaskXmlSha256 = $null
if ($Existing) {
  if ($Existing.State -eq "Running") { throw "the existing night chain task is still running" }
  if (-not $ExpectedExistingTaskSha256 -or $ExpectedExistingTaskSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "replacing the existing night chain task requires its exact SHA-256"
  }
  if (-not (Test-Path -LiteralPath $TaskFile -PathType Leaf)) { throw "the existing night chain task file is unavailable" }
  $ActualExistingTaskSha256 = (Get-Sha256File -Path $TaskFile).Substring(7).ToUpperInvariant()
  if ($ActualExistingTaskSha256 -ne $ExpectedExistingTaskSha256.ToUpperInvariant()) {
    throw "the existing night chain task SHA-256 changed"
  }
  $ExistingTaskXml = Export-ScheduledTask -TaskName $TaskName
  $ExistingTaskXmlSha256 = Get-Sha256Text -Value $ExistingTaskXml
}

$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$CurrentUser = $CurrentIdentity.Name
$CurrentSid = $CurrentIdentity.User.Value
$DailyAtParts = $DailyAt.Split(":")
$DailyAtBoundary = [DateTime]::Today.AddHours([int]$DailyAtParts[0]).AddMinutes([int]$DailyAtParts[1])
# S6 (2026-09-21 review): a StartBoundary already behind today plus
# -StartWhenAvailable can fire right after registration -- rolled forward to
# the next future occurrence. The attestation below compares time-of-day only.
if ($DailyAtBoundary -le (Get-Date)) { $DailyAtBoundary = $DailyAtBoundary.AddDays(1) }
$Trigger = New-ScheduledTaskTrigger -Daily -At $DailyAtBoundary
function Get-LocalTimeOfDay {
  param([Parameter(Mandatory = $true)][string]$Boundary)
  return ([DateTimeOffset]::Parse($Boundary, [Globalization.CultureInfo]::InvariantCulture)).ToLocalTime().ToString("HH:mm:ss")
}
$ExpectedStartBoundaryTime = Get-LocalTimeOfDay -Boundary ([string]$Trigger.StartBoundary)
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
# PT8H: the chain's own lock stale window is the sum of every step's
# `timeout_minutes` plus 30 minutes; a whole night of voice cards + ledgers +
# attribution index + one graph-sync pass fits well inside eight hours, and
# the runner's own `--deadline` is what actually bounds it in practice.
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 8) `
  -StartWhenAvailable -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$Plan = [ordered]@{
  schema_version = "soulforge.night_chain_task.plan.v1"
  task_name = $TaskName
  trigger_kind = "calendar_daily"
  daily_at_start_boundary_time = $ExpectedStartBoundaryTime
  days_interval = 1
  execution_time_limit = "PT8H"
  hidden = $true
  multiple_instances = "IgnoreNew"
  run_level = "Limited"
  user_sid = $CurrentSid
  lane_manifest_sha256 = $LaneManifestSha256
  node_sha256 = $NodeSha256
  chain_config_sha256 = $ChainConfigSha256
  # No raw absolute path is put in this hashtable; `action_sha256` already
  # binds the exact command line (every path included).
  deadline = $(if ($Deadline) { $Deadline } else { $null })
  action_sha256 = Get-Sha256Text -Value ($WScriptExe + "`n" + $HiddenActionArgumentLine)
  existing_task_sha256 = $ActualExistingTaskSha256
  existing_task_xml_sha256 = $ExistingTaskXmlSha256
}
$PlanDigest = Get-Sha256Text -Value ($Plan | ConvertTo-Json -Depth 4 -Compress)

if (-not $Register) {
  Write-Output ("night chain task dry-run attested: plan_digest=$PlanDigest " `
    + "daily_at=$ExpectedStartBoundaryTime deadline=$($Plan.deadline) " `
    + "chain_config_sha256=$ChainConfigSha256 mutation=false")
  return
}
if (-not $ExpectedDryRunDigest -or $ExpectedDryRunDigest -ne $PlanDigest) {
  throw "night chain registration requires the matching dry-run plan digest"
}
if (-not $PSCmdlet.ShouldProcess($TaskName, "register the hidden daily night chain task")) {
  Write-Output "night chain task registration skipped"
  return
}

$Action = New-ScheduledTaskAction -Execute $WScriptExe -Argument $HiddenActionArgumentLine -WorkingDirectory $LaneRoot

try {
  $null = Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($Trigger) -Principal $Principal `
    -Settings $Settings -Force -ErrorAction Stop `
    -Description "Soulforge context engine: run the ordered night chain (each step only after the previous step's own receipt says success) from the sha256-pinned chain config. Local only; no network, no external transfer."

  $ExportedTaskXml = Export-ScheduledTask -TaskName $TaskName
  [xml]$RegisteredXml = $ExportedTaskXml
  $TaskNode = $RegisteredXml.SelectSingleNode("/*[local-name()='Task']")
  $TriggersNode = $TaskNode.SelectSingleNode("./*[local-name()='Triggers']")
  $SettingsNode = $TaskNode.SelectSingleNode("./*[local-name()='Settings']")
  $PrincipalNode = $TaskNode.SelectSingleNode("./*[local-name()='Principals']/*[local-name()='Principal']")
  $ExecNode = $TaskNode.SelectSingleNode("./*[local-name()='Actions']/*[local-name()='Exec']")
  $RegisteredTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  $TriggerNodes = @($TriggersNode.ChildNodes | Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element })
  $RegisteredStartBoundaryTime = ""
  $RegisteredDaysInterval = ""
  if ($TriggerNodes.Count -eq 1) {
    $RegisteredBoundaryText = Get-XmlNodeText -Parent $TriggerNodes[0] -XPath "./*[local-name()='StartBoundary']"
    if ($RegisteredBoundaryText -ne "") { $RegisteredStartBoundaryTime = Get-LocalTimeOfDay -Boundary $RegisteredBoundaryText }
    $RegisteredDaysInterval = Get-XmlNodeText -Parent $TriggerNodes[0] -XPath "./*[local-name()='ScheduleByDay']/*[local-name()='DaysInterval']"
  }
  $RegisteredRunLevel = Get-XmlNodeText -Parent $PrincipalNode -XPath "./*[local-name()='RunLevel']"
  $RegisteredRunLevelValid = $RegisteredRunLevel -eq "LeastPrivilege" `
    -or ($RegisteredRunLevel -eq "" -and [string]$RegisteredTask.Principal.RunLevel -eq "Limited")
  $RegisteredPrincipalUserId = Get-XmlNodeText -Parent $PrincipalNode -XPath "./*[local-name()='UserId']" `
    -DefaultValue ([string]$RegisteredTask.Principal.UserId)
  $RegistrationValid = $TriggerNodes.Count -eq 1 `
    -and $TriggerNodes[0].LocalName -eq "CalendarTrigger" `
    -and $RegisteredStartBoundaryTime -eq $ExpectedStartBoundaryTime `
    -and $RegisteredDaysInterval -eq "1" `
    -and (Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='MultipleInstancesPolicy']") -eq "IgnoreNew" `
    -and (Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='Hidden']") -eq "true" `
    -and (Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='ExecutionTimeLimit']") -eq "PT8H" `
    -and $RegisteredRunLevelValid `
    -and ($RegisteredPrincipalUserId -eq $CurrentSid -or $RegisteredPrincipalUserId -eq $CurrentUser) `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Command']") -eq $WScriptExe `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Arguments']") -eq $HiddenActionArgumentLine `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='WorkingDirectory']") -eq $LaneRoot
  if (-not $RegistrationValid) { throw "the registered night chain task failed exported XML attestation" }
  Write-Output ("night chain task registered and XML-attested: daily_at=$ExpectedStartBoundaryTime " `
    + "deadline=$($Plan.deadline) chain_config_sha256=$ChainConfigSha256 " `
    + "exported_xml_sha256=" + (Get-Sha256Text -Value $ExportedTaskXml))
} catch {
  $RegistrationFailure = $_
  $RollbackFailure = $null
  try {
    if ($null -ne $ExistingTaskXml) {
      $null = Register-ScheduledTask -TaskName $TaskName -Xml $ExistingTaskXml -Force -ErrorAction Stop
      if ((Get-Sha256Text -Value (Export-ScheduledTask -TaskName $TaskName)) -ne $ExistingTaskXmlSha256) {
        throw "the restored night chain task XML differs from the prior definition"
      }
    } else {
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
      }
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { throw "the new night chain task remained after rollback" }
    }
  } catch {
    $RollbackFailure = $_
    Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  }
  if ($null -ne $RollbackFailure) { throw "night chain registration failed and rollback failed; the task was disabled" }
  throw "night chain registration failed; the prior definition was restored or the new task removed: $($RegistrationFailure.Exception.Message)"
}
