[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SoulforgeRoot,

    [string]$AntigravityExe,

    [string]$LockedPacketPath,

    [string]$RouteRequestPath,

    [string]$RuntimeBindingPath,

    [string]$RunRoot,

    [switch]$ArmDraft,

    [switch]$ContractSelfTest
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$root = [IO.Path]::GetFullPath($SoulforgeRoot)
if (
    -not (Test-Path -LiteralPath (
        Join-Path $root 'AGENTS.md'
    ) -PathType Leaf)
) {
    throw 'SOULFORGE_ROOT_NOT_FOUND'
}

$bridgeRoot = [IO.Path]::GetFullPath(
    (Join-Path $root (
        '_workspaces\system\antigravity_outlook_bridge'
    ))
)
$orchestrator = Join-Path $bridgeRoot (
    'draft\run_same_thread_additive_once.ps1'
)
$syntheticTest = Join-Path $bridgeRoot (
    'tests\run_same_thread_synthetic_tests.ps1'
)

if (
    -not (Test-Path -LiteralPath $orchestrator -PathType Leaf) -or
    -not (Test-Path -LiteralPath $syntheticTest -PathType Leaf)
) {
    throw 'SAME_THREAD_LOCAL_BRIDGE_NOT_INSTALLED'
}

if ($ContractSelfTest) {
    $testOutput = & $syntheticTest
    if ($LASTEXITCODE -ne 0) {
        throw 'SAME_THREAD_LOCAL_BRIDGE_SELF_TEST_FAILED'
    }
    $testResult = $testOutput | ConvertFrom-Json
    if (-not [bool]$testResult.ok) {
        throw 'SAME_THREAD_LOCAL_BRIDGE_SELF_TEST_FAILED'
    }
    [ordered]@{
        ok = $true
        suite = 'owner_outlook_same_thread_connector'
        local_bridge_present = $true
        local_bridge_self_test_passed = $true
        outlook_accessed = $false
        outlook_changed = $false
        outlook_sent = $false
    } | ConvertTo-Json -Compress
    return
}

if (-not $ArmDraft) {
    throw 'SAME_THREAD_CONNECTOR_NOT_ARMED'
}

foreach ($requiredValue in @(
    $AntigravityExe,
    $LockedPacketPath,
    $RouteRequestPath,
    $RuntimeBindingPath,
    $RunRoot
)) {
    if ([string]::IsNullOrWhiteSpace($requiredValue)) {
        throw 'SAME_THREAD_CONNECTOR_INPUT_MISSING'
    }
}

& $orchestrator `
    -AntigravityExe $AntigravityExe `
    -LockedPacketPath $LockedPacketPath `
    -RouteRequestPath $RouteRequestPath `
    -RuntimeBindingPath $RuntimeBindingPath `
    -RunRoot $RunRoot `
    -ArmDraft

if ($LASTEXITCODE -ne 0) {
    throw 'SAME_THREAD_LOCAL_BRIDGE_FAILED'
}
