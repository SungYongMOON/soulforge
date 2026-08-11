param(
    [string]$TaskName = 'Soulforge-Hiworks-Gmail-Forwarder'
)

$ErrorActionPreference = 'Stop'
$Runner = (Resolve-Path (Join-Path $PSScriptRoot 'run-hiworks-gmail-forwarder.ps1')).Path
$HiddenLauncher = (Resolve-Path (Join-Path $PSScriptRoot 'run-hiworks-gmail-forwarder-hidden.vbs')).Path
$PowerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
$WScriptExe = Join-Path $env:WINDIR 'System32\wscript.exe'
$ActionArguments = "//B //NoLogo `"$HiddenLauncher`" `"$PowerShellExe`" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Runner`" -Mode apply"
$Action = New-ScheduledTaskAction -Execute $WScriptExe -Argument $ActionArguments
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description 'Import only new owner Hiworks POP3 messages into the Gmail Inbox as original RFC 822 messages without deleting POP3 mail.' -Force | Out-Null
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName,State
