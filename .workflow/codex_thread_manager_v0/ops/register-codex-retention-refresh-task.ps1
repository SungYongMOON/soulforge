[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [Parameter(Mandatory = $true)][string]$ActivityRoot,
  [string]$TaskName = "Soulforge-Codex-Retention-Refresh",
  [string]$ExpectedExistingTaskSha256,
  [switch]$Register,
  [switch]$Start
)

# Canonical, report-only Windows Scheduled Task procedure for keeping
# reports/codex_retention/current.json inside its 24h freshness window. This
# script is not executed as part of any automated gate or CI: it is the
# reviewed artifact the manager installs later, after the exact packet here
# has been human-approved. Running it without -Register only validates
# inputs and, if a task is already registered, reports its current exported
# digest without any mutation; -Register requires an explicit
# -ExpectedExistingTaskSha256 to replace an existing task, matching the same
# guard already used by
# guild_hall/voice_capture/ops/register-continuous-label-supervisor-task.ps1.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($TaskName -ne "Soulforge-Codex-Retention-Refresh") {
  throw "codex retention refresh task name is fixed"
}
if ($Start -and -not $Register) {
  throw "codex retention refresh start requires registration"
}

# Well under the 24h freshness window this refresh exists to protect. Fixed
# to match the JS planner's REFRESH_INTERVAL_HOURS constant; not a caller
# selectable knob.
$RefreshIntervalHours = 6
# Every Get-ScheduledTask/Register-ScheduledTask/Export-ScheduledTask/
# Start-ScheduledTask/Unregister-ScheduledTask call below is pinned to this
# exact root TaskPath, so a same-named task filed under a different path is
# never matched, replaced, or removed.
$TaskPath = "\"

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "codex retention refresh path contains a reparse point"
      }
    }
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) { break }
    $Cursor = $Parent.FullName
  }
}

function ConvertTo-TaskArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains('"')) { throw "task argument contains an unsupported quote character" }
  if ($Value -notmatch '\s') { return $Value }
  $Escaped = $Value -replace '(\\+)$', '$1$1'
  return '"' + $Escaped + '"'
}

function Get-CodexRetentionTaskExportDigest {
  # Compute the existing-task guard from a stable exported-task XML digest
  # rather than reading %WINDIR%\System32\Tasks directly: Export-ScheduledTask
  # is the supported API surface and its output is stable across repeated
  # exports of an unchanged task.
  param(
    [Parameter(Mandatory = $true)][string]$TaskName,
    [Parameter(Mandatory = $true)][string]$TaskPath
  )
  $Exported = Export-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction Stop
  $Bytes = [Text.Encoding]::UTF8.GetBytes($Exported)
  $Sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $HashBytes = $Sha256.ComputeHash($Bytes)
  } finally {
    $Sha256.Dispose()
  }
  return ([BitConverter]::ToString($HashBytes) -replace '-', '').ToLowerInvariant()
}

$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$ActivityRoot = [IO.Path]::GetFullPath($ActivityRoot)
$SourceScriptPath = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot ".workflow\codex_thread_manager_v0\codex_retention_automation_cli.mjs"))
$Launcher = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot ".workflow\codex_thread_manager_v0\ops\run-codex-retention-refresh.ps1"))
$HiddenLauncher = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot ".workflow\codex_thread_manager_v0\ops\run-codex-retention-refresh-hidden.vbs"))

foreach ($ProtectedPath in @($RuntimeRoot, $ActivityRoot, $SourceScriptPath, $Launcher, $HiddenLauncher)) {
  Assert-NoReparsePath -Path $ProtectedPath
}
foreach ($RequiredFile in @($SourceScriptPath, $Launcher, $HiddenLauncher)) {
  if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
    throw "codex retention refresh required file is missing (source disabled or moved)"
  }
}
if (-not (Test-Path -LiteralPath $RuntimeRoot -PathType Container)) {
  throw "codex retention refresh runtime root is missing"
}

$NodePath = [IO.Path]::GetFullPath((Get-Command node.exe -ErrorAction Stop).Source)
$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)
$WScriptExe = [IO.Path]::GetFullPath((Join-Path $env:SystemRoot "System32\wscript.exe"))
$ActionArguments = @(
  "-NoProfile",
  "-NonInteractive",
  "-WindowStyle", "Hidden",
  "-ExecutionPolicy", "Bypass",
  "-File", $Launcher,
  "-NodePath", $NodePath,
  "-SourceScriptPath", $SourceScriptPath,
  "-LocalRoot", $RuntimeRoot,
  "-ActivityRoot", $ActivityRoot
)
$HiddenActionArguments = @("//B", "//NoLogo", $HiddenLauncher, $PowerShellExe) + $ActionArguments
$ActionArgumentLine = ($HiddenActionArguments | ForEach-Object { ConvertTo-TaskArgument -Value ([string]$_) }) -join " "

$Existing = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue
$ExistingDigest = $null
if ($Existing) {
  if ($Existing.State -eq "Running") {
    throw "existing codex retention refresh task is still running"
  }
  $ExistingDigest = Get-CodexRetentionTaskExportDigest -TaskName $TaskName -TaskPath $TaskPath
}

if (-not $Register) {
  # Dry run: report the current sanitized digest (when a task already exists)
  # without registering, replacing, or otherwise mutating anything. Actual
  # replacement below still requires an exact -ExpectedExistingTaskSha256
  # match against this same digest.
  Write-Output "codex retention refresh registration inputs validated: existing_task_present=$([bool]$Existing) current_task_sha256=$ExistingDigest mutation=false"
  return
}

