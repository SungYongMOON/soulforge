[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
<#
  Registers the one scheduled task that keeps the unified graph database level
  with what the collectors hold: `SoulforgeGraphSync`, every 30 minutes, hidden,
  running this lane's `harness/estate_graph_sync.mjs` over a fixed project list.

  What it checks before it registers anything:
    * every path it was given is canonical and free of reparse points, and the
      lane root, the state root and the receipts root do not overlap
    * the lane's own manifest hashes to the digest the caller names, so the task
      is pinned to a built lane rather than to whatever is at that path
    * Node hashes to the digest the caller names
    * the sync runs once in `--dry` mode and exits 0 -- a preflight that reads
      custody, the bindings and the database and writes nothing
    * without -Register it stops here and prints a plan digest; -Register only
      proceeds when the caller passes that exact digest back

  After registering it re-reads the task's exported XML and checks the trigger,
  the interval, the action line, the working directory, the principal and the
  settings against what it planned; anything that does not match rolls the task
  back to its previous definition (or removes it when there was none).

  It never starts the task, never writes into a project store, and never edits a
  binding. It is run from a non-packaged PowerShell session: a packaged session
  would register a task whose file writes land in that package's virtual store.
#>
param(
  [Parameter(Mandatory = $true)][string]$LaneRoot,
  [Parameter(Mandatory = $true)][string]$LaneManifestSha256,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$NodeSha256,
  [Parameter(Mandatory = $true)][string]$RootTablePath,
  [Parameter(Mandatory = $true)][string]$RootTableSha256,
  [Parameter(Mandatory = $true)][string]$ReceiptsRoot,
  [Parameter(Mandatory = $true)][string]$Projects,
  [string]$TaskName = "SoulforgeGraphSync",
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
        throw "graph sync path contains a reparse point: $Cursor"
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
  if (-not (Test-Path -LiteralPath $Absolute -PathType Container)) { throw "graph sync directory is missing: $Absolute" }
  $Resolved = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Absolute -Force).FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) { throw "graph sync directory is not canonical" }
  return $Resolved
}

function Resolve-CanonicalFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Leaf)) { throw "graph sync file is missing: $Absolute" }
  $Item = Get-Item -LiteralPath $Absolute -Force
  if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "graph sync file is a reparse point" }
  $Resolved = [IO.Path]::GetFullPath($Item.FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) { throw "graph sync file is not canonical" }
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
    throw "graph sync roots overlap: $Left and $Right"
  }
}

function Assert-Sha256 {
  param([Parameter(Mandatory = $true)][string]$Value, [Parameter(Mandatory = $true)][string]$Label)
  if ($Value -notmatch '^sha256:[0-9a-f]{64}$') { throw "$Label digest is invalid" }
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

if ($TaskName -ne "SoulforgeGraphSync") { throw "graph sync task name is fixed" }
if ($Projects -notmatch '^[A-Z][0-9A-Z]*(-[0-9A-Z]+)+(,[A-Z][0-9A-Z]*(-[0-9A-Z]+)+)*$') {
  throw "graph sync projects must be a comma-separated list of project codes"
}
foreach ($Spec in @(
  @{ Value = $LaneManifestSha256; Label = "lane manifest" },
  @{ Value = $NodeSha256; Label = "Node" },
  @{ Value = $RootTableSha256; Label = "root table" }
)) { Assert-Sha256 -Value $Spec.Value -Label $Spec.Label }

$LaneRoot = Resolve-CanonicalDirectory -Path $LaneRoot
$NodePath = Resolve-CanonicalFile -Path $NodePath
$RootTablePath = Resolve-CanonicalFile -Path $RootTablePath
$ReceiptsRoot = [IO.Path]::GetFullPath($ReceiptsRoot)
Assert-NoReparsePath -Path $ReceiptsRoot
$LaneManifest = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "LANE_MANIFEST.sha256")
$Entry = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "guild_hall\context_engine\harness\estate_graph_sync.mjs")
$HiddenLauncher = Resolve-CanonicalFile -Path (Join-Path $LaneRoot "guild_hall\context_engine\ops\run-graph-sync-hidden.vbs")

Assert-DisjointPath -Left $LaneRoot -Right $ReceiptsRoot
Assert-DisjointPath -Left $LaneRoot -Right ([IO.Path]::GetDirectoryName($RootTablePath))

