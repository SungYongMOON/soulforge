param(
  [string]$RuntimeRoot = "C:\Soulforge-runtime",
  [string]$ServiceName = "dev-erp",
  [string]$HostName = "0.0.0.0",
  [int]$Port = 4300,
  [string]$ChatProvider = "ollama",
  [string]$ChatModel = "gemma4:e4b",
  [int]$ChatContextTurns = 5,
  [int]$ChatTimeoutMs = 45000,
  [int]$QueueWaitMs = 60000,
  [int]$LlmConcurrency = 1,
  [int]$FailureThreshold = 3,
  [int]$RebootCooldownHours = 6,
  [switch]$AllowReboot
)

$ErrorActionPreference = "Stop"

$App = Join-Path $RuntimeRoot "ui-workspace\apps\dev-erp"
$LogDir = Join-Path $App "logs\watchdog"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogPath = Join-Path $LogDir ("watchdog-" + (Get-Date -Format "yyyy-MM-dd") + ".jsonl")
$StatePath = Join-Path $LogDir "watchdog-state.json"
$MaintenanceMarker = Join-Path $App "logs\maintenance.lock"

function Write-WatchdogLog($Status, $Message, $Extra = @{}) {
  $row = [ordered]@{
    at = (Get-Date).ToString("o")
    status = $Status
    message = $Message
    runtime_root = $RuntimeRoot
    port = $Port
  }
  foreach ($key in $Extra.Keys) { $row[$key] = $Extra[$key] }
  ($row | ConvertTo-Json -Compress) | Add-Content -Path $LogPath -Encoding UTF8
}

function Test-DevErpHealth {
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
    return ($response.ok -eq $true)
  } catch {
    return $false
  }
}

function Read-WatchdogState {
  if (Test-Path -LiteralPath $StatePath) {
    try {
      return Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
    } catch {
      Write-WatchdogLog "warning" "watchdog state was unreadable" @{ error = $_.Exception.Message }
    }
  }
  return [pscustomobject]@{
    consecutive_failures = 0
    last_reboot_requested_at = $null
  }
}

function Save-WatchdogState($State) {
  $State | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function Reset-WatchdogFailures {
  Save-WatchdogState ([pscustomobject]@{
    consecutive_failures = 0
    last_reboot_requested_at = (Read-WatchdogState).last_reboot_requested_at
  })
}

function Register-WatchdogFailure {
  $state = Read-WatchdogState
  $previous = 0
  if ($null -ne $state.consecutive_failures) {
    $previous = [int]$state.consecutive_failures
  }
  $count = $previous + 1
  $state = [pscustomobject]@{
    consecutive_failures = $count
    last_reboot_requested_at = $state.last_reboot_requested_at
  }
  Save-WatchdogState $state
  return $state
}

function Test-RebootCooldown($State) {
  if (-not $State.last_reboot_requested_at) { return $true }
  try {
    $last = [datetime]::Parse($State.last_reboot_requested_at)
    return ((Get-Date) - $last).TotalHours -ge $RebootCooldownHours
  } catch {
    return $true
  }
}

function Request-WatchdogReboot($State) {
  if (-not $AllowReboot) { return $false }
  if ([int]$State.consecutive_failures -lt $FailureThreshold) { return $false }
  if (-not (Test-RebootCooldown $State)) { return $false }

  $updated = [pscustomobject]@{
    consecutive_failures = [int]$State.consecutive_failures
    last_reboot_requested_at = (Get-Date).ToString("o")
  }
  Save-WatchdogState $updated
  Write-WatchdogLog "reboot_requested" "watchdog requested a Windows reboot after repeated recovery failures" @{
    consecutive_failures = [int]$State.consecutive_failures
    cooldown_hours = $RebootCooldownHours
  }
  & shutdown.exe /r /t 60 /c "dev-ERP watchdog recovery failed repeatedly; reboot scheduled in 60 seconds."
  return $true
}

if (Test-Path -LiteralPath $MaintenanceMarker) {
  Write-WatchdogLog "maintenance" "maintenance marker present; watchdog skipped recovery" @{ marker = $MaintenanceMarker }
  exit 0
}

if (Test-DevErpHealth) {
  Reset-WatchdogFailures
  Write-WatchdogLog "ok" "health check passed"
  exit 0
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
  try {
    if ($service.Status -eq "Running") {
      Restart-Service -Name $ServiceName -Force
      Write-WatchdogLog "restarted" "service restarted" @{ service = $ServiceName }
    } else {
      Start-Service -Name $ServiceName
      Write-WatchdogLog "started" "service started" @{ service = $ServiceName; previous_status = [string]$service.Status }
    }
  } catch {
    Write-WatchdogLog "failed" "service restart failed" @{ error = $_.Exception.Message }
    exit 2
  }
} else {
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $out = Join-Path $App "logs\manual-watchdog-$stamp.out.log"
  $err = Join-Path $App "logs\manual-watchdog-$stamp.err.log"
  $cmd = "set ERP_CHAT_PROVIDER=$ChatProvider&& set ERP_CHAT_MODEL=$ChatModel&& set ERP_CHAT_CONTEXT_TURNS=$ChatContextTurns&& set ERP_CHAT_TIMEOUT_MS=$ChatTimeoutMs&& set ERP_LLM_QUEUE_WAIT_MS=$QueueWaitMs&& set ERP_LLM_CONCURRENCY=$LlmConcurrency&& node server.mjs --host $HostName --port $Port"
  try {
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $cmd) -WorkingDirectory $App -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
    Write-WatchdogLog "started" "manual node process started" @{ pid = $p.Id; stdout = $out; stderr = $err }
  } catch {
    Write-WatchdogLog "failed" "manual start failed" @{ error = $_.Exception.Message }
    exit 2
  }
}

Start-Sleep -Seconds 8
if (Test-DevErpHealth) {
  Reset-WatchdogFailures
  Write-WatchdogLog "recovered" "health check passed after recovery"
  exit 0
}

$state = Register-WatchdogFailure
if (Request-WatchdogReboot $state) {
  exit 2
}

Write-WatchdogLog "failed" "health check still failed after recovery" @{ consecutive_failures = [int]$state.consecutive_failures }
exit 2
