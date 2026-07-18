param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = 'Stop'
$packet = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
$failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure([string]$Message) {
    $failures.Add($Message)
}

function Test-ArrayEqual($Expected, $Actual, [string]$FailurePrefix) {
    $expectedItems = @($Expected | ForEach-Object { [string]$_ })
    $actualItems = @($Actual | ForEach-Object { [string]$_ })
    if ($expectedItems.Count -ne $actualItems.Count) {
        Add-Failure "${FailurePrefix}_count_mismatch"
        return
    }
    for ($i = 0; $i -lt $expectedItems.Count; $i++) {
        if ($expectedItems[$i] -cne $actualItems[$i]) {
            Add-Failure "${FailurePrefix}_mismatch_at_$($i + 1)"
            return
        }
    }
}

function Test-RequiredProperties($Object, [string]$ObjectName, [string[]]$Fields) {
    if ($null -eq $Object) {
        Add-Failure "missing_required_object:$ObjectName"
        return
    }
    $present = @($Object.PSObject.Properties.Name)
    foreach ($field in $Fields) {
        if ($field -notin $present) {
            Add-Failure "missing_required_field:${ObjectName}.$field"
        }
    }
}

$requiredTopLevel = @(
    'schema_version',
    'source_context_schema',
    'validation_intent',
    'authority_state',
    'requested_send_surface',
    'application_requested',
    'actionable',
    'render_mode',
    'recipient_label',
    'reason_label',
    'body_text',
    'body_html',
    'purpose_phrases',
    'required_sections',
    'required_phrases',
    'forbidden_terms',
    'recipient_display_order',
    'actual_recipient_display_order',
    'require_table',
    'requested_work_count',
    'technical_value_count',
    'required_table_headers',
    'subject',
    'attachments',
    'deadline',
    'footer'
)
$presentTopLevel = @($packet.PSObject.Properties.Name)
foreach ($field in $requiredTopLevel) {
    if ($field -notin $presentTopLevel) {
        Add-Failure "missing_required_field:$field"
    }
}
Test-RequiredProperties $packet.subject 'subject' @('mode', 'value', 'original_thread_subject', 'resolved', 'required_phrases', 'forbidden_terms')
Test-RequiredProperties $packet.attachments 'attachments' @('owner_selected', 'staged', 'inline_thread_assets_ignored')
Test-RequiredProperties $packet.deadline 'deadline' @('supplied', 'value', 'visible')
Test-RequiredProperties $packet.footer 'footer' @('confirmed', 'signature_count', 'security_footer_count', 'signature_marker', 'security_footer_marker')
if ([string]$packet.schema_version -cne 'soulforge.structured_request_mail_validation.v1') {
    Add-Failure 'schema_version_invalid'
}
if ([string]$packet.source_context_schema -cne 'outbound_team_mail_context_v1') {
    Add-Failure 'source_context_schema_invalid'
}
if ([string]$packet.validation_intent -cne 'file_only') {
    Add-Failure 'validation_intent_must_be_file_only'
}
if ([string]$packet.requested_send_surface -cne 'outlook_manual') {
    Add-Failure 'requested_send_surface_invalid'
}

