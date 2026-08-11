param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimeRoot,
    [Parameter(Mandatory = $true)]
    [string]$BindingPath,
    [Parameter(Mandatory = $true)]
    [string]$BindingSha256,
    [string]$TaskName = "Soulforge-HPP-All-Project-Local-Activity",
    [int]$IntervalMinutes = 30,
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
if ($IntervalMinutes -lt 15 -or $IntervalMinutes -gt 1440) {
    throw "hpp_local_activity_interval_invalid"
}

$runtime = [System.IO.Path]::GetFullPath($RuntimeRoot)
$binding = [System.IO.Path]::GetFullPath($BindingPath)
$runner = Join-Path $runtime "guild_hall\local_activity\ops\run-hpp-local-activity.ps1"
$hiddenLauncher = Join-Path $runtime "guild_hall\local_activity\ops\run-hpp-local-activity-hidden.vbs"
$powerShell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$wscript = Join-Path $env:WINDIR "System32\wscript.exe"
$arguments = @(
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle", "Hidden",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $runner),
    "-RuntimeRoot", ('"{0}"' -f $runtime),
    "-BindingPath", ('"{0}"' -f $binding),
    "-BindingSha256", ('"sha256:{0}"' -f $BindingSha256.ToLowerInvariant().Replace("sha256:", ""))
) -join " "

$summary = [ordered]@{
    task_name = $TaskName
    interval_minutes = $IntervalMinutes
    executable = $wscript
    arguments = "//B //NoLogo `"$hiddenLauncher`" `"$powerShell`" $arguments"
    apply = [bool]$Apply
    multiple_instances = "IgnoreNew"
    hidden_window = $true
}
if (-not $Apply) {
    $summary | ConvertTo-Json -Depth 4
    exit 0
}

foreach ($target in @($runner, $hiddenLauncher, $binding)) {
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        throw "hpp_local_activity_registration_input_missing"
    }
}

$action = New-ScheduledTaskAction `
    -Execute $wscript `
    -Argument $summary.arguments `
    -WorkingDirectory $runtime
$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At ((Get-Date).Date.AddMinutes(5)) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Soulforge HPP project-local file and bounded Codex activity collection" `
    -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName
if ($registered.Settings.MultipleInstances -ne "IgnoreNew") {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    throw "hpp_local_activity_registration_attestation_failed"
}
if ($registered.Actions.Execute -ne $wscript -or $registered.Actions.Arguments -ne $summary.arguments) {
    throw "hpp_local_activity_registration_attestation_failed"
}
$summary | ConvertTo-Json -Depth 4
