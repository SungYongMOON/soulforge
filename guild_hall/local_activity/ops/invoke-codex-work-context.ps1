[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(
    "register_leader",
    "begin_work",
    "attach_thread",
    "checkpoint",
    "finish_work",
    "supersede_work",
    "status"
  )]
  [string]$Operation,

  [Parameter(Mandatory = $true)]
  [string]$Project,

  [string]$PayloadJson = "{}",

  [Parameter(Mandatory = $true)]
  [string]$RuntimeRoot,

  [Parameter(Mandatory = $true)]
  [string]$BindingPath,

  [Parameter(Mandatory = $true)]
  [string]$BindingSha256,

  [string]$EventId,

  [string]$OccurredAt,

  [string]$NodeExe = "node"
)

$ErrorActionPreference = "Stop"

if (-not [System.IO.Path]::IsPathRooted($RuntimeRoot)) {
  throw "runtime_root_must_be_absolute"
}
if (-not [System.IO.Path]::IsPathRooted($BindingPath)) {
  throw "binding_path_must_be_absolute"
}

$resolvedRuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
$resolvedBindingPath = [System.IO.Path]::GetFullPath($BindingPath)
$cliPath = Join-Path `
  $resolvedRuntimeRoot `
  "guild_hall\local_activity\codex_work_context_cli.mjs"

if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
  throw "codex_work_context_cli_missing"
}
if (-not (Test-Path -LiteralPath $resolvedBindingPath -PathType Leaf)) {
  throw "codex_work_context_binding_missing"
}

try {
  $parsedPayload = $PayloadJson | ConvertFrom-Json
} catch {
  throw "payload_json_invalid"
}
if ($null -eq $parsedPayload -or $parsedPayload -is [System.Array]) {
  throw "payload_json_object_required"
}

$payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($PayloadJson)
$payloadBase64 = [Convert]::ToBase64String($payloadBytes)
$arguments = @(
  $cliPath,
  "--binding", $resolvedBindingPath,
  "--binding-sha256", $BindingSha256,
  "--operation", $Operation,
  "--project", $Project,
  "--payload-base64", $payloadBase64
)
if ($EventId) {
  $arguments += @("--event-id", $EventId)
}
if ($OccurredAt) {
  $arguments += @("--occurred-at", $OccurredAt)
}

& $NodeExe @arguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
