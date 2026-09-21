[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
<#
  Registers the one scheduled task that runs one night's worth of the voice
  conversation-list lane: `SoulforgeVoiceConversationList`, daily at
  `-DailyAt` (default 03:00) local, hidden, running this lane's
  `harness/voice_conversation_list_nightly.mjs` bounded to at most 40 sessions
  a night. `-Deadline` (HH:mm) and `-ChainReconcile` are optional: with
  neither given, this registers exactly the same shape it always has.

  What it checks before it registers anything:
    * every path it was given is canonical and free of reparse points, and the
      lane root and the receipts root (and, with `-ChainReconcile`, the
      reconcile receipts root) do not overlap
    * the lane's own manifest hashes to the digest the caller names, so the
      task is pinned to a built lane rather than to whatever is at that path
    * Node, the root table, the tools config and the pipeline config each hash
      to the digest the caller names
    * the nightly harness runs once in `--dry` mode and exits 0 -- a preflight
      that enumerates and classifies the plan (and, with `-ChainReconcile`,
      previews the reconcile + present chain too), calls no model, and writes
      nothing (not even the lock)
    * without -Register it stops here and prints the full plan (every value
      above, including `-DailyAt`/`-Deadline`/`-ChainReconcile` and its
      pass-through arguments) and a plan digest; -Register only proceeds when
      the caller passes that exact digest back

  After registering it re-reads the task's exported XML and checks the
  trigger, the action line (which carries every nightly-harness argument,
  `--deadline`/`--chain-reconcile`/its pass-through included), the working
  directory, the principal and the settings against what it planned; anything
  that does not match rolls the task back to its previous definition (or
  removes it when there was none).

  It never starts the task, never writes into `--receipts` or the pipeline's
  derived root, and never calls a model. It is run from a non-packaged
  PowerShell session: a packaged session would register a task whose file
  writes land in that package's virtual store.
#>
param(
  [Parameter(Mandatory = $true)][string]$LaneRoot,
  [Parameter(Mandatory = $true)][string]$LaneManifestSha256,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$NodeSha256,
  [Parameter(Mandatory = $true)][string]$RootTablePath,
  [Parameter(Mandatory = $true)][string]$RootTableSha256,
  [Parameter(Mandatory = $true)][string]$ToolsConfigPath,
  [Parameter(Mandatory = $true)][string]$ToolsConfigSha256,
  [Parameter(Mandatory = $true)][string]$PipelineConfigPath,
  [Parameter(Mandatory = $true)][string]$PipelineConfigSha256,
  [Parameter(Mandatory = $true)][string]$ReceiptsRoot,
  [string]$TaskName = "SoulforgeVoiceConversationList",
  # HH:mm, local, every day. Kept at the prior fixed value by default so a
  # caller that passes none of the new parameters registers exactly the same
  # task this registrar always has.
  [string]$DailyAt = "03:00",
  # HH:mm, local; passed through to the nightly harness's own `--deadline`
  # unverbatim. Left unset, no `--deadline` reaches the harness at all.
  [string]$Deadline,
  # Minutes before the (possibly `-Deadline`-anchored) deadline that this
  # pass will not *start* a new session; passed through to the harness's own
  # `--no-start-within` only when `-Deadline` is also given (S4, 2026-09-21
  # review). Left unset, the harness applies its own default.
  [string]$NoStartWithinMinutes,
  [switch]$ChainReconcile,
  [string]$ReconcileReceiptsRoot,
  [string]$LinearRoot,
  [string[]]$MailRoot,
  [string]$QuestionsCap,
  [string]$ExpectedDryRunDigest,
  [string]$ExpectedExistingTaskSha256,
  [switch]$Register
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# How many sessions one night may look at. Fixed here rather than a parameter:
# raising it is a lane-behaviour decision, not a registration-time choice, and
# the dry-run preflight below runs against this exact value.
$MaxSessions = "40"

if ($ChainReconcile -and -not $ReconcileReceiptsRoot) {
  throw "voice conversation list nightly -ChainReconcile requires -ReconcileReceiptsRoot"
}
if (-not $ChainReconcile -and ($ReconcileReceiptsRoot -or $LinearRoot -or $MailRoot -or $QuestionsCap)) {
  throw "voice conversation list nightly chain pass-through arguments require -ChainReconcile"
}
if (-not $Deadline -and $NoStartWithinMinutes) {
  throw "voice conversation list nightly -NoStartWithinMinutes requires -Deadline"
}
# S2 (2026-09-21 review): equal to -DailyAt, the harness would anchor the
# deadline to "the next occurrence of that same time" -- a full day later --
# silently granting this run a 24-hour runway instead of the same-night stop
# its own two values look like they should mean.
if ($Deadline -and $Deadline -eq $DailyAt) {
  throw "voice conversation list nightly -Deadline must not equal -DailyAt (it would silently grant a 24-hour runway)"
}

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "voice conversation list nightly path contains a reparse point: $Cursor"
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
  if (-not (Test-Path -LiteralPath $Absolute -PathType Container)) { throw "voice conversation list nightly directory is missing: $Absolute" }
  $Resolved = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Absolute -Force).FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) { throw "voice conversation list nightly directory is not canonical" }
  return $Resolved
}

