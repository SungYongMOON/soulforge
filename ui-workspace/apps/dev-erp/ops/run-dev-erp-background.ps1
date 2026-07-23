# run-dev-erp-background.ps1 — dev-ERP를 숨김 백그라운드로 기동한다.
# 기본은 loopback/core-only/fail-closed다. LAN 및 외부 통합은 명시적 switch로만 켠다.
[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 4300,
  [switch]$ListenOnLan,
  [switch]$SecureCookie,
  [switch]$EnableLocalLlm,
  [switch]$EnableMailCollect,
  [ValidateRange(60, 86400)]
  [int]$MailCollectSeconds = 900,
  [switch]$EnableAutoIntake,
  [switch]$EnableAutosync,
  [switch]$EnableMorningBrief,
  [string]$MorningBriefHhmm = "0800",
  [string]$MorningBriefPublicUrl = "",
  [string]$MorningBriefDomainAllow = "",
  [switch]$EnableCodexWorker,
  [string]$BackendRoot = "",
  [string]$DatabasePath = "",
  [string]$TlsCertPath = "",
  [string]$TlsKeyPath = "",
  [string]$TlsCaPath = "",
  [switch]$Foreground,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Resolve-ExplicitTlsPath {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$ParameterName
  )

  try {
    $Resolved = Resolve-Path -LiteralPath $Value -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $Resolved.Path -PathType Leaf)) {
      throw "not_a_file"
    }
    return $Resolved.Path
  } catch {
    throw "$ParameterName must identify an existing file."
  }
}

if ($EnableAutoIntake -and -not $EnableMailCollect) {
  throw "-EnableAutoIntake requires -EnableMailCollect."
}
if ($EnableLocalLlm) {
  throw "-EnableLocalLlm is disabled by the 2026-07-23 owner policy. Use the separate RAG session runtime."
}
if ($EnableMorningBrief) {
  if ($MorningBriefHhmm -notmatch '^([01]\d|2[0-3])[0-5]\d$') {
    throw "-MorningBriefHhmm must be HHmm (0000-2359)."
  }
  if ($MorningBriefPublicUrl -notmatch '^https?://') {
    throw "-EnableMorningBrief requires -MorningBriefPublicUrl (http:// or https://)."
  }
  if ([string]::IsNullOrWhiteSpace($MorningBriefDomainAllow)) {
    throw "-EnableMorningBrief requires -MorningBriefDomainAllow."
  }
}

$HasTlsCertPath = -not [string]::IsNullOrWhiteSpace($TlsCertPath)
$HasTlsKeyPath = -not [string]::IsNullOrWhiteSpace($TlsKeyPath)
$HasTlsCaPath = -not [string]::IsNullOrWhiteSpace($TlsCaPath)
if ($HasTlsCertPath -ne $HasTlsKeyPath) {
  throw "-TlsCertPath and -TlsKeyPath must be provided together."
}
if ($HasTlsCaPath -and -not $HasTlsCertPath) {
  throw "-TlsCaPath requires -TlsCertPath and -TlsKeyPath."
}
if ($HasTlsCertPath) {
  $TlsCertPath = Resolve-ExplicitTlsPath -Value $TlsCertPath -ParameterName "-TlsCertPath"
  $TlsKeyPath = Resolve-ExplicitTlsPath -Value $TlsKeyPath -ParameterName "-TlsKeyPath"
}
if ($HasTlsCaPath) {
  $TlsCaPath = Resolve-ExplicitTlsPath -Value $TlsCaPath -ParameterName "-TlsCaPath"
}
$TlsSummary = if ($HasTlsCertPath) { "explicit" } else { "auto" }

$App = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$ServerPath = (Resolve-Path -LiteralPath (Join-Path $App "server.mjs")).Path
$NodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $NodeCmd) { throw "node.exe not found." }
$NodeExe = [IO.Path]::GetFullPath($NodeCmd.Source)
$ListenHost = if ($ListenOnLan) { "0.0.0.0" } else { "127.0.0.1" }