$ActualLaneManifestSha256 = Get-Sha256File -Path $LaneManifest
if ($ActualLaneManifestSha256 -ne $LaneManifestSha256) { throw "graph sync lane manifest SHA-256 changed" }
$ActualNodeSha256 = Get-Sha256File -Path $NodePath
if ($ActualNodeSha256 -ne $NodeSha256) { throw "graph sync Node SHA-256 changed" }
$ActualRootTableSha256 = Get-Sha256File -Path $RootTablePath
if ($ActualRootTableSha256 -ne $RootTableSha256) { throw "graph sync root table SHA-256 changed" }

$SyncArguments = @(
  "--root-table", $RootTablePath,
  "--root-table-sha256", $RootTableSha256,
  "--projects", $Projects,
  "--receipts", $ReceiptsRoot
)

# Preflight: the same entry point, in the mode that writes nothing.
$PreflightOutput = @(& $NodePath $Entry @SyncArguments "--dry" 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw "graph sync dry preflight failed: $($PreflightOutput -join ' ')"
}

$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)
$WScriptExe = Join-Path $env:WINDIR "System32\wscript.exe"
$CommandScript = "& " + (ConvertTo-SingleQuotedLiteral -Value $NodePath) + " " `
  + (ConvertTo-SingleQuotedLiteral -Value $Entry) + " " `
  + (($SyncArguments | ForEach-Object { ConvertTo-SingleQuotedLiteral -Value ([string]$_) }) -join " ")
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
  if ($Existing.State -eq "Running") { throw "the existing graph sync task is still running" }
  if (-not $ExpectedExistingTaskSha256 -or $ExpectedExistingTaskSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "replacing the existing graph sync task requires its exact SHA-256"
  }
  if (-not (Test-Path -LiteralPath $TaskFile -PathType Leaf)) { throw "the existing graph sync task file is unavailable" }
  $ActualExistingTaskSha256 = (Get-Sha256File -Path $TaskFile).Substring(7).ToUpperInvariant()
  if ($ActualExistingTaskSha256 -ne $ExpectedExistingTaskSha256.ToUpperInvariant()) {
    throw "the existing graph sync task SHA-256 changed"
  }
  $ExistingTaskXml = Export-ScheduledTask -TaskName $TaskName
  $ExistingTaskXmlSha256 = Get-Sha256Text -Value $ExistingTaskXml
}

$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$CurrentUser = $CurrentIdentity.Name
$CurrentSid = $CurrentIdentity.User.Value
$Plan = [ordered]@{
  schema_version = "soulforge.graph_sync_task.plan.v1"
  task_name = $TaskName
  trigger_kind = "time_repetition"
  repetition_interval = "PT30M"
  execution_time_limit = "PT2H"
  hidden = $true
  multiple_instances = "IgnoreNew"
  restart_count = 0
  run_level = "Limited"
  user_sid = $CurrentSid
  lane_manifest_sha256 = $LaneManifestSha256
  node_sha256 = $NodeSha256
  root_table_sha256 = $RootTableSha256
  projects = $Projects
  action_sha256 = Get-Sha256Text -Value ($WScriptExe + "`n" + $HiddenActionArgumentLine)
  existing_task_sha256 = $ActualExistingTaskSha256
  existing_task_xml_sha256 = $ExistingTaskXmlSha256
}
$PlanDigest = Get-Sha256Text -Value ($Plan | ConvertTo-Json -Depth 4 -Compress)

if (-not $Register) {
  Write-Output "graph sync task dry-run attested: plan_digest=$PlanDigest interval=PT30M projects=$Projects mutation=false"
  return
}
if (-not $ExpectedDryRunDigest -or $ExpectedDryRunDigest -ne $PlanDigest) {
  throw "graph sync registration requires the matching dry-run plan digest"
}
if (-not $PSCmdlet.ShouldProcess($TaskName, "register the hidden 30-minute graph sync task")) {
  Write-Output "graph sync task registration skipped"
  return
}

$Action = New-ScheduledTaskAction -Execute $WScriptExe -Argument $HiddenActionArgumentLine -WorkingDirectory $LaneRoot
$Trigger = New-ScheduledTaskTrigger -Once -At ([DateTime]::Today) -RepetitionInterval (New-TimeSpan -Minutes 30)
# New-ScheduledTaskTrigger emits StopAtDurationEnd=true with no Duration set on
# PowerShell 5.1 / Windows 11; an indefinite repetition must not stop at one.
$Trigger.Repetition.StopAtDurationEnd = $false
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -StartWhenAvailable -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

