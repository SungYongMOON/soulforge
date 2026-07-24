[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][string]$VoiceRoot,
  [Parameter(Mandatory = $true)][string]$ProfilePath,
  [Parameter(Mandatory = $true)][string]$ProfileSha256,
  [Parameter(Mandatory = $true)][string]$AsrBinRoot,
  [Parameter(Mandatory = $true)][string]$AsrSha256,
  [Parameter(Mandatory = $true)][string]$StateRoot,
  [string]$TaskName = "Soulforge-HPP-Voice-ASR-Label",
  [string]$ExpectedExistingTaskSha256,
  [ValidateRange(60, 86400)][int]$PollSeconds = 900,
  [ValidateRange(1, 16)][int]$MaxAsrSessions = 1,
  [ValidateRange(1, 1000)][int]$MaxLabelSessions = 20,
  [switch]$Register,
  [switch]$Start
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-SameOrChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Candidate
  )
  $Parent = $Parent.TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
  return $Candidate.Equals($Parent, [StringComparison]::OrdinalIgnoreCase) `
    -or $Candidate.StartsWith($Parent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Test-UnsafePathItemReparse {
  param(
    [Parameter(Mandatory = $true)][object]$Item,
    [Parameter(Mandatory = $true)][string]$ExpectedPath
  )
  if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) { return $false }

  $LinkType = if ($null -ne $Item.PSObject.Properties["LinkType"]) {
    [string]$Item.LinkType
  } else {
    ""
  }
  $Targets = @(
    if ($null -ne $Item.PSObject.Properties["Target"]) {
      $Item.Target | Where-Object { $null -ne $_ -and [string]$_ -ne "" }
    }
  )
  $ExactFullName = [IO.Path]::GetFullPath([string]$Item.FullName).Equals(
    [IO.Path]::GetFullPath($ExpectedPath),
    [StringComparison]::OrdinalIgnoreCase
  )
  if ($LinkType -ne "" -or $Targets.Count -gt 0 -or -not $ExactFullName) { return $true }

  $Tag = $null
  if ($null -ne $Item.PSObject.Properties["ReparseTag"]) {
    $Tag = [uint64]$Item.ReparseTag
  } else {
    $FsUtil = Join-Path $env:SystemRoot "System32\fsutil.exe"
    $TagOutput = @(& $FsUtil reparsepoint query $ExpectedPath 2>$null)
    if ($LASTEXITCODE -eq 0) {
      $TagMatch = [regex]::Match(($TagOutput -join "`n"), '0x([0-9A-Fa-f]{8})')
      if ($TagMatch.Success) {
        $Tag = [Convert]::ToUInt64($TagMatch.Groups[1].Value, 16)
      }
    }
  }
  if ($null -eq $Tag) { return $true }
  if (($Tag -band [uint64]0x20000000) -ne 0) { return $true }
  $CloudTagMask = [Convert]::ToUInt64("FFFF0FFF", 16)
  $CloudTagBase = [Convert]::ToUInt64("9000001A", 16)
  return ($Tag -band $CloudTagMask) -ne $CloudTagBase
}

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (Test-UnsafePathItemReparse -Item $Item -ExpectedPath $Cursor) {
        throw "voice label supervisor path contains a link or name-surrogate reparse point"
      }
    }
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) { break }
    $Cursor = $Parent.FullName
  }
}