if ([string]::IsNullOrWhiteSpace($BackendRoot)) {
  if (-not [string]::IsNullOrWhiteSpace($env:DEV_ERP_BACKEND_ROOT)) {
    $BackendRoot = $env:DEV_ERP_BACKEND_ROOT
  } else {
    $RuntimeRoot = (Resolve-Path -LiteralPath (Join-Path $App "..\..\..")).Path
    $BackendRoot = Join-Path (Split-Path -Parent $RuntimeRoot) "Soulforge"
  }
}
$BackendRoot = [IO.Path]::GetFullPath($BackendRoot)

$DatabaseSummary = "default"
if (-not [string]::IsNullOrWhiteSpace($DatabasePath)) {
  if (-not [IO.Path]::IsPathRooted($DatabasePath)) {
    $DatabasePath = Join-Path $App $DatabasePath
  }
  $DatabasePath = [IO.Path]::GetFullPath($DatabasePath)
  $DatabaseSummary = "explicit"
}

$ProcessArgs = @(
  $ServerPath,
  "--host", $ListenHost,
  "--port", [string]$Port,
  "--knowledge_shell_root", $BackendRoot,
  "--no-real-meta",
  "--no-fixture"
)
if ($DatabaseSummary -eq "explicit") { $ProcessArgs += @("--db", $DatabasePath) }
if ($SecureCookie) { $ProcessArgs += "--secure-cookie" }
if ($HasTlsCertPath) {
  $ProcessArgs += @("--tls-cert", $TlsCertPath, "--tls-key", $TlsKeyPath)
}
if ($HasTlsCaPath) { $ProcessArgs += @("--tls-ca", $TlsCaPath) }

if (-not ("DevErpCommandLine" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class DevErpCommandLine {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern IntPtr CommandLineToArgvW(string commandLine, out int argc);

  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr value);

  public static string[] Split(string commandLine) {
    if (String.IsNullOrWhiteSpace(commandLine)) return new string[0];
    int argc;
    IntPtr argv = CommandLineToArgvW(commandLine, out argc);
    if (argv == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      string[] result = new string[argc];
      for (int i = 0; i < argc; i++) {
        result[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(argv, i * IntPtr.Size));
      }
      return result;
    } finally {
      LocalFree(argv);
    }
  }
}
"@
}

function Test-ExpectedDevErpProcess {
  param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [Parameter(Mandatory = $true)][string]$ExpectedExecutable,
    [Parameter(Mandatory = $true)][string[]]$ExpectedArguments
  )

  try {
    $ProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  } catch {
    return [pscustomobject]@{ Match = $false; Reason = "process_query_failed" }
  }
  if (-not $ProcessInfo) {
    return [pscustomobject]@{ Match = $false; Reason = "process_not_found" }
  }
  if ([string]::IsNullOrWhiteSpace($ProcessInfo.ExecutablePath)) {
    return [pscustomobject]@{ Match = $false; Reason = "executable_path_unavailable" }
  }

  $ActualExecutable = [IO.Path]::GetFullPath($ProcessInfo.ExecutablePath)
  if (-not [string]::Equals($ActualExecutable, $ExpectedExecutable, [StringComparison]::OrdinalIgnoreCase)) {
    return [pscustomobject]@{ Match = $false; Reason = "executable_mismatch" }
  }

  try {
    [string[]]$ActualArgv = [DevErpCommandLine]::Split([string]$ProcessInfo.CommandLine)
  } catch {
    return [pscustomobject]@{ Match = $false; Reason = "command_line_unavailable" }
  }
  if ($ActualArgv.Count -ne ($ExpectedArguments.Count + 1)) {
    return [pscustomobject]@{ Match = $false; Reason = "argument_count_mismatch_$($ActualArgv.Count)_expected_$($ExpectedArguments.Count + 1)" }
  }
  for ($Index = 0; $Index -lt $ExpectedArguments.Count; $Index++) {
    if (-not [string]::Equals($ActualArgv[$Index + 1], $ExpectedArguments[$Index], [StringComparison]::Ordinal)) {
      return [pscustomobject]@{ Match = $false; Reason = "argument_mismatch" }
    }
  }
  return [pscustomobject]@{ Match = $true; Reason = "exact_match" }
}

