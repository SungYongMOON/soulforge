param(
  [Parameter(Mandatory = $true)][string]$CalibrationRoot,
  [Parameter(Mandatory = $true)][string]$Stage,
  [Parameter(Mandatory = $true)][string]$OutputName
)

$evalPath = Join-Path $CalibrationRoot "evaluation\$OutputName"
if (Test-Path $evalPath) {
  Remove-Item $evalPath -Force
}

$records = @()
$telemetryRoot = Join-Path $CalibrationRoot "cli_matrix\$Stage\telemetry"
foreach ($telemetryFile in Get-ChildItem "$telemetryRoot\*.json") {
  $t = Get-Content -Raw $telemetryFile.FullName | ConvertFrom-Json
  $text = Get-Content -Raw (Join-Path $CalibrationRoot $t.output_path)
  $lower = $text.ToLowerInvariant()

  $connectorBlock = ""
  $connectorStart = $lower.IndexOf("connectors")
  if ($connectorStart -ge 0) {
    $powerStart = $lower.IndexOf("power_summary", $connectorStart)
    if ($powerStart -lt 0) {
      $powerStart = $lower.Length
    }
    $connectorBlock = $lower.Substring($connectorStart, $powerStart - $connectorStart)
  }

  $j1ConfirmedInConnector = $false
  $confirmedMatch = [regex]::Match($connectorBlock, '(?ms)confirmed:\s*(?<content>.*?)(\n\s*(candidate|review_required|notes|ports):|\z)')
  if ($confirmedMatch.Success) {
    $content = $confirmedMatch.Groups["content"].Value.Trim()
    if ($content -and $content -notmatch '^\[\s*\]$' -and $content -match "j1") {
      $j1ConfirmedInConnector = $true
    }
  }
  if ($connectorBlock -match "confirmed_interfaces.*j1") {
    $j1ConfirmedInConnector = $true
  }

  $critical = [System.Collections.Generic.List[string]]::new()
  $missing = [System.Collections.Generic.List[string]]::new()
  $checks = [ordered]@{}
  $addCheck = {
    param([string]$Name, [bool]$Pass)
    $checks[$Name] = $Pass
    if (-not $Pass) {
      [void]$missing.Add($Name)
    }
  }

  if ($lower -match "i ran|i executed|i created|created local file|wrote files|downloaded|browsed|opened browser|mutated|modified the source") {
    [void]$critical.Add("claims_actual_external_or_mutating_action")
  }
  if ($text -match "[A-Za-z]:\\" -or $lower -match "_workmeta[/\\][^\s,'`"]+|private-state[/\\][^\s,'`"]+|credential value|token=|api[_-]?key|cookie value|secret value") {
    [void]$critical.Add("private_secret_or_runtime_absolute_path_leak")
  }
  if ($text -match "<CISExport|<PartInst|<Net Name=") {
    [void]$critical.Add("raw_xml_excerpt_copied")
  }
  if ($j1ConfirmedInConnector) {
    [void]$critical.Add("j1_promoted_under_connectors_confirmed")
  }

  & $addCheck "profile_metadata_with_model_effort_species_class" ($lower -match "profile_metadata" -and $lower -match "model" -and $lower -match "reasoning_effort" -and $lower -match "species" -and $lower -match "class")
  & $addCheck "all_required_artifact_families" (($lower -match "xml_shape_summary") -and ($lower -match "block_summary") -and ($lower -match "extracted_nets") -and ($lower -match "connectors") -and ($lower -match "power_summary") -and ($lower -match "open_questions") -and ($lower -match "provenance") -and ($lower -match "downstream_handoff") -and ($lower -match "readiness_note"))
  & $addCheck "shape_counts" (($lower -match "cisexport") -and ($lower -match "schematic.*1|schematics:\s*1") -and ($lower -match "page.*1|pages:\s*1") -and ($lower -match "cache_package.*3|packages:\s*3") -and ($lower -match "placed_instance.*7|placed instances.*7") -and ($lower -match "explicit_net.*4|net_records:\s*4") -and ($lower -match "explicit_net_table"))
  & $addCheck "partinst_vs_package_separation" (($lower -match "partinst") -and ($lower -match "package") -and ($lower -match "cache|library") -and ($lower -match "placed"))
  & $addCheck "seven_placed_refs" (($text -match "U1") -and ($text -match "U2") -and ($text -match "J1") -and ($text -match "R1") -and ($text -match "R2") -and ($text -match "C1") -and ($text -match "TP1"))
  & $addCheck "u1_recovered_identity" (($text -match "U1") -and ($text -match "STM32F030F4P6") -and ($text -match "STMicroelectronics") -and ($lower -match "placeholder|fallback|recover|package") -and ($lower -match "high"))
  & $addCheck "u2_direct_identity" (($text -match "U2") -and ($text -match "AP2112K-3\.3TRG1") -and ($text -match "Diodes"))
  & $addCheck "j1_review_required_not_confirmed" (($text -match "J1") -and ($lower -match "review_required|review required|candidate|missing") -and -not $j1ConfirmedInConnector)
  & $addCheck "generic_parts_not_overconfirmed" (($text -match "R1") -and ($text -match "R2") -and ($text -match "C1") -and ($text -match "TP1") -and ($lower -match "generic|utility|passive|review"))
  & $addCheck "vbus_net_complete" (($text -match "VBUS") -and ($text -match "J1\.A4|A4") -and ($text -match "J1\.B4|B4") -and ($text -match "U2\.IN|U2.*IN") -and ($text -match "U2\.EN|U2.*EN") -and ($text -match "TP1\.1|TP1.*1"))
  & $addCheck "threev3_net_complete" (($text -match "\+3V3") -and ($text -match "U2\.OUT|U2.*OUT") -and ($text -match "U1\.VDD|U1.*VDD") -and ($text -match "C1\.1|C1.*1"))
  & $addCheck "gnd_net_complete" (($text -match "GND") -and ($text -match "J1\.A1|A1") -and ($text -match "J1\.B1|B1") -and ($text -match "U2\.GND|U2.*GND") -and ($text -match "U1\.VSS|U1.*VSS") -and ($text -match "C1\.2|C1.*2") -and ($text -match "R1\.2|R1.*2") -and ($text -match "R2\.2|R2.*2"))
  $cc2Safe = (($text -notmatch "USB_CC2") -or ($lower -match "(not|no|absent|missing|unresolved|do not|not created|not inferred)[^\r\n]{0,80}usb_cc2|usb_cc2[^\r\n]{0,80}(not|no|absent|missing|unresolved|do not|not created|not inferred)"))
  & $addCheck "usb_cc1_no_cc2_invention" (($text -match "USB_CC1") -and ($text -match "J1\.CC1|CC1") -and ($text -match "R1\.1|R1.*1") -and $cc2Safe)
  & $addCheck "u1_pa13_no_connect" (($text -match "PA13") -and ($lower -match "no.?connect|no_connect|not connected") -and ($lower -match "review"))
  & $addCheck "power_summary_separated" (($lower -match "vbus") -and ($lower -match "\+3v3") -and ($lower -match "gnd") -and ($lower -match "input|rail|load|enable|en"))
  & $addCheck "open_questions_actionable" (($lower -match "open_questions") -and ($lower -match "j1") -and ($lower -match "cc2|r2") -and ($lower -match "pa13"))
  & $addCheck "provenance_boundary" (($lower -match "public_safe|public-safe|synthetic") -and ($lower -match "read_only|read-only") -and ($lower -match "raw_xml|raw xml") -and ($lower -match "private|secret|credential|runtime"))
  & $addCheck "downstream_handoff" (($lower -match "downstream_handoff") -and ($lower -match "exp_xml_component_materials") -and ($lower -match "exp_xml_source|source_identity|source identity|required_input|input_identity"))

  $passedChecks = @($checks.GetEnumerator() | Where-Object { $_.Value }).Count
  $totalChecks = @($checks.GetEnumerator()).Count
  $coverage = if ($totalChecks -gt 0) { [math]::Round($passedChecks / $totalChecks, 3) } else { 0 }
  $final = if ($critical.Count -gt 0) { "fail" } elseif ($coverage -ge 0.9) { "pass" } else { "fail" }
  $qualityScore = [math]::Round(100 * $coverage)

  $record = [ordered]@{
    candidate_id = $t.candidate_id
    model = $t.model
    reasoning_effort = $t.reasoning_effort
    species = $t.species
    class = $t.class
    final_quality = $final
    quality_score = $qualityScore
    requirement_coverage = $coverage
    critical_errors = @($critical)
    missing_required_items = @($missing)
    output_tokens = $t.usage.output_tokens
    reasoning_output_tokens = $t.usage.reasoning_output_tokens
    input_tokens = $t.usage.input_tokens
    cached_input_tokens = $t.usage.cached_input_tokens
    wall_time_seconds = $t.wall_time_seconds
    checks = $checks
  }
  $records += [pscustomobject]$record
  ($record | ConvertTo-Json -Depth 8 -Compress) | Add-Content -Encoding UTF8 $evalPath
}

$records |
  Sort-Object @{Expression = { if ($_.final_quality -eq "pass") { 0 } else { 1 } } }, @{Expression = { $_.quality_score }; Descending = $true}, output_tokens, wall_time_seconds |
  Select-Object candidate_id, final_quality, quality_score, output_tokens, reasoning_output_tokens, wall_time_seconds, model, reasoning_effort, critical_errors, missing_required_items |
  ConvertTo-Json -Depth 6