function Assert-DisjointPath {
  param(
    [Parameter(Mandatory = $true)][string]$Left,
    [Parameter(Mandatory = $true)][string]$Right
  )
  if ((Test-SameOrChildPath -Parent $Left -Candidate $Right) `
      -or (Test-SameOrChildPath -Parent $Right -Candidate $Left)) {
    throw "voice label supervisor protected roots overlap"
  }
}

function Resolve-PlannedDirectoryPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  $Missing = [Collections.Generic.List[string]]::new()
  while (-not (Test-Path -LiteralPath $Cursor)) {
    $Missing.Insert(0, [IO.Path]::GetFileName($Cursor))
    $Parent = [IO.Directory]::GetParent($Cursor)
    if ($null -eq $Parent) {
      throw "voice label supervisor state root has no existing ancestor"
    }
    $Cursor = $Parent.FullName
  }
  if (-not (Test-Path -LiteralPath $Cursor -PathType Container)) {
    throw "voice label supervisor state root ancestor is not a directory"
  }
  $Resolved = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Cursor -Force).FullName)
  foreach ($Part in $Missing) {
    $Resolved = [IO.Path]::GetFullPath((Join-Path $Resolved $Part))
  }
  return $Resolved
}

if ($TaskName -ne "Soulforge-HPP-Voice-ASR-Label") {
  throw "voice label supervisor task name is fixed"
}
if ($Start -and -not $Register) {
  throw "voice label supervisor start requires registration"
}
foreach ($Digest in @($ProfileSha256, $AsrSha256)) {
  if ($Digest -notmatch '^[0-9a-f]{64}$') {
    throw "voice label supervisor digest is invalid"
  }
}

function ConvertTo-TaskArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains('"')) { throw "task argument contains an unsupported quote character" }
  if ($Value -notmatch '\s') { return $Value }
  $Escaped = $Value -replace '(\\+)$', '$1$1'
  return '"' + $Escaped + '"'
}

$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
$VoiceRoot = [IO.Path]::GetFullPath($VoiceRoot)
$ProfilePath = [IO.Path]::GetFullPath($ProfilePath)
$AsrBinRoot = [IO.Path]::GetFullPath($AsrBinRoot)
$StateRoot = [IO.Path]::GetFullPath($StateRoot)
$Launcher = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot "guild_hall\voice_capture\ops\run-continuous-label-supervisor.ps1"))
foreach ($ProtectedPath in @($RuntimeRoot, $RepoRoot, $VoiceRoot, $ProfilePath, $AsrBinRoot, $StateRoot)) {
  Assert-NoReparsePath -Path $ProtectedPath
}
foreach ($RequiredFile in @($Launcher, $ProfilePath, (Join-Path $AsrBinRoot "whisper-cli.exe"))) {
  if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
    throw "voice label supervisor required file is missing"
  }
}
if (-not (Test-Path -LiteralPath $VoiceRoot -PathType Container)) {
  throw "voice label supervisor voice root is missing"
}
if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
  throw "voice label supervisor repository root is missing"
}
if (-not (Test-Path -LiteralPath $RuntimeRoot -PathType Container)) {
  throw "voice label supervisor runtime root is missing"
}
if (-not (Test-Path -LiteralPath $AsrBinRoot -PathType Container)) {
  throw "voice label supervisor ASR bin root is missing"
}
$RuntimeRoot = [IO.Path]::GetFullPath((Get-Item -LiteralPath $RuntimeRoot -Force).FullName)
$RepoRoot = [IO.Path]::GetFullPath((Get-Item -LiteralPath $RepoRoot -Force).FullName)
$VoiceRoot = [IO.Path]::GetFullPath((Get-Item -LiteralPath $VoiceRoot -Force).FullName)
$ProfilePath = [IO.Path]::GetFullPath((Get-Item -LiteralPath $ProfilePath -Force).FullName)
$AsrBinRoot = [IO.Path]::GetFullPath((Get-Item -LiteralPath $AsrBinRoot -Force).FullName)
$Launcher = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Launcher -Force).FullName)
$StateRoot = Resolve-PlannedDirectoryPath -Path $StateRoot
$null = Assert-DisjointPath -Left $RuntimeRoot -Right $RepoRoot
$ProfileConfigRoot = [IO.Path]::GetFullPath((Join-Path $VoiceRoot "config"))
if (-not (Test-Path -LiteralPath $ProfileConfigRoot -PathType Container) `
    -or -not (Test-SameOrChildPath -Parent $ProfileConfigRoot -Candidate $ProfilePath)) {
  throw "voice label supervisor profile escaped the voice config root"
}
if ([IO.Path]::GetPathRoot($StateRoot) -notmatch '^[A-Za-z]:\\$') {
  throw "voice label supervisor state root must use an explicit local drive root"
}
foreach ($ProtectedRoot in @($RuntimeRoot, $RepoRoot, $VoiceRoot, $ProfileConfigRoot, $AsrBinRoot)) {
  Assert-DisjointPath -Left $ProtectedRoot -Right $StateRoot
}

$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)
$ActionArguments = @(
  "-NoProfile",
  "-NonInteractive",
  "-WindowStyle", "Hidden",
  "-ExecutionPolicy", "Bypass",
  "-File", $Launcher,
  "-RuntimeRoot", $RuntimeRoot,
  "-RepoRoot", $RepoRoot,
  "-VoiceRoot", $VoiceRoot,
  "-ProfilePath", $ProfilePath,
  "-ProfileSha256", $ProfileSha256,
  "-AsrBinRoot", $AsrBinRoot,
  "-AsrSha256", $AsrSha256,
  "-StateRoot", $StateRoot,
  "-PollSeconds", $PollSeconds,
  "-MaxAsrSessions", $MaxAsrSessions,
  "-MaxLabelSessions", $MaxLabelSessions
)
$ActionArgumentLine = ($ActionArguments | ForEach-Object { ConvertTo-TaskArgument -Value ([string]$_) }) -join " "