function Resolve-CanonicalFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Leaf)) { throw "voice conversation list nightly file is missing: $Absolute" }
  $Item = Get-Item -LiteralPath $Absolute -Force
  if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "voice conversation list nightly file is a reparse point" }
  $Resolved = [IO.Path]::GetFullPath($Item.FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) { throw "voice conversation list nightly file is not canonical" }
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
    throw "voice conversation list nightly roots overlap: $Left and $Right"
  }
}

function Assert-Sha256 {
  param([Parameter(Mandatory = $true)][string]$Value, [Parameter(Mandatory = $true)][string]$Label)
  if ($Value -notmatch '^sha256:[0-9a-f]{64}$') { throw "$Label digest is invalid" }
}

# Same "HH:mm" shape the nightly harness's own `--deadline`/target-date
# arithmetic expects (00-23 hours, 00-59 minutes); checked here too so a
# malformed value is a registration-time error, not something only the
# harness's own dry preflight would have caught.
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

if ($TaskName -ne "SoulforgeVoiceConversationList") { throw "voice conversation list nightly task name is fixed" }
foreach ($Spec in @(
  @{ Value = $LaneManifestSha256; Label = "lane manifest" },
  @{ Value = $NodeSha256; Label = "Node" },
  @{ Value = $RootTableSha256; Label = "root table" },
  @{ Value = $ToolsConfigSha256; Label = "tools config" },
  @{ Value = $PipelineConfigSha256; Label = "pipeline config" }
)) { Assert-Sha256 -Value $Spec.Value -Label $Spec.Label }
Assert-HHmm -Value $DailyAt -Label "-DailyAt"
if ($Deadline) { Assert-HHmm -Value $Deadline -Label "-Deadline" }

$LaneRoot = Resolve-CanonicalDirectory -Path $LaneRoot
$NodePath = Resolve-CanonicalFile -Path $NodePath
$RootTablePath = Resolve-CanonicalFile -Path $RootTablePath
$ToolsConfigPath = Resolve-CanonicalFile -Path $ToolsConfigPath
$PipelineConfigPath = Resolve-CanonicalFile -Path $PipelineConfigPath
$ReceiptsRoot = [IO.Path]::GetFullPath($ReceiptsRoot)
Assert-NoReparsePath -Path $ReceiptsRoot
$LaneManifest = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "LANE_MANIFEST.sha256")
$Entry = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "guild_hall\context_engine\harness\voice_conversation_list_nightly.mjs")
$HiddenLauncher = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "guild_hall\context_engine\ops\run-voice-conversation-list-hidden.vbs")

Assert-DisjointPath -Left $LaneRoot -Right $ReceiptsRoot
Assert-DisjointPath -Left $LaneRoot -Right ([IO.Path]::GetDirectoryName($RootTablePath))
if ($ChainReconcile) {
  $ReconcileReceiptsRoot = [IO.Path]::GetFullPath($ReconcileReceiptsRoot)
  Assert-NoReparsePath -Path $ReconcileReceiptsRoot
  Assert-DisjointPath -Left $LaneRoot -Right $ReconcileReceiptsRoot
  Assert-DisjointPath -Left $ReceiptsRoot -Right $ReconcileReceiptsRoot
}

