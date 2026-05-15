param(
  [string]$CodexPath = "codex.cmd"
)

$ErrorActionPreference = "Stop"
$Archive = Split-Path -Parent $MyInvocation.MyCommand.Path
$FixturePath = Join-Path $Archive "input_fixture.public.json"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$Dirs = @(
  "golden",
  "quality_gate",
  "subagent_matrix\outputs",
  "cli_telemetry_probe\raw",
  "evaluation",
  "prompts"
)
foreach ($Dir in $Dirs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Archive $Dir) | Out-Null
}

$Fixture = Get-Content -Raw -LiteralPath $FixturePath

$CommonPrompt = @"
You are running an explicitly labeled cli_only_calibration candidate for Soulforge workflow xml_harness_composition_v0.

Task:
Produce the workflow output packet for the public-safe synthetic fixture below. This workflow composes a derived harness-layer packet from already prepared page-level XML assets, sidecars, intake packets, materials packets, layout guides, and owner hints.

Hard boundaries:
- Do not mutate any source XML, normalized sidecar, intake packet, materials packet, layout guide, source packet, or owner material.
- Do not treat candidate_safe as final circuit approval.
- Do not promote local_internal_candidates to external harness interfaces without explicit source-backed promotion evidence.
- Do not invent missing source packets, quantitative constraints, directionality, debug headers, I2C controller interfaces, pullups, or private project facts.
- Do not include raw XML bodies, runtime absolute paths, _workspaces outputs, credentials, cookies, private run truth, or vendor text.
- Use blocked or review_required when evidence is missing, ambiguous, local/internal only, or quantitatively incomplete.

Workflow requirements:
- Include every required JSON top-level section from the supplied output schema.
- Partition possible joins into blocked_connections, review_required_connections, candidate_safe_connections, and source_supported_connections.
- Keep source_supported_connections empty unless the fixture provides cited source support strong enough for final support.
- Record owner follow-ups and open questions explicitly rather than implying them.
- Include a boundary review that states public-safe handling, immutability, and no final circuit authority.
- Output one JSON object only. Do not wrap the JSON in markdown.

Public-safe input fixture:
$Fixture
"@

$Profiles = @(
  @{ id = "C01"; model = "gpt-5.5"; effort = "xhigh"; species = "human"; class = "auditor"; role = "quality_baseline_and_candidate" },
  @{ id = "C02"; model = "gpt-5.5"; effort = "low"; species = "human"; class = "auditor"; role = "candidate_5_5_low" },
  @{ id = "C03"; model = "gpt-5.5"; effort = "medium"; species = "human"; class = "auditor"; role = "candidate_5_5_medium" }
)

$ManifestRows = @()

foreach ($Profile in $Profiles) {
  $PromptPath = Join-Path $Archive ("prompts\{0}.prompt.md" -f $Profile.id)
  $Prompt = @"
Candidate id: $($Profile.id)
Model: $($Profile.model)
Reasoning effort: $($Profile.effort)
Species: $($Profile.species)
Class: $($Profile.class)
Role: $($Profile.role)

$CommonPrompt
"@
  [System.IO.File]::WriteAllText($PromptPath, $Prompt, $Utf8NoBom)

  $RawPath = Join-Path $Archive ("cli_telemetry_probe\raw\{0}.events.jsonl" -f $Profile.id)
  $ErrPath = Join-Path $Archive ("cli_telemetry_probe\raw\{0}.stderr.txt" -f $Profile.id)
  $OutPath = Join-Path $Archive ("subagent_matrix\outputs\{0}.json" -f $Profile.id)

  $StartedAt = Get-Date
  $Measure = Measure-Command {
    $CmdLine = @(
      ('"{0}"' -f $CodexPath),
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--json",
      "--sandbox read-only",
      ('-C "{0}"' -f $Archive),
      ('-m {0}' -f $Profile.model),
      ('-c model_reasoning_effort={0}' -f $Profile.effort),
      ('-o "{0}"' -f $OutPath),
      "-",
      ('< "{0}"' -f $PromptPath),
      ('> "{0}"' -f $RawPath),
      ('2> "{0}"' -f $ErrPath)
    ) -join " "
    & cmd.exe /d /c $CmdLine
    if ($LASTEXITCODE -ne 0) {
      throw ("codex candidate {0} failed with exit code {1}" -f $Profile.id, $LASTEXITCODE)
    }
  }
  $EndedAt = Get-Date

  $ManifestRows += [pscustomobject]@{
    candidate_id = $Profile.id
    model = $Profile.model
    reasoning_effort = $Profile.effort
    species = $Profile.species
    class = $Profile.class
    role = $Profile.role
    started_at = $StartedAt.ToString("o")
    ended_at = $EndedAt.ToString("o")
    wall_seconds = [Math]::Round($Measure.TotalSeconds, 3)
    prompt_path = ("prompts/{0}.prompt.md" -f $Profile.id)
    output_path = ("subagent_matrix/outputs/{0}.json" -f $Profile.id)
    raw_jsonl_path = ("cli_telemetry_probe/raw/{0}.events.jsonl" -f $Profile.id)
    stderr_path = ("cli_telemetry_probe/raw/{0}.stderr.txt" -f $Profile.id)
  }
}

[System.IO.File]::WriteAllText((Join-Path $Archive "cli_run_manifest.raw.json"), ($ManifestRows | ConvertTo-Json -Depth 8), $Utf8NoBom)
