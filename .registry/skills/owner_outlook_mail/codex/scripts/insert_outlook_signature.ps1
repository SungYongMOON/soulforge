[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DraftMarker,

    [Parameter(Mandatory = $true)]
    [string]$Placeholder,

    [string]$SignatureNamePattern = '*+*.rtf'
)

$ErrorActionPreference = 'Stop'

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

$outlook = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
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
$document = $draft.GetInspector.WordEditor
$range = $document.Content.Duplicate
$find = $range.Find
$find.ClearFormatting()
if (-not $find.Execute($Placeholder)) {
    throw 'The bounded signature placeholder was not found.'
}

$range.Text = ''
$range.Collapse(1)
$range.InsertFile($signatureFiles[0].FullName)
$draft.Save()

$attachmentNames = @()
for ($index = 1; $index -le $draft.Attachments.Count; $index++) {
    $attachmentNames += $draft.Attachments.Item($index).FileName
}
$bodyText = [string]$draft.Body
$result = [ordered]@{
    sent = [bool]$draft.Sent
    placeholder_absent = -not $bodyText.Contains($Placeholder)
    signature_rtf_attachment_absent = -not ($attachmentNames -match '\.rtf$')
    unicode_replacement_character_count =
        ([regex]::Matches($bodyText, [char]0xFFFD)).Count
}

if ($result.sent -or
    -not $result.placeholder_absent -or
    -not $result.signature_rtf_attachment_absent -or
    $result.unicode_replacement_character_count -ne 0) {
    throw "Outlook signature verification failed: $($result | ConvertTo-Json -Compress)"
}

$result | ConvertTo-Json -Compress
