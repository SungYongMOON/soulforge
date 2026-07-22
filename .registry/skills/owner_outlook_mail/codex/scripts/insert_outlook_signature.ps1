[CmdletBinding(DefaultParameterSetName = 'Insert')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Insert')]
    [string]$DraftMarker,

    [Parameter(Mandatory = $true, ParameterSetName = 'Insert')]
    [string]$Placeholder,

    [Parameter(ParameterSetName = 'Insert')]
    [string]$SignatureNamePattern = '*+*.rtf',

    [Parameter(Mandatory = $true, ParameterSetName = 'ContractSelfTest')]
    [switch]$ContractSelfTest,

    [Parameter(Mandatory = $true, ParameterSetName = 'AvailabilityProbe')]
    [switch]$AvailabilityProbe
)

$ErrorActionPreference = 'Stop'

function Invoke-InlineSignatureFileInsert {
    param(
        [Parameter(Mandatory = $true)]
        [object]$TargetRange,

        [Parameter(Mandatory = $true)]
        [string]$SignaturePath
    )

    $null = $TargetRange.GetType().InvokeMember(
        'InsertFile',
        [Reflection.BindingFlags]::InvokeMethod,
        $null,
        $TargetRange,
        @(
            $SignaturePath,
            [Type]::Missing,
            $false,
            $false,
            $false
        )
    )
}

function Get-ActiveClassicOutlookComAvailability {
    param(
        [scriptblock]$Resolver = {
            [Runtime.InteropServices.Marshal]::GetActiveObject(
                'Outlook.Application'
            )
        }
    )

    try {
        $application = & $Resolver
        [pscustomobject]@{
            available = $null -ne $application
            method = 'GetActiveObject'
            starts_process = $false
            creates_COM_instance = $false
            application = $application
            error_class = $null
        }
    } catch {
        [pscustomobject]@{
            available = $false
            method = 'GetActiveObject'
            starts_process = $false
            creates_COM_instance = $false
            application = $null
            error_class = $_.Exception.GetType().FullName
        }
    }
}

if ($ContractSelfTest) {
    if ($null -eq ('SoulforgeSignatureInsertProbeV1' -as [type])) {
        Add-Type -TypeDefinition @'
using System;

public sealed class SoulforgeSignatureInsertProbeV1
{
    public string FileName { get; private set; }
    public bool ConfirmConversions { get; private set; }
    public bool Link { get; private set; }
    public bool Attachment { get; private set; }
    public int CallCount { get; private set; }

    public void InsertFile(
        string fileName,
        object range = null,
        object confirmConversions = null,
        object link = null,
        object attachment = null)
    {
        FileName = fileName;
        ConfirmConversions = Convert.ToBoolean(confirmConversions);
        Link = Convert.ToBoolean(link);
        Attachment = Convert.ToBoolean(attachment);
        CallCount++;
    }
}
'@
    }

    $probe = [SoulforgeSignatureInsertProbeV1]::new()
    $syntheticPath = 'synthetic-signature.rtf'
    Invoke-InlineSignatureFileInsert -TargetRange $probe -SignaturePath $syntheticPath
    $availableProbe = Get-ActiveClassicOutlookComAvailability -Resolver {
        [pscustomobject]@{ synthetic = $true }
    }
    $unavailableProbe = Get-ActiveClassicOutlookComAvailability -Resolver {
        throw [Runtime.InteropServices.COMException]::new(
            'Synthetic unavailable result.'
        )
    }
    $selfTest = [ordered]@{
        ok = $probe.CallCount -eq 1 -and
            $probe.FileName -eq $syntheticPath -and
            -not $probe.ConfirmConversions -and
            -not $probe.Link -and
            -not $probe.Attachment -and
            $availableProbe.available -and
            -not $availableProbe.starts_process -and
            -not $availableProbe.creates_COM_instance -and
            -not $unavailableProbe.available
        call_count = $probe.CallCount
        confirm_conversions = $probe.ConfirmConversions
        link = $probe.Link
        attachment = $probe.Attachment
        active_probe_available = $availableProbe.available
        inactive_probe_available = $unavailableProbe.available
        probe_starts_process = $availableProbe.starts_process
        probe_creates_COM_instance = $availableProbe.creates_COM_instance
    }
    if (-not $selfTest.ok) {
        throw "Signature insert contract self-test failed: $($selfTest | ConvertTo-Json -Compress)"
    }
    $selfTest | ConvertTo-Json -Compress
    return
}

