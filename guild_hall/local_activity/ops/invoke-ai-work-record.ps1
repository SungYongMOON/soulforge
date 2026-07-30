[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("publish", "ack", "pending")]
  [string]$Operation,

  [Parameter(Mandatory = $true)]
  [string]$Project,

  [Parameter(Mandatory = $true)]
  [string]$StateRoot,

  [Parameter(Mandatory = $true)]
  [string]$RuntimeRoot,

  [string]$EventJson,
  [string]$AttemptId,
  [string]$AttemptedAt,
  [string]$OwnerToken,
  [string]$FencingToken,
  [string]$LockAcquiredAt,
  [string]$WorkId,
  [string]$EventId,
  [string]$EventDigest,
  [Nullable[long]]$Sequence,
  [string]$AckId,
  [string]$AckedAt,
  [switch]$DryRun,
  [switch]$SyntheticApply,
  [string]$NodeExe = "node"
)

$ErrorActionPreference = "Stop"

if ($DryRun -and $SyntheticApply) {
  throw "feature_mode_conflict"
}
if (-not $DryRun -and -not $SyntheticApply) {
  throw "ai_work_record_feature_off"
}
if (-not [System.IO.Path]::IsPathRooted($StateRoot)) {
  throw "state_root_must_be_absolute"
}
if (-not [System.IO.Path]::IsPathRooted($RuntimeRoot)) {
  throw "runtime_root_must_be_absolute"
}

$resolvedStateRoot = [System.IO.Path]::GetFullPath($StateRoot)
$resolvedRuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
$cliPath = Join-Path `
  $resolvedRuntimeRoot `
  "guild_hall\local_activity\ai_work_record_outbox_cli.mjs"

if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
  throw "ai_work_record_outbox_cli_missing"
}

$arguments = @(
  $cliPath,
  "--operation", $Operation,
  "--state-root", $resolvedStateRoot,
  "--project", $Project
)
if ($DryRun) {
  $arguments += "--dry-run"
} else {
  $temporaryRoot = [System.IO.Path]::GetFullPath(
    [System.IO.Path]::GetTempPath()
  ).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $stateParent = [System.IO.Directory]::GetParent(
    $resolvedStateRoot
  )
  if (
    $null -eq $stateParent -or
    $stateParent.FullName.TrimEnd(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    ) -ne $temporaryRoot -or
    -not [System.IO.Path]::GetFileName(
      $resolvedStateRoot
    ).StartsWith(
      "soulforge-ai-work-record-test-",
      [System.StringComparison]::Ordinal
    )
  ) {
    throw "synthetic_state_root_required"
  }
  $arguments += "--synthetic-apply"
}

if ($Operation -eq "publish") {
  if (-not $EventJson) {
    throw "event_json_required"
  }
  try {
    $parsedEvent = $EventJson | ConvertFrom-Json
  } catch {
    throw "event_json_invalid"
  }
  if ($null -eq $parsedEvent -or $parsedEvent -is [System.Array]) {
    throw "event_json_object_required"
  }
  $eventBytes = [System.Text.Encoding]::UTF8.GetBytes($EventJson)
  $eventBase64 = [Convert]::ToBase64String($eventBytes)
  $arguments += @("--event-base64", $eventBase64)
  if (-not $DryRun) {
    if (-not $AttemptId) {
      throw "attempt_id_required"
    }
    if (-not $AttemptedAt) {
      throw "attempted_at_required"
    }
    $arguments += @(
      "--attempt-id", $AttemptId,
      "--attempted-at", $AttemptedAt
    )
  }
}

if ($Operation -eq "ack") {
  if (-not $WorkId) {
    throw "work_id_required"
  }
  if (-not $EventId) {
    throw "event_id_required"
  }
  if (-not $EventDigest) {
    throw "event_digest_required"
  }
  if ($null -eq $Sequence) {
    throw "sequence_required"
  }
  if (-not $AckId) {
    throw "ack_id_required"
  }
  if (-not $AckedAt) {
    throw "acked_at_required"
  }
  $arguments += @(
    "--work-id", $WorkId,
    "--event-id", $EventId,
    "--event-digest", $EventDigest,
    "--sequence", $Sequence.ToString(
      [System.Globalization.CultureInfo]::InvariantCulture
    ),
    "--ack-id", $AckId,
    "--acked-at", $AckedAt
  )
}

if (-not $DryRun -and $Operation -ne "pending") {
  if (-not $OwnerToken) {
    throw "owner_token_required"
  }
  if (-not $FencingToken) {
    throw "fencing_token_required"
  }
  if (-not $LockAcquiredAt) {
    throw "lock_acquired_at_required"
  }
  $arguments += @(
    "--owner-token", $OwnerToken,
    "--fencing-token", $FencingToken,
    "--lock-acquired-at", $LockAcquiredAt
  )
}

& $NodeExe @arguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