function Get-ListenerProcessIds {
  param([Parameter(Mandatory = $true)][int]$LocalPort)
  try {
    $Listeners = @(Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction Stop)
  } catch {
    if ($_.FullyQualifiedErrorId -like "CmdletizationQuery_NotFound,Get-NetTCPConnection") {
      return @()
    }
    throw
  }
  return @(
    $Listeners |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
}

$ListenerProcessIds = @(Get-ListenerProcessIds -LocalPort $Port)
$MatchedProcessIds = @()
foreach ($OwnerProcessId in $ListenerProcessIds) {
  $Identity = Test-ExpectedDevErpProcess -ProcessId $OwnerProcessId -ExpectedExecutable $NodeExe -ExpectedArguments $ProcessArgs
  if (-not $Identity.Match) {
    throw "Port $Port is owned by an unidentified process (PID $OwnerProcessId, reason=$($Identity.Reason)); no process was terminated."
  }
  $MatchedProcessIds += $OwnerProcessId
}

$EnabledIntegrations = @()
if ($ListenOnLan) { $EnabledIntegrations += "lan" }
if ($EnableMailCollect) { $EnabledIntegrations += "mail-collect" }
if ($EnableAutoIntake) { $EnabledIntegrations += "auto-intake" }
if ($EnableAutosync) { $EnabledIntegrations += "autosync" }
if ($EnableMorningBrief) { $EnabledIntegrations += "morning-brief" }
if ($EnableCodexWorker) { $EnabledIntegrations += "codex-worker" }
$IntegrationSummary = if ($EnabledIntegrations.Count) { $EnabledIntegrations -join "," } else { "none" }

if ($DryRun) {
  $Action = if ($MatchedProcessIds.Count) { "would_replace_exact_match" } else { "would_start" }
  $Mode = if ($Foreground) { "foreground" } else { "background" }
  $CookieSummary = if ($SecureCookie) { "on" } else { "auto" }
  Write-Output "dev-erp dry-run: action=$Action mode=$Mode host=$ListenHost port=$Port db=$DatabaseSummary secure-cookie=$CookieSummary tls=$TlsSummary integrations=$IntegrationSummary real-meta=off fixture=off"
  return
}

$ProcessHandles = @()
try {
  foreach ($OwnerProcessId in $MatchedProcessIds) {
    $ProcessHandle = Get-Process -Id $OwnerProcessId -ErrorAction Stop
    $null = $ProcessHandle.Handle
    $Identity = Test-ExpectedDevErpProcess -ProcessId $OwnerProcessId -ExpectedExecutable $NodeExe -ExpectedArguments $ProcessArgs
    if (-not $Identity.Match) {
      $ProcessHandle.Dispose()
      throw "Process identity changed before replacement (PID $OwnerProcessId); no process was terminated."
    }
    $ProcessHandles += $ProcessHandle
  }

  foreach ($ProcessHandle in $ProcessHandles) {
    $ProcessHandle.Kill()
    if (-not $ProcessHandle.WaitForExit(5000)) {
      throw "Exact dev-ERP process did not exit within 5 seconds; replacement was not started."
    }
  }

  $PortReleaseDeadline = [DateTime]::UtcNow.AddSeconds(5)
  do {
    $RemainingListeners = @(Get-ListenerProcessIds -LocalPort $Port)
    if (-not $RemainingListeners.Count) { break }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $PortReleaseDeadline)
  if ($RemainingListeners.Count) {
    throw "Port $Port remained occupied after the exact dev-ERP process exited; replacement was not started."
  }
} finally {
  foreach ($ProcessHandle in $ProcessHandles) { $ProcessHandle.Dispose() }
}

function Remove-LaunchEnvironment {
  param([Parameter(Mandatory = $true)][string[]]$Names)
  foreach ($Name in $Names) {
    Remove-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
  }
}

function Test-SensitiveLaunchEnvironmentName {
  param([Parameter(Mandatory = $true)][string]$Name)

  if ($Name -match '^(DEV_ERP_|ERP_|CODEX_|OLLAMA_|OPENAI_|ANTHROPIC_|AZURE_|AWS_|GOOGLE_|GEMINI_|GH_|GITHUB_|GIT_|NPM_|YARN_|PNPM_|SLACK_|TELEGRAM_|SMTP_|IMAP_|MAIL_|NODE_)') {
    return $true
  }
  if ($Name -match '(^|_)(TOKEN|SECRET|PASSWORD|PASSPHRASE|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIALS?|COOKIE|SESSION)(_|$)') {
    return $true
  }
  return $Name -in @(
    "ALL_PROXY", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
    "CURL_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "SSL_CERT_DIR", "SSL_CERT_FILE", "SSLKEYLOGFILE",
    "OPENSSL_CONF", "DATABASE_URL", "REDIS_URL", "MYSQL_PWD", "PGPASSFILE"
  )
}

$CodexOptInEnvironmentNames = @(
  "DEV_ERP_CODEX_WORKER_URL", "DEV_ERP_CODEX_WORKER_TOKEN",
  "DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH", "DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256",
  "DEV_ERP_CODEX_WORKER_ATTEST_PUBLIC_KEY_FILE", "DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID",
  "DEV_ERP_CODEX_WORKER_HEALTH_TTL_MS", "DEV_ERP_CODEX_TASK_CWD", "DEV_ERP_CODEX_WORKSPACE_REGISTRY",
  "DEV_ERP_CODEX_WORKSPACE_PROBE_TTL_MS", "DEV_ERP_CODEX_TASK_TIMEOUT_MS",
  "DEV_ERP_CODEX_TURN_PROJECTION_ROOT", "DEV_ERP_CODEX_HOME", "DEV_ERP_CODEX_TRUST_DOMAIN",
  "DEV_ERP_CODEX_ALLOWED_SKILLS", "DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT",
  "DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT", "DEV_ERP_CODEX_TASK_IMAGE_MAX", "DEV_ERP_CODEX_TASK_FILE_MAX",
  "DEV_ERP_CODEX_ATTACHMENT_MAX_COUNT", "DEV_ERP_CODEX_ATTACHMENT_TOTAL_MAX",
  "DEV_ERP_CODEX_TASK_MODEL", "DEV_ERP_CODEX_TASK_EFFORT", "DEV_ERP_CODEX_MODEL_CATALOG_TTL_MS",
  "DEV_ERP_CODEX_JSON_MAX", "DEV_ERP_CODEX_MESSAGE_MAX", "DEV_ERP_CODEX_GLOBAL_CONCURRENCY",
  "DEV_ERP_CODEX_ACCOUNT_CONCURRENCY", "DEV_ERP_CODEX_ACCOUNT_TURNS_PER_HOUR",
  "DEV_ERP_CODEX_BIN", "DEV_ERP_CODEX_MODEL_DISCOVERY_TIMEOUT_MS", "DEV_ERP_CODEX_SANDBOX",
  "DEV_ERP_CODEX_SERVICE_TIER"
)
$CodexOptInEnvironment = @{}
if ($EnableCodexWorker) {
  foreach ($Name in $CodexOptInEnvironmentNames) {
    $Value = [Environment]::GetEnvironmentVariable($Name, [EnvironmentVariableTarget]::Process)
    if ($null -ne $Value) { $CodexOptInEnvironment[$Name] = $Value }
  }
}

$InheritedEnvironmentNames = @(
  Get-ChildItem Env: |
    Select-Object -ExpandProperty Name |
    Where-Object { Test-SensitiveLaunchEnvironmentName -Name $_ }
)
if ($InheritedEnvironmentNames.Count) {
  Remove-LaunchEnvironment -Names $InheritedEnvironmentNames
}

if ($EnableMailCollect) {
  $env:DEV_ERP_MAIL_COLLECT_SEC = [string]$MailCollectSeconds
  $env:DEV_ERP_MAIL_ROUTE_BACKFILL_INCLUDE_HIDDEN = "1"
}
if ($EnableAutoIntake) {
  $env:DEV_ERP_AUTO_INTAKE = "1"
  $env:DEV_ERP_INTAKE_LLM = "none"
}
if ($EnableAutosync) {
  $env:DEV_ERP_AUTOSYNC = "1"
}
if ($EnableMorningBrief) {
  $env:DEV_ERP_MORNING_BRIEF = "1"
  $env:DEV_ERP_MORNING_BRIEF_HHMM = $MorningBriefHhmm
  $env:DEV_ERP_PUBLIC_URL = $MorningBriefPublicUrl
  $env:DEV_ERP_BRIEF_DOMAIN_ALLOW = $MorningBriefDomainAllow
}

$env:DEV_ERP_CODEX_TASK_BRIDGE = "worker"
if ($EnableCodexWorker) {
  foreach ($Name in $CodexOptInEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($Name, $CodexOptInEnvironment[$Name], [EnvironmentVariableTarget]::Process)
  }
}
$env:DEV_ERP_BACKEND_ROOT = $BackendRoot

$LogDir = Join-Path $App "logs\service"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function ConvertTo-ProcessArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains('"')) { throw "Process argument contains an unsupported quote character." }
  if ($Value -notmatch '\s') { return $Value }
  $Escaped = $Value -replace '(\\+)$', '$1$1'
  return '"' + $Escaped + '"'
}
$ArgumentLine = (($ProcessArgs | ForEach-Object { ConvertTo-ProcessArgument -Value $_ }) -join " ")
$Started = Start-Process -FilePath $NodeExe -ArgumentList $ArgumentLine `
  -WorkingDirectory $App -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $LogDir "dev-erp.out.log") `
  -RedirectStandardError (Join-Path $LogDir "dev-erp.err.log")