$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$TaskFile = Join-Path $env:WINDIR "System32\Tasks\$TaskName"
if ($Existing) {
  if ($Existing.State -eq "Running") {
    throw "existing voice label supervisor task is still running"
  }
  if (-not $ExpectedExistingTaskSha256 -or $ExpectedExistingTaskSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "existing task replacement requires its exact SHA-256"
  }
  if (-not (Test-Path -LiteralPath $TaskFile -PathType Leaf)) {
    throw "existing task file is unavailable"
  }
  $ActualTaskSha256 = (Get-FileHash -LiteralPath $TaskFile -Algorithm SHA256).Hash
  if ($ActualTaskSha256 -ne $ExpectedExistingTaskSha256.ToUpperInvariant()) {
    throw "existing task SHA-256 changed"
  }
}

if (-not $Register) {
  Write-Output "voice label supervisor registration inputs validated: existing_task_present=$([bool]$Existing) mutation=false"
  return
}

$CurrentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not $PSCmdlet.ShouldProcess($TaskName, "register and optionally start the hidden voice ASR and label supervisor")) {
  Write-Output "voice label supervisor task registration skipped"
  return
}

$Action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $ActionArgumentLine -WorkingDirectory $RuntimeRoot
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$null = Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
  -Principal $Principal -Settings $Settings `
  -Description "Soulforge HPP hidden voice independent ASR and semantic label supervisor." `
  -Force -ErrorAction Stop

[xml]$RegisteredXml = Export-ScheduledTask -TaskName $TaskName
$TriggerNodes = @($RegisteredXml.Task.Triggers.ChildNodes)
$RegistrationValid = $TriggerNodes.Count -eq 1 `
  -and $TriggerNodes[0].LocalName -eq "LogonTrigger" `
  -and $null -eq $TriggerNodes[0].SelectSingleNode("./*[local-name()='Repetition']") `
  -and $RegisteredXml.Task.Settings.MultipleInstancesPolicy -eq "IgnoreNew" `
  -and $RegisteredXml.Task.Actions.Exec.Command -eq $PowerShellExe `
  -and $RegisteredXml.Task.Actions.Exec.Arguments -match '-WindowStyle\s+Hidden'
if (-not $RegistrationValid) {
  throw "registered voice label supervisor task failed post-registration attestation"
}

if ($Start) {
  Start-ScheduledTask -TaskName $TaskName
}
Write-Output "voice label supervisor task registered: hidden=true at_logon=true started=$([bool]$Start)"
