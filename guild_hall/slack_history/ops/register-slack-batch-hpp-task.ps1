[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][string]$PrivateRoot,
  [Parameter(Mandatory = $true)][string]$StateRoot,
  [Parameter(Mandatory = $true)][string]$BatchBindingPath,
  [Parameter(Mandatory = $true)][string]$BatchBindingSha256,
  [Parameter(Mandatory = $true)][string]$RuntimeManifestPath,
  [Parameter(Mandatory = $true)][string]$RuntimeManifestSha256,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$NodeSha256,
  [string]$TaskName = "Soulforge-HPP-Slack-Batch",
  [string]$ExpectedDryRunDigest,
  [string]$ExpectedExistingTaskSha256,
  [switch]$Register
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-SameOrChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Candidate,
    [switch]$Strict
  )
  $TrimmedParent = $Parent.TrimEnd([char[]]@(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ))
  if ($Candidate.Equals($TrimmedParent, [StringComparison]::OrdinalIgnoreCase)) {
    return -not $Strict
  }
  return $Candidate.StartsWith(
    $TrimmedParent + [IO.Path]::DirectorySeparatorChar,
    [StringComparison]::OrdinalIgnoreCase
  )
}

function Assert-DisjointPath {
  param(
    [Parameter(Mandatory = $true)][string]$Left,
    [Parameter(Mandatory = $true)][string]$Right
  )
  if ((Test-SameOrChildPath -Parent $Left -Candidate $Right) `
      -or (Test-SameOrChildPath -Parent $Right -Candidate $Left)) {
    throw "slack batch protected roots overlap"
  }
}

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "slack batch path contains a reparse point"
      }
    }
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) { break }
    $Cursor = $Parent.FullName
  }
}

function Get-XmlNodeText {
  param(
    [System.Xml.XmlNode]$Parent,
    [Parameter(Mandatory = $true)][string]$XPath,
    [string]$DefaultValue = ""
  )
  if ($null -eq $Parent) {
    return $DefaultValue
  }
  $Node = $Parent.SelectSingleNode($XPath)
  if ($null -eq $Node) {
    return $DefaultValue
  }
  return [string]$Node.InnerText
}

function Resolve-CanonicalDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Container)) {
    throw "slack batch required directory is missing"
  }
  $Resolved = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Absolute -Force).FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) {
    throw "slack batch directory is not canonical"
  }
  return $Resolved
}

function Resolve-CanonicalFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Leaf)) {
    throw "slack batch required file is missing"
  }
  $Item = Get-Item -LiteralPath $Absolute -Force
  if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "slack batch required file is a reparse point"
  }
  $Resolved = [IO.Path]::GetFullPath($Item.FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) {
    throw "slack batch file is not canonical"
  }
  return $Resolved
}

function Resolve-PlannedDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  $Missing = [Collections.Generic.List[string]]::new()
  $Cursor = $Absolute
  while (-not (Test-Path -LiteralPath $Cursor)) {
    $Missing.Insert(0, [IO.Path]::GetFileName($Cursor))
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) {
      throw "slack batch state root has no existing ancestor"
    }
    $Cursor = $Parent.FullName
  }
  if (-not (Test-Path -LiteralPath $Cursor -PathType Container)) {
    throw "slack batch state root ancestor is not a directory"
  }
  $Resolved = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Cursor -Force).FullName)
  foreach ($Part in $Missing) {
    $Resolved = [IO.Path]::GetFullPath((Join-Path $Resolved $Part))
  }
  return $Resolved
}

function Assert-Sha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if ($Value -notmatch '^sha256:[0-9a-f]{64}$') {
    throw "$Label digest is invalid"
  }
}

function Get-Sha256Text {
  param([Parameter(Mandatory = $true)][string]$Value)
  $Bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $Hasher = [Security.Cryptography.SHA256]::Create()
  try {
    return "sha256:" + ([BitConverter]::ToString($Hasher.ComputeHash($Bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $Hasher.Dispose()
  }
}

function ConvertTo-TaskArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains('"')) { throw "task argument contains an unsupported quote character" }
  if ($Value -notmatch '\s') { return $Value }
  $Escaped = $Value -replace '(\\+)$', '$1$1'
  return '"' + $Escaped + '"'
}

function ConvertTo-SingleQuotedLiteral {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

if ($TaskName -ne "Soulforge-HPP-Slack-Batch") {
  throw "slack batch task name is fixed"
}
foreach ($DigestSpec in @(
  @{ Value = $BatchBindingSha256; Label = "batch binding" },
  @{ Value = $RuntimeManifestSha256; Label = "runtime manifest" },
  @{ Value = $NodeSha256; Label = "Node" }
)) {
  Assert-Sha256 -Value $DigestSpec.Value -Label $DigestSpec.Label
}
if ((Get-TimeZone).Id -ne "Korea Standard Time") {
  throw "slack batch task requires the Asia/Seoul Windows time zone"
}

$RuntimeRoot = Resolve-CanonicalDirectory -Path $RuntimeRoot
$RepoRoot = Resolve-CanonicalDirectory -Path $RepoRoot
$PrivateRoot = Resolve-CanonicalDirectory -Path $PrivateRoot
$StateRoot = Resolve-PlannedDirectory -Path $StateRoot
$BatchBindingPath = Resolve-CanonicalFile -Path $BatchBindingPath
$RuntimeManifestPath = Resolve-CanonicalFile -Path $RuntimeManifestPath
$NodePath = Resolve-CanonicalFile -Path $NodePath
$Launcher = Resolve-CanonicalFile -Path (
  Join-Path $RuntimeRoot "guild_hall\slack_history\slack_batch_live_launcher.mjs"
)

Assert-DisjointPath -Left $RuntimeRoot -Right $RepoRoot
Assert-DisjointPath -Left $PrivateRoot -Right $RuntimeRoot
Assert-DisjointPath -Left $PrivateRoot -Right $RepoRoot
Assert-DisjointPath -Left $StateRoot -Right $RuntimeRoot
Assert-DisjointPath -Left $StateRoot -Right $RepoRoot
if (-not (Test-SameOrChildPath -Parent $PrivateRoot -Candidate $StateRoot -Strict)) {
  throw "slack batch state root must be a strict private-root child"
}
if (-not (Test-SameOrChildPath -Parent $PrivateRoot -Candidate $BatchBindingPath -Strict) `
    -or (Test-SameOrChildPath -Parent $StateRoot -Candidate $BatchBindingPath)) {
  throw "slack batch binding must be private and disjoint from state"
}
if (-not (Test-SameOrChildPath -Parent $RuntimeRoot -Candidate $RuntimeManifestPath -Strict) `
    -or -not (Test-SameOrChildPath -Parent $RuntimeRoot -Candidate $Launcher -Strict)) {
  throw "slack batch runtime files escaped the runtime root"
}

$ActualBatchBindingSha256 = "sha256:" + (
  Get-FileHash -LiteralPath $BatchBindingPath -Algorithm SHA256
).Hash.ToLowerInvariant()
if ($ActualBatchBindingSha256 -ne $BatchBindingSha256) {
  throw "slack batch binding SHA-256 changed"
}
$ActualRuntimeManifestSha256 = "sha256:" + (
  Get-FileHash -LiteralPath $RuntimeManifestPath -Algorithm SHA256
).Hash.ToLowerInvariant()
if ($ActualRuntimeManifestSha256 -ne $RuntimeManifestSha256) {
  throw "slack batch runtime manifest SHA-256 changed"
}
$ActualNodeSha256 = "sha256:" + (
  Get-FileHash -LiteralPath $NodePath -Algorithm SHA256
).Hash.ToLowerInvariant()
if ($ActualNodeSha256 -ne $NodeSha256) {
  throw "slack batch Node SHA-256 changed"
}

$BatchBindingText = Get-Content -Raw -Encoding UTF8 -LiteralPath $BatchBindingPath
if ($BatchBindingText -match '(?i)(?:xox[abprs]|xapp)-[A-Za-z0-9-]{10,}') {
  throw "slack batch binding contains a token-like value"
}
$BatchBinding = $BatchBindingText | ConvertFrom-Json
if ($BatchBinding.schema_version -ne "soulforge.slack_batch_live.binding.v1" `
    -or $BatchBinding.feature_enabled -ne $true) {
  throw "slack batch binding schema or feature state is invalid"
}
if (-not ([IO.Path]::GetFullPath([string]$BatchBinding.private_root)).Equals(
      $PrivateRoot,
      [StringComparison]::OrdinalIgnoreCase
    ) `
    -or -not ([IO.Path]::GetFullPath([string]$BatchBinding.state_root)).Equals(
      $StateRoot,
      [StringComparison]::OrdinalIgnoreCase
    )) {
  throw "slack batch binding private roots differ from registration inputs"
}

$LauncherCommonArguments = @(
  "--runtime-root", $RuntimeRoot,
  "--runtime-manifest", $RuntimeManifestPath,
  "--expected-runtime-manifest-sha256", $RuntimeManifestSha256,
  "--expected-node-sha256", $NodeSha256
)
$PreflightArguments = @(
  $LauncherCommonArguments
  "--preflight",
  "--repository-root", $RepoRoot,
  "--batch-binding", $BatchBindingPath,
  "--expected-batch-binding-sha256", $BatchBindingSha256
)
$PreflightOutput = @(& $NodePath $Launcher @PreflightArguments 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw "slack batch no-network preflight failed"
}
try {
  $Preflight = ($PreflightOutput -join [Environment]::NewLine) | ConvertFrom-Json
} catch {
  throw "slack batch no-network preflight returned invalid aggregate output"
}
if ($Preflight.mode -ne "preflight" `
    -or [int]$Preflight.failed_count -ne 0 `
    -or [int]$Preflight.succeeded_count -ne [int]$Preflight.configured_count `
    -or $Preflight.network_used -ne $false `
    -or [int]$Preflight.repository_writes -ne 0 `
    -or [int]$Preflight.private_writes -ne 0) {
  throw "slack batch no-network preflight did not attest every binding"
}

$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)
$TaskNodeArguments = @(
  $LauncherCommonArguments
  "--apply",
  "--repository-root", $RepoRoot,
  "--batch-binding", $BatchBindingPath,
  "--expected-batch-binding-sha256", $BatchBindingSha256
)
$CommandScript = "& " `
  + (ConvertTo-SingleQuotedLiteral -Value $NodePath) `
  + " " `
  + (ConvertTo-SingleQuotedLiteral -Value $Launcher) `
  + " " `
  + (
  ($TaskNodeArguments | ForEach-Object {
    ConvertTo-SingleQuotedLiteral -Value ([string]$_)
  }) -join " "
)
$ActionArgumentLine = (@(
  "-NoProfile",
  "-NonInteractive",
  "-WindowStyle", "Hidden",
  "-ExecutionPolicy", "Bypass",
  "-Command", $CommandScript
) | ForEach-Object {
  ConvertTo-TaskArgument -Value ([string]$_)
}) -join " "

$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$TaskFile = Join-Path $env:WINDIR "System32\Tasks\$TaskName"
$ActualExistingTaskSha256 = $null
$ExistingTaskXml = $null
$ExistingTaskXmlSha256 = $null
if ($Existing) {
  if ($Existing.State -eq "Running") {
    throw "existing slack batch task is still running"
  }
  if (-not $ExpectedExistingTaskSha256 `
      -or $ExpectedExistingTaskSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "existing slack batch task replacement requires its exact SHA-256"
  }
  if (-not (Test-Path -LiteralPath $TaskFile -PathType Leaf)) {
    throw "existing slack batch task file is unavailable"
  }
  $ActualExistingTaskSha256 = (
    Get-FileHash -LiteralPath $TaskFile -Algorithm SHA256
  ).Hash.ToUpperInvariant()
  if ($ActualExistingTaskSha256 -ne $ExpectedExistingTaskSha256.ToUpperInvariant()) {
    throw "existing slack batch task SHA-256 changed"
  }
  $ExistingTaskXml = Export-ScheduledTask -TaskName $TaskName
  $ExistingTaskXmlSha256 = Get-Sha256Text -Value $ExistingTaskXml
}

