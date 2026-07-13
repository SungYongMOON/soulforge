[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [string]$RuntimeRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..\..")).Path,
  [ValidatePattern('^[^\\/:*?"<>|]+$')]
  [string]$TaskName = "Soulforge dev-ERP foreground",
  [string]$DatabasePath = "",
  [switch]$SecureCookie,
  [switch]$Register,
  [string[]]$HandoffFromTaskId = @()
)

$ErrorActionPreference = "Stop"

function Resolve-LexicalPath {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [string]$BasePath = ""
  )

  $Expanded = [Environment]::ExpandEnvironmentVariables($Value)
  if ($Expanded -match '%[^%]+%') {
    throw "Path contains an unresolved environment variable."
  }
  if ([IO.Path]::IsPathRooted($Expanded)) {
    return [IO.Path]::GetFullPath($Expanded)
  }
  if ([string]::IsNullOrWhiteSpace($BasePath)) {
    throw "Relative path has no explicit base directory."
  }
  return [IO.Path]::GetFullPath((Join-Path $BasePath $Expanded))
}

function ConvertTo-TaskArgument {
  param([Parameter(Mandatory = $true)][string]$Value)

  if ($Value.Contains('"')) {
    throw "Task argument contains an unsupported quote character."
  }
  if ($Value -notmatch '\s') { return $Value }
  $Escaped = $Value -replace '(\\+)$', '$1$1'
  return '"' + $Escaped + '"'
}

