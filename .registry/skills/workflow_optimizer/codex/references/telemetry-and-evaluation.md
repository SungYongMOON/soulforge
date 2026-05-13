# Telemetry And Evaluation

## CLI Telemetry

Use CLI telemetry as the later probe after quality evaluation. It measures token, reasoning-token, wall-time, and cost proxy values for quality-passing candidates only. It does not decide the full quality matrix and does not replace isolated candidate generation.

Prefer this command shape for isolated telemetry runs:

```bash
printf '%s' "$PROMPT" | codex -a never exec \
  --ephemeral \
  --ignore-user-config \
  --ignore-rules \
  --skip-git-repo-check \
  --json \
  --sandbox read-only \
  -C /tmp \
  -m "$MODEL" \
  -c "model_reasoning_effort=\"$EFFORT\"" \
  -
```

Parse JSON lines:

- Candidate text: `item.completed.item.text`
- Usage: `turn.completed.usage`
- Required usage fields: `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`
- Wall time: measure command start to completion in seconds

If CLI telemetry is unavailable, say exact candidate token comparison is unavailable. Isolated candidate generation owns quality; CLI owns telemetry only.

Report quality and telemetry as separate sources:

- `quality_source: subagent_full_matrix` when isolated subagents were authorized and used
- `quality_source: cli_only_calibration` when the user explicitly approved a CLI-only fallback
- `telemetry_source: cli_passed_candidates_only`
- `subagent_token_usage_available: false`, unless the actual runner returns usage
- `telemetry_exact_for_subagent: false`
- `cost_confidence: relative_not_exact`

Use CLI telemetry to compare passed candidates, not to claim exact subagent cost and not to score rejected candidates. Treat CLI cost differences under 5% as noise; differences over 20% are usually meaningful.

## Quality Hard Gates

Apply hard gates before scoring:

- Any secret/private/raw boundary violation fails.
- Missing required output shape fails.
- Incorrect core decision fails.
- Candidate claims it ran commands or read files when it did not fails.
- Candidate uses golden output or golden-derived criteria fails.

## Scoring

Then score passing candidates with workflow-adjusted weights:

| Dimension | Weight |
| --- | ---: |
| Quality and usability | 40 |
| Model/task fit | 20 |
| Token/cost efficiency | 20 |
| Wall-clock time | 15 |
| Stability across re-runs | 5 |

Use this evaluator schema:

```json
{
  "usable": true,
  "critical_errors": [],
  "missing_required_items": [],
  "golden_requirement_coverage": 0.0,
  "task_success": 0.0,
  "safety_boundary": "pass",
  "repeatability": 0.0,
  "final_quality": "pass"
}
```

For procedure outputs, emphasize ordered steps, evidence/assumption separation, boundary handling, failure branches, completion criteria, and next action.

For diagrams or circuit-style outputs, evaluate structure separately from appearance: required parts, connections, labels, values, safety-critical omissions, readability, and implementation feasibility.

For code workflows, include tests, behavioral correctness, repo conventions, minimal scope, and whether the model chose appropriate tools.
