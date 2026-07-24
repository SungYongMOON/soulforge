[CmdletBinding()]
param(
  [string]$RegistrarPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $RegistrarPath) {
  $RegistrarPath = Join-Path $PSScriptRoot "register-slack-batch-hpp-task.ps1"
}
if (-not (Test-Path -LiteralPath $RegistrarPath -PathType Leaf)) {
  throw "slack batch registrar structural test could not find the source"
}

$Tokens = $null
$ParseErrors = $null
$Ast = [Management.Automation.Language.Parser]::ParseFile(
  [IO.Path]::GetFullPath($RegistrarPath),
  [ref]$Tokens,
  [ref]$ParseErrors
)
if ($ParseErrors.Count -ne 0) {
  throw "slack batch registrar has PowerShell parse errors"
}

$Commands = @($Ast.FindAll({
  param($Node)
  $Node -is [Management.Automation.Language.CommandAst]
}, $true))
$CommandNames = @($Commands | ForEach-Object { $_.GetCommandName() })
$TriggerCommands = @($Commands | Where-Object {
  $_.GetCommandName() -eq "New-ScheduledTaskTrigger"
})
if ($TriggerCommands.Count -ne 2) {
  throw "slack batch registrar must construct exactly two task triggers"
}
foreach ($TriggerCommand in $TriggerCommands) {
  if ($TriggerCommand.Extent.Text -notmatch '(?i)\s-Daily(?:\s|$)' `
      -or $TriggerCommand.Extent.Text -match '(?i)-(?:Once|AtLogOn|AtStartup|Weekly)\b' `
      -or $TriggerCommand.Extent.Text -match '(?i)Repetition') {
    throw "slack batch trigger is not a plain daily trigger"
  }
}
$TriggerSource = ($TriggerCommands | ForEach-Object { $_.Extent.Text }) -join "`n"
if ($TriggerSource -notmatch '\.AddHours\(2\)' `
    -or $TriggerSource -notmatch '\.AddHours\(12\)') {
  throw "slack batch trigger times must remain fixed at 02:00 and 12:00"
}

$Source = Get-Content -Raw -Encoding UTF8 -LiteralPath $RegistrarPath
foreach ($RequiredPattern in @(
  'TaskName\s*=\s*"Soulforge-HPP-Slack-Batch"',
  '\(Get-TimeZone\)\.Id\s+-ne\s+"Korea Standard Time"',
  'New-ScheduledTaskSettingsSet[\s\S]*?-MultipleInstances\s+IgnoreNew',
  'New-ScheduledTaskSettingsSet[\s\S]*?-RestartCount\s+3',
  'New-ScheduledTaskSettingsSet[\s\S]*?-Hidden',
  'New-ScheduledTaskPrincipal[\s\S]*?-RunLevel\s+Limited',
  '-WindowStyle",\s*"Hidden"',
  'if\s*\(-not\s+\$Register\)',
  'ExpectedDryRunDigest',
  'Export-ScheduledTask',
  'TriggerNodes\.Count\s+-eq\s+2',
  "local-name\(\)='ScheduleByDay'",
  "local-name\(\)='RestartOnFailure'",
  "local-name\(\)='RunLevel'",
  "local-name\(\)='UserId'",
  "local-name\(\)='WorkingDirectory'",
  'RegisteredRunLevelFromTask\s+-eq\s+"Limited"',
  '\$CommandScript\s*=\s*"& "[\s\S]*?ConvertTo-SingleQuotedLiteral\s+-Value\s+\$NodePath[\s\S]*?ConvertTo-SingleQuotedLiteral\s+-Value\s+\$Launcher',
  'runtime_manifest_sha256',
  'batch_binding_sha256',
  'node_sha256',
  'ExistingTaskXml',
  'Disable-ScheduledTask',
  'Unregister-ScheduledTask',
  'prior task definition was restored or the new task was removed'
)) {
  if ($Source -notmatch $RequiredPattern) {
    throw "slack batch registrar is missing a required structural guard"
  }
}
foreach ($ForbiddenPattern in @(
  'New-ScheduledTaskTrigger\s+-AtLogOn',
  'New-ScheduledTaskTrigger\s+-Once',
  'RepetitionInterval',
  'Start-ScheduledTask',
  'Start-Sleep'
)) {
  if ($Source -match $ForbiddenPattern) {
    throw "slack batch registrar contains a polling or extra-start structure"
  }
}
if (@($CommandNames | Where-Object { $_ -eq "Register-ScheduledTask" }).Count -ne 2 `
    -or @($CommandNames | Where-Object { $_ -eq "Export-ScheduledTask" }).Count -lt 3 `
    -or @($CommandNames | Where-Object { $_ -eq "Disable-ScheduledTask" }).Count -lt 2 `
    -or @($CommandNames | Where-Object { $_ -eq "Unregister-ScheduledTask" }).Count -ne 1) {
  throw "slack batch registrar must include registration attestation and fail-closed rollback surfaces"
}

$RegisterCommands = @($Commands | Where-Object {
  $_.GetCommandName() -eq "Register-ScheduledTask"
})
$RegisterCommand = @($RegisterCommands | Where-Object {
  $_.Extent.Text -match '(?i)-Action\s+\$Action'
})[0].Extent.Text
if ($RegisterCommand -notmatch '(?i)-Trigger\s+@\(\$Trigger0200,\s*\$Trigger1200\)') {
  throw "slack batch registration must receive exactly the two fixed trigger objects"
}
$RestoreCommand = @($RegisterCommands | Where-Object {
  $_.Extent.Text -match '(?i)-Xml\s+\$ExistingTaskXml'
})[0].Extent.Text
if ($RestoreCommand -notmatch '(?i)-Force') {
  throw "slack batch rollback must restore the exact prior exported XML"
}

Write-Output "slack batch PowerShell registrar structural checks passed"