$ActualLaneManifestSha256 = Get-Sha256File -Path $LaneManifest
if ($ActualLaneManifestSha256 -ne $LaneManifestSha256) { throw "voice conversation list nightly lane manifest SHA-256 changed" }
$ActualNodeSha256 = Get-Sha256File -Path $NodePath
if ($ActualNodeSha256 -ne $NodeSha256) { throw "voice conversation list nightly Node SHA-256 changed" }
$ActualRootTableSha256 = Get-Sha256File -Path $RootTablePath
if ($ActualRootTableSha256 -ne $RootTableSha256) { throw "voice conversation list nightly root table SHA-256 changed" }
$ActualToolsConfigSha256 = Get-Sha256File -Path $ToolsConfigPath
if ($ActualToolsConfigSha256 -ne $ToolsConfigSha256) { throw "voice conversation list nightly tools config SHA-256 changed" }
$ActualPipelineConfigSha256 = Get-Sha256File -Path $PipelineConfigPath
if ($ActualPipelineConfigSha256 -ne $PipelineConfigSha256) { throw "voice conversation list nightly pipeline config SHA-256 changed" }

$NightlyArguments = @(
  "--root-table", $RootTablePath,
  "--root-table-sha256", $RootTableSha256,
  "--tools-config", $ToolsConfigPath,
  "--pipeline-config", $PipelineConfigPath,
  "--receipts", $ReceiptsRoot,
  "--max-sessions", $MaxSessions
)
# `--scheduled-start` is always `-DailyAt` itself, never a separate value a
# caller could let drift from the trigger this registrar actually registers:
# anchoring the harness's deadline to anything else would defeat the point
# (a late-starting run's deadline must be pinned to when it was *scheduled*
# to start, not to whenever this registrar's caller happened to also type).
if ($Deadline) {
  $NightlyArguments += @("--deadline", $Deadline, "--scheduled-start", $DailyAt)
  if ($NoStartWithinMinutes) { $NightlyArguments += @("--no-start-within", $NoStartWithinMinutes) }
}
if ($ChainReconcile) {
  $NightlyArguments += @("--chain-reconcile", "--reconcile-receipts", $ReconcileReceiptsRoot)
  if ($LinearRoot) { $NightlyArguments += @("--linear-root", $LinearRoot) }
  foreach ($OneMailRoot in $MailRoot) { $NightlyArguments += @("--mail-root", $OneMailRoot) }
  if ($QuestionsCap) { $NightlyArguments += @("--questions-cap", $QuestionsCap) }
}

# Preflight: the same entry point, in the mode that calls no model and writes
# nothing -- not even the lock.
$PreflightOutput = @(& $NodePath $Entry @NightlyArguments "--dry" 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw "voice conversation list nightly dry preflight failed: $($PreflightOutput -join ' ')"
}

