param(
    [ValidateSet('initialize','apply')]
    [string]$Mode = 'apply'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$Forwarder = Join-Path $RepoRoot 'guild_hall\gateway\mail_send\hiworks_gmail_forwarder.py'
$Importer = Join-Path $RepoRoot 'guild_hall\gateway\mail_send\gmail_original_importer.py'
$ExpectedForwarderSha256 = '7bbcf534422aa679dbe6261abfa6cc7366181ef062a0fc78ad8d4316bf76e8bf'
$ExpectedImporterSha256 = '573c88a958ca967f7cc9f614c8be4f778905cb7e6bc56c243b28733cc262c296'
$ActualForwarderSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Forwarder).Hash.ToLowerInvariant()
$ActualImporterSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Importer).Hash.ToLowerInvariant()
if ($ActualForwarderSha256 -ne $ExpectedForwarderSha256 -or $ActualImporterSha256 -ne $ExpectedImporterSha256) {
    throw 'Forwarder script integrity check failed.'
}

$AccountEnv = 'D:\Soulforge-data\config\guild_hall\state\gateway\mailbox\state\acct_acc_145a8edf2e.env'
$StateRoot = 'D:\Soulforge-data\state\mail\hiworks_gmail_forwarder'
$GmailConfigRoot = 'D:\Soulforge-data\config\guild_hall\state\gateway\mailbox\state\gmail_original_importer'
$OAuthClient = Join-Path $GmailConfigRoot 'oauth_client.json'
$OAuthToken = Join-Path $GmailConfigRoot 'oauth_token.json'
$ReceiptRoot = 'D:\Soulforge-data\state\mail\gmail_original_importer\receipts'
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
