[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Resolve-OutlookSendOutcome {
    param(
        [Parameter(Mandatory = $true)]
        [int]$SendCallCount,

        [Parameter(Mandatory = $true)]
        [int]$ElapsedSeconds,

        [Parameter(Mandatory = $true)]
        [int]$ExactSentMatches,

        [Parameter(Mandatory = $true)]
        [int]$ExactOutboxMatches,

        [int]$ConfirmationWindowSeconds = 30
    )

    if ($SendCallCount -lt 0 -or $SendCallCount -gt 1) {
        throw 'send_call_count_must_be_zero_or_one'
    }
    if ($ElapsedSeconds -lt 0 -or $ConfirmationWindowSeconds -le 0) {
        throw 'confirmation_window_invalid'
    }
    if ($ExactSentMatches -lt 0 -or $ExactSentMatches -gt 1 -or
        $ExactOutboxMatches -lt 0 -or $ExactOutboxMatches -gt 1 -or
        ($ExactSentMatches + $ExactOutboxMatches) -gt 1) {
        throw 'exact_item_correlation_ambiguous'
    }

    $state = if ($SendCallCount -eq 0) {
        'not_started'
    } elseif ($ExactSentMatches -eq 1) {
        'confirmed_sent'
    } elseif ($ExactOutboxMatches -eq 1) {
        'confirmed_queued'
    } elseif ($ElapsedSeconds -ge $ConfirmationWindowSeconds) {
        'unknown'
    } else {
        'pending'
    }

    [ordered]@{
        state = $state
        automatic_retry_allowed = $false
        send_call_maximum = 1
        confirmation_window_seconds = $ConfirmationWindowSeconds
        poll_interval_seconds = 1
        correlation_fields = @(
            'subject'
            'ordered_recipient_SMTP_values'
            'attachment_name_size_digest'
            'normalized_body_digest'
            'send_started_at_utc'
        )
    }
}

$confirmed = Resolve-OutlookSendOutcome `
    -SendCallCount 1 -ElapsedSeconds 2 -ExactSentMatches 1 -ExactOutboxMatches 0
$queued = Resolve-OutlookSendOutcome `
    -SendCallCount 1 -ElapsedSeconds 2 -ExactSentMatches 0 -ExactOutboxMatches 1
$unknown = Resolve-OutlookSendOutcome `
    -SendCallCount 1 -ElapsedSeconds 30 -ExactSentMatches 0 -ExactOutboxMatches 0
$expectedCorrelationFields = @(
    'subject'
    'ordered_recipient_SMTP_values'
    'attachment_name_size_digest'
    'normalized_body_digest'
    'send_started_at_utc'
)
$correlationFieldsExact =
    [string]::Join('|', $unknown.correlation_fields) -eq
    [string]::Join('|', $expectedCorrelationFields)

$secondSendRejected = $false
try {
    $null = Resolve-OutlookSendOutcome `
        -SendCallCount 2 -ElapsedSeconds 30 -ExactSentMatches 0 -ExactOutboxMatches 0
} catch {
    $secondSendRejected = $_.Exception.Message -eq 'send_call_count_must_be_zero_or_one'
}

$ambiguousMatchRejected = $false
try {
    $null = Resolve-OutlookSendOutcome `
        -SendCallCount 1 -ElapsedSeconds 2 -ExactSentMatches 1 -ExactOutboxMatches 1
} catch {
    $ambiguousMatchRejected = $_.Exception.Message -eq 'exact_item_correlation_ambiguous'
}

$result = [ordered]@{
    ok = $confirmed.state -eq 'confirmed_sent' -and
        $queued.state -eq 'confirmed_queued' -and
        $unknown.state -eq 'unknown' -and
        -not $unknown.automatic_retry_allowed -and
        $unknown.confirmation_window_seconds -eq 30 -and
        $unknown.poll_interval_seconds -eq 1 -and
        $correlationFieldsExact -and
        $secondSendRejected -and
        $ambiguousMatchRejected
    confirmed_state = $confirmed.state
    queued_state = $queued.state
    unknown_state = $unknown.state
    unknown_retry_allowed = $unknown.automatic_retry_allowed
    second_send_rejected = $secondSendRejected
    ambiguous_match_rejected = $ambiguousMatchRejected
    correlation_fields_exact = $correlationFieldsExact
}

if (-not $result.ok) {
    throw "Outlook send-continuation contract test failed: $($result | ConvertTo-Json -Compress)"
}

$result | ConvertTo-Json -Compress
