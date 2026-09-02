[CmdletBinding()]
param(
  [string]$RegistrarPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $RegistrarPath) {
  $RegistrarPath = Join-Path $PSScriptRoot "register-buzz-collect-hpp-task.ps1"
}
if (-not (Test-Path -LiteralPath $RegistrarPath -PathType Leaf)) {
  throw "buzz collect registrar structural test could not find the source"
}

$Tokens = $null
$ParseErrors = $null
$Ast = [Management.Automation.Language.Parser]::ParseFile(
  [IO.Path]::GetFullPath($RegistrarPath),
  [ref]$Tokens,
  [ref]$ParseErrors
)
if ($ParseErrors.Count -ne 0) {
  throw "buzz collect registrar has PowerShell parse errors"
}

$Commands = @($Ast.FindAll({
  param($Node)
  $Node -is [Management.Automation.Language.CommandAst]
}, $true))
$CommandNames = @($Commands | ForEach-Object { $_.GetCommandName() })
$TriggerCommands = @($Commands | Where-Object {
  $_.GetCommandName() -eq "New-ScheduledTaskTrigger"
})
if ($TriggerCommands.Count -ne 1) {
  throw "buzz collect registrar must construct exactly one task trigger"
}
$TriggerSource = $TriggerCommands[0].Extent.Text
if ($TriggerSource -notmatch '(?i)\s-Once(?:\s|$)' `
    -or $TriggerSource -notmatch '(?i)-RepetitionInterval\s+\(New-TimeSpan\s+-Minutes\s+15\)' `
    -or $TriggerSource -match '(?i)-(?:Daily|AtLogOn|AtStartup|Weekly)\b') {
  throw "buzz collect trigger must be one time trigger repeating every 15 minutes"
}

$Source = Get-Content -Raw -Encoding UTF8 -LiteralPath $RegistrarPath
foreach ($RequiredPattern in @(
  'TaskName\s*=\s*"Soulforge-HPP-Buzz-Collect"',
  '\(Get-TimeZone\)\.Id\s+-ne\s+"Korea Standard Time"',
  'New-ScheduledTaskSettingsSet[\s\S]*?-MultipleInstances\s+IgnoreNew',
  'New-ScheduledTaskSettingsSet[\s\S]*?-RestartCount\s+3',
  'New-ScheduledTaskSettingsSet[\s\S]*?-ExecutionTimeLimit\s+\(New-TimeSpan\s+-Minutes\s+10\)',
  'New-ScheduledTaskSettingsSet[\s\S]*?-Hidden',
  'New-ScheduledTaskPrincipal[\s\S]*?-RunLevel\s+Limited',
  '-WindowStyle",\s*"Hidden"',
  'run-buzz-collect-hidden.vbs',
  'System32\\wscript\.exe',
  'HiddenActionArgumentLine',
  'if\s*\(-not\s+\$Register\)',
  'ExpectedDryRunDigest',
  'Export-ScheduledTask',
  'TriggerNodes\.Count\s+-eq\s+1',
  "LocalName\s+-eq\s+`"TimeTrigger`"",
  "local-name\(\)='Repetition'",
  "local-name\(\)='Interval'",
  'RegisteredInterval\s+-eq\s+"PT15M"',
  '\$TriggerEvery15\.Repetition\.StopAtDurationEnd\s*=\s*\$false',
  'RegisteredStopAtDurationEnd\s+-ne\s+"true"',
  "local-name\(\)='ExecutionTimeLimit'",
  'RegisteredExecutionTimeLimit\s+-eq\s+"PT10M"',
  "local-name\(\)='RestartOnFailure'",
  "local-name\(\)='RunLevel'",
  "local-name\(\)='UserId'",
  "local-name\(\)='WorkingDirectory'",
  'RegisteredRunLevelFromTask\s+-eq\s+"Limited"',
  '"--preflight"',
  '"--apply"',
  '"--state-root",\s*\$StateRoot',
  '"--expected-binding-sha256",\s*\$BindingSha256',
  '\$Preflight\.feature_status\s+-ne\s+"ON"',
  '\$CommandScript\s*=\s*"& "[\s\S]*?ConvertTo-SingleQuotedLiteral\s+-Value\s+\$NodePath[\s\S]*?ConvertTo-SingleQuotedLiteral\s+-Value\s+\$Launcher',
  'runtime_manifest_sha256',
  'binding_sha256',
  'node_sha256',
  'nsec1\[a-z0-9\]\{20,\}',
  'eyJ\[A-Za-z0-9_-\]\{8,\}',
  'binding must not declare credentials',
  'soulforge\.buzz_collect\.binding\.v1',
  'function\s+Get-Sha256File',
  '\[IO\.File\]::Open',
  '\[IO\.FileShare\]::Read',
  '\.ComputeHash\(\$Stream\)',
  'ExistingTaskXml',
  'Disable-ScheduledTask',
  'Unregister-ScheduledTask',
  'prior task definition was restored or the new task was removed'
)) {
  if ($Source -notmatch $RequiredPattern) {
    throw "buzz collect registrar is missing a required structural guard: $RequiredPattern"
  }
}
foreach ($ForbiddenPattern in @(
  'New-ScheduledTaskTrigger\s+-AtLogOn',
  'New-ScheduledTaskTrigger\s+-Daily',
  'New-ScheduledTaskTrigger\s+-AtStartup',
  'Start-ScheduledTask',
  'Start-Sleep',
  'Get-FileHash',
  'Restart-Computer',
  'Stop-Computer',
  'shutdown(?:\.exe)?\s'
)) {
  if ($Source -match $ForbiddenPattern) {
    throw "buzz collect registrar contains a forbidden command or trigger structure: $ForbiddenPattern"
  }
}
if (@($CommandNames | Where-Object { $_ -eq "Register-ScheduledTask" }).Count -ne 2 `
    -or @($CommandNames | Where-Object { $_ -eq "Export-ScheduledTask" }).Count -lt 3 `
    -or @($CommandNames | Where-Object { $_ -eq "Disable-ScheduledTask" }).Count -lt 2 `
    -or @($CommandNames | Where-Object { $_ -eq "Unregister-ScheduledTask" }).Count -ne 1) {
  throw "buzz collect registrar must include registration attestation and fail-closed rollback surfaces"
}

$RegisterCommands = @($Commands | Where-Object {
  $_.GetCommandName() -eq "Register-ScheduledTask"
})
$RegisterCommand = @($RegisterCommands | Where-Object {
  $_.Extent.Text -match '(?i)-Action\s+\$Action'
})[0].Extent.Text
if ($RegisterCommand -notmatch '(?i)-Trigger\s+@\(\$TriggerEvery15\)') {
  throw "buzz collect registration must receive exactly the one fixed trigger object"
}
$RestoreCommand = @($RegisterCommands | Where-Object {
  $_.Extent.Text -match '(?i)-Xml\s+\$ExistingTaskXml'
})[0].Extent.Text
if ($RestoreCommand -notmatch '(?i)-Force') {
  throw "buzz collect rollback must restore the exact prior exported XML"
}

Write-Output "buzz collect PowerShell registrar structural checks passed"