$bodyText = [string]$packet.body_text
$bodyHtml = [string]$packet.body_html
$nonEmptyLines = @($bodyText -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })
$recipientLabel = [string]$packet.recipient_label
$reasonLabel = [string]$packet.reason_label
$recipientPattern = '^' + [regex]::Escape($recipientLabel) + '\s*:\s*\S'
$reasonPattern = '^' + [regex]::Escape($reasonLabel) + '\s*:\s*\S'
$recipientCountPattern = '(?m)^\s*' + [regex]::Escape($recipientLabel) + '\s*:'
$reasonCountPattern = '(?m)^\s*' + [regex]::Escape($reasonLabel) + '\s*:'
$bodyHtmlText = [Net.WebUtility]::HtmlDecode(
    [regex]::Replace($bodyHtml, '(?is)<[^>]+>', ' ')
)
$htmlParagraphMatches = [regex]::Matches($bodyHtml, '(?is)<p\b[^>]*>(.*?)</p>')
$htmlRecipientLine = if ($htmlParagraphMatches.Count -gt 0) {
    [Net.WebUtility]::HtmlDecode([regex]::Replace($htmlParagraphMatches[0].Groups[1].Value, '(?is)<[^>]+>', ' ')).Trim()
} else { '' }
$htmlReasonLine = if ($htmlParagraphMatches.Count -gt 1) {
    [Net.WebUtility]::HtmlDecode([regex]::Replace($htmlParagraphMatches[1].Groups[1].Value, '(?is)<[^>]+>', ' ')).Trim()
} else { '' }
$subjectText = [string]$packet.subject.value
$searchableText = "$subjectText`n$bodyText`n$bodyHtmlText"

if ($packet.actionable -eq $true -and [string]$packet.render_mode -eq 'compact') {
    Add-Failure 'actionable_mail_must_not_use_compact'
}
if ([string]::IsNullOrWhiteSpace($recipientLabel) -or $nonEmptyLines.Count -lt 2 -or $nonEmptyLines[0] -notmatch $recipientPattern) {
    Add-Failure 'first_nonempty_line_must_be_recipient'
}
if ([string]::IsNullOrWhiteSpace($reasonLabel) -or $nonEmptyLines.Count -lt 2 -or $nonEmptyLines[1] -notmatch $reasonPattern) {
    Add-Failure 'second_nonempty_line_must_be_reason'
}
if (([regex]::Matches($bodyText, $recipientCountPattern)).Count -ne 1) {
    Add-Failure 'recipient_line_must_appear_once'
}
if (([regex]::Matches($bodyText, $reasonCountPattern)).Count -ne 1) {
    Add-Failure 'reason_line_must_appear_once'
}
$expectedRecipientLabel = -join ([char]0xC218, [char]0xC2E0)
$expectedReasonLabel = -join ([char]0xC0AC, [char]0xC720)
if ($recipientLabel -cne $expectedRecipientLabel -or $reasonLabel -cne $expectedReasonLabel) {
    Add-Failure 'visible_labels_must_be_fixed_korean_labels'
}
if ($bodyText -match '(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b') {
    Add-Failure 'contact_address_must_not_appear_in_body'
}
if ($bodyHtmlText -match '(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b') {
    Add-Failure 'contact_address_must_not_appear_in_html'
}
if ($htmlRecipientLine -notmatch ('^' + [regex]::Escape($recipientLabel) + '\s*:\s*\S')) {
    Add-Failure 'html_first_paragraph_must_be_recipient'
}
if ($htmlReasonLine -notmatch ('^' + [regex]::Escape($reasonLabel) + '\s*:\s*\S')) {
    Add-Failure 'html_second_paragraph_must_be_reason'
}

$purposePhrases = @($packet.purpose_phrases | ForEach-Object { [string]$_ } | Where-Object { $_.Length -gt 0 })
$introText = if ($nonEmptyLines.Count -gt 2) { [string]::Join("`n", $nonEmptyLines[2..([Math]::Min($nonEmptyLines.Count - 1, 3))]) } else { '' }
if ($purposePhrases.Count -eq 0) {
    Add-Failure 'purpose_phrase_required'
} elseif (-not ($purposePhrases | Where-Object { $introText.Contains($_) })) {
    Add-Failure 'greeting_or_intro_must_state_purpose'
}

