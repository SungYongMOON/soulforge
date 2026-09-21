[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
<#
  Registers the one scheduled task that runs the workspace_ledgers daily
  runner (`ops/daily_refresh.mjs`, refresh() for every onboarded project then
  refreshCommon() from ONE org config -- see the module README's "daily
  refresh lane" section): `SoulforgeWorkspaceLedgers`, daily at `-DailyAt` (default
  05:30 -- after the 00:00-04:00 voice lane and before a 06:40 briefing),
  hidden, running only when the user is logged on (same posture as the
  sibling voice/graph-sync lanes -- read their own registrars for the same
  Principal shape this one reuses).

  What it checks before it registers anything:
    * every path it was given is canonical and free of reparse points, and
      the lane root, the receipts root, the workspaces root, the workmeta
      root and the two custody roots are all pairwise disjoint from the lane
      root and from the receipts root (a lane rebuild must never write into
      the plane it reads, and a receipt write must never land inside the
      lane it came from)
    * the lane's own manifest hashes to the digest the caller names, so the
      task is pinned to a built lane rather than to whatever is at that path
    * Node and the org config each hash to the digest the caller names
    * the daily runner runs once in `--dry` mode and exits 0 -- a preflight
      that checks the org-config digest and the two roots and calls neither
      refresh() nor refreshCommon(), writing nothing (not even the daily
      lock -- see `ops/daily_refresh.mjs`'s own doc on what `--dry` does and
      deliberately does not do)
    * without -Register it stops here and prints the full plan (every value
      above, including `-DailyAt`) and a plan digest; -Register only
      proceeds when the caller passes that exact digest back

  After registering it re-reads the task's exported XML and checks the
  trigger, the action line (which carries every daily-runner argument), the
  working directory, the principal and the settings against what it planned;
  anything that does not match rolls the task back to its previous
  definition (or removes it when there was none).

  It never starts the task, never writes into `-ReceiptsRoot`, the
  workspaces/workmeta roots, or the custody roots, and never calls a model
  (this lane calls none). It is run from a non-packaged PowerShell session: a
  packaged session would register a task whose file writes land in that
  package's virtual store.
#>
param(
  [Parameter(Mandatory = $true)][string]$LaneRoot,
  [Parameter(Mandatory = $true)][string]$LaneManifestSha256,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$NodeSha256,
  [Parameter(Mandatory = $true)][string]$WorkspacesRoot,
  [Parameter(Mandatory = $true)][string]$WorkmetaRoot,
  [Parameter(Mandatory = $true)][string]$OrgConfigPath,
  [Parameter(Mandatory = $true)][string]$OrgConfigSha256,
  [Parameter(Mandatory = $true)][string]$HiworksEventsPath,
  [Parameter(Mandatory = $true)][string]$GmailSentEventsPath,
  [Parameter(Mandatory = $true)][string]$ReceiptsRoot,
  [string]$TaskName = "SoulforgeWorkspaceLedgers",
  # HH:mm, local, every day -- after the 00:00-04:00 voice conversation-list
  # lane and before a 06:40 briefing lane (Owner-set ordering; see the module
  # README's "daily refresh lane" section for why this slot).
  [string]$DailyAt = "05:30",
  [string]$ExpectedDryRunDigest,
  [string]$ExpectedExistingTaskSha256,
  [switch]$Register
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
        throw "workspace ledgers daily path contains a reparse point: $Cursor"
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
  if (-not (Test-Path -LiteralPath $Absolute -PathType Container)) { throw "workspace ledgers daily directory is missing: $Absolute" }
  $Resolved = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Absolute -Force).FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) { throw "workspace ledgers daily directory is not canonical" }
  return $Resolved
}

function Resolve-CanonicalFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Leaf)) { throw "workspace ledgers daily file is missing: $Absolute" }
  $Item = Get-Item -LiteralPath $Absolute -Force
  if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "workspace ledgers daily file is a reparse point" }
  $Resolved = [IO.Path]::GetFullPath($Item.FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) { throw "workspace ledgers daily file is not canonical" }
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
    throw "workspace ledgers daily roots overlap: $Left and $Right"
  }
}

function Assert-Sha256 {
  param([Parameter(Mandatory = $true)][string]$Value, [Parameter(Mandatory = $true)][string]$Label)
  if ($Value -notmatch '^sha256:[0-9a-f]{64}$') { throw "$Label digest is invalid" }
}

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

