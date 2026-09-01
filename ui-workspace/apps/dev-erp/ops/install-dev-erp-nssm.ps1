param(
  [string]$RuntimeRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..\..")).Path,
  [string]$ServiceName = "dev-erp",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 4300,
  [string]$NodeExe = "node.exe",
  [string]$NssmExe = "nssm.exe",
  [int]$CookieSecure = 1,
  [ValidateSet("stub")]
  [string]$ChatProvider = "stub",
  [string]$ChatModel = "",
  [int]$ChatThink = 0,
  [int]$ChatContextTurns = 5,
  [int]$ChatTimeoutMs = 45000,
  [int]$QueueWaitMs = 60000,
  [int]$LlmConcurrency = 1,
  [string]$BackendRoot = "",
  [string]$DatabasePath = "",
  [string]$LogRoot = "",
  [switch]$DevelopmentOnly
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime-path-contract.ps1")

if (-not $DevelopmentOnly) {
  throw "This legacy single-service installer is development-only. Production requires distinct ERP and Codex worker identities; use configure-dev-erp-codex-nssm.ps1 after both services are owner-provisioned."
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
  throw "Run this script from an elevated PowerShell window."
}

$App = Join-Path $RuntimeRoot "ui-workspace\apps\dev-erp"
if (-not (Test-Path -LiteralPath $App)) {
  throw "dev-ERP app directory not found: $App"
}

$InstalledLayout = Get-DevErpInstalledLayout -PathValue $App
if ([string]::IsNullOrWhiteSpace($BackendRoot) -and $InstalledLayout.installed) { $BackendRoot = $InstalledLayout.suite_root }
if (-not [string]::IsNullOrWhiteSpace($BackendRoot)) {
  $BackendRoot = Assert-DevErpExternalRuntimePath -Name "BackendRoot" -PathValue $BackendRoot -InstalledLayout $InstalledLayout
}
if ($InstalledLayout.installed -and [string]::IsNullOrWhiteSpace($DatabasePath)) {
  throw "Installed runtime requires an explicit external -DatabasePath."
}
if (-not [string]::IsNullOrWhiteSpace($DatabasePath)) {
  $DatabasePath = Assert-DevErpExternalRuntimePath -Name "DatabasePath" -PathValue $DatabasePath -InstalledLayout $InstalledLayout
}
if ([string]::IsNullOrWhiteSpace($LogRoot)) {
  $LogRoot = if ($InstalledLayout.installed) { Join-Path $InstalledLayout.control_root "runtime-logs\dev-erp" } else { Join-Path $App "logs" }
}
$LogRoot = Assert-DevErpExternalRuntimePath -Name "LogRoot" -PathValue $LogRoot -InstalledLayout $InstalledLayout
$LogDir = Join-Path $LogRoot "service"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stdout = Join-Path $LogDir "dev-erp.out.log"
$Stderr = Join-Path $LogDir "dev-erp.err.log"

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  & $NssmExe install $ServiceName $NodeExe "server.mjs" "--host" $HostName "--port" "$Port"
}

& $NssmExe set $ServiceName AppDirectory $App
$AppParameters = "server.mjs --host $HostName --port $Port"
if (-not [string]::IsNullOrWhiteSpace($BackendRoot)) {
  $AppParameters += " --knowledge_shell_root `"$BackendRoot`" --backend_root `"$BackendRoot`""
}
if (-not [string]::IsNullOrWhiteSpace($DatabasePath)) { $AppParameters += " --db `"$DatabasePath`"" }
& $NssmExe set $ServiceName AppParameters $AppParameters
& $NssmExe set $ServiceName AppEnvironmentExtra `
  "ERP_CHAT_PROVIDER=$ChatProvider" `
  "ERP_CHAT_MODEL=$ChatModel" `
  "ERP_CHAT_THINK=$ChatThink" `
  "ERP_CHAT_CONTEXT_TURNS=$ChatContextTurns" `
  "ERP_CHAT_TIMEOUT_MS=$ChatTimeoutMs" `
  "ERP_LLM_QUEUE_WAIT_MS=$QueueWaitMs" `
  "ERP_LLM_CONCURRENCY=$LlmConcurrency" `
  "DEV_ERP_COOKIE_SECURE=$CookieSecure" `
  "DEV_ERP_CODEX_TASK_BRIDGE=app-server"
& $NssmExe set $ServiceName AppStdout $Stdout
& $NssmExe set $ServiceName AppStderr $Stderr
& $NssmExe set $ServiceName AppRotateFiles 1
& $NssmExe set $ServiceName AppRotateOnline 1
& $NssmExe set $ServiceName AppRotateBytes 10485760
& $NssmExe set $ServiceName AppExit Default Restart
& $NssmExe set $ServiceName AppRestartDelay 5000
& $NssmExe set $ServiceName Start SERVICE_AUTO_START

Write-Output "Configured development-only NSSM service '$ServiceName'."
Write-Output "Start:   nssm start $ServiceName"
Write-Output "Restart: nssm restart $ServiceName"
Write-Output "Stop:    nssm stop $ServiceName"
