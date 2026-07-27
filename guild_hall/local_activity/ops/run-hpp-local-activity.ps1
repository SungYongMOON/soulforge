param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimeRoot,
    [Parameter(Mandatory = $true)]
    [string]$BindingPath,
    [Parameter(Mandatory = $true)]
    [string]$BindingSha256,
    [string]$NodeExe = "",
    [string]$LogRoot = ""
)

$ErrorActionPreference = "Stop"

$runtime = [System.IO.Path]::GetFullPath($RuntimeRoot)
$binding = [System.IO.Path]::GetFullPath($BindingPath)
$NodeExe = if ($NodeExe) {
    $NodeExe
} else {
    (Get-Command node.exe -ErrorAction Stop).Source
}
$node = [System.IO.Path]::GetFullPath($NodeExe)
$cli = Join-Path $runtime "guild_hall\local_activity\cli.mjs"
$LogRoot = if ($LogRoot) {
    $LogRoot
} else {
    Join-Path (Split-Path (Split-Path $binding -Parent) -Parent) "logs"
}

foreach ($target in @($node, $cli, $binding)) {
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        throw "hpp_local_activity_required_file_missing"
    }
}

$actualDigest = (Get-FileHash -LiteralPath $binding -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedDigest = $BindingSha256.ToLowerInvariant().Replace("sha256:", "")
if ($actualDigest -ne $expectedDigest) {
    throw "hpp_local_activity_binding_digest_mismatch"
}

New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
$logPath = Join-Path $LogRoot ("{0}.jsonl" -f (Get-Date -Format "yyyy-MM-dd"))
$startedAt = [DateTime]::UtcNow.ToString("o")
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    $output = & $node $cli --binding $binding --binding-sha256 ("sha256:{0}" -f $actualDigest) --apply 2>&1
}
finally {
    $ErrorActionPreference = $previousErrorActionPreference
}
$exitCode = $LASTEXITCODE
$finishedAt = [DateTime]::UtcNow.ToString("o")
$record = [ordered]@{
    schema_version = "soulforge.hpp_local_activity_scheduler_log.v1"
    started_at = $startedAt
    finished_at = $finishedAt
    exit_code = $exitCode
    output = (($output | Out-String).Trim())
}
[System.IO.File]::AppendAllText(
    $logPath,
    (($record | ConvertTo-Json -Compress) + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
)
if ($exitCode -ne 0) {
    throw "hpp_local_activity_collection_failed"
}
