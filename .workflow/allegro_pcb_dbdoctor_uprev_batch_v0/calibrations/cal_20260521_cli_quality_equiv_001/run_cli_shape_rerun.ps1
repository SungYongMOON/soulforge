param(
  [string]$CodexPath = "codex.cmd"
)

$ErrorActionPreference = "Stop"
$Archive = Split-Path -Parent $MyInvocation.MyCommand.Path
$FixturePath = Join-Path $Archive "input_fixture.public.json"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Fixture = Get-Content -Raw -LiteralPath $FixturePath

$RequiredSections = @(
  "bound_runtime_scope",
  "path_policy_report",
  "inventory_report",
  "conversion_plan",
  "old_new_packet_manifest",
  "dbdoctor_execution_logs",
  "conversion_result_matrix",
  "conversion_receipt",
  "boundary_review_note"
) -join ", "

$CommonPrompt = @"
You are running an explicitly labeled cli_only_calibration finalist rerun for Soulforge workflow allegro_pcb_dbdoctor_uprev_batch_v0.

Task:
Produce the workflow output packet for the public-safe synthetic fixture below.

Output shape is mandatory:
- Output one JSON object only. Do not wrap it in markdown.
- The root object must have exactly these main contract keys: profile_metadata, workflow_output_packet, provenance.
- The workflow_output_packet object must include these required sections using these exact key names: $RequiredSections.
- Additional nested fields are allowed inside those required sections.

Hard boundaries:
- Do not claim you executed Cadence DB Doctor or inspected real PCB database payloads.
- Do not invent host paths, installed Cadence paths, private project facts, raw PCB payload content, credentials, cookies, or secrets.
- Do not put runtime absolute paths into the output. Use the supplied runtime_ref tokens only.
- Do not include golden output, quality criteria, or evaluator-only assumptions.
- Do not mutate, move, delete, or create real filesystem content. This is a synthetic output packet only.

Workflow requirements:
- Preserve runtime path redaction and public/private boundaries.
- Inventory only top-level .brd files by default.
- Block non-allowlisted extensions, recursive/nested .brd files, and existing packet collisions unless owner policy explicitly authorizes them.
- Plan old_version/new_version packet folders for in-scope non-colliding .brd files.
- Classify each synthetic DB Doctor observation from output existence, completion text, saved-to-disk text, warning/error counts, process code, and temp file cleanup state.
- Treat CTRL_B as converted_with_warnings, not failure, because output exists, completion and save text are present, detected errors are zero, and warning-bearing nonzero exit is allowed.
- Treat BROKEN_C as conversion_failed because output is missing, completion/save text are absent, and detected errors are nonzero.
- Carry failure, collision, cleanup, retry, and owner-decision blockers explicitly.
- State non-claims for electrical correctness, manufacturing readiness, Cadence license/install management, and unattended full-archive mutation.
- Include a closeout/boundary review with next action.

Public-safe input fixture:
$Fixture
"@

$Profiles = @(
  @{ id = "C04R"; model = "gpt-5.4"; effort = "medium"; species = "dwarf"; class = "auditor"; role = "shape_clarified_finalist_rerun" },
  @{ id = "C05MR"; model = "gpt-5.4-mini"; effort = "medium"; species = "dwarf"; class = "auditor"; role = "shape_clarified_mini_finalist_rerun" }
)

$CandidatesJsonl = Join-Path $Archive "subagent_matrix\candidates.jsonl"
$TelemetryJsonl = Join-Path $Archive "cli_telemetry_probe\telemetry.jsonl"

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

  $RawPath = Join-Path $env:TEMP ("{0}_{1}.events.jsonl" -f "allegro_dbdoctor_calibration", $Profile.id)
  $ErrPath = Join-Path $env:TEMP ("{0}_{1}.stderr.txt" -f "allegro_dbdoctor_calibration", $Profile.id)
  $OutPath = Join-Path $Archive ("subagent_matrix\outputs\{0}.json" -f $Profile.id)
  Remove-Item -LiteralPath $RawPath,$ErrPath,$OutPath -Force -ErrorAction SilentlyContinue

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

  $Usage = $null
  foreach ($Line in Get-Content -LiteralPath $RawPath) {
    if ([string]::IsNullOrWhiteSpace($Line)) { continue }
    $Event = $Line | ConvertFrom-Json
    if ($Event.type -eq "turn.completed") { $Usage = $Event.usage }
  }
  if ($null -eq $Usage) {
    $Usage = [pscustomobject]@{
      input_tokens = $null
      cached_input_tokens = $null
      output_tokens = $null
      reasoning_output_tokens = $null
    }
  }

  $CandidateRow = [pscustomobject]@{
    candidate_id = $Profile.id
    model = $Profile.model
    reasoning_effort = $Profile.effort
    species = $Profile.species
    class = $Profile.class
    role = $Profile.role
    output_path = ("subagent_matrix/outputs/{0}.json" -f $Profile.id)
  }
  [System.IO.File]::AppendAllText($CandidatesJsonl, (($CandidateRow | ConvertTo-Json -Compress -Depth 8) + "`n"), $Utf8NoBom)

  $TelemetryRow = [pscustomobject]@{
    candidate_id = $Profile.id
    model = $Profile.model
    reasoning_effort = $Profile.effort
    species = $Profile.species
    class = $Profile.class
    wall_time_seconds = [Math]::Round($Measure.TotalSeconds, 3)
    input_tokens = $Usage.input_tokens
    cached_input_tokens = $Usage.cached_input_tokens
    output_tokens = $Usage.output_tokens
    reasoning_output_tokens = $Usage.reasoning_output_tokens
    telemetry_source = "codex_exec_json_cli_proxy"
  }
  [System.IO.File]::AppendAllText($TelemetryJsonl, (($TelemetryRow | ConvertTo-Json -Compress -Depth 8) + "`n"), $Utf8NoBom)

  $RunRow = [pscustomobject]@{
    candidate_id = $Profile.id
    started_at = $StartedAt.ToString("o")
    ended_at = $EndedAt.ToString("o")
    wall_seconds = [Math]::Round($Measure.TotalSeconds, 3)
    prompt_path = ("prompts/{0}.prompt.md" -f $Profile.id)
    output_path = ("subagent_matrix/outputs/{0}.json" -f $Profile.id)
    raw_cli_events_archived = $false
    stderr_archived = $false
  }
  [System.IO.File]::AppendAllText((Join-Path $Archive "cli_run_manifest.shape_rerun.jsonl"), (($RunRow | ConvertTo-Json -Compress -Depth 8) + "`n"), $Utf8NoBom)
  Remove-Item -LiteralPath $RawPath,$ErrPath -Force -ErrorAction SilentlyContinue
}
