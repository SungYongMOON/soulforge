[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][string]$VoiceRoot,
  [Parameter(Mandatory = $true)][string]$ProfilePath,
  [Parameter(Mandatory = $true)][string]$ProfileSha256,
  [Parameter(Mandatory = $true)][string]$AsrBinRoot,
  [Parameter(Mandatory = $true)][string]$AsrSha256,
  [Parameter(Mandatory = $true)][string]$StateRoot,
  [ValidateRange(60, 86400)][int]$PollSeconds = 900,
  [ValidateRange(1, 16)][int]$MaxAsrSessions = 1,
  [ValidateRange(1, 1000)][int]$MaxLabelSessions = 20
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

function Assert-NoReparsePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $Cursor = [IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $Cursor) {
      $Item = Get-Item -LiteralPath $Cursor -Force
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "voice label supervisor path contains a reparse point"
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

function Assert-SafeStateChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Candidate
  )
  $Root = $Root.TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
  $Candidate = [IO.Path]::GetFullPath($Candidate)
  if (-not $Candidate.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "voice label supervisor state child escaped its strict root"
  }
}

function Assert-SafeStateTree {
  param([Parameter(Mandatory = $true)][string]$Root)
  $Root = [IO.Path]::GetFullPath((Get-Item -LiteralPath $Root -Force).FullName)
  $Pending = [Collections.Generic.Queue[string]]::new()
  $Pending.Enqueue($Root)
  while ($Pending.Count -gt 0) {
    $Current = $Pending.Dequeue()
    foreach ($Child in @(Get-ChildItem -LiteralPath $Current -Force)) {
      if (($Child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "voice label supervisor state tree contains a reparse point"
      }
      $ChildPath = [IO.Path]::GetFullPath($Child.FullName)
      Assert-SafeStateChildPath -Root $Root -Candidate $ChildPath
      if ($Child.PSIsContainer) { $Pending.Enqueue($ChildPath) }
    }
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

foreach ($Digest in @($ProfileSha256, $AsrSha256)) {
  if ($Digest -notmatch '^[0-9a-f]{64}$') {
    throw "voice label supervisor digest is invalid"
  }
}

$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
$VoiceRoot = [IO.Path]::GetFullPath($VoiceRoot)
$ProfilePath = [IO.Path]::GetFullPath($ProfilePath)
$AsrBinRoot = [IO.Path]::GetFullPath($AsrBinRoot)
$StateRoot = [IO.Path]::GetFullPath($StateRoot)
$SupervisorCli = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot "guild_hall\voice_capture\continuous_label_supervisor_cli.mjs"))
$AsrBinary = [IO.Path]::GetFullPath((Join-Path $AsrBinRoot "whisper-cli.exe"))

foreach ($ProtectedPath in @($RuntimeRoot, $RepoRoot, $VoiceRoot, $ProfilePath, $AsrBinRoot, $AsrBinary, $StateRoot)) {
  Assert-NoReparsePath -Path $ProtectedPath
}
foreach ($RequiredFile in @($SupervisorCli, $ProfilePath, $AsrBinary)) {
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
$AsrBinary = [IO.Path]::GetFullPath((Get-Item -LiteralPath $AsrBinary -Force).FullName)
$SupervisorCli = [IO.Path]::GetFullPath((Get-Item -LiteralPath $SupervisorCli -Force).FullName)
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

$ActualProfileSha256 = (Get-FileHash -LiteralPath $ProfilePath -Algorithm SHA256).Hash.ToLowerInvariant()
$ActualAsrSha256 = (Get-FileHash -LiteralPath $AsrBinary -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualProfileSha256 -ne $ProfileSha256) {
  throw "voice label supervisor profile digest mismatch"
}
if ($ActualAsrSha256 -ne $AsrSha256) {
  throw "voice label supervisor ASR digest mismatch"
}

New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
Assert-NoReparsePath -Path $StateRoot
$StateRoot = [IO.Path]::GetFullPath((Get-Item -LiteralPath $StateRoot -Force).FullName)
Assert-SafeStateTree -Root $StateRoot
$env:SOULFORGE_VOICE_LABEL_EXPECTED_STATE_ROOT = $StateRoot
$env:SOULFORGE_VOICE_LABEL_EXPECTED_ASR_BIN_ROOT = $AsrBinRoot
$env:SOULFORGE_VOICE_LABEL_EXPECTED_RUNTIME_ROOT = $RuntimeRoot
$LogRoot = [IO.Path]::GetFullPath((Join-Path $StateRoot "logs"))
Assert-SafeStateChildPath -Root $StateRoot -Candidate $LogRoot
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
Assert-SafeStateTree -Root $StateRoot

$InstanceLockPath = [IO.Path]::GetFullPath((Join-Path $StateRoot "supervisor.instance.lock"))
foreach ($StateChild in @(
  $InstanceLockPath,
  (Join-Path $StateRoot "worker.lock"),
  (Join-Path $StateRoot "health.json"),
  (Join-Path $StateRoot "receipts"),
  $LogRoot
)) {
  Assert-SafeStateChildPath -Root $StateRoot -Candidate $StateChild
}
$InstanceLock = $null
$Mutex = $null
$Acquired = $false
try {
  try {
    Assert-SafeStateTree -Root $StateRoot
    $InstanceLock = [IO.File]::Open(
      $InstanceLockPath,
      [IO.FileMode]::OpenOrCreate,
      [IO.FileAccess]::ReadWrite,
      [IO.FileShare]::None
    )
  } catch [IO.IOException] {
    Write-Output "voice label supervisor already running; duplicate launch ignored"
    return
  }

  $Mutex = [Threading.Mutex]::new($false, "Local\Soulforge.HPP.VoiceLabel.Supervisor")
  try {
    $Acquired = $Mutex.WaitOne(0)
  } catch [Threading.AbandonedMutexException] {
    $Acquired = $true
  }
  if (-not $Acquired) {
    Write-Output "voice label supervisor already running; duplicate launch ignored"
    return
  }

  $NodeExe = [IO.Path]::GetFullPath((Get-Command node.exe -ErrorAction Stop).Source)
  $env:PATH = "$AsrBinRoot;$env:PATH"
  $Stamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
  $StdoutLog = Join-Path $LogRoot "$Stamp.stdout.jsonl"
  $StderrLog = Join-Path $LogRoot "$Stamp.stderr.jsonl"
  Assert-SafeStateTree -Root $StateRoot
  Assert-SafeStateChildPath -Root $LogRoot -Candidate $StdoutLog
  Assert-SafeStateChildPath -Root $LogRoot -Candidate $StderrLog
  $Arguments = @(
    $SupervisorCli,
    "--repo-root", $RepoRoot,
    "--voice-root", $VoiceRoot,
    "--profile", $ProfilePath,
    "--profile-sha256", $ProfileSha256,
    "--asr-sha256", $AsrSha256,
    "--state-root", $StateRoot,
    "--poll-seconds", $PollSeconds,
    "--max-asr-sessions", $MaxAsrSessions,
    "--max-label-sessions", $MaxLabelSessions,
    "--apply"
  )
  & $NodeExe @Arguments 1>> $StdoutLog 2>> $StderrLog
  exit $LASTEXITCODE
} finally {
  if ($Acquired) {
    try { $Mutex.ReleaseMutex() } catch { }
  }
  if ($Mutex) { $Mutex.Dispose() }
  if ($InstanceLock) { $InstanceLock.Dispose() }
}