if ($Existing) {
  if (-not $ExpectedExistingTaskSha256 -or $ExpectedExistingTaskSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "existing task replacement requires its exact SHA-256"
  }
  if ($ExistingDigest -ne $ExpectedExistingTaskSha256.ToLowerInvariant()) {
    throw "existing task SHA-256 changed"
  }
}

$CurrentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not $PSCmdlet.ShouldProcess($TaskName, "register the hidden, report-only codex retention refresh task")) {
  Write-Output "codex retention refresh task registration skipped"
  return
}

$Action = New-ScheduledTaskAction -Execute $WScriptExe -Argument $ActionArgumentLine -WorkingDirectory $RuntimeRoot
# The first automatic run must land strictly in the future: anchoring the
# repeating trigger at a fixed past epoch would let Task Scheduler compute an
# imminent (sometimes effectively immediate) first occurrence. -Start is the
# only supported way to run this task immediately after registration.
$FirstRun = (Get-Date).AddHours($RefreshIntervalHours)
$RefreshTrigger = New-ScheduledTaskTrigger -Once -At $FirstRun `
  -RepetitionInterval (New-TimeSpan -Hours $RefreshIntervalHours)
$RefreshTrigger.Repetition.StopAtDurationEnd = $false
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# Transactional registration: capture the exact prior definition before any
# replacement so a failed attestation below can restore it verbatim.
$WasReplacing = [bool]$Existing
$PriorExportedXml = if ($WasReplacing) { Export-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction Stop } else { $null }

$null = Register-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Action $Action -Trigger $RefreshTrigger `
  -Principal $Principal -Settings $Settings `
  -Description "Soulforge report-only Codex retention freshness refresh. Never archives, deletes, prunes, or mutates anything beyond reports/codex_retention/current.json and its Activity event." `
  -Force -ErrorAction Stop

[xml]$RegisteredXml = Export-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath
$TriggerNodes = @($RegisteredXml.Task.Triggers.ChildNodes)
$RefreshNodes = @($TriggerNodes | Where-Object { $_.LocalName -eq "TimeTrigger" })
$RefreshTriggerNode = if ($RefreshNodes.Count -eq 1) { $RefreshNodes[0] } else { $null }
$RepetitionNode = if ($null -ne $RefreshTriggerNode) { $RefreshTriggerNode.SelectSingleNode("./*[local-name()='Repetition']") } else { $null }
$ExpectedInterval = [Xml.XmlConvert]::ToString((New-TimeSpan -Hours $RefreshIntervalHours))
$RefreshIntervalNode = if ($null -ne $RepetitionNode) { $RepetitionNode.SelectSingleNode("./*[local-name()='Interval']") } else { $null }
$StopAtDurationEndNode = if ($null -ne $RepetitionNode) { $RepetitionNode.SelectSingleNode("./*[local-name()='StopAtDurationEnd']") } else { $null }
$DurationNode = if ($null -ne $RepetitionNode) { $RepetitionNode.SelectSingleNode("./*[local-name()='Duration']") } else { $null }
$EnabledNode = if ($null -ne $RefreshTriggerNode) { $RefreshTriggerNode.SelectSingleNode("./*[local-name()='Enabled']") } else { $null }
$StartBoundaryNode = if ($null -ne $RefreshTriggerNode) { $RefreshTriggerNode.SelectSingleNode("./*[local-name()='StartBoundary']") } else { $null }
$RegistrationValid = $TriggerNodes.Count -eq 1 `
  -and $RefreshNodes.Count -eq 1 `
  -and $null -ne $RefreshIntervalNode `
  -and $RefreshIntervalNode.InnerText -eq $ExpectedInterval `
  -and ($null -eq $EnabledNode -or $EnabledNode.InnerText -eq "true") `
  -and ($null -eq $StopAtDurationEndNode -or $StopAtDurationEndNode.InnerText -eq "false") `
  -and ($null -eq $DurationNode -or [string]::IsNullOrEmpty($DurationNode.InnerText)) `
  -and $null -ne $StartBoundaryNode -and ([datetime]$StartBoundaryNode.InnerText) -gt (Get-Date) `
  -and $RegisteredXml.Task.Settings.MultipleInstancesPolicy -eq "IgnoreNew" `
  -and $RegisteredXml.Task.Actions.Exec.Command -eq $WScriptExe `
  -and $RegisteredXml.Task.Actions.Exec.Arguments -match '^//B\s+//NoLogo\s+' `
  -and $RegisteredXml.Task.Actions.Exec.Arguments -match 'run-codex-retention-refresh-hidden\.vbs' `
  -and $RegisteredXml.Task.Actions.Exec.Arguments -match '-WindowStyle\s+Hidden' `
  -and $RegisteredXml.Task.Actions.Exec.Arguments -notmatch '--apply|--delete|--archive|--remove|--prune|--branch-delete'

if (-not $RegistrationValid) {
  if ($WasReplacing) {
    # Bounded rollback: restore the exact prior task definition captured
    # above before this replacement. This never deletes or archives
    # anything; it only re-registers this same TaskName/TaskPath with its
    # own prior XML.
    $null = Register-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Xml $PriorExportedXml -Force -ErrorAction Stop
    throw "registered codex retention refresh task failed post-registration attestation; restored prior task definition"
  } else {
    # Bounded rollback: remove only this exact just-created task at this
    # exact TaskPath. No other task, path, or general deletion authority is
    # exercised.
    Unregister-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Confirm:$false -ErrorAction Stop
    throw "registered codex retention refresh task failed post-registration attestation; removed the just-created task"
  }
}

if ($Start) {
  Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath
}
Write-Output "codex retention refresh task registered: hidden=true report_only=true refresh_interval_hours=$RefreshIntervalHours started=$([bool]$Start)"
