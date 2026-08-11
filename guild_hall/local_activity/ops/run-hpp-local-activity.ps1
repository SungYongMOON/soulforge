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
$healthPath = Join-Path (Split-Path $LogRoot -Parent) "health.json"
$startedAt = [DateTime]::UtcNow.ToString("o")
$priorLastSuccessAt = $null
try {
    $priorHealth = Get-Content -LiteralPath $healthPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    $parsedLastSuccessAt = [DateTime]::MinValue
    if ($priorHealth.schema_version -eq "soulforge.hpp_local_activity_health.v1" -and
        $priorHealth.last_success_at -is [string] -and
        [DateTime]::TryParse($priorHealth.last_success_at, [ref]$parsedLastSuccessAt)) {
        $priorLastSuccessAt = $priorHealth.last_success_at
    }
}
catch {}

function Write-LocalActivityHealth {
    param([string]$Status, [string[]]$ErrorCodes, [string]$LastSuccessAt)
    $completedAt = [DateTime]::UtcNow.ToString("o")
    $record = [ordered]@{
        schema_version = "soulforge.hpp_local_activity_health.v1"
        status = $Status
        attempted_at = $startedAt
        completed_at = $completedAt
        last_success_at = $LastSuccessAt
        error_codes = @($ErrorCodes)
        activity_changed = $null
    }
    $directory = Split-Path $healthPath -Parent
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporary = "{0}.{1}.tmp" -f $healthPath, $PID
    [System.IO.File]::WriteAllText($temporary, (($record | ConvertTo-Json -Depth 3) + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $healthPath -PathType Leaf) {
        $replaceBackup = "{0}.replace-backup" -f $healthPath
        Remove-Item -LiteralPath $replaceBackup -Force -ErrorAction SilentlyContinue
        [System.IO.File]::Replace($temporary, $healthPath, $replaceBackup)
        Remove-Item -LiteralPath $replaceBackup -Force -ErrorAction SilentlyContinue
    }
    else {
        [System.IO.File]::Move($temporary, $healthPath)
    }
    return $completedAt
}

try {
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
    $completedAt = Write-LocalActivityHealth -Status "ok" -ErrorCodes @() -LastSuccessAt ([DateTime]::UtcNow.ToString("o"))
}
catch {
    $code = if ($_.Exception.Message -match '^hpp_local_activity_[a-z0-9_]+$') {
        $_.Exception.Message
    } else {
        "hpp_local_activity_collection_failed"
    }
    Write-LocalActivityHealth -Status "error" -ErrorCodes @($code) -LastSuccessAt $priorLastSuccessAt | Out-Null
    throw
}
