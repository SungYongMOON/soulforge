param()

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$validator = Join-Path $scriptRoot 'validate_structured_request_mail.ps1'
$passFixture = Join-Path $scriptRoot 'fixtures\structured_request_pass.json'
$forbiddenFixture = Join-Path $scriptRoot 'fixtures\structured_request_forbidden_term_fail.json'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("soulforge-mail-validator-" + [guid]::NewGuid().ToString('N'))
$results = [System.Collections.Generic.List[object]]::new()

function Invoke-Validator([string]$Name, $Packet, [int]$ExpectedExit, [string]$ExpectedFailure = '', [bool]$ExpectApplicationAllowed = $false) {
    $path = Join-Path $tempRoot "$Name.json"
    $Packet | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $path -Encoding UTF8
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator -Path $path | Out-String
    $exitCode = $LASTEXITCODE
    $parsed = $output | ConvertFrom-Json
    $failureMatch = [string]::IsNullOrWhiteSpace($ExpectedFailure) -or
        (@($parsed.failures) | Where-Object { [string]$_ -like "$ExpectedFailure*" }).Count -gt 0
    $passed = $exitCode -eq $ExpectedExit -and $failureMatch -and ([bool]$parsed.application_allowed -eq $ExpectApplicationAllowed)
    $results.Add([ordered]@{
        case = $Name
        passed = $passed
        exit_code = $exitCode
        application_allowed = [bool]$parsed.application_allowed
        failures = @($parsed.failures)
    })
}

function Read-PassPacket {
    return Get-Content -LiteralPath $passFixture -Raw -Encoding UTF8 | ConvertFrom-Json
}

New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    Invoke-Validator 'base_pass' (Read-PassPacket) 0

    $packet = Read-PassPacket
    $packet.recipient_label = 'To'
    $packet.reason_label = 'Reason'
    $koreanRecipientLabel = -join ([char]0xC218, [char]0xC2E0)
    $koreanReasonLabel = -join ([char]0xC0AC, [char]0xC720)
    $packet.body_text = [regex]::Replace(
        $packet.body_text,
        '(?m)^' + [regex]::Escape($koreanRecipientLabel) + '\s*:',
        'To:'
    )
    $packet.body_text = [regex]::Replace(
        $packet.body_text,
        '(?m)^' + [regex]::Escape($koreanReasonLabel) + '\s*:',
        'Reason:'
    )
    $packet.body_html = [regex]::Replace(
        $packet.body_html,
        '>' + [regex]::Escape($koreanRecipientLabel) + '\s*:',
        '>To:'
    )
    $packet.body_html = [regex]::Replace(
        $packet.body_html,
        '>' + [regex]::Escape($koreanReasonLabel) + '\s*:',
        '>Reason:'
    )
    Invoke-Validator 'english_label_pair_pass' $packet 0

    $forbiddenPacket = Get-Content -LiteralPath $forbiddenFixture -Raw -Encoding UTF8 | ConvertFrom-Json
    Invoke-Validator 'forbidden_term' $forbiddenPacket 1 'forbidden_term_present:'

    $packet = Read-PassPacket
    $packet.PSObject.Properties.Remove('subject')
    Invoke-Validator 'missing_subject' $packet 1 'missing_required_field:subject'

    $packet = Read-PassPacket
    $packet.PSObject.Properties.Remove('require_table')
    Invoke-Validator 'missing_table_rule' $packet 1 'missing_required_field:require_table'

    $packet = Read-PassPacket
    $packet.attachments.PSObject.Properties.Remove('owner_selected')
    Invoke-Validator 'missing_nested_attachment_field' $packet 1 'missing_required_field:attachments.owner_selected'

    $packet = Read-PassPacket
    $packet.recipient_display_order = @('review_role')
    $packet.actual_recipient_display_order = @('review_role')
    Invoke-Validator 'visible_recipient_mismatch' $packet 1 'visible_recipient_missing_or_out_of_order:'

    $packet = Read-PassPacket
    $packet.subject.mode = 'reply_or_forward'
    $packet.subject.value = 'changed subject'
    $packet.subject.original_thread_subject = 'original subject'
    $packet.subject.required_phrases = @()
    Invoke-Validator 'thread_subject_mismatch' $packet 1 'thread_subject_not_preserved'

    $packet = Read-PassPacket
    $packet.attachments.owner_selected = @('selected.pdf')
    Invoke-Validator 'attachment_scope_mismatch' $packet 1 'attachment_scope_count_mismatch'

    $packet = Read-PassPacket
    $packet.deadline.supplied = $true
    $packet.deadline.visible = $false
    $packet.deadline.value = '2099-01-01'
    Invoke-Validator 'deadline_visibility_mismatch' $packet 1 'deadline_visibility_must_match_supplied_state'

    $packet = Read-PassPacket
    $packet.body_text += "`nsynthetic@example.invalid"
    Invoke-Validator 'body_contact_address' $packet 1 'contact_address_must_not_appear_in_body'

    $packet = Read-PassPacket
    $packet.body_html += '<p style="font-family:Malgun Gothic;color:#000000">synthetic@example.invalid</p>'
    Invoke-Validator 'html_contact_address' $packet 1 'contact_address_must_not_appear_in_html'

    $packet = Read-PassPacket
    $packet.forbidden_terms = @('HTML_ONLY_FORBIDDEN')
    $packet.body_html += '<p style="font-family:Malgun Gothic;color:#000000">HTML_ONLY_FORBIDDEN</p>'
    Invoke-Validator 'html_forbidden_term' $packet 1 'forbidden_term_present:'

    $packet = Read-PassPacket
    $visibleRole = [string]$packet.recipient_display_order[0]
    $packet.body_html = $packet.body_html.Replace($visibleRole, 'different_role')
    Invoke-Validator 'html_recipient_mismatch' $packet 1 'html_visible_recipient_missing_or_out_of_order:'

    $packet = Read-PassPacket
    $packet.body_html = '<p style="font-family:Malgun Gothic;color:#000000">incomplete</p>'
    Invoke-Validator 'html_content_divergence' $packet 1 'html_missing_required_section:'

    $packet = Read-PassPacket
    $packet.application_requested = $true
    $packet.authority_state = 'approved_to_apply'
    $packet.footer.confirmed = $false
    $packet.footer.signature_count = 1
    $packet.footer.security_footer_count = 1
    Invoke-Validator 'unconfirmed_footer_blocks_application' $packet 1 'incomplete_footer_must_remain_draft_only'

    $packet = Read-PassPacket
    $packet.application_requested = $true
    $packet.authority_state = 'approved_to_apply'
    $packet.footer.confirmed = $true
    $packet.footer.signature_count = 1
    $packet.footer.security_footer_count = 1
    $packet.footer.signature_marker = 'SYNTH_SIGNATURE'
    $packet.footer.security_footer_marker = 'SYNTH_SECURITY'
    $packet.body_text += "`nSYNTH_SIGNATURE`nSYNTH_SECURITY"
    $packet.body_html += '<p style="font-family:Malgun Gothic;color:#000000">SYNTH_SIGNATURE</p><p style="font-family:Malgun Gothic;color:#000000">SYNTH_SECURITY</p>'
    Invoke-Validator 'application_guard_pass' $packet 0 '' $true
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
}

$failed = @($results | Where-Object { -not $_.passed })
[ordered]@{
    ok = $failed.Count -eq 0
    cases = @($results)
} | ConvertTo-Json -Depth 8
if ($failed.Count -gt 0) { exit 1 }
