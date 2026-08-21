param(
    [string]$TaskName = 'Soulforge-Hiworks-Gmail-Forwarder'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$GitCommonDirectory = (& git -C $RepoRoot rev-parse --path-format=absolute --git-common-dir).Trim()
if ((Split-Path -Leaf $GitCommonDirectory).ToLowerInvariant() -ne '.git') { throw 'Soulforge owner root is unavailable.' }
$OwnerRoot = Split-Path -Parent $GitCommonDirectory
$BindingPath = Join-Path $OwnerRoot 'guild_hall\state\gateway\mail_send\hiworks_gmail_forwarder.binding.json'
if (-not (Test-Path -LiteralPath $BindingPath -PathType Leaf)) { throw 'Hiworks Gmail binding is unavailable.' }
$Runner = (Resolve-Path (Join-Path $OwnerRoot 'guild_hall\gateway\mail_send\ops\run-hiworks-gmail-forwarder.ps1')).Path
$HiddenLauncher = (Resolve-Path (Join-Path $OwnerRoot 'guild_hall\gateway\mail_send\ops\run-hiworks-gmail-forwarder-hidden.vbs')).Path
$PowerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
$WScriptExe = Join-Path $env:WINDIR 'System32\wscript.exe'
$ActionArguments = "//B //NoLogo `"$HiddenLauncher`" `"$PowerShellExe`" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Runner`" -Mode apply -BindingPath `"$BindingPath`""
$Action = New-ScheduledTaskAction -Execute $WScriptExe -Argument $ActionArguments
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description 'Import only new owner Hiworks POP3 messages into the Gmail Inbox as original RFC 822 messages without deleting POP3 mail.' -Force | Out-Null
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName,State
