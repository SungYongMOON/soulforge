[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [Parameter(Mandatory = $true)][string]$BindingPath,
  [Parameter(Mandatory = $true)][string]$BindingDigest,
  [string]$TaskName = "Soulforge-Continuous-Five-Lane-Ingress",
  [string]$ExpectedExistingTaskSha256,
  [switch]$Register,
  [switch]$Start
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($TaskName -ne "Soulforge-Continuous-Five-Lane-Ingress") {
  throw "continuous supervisor task name is fixed"
}
if ($BindingDigest -notmatch '^sha256:[0-9a-f]{64}$') {
  throw "continuous supervisor binding digest is invalid"
}
if ($Start -and -not $Register) {
  throw "continuous supervisor start requires registration"
}

function ConvertTo-TaskArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains('"')) { throw "task argument contains an unsupported quote character" }
  if ($Value -notmatch '\s') { return $Value }
  $Escaped = $Value -replace '(\\+)$', '$1$1'
  return '"' + $Escaped + '"'
}

$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$BindingPath = [IO.Path]::GetFullPath($BindingPath)
$Launcher = [IO.Path]::GetFullPath((Join-Path $RuntimeRoot "guild_hall\ingress\ops\run-continuous-ingress-supervisor.ps1"))
foreach ($RequiredFile in @($Launcher, $BindingPath)) {
  if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
    throw "continuous supervisor required file is missing"
  }
}

$PowerShellExe = [IO.Path]::GetFullPath((Get-Command powershell.exe -ErrorAction Stop).Source)
$ActionArguments = @(
  "-NoProfile",
  "-NonInteractive",
  "-WindowStyle", "Hidden",
  "-ExecutionPolicy", "Bypass",
  "-File", $Launcher,
  "-RuntimeRoot", $RuntimeRoot,
  "-BindingPath", $BindingPath,
  "-BindingDigest", $BindingDigest
)
$ActionArgumentLine = ($ActionArguments | ForEach-Object { ConvertTo-TaskArgument -Value $_ }) -join " "

$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$TaskFile = Join-Path $env:WINDIR "System32\Tasks\$TaskName"
if ($Existing) {
  if ($Existing.State -eq "Running") {
    throw "existing continuous ingress task is still running"
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
  Write-Output "continuous supervisor task audit passed: mode=single-at-logon hidden=true repeated-trigger=false mutation=false"
  return
}

$CurrentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not $PSCmdlet.ShouldProcess($TaskName, "replace repeating ingress task with one hidden at-logon supervisor")) {
  Write-Output "continuous supervisor task registration skipped"
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
  -Description "Soulforge HPP single hidden continuous ingress supervisor; no repeated trigger." `
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
  throw "registered continuous supervisor task failed post-registration attestation"
}

if ($Start) {
  Start-ScheduledTask -TaskName $TaskName
}
Write-Output "continuous supervisor task registered: mode=single-at-logon hidden=true repeated-trigger=false started=$([bool]$Start)"
