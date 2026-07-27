param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("inspect", "quiesce", "enable", "disable", "start")]
  [string]$Operation,
  [Parameter(Mandatory = $true)]
  [string]$TaskName,
  [string]$ActionMarkersBase64 = "",
  [string]$ProcessMarkersBase64 = "",
  [ValidateSet("cooperative_pause", "wait_for_idle")]
  [string]$QuiesceMode = "wait_for_idle",
  [string]$PauseRef = "",
  [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

function Convert-Base64JsonArray {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return @() }
  $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
  return @(ConvertFrom-Json -InputObject $json)
}

function Get-TaskActionText {
  param($Task)
  return (($Task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join " | ")
}

function Assert-TaskIdentity {
  param($Task, [string[]]$ActionMarkers)
  $actionText = Get-TaskActionText -Task $Task
  foreach ($marker in $ActionMarkers) {
    if ($actionText.IndexOf($marker, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
      throw "writer_task_action_mismatch"
    }
  }
}

function Get-MatchingProcesses {
  param([string[]]$ProcessMarkers)
  if ($ProcessMarkers.Count -eq 0) { return @() }
  return @(Get-CimInstance Win32_Process | Where-Object {
    $commandLine = $_.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) { return $false }
    foreach ($marker in $ProcessMarkers) {
      if ($commandLine.IndexOf($marker, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        return $true
      }
    }
    return $false
  })
}

try {
  $actionMarkers = Convert-Base64JsonArray -Value $ActionMarkersBase64
  $processMarkers = Convert-Base64JsonArray -Value $ProcessMarkersBase64
  $task = Get-ScheduledTask -TaskName $TaskName
  Assert-TaskIdentity -Task $task -ActionMarkers $actionMarkers

  switch ($Operation) {
    "inspect" {
      $processes = Get-MatchingProcesses -ProcessMarkers $processMarkers
      [pscustomobject]@{
        ok = $true
        task_name = $TaskName
        state = [string]$task.State
        enabled = [bool]$task.Settings.Enabled
        matching_process_count = $processes.Count
        action_verified = $true
      } | ConvertTo-Json -Compress
      exit 0
    }
    "disable" {
      Disable-ScheduledTask -TaskName $TaskName | Out-Null
    }
    "enable" {
      if (-not [string]::IsNullOrWhiteSpace($PauseRef) -and (Test-Path -LiteralPath $PauseRef -PathType Leaf)) {
        Remove-Item -LiteralPath $PauseRef -Force
      }
      Enable-ScheduledTask -TaskName $TaskName | Out-Null
    }
    "start" {
      Start-ScheduledTask -TaskName $TaskName
    }
    "quiesce" {
      if ($QuiesceMode -eq "cooperative_pause") {
        if ([string]::IsNullOrWhiteSpace($PauseRef)) {
          throw "writer_task_pause_ref_missing"
        }
        New-Item -ItemType File -Path $PauseRef -Force | Out-Null
      }
      Disable-ScheduledTask -TaskName $TaskName | Out-Null
      $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
      do {
        $processes = Get-MatchingProcesses -ProcessMarkers $processMarkers
        Start-Sleep -Milliseconds 250
        $task = Get-ScheduledTask -TaskName $TaskName
        $processes = Get-MatchingProcesses -ProcessMarkers $processMarkers
      } while (([string]$task.State -eq "Running" -or $processes.Count -gt 0) -and [DateTime]::UtcNow -lt $deadline)
      if ([string]$task.State -eq "Running" -or $processes.Count -gt 0) {
        throw "writer_task_quiesce_timeout"
      }
    }
  }

  $finalTask = Get-ScheduledTask -TaskName $TaskName
  [pscustomobject]@{
    ok = $true
    task_name = $TaskName
    operation = $Operation
    state = [string]$finalTask.State
    enabled = [bool]$finalTask.Settings.Enabled
    action_verified = $true
  } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{
    ok = $false
    operation = $Operation
    error_code = if ($_.Exception.Message -match "^writer_task_") {
      $_.Exception.Message
    } else {
      "writer_task_bridge_failed"
    }
  } | ConvertTo-Json -Compress
  exit 1
}
