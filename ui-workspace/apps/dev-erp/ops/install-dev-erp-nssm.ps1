param(
  [string]$RuntimeRoot = "C:\Soulforge-runtime",
  [string]$ServiceName = "dev-erp",
  [string]$HostName = "0.0.0.0",
  [int]$Port = 4300,
  [string]$NodeExe = "node.exe",
  [string]$NssmExe = "nssm.exe",
  [string]$ChatProvider = "ollama",
  [string]$ChatModel = "gemma4:e4b",
  [int]$ChatContextTurns = 5,
  [int]$ChatTimeoutMs = 45000,
  [int]$QueueWaitMs = 60000,
  [int]$LlmConcurrency = 1
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
  throw "Run this script from an elevated PowerShell window."
}

$App = Join-Path $RuntimeRoot "ui-workspace\apps\dev-erp"
if (-not (Test-Path -LiteralPath $App)) {
  throw "dev-ERP app directory not found: $App"
}

$LogDir = Join-Path $App "logs\service"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stdout = Join-Path $LogDir "dev-erp.out.log"
$Stderr = Join-Path $LogDir "dev-erp.err.log"

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  & $NssmExe install $ServiceName $NodeExe "server.mjs" "--host" $HostName "--port" "$Port"
}

& $NssmExe set $ServiceName AppDirectory $App
& $NssmExe set $ServiceName AppParameters "server.mjs --host $HostName --port $Port"
& $NssmExe set $ServiceName AppEnvironmentExtra `
  "ERP_CHAT_PROVIDER=$ChatProvider" `
  "ERP_CHAT_MODEL=$ChatModel" `
  "ERP_CHAT_CONTEXT_TURNS=$ChatContextTurns" `
  "ERP_CHAT_TIMEOUT_MS=$ChatTimeoutMs" `
  "ERP_LLM_QUEUE_WAIT_MS=$QueueWaitMs" `
  "ERP_LLM_CONCURRENCY=$LlmConcurrency"
& $NssmExe set $ServiceName AppStdout $Stdout
& $NssmExe set $ServiceName AppStderr $Stderr
& $NssmExe set $ServiceName AppRotateFiles 1
& $NssmExe set $ServiceName AppRotateOnline 1
& $NssmExe set $ServiceName AppRotateBytes 10485760
& $NssmExe set $ServiceName AppExit Default Restart
& $NssmExe set $ServiceName AppRestartDelay 5000
& $NssmExe set $ServiceName Start SERVICE_AUTO_START

Write-Output "Configured NSSM service '$ServiceName'."
Write-Output "Start:   nssm start $ServiceName"
Write-Output "Restart: nssm restart $ServiceName"
Write-Output "Stop:    nssm stop $ServiceName"
