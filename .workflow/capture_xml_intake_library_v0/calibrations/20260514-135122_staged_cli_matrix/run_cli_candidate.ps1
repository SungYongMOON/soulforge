param(
  [Parameter(Mandatory = $true)][string]$CalibrationRoot,
  [Parameter(Mandatory = $true)][string]$Stage,
  [Parameter(Mandatory = $true)][string]$CandidateId,
  [Parameter(Mandatory = $true)][string]$Model,
  [Parameter(Mandatory = $true)][string]$Effort,
  [Parameter(Mandatory = $true)][string]$Species,
  [Parameter(Mandatory = $true)][string]$Class
)

$PSNativeCommandUseErrorActionPreference = $false
$ErrorActionPreference = "Stop"

$templatePath = Join-Path $CalibrationRoot "candidate_prompt.md"
$fixturePath = Join-Path $CalibrationRoot "input_fixture.public.json"
$template = Get-Content -Raw $templatePath
$fixture = Get-Content -Raw $fixturePath

$prompt = $template.
  Replace("{{MODEL}}", $Model).
  Replace("{{EFFORT}}", $Effort).
  Replace("{{SPECIES}}", $Species).
  Replace("{{CLASS}}", $Class).
  Replace("{{FIXTURE_JSON}}", $fixture)

$stageRoot = Join-Path $CalibrationRoot "cli_matrix\$Stage"
$outputDir = Join-Path $stageRoot "outputs"
$eventsDir = Join-Path $stageRoot "events"
$telemetryDir = Join-Path $stageRoot "telemetry"
New-Item -ItemType Directory -Force -Path $outputDir, $eventsDir, $telemetryDir | Out-Null

$outputPath = Join-Path $outputDir "$CandidateId.md"
$eventsPath = Join-Path $eventsDir "$CandidateId.jsonl"
$telemetryPath = Join-Path $telemetryDir "$CandidateId.json"
$stderrTmp = Join-Path $env:TEMP "$CandidateId.stderr.tmp"
$promptTmp = Join-Path $env:TEMP "$CandidateId.prompt.md"

[System.IO.File]::WriteAllText($promptTmp, $prompt, [System.Text.UTF8Encoding]::new($false))

$sha = [System.Security.Cryptography.SHA256]::Create()
$promptBytes = [System.Text.Encoding]::UTF8.GetBytes($prompt)
$promptHash = -join ($sha.ComputeHash($promptBytes) | ForEach-Object { $_.ToString("x2") })

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$ErrorActionPreference = "Continue"
Get-Content -Raw $promptTmp | codex.cmd exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --json --sandbox read-only -C $env:TEMP -m $Model -c "model_reasoning_effort=`"$Effort`"" --output-last-message $outputPath - 1> $eventsPath 2> $stderrTmp
$exitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
$sw.Stop()

$usage = $null
if ((Test-Path $eventsPath) -and ((Get-Item $eventsPath).Length -gt 0)) {
  $events = Get-Content $eventsPath | Where-Object { $_.Trim().StartsWith("{") } | ForEach-Object { $_ | ConvertFrom-Json }
  $usage = ($events | Where-Object { $_.type -eq "turn.completed" } | Select-Object -Last 1).usage
}

$stderrText = ""
if (Test-Path $stderrTmp) {
  $stderrText = Get-Content -Raw $stderrTmp
}
$stderrSummary = @()
if ($stderrText -match "403 Forbidden") {
  $stderrSummary += "remote plugin sync emitted 403 Forbidden warnings; raw stderr HTML intentionally not archived"
}
if ($stderrText -match "Shell snapshot not supported") {
  $stderrSummary += "PowerShell shell snapshot warning observed"
}
if ($stderrSummary.Count -eq 0 -and $stderrText.Trim().Length -gt 0) {
  $stderrSummary += "non-empty stderr captured but omitted from archive to avoid noisy runtime internals"
}
if ($stderrSummary.Count -eq 0) {
  $stderrSummary += "stderr empty"
}

$telemetry = [ordered]@{
  calibration_id = Split-Path $CalibrationRoot -Leaf
  workflow_id = "capture_xml_intake_library_v0"
  stage = $Stage
  candidate_id = $CandidateId
  model = $Model
  reasoning_effort = $Effort
  species = $Species
  class = $Class
  exit_code = $exitCode
  wall_time_seconds = [math]::Round($sw.Elapsed.TotalSeconds, 3)
  usage = $usage
  prompt_sha256 = $promptHash
  output_path = "cli_matrix/$Stage/outputs/$CandidateId.md"
  events_path = "cli_matrix/$Stage/events/$CandidateId.jsonl"
  telemetry_source = "codex_exec_json_cli_proxy"
  stderr_summary = $stderrSummary
}

$telemetryJson = $telemetry | ConvertTo-Json -Depth 8
$telemetryJson | Set-Content -Encoding UTF8 $telemetryPath
$telemetryJson -replace "\r?\n", "" | Add-Content -Encoding UTF8 (Join-Path $stageRoot "results.jsonl")
$telemetryJson -replace "\r?\n", "" | Add-Content -Encoding UTF8 (Join-Path $CalibrationRoot "cli_matrix\results.jsonl")

if (Test-Path $stderrTmp) { Remove-Item $stderrTmp -Force }
if (Test-Path $promptTmp) { Remove-Item $promptTmp -Force }

$telemetryJson