if ($TaskName -ne "SoulforgeWorkspaceLedgers") { throw "workspace ledgers daily task name is fixed" }
foreach ($Spec in @(
  @{ Value = $LaneManifestSha256; Label = "lane manifest" },
  @{ Value = $NodeSha256; Label = "Node" },
  @{ Value = $OrgConfigSha256; Label = "org config" }
)) { Assert-Sha256 -Value $Spec.Value -Label $Spec.Label }
Assert-HHmm -Value $DailyAt -Label "-DailyAt"

$LaneRoot = Resolve-CanonicalDirectory -Path $LaneRoot
$NodePath = Resolve-CanonicalFile -Path $NodePath
$WorkspacesRoot = Resolve-CanonicalDirectory -Path $WorkspacesRoot
$WorkmetaRoot = Resolve-CanonicalDirectory -Path $WorkmetaRoot
$OrgConfigPath = Resolve-CanonicalFile -Path $OrgConfigPath
$HiworksEventsPath = Resolve-CanonicalDirectory -Path $HiworksEventsPath
$GmailSentEventsPath = Resolve-CanonicalDirectory -Path $GmailSentEventsPath
$ReceiptsRoot = [IO.Path]::GetFullPath($ReceiptsRoot)
Assert-NoReparsePath -Path $ReceiptsRoot
$LaneManifest = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "LANE_MANIFEST.sha256")
$Entry = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "guild_hall\workspace_ledgers\ops\daily_refresh.mjs")
$HiddenLauncher = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "guild_hall\workspace_ledgers\ops\run-workspace-ledgers-hidden.vbs")

# A lane rebuild must never write into anything this task reads or writes,
# and a receipt/lock write must never land inside the lane itself. R4
# (2026-09-22 review): this header has always CLAIMED the two custody roots
# are checked disjoint too -- they were not, until now. Ported from the
# sibling voice/graph-sync registrars' own root-table check: the org config's
# own DIRECTORY (not the file itself, which -OrgConfigSha256 already pins)
# must also never sit inside the lane root.
Assert-DisjointPath -Left $LaneRoot -Right $ReceiptsRoot
Assert-DisjointPath -Left $LaneRoot -Right $WorkspacesRoot
Assert-DisjointPath -Left $LaneRoot -Right $WorkmetaRoot
Assert-DisjointPath -Left $LaneRoot -Right $HiworksEventsPath
Assert-DisjointPath -Left $LaneRoot -Right $GmailSentEventsPath
Assert-DisjointPath -Left $LaneRoot -Right ([IO.Path]::GetDirectoryName($OrgConfigPath))
Assert-DisjointPath -Left $ReceiptsRoot -Right $WorkspacesRoot
Assert-DisjointPath -Left $ReceiptsRoot -Right $WorkmetaRoot
Assert-DisjointPath -Left $ReceiptsRoot -Right $HiworksEventsPath
Assert-DisjointPath -Left $ReceiptsRoot -Right $GmailSentEventsPath

$ActualLaneManifestSha256 = Get-Sha256File -Path $LaneManifest
if ($ActualLaneManifestSha256 -ne $LaneManifestSha256) { throw "workspace ledgers daily lane manifest SHA-256 changed" }
$ActualNodeSha256 = Get-Sha256File -Path $NodePath
if ($ActualNodeSha256 -ne $NodeSha256) { throw "workspace ledgers daily Node SHA-256 changed" }
$ActualOrgConfigSha256 = Get-Sha256File -Path $OrgConfigPath
if ($ActualOrgConfigSha256 -ne $OrgConfigSha256) { throw "workspace ledgers daily org config SHA-256 changed" }

$DailyArguments = @(
  "--workspaces-root", $WorkspacesRoot,
  "--workmeta-root", $WorkmetaRoot,
  "--org-config", $OrgConfigPath,
  "--org-config-sha256", $OrgConfigSha256,
  "--hiworks-events", $HiworksEventsPath,
  "--gmail-sent-events", $GmailSentEventsPath,
  "--receipts", $ReceiptsRoot
)