$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$CurrentUser = $CurrentIdentity.Name
$CurrentSid = $CurrentIdentity.User.Value
$Plan = [ordered]@{
  schema_version = "soulforge.slack_batch_task.plan.v1"
  task_name = $TaskName
  time_zone = "Korea Standard Time"
  trigger_local_times = @("02:00", "12:00")
  trigger_kind = "daily"
  hidden = $true
  multiple_instances = "IgnoreNew"
  restart_count = 3
  run_level = "Limited"
  user_sid = $CurrentSid
  runtime_manifest_sha256 = $RuntimeManifestSha256
  batch_binding_sha256 = $BatchBindingSha256
  node_sha256 = $NodeSha256
  action_sha256 = Get-Sha256Text -Value ($PowerShellExe + "`n" + $ActionArgumentLine)
  existing_task_sha256 = $ActualExistingTaskSha256
  existing_task_xml_sha256 = $ExistingTaskXmlSha256
}
$PlanDigest = Get-Sha256Text -Value ($Plan | ConvertTo-Json -Depth 4 -Compress)

if (-not $Register) {
  Write-Output "slack batch task dry-run attested: plan_digest=$PlanDigest triggers=2 mutation=false"
  return
}
if (-not $ExpectedDryRunDigest `
    -or $ExpectedDryRunDigest -notmatch '^sha256:[0-9a-f]{64}$' `
    -or $ExpectedDryRunDigest -ne $PlanDigest) {
  throw "slack batch registration requires the matching dry-run plan digest"
}
if (-not $PSCmdlet.ShouldProcess(
    $TaskName,
    "register the fixed hidden 02:00 and 12:00 local Slack batch task"
  )) {
  Write-Output "slack batch task registration skipped"
  return
}