$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)
$WScriptExe = Join-Path $env:WINDIR "System32\wscript.exe"
# R1a-1 (2026-09-21 review): `powershell.exe -Command "& node ..."` does NOT
# propagate the native command's own exit code as its own -- measured
# end to end through the hidden launcher, every non-zero code (SKIPPED_PAST_
# DEADLINE's 4 included) collapsed to a bare 1 without this. `&` sets
# `$LASTEXITCODE`; an explicit `exit` is what actually makes this
# `-Command` invocation (and so `wscript.exe`'s own wait, and Task
# Scheduler's own "last result") carry it. The trailing piece is built as
# its own single-quoted (unexpanded) literal so `$LASTEXITCODE` reaches the
# generated script text verbatim, not this registrar's own current value.
$CommandScript = "& " + (ConvertTo-SingleQuotedLiteral -Value $NodePath) + " " `
  + (ConvertTo-SingleQuotedLiteral -Value $Entry) + " " `
  + (($NightlyArguments | ForEach-Object { ConvertTo-SingleQuotedLiteral -Value ([string]$_) }) -join " ") `
  + "; exit " + '$LASTEXITCODE'
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
  if ($Existing.State -eq "Running") { throw "the existing voice conversation list nightly task is still running" }
  if (-not $ExpectedExistingTaskSha256 -or $ExpectedExistingTaskSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "replacing the existing voice conversation list nightly task requires its exact SHA-256"
  }
  if (-not (Test-Path -LiteralPath $TaskFile -PathType Leaf)) { throw "the existing voice conversation list nightly task file is unavailable" }
  $ActualExistingTaskSha256 = (Get-Sha256File -Path $TaskFile).Substring(7).ToUpperInvariant()
  if ($ActualExistingTaskSha256 -ne $ExpectedExistingTaskSha256.ToUpperInvariant()) {
    throw "the existing voice conversation list nightly task SHA-256 changed"
  }
  $ExistingTaskXml = Export-ScheduledTask -TaskName $TaskName
  $ExistingTaskXmlSha256 = Get-Sha256Text -Value $ExistingTaskXml
}

$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$CurrentUser = $CurrentIdentity.Name
$CurrentSid = $CurrentIdentity.User.Value
# `-DailyAt` local, every day (default 03:00, unchanged from before this
# parameter existed). The trigger object's own StartBoundary (whatever form
# the platform serialises it in) is what both the plan digest and the
# post-registration attestation compare against -- neither one hardcodes a
# time zone or a string format.
$DailyAtParts = $DailyAt.Split(":")
$DailyAtBoundary = [DateTime]::Today.AddHours([int]$DailyAtParts[0]).AddMinutes([int]$DailyAtParts[1])
# S6 (2026-09-21 review): a `StartBoundary` earlier today (registering after
# that time already passed today) combined with `-StartWhenAvailable` can
# make Task Scheduler treat today's already-passed boundary as a missed run
# and fire right after registration -- rolled forward to the next *future*
# occurrence instead. The post-registration attestation (`Get-LocalTimeOfDay`
# below) compares only the time-of-day, never the date, so this stays
# verifiable regardless of which calendar day the boundary itself lands on.
if ($DailyAtBoundary -le (Get-Date)) { $DailyAtBoundary = $DailyAtBoundary.AddDays(1) }
$Trigger = New-ScheduledTaskTrigger -Daily -At $DailyAtBoundary
# The in-memory trigger serialises its StartBoundary as UTC ("...T18:00:00Z") while the
# exported task XML carries local time with an offset ("...T03:00:00+09:00"), so both sides
# are parsed and compared as the local time of day rather than as raw substrings.
function Get-LocalTimeOfDay {
  param([Parameter(Mandatory = $true)][string]$Boundary)
  return ([DateTimeOffset]::Parse($Boundary, [Globalization.CultureInfo]::InvariantCulture)).ToLocalTime().ToString("HH:mm:ss")
}
$ExpectedStartBoundaryTime = Get-LocalTimeOfDay -Boundary ([string]$Trigger.StartBoundary)
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 6) `
  -StartWhenAvailable -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$Plan = [ordered]@{
  schema_version = "soulforge.voice_conversation_list_nightly_task.plan.v1"
  task_name = $TaskName
  trigger_kind = "calendar_daily"
  daily_at_start_boundary_time = $ExpectedStartBoundaryTime
  days_interval = 1
  execution_time_limit = "PT6H"
  hidden = $true
  multiple_instances = "IgnoreNew"
  run_level = "Limited"
  user_sid = $CurrentSid
  lane_manifest_sha256 = $LaneManifestSha256
  node_sha256 = $NodeSha256
  root_table_sha256 = $RootTableSha256
  tools_config_sha256 = $ToolsConfigSha256
  pipeline_config_sha256 = $PipelineConfigSha256
  max_sessions = $MaxSessions
  # A raw absolute path (`$ReconcileReceiptsRoot`) is never put in this
  # hashtable -- the same posture `$ReceiptsRoot` itself already has here.
  # `action_sha256` below already binds the exact command line (every
  # pass-through path and alias address included); this block only carries
  # what is safe to echo and what is not itself a host-local path.
  deadline = $(if ($Deadline) { $Deadline } else { $null })
  no_start_within_minutes = $(if ($NoStartWithinMinutes) { $NoStartWithinMinutes } else { $null })
  chain_reconcile = [bool]$ChainReconcile
  chain_reconcile_receipts_configured = [bool]$ReconcileReceiptsRoot
  chain_linear_root = $(if ($LinearRoot) { $LinearRoot } else { $null })
  # N3 (2026-09-21 review): PowerShell 5.1's ConvertTo-Json unwraps a
  # one-element array to its own bare element when assigned as a plain
  # hashtable value, and a zero-element array from an `if`/`else`
  # subexpression's empty-array branch collapses to no output at all (so the
  # whole property reads back as `$null`, serialising as JSON `null`) unless
  # that branch is comma-prefixed to force it to stay an array. `[object[]]`
  # on top forces real array serialisation (`[]`/`["x"]`/`["x","y"]`)
  # regardless of element count -- both fixes are needed together.
  chain_mail_roots = [object[]]$(if ($MailRoot) { @($MailRoot) } else { , @() })
  chain_questions_cap = $(if ($QuestionsCap) { $QuestionsCap } else { $null })
  action_sha256 = Get-Sha256Text -Value ($WScriptExe + "`n" + $HiddenActionArgumentLine)
  existing_task_sha256 = $ActualExistingTaskSha256
  existing_task_xml_sha256 = $ExistingTaskXmlSha256
}
$PlanDigest = Get-Sha256Text -Value ($Plan | ConvertTo-Json -Depth 4 -Compress)