# Preflight: the same entry point, in the mode that checks the org-config
# digest and the two roots and calls neither refresh() nor refreshCommon(),
# writing nothing -- not even the daily lock.
#
# Nit (2026-09-22 review): under `$ErrorActionPreference = "Stop"` (set at
# the top of this script), `2>&1` on a NATIVE command turns anything it
# writes to stderr into a terminating `NativeCommandError` -- the `throw`
# below, which is meant to surface the daily runner's own "dry preflight
# failed" message, never runs; PowerShell's own native-command error masks
# it instead. `$ErrorActionPreference` is lowered to "Continue" for the
# duration of this one call (native stderr is captured into $PreflightOutput
# either way -- see the tool notes this repo's own agents already use: "avoid
# 2>&1 on native executables ... stderr is already captured for you") and
# restored immediately after in a `finally`, so this stays fail-closed: the
# `$LASTEXITCODE` check right after still throws on any non-zero exit,
# with the daily runner's own real message intact this time.
$PriorErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $PreflightOutput = @(& $NodePath $Entry @DailyArguments "--dry" 2>&1)
} finally {
  $ErrorActionPreference = $PriorErrorActionPreference
}
if ($LASTEXITCODE -ne 0) {
  throw "workspace ledgers daily dry preflight failed: $($PreflightOutput -join ' ')"
}

$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)
$WScriptExe = Join-Path $env:WINDIR "System32\wscript.exe"
# R1/R1a (ported verbatim from `register-voice-conversation-list-task.ps1`,
# measured there end to end through the hidden launcher): `powershell.exe
# -Command "& node ..."` does NOT propagate the native command's own exit
# code as its own, and when node.exe cannot even be launched, `&` never sets
# `$LASTEXITCODE` at all, so a bare trailing `exit $LASTEXITCODE` reports a
# launch failure as a clean exit 0. This daily runner's own exit codes (0
# ok, 2 failed, 3 lock held, 4 refused) all need to survive this trip
# unchanged for a receipt-reading watcher or Task Scheduler's own "last
# result" to mean anything -- guarding first with `if ($null -eq
# $LASTEXITCODE) { exit 1 }` before the final `exit $LASTEXITCODE` is what
# makes that true. The whole trailing piece is one single-quoted
# (unexpanded) literal, so it reaches the generated script text verbatim.
$CommandScript = "& " + (ConvertTo-SingleQuotedLiteral -Value $NodePath) + " " `
  + (ConvertTo-SingleQuotedLiteral -Value $Entry) + " " `
  + (($DailyArguments | ForEach-Object { ConvertTo-SingleQuotedLiteral -Value ([string]$_) }) -join " ") `
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
  if ($Existing.State -eq "Running") { throw "the existing workspace ledgers daily task is still running" }
  if (-not (Test-Path -LiteralPath $TaskFile -PathType Leaf)) { throw "the existing workspace ledgers daily task file is unavailable" }
  # S4 (2026-09-22 review): computed BEFORE the -ExpectedExistingTaskSha256
  # check (reordered from before, which checked the caller's value first and
  # never computed this at all when it was missing) so an operator who omitted
  # -ExpectedExistingTaskSha256 gets the actual current digest printed right
  # in the error -- something to copy into the next invocation -- instead of a
  # message that only says a digest is required without saying what it is.
  $ActualExistingTaskSha256 = (Get-Sha256File -Path $TaskFile).Substring(7).ToUpperInvariant()
  if (-not $ExpectedExistingTaskSha256 -or $ExpectedExistingTaskSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "replacing the existing workspace ledgers daily task requires its exact SHA-256 (current: $ActualExistingTaskSha256)"
  }
  if ($ActualExistingTaskSha256 -ne $ExpectedExistingTaskSha256.ToUpperInvariant()) {
    throw "the existing workspace ledgers daily task SHA-256 changed (current: $ActualExistingTaskSha256)"
  }
  $ExistingTaskXml = Export-ScheduledTask -TaskName $TaskName
  $ExistingTaskXmlSha256 = Get-Sha256Text -Value $ExistingTaskXml
}

$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$CurrentUser = $CurrentIdentity.Name
$CurrentSid = $CurrentIdentity.User.Value
$DailyAtParts = $DailyAt.Split(":")
$DailyAtBoundary = [DateTime]::Today.AddHours([int]$DailyAtParts[0]).AddMinutes([int]$DailyAtParts[1])
# A `StartBoundary` earlier today (registering after that time already
# passed today) combined with `-StartWhenAvailable` can make Task Scheduler
# treat today's already-passed boundary as a missed run and fire right after
# registration -- rolled forward to the next future occurrence instead. The
# post-registration attestation below compares only the time-of-day, never
# the date, so this stays verifiable regardless of which calendar day the
# boundary itself lands on.
if ($DailyAtBoundary -le (Get-Date)) { $DailyAtBoundary = $DailyAtBoundary.AddDays(1) }
$Trigger = New-ScheduledTaskTrigger -Daily -At $DailyAtBoundary
function Get-LocalTimeOfDay {
  param([Parameter(Mandatory = $true)][string]$Boundary)
  return ([DateTimeOffset]::Parse($Boundary, [Globalization.CultureInfo]::InvariantCulture)).ToLocalTime().ToString("HH:mm:ss")
}
$ExpectedStartBoundaryTime = Get-LocalTimeOfDay -Boundary ([string]$Trigger.StartBoundary)
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -StartWhenAvailable -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$Plan = [ordered]@{
  schema_version = "soulforge.workspace_ledgers_daily_task.plan.v1"
  task_name = $TaskName
  trigger_kind = "calendar_daily"
  daily_at_start_boundary_time = $ExpectedStartBoundaryTime
  days_interval = 1
  execution_time_limit = "PT2H"
  hidden = $true
  multiple_instances = "IgnoreNew"
  run_level = "Limited"
  user_sid = $CurrentSid
  lane_manifest_sha256 = $LaneManifestSha256
  node_sha256 = $NodeSha256
  org_config_sha256 = $OrgConfigSha256
  action_sha256 = Get-Sha256Text -Value ($WScriptExe + "`n" + $HiddenActionArgumentLine)
  existing_task_sha256 = $ActualExistingTaskSha256
  existing_task_xml_sha256 = $ExistingTaskXmlSha256
}
$PlanDigest = Get-Sha256Text -Value ($Plan | ConvertTo-Json -Depth 4 -Compress)

