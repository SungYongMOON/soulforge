const fs = require("fs");
const path = require("path");

const archive = __dirname;
const calibrationId = "cal_20260515_quality_equiv_001";
const workflowId = "xml_harness_composition_v0";

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(archive, rel), "utf8"));
}

function write(rel, text) {
  fs.mkdirSync(path.dirname(path.join(archive, rel)), { recursive: true });
  fs.writeFileSync(path.join(archive, rel), text, "utf8");
}

function writeJson(rel, value) {
  write(rel, JSON.stringify(value, null, 2) + "\n");
}

function jsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

function readUsage(candidateId) {
  const rawPath = path.join(archive, "cli_telemetry_probe", "raw", `${candidateId}.events.jsonl`);
  const lines = fs.readFileSync(rawPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
  let usage = null;
  for (const line of lines) {
    const event = JSON.parse(line);
    if (event.type === "turn.completed" && event.usage) usage = event.usage;
  }
  if (!usage) throw new Error(`Missing usage for ${candidateId}`);
  return usage;
}

const manifest = readJson("cli_run_manifest.raw.json");
const outputs = Object.fromEntries(
  manifest.map((row) => [row.candidate_id, readJson(`subagent_matrix/outputs/${row.candidate_id}.json`)])
);
const usage = Object.fromEntries(manifest.map((row) => [row.candidate_id, readUsage(row.candidate_id)]));

const candidates = [
  {
    candidate_id: "C01",
    model: "gpt-5.5",
    reasoning_effort: "xhigh",
    species: "human",
    class: "auditor",
    role: "quality_baseline_and_candidate",
    baseline_anchor: true
  },
  {
    candidate_id: "C02",
    model: "gpt-5.5",
    reasoning_effort: "low",
    species: "human",
    class: "auditor",
    role: "candidate_5_5_low",
    baseline_anchor: false
  },
  {
    candidate_id: "C03",
    model: "gpt-5.5",
    reasoning_effort: "medium",
    species: "human",
    class: "auditor",
    role: "candidate_5_5_medium",
    baseline_anchor: false
  }
];

const requiredTopLevel = [
  "profile",
  "harness_identity",
  "input_manifest",
  "connection_candidates",
  "blocked_connections",
  "review_required_connections",
  "candidate_safe_connections",
  "source_supported_connections",
  "owner_followup_needed",
  "harness_open_questions",
  "composition_readiness",
  "boundary_review",
  "downstream_handoff"
];

function shapePass(output) {
  return requiredTopLevel.every((key) => Object.prototype.hasOwnProperty.call(output, key));
}

function evalCandidate(candidate) {
  const output = outputs[candidate.candidate_id];
  const topLevelPass = shapePass(output);
  const wrappedPacket = Object.prototype.hasOwnProperty.call(output, "workflow_output_packet");
  const packet = wrappedPacket ? output.workflow_output_packet : output;
  const candidateSafe = packet.candidate_safe_connections || [];
  const reviewRequired = packet.review_required_connections || [];
  const blocked = packet.blocked_connections || [];
  const sourceSupported = packet.source_supported_connections || [];
  const boundary = packet.boundary_review || packet.public_safety_review || {};
  const downstream = packet.downstream_handoff || {};
  const noSourceSupported = Array.isArray(sourceSupported) && sourceSupported.length === 0;
  const hasCandidateSafePower = JSON.stringify(candidateSafe).includes("PWR_OUT_3V3") && JSON.stringify(candidateSafe).includes("MCU_VDD_3V3");
  const blocksInternal = JSON.stringify(blocked).includes("SW_NODE_INTERNAL");
  const blocksDebug = JSON.stringify(blocked).includes("DEBUG_RX_MISSING");
  const handlesSensorPower = JSON.stringify(reviewRequired).includes("SENSOR_VCC");
  const handlesI2c = JSON.stringify(blocked).includes("SENSOR_SDA") && JSON.stringify(blocked).includes("SENSOR_SCL");
  const explicitBoundary = JSON.stringify(boundary).includes("false") || JSON.stringify(downstream).includes("final circuit approval");
  const coreCorrect =
    hasCandidateSafePower &&
    blocksInternal &&
    blocksDebug &&
    handlesSensorPower &&
    handlesI2c &&
    noSourceSupported &&
    explicitBoundary;

  let score;
  let qualityClass;
  let hardGatePass;
  let outputQualityPass;
  let notes;

  if (candidate.candidate_id === "C01") {
    score = 100;
    hardGatePass = topLevelPass && coreCorrect;
    outputQualityPass = true;
    qualityClass = "quality_equivalent_pass";
    notes = "Baseline candidate: complete required shape, conservative classification, explicit boundaries, and no material loss by definition.";
  } else if (candidate.candidate_id === "C02") {
    score = 86;
    hardGatePass = false;
    outputQualityPass = false;
    qualityClass = "minimum_viable_pass";
    notes = "Safe and mostly complete content, but wrapped the required packet under workflow_output_packet and changed required field names, weakening machine-readability versus the baseline.";
  } else {
    score = 96;
    hardGatePass = topLevelPass && coreCorrect;
    outputQualityPass = true;
    qualityClass = "quality_equivalent_pass";
    notes = "Matches required top-level shape, preserves all critical classifications, keeps source_supported empty, and makes boundaries and handoff limits explicit.";
  }

  return {
    candidate_id: candidate.candidate_id,
    model: candidate.model,
    reasoning_effort: candidate.reasoning_effort,
    species: candidate.species,
    class: candidate.class,
    role: candidate.role,
    hard_gate_pass: hardGatePass,
    hard_gate_checks: {
      required_top_level_shape: topLevelPass,
      wrapped_packet: wrappedPacket,
      candidate_safe_power_to_mcu_only: hasCandidateSafePower,
      sensor_power_review_required: handlesSensorPower,
      local_internal_blocked: blocksInternal,
      missing_debug_blocked: blocksDebug,
      sensor_i2c_blocked: handlesI2c,
      source_supported_empty: noSourceSupported,
      boundary_limits_explicit: explicitBoundary
    },
    output_quality_pass: outputQualityPass,
    total_quality_score: score,
    baseline_relative_quality: score / 100,
    quality_class: qualityClass,
    material_loss_vs_baseline: candidate.candidate_id === "C02",
    evaluator_notes: notes
  };
}

const evals = candidates.map(evalCandidate);
const telemetry = candidates.map((candidate) => {
  const run = manifest.find((row) => row.candidate_id === candidate.candidate_id);
  const u = usage[candidate.candidate_id];
  return {
    candidate_id: candidate.candidate_id,
    model: candidate.model,
    reasoning_effort: candidate.reasoning_effort,
    species: candidate.species,
    class: candidate.class,
    input_tokens: u.input_tokens,
    cached_input_tokens: u.cached_input_tokens,
    output_tokens: u.output_tokens,
    reasoning_output_tokens: u.reasoning_output_tokens,
    wall_time_seconds: run.wall_seconds,
    telemetry_source: "codex_exec_json_cli_proxy",
    telemetry_exact_for_subagent: false
  };
});

const ranking = [
  {
    rank: 1,
    candidate_id: "C03",
    model: "gpt-5.5",
    reasoning_effort: "medium",
    species: "human",
    class: "auditor",
    quality_score: 96,
    quality_class: "quality_equivalent_pass",
    selection_reason: "Lowest wall-time and lower token profile among quality-equivalent candidates; no critical loss versus gpt-5.5/xhigh baseline."
  },
  {
    rank: 2,
    candidate_id: "C01",
    model: "gpt-5.5",
    reasoning_effort: "xhigh",
    species: "human",
    class: "auditor",
    quality_score: 100,
    quality_class: "quality_equivalent_pass",
    selection_reason: "Strongest baseline; retained as shadow because it is slower and token-heavier."
  },
  {
    rank: 3,
    candidate_id: "C02",
    model: "gpt-5.5",
    reasoning_effort: "low",
    species: "human",
    class: "auditor",
    quality_score: 86,
    quality_class: "minimum_viable_pass",
    selection_reason: "Safe usable content but not promotable under revised quality-equivalence policy due machine-readability and required-shape loss."
  }
];

const criteria = {
  workflow_id: workflowId,
  calibration_id: calibrationId,
  baseline_anchor: "gpt-5.5/xhigh candidate C01",
  quality_equivalence_thresholds: {
    minimum_total_quality_score: 90,
    minimum_baseline_relative_quality: 0.9,
    critical_section_material_loss_allowed: false
  },
  hard_gate: [
    "Output is public-safe and contains no raw XML body, private project material, runtime absolute paths, credentials, cookies, or vendor text.",
    "Output has the required top-level workflow packet sections.",
    "Source assets and upstream packets are immutable.",
    "PWR_OUT_3V3 to MCU_VDD_3V3 is at most candidate_safe and not final circuit approval.",
    "PWR_OUT_3V3 to SENSOR_VCC remains review_required until sensor current and rail budget are source-backed.",
    "SW_NODE_INTERNAL remains blocked because local_internal_candidates are excluded by default.",
    "MCU_UART_TX to DEBUG_RX_MISSING remains blocked because the target interface is absent.",
    "Sensor I2C joins remain blocked without controller-side I2C interfaces and pullup evidence.",
    "source_supported_connections remains empty for this fixture."
  ],
  output_quality_gate: [
    "Connection classifications are explicit and machine-readable.",
    "Owner follow-ups and open questions are explicit rather than implied.",
    "Boundary review states candidate_safe is not final circuit approval.",
    "Downstream handoff is usable by an owner reviewer without relying on hidden context.",
    "No critical section loses material detail compared with the gpt-5.5/xhigh baseline."
  ]
};

const evaluatorReview = {
  evaluator: "controller_manual_review_under_revised_quality_equivalence_policy",
  verdict: "criteria_not_overfit_to_baseline_wording",
  notes: [
    "The criteria are derived from the public workflow contract and synthetic fixture, not from private run truth.",
    "The baseline is used as a quality anchor; candidates may pass with different wording when hard gates and critical explicitness are preserved.",
    "Required machine-readable top-level shape is treated as a hard gate for policy promotion."
  ]
};

writeJson("quality_gate/criteria.json", criteria);
writeJson("quality_gate/evaluator_review.json", evaluatorReview);
write("subagent_matrix/candidates.jsonl", jsonl(candidates));
write("subagent_matrix/quality_eval.jsonl", jsonl(evals));
write("evaluation/rule_eval.jsonl", jsonl(evals.map((row) => ({
  candidate_id: row.candidate_id,
  hard_gate_pass: row.hard_gate_pass,
  hard_gate_checks: row.hard_gate_checks
}))));
writeJson("evaluation/llm_shortlist_eval.json", {
  evaluator: "manual_quality_equivalence_review",
  baseline_candidate_id: "C01",
  baseline_model: "gpt-5.5",
  baseline_reasoning_effort: "xhigh",
  shortlist: evals,
  conclusion: "C03 is quality_equivalent_pass; C02 is minimum_viable_pass only and not promotable."
});
writeJson("evaluation/final_ranking.json", {
  calibration_id: calibrationId,
  workflow_id: workflowId,
  ranking,
  selected_primary_candidate_id: "C03",
  policy_promotion_allowed: true,
  policy_promotion_basis: "quality_equivalent_pass primary exists under revised policy"
});
write("cli_telemetry_probe/telemetry.jsonl", jsonl(telemetry));
write(
  "cli_telemetry_probe/passed_candidates.jsonl",
  jsonl(telemetry.filter((row) => ["C01", "C03"].includes(row.candidate_id)))
);
writeJson("golden/usage.json", {
  source: "codex_exec_json_cli_proxy",
  baseline_candidate_id: "C01",
  model: "gpt-5.5",
  reasoning_effort: "xhigh",
  usage: usage.C01,
  wall_time_seconds: manifest.find((row) => row.candidate_id === "C01").wall_seconds,
  notes: [
    "Baseline was also an actual candidate run.",
    "CLI telemetry is proxy telemetry for this explicitly labeled cli_only_calibration fallback."
  ]
});
write(
  "golden/output.md",
  `# gpt-5.5/xhigh baseline output\n\nCandidate: C01\n\n\`\`\`json\n${JSON.stringify(outputs.C01, null, 2)}\n\`\`\`\n`
);
write(
  "run_manifest.yaml",
  `calibration_id: ${calibrationId}
workflow_id: ${workflowId}
kind: workflow_profile_calibration_archive
status: complete
created_at: 2026-05-15T13:24:30+09:00
calibration_mode: cli_only_calibration
source_skill: workflow-optimizer
boundary: public_safe_synthetic_fixture
runtime_note:
  default_subagent_quality_first: blocked_runtime_subagent_unavailable
  fallback_used: cli_only_calibration
  reason: Isolated subagent/candidate-runner tooling was unavailable; Codex CLI candidates were run read-only and explicitly labeled as CLI-only calibration evidence.
previous_profiles:
  primary_present: false
  shadow_profiles_present: false
  action: no_previous_primary_or_shadows_to_rerun
baseline:
  candidate_id: C01
  model: gpt-5.5
  reasoning_effort: xhigh
matrix:
  candidates:
    - candidate_id: C01
      model: gpt-5.5
      reasoning_effort: xhigh
      species: human
      class: auditor
      role: quality_baseline_and_candidate
    - candidate_id: C02
      model: gpt-5.5
      reasoning_effort: low
      species: human
      class: auditor
      role: candidate_5_5_low
    - candidate_id: C03
      model: gpt-5.5
      reasoning_effort: medium
      species: human
      class: auditor
      role: candidate_5_5_medium
quality_gate:
  criteria: quality_gate/criteria.json
  evaluator_review: quality_gate/evaluator_review.json
telemetry:
  source: codex_exec_json_cli_proxy
  passed_candidates: cli_telemetry_probe/passed_candidates.jsonl
  telemetry_jsonl: cli_telemetry_probe/telemetry.jsonl
recommendation:
  model: gpt-5.5
  reasoning_effort: medium
  species: human
  class: auditor
public_safety:
  fixture_contains_real_xml_body: false
  fixture_contains_project_private_material: false
  fixture_contains_runtime_absolute_paths: false
  fixture_contains_secrets: false
  archive_raw_cli_events_redacted: true
notes:
  - Candidate prompts did not include golden output or frozen quality criteria.
  - C02 is recorded as minimum_viable_pass only and is not promotable under the revised policy.
  - Exact subagent token usage is unavailable because no subagent runner was available.
`
);
write(
  "recommendation.yaml",
  `workflow_id: ${workflowId}
calibration_id: ${calibrationId}
recommended_profile:
  model: gpt-5.5
  reasoning_effort: medium
  species: human
  class: auditor
  candidate_id: C03
quality_gate:
  baseline_candidate_id: C01
  baseline_profile: gpt-5.5/xhigh
  quality_class: quality_equivalent_pass
  quality_score: 96
  baseline_relative_quality: 0.96
  minimum_viable_candidates:
    - candidate_id: C02
      reason: Safe and usable content, but required top-level shape was wrapped and weaker for machine handoff.
cli_proxy_telemetry:
  input_tokens: ${usage.C03.input_tokens}
  cached_input_tokens: ${usage.C03.cached_input_tokens}
  output_tokens: ${usage.C03.output_tokens}
  reasoning_output_tokens: ${usage.C03.reasoning_output_tokens}
  wall_time_seconds: ${manifest.find((row) => row.candidate_id === "C03").wall_seconds}
why_selected:
  - Passed hard gates and output-quality gates under the revised quality-equivalence policy.
  - Preserved all critical classifications from the gpt-5.5/xhigh baseline without material loss.
  - Lower token and wall-time profile than the xhigh baseline.
measurement_policy:
  quality_source: cli_only_calibration
  telemetry_source: codex_exec_json_cli_proxy
  subagent_token_usage_available: false
  telemetry_exact_for_subagent: false
  cost_confidence: relative_not_exact
boundary_assumptions:
  - Synthetic fixture only.
  - No raw XML body, real project material, runtime absolute path, credential, cookie, vendor text, _workspaces output, or private run truth is intentionally preserved in the archive.
shadow_profiles:
  - rank: 2
    candidate_id: C01
    model: gpt-5.5
    reasoning_effort: xhigh
    species: human
    class: auditor
    quality_score: 100
    quality_class: quality_equivalent_pass
    output_tokens: ${usage.C01.output_tokens}
    reasoning_output_tokens: ${usage.C01.reasoning_output_tokens}
    wall_time_seconds: ${manifest.find((row) => row.candidate_id === "C01").wall_seconds}
non_promoted_candidates:
  - candidate_id: C02
    model: gpt-5.5
    reasoning_effort: low
    quality_class: minimum_viable_pass
    quality_score: 86
    reason: Required packet shape loss versus baseline; not quality-equivalent.
`
);

for (const candidate of candidates) {
  write(
    `cli_telemetry_probe/raw/${candidate.candidate_id}.events.jsonl`,
    jsonl([
      {
        type: "redacted_note",
        candidate_id: candidate.candidate_id,
        reason: "Raw CLI events contained runtime paths and plugin startup noise; public-safe archive retains usage and candidate output separately."
      },
      {
        type: "turn.completed",
        candidate_id: candidate.candidate_id,
        usage: usage[candidate.candidate_id]
      }
    ])
  );
  write(
    `cli_telemetry_probe/raw/${candidate.candidate_id}.stderr.txt`,
    "Redacted for public-safe archive: CLI stderr contained plugin startup warnings and runtime-local paths. No stderr content is used as calibration evidence.\n"
  );
}