$headingMatches = [regex]::Matches($bodyText, '(?m)^\s*(\d+)\.\s*([^\r\n]+)')
for ($i = 0; $i -lt $headingMatches.Count; $i++) {
    if ([int]$headingMatches[$i].Groups[1].Value -ne ($i + 1)) {
        Add-Failure "numbered_headings_not_contiguous_at_$($i + 1)"
        break
    }
}
foreach ($section in @($packet.required_sections)) {
    if ([string]::IsNullOrWhiteSpace([string]$section)) { continue }
    $escaped = [regex]::Escape([string]$section)
    if ($bodyText -notmatch "(?m)^\s*\d+\.\s*$escaped(?:\s|$)") {
        Add-Failure "missing_required_section:$section"
    }
    if (-not $bodyHtmlText.Contains([string]$section)) {
        Add-Failure "html_missing_required_section:$section"
    }
}
foreach ($phrase in @($packet.required_phrases)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$phrase)) {
        if (-not $searchableText.Contains([string]$phrase)) {
            Add-Failure "missing_required_phrase:$phrase"
        }
        if (-not $bodyHtmlText.Contains([string]$phrase) -and -not $subjectText.Contains([string]$phrase)) {
            Add-Failure "html_or_subject_missing_required_phrase:$phrase"
        }
    }
}
foreach ($term in @($packet.forbidden_terms)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$term) -and $searchableText.Contains([string]$term)) {
        Add-Failure "forbidden_term_present:$term"
    }
}

$expectedOrder = @($packet.recipient_display_order | ForEach-Object { [string]$_ })
$actualOrder = @($packet.actual_recipient_display_order | ForEach-Object { [string]$_ })
Test-ArrayEqual $expectedOrder $actualOrder 'recipient_order'
$recipientLine = if ($nonEmptyLines.Count -gt 0) { [string]$nonEmptyLines[0] } else { '' }
$recipientCursor = -1
$htmlRecipientCursor = -1
foreach ($recipient in $expectedOrder) {
    $nextRecipientIndex = $recipientLine.IndexOf($recipient, $recipientCursor + 1, [StringComparison]::Ordinal)
    if ($nextRecipientIndex -lt 0) {
        Add-Failure "visible_recipient_missing_or_out_of_order:$recipient"
        break
    }
    $recipientCursor = $nextRecipientIndex
    $nextHtmlRecipientIndex = $htmlRecipientLine.IndexOf($recipient, $htmlRecipientCursor + 1, [StringComparison]::Ordinal)
    if ($nextHtmlRecipientIndex -lt 0) {
        Add-Failure "html_visible_recipient_missing_or_out_of_order:$recipient"
    } else {
        $htmlRecipientCursor = $nextHtmlRecipientIndex
    }
}

$requiresTable = ($packet.require_table -eq $true) -or
    ([int]$packet.requested_work_count -gt 1) -or
    ([int]$packet.technical_value_count -ge 3)
if ($requiresTable -and $bodyHtml -notmatch '(?is)<table\b') {
    Add-Failure 'required_table_missing'
}
foreach ($header in @($packet.required_table_headers)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$header)) {
        if ($bodyHtml -notmatch [regex]::Escape([string]$header)) {
            Add-Failure "missing_table_header:$header"
        }
        if (-not $bodyText.Contains([string]$header)) {
            Add-Failure "text_missing_table_header:$header"
        }
    }
}

$subjectMode = [string]$packet.subject.mode
$subjectResolved = $packet.subject.resolved -eq $true
if ($subjectMode -notin @('new', 'reply_or_forward')) {
    Add-Failure 'subject_mode_invalid'
}
if ($subjectMode -eq 'reply_or_forward' -and $subjectText -cne [string]$packet.subject.original_thread_subject) {
    Add-Failure 'thread_subject_not_preserved'
}
if (-not $subjectResolved -and $packet.application_requested -eq $true) {
    Add-Failure 'unresolved_subject_blocks_application'
}
foreach ($phrase in @($packet.subject.required_phrases)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$phrase) -and -not $subjectText.Contains([string]$phrase)) {
        Add-Failure "subject_missing_required_phrase:$phrase"
    }
}
foreach ($term in @($packet.subject.forbidden_terms)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$term) -and $subjectText.Contains([string]$term)) {
        Add-Failure "subject_forbidden_term_present:$term"
    }
}

Test-ArrayEqual $packet.attachments.owner_selected $packet.attachments.staged 'attachment_scope'
if ($packet.attachments.inline_thread_assets_ignored -ne $true) {
    Add-Failure 'inline_thread_assets_must_be_ignored'
}