if (-not $Register) {
  Write-Output ("workspace ledgers daily task dry-run attested: plan_digest=$PlanDigest " `
    + "daily_at=$ExpectedStartBoundaryTime mutation=false")
  return
}
if (-not $ExpectedDryRunDigest -or $ExpectedDryRunDigest -ne $PlanDigest) {
  throw "workspace ledgers daily registration requires the matching dry-run plan digest"
}
if (-not $PSCmdlet.ShouldProcess($TaskName, "register the hidden daily workspace ledgers task")) {
  Write-Output "workspace ledgers daily task registration skipped"
  return
}

$Action = New-ScheduledTaskAction -Execute $WScriptExe -Argument $HiddenActionArgumentLine -WorkingDirectory $LaneRoot

try {
  $null = Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($Trigger) -Principal $Principal `
    -Settings $Settings -Force -ErrorAction Stop `
    -Description "Soulforge workspace ledgers: rewrite every onboarded project's management CSVs then the common-folder ledgers, once a day, from one org config. Local only; no network, no external transfer."

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
    -and (Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='ExecutionTimeLimit']") -eq "PT2H" `
    -and $RegisteredRunLevelValid `
    -and ($RegisteredPrincipalUserId -eq $CurrentSid -or $RegisteredPrincipalUserId -eq $CurrentUser) `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Command']") -eq $WScriptExe `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Arguments']") -eq $HiddenActionArgumentLine `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='WorkingDirectory']") -eq $LaneRoot
  if (-not $RegistrationValid) { throw "the registered workspace ledgers daily task failed exported XML attestation" }
  Write-Output ("workspace ledgers daily task registered and XML-attested: daily_at=$ExpectedStartBoundaryTime " `
    + "exported_xml_sha256=" + (Get-Sha256Text -Value $ExportedTaskXml))
} catch {
  $RegistrationFailure = $_
  $RollbackFailure = $null
  try {
    if ($null -ne $ExistingTaskXml) {
      $null = Register-ScheduledTask -TaskName $TaskName -Xml $ExistingTaskXml -Force -ErrorAction Stop
      if ((Get-Sha256Text -Value (Export-ScheduledTask -TaskName $TaskName)) -ne $ExistingTaskXmlSha256) {
        throw "the restored workspace ledgers daily task XML differs from the prior definition"
      }
    } else {
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
      }
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { throw "the new workspace ledgers daily task remained after rollback" }
    }
  } catch {
    $RollbackFailure = $_
    Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  }
  if ($null -ne $RollbackFailure) { throw "workspace ledgers daily registration failed and rollback failed; the task was disabled" }
  throw "workspace ledgers daily registration failed; the prior definition was restored or the new task removed: $($RegistrationFailure.Exception.Message)"
}