$StartedProcessId = $Started.Id
$NodeExitCode = $null

$StartupFailure = $null
try {
  $null = $Started.Handle
  $StartupTimeoutSeconds = 30
  $StartupDeadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
  do {
    if ($Started.HasExited) {
      throw "Spawned dev-ERP process exited before listener attestation (exit=$($Started.ExitCode))."
    }

    $StartedListenerProcessIds = @(Get-ListenerProcessIds -LocalPort $Port)
    if ($StartedListenerProcessIds.Count) {
      if ($StartedListenerProcessIds.Count -ne 1 -or $StartedListenerProcessIds[0] -ne $Started.Id) {
        throw "Post-start listener attestation failed: the spawned PID is not the sole listener on port $Port."
      }
      $StartedIdentity = Test-ExpectedDevErpProcess -ProcessId $Started.Id -ExpectedExecutable $NodeExe -ExpectedArguments $ProcessArgs
      if (-not $StartedIdentity.Match -or $Started.HasExited) {
        throw "Post-start process attestation failed (reason=$($StartedIdentity.Reason))."
      }
      break
    }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $StartupDeadline)

  if (-not $StartedListenerProcessIds.Count) {
    throw "Spawned dev-ERP process did not bind port $Port within $StartupTimeoutSeconds seconds."
  }

  if ($Foreground) {
    $CookieSummary = if ($SecureCookie) { "on" } else { "auto" }
    Write-Output "dev-erp foreground running: pid=$StartedProcessId host=$ListenHost port=$Port db=$DatabaseSummary secure-cookie=$CookieSummary tls=$TlsSummary integrations=$IntegrationSummary real-meta=off fixture=off"
    $Started.WaitForExit()
    $NodeExitCode = $Started.ExitCode
  }
} catch {
  $StartupFailure = $_
  try {
    if (-not $Started.HasExited) {
      $Started.Kill()
      if (-not $Started.WaitForExit(5000)) {
        throw "Spawned process did not exit within 5 seconds after retained-handle cleanup."
      }
    }
  } catch {
    throw "Startup attestation failed and retained-handle cleanup also failed: $($_.Exception.Message)"
  }
  throw $StartupFailure
} finally {
  $Started.Dispose()
}

$CookieSummary = if ($SecureCookie) { "on" } else { "auto" }
if ($Foreground) {
  Write-Output "dev-erp foreground exited: exit=$NodeExitCode host=$ListenHost port=$Port db=$DatabaseSummary secure-cookie=$CookieSummary tls=$TlsSummary integrations=$IntegrationSummary real-meta=off fixture=off"
  exit $NodeExitCode
}

Write-Output "dev-erp background started: pid=$StartedProcessId host=$ListenHost port=$Port db=$DatabaseSummary secure-cookie=$CookieSummary tls=$TlsSummary integrations=$IntegrationSummary real-meta=off fixture=off"