if ($AvailabilityProbe) {
    $probeResult = Get-ActiveClassicOutlookComAvailability
    [ordered]@{
        available = $probeResult.available
        method = $probeResult.method
        starts_process = $probeResult.starts_process
        creates_COM_instance = $probeResult.creates_COM_instance
        error_class = $probeResult.error_class
    } | ConvertTo-Json -Compress
    return
}

if ([string]::IsNullOrWhiteSpace($DraftMarker) -or
    [string]::IsNullOrWhiteSpace($Placeholder)) {
    throw 'DraftMarker and Placeholder must be non-empty.'
}

$signatureDirectory = Join-Path $env:APPDATA 'Microsoft\Signatures'
$signatureFiles = @(
    Get-ChildItem -LiteralPath $signatureDirectory -Filter '*.rtf' |
        Where-Object { $_.Name -like $SignatureNamePattern }
)
if ($signatureFiles.Count -ne 1) {
    throw "Expected exactly one Outlook signature RTF match; found $($signatureFiles.Count)."
}

$outlookProbe = Get-ActiveClassicOutlookComAvailability
if (-not $outlookProbe.available) {
    throw 'No active classic Outlook COM session is available.'
}
$outlook = $outlookProbe.application
$drafts = $outlook.GetNamespace('MAPI').GetDefaultFolder(16)
$matches = @()
foreach ($candidate in $drafts.Items) {
    try {
        if ($candidate.MessageClass -eq 'IPM.Note' -and
            $candidate.HTMLBody -like "*$DraftMarker*") {
            $matches += $candidate
        }
    } catch {}
}
if ($matches.Count -ne 1) {
    throw "Expected exactly one marked Outlook draft; found $($matches.Count)."
}

$draft = $matches[0]
if ([bool]$draft.Sent) {
    throw 'The marked item is already sent.'
}

$draft.Display($false)
$draft.Save()
try {
    $document = $draft.GetInspector.WordEditor
    $range = $document.Content.Duplicate
    $find = $range.Find
    $find.ClearFormatting()
    if (-not $find.Execute($Placeholder)) {
        throw 'The bounded signature placeholder was not found.'
    }

    $range.Text = ''
    $range.Collapse(1)
    $bodyLengthBefore = $document.Content.Text.Length
    $inlineShapeCountBefore = $document.InlineShapes.Count
    $tableCountBefore = $document.Tables.Count
    Invoke-InlineSignatureFileInsert `
        -TargetRange $range `
        -SignaturePath $signatureFiles[0].FullName

    $attachmentNames = @()
    for ($index = 1; $index -le $draft.Attachments.Count; $index++) {
        $attachmentNames += $draft.Attachments.Item($index).FileName
    }
    $bodyText = [string]$document.Content.Text
    $signatureInlineContentAdded =
        $document.Content.Text.Length -gt $bodyLengthBefore -or
        $document.InlineShapes.Count -gt $inlineShapeCountBefore -or
        $document.Tables.Count -gt $tableCountBefore
    $result = [ordered]@{
        sent = [bool]$draft.Sent
        saved = $false
        placeholder_absent = -not $bodyText.Contains($Placeholder)
        signature_inline_content_added = $signatureInlineContentAdded
        signature_rtf_attachment_absent = -not ($attachmentNames -match '\.rtf$')
        unicode_replacement_character_count =
            ([regex]::Matches($bodyText, [char]0xFFFD)).Count
    }

    if ($result.sent -or
        -not $result.placeholder_absent -or
        -not $result.signature_inline_content_added -or
        -not $result.signature_rtf_attachment_absent -or
        $result.unicode_replacement_character_count -ne 0) {
        throw "Outlook signature verification failed: $($result | ConvertTo-Json -Compress)"
    }

    $draft.Save()
    $result['saved'] = [bool]$draft.Saved
} catch {
    try {
        $draft.Close(1)
    } catch {}
    throw
}

$result | ConvertTo-Json -Compress
