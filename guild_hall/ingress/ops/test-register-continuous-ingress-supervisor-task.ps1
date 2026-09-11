# Synthetic registrar contract: every OS task/file access below is mocked.
$ErrorActionPreference = 'Stop'
$Registrar = Join-Path $PSScriptRoot 'register-continuous-ingress-supervisor-task.ps1'
$global:IngressTestHash = 'A' * 64
$global:IngressTestState = 'Ready'
$global:IngressTestDrift = ''
$global:IngressTestRegistrations = 0
$global:IngressTestStarts = 0
$global:IngressTestEnables = 0
$global:IngressTestEnabled = $false
$global:IngressTestOrder = @()
function Test-Path { param($LiteralPath, $PathType) return $true }
function Get-FileHash { param($LiteralPath, $Algorithm) return @{ Hash = $global:IngressTestHash } }
function Get-ScheduledTask { param($TaskName, $ErrorAction) return @{ State = $global:IngressTestState } }
function New-ScheduledTaskAction {
  param($Execute, $Argument, $WorkingDirectory)
  return @{ Execute = $Execute; Argument = $Argument; WorkingDirectory = $WorkingDirectory }
}
function New-ScheduledTaskTrigger {
  param([switch]$AtLogOn, $User, [switch]$Once, $At, $RepetitionInterval)
  return @{ AtLogOn = [bool]$AtLogOn; Once = [bool]$Once; At = $At; User = $User;
    Repetition = @{ Interval = $RepetitionInterval; StopAtDurationEnd = $true } }
}
function New-ScheduledTaskPrincipal { param($UserId, $LogonType, $RunLevel) return @{} }
function New-ScheduledTaskSettingsSet {
  param([switch]$Disable, $MultipleInstances, $RestartCount, $RestartInterval, $ExecutionTimeLimit,
    [switch]$StartWhenAvailable, [switch]$AllowStartIfOnBatteries, [switch]$DontStopIfGoingOnBatteries)
  return @{ Enabled = -not [bool]$Disable; MultipleInstances = $MultipleInstances; RestartCount = $RestartCount;
    RestartInterval = $RestartInterval; ExecutionTimeLimit = $ExecutionTimeLimit }
}
function Register-ScheduledTask {
  param($TaskName, $Action, $Trigger, $Principal, $Settings, $Description, [switch]$Force, $ErrorAction)
  $global:IngressTestRegistrations++
  $global:IngressTestOrder += 'register'
  $global:IngressTestEnabled = $Settings.Enabled
  if ($global:IngressTestEnabled) { throw 'task registered enabled before attestation' }
  $global:IngressTestAction = $Action
  $global:IngressTestTriggers = $Trigger
  $global:IngressTestSettings = $Settings
  if ($Trigger.Count -ne 2 -or -not $Trigger[0].AtLogOn -or -not $Trigger[1].Once -or
      $Trigger[1].Repetition.Interval.TotalMinutes -ne 15 -or $Trigger[1].Repetition.StopAtDurationEnd) {
    throw 'invalid recovery trigger'
  }
}
function Export-ScheduledTask {
  param($TaskName)
  $global:IngressTestOrder += 'attest'
  $interval = [Xml.XmlConvert]::ToString($global:IngressTestTriggers[1].Repetition.Interval)
  $duration = ''
  $stop = 'false'
  $policy = $global:IngressTestSettings.MultipleInstances
  $args = [Security.SecurityElement]::Escape($global:IngressTestAction.Argument)
  switch ($global:IngressTestDrift) {
    'interval' { $interval = 'PT30M' }
    'duration' { $duration = '<Duration>P1D</Duration>' }
    'stop' { $stop = 'true' }
    'duplicate' { $policy = 'Parallel' }
    'action' { $args += ' --unapproved' }
  }
  return "<Task><Triggers><LogonTrigger/><TimeTrigger><Repetition><Interval>$interval</Interval>$duration<StopAtDurationEnd>$stop</StopAtDurationEnd></Repetition></TimeTrigger></Triggers><Settings><Enabled>$($global:IngressTestEnabled.ToString().ToLowerInvariant())</Enabled><MultipleInstancesPolicy>$policy</MultipleInstancesPolicy><RestartOnFailure><Count>$($global:IngressTestSettings.RestartCount)</Count><Interval>PT1M</Interval></RestartOnFailure><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings><Actions><Exec><Command>$($global:IngressTestAction.Execute)</Command><Arguments>$args</Arguments><WorkingDirectory>$($global:IngressTestAction.WorkingDirectory)</WorkingDirectory></Exec></Actions></Task>"
}
function Enable-ScheduledTask {
  param($TaskName, $ErrorAction)
  $global:IngressTestOrder += 'enable'
  $global:IngressTestEnables++
  $global:IngressTestEnabled = $true
}
function Start-ScheduledTask {
  param($TaskName)
  if (-not $global:IngressTestEnabled) { throw 'start before enable' }
  $global:IngressTestOrder += 'start'
  $global:IngressTestStarts++
}
$Parameters = @{ RuntimeRoot = $PSScriptRoot; BindingPath = (Join-Path $PSScriptRoot 'synthetic-binding.json');
  BindingDigest = ('sha256:' + ('a' * 64)); ExpectedExistingTaskSha256 = ('A' * 64); Confirm = $false }
& $Registrar @Parameters
if ($global:IngressTestRegistrations -ne 0) { throw 'audit mutated task' }
& $Registrar @Parameters -Register -Start
if ($global:IngressTestRegistrations -ne 1 -or $global:IngressTestStarts -ne 1) { throw 'stopped recovery registration failed' }
if (($global:IngressTestOrder -join ',') -ne 'register,attest,enable,start') { throw 'unsafe registration order' }
# A running task must be left intact; IgnoreNew also suppresses periodic duplicate starts.
foreach ($case in @('running', 'hash', 'interval', 'duration', 'stop', 'duplicate', 'action')) {
  $global:IngressTestState = if ($case -eq 'running') { 'Running' } else { 'Ready' }
  $global:IngressTestHash = if ($case -eq 'hash') { 'B' * 64 } else { 'A' * 64 }
  $global:IngressTestDrift = $case
  $before = $global:IngressTestRegistrations
  $failure = $null
  try { & $Registrar @Parameters -Register -Start } catch { $failure = $_.Exception.Message }
  $expected = switch ($case) {
    'running' { 'existing continuous ingress task is still running' }
    'hash' { 'existing task SHA-256 changed' }
    default { 'registered continuous supervisor task failed post-registration attestation' }
  }
  if ($failure -ne $expected -or $global:IngressTestStarts -ne 1) { throw "rejection failed: $case : $failure" }
  if ($global:IngressTestEnables -ne 1) { throw 'failed attestation enabled task' }
  if ($case -notin @('running', 'hash') -and $global:IngressTestEnabled) { throw 'failed task left enabled' }
  if ($case -in @('running', 'hash') -and $global:IngressTestRegistrations -ne $before) { throw 'precheck mutated task' }
}
Write-Output 'PASS: audit, stopped recovery, running duplicate, exact hash, interval, duration, stop, duplicate policy, action drift'
