param(
  [string]$RuntimeRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..\..")).Path,
  [string]$ServiceName = "dev-erp",
  [string]$WorkerServiceName = "dev-erp-codex-worker",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 4300,
  [int]$CookieSecure = 1,
  [ValidateSet("stub")]
  [string]$ChatProvider = "stub",
  [string]$ChatModel = "",
  [int]$ChatThink = 0,
  [int]$ChatContextTurns = 5,
  [int]$ChatTimeoutMs = 45000,
  [int]$QueueWaitMs = 60000,
  [int]$LlmConcurrency = 1
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
    $attestation = $response.attestation
    return ($response.ok -eq $true `
      -and $null -ne $attestation `
      -and $attestation.codex_execution_boundary -eq "dedicated_worker" `
      -and $attestation.codex_worker_ready -eq $true `
      -and $attestation.codex_worker_attestation_verified -eq $true `
      -and $attestation.codex_worker_identity_separate -eq $true `
      -and $attestation.codex_worker_filesystem_boundary_proven -eq $true)
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
  }
}

function Save-WatchdogState($State) {
  $State | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function Reset-WatchdogFailures {
  Save-WatchdogState ([pscustomobject]@{
    consecutive_failures = 0
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
  }
  Save-WatchdogState $state
  return $state
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
$workerService = Get-Service -Name $WorkerServiceName -ErrorAction SilentlyContinue
if (-not $service -or -not $workerService) {
  Write-WatchdogLog "failed" "required ERP or Codex worker service is missing" @{
    erp_service_present = ($null -ne $service)
    worker_service_present = ($null -ne $workerService)
  }
  exit 2
}

try {
  if ($workerService.Status -eq "Running") {
    Restart-Service -Name $WorkerServiceName -Force
    Write-WatchdogLog "restarted" "Codex worker service restarted" @{ service = $WorkerServiceName }
  } else {
    Start-Service -Name $WorkerServiceName
    Write-WatchdogLog "started" "Codex worker service started" @{ service = $WorkerServiceName; previous_status = [string]$workerService.Status }
  }
  if ($service.Status -eq "Running") {
    Restart-Service -Name $ServiceName -Force
    Write-WatchdogLog "restarted" "ERP service restarted" @{ service = $ServiceName }
  } else {
    Start-Service -Name $ServiceName
    Write-WatchdogLog "started" "ERP service started" @{ service = $ServiceName; previous_status = [string]$service.Status }
  }
} catch {
  Write-WatchdogLog "failed" "two-service recovery failed" @{ error = $_.Exception.Message }
  exit 2
}

Start-Sleep -Seconds 8
if (Test-DevErpHealth) {
  Reset-WatchdogFailures
  Write-WatchdogLog "recovered" "health check passed after recovery"
  exit 0
}

$state = Register-WatchdogFailure
Write-WatchdogLog "failed" "health check still failed after recovery; PC reboot is forbidden" @{
  consecutive_failures = [int]$state.consecutive_failures
  reboot_policy = "forbidden"
}
exit 2