$Action = New-ScheduledTaskAction `
  -Execute $PowerShellExe `
  -Argument $ActionArgumentLine `
  -WorkingDirectory $RuntimeRoot
$Trigger0200 = New-ScheduledTaskTrigger -Daily -At ([DateTime]::Today.AddHours(2))
$Trigger1200 = New-ScheduledTaskTrigger -Daily -At ([DateTime]::Today.AddHours(12))
$Principal = New-ScheduledTaskPrincipal `
  -UserId $CurrentUser `
  -LogonType Interactive `
  -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -StartWhenAvailable `
  -Hidden `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

try {
  $null = Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger @($Trigger0200, $Trigger1200) `
    -Principal $Principal `
    -Settings $Settings `
    -Description "Soulforge HPP bounded Slack batch at 02:00 and 12:00 Asia/Seoul; no polling loop." `
    -Force `
    -ErrorAction Stop

  $ExportedTaskXml = Export-ScheduledTask -TaskName $TaskName
  [xml]$RegisteredXml = $ExportedTaskXml
  $TaskNode = $RegisteredXml.SelectSingleNode("/*[local-name()='Task']")
  $TriggersNode = $TaskNode.SelectSingleNode("./*[local-name()='Triggers']")
  $SettingsNode = $TaskNode.SelectSingleNode("./*[local-name()='Settings']")
  $PrincipalNode = $TaskNode.SelectSingleNode(
    "./*[local-name()='Principals']/*[local-name()='Principal']"
  )
  $ExecNode = $TaskNode.SelectSingleNode(
    "./*[local-name()='Actions']/*[local-name()='Exec']"
  )
  $RegisteredTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  $TriggerNodes = @($TriggersNode.ChildNodes | Where-Object {
    $_.NodeType -eq [System.Xml.XmlNodeType]::Element
  })
  $TriggerHours = @($TriggerNodes | ForEach-Object {
    $StartBoundary = Get-XmlNodeText `
      -Parent $_ `
      -XPath "./*[local-name()='StartBoundary']"
    ([DateTime]::Parse($StartBoundary)).ToString("HH:mm")
  } | Sort-Object)
  $RegisteredPrincipalUserId = Get-XmlNodeText `
    -Parent $PrincipalNode `
    -XPath "./*[local-name()='UserId']" `
    -DefaultValue ([string]$RegisteredTask.Principal.UserId)
  $RegisteredRunLevel = Get-XmlNodeText `
    -Parent $PrincipalNode `
    -XPath "./*[local-name()='RunLevel']"
  $RegisteredRunLevelFromTask = [string]$RegisteredTask.Principal.RunLevel
  $RegisteredMultipleInstancesPolicy = Get-XmlNodeText `
    -Parent $SettingsNode `
    -XPath "./*[local-name()='MultipleInstancesPolicy']"
  $RegisteredHidden = Get-XmlNodeText `
    -Parent $SettingsNode `
    -XPath "./*[local-name()='Hidden']"
  $RegisteredRestartCount = Get-XmlNodeText `
    -Parent $SettingsNode `
    -XPath "./*[local-name()='RestartOnFailure']/*[local-name()='Count']"
  $RegisteredCommand = Get-XmlNodeText `
    -Parent $ExecNode `
    -XPath "./*[local-name()='Command']"
  $RegisteredArguments = Get-XmlNodeText `
    -Parent $ExecNode `
    -XPath "./*[local-name()='Arguments']"
  $RegisteredWorkingDirectory = Get-XmlNodeText `
    -Parent $ExecNode `
    -XPath "./*[local-name()='WorkingDirectory']"
  $RegisteredRunLevelValid = $RegisteredRunLevel -eq "LeastPrivilege" `
    -or ($RegisteredRunLevel -eq "" `
      -and $RegisteredRunLevelFromTask -eq "Limited")
  $RegistrationValid = $TriggerNodes.Count -eq 2 `
    -and @($TriggerNodes | Where-Object { $_.LocalName -ne "CalendarTrigger" }).Count -eq 0 `
    -and @($TriggerNodes | Where-Object {
      $null -ne $_.SelectSingleNode("./*[local-name()='Repetition']")
    }).Count -eq 0 `
    -and @($TriggerNodes | Where-Object {
      [string]$_.SelectSingleNode(
        "./*[local-name()='ScheduleByDay']/*[local-name()='DaysInterval']"
      ).InnerText -ne "1"
    }).Count -eq 0 `
    -and ($TriggerHours -join ",") -eq "02:00,12:00" `
    -and $RegisteredMultipleInstancesPolicy -eq "IgnoreNew" `
    -and $RegisteredHidden -eq "true" `
    -and $RegisteredRestartCount -eq "3" `
    -and $RegisteredRunLevelValid `
    -and ($RegisteredPrincipalUserId -eq $CurrentSid `
      -or $RegisteredPrincipalUserId -eq $CurrentUser) `
    -and $RegisteredCommand -eq $PowerShellExe `
    -and $RegisteredArguments -eq $ActionArgumentLine `
    -and $RegisteredWorkingDirectory -eq $RuntimeRoot
  if (-not $RegistrationValid) {
    throw "registered slack batch task failed exported XML attestation"
  }

  $ExportedTaskSha256 = Get-Sha256Text -Value $ExportedTaskXml
  Write-Output "slack batch task registered and XML-attested: triggers=2 exported_xml_sha256=$ExportedTaskSha256"
} catch {
  $RegistrationFailure = $_
  $RollbackFailure = $null
  try {
    if ($null -ne $ExistingTaskXml) {
      $null = Register-ScheduledTask `
        -TaskName $TaskName `
        -Xml $ExistingTaskXml `
        -Force `
        -ErrorAction Stop
      $RestoredTaskXml = Export-ScheduledTask -TaskName $TaskName
      if ((Get-Sha256Text -Value $RestoredTaskXml) -ne $ExistingTaskXmlSha256) {
        throw "restored slack batch task XML differs from the prior definition"
      }
    } else {
      $CreatedTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      if ($CreatedTask) {
        Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
      }
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        throw "new slack batch task remained after rollback"
      }
    }
  } catch {
    $RollbackFailure = $_
    Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  }
  if ($null -ne $RollbackFailure) {
    throw "slack batch registration failed and rollback failed; the task was disabled"
  }
  throw "slack batch registration failed; the prior task definition was restored or the new task was removed: $($RegistrationFailure.Exception.Message)"
}
