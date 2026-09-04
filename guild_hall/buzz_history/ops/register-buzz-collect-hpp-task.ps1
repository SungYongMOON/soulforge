[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][string]$PrivateRoot,
  [Parameter(Mandatory = $true)][string]$StateRoot,
  # Optional, and only for the split-plane layout: when the state root lives
  # under the control root instead of the private root, the registrar must be
  # told which root bounds it. Omitted, every check below is unchanged.
  [string]$ControlRoot,
  [Parameter(Mandatory = $true)][string]$BindingPath,
  [Parameter(Mandatory = $true)][string]$BindingSha256,
  [Parameter(Mandatory = $true)][string]$RuntimeManifestPath,
  [Parameter(Mandatory = $true)][string]$RuntimeManifestSha256,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$NodeSha256,
  [string]$TaskName = "Soulforge-HPP-Buzz-Collect",
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
    throw "buzz collect protected roots overlap"
  }
}

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "buzz collect path contains a reparse point"
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
    throw "buzz collect required directory is missing"
  }
  $Resolved = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Absolute -Force).FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) {
    throw "buzz collect directory is not canonical"
  }
  return $Resolved
}

function Resolve-CanonicalFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Absolute = [IO.Path]::GetFullPath($Path)
  Assert-NoReparsePath -Path $Absolute
  if (-not (Test-Path -LiteralPath $Absolute -PathType Leaf)) {
    throw "buzz collect required file is missing"
  }
  $Item = Get-Item -LiteralPath $Absolute -Force
  if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "buzz collect required file is a reparse point"
  }
  $Resolved = [IO.Path]::GetFullPath($Item.FullName)
  if (-not $Resolved.Equals($Absolute, [StringComparison]::OrdinalIgnoreCase)) {
    throw "buzz collect file is not canonical"
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
      throw "buzz collect state root has no existing ancestor"
    }
    $Cursor = $Parent.FullName
  }
  if (-not (Test-Path -LiteralPath $Cursor -PathType Container)) {
    throw "buzz collect state root ancestor is not a directory"
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

function Get-Sha256File {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Stream = [IO.File]::Open(
    $Path,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::Read
  )
  try {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try {
      return ([BitConverter]::ToString($Hasher.ComputeHash($Stream))).Replace("-", "").ToLowerInvariant()
    } finally {
      $Hasher.Dispose()
    }
  } finally {
    $Stream.Dispose()
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

if ($TaskName -ne "Soulforge-HPP-Buzz-Collect") {
  throw "buzz collect task name is fixed"
}
foreach ($DigestSpec in @(
  @{ Value = $BindingSha256; Label = "binding" },
  @{ Value = $RuntimeManifestSha256; Label = "runtime manifest" },
  @{ Value = $NodeSha256; Label = "Node" }
)) {
  Assert-Sha256 -Value $DigestSpec.Value -Label $DigestSpec.Label
}
if ((Get-TimeZone).Id -ne "Korea Standard Time") {
  throw "buzz collect task requires the Asia/Seoul Windows time zone"
}

$RuntimeRoot = Resolve-CanonicalDirectory -Path $RuntimeRoot
$RepoRoot = Resolve-CanonicalDirectory -Path $RepoRoot
$PrivateRoot = Resolve-CanonicalDirectory -Path $PrivateRoot
$StateRoot = Resolve-PlannedDirectory -Path $StateRoot
if ($PSBoundParameters.ContainsKey("ControlRoot") -and $ControlRoot) {
  $ControlRoot = Resolve-CanonicalDirectory -Path $ControlRoot
}
$BindingPath = Resolve-CanonicalFile -Path $BindingPath
$RuntimeManifestPath = Resolve-CanonicalFile -Path $RuntimeManifestPath
$NodePath = Resolve-CanonicalFile -Path $NodePath
$Launcher = Resolve-CanonicalFile -Path (
  Join-Path $RuntimeRoot "guild_hall\buzz_history\buzz_collect_launcher.mjs"
)

Assert-DisjointPath -Left $RuntimeRoot -Right $RepoRoot
Assert-DisjointPath -Left $PrivateRoot -Right $RuntimeRoot
Assert-DisjointPath -Left $PrivateRoot -Right $RepoRoot
Assert-DisjointPath -Left $StateRoot -Right $RuntimeRoot
Assert-DisjointPath -Left $StateRoot -Right $RepoRoot
if ($ControlRoot) {
  Assert-DisjointPath -Left $ControlRoot -Right $RuntimeRoot
  Assert-DisjointPath -Left $ControlRoot -Right $RepoRoot
  Assert-DisjointPath -Left $ControlRoot -Right $PrivateRoot
  if (-not (Test-SameOrChildPath -Parent $ControlRoot -Candidate $StateRoot -Strict)) {
    throw "buzz collect state root must be a strict control-root child"
  }
}
elseif (-not (Test-SameOrChildPath -Parent $PrivateRoot -Candidate $StateRoot -Strict)) {
  throw "buzz collect state root must be a strict private-root child"
}
if (-not (Test-SameOrChildPath -Parent $PrivateRoot -Candidate $BindingPath -Strict) `
    -or (Test-SameOrChildPath -Parent $StateRoot -Candidate $BindingPath)) {
  throw "buzz collect binding must be private and disjoint from state"
}
if (-not (Test-SameOrChildPath -Parent $RuntimeRoot -Candidate $RuntimeManifestPath -Strict) `
    -or -not (Test-SameOrChildPath -Parent $RuntimeRoot -Candidate $Launcher -Strict)) {
  throw "buzz collect runtime files escaped the runtime root"
}

$ActualBindingSha256 = "sha256:" + (Get-Sha256File -Path $BindingPath)
if ($ActualBindingSha256 -ne $BindingSha256) {
  throw "buzz collect binding SHA-256 changed"
}
$ActualRuntimeManifestSha256 = "sha256:" + (Get-Sha256File -Path $RuntimeManifestPath)
if ($ActualRuntimeManifestSha256 -ne $RuntimeManifestSha256) {
  throw "buzz collect runtime manifest SHA-256 changed"
}
$ActualNodeSha256 = "sha256:" + (Get-Sha256File -Path $NodePath)
if ($ActualNodeSha256 -ne $NodeSha256) {
  throw "buzz collect Node SHA-256 changed"
}

$BindingText = Get-Content -Raw -Encoding UTF8 -LiteralPath $BindingPath
# The Buzz lane needs no credential at all, so any Nostr secret key or
# JWT-shaped value in its binding is a misconfiguration, not a setting.
if ($BindingText -match '(?i)nsec1[a-z0-9]{20,}') {
  throw "buzz collect binding contains a token-like value"
}
if ($BindingText -match 'eyJ[A-Za-z0-9_-]{8,}\.') {
  throw "buzz collect binding contains a token-like value"
}
if ($BindingText -match '(?i)"credentials"') {
  throw "buzz collect binding must not declare credentials"
}
$Binding = $BindingText | ConvertFrom-Json
if ($Binding.schema_version -ne "soulforge.buzz_collect.binding.v1" `
    -or $Binding.feature_enabled -ne $true) {
  throw "buzz collect binding schema or feature state is invalid"
}
if (-not ([IO.Path]::GetFullPath([string]$Binding.private_root)).Equals(
      $PrivateRoot,
      [StringComparison]::OrdinalIgnoreCase
    ) `
    -or -not ([IO.Path]::GetFullPath([string]$Binding.state_root)).Equals(
      $StateRoot,
      [StringComparison]::OrdinalIgnoreCase
    )) {
  throw "buzz collect binding private roots differ from registration inputs"
}

$LauncherCommonArguments = @(
  "--runtime-root", $RuntimeRoot,
  "--runtime-manifest", $RuntimeManifestPath,
  "--expected-runtime-manifest-sha256", $RuntimeManifestSha256,
  "--expected-node-sha256", $NodeSha256
)
$LaneArguments = @(
  "--repository-root", $RepoRoot,
  "--binding", $BindingPath,
  "--expected-binding-sha256", $BindingSha256,
  "--state-root", $StateRoot
)
$PreflightArguments = @(
  $LauncherCommonArguments
  "--preflight"
  $LaneArguments
)
$PreflightOutput = @(& $NodePath $Launcher @PreflightArguments 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw "buzz collect no-network preflight failed"
}
try {
  $Preflight = ($PreflightOutput -join [Environment]::NewLine) | ConvertFrom-Json
} catch {
  throw "buzz collect no-network preflight returned invalid aggregate output"
}
if ($Preflight.mode -ne "preflight" `
    -or $Preflight.feature_status -ne "ON" `
    -or [int]$Preflight.failed_count -ne 0 `
    -or [int]$Preflight.succeeded_count -ne [int]$Preflight.configured_count `
    -or $Preflight.network_used -ne $false `
    -or [int]$Preflight.repository_writes -ne 0 `
    -or [int]$Preflight.private_writes -ne 0) {
  throw "buzz collect no-network preflight did not attest the binding"
}

$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)
$WScriptExe = Join-Path $env:WINDIR "System32\wscript.exe"
$HiddenLauncher = Resolve-CanonicalFile -Path (
  Join-Path $RuntimeRoot "guild_hall\buzz_history\ops\run-buzz-collect-hidden.vbs"
)
$TaskNodeArguments = @(
  $LauncherCommonArguments
  "--apply"
  $LaneArguments
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
$HiddenActionArgumentLine = (@(
  "//B",
  "//NoLogo",
  $HiddenLauncher,
  $PowerShellExe,
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
    throw "existing buzz collect task is still running"
  }
  if (-not $ExpectedExistingTaskSha256 `
      -or $ExpectedExistingTaskSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "existing buzz collect task replacement requires its exact SHA-256"
  }
  if (-not (Test-Path -LiteralPath $TaskFile -PathType Leaf)) {
    throw "existing buzz collect task file is unavailable"
  }
  $ActualExistingTaskSha256 = (Get-Sha256File -Path $TaskFile).ToUpperInvariant()
  if ($ActualExistingTaskSha256 -ne $ExpectedExistingTaskSha256.ToUpperInvariant()) {
    throw "existing buzz collect task SHA-256 changed"
  }
  $ExistingTaskXml = Export-ScheduledTask -TaskName $TaskName
  $ExistingTaskXmlSha256 = Get-Sha256Text -Value $ExistingTaskXml
}

$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$CurrentUser = $CurrentIdentity.Name
$CurrentSid = $CurrentIdentity.User.Value
$Plan = [ordered]@{
  schema_version = "soulforge.buzz_collect_task.plan.v1"
  task_name = $TaskName
  time_zone = "Korea Standard Time"
  trigger_kind = "time_repetition"
  repetition_interval = "PT15M"
  execution_time_limit = "PT10M"
  hidden = $true
  multiple_instances = "IgnoreNew"
  restart_count = 3
  run_level = "Limited"
  user_sid = $CurrentSid
  runtime_manifest_sha256 = $RuntimeManifestSha256
  binding_sha256 = $BindingSha256
  node_sha256 = $NodeSha256
  action_sha256 = Get-Sha256Text -Value ($WScriptExe + "`n" + $HiddenActionArgumentLine)
  existing_task_sha256 = $ActualExistingTaskSha256
  existing_task_xml_sha256 = $ExistingTaskXmlSha256
}
$PlanDigest = Get-Sha256Text -Value ($Plan | ConvertTo-Json -Depth 4 -Compress)

if (-not $Register) {
  Write-Output "buzz collect task dry-run attested: plan_digest=$PlanDigest interval=PT15M mutation=false"
  return
}
if (-not $ExpectedDryRunDigest `
    -or $ExpectedDryRunDigest -notmatch '^sha256:[0-9a-f]{64}$' `
    -or $ExpectedDryRunDigest -ne $PlanDigest) {
  throw "buzz collect registration requires the matching dry-run plan digest"
}
if (-not $PSCmdlet.ShouldProcess(
    $TaskName,
    "register the fixed hidden 15-minute read-only Buzz collection task"
  )) {
  Write-Output "buzz collect task registration skipped"
  return
}

$Action = New-ScheduledTaskAction `
  -Execute $WScriptExe `
  -Argument $HiddenActionArgumentLine `
  -WorkingDirectory $RuntimeRoot
$TriggerEvery15 = New-ScheduledTaskTrigger `
  -Once `
  -At ([DateTime]::Today) `
  -RepetitionInterval (New-TimeSpan -Minutes 15)
# New-ScheduledTaskTrigger emits StopAtDurationEnd=true even when no
# Duration is set (observed on PowerShell 5.1 / Windows 11), which the
# exported-XML attestation below rejects; the indefinite 15-minute repetition
# must never stop at a duration end.
$TriggerEvery15.Repetition.StopAtDurationEnd = $false
$Principal = New-ScheduledTaskPrincipal `
  -UserId $CurrentUser `
  -LogonType Interactive `
  -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 2) `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -StartWhenAvailable `
  -Hidden `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

try {
  $null = Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger @($TriggerEvery15) `
    -Principal $Principal `
    -Settings $Settings `
    -Description "Soulforge HPP read-only Buzz collection every 15 minutes (Asia/Seoul); bounded, no mutation, no reboot." `
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
  $RegisteredInterval = ""
  $RegisteredStopAtDurationEnd = ""
  $RegisteredDuration = ""
  if ($TriggerNodes.Count -eq 1) {
    $RegisteredInterval = Get-XmlNodeText `
      -Parent $TriggerNodes[0] `
      -XPath "./*[local-name()='Repetition']/*[local-name()='Interval']"
    $RegisteredStopAtDurationEnd = Get-XmlNodeText `
      -Parent $TriggerNodes[0] `
      -XPath "./*[local-name()='Repetition']/*[local-name()='StopAtDurationEnd']"
    $RegisteredDuration = Get-XmlNodeText `
      -Parent $TriggerNodes[0] `
      -XPath "./*[local-name()='Repetition']/*[local-name()='Duration']"
  }
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
  $RegisteredExecutionTimeLimit = Get-XmlNodeText `
    -Parent $SettingsNode `
    -XPath "./*[local-name()='ExecutionTimeLimit']"
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
  $RegisteredDurationValid = $RegisteredDuration -eq "" `
    -or $RegisteredDuration -match '^P\d+D'
  $RegistrationValid = $TriggerNodes.Count -eq 1 `
    -and $TriggerNodes[0].LocalName -eq "TimeTrigger" `
    -and $RegisteredInterval -eq "PT15M" `
    -and $RegisteredStopAtDurationEnd -ne "true" `
    -and $RegisteredDurationValid `
    -and $RegisteredMultipleInstancesPolicy -eq "IgnoreNew" `
    -and $RegisteredHidden -eq "true" `
    -and $RegisteredRestartCount -eq "3" `
    -and $RegisteredExecutionTimeLimit -eq "PT10M" `
    -and $RegisteredRunLevelValid `
    -and ($RegisteredPrincipalUserId -eq $CurrentSid `
      -or $RegisteredPrincipalUserId -eq $CurrentUser) `
    -and $RegisteredCommand -eq $WScriptExe `
    -and $RegisteredArguments -eq $HiddenActionArgumentLine `
    -and $RegisteredWorkingDirectory -eq $RuntimeRoot
  if (-not $RegistrationValid) {
    throw "registered buzz collect task failed exported XML attestation"
  }

  $ExportedTaskSha256 = Get-Sha256Text -Value $ExportedTaskXml
  Write-Output "buzz collect task registered and XML-attested: interval=PT15M exported_xml_sha256=$ExportedTaskSha256"
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
        throw "restored buzz collect task XML differs from the prior definition"
      }
    } else {
      $CreatedTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      if ($CreatedTask) {
        Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
      }
      if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        throw "new buzz collect task remained after rollback"
      }
    }
  } catch {
    $RollbackFailure = $_
    Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
  }
  if ($null -ne $RollbackFailure) {
    throw "buzz collect registration failed and rollback failed; the task was disabled"
  }
  throw "buzz collect registration failed; the prior task definition was restored or the new task was removed: $($RegistrationFailure.Exception.Message)"
}