function Get-TaskIdentifier {
  param([Parameter(Mandatory = $true)]$Task)

  $Path = [string]$Task.TaskPath
  if ([string]::IsNullOrWhiteSpace($Path)) { $Path = "\" }
  if (-not $Path.StartsWith("\")) { $Path = "\$Path" }
  if (-not $Path.EndsWith("\")) { $Path += "\" }
  return "$Path$($Task.TaskName)"
}

function Test-TaskEnabled {
  param([Parameter(Mandatory = $true)]$Task)

  if ([string]$Task.State -eq "Disabled") { return $false }
  $EnabledProperty = if ($null -ne $Task.Settings) {
    $Task.Settings.PSObject.Properties["Enabled"]
  } else {
    $null
  }
  if ($null -ne $EnabledProperty -and $EnabledProperty.Value -eq $false) {
    return $false
  }
  return $true
}

if (-not ("DevErpScheduledTaskCommandLine" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class DevErpScheduledTaskCommandLine {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern IntPtr CommandLineToArgvW(string commandLine, out int argc);

  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr value);

  public static string[] Split(string commandLine) {
    if (String.IsNullOrWhiteSpace(commandLine)) return new string[0];
    int argc;
    IntPtr argv = CommandLineToArgvW(commandLine, out argc);
    if (argv == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      string[] result = new string[argc];
      for (int i = 0; i < argc; i++) {
        result[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(argv, i * IntPtr.Size));
      }
      return result;
    } finally {
      LocalFree(argv);
    }
  }
}
"@
}

function Get-ArgumentValue {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Name
  )

  for ($Index = 0; $Index -lt $Arguments.Count; $Index++) {
    if ([string]::Equals($Arguments[$Index], $Name, [StringComparison]::OrdinalIgnoreCase)) {
      if ($Index + 1 -ge $Arguments.Count) { throw "$Name has no value." }
      return $Arguments[$Index + 1]
    }
  }
  return $null
}

function Resolve-TaskActionDatabase {
  param([Parameter(Mandatory = $true)]$Action)

  $Execute = [Environment]::ExpandEnvironmentVariables([string]$Action.Execute)
  $ArgumentsText = [string]$Action.Arguments
  $WorkingDirectory = [Environment]::ExpandEnvironmentVariables([string]$Action.WorkingDirectory)
  $BackendHint = "$Execute $ArgumentsText" -match '(?i)(run-dev-erp-background\.ps1|server\.mjs)'

  try {
    [string[]]$Arguments = [DevErpScheduledTaskCommandLine]::Split($ArgumentsText)
    $ExecutableName = [IO.Path]::GetFileNameWithoutExtension($Execute)

    if ($ExecutableName -in @("powershell", "pwsh")) {
      $LauncherValue = Get-ArgumentValue -Arguments $Arguments -Name "-File"
      if ($null -eq $LauncherValue) {
        return [pscustomobject]@{ Backend = $BackendHint; Known = $false; DatabasePath = $null }
      }
      $LauncherPath = Resolve-LexicalPath -Value $LauncherValue -BasePath $WorkingDirectory
      if ([IO.Path]::GetFileName($LauncherPath) -ne "run-dev-erp-background.ps1") {
        return [pscustomobject]@{ Backend = $BackendHint; Known = $false; DatabasePath = $null }
      }
      $ActionApp = Split-Path -Parent (Split-Path -Parent $LauncherPath)
      $DatabaseValue = Get-ArgumentValue -Arguments $Arguments -Name "-DatabasePath"
      $ResolvedDatabase = if ($null -eq $DatabaseValue) {
        Resolve-LexicalPath -Value "data\dev-erp.db" -BasePath $ActionApp
      } else {
        Resolve-LexicalPath -Value $DatabaseValue -BasePath $ActionApp
      }
      return [pscustomobject]@{ Backend = $true; Known = $true; DatabasePath = $ResolvedDatabase }
    }

    if ($ExecutableName -eq "node") {
      $ServerValue = @($Arguments | Where-Object { [IO.Path]::GetFileName($_) -eq "server.mjs" }) | Select-Object -First 1
      if ($null -eq $ServerValue) {
        return [pscustomobject]@{ Backend = $BackendHint; Known = $false; DatabasePath = $null }
      }
      $ServerPath = Resolve-LexicalPath -Value $ServerValue -BasePath $WorkingDirectory
      $ActionApp = Split-Path -Parent $ServerPath
      $DatabaseValue = Get-ArgumentValue -Arguments $Arguments -Name "--db"
      if ($null -ne $DatabaseValue -and -not [IO.Path]::IsPathRooted($DatabaseValue) -and [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
        return [pscustomobject]@{ Backend = $true; Known = $false; DatabasePath = $null }
      }
      $ResolvedDatabase = if ($null -eq $DatabaseValue) {
        Resolve-LexicalPath -Value "data\dev-erp.db" -BasePath $ActionApp
      } else {
        Resolve-LexicalPath -Value $DatabaseValue -BasePath $WorkingDirectory
      }
      return [pscustomobject]@{ Backend = $true; Known = $true; DatabasePath = $ResolvedDatabase }
    }
  } catch {
    if ($BackendHint) {
      return [pscustomobject]@{ Backend = $true; Known = $false; DatabasePath = $null }
    }
    return [pscustomobject]@{ Backend = $false; Known = $false; DatabasePath = $null }
  }

  return [pscustomobject]@{ Backend = $BackendHint; Known = $false; DatabasePath = $null }
}

function Test-SamePath {
  param(
    [Parameter(Mandatory = $true)][string]$Left,
    [Parameter(Mandatory = $true)][string]$Right
  )
  return [string]::Equals($Left, $Right, [StringComparison]::OrdinalIgnoreCase)
}

$RuntimeRoot = (Resolve-Path -LiteralPath $RuntimeRoot).Path
$App = (Resolve-Path -LiteralPath (Join-Path $RuntimeRoot "ui-workspace\apps\dev-erp")).Path
$LauncherPath = (Resolve-Path -LiteralPath (Join-Path $App "ops\run-dev-erp-background.ps1")).Path
if ([string]::IsNullOrWhiteSpace($DatabasePath)) {
  $DatabasePath = Join-Path $App "data\dev-erp.db"
} elseif (-not [IO.Path]::IsPathRooted($DatabasePath)) {
  $DatabasePath = Join-Path $App $DatabasePath
}
$DatabasePath = [IO.Path]::GetFullPath($DatabasePath)

$PowerShellCommand = Get-Command powershell.exe -ErrorAction Stop
$PowerShellExe = [IO.Path]::GetFullPath($PowerShellCommand.Source)
$ActionArguments = @(
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy", "Bypass",
  "-File", $LauncherPath,
  "-Foreground",
  "-DatabasePath", $DatabasePath
)
if ($SecureCookie) { $ActionArguments += "-SecureCookie" }
$ActionArgumentLine = ($ActionArguments | ForEach-Object { ConvertTo-TaskArgument -Value $_ }) -join " "

$Tasks = @(Get-ScheduledTask -ErrorAction Stop)
$Records = @()
foreach ($Task in $Tasks) {
  $TaskId = Get-TaskIdentifier -Task $Task
  $Enabled = Test-TaskEnabled -Task $Task
  foreach ($Action in @($Task.Actions)) {
    $Resolution = Resolve-TaskActionDatabase -Action $Action
    $Records += [pscustomobject]@{
      Task = $Task
      TaskId = $TaskId
      Enabled = $Enabled
      Backend = $Resolution.Backend
      Known = $Resolution.Known
      DatabasePath = $Resolution.DatabasePath
    }
  }
}

$EnabledSameDatabase = @(
  $Records |
    Where-Object { $_.Enabled -and $_.Known -and (Test-SamePath -Left $_.DatabasePath -Right $DatabasePath) } |
    Select-Object -ExpandProperty TaskId -Unique
)
$DisabledSameDatabase = @(
  $Records |
    Where-Object { -not $_.Enabled -and $_.Known -and (Test-SamePath -Left $_.DatabasePath -Right $DatabasePath) } |
    Select-Object -ExpandProperty TaskId -Unique
)
$EnabledUnknownBackend = @(
  $Records |
    Where-Object { $_.Enabled -and $_.Backend -and -not $_.Known } |
    Select-Object -ExpandProperty TaskId -Unique
)
$TargetTaskId = "\$TaskName"
$ExistingTarget = @($Tasks | Where-Object { (Get-TaskIdentifier -Task $_) -eq $TargetTaskId })

Write-Output "dev-erp scheduled-task audit: target=$TargetTaskId enabled-same-db=$($EnabledSameDatabase.Count) disabled-same-db=$($DisabledSameDatabase.Count) unresolved-enabled-backend=$($EnabledUnknownBackend.Count)"
if ($EnabledSameDatabase.Count -or $EnabledUnknownBackend.Count) {
  $Blocked = @($EnabledSameDatabase + $EnabledUnknownBackend | Select-Object -Unique) -join ","
  throw "Enabled dev-ERP task action conflict ($Blocked). Stop its controller and Node process, disable the task, then rerun with -HandoffFromTaskId; no task was changed."
}

if (-not $Register) {
  Write-Output "dev-erp scheduled-task audit passed: no enabled same-DB or unresolved backend task action; no task was changed."
  return
}

$HandoffSet = @{}
foreach ($HandoffId in $HandoffFromTaskId) {
  if ([string]::IsNullOrWhiteSpace($HandoffId)) { continue }
  $HandoffSet[$HandoffId] = $true
}

foreach ($HandoffId in $HandoffSet.Keys) {
  $HandoffTasks = @($Tasks | Where-Object { (Get-TaskIdentifier -Task $_) -eq $HandoffId })
  if ($HandoffTasks.Count -ne 1) {
    throw "Handoff task '$HandoffId' was not found exactly once; no task was changed."
  }
  $HandoffTask = $HandoffTasks[0]
  if (Test-TaskEnabled -Task $HandoffTask) {
    throw "Handoff task '$HandoffId' is still enabled; no task was changed."
  }
  $HandoffActions = @($HandoffTask.Actions)
  if ($HandoffActions.Count -ne 1) {
    throw "Handoff task '$HandoffId' must have exactly one action; no task was changed."
  }
  $HandoffResolution = Resolve-TaskActionDatabase -Action $HandoffActions[0]
  if (-not $HandoffResolution.Backend -or -not $HandoffResolution.Known -or -not (Test-SamePath -Left $HandoffResolution.DatabasePath -Right $DatabasePath)) {
    throw "Handoff task '$HandoffId' does not resolve exactly to the target database; no task was changed."
  }
}

$UnacknowledgedDisabled = @($DisabledSameDatabase | Where-Object { -not $HandoffSet.ContainsKey($_) })
if ($UnacknowledgedDisabled.Count) {
  throw "Disabled same-database task requires explicit -HandoffFromTaskId acknowledgement ($($UnacknowledgedDisabled -join ',')); no task was changed."
}

if ($ExistingTarget.Count) {
  if ($ExistingTarget.Count -ne 1 -or -not $HandoffSet.ContainsKey($TargetTaskId)) {
    throw "Target task '$TargetTaskId' already exists and will not be overwritten without its exact disabled same-database handoff; no task was changed."
  }
}

$CurrentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not $PSCmdlet.ShouldProcess($TargetTaskId, "register current-user InteractiveToken dev-ERP foreground task")) {
  Write-Output "dev-erp scheduled-task registration skipped by WhatIf or confirmation; no task was changed."
  return
}

$Action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $ActionArgumentLine -WorkingDirectory $App
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $CurrentUser
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable

$null = Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
  -Principal $Principal -Settings $Settings `
  -Description "Soulforge dev-ERP current-user foreground supervisor; no stored credentials." `
  -Force -ErrorAction Stop

Write-Output "dev-erp scheduled-task registered: task=$TargetTaskId logon=current-user mode=foreground credentials=none db=explicit"