try {
  $null = Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($Trigger) -Principal $Principal `
    -Settings $Settings -Force -ErrorAction Stop `
    -Description "Soulforge context engine: bring each named project's graph index up to what custody holds and load it into the unified graph database, every 30 minutes. Local only; no network, no external transfer."

  $ExportedTaskXml = Export-ScheduledTask -TaskName $TaskName
  [xml]$RegisteredXml = $ExportedTaskXml
  $TaskNode = $RegisteredXml.SelectSingleNode("/*[local-name()='Task']")
  $TriggersNode = $TaskNode.SelectSingleNode("./*[local-name()='Triggers']")
  $SettingsNode = $TaskNode.SelectSingleNode("./*[local-name()='Settings']")
  $PrincipalNode = $TaskNode.SelectSingleNode("./*[local-name()='Principals']/*[local-name()='Principal']")
  $ExecNode = $TaskNode.SelectSingleNode("./*[local-name()='Actions']/*[local-name()='Exec']")
  $RegisteredTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  $TriggerNodes = @($TriggersNode.ChildNodes | Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element })
  $RegisteredInterval = ""
  $RegisteredStopAtDurationEnd = ""
  $RegisteredDuration = ""
  if ($TriggerNodes.Count -eq 1) {
    $RegisteredInterval = Get-XmlNodeText -Parent $TriggerNodes[0] -XPath "./*[local-name()='Repetition']/*[local-name()='Interval']"
    $RegisteredStopAtDurationEnd = Get-XmlNodeText -Parent $TriggerNodes[0] -XPath "./*[local-name()='Repetition']/*[local-name()='StopAtDurationEnd']"
    $RegisteredDuration = Get-XmlNodeText -Parent $TriggerNodes[0] -XPath "./*[local-name()='Repetition']/*[local-name()='Duration']"
  }
  $RegisteredRunLevel = Get-XmlNodeText -Parent $PrincipalNode -XPath "./*[local-name()='RunLevel']"
  $RegisteredRunLevelValid = $RegisteredRunLevel -eq "LeastPrivilege" `
    -or ($RegisteredRunLevel -eq "" -and [string]$RegisteredTask.Principal.RunLevel -eq "Limited")
  $RegisteredPrincipalUserId = Get-XmlNodeText -Parent $PrincipalNode -XPath "./*[local-name()='UserId']" `
    -DefaultValue ([string]$RegisteredTask.Principal.UserId)
  $RegistrationValid = $TriggerNodes.Count -eq 1 `
    -and $TriggerNodes[0].LocalName -eq "TimeTrigger" `
    -and $RegisteredInterval -eq "PT30M" `
    -and $RegisteredStopAtDurationEnd -ne "true" `
    -and ($RegisteredDuration -eq "" -or $RegisteredDuration -match '^P\d+D') `
    -and (Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='MultipleInstancesPolicy']") -eq "IgnoreNew" `
    -and (Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='Hidden']") -eq "true" `
    -and (Get-XmlNodeText -Parent $SettingsNode -XPath "./*[local-name()='ExecutionTimeLimit']") -eq "PT2H" `
    -and $RegisteredRunLevelValid `
    -and ($RegisteredPrincipalUserId -eq $CurrentSid -or $RegisteredPrincipalUserId -eq $CurrentUser) `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Command']") -eq $WScriptExe `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='Arguments']") -eq $HiddenActionArgumentLine `
    -and (Get-XmlNodeText -Parent $ExecNode -XPath "./*[local-name()='WorkingDirectory']") -eq $LaneRoot
  if (-not $RegistrationValid) { throw "the registered graph sync task failed exported XML attestation" }
  Write-Output ("graph sync task registered and XML-attested: interval=PT30M projects=$Projects exported_xml_sha256=" `
    + (Get-Sha256Text -Value $ExportedTaskXml))
} catch {
  $RegistrationFailure = $_
  $RollbackFailure = $null
  try {
    if ($null -ne $ExistingTaskXml) {
      $null = Register-ScheduledTask -TaskName $TaskName -Xml $ExistingTaskXml -Force -ErrorAction Stop
      if ((Get-Sha256Text -Value (Export-ScheduledTask -TaskName $TaskName)) -ne $ExistingTaskXmlSha256) {
        throw "the restored graph sync task XML differs from the prior definition"
      }
    } else {
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
      }
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { throw "the new graph sync task remained after rollback" }
    }
  } catch {
    $RollbackFailure = $_
    Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  }
  if ($null -ne $RollbackFailure) { throw "graph sync registration failed and rollback failed; the task was disabled" }
  throw "graph sync registration failed; the prior definition was restored or the new task removed: $($RegistrationFailure.Exception.Message)"
}
