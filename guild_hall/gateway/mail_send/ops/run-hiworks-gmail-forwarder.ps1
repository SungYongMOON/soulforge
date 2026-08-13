param(
    [ValidateSet('initialize','apply')]
    [string]$Mode = 'apply',
    [Parameter(Mandatory = $true)]
    [string]$BindingPath
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$Forwarder = Join-Path $RepoRoot 'guild_hall\gateway\mail_send\hiworks_gmail_forwarder.py'
$Importer = Join-Path $RepoRoot 'guild_hall\gateway\mail_send\gmail_original_importer.py'
$ExpectedForwarderSha256 = '79e9cf511b2f8b4b0d356af985e3aa0205fb53ecc4be6b46d7bdf6f88ebb1793'
$ExpectedImporterSha256 = '573c88a958ca967f7cc9f614c8be4f778905cb7e6bc56c243b28733cc262c296'
$ActualForwarderSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Forwarder).Hash.ToLowerInvariant()
$ActualImporterSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Importer).Hash.ToLowerInvariant()
if ($ActualForwarderSha256 -ne $ExpectedForwarderSha256 -or $ActualImporterSha256 -ne $ExpectedImporterSha256) {
    throw 'Forwarder script integrity check failed.'
}

$Binding = Get-Content -LiteralPath $BindingPath -Raw -Encoding UTF8 | ConvertFrom-Json
$ExpectedBindingKeys = @('account_env', 'gmail_config_root', 'receipt_root', 'schema_version', 'state_root')
$ObservedBindingKeys = @($Binding.PSObject.Properties.Name | Sort-Object)
if (($ObservedBindingKeys -join '|') -ne ($ExpectedBindingKeys -join '|') -or
    $Binding.schema_version -ne 'soulforge.hiworks_gmail_forwarder.binding.v1') {
    throw 'Hiworks Gmail binding is invalid.'
}
$AccountEnv = [System.IO.Path]::GetFullPath([string]$Binding.account_env)
$StateRoot = [System.IO.Path]::GetFullPath([string]$Binding.state_root)
$GmailConfigRoot = [System.IO.Path]::GetFullPath([string]$Binding.gmail_config_root)
$ReceiptRoot = [System.IO.Path]::GetFullPath([string]$Binding.receipt_root)
foreach ($BoundPath in @($AccountEnv, $StateRoot, $GmailConfigRoot, $ReceiptRoot)) {
    if (-not [System.IO.Path]::IsPathRooted($BoundPath)) { throw 'Hiworks Gmail binding path is invalid.' }
}
$OAuthClient = Join-Path $GmailConfigRoot 'oauth_client.json'
$OAuthToken = Join-Path $GmailConfigRoot 'oauth_token.json'
$Action = if ($Mode -eq 'initialize') { '--initialize' } else { '--apply' }

& python $Forwarder $Action `
    --account-env $AccountEnv `
    --state-root $StateRoot `
    --gmail-config-root $GmailConfigRoot `
    --oauth-client $OAuthClient `
    --oauth-token $OAuthToken `
    --receipt-root $ReceiptRoot `
    --json
if ($LASTEXITCODE -ne 0) {
    throw "Hiworks Gmail original importer failed with exit code $LASTEXITCODE."
}
