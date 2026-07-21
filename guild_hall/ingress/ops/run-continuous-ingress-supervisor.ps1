[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [Parameter(Mandatory = $true)][string]$BindingPath,
  [Parameter(Mandatory = $true)][string]$BindingDigest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($BindingDigest -notmatch '^sha256:[0-9a-f]{64}$') {
  throw "continuous supervisor binding digest is invalid"
}

$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$BindingPath = [IO.Path]::GetFullPath($BindingPath)
$SupervisorCli = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot "guild_hall\ingress\continuous_supervisor_cli.mjs"))
if (-not (Test-Path -LiteralPath $SupervisorCli -PathType Leaf)) {
  throw "continuous supervisor CLI is missing"
}
if (-not (Test-Path -LiteralPath $BindingPath -PathType Leaf)) {
  throw "continuous supervisor binding is missing"
}

$ExpectedDigest = $BindingDigest.Substring("sha256:".Length)
$ActualDigest = (Get-FileHash -LiteralPath $BindingPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualDigest -ne $ExpectedDigest) {
  throw "continuous supervisor binding digest mismatch"
}

$NodeCommand = Get-Command node.exe -ErrorAction Stop
$NodeExe = [IO.Path]::GetFullPath($NodeCommand.Source)
$ControlRoot = [IO.Path]::GetFullPath((Split-Path -Parent $BindingPath))
$LogRoot = [IO.Path]::GetFullPath((Join-Path $ControlRoot "logs\continuous-supervisor"))
if (-not $LogRoot.StartsWith($ControlRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "continuous supervisor log root escaped the protected control root"
}
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

$Mutex = [Threading.Mutex]::new($false, "Local\Soulforge.HPP.ContinuousIngress.Supervisor")
$Acquired = $false
try {
  try {
    $Acquired = $Mutex.WaitOne(0)
  } catch [Threading.AbandonedMutexException] {
    $Acquired = $true
  }
  if (-not $Acquired) {
    throw "continuous supervisor already running"
  }

  $Stamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
  $StdoutLog = Join-Path $LogRoot "$Stamp.stdout.jsonl"
  $StderrLog = Join-Path $LogRoot "$Stamp.stderr.jsonl"
  $ProcessArguments = @(
    $SupervisorCli,
    "--config", $BindingPath,
    "--config-digest", $BindingDigest,
    "--apply"
  )

  & $NodeExe @ProcessArguments 1>> $StdoutLog 2>> $StderrLog
  exit $LASTEXITCODE
} finally {
  if ($Acquired) {
    try { $Mutex.ReleaseMutex() } catch { }
  }
  $Mutex.Dispose()
}
