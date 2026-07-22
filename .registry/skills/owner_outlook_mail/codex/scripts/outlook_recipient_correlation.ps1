[CmdletBinding()]
param(
    [switch]$ContractSelfTest
)

$ErrorActionPreference = 'Stop'

function Get-StableSha256Hex {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function New-OutlookRecipientCorrelationIdentity {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('SMTP', 'MAPIPDL')]
        [string]$AddressEntryType,

        [string]$SmtpAddress,

        [string[]]$MemberSmtpAddresses
    )

    if ($AddressEntryType -eq 'SMTP') {
        if ([string]::IsNullOrWhiteSpace($SmtpAddress)) {
            throw 'smtp_recipient_unresolved'
        }
        $normalized = $SmtpAddress.Trim().ToLowerInvariant()

        return [ordered]@{
            kind = 'smtp'
            identity = "smtp:$normalized"
        }
    }

    if ($null -eq $MemberSmtpAddresses -or $MemberSmtpAddresses.Count -eq 0) {
        throw 'mapipdl_members_unresolved'
    }

    $normalizedMembers = @(
        $MemberSmtpAddresses |
            ForEach-Object {
                if ($null -eq $_) { '' } else { $_.Trim().ToLowerInvariant() }
            }
    )
    if ($normalizedMembers.Count -eq 0 -or @($normalizedMembers | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) {
        throw 'mapipdl_member_smtp_unresolved'
    }

    $memberSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($member in $normalizedMembers) {
        $null = $memberSet.Add($member)
    }
    $canonicalMembers = [string[]]$memberSet
    [System.Array]::Sort($canonicalMembers, [System.StringComparer]::Ordinal)
    $fingerprint = Get-StableSha256Hex -Value ([string]::Join("`n", $canonicalMembers))

    return [ordered]@{
        kind = 'mapipdl'
        identity = "mapipdl:sha256:$fingerprint"
        member_count = $canonicalMembers.Count
    }
}

function New-OutlookOrderedRecipientCorrelation {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Recipients
    )

    $identities = @()
    foreach ($recipient in $Recipients) {
        $identities += New-OutlookRecipientCorrelationIdentity `
            -AddressEntryType $recipient.address_entry_type `
            -SmtpAddress $recipient.smtp_address `
            -MemberSmtpAddresses $recipient.member_smtp_addresses
    }
    return ,$identities
}

if ($ContractSelfTest) {
    $direct = New-OutlookRecipientCorrelationIdentity `
        -AddressEntryType SMTP `
        -SmtpAddress 'Alpha@Example.invalid'
    $groupA = New-OutlookRecipientCorrelationIdentity `
        -AddressEntryType MAPIPDL `
        -MemberSmtpAddresses @('beta@example.invalid', 'alpha@example.invalid', 'beta@example.invalid')
    $groupB = New-OutlookRecipientCorrelationIdentity `
        -AddressEntryType MAPIPDL `
        -MemberSmtpAddresses @('ALPHA@example.invalid', 'BETA@example.invalid')
    $ordered = New-OutlookOrderedRecipientCorrelation -Recipients @(
        [pscustomobject]@{ address_entry_type = 'MAPIPDL'; smtp_address = $null; member_smtp_addresses = @('one@example.invalid') }
        [pscustomobject]@{ address_entry_type = 'SMTP'; smtp_address = 'two@example.invalid'; member_smtp_addresses = @() }
    )

    $unresolvedMemberRejected = $false
    try {
        $null = New-OutlookRecipientCorrelationIdentity `
            -AddressEntryType MAPIPDL `
            -MemberSmtpAddresses @('valid@example.invalid', '')
    } catch {
        $unresolvedMemberRejected = $_.Exception.Message -eq 'mapipdl_member_smtp_unresolved'
    }

    $serializedGroup = $groupA | ConvertTo-Json -Compress
    $result = [ordered]@{
        ok = $direct.kind -eq 'smtp' -and
            $groupA.kind -eq 'mapipdl' -and
            $groupA.member_count -eq 2 -and
            $groupA.identity -eq $groupB.identity -and
            $ordered.Count -eq 2 -and
            $ordered[0].kind -eq 'mapipdl' -and
            $ordered[1].kind -eq 'smtp' -and
            $unresolvedMemberRejected -and
            -not $serializedGroup.Contains('alpha@example.invalid') -and
            -not $serializedGroup.Contains('beta@example.invalid')
        group_canonicalization_stable = $groupA.identity -eq $groupB.identity
        unresolved_member_rejected = $unresolvedMemberRejected
        group_output_redacted = -not $serializedGroup.Contains('@')
        top_level_order_preserved = $ordered[0].kind -eq 'mapipdl' -and $ordered[1].kind -eq 'smtp'
    }

    if (-not $result.ok) {
        throw "Outlook recipient-correlation contract test failed: $($result | ConvertTo-Json -Compress)"
    }

    $result | ConvertTo-Json -Compress
}
