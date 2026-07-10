param(
  [string]$RuntimeRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..\..")).Path,
  [string]$ErpServiceName = "dev-erp",
  [string]$WorkerServiceName = "dev-erp-codex-worker",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 4300,
  [string]$NodeExe = "node.exe",
  [string]$NssmExe = "nssm.exe"
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
  throw "Run this script from an elevated PowerShell window."
}

$App = Join-Path $RuntimeRoot "ui-workspace\apps\dev-erp"
$WorkerEntry = Join-Path $App "tools\codex_dedicated_worker.mjs"
if (-not (Test-Path -LiteralPath (Join-Path $App "server.mjs")) -or -not (Test-Path -LiteralPath $WorkerEntry)) {
  throw "dev-ERP runtime does not contain both ERP and Codex worker entrypoints."
}

$erpService = Get-CimInstance Win32_Service -Filter "Name='$ErpServiceName'" -ErrorAction SilentlyContinue
$workerService = Get-CimInstance Win32_Service -Filter "Name='$WorkerServiceName'" -ErrorAction SilentlyContinue
if (-not $erpService -or -not $workerService) {
  throw "Pre-provision both services with owner-approved distinct Windows identities and service-secret environments before running this configurator."
}
$systemAccounts = @("LocalSystem", "NT AUTHORITY\SYSTEM")
$identityMissing = (-not $erpService.StartName) -or (-not $workerService.StartName)
$identitySame = $erpService.StartName -eq $workerService.StartName
$erpUsesSystem = $systemAccounts -contains $erpService.StartName
$workerUsesSystem = $systemAccounts -contains $workerService.StartName
if ($identityMissing -or $identitySame -or $erpUsesSystem -or $workerUsesSystem) {
  throw "ERP and Codex worker services must use distinct non-SYSTEM Windows identities."
}

$LogDir = Join-Path $App "logs\service"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Invoke-Nssm([string[]]$Arguments) {
  & $NssmExe @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "NSSM command failed with exit code $LASTEXITCODE."
  }
}

function Set-NssmProcess($Name, $Parameters, $StdoutName, $StderrName) {
  Invoke-Nssm @("set", $Name, "Application", $NodeExe)
  Invoke-Nssm @("set", $Name, "AppDirectory", $App)
  Invoke-Nssm @("set", $Name, "AppParameters", $Parameters)
  Invoke-Nssm @("set", $Name, "AppStdout", (Join-Path $LogDir $StdoutName))
  Invoke-Nssm @("set", $Name, "AppStderr", (Join-Path $LogDir $StderrName))
  Invoke-Nssm @("set", $Name, "AppRotateFiles", "1")
  Invoke-Nssm @("set", $Name, "AppRotateOnline", "1")
  Invoke-Nssm @("set", $Name, "AppRotateBytes", "10485760")
  Invoke-Nssm @("set", $Name, "AppExit", "Default", "Restart")
  Invoke-Nssm @("set", $Name, "AppRestartDelay", "5000")
  Invoke-Nssm @("set", $Name, "Start", "SERVICE_AUTO_START")
}

Set-NssmProcess $WorkerServiceName "tools/codex_dedicated_worker.mjs" "codex-worker.out.log" "codex-worker.err.log"
Set-NssmProcess $ErpServiceName "server.mjs --host $HostName --port $Port" "dev-erp.out.log" "dev-erp.err.log"
Invoke-Nssm @("set", $ErpServiceName, "DependOnService", $WorkerServiceName)

Write-Output "Configured two pre-provisioned NSSM services without reading or writing their secret environments."
Write-Output "Start worker first: nssm start $WorkerServiceName"
Write-Output "Then start ERP:   nssm start $ErpServiceName"
Write-Output "Production remains blocked until the release audit reports zero blockers."