$deadlineSupplied = $packet.deadline.supplied -eq $true
$deadlineVisible = $packet.deadline.visible -eq $true
$deadlineValue = [string]$packet.deadline.value
if ($deadlineSupplied -ne $deadlineVisible) {
    Add-Failure 'deadline_visibility_must_match_supplied_state'
}
if ($deadlineVisible -and ([string]::IsNullOrWhiteSpace($deadlineValue) -or -not $bodyText.Contains($deadlineValue))) {
    Add-Failure 'visible_deadline_value_missing_from_body'
}
if (-not $deadlineSupplied -and -not [string]::IsNullOrWhiteSpace($deadlineValue)) {
    Add-Failure 'unsupplied_deadline_must_not_have_value'
}

$footerConfirmed = $packet.footer.confirmed -eq $true
$footerCountsComplete = ([int]$packet.footer.signature_count -eq 1) -and ([int]$packet.footer.security_footer_count -eq 1)
if ($footerConfirmed -and -not $footerCountsComplete) {
    Add-Failure 'confirmed_footer_must_appear_once'
}
$footerMarkersComplete = $false
if ($footerConfirmed) {
    $signatureMarker = [string]$packet.footer.signature_marker
    $securityFooterMarker = [string]$packet.footer.security_footer_marker
    $signatureMarkerComplete = -not [string]::IsNullOrWhiteSpace($signatureMarker) -and
        ([regex]::Matches($bodyText, [regex]::Escape($signatureMarker))).Count -eq 1 -and
        ([regex]::Matches($bodyHtmlText, [regex]::Escape($signatureMarker))).Count -eq 1
    $securityMarkerComplete = -not [string]::IsNullOrWhiteSpace($securityFooterMarker) -and
        ([regex]::Matches($bodyText, [regex]::Escape($securityFooterMarker))).Count -eq 1 -and
        ([regex]::Matches($bodyHtmlText, [regex]::Escape($securityFooterMarker))).Count -eq 1
    if (-not $signatureMarkerComplete) {
        Add-Failure 'confirmed_signature_marker_must_appear_once_in_text_and_html'
    }
    if (-not $securityMarkerComplete) {
        Add-Failure 'confirmed_security_footer_marker_must_appear_once_in_text_and_html'
    }
    $footerMarkersComplete = $signatureMarkerComplete -and $securityMarkerComplete
}
$footerComplete = $footerConfirmed -and $footerCountsComplete -and $footerMarkersComplete
if (-not $footerComplete -and [string]$packet.authority_state -ne 'draft_only') {
    Add-Failure 'incomplete_footer_must_remain_draft_only'
}
if ($packet.application_requested -eq $true -and (-not $footerComplete -or -not $subjectResolved)) {
    Add-Failure 'application_requested_without_complete_subject_and_footer'
}

$authoredTags = [regex]::Matches($bodyHtml, '(?is)<(p|li|h[1-6]|td|th)\b[^>]*>')
if ($authoredTags.Count -eq 0) {
    Add-Failure 'no_authored_html_tags_found'
} else {
    foreach ($tag in $authoredTags) {
        if ($tag.Value -notmatch '(?is)font-family\s*:\s*[^;>]*Malgun Gothic') {
            Add-Failure 'authored_tag_missing_malgun_gothic'
            break
        }
        if ($tag.Value -notmatch '(?is)color\s*:\s*(#000000|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|black)') {
            Add-Failure 'authored_tag_missing_black_color'
            break
        }
    }
}

$result = [ordered]@{
    ok = ($failures.Count -eq 0)
    application_allowed = (($failures.Count -eq 0) -and $subjectResolved -and $footerComplete -and $packet.application_requested -eq $true)
    checked_path = (Resolve-Path -LiteralPath $Path).Path
    failures = @($failures)
}
$result | ConvertTo-Json -Depth 4
if ($failures.Count -gt 0) { exit 1 }