if (-not $Register) {
  Write-Output ("voice conversation list nightly task dry-run attested: plan_digest=$PlanDigest " `
    + "daily_at=$ExpectedStartBoundaryTime max_sessions=$MaxSessions deadline=$($Plan.deadline) " `
    + "no_start_within_minutes=$($Plan.no_start_within_minutes) " `
    + "chain_reconcile=$($Plan.chain_reconcile) chain_linear_root=$($Plan.chain_linear_root) " `
    + "chain_mail_roots=$($Plan.chain_mail_roots -join ',') chain_questions_cap=$($Plan.chain_questions_cap) " `
    + "mutation=false")
  return
}
if (-not $ExpectedDryRunDigest -or $ExpectedDryRunDigest -ne $PlanDigest) {
  throw "voice conversation list nightly registration requires the matching dry-run plan digest"
}
if (-not $PSCmdlet.ShouldProcess($TaskName, "register the hidden daily voice conversation list nightly task")) {
  Write-Output "voice conversation list nightly task registration skipped"
  return
}

$Action = New-ScheduledTaskAction -Execute $WScriptExe -Argument $HiddenActionArgumentLine -WorkingDirectory $LaneRoot

try {
  $null = Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($Trigger) -Principal $Principal `
    -Settings $Settings -Force -ErrorAction Stop `
    -Description "Soulforge context engine: run one night's voice conversation-list pipeline over the sessions this host has not finished yet, bounded to $MaxSessions sessions. Local only; no network, no external transfer."

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
    -and (Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='ExecutionTimeLimit']") -eq "PT6H" `
    -and $RegisteredRunLevelValid `
    -and ($RegisteredPrincipalUserId -eq $CurrentSid -or $RegisteredPrincipalUserId -eq $CurrentUser) `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Command']") -eq $WScriptExe `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Arguments']") -eq $HiddenActionArgumentLine `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='WorkingDirectory']") -eq $LaneRoot
  if (-not $RegistrationValid) { throw "the registered voice conversation list nightly task failed exported XML attestation" }
  Write-Output ("voice conversation list nightly task registered and XML-attested: daily_at=$ExpectedStartBoundaryTime " `
    + "max_sessions=$MaxSessions deadline=$($Plan.deadline) chain_reconcile=$($Plan.chain_reconcile) " `
    + "exported_xml_sha256=" + (Get-Sha256Text -Value $ExportedTaskXml))
} catch {
  $RegistrationFailure = $_
  $RollbackFailure = $null
  try {
    if ($null -ne $ExistingTaskXml) {
      $null = Register-ScheduledTask -TaskName $TaskName -Xml $ExistingTaskXml -Force -ErrorAction Stop
      if ((Get-Sha256Text -Value (Export-ScheduledTask -TaskName $TaskName)) -ne $ExistingTaskXmlSha256) {
        throw "the restored voice conversation list nightly task XML differs from the prior definition"
      }
    } else {
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
      }
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { throw "the new voice conversation list nightly task remained after rollback" }
    }
  } catch {
    $RollbackFailure = $_
    Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  }
  if ($null -ne $RollbackFailure) { throw "voice conversation list nightly registration failed and rollback failed; the task was disabled" }
  throw "voice conversation list nightly registration failed; the prior definition was restored or the new task removed: $($RegistrationFailure.Exception.Message)"
}
