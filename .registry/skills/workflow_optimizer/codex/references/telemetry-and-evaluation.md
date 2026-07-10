# Telemetry And Evaluation

## CLI Telemetry

Use runner telemetry as the later probe after quality evaluation. It measures token, reasoning-token, wall-time, and token-derived cost proxies for quality-passing candidates only. It does not prove billed cost and does not replace isolated candidate generation.

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

- `quality_source: subagent_full_matrix` when isolated subagents/candidate runners were used
- `quality_source: cli_only_calibration` when the user explicitly approved a CLI-only fallback
- `telemetry_source: cli_passed_candidates_only`
- `subagent_token_usage_available: false`, unless the actual runner returns usage
- `telemetry_exact_for_subagent: false`
- `cost_confidence: relative_not_exact`

Record cost evidence in separate fields:

- `token_proxy`: usage-derived relative comparison; name the runner and usage source.
- `list_price_estimate`: optional estimate; record service, billing mode, pricing source/ref, effective date, currency, and calculation.
- `billed_cost`: only when an authoritative bill or service usage record exists; name that source and covered interval.

Do not translate token counts into billed cost without a service-specific pricing source. Pricing may differ by API, subscription, bundled product, cache policy, or account. Use CLI telemetry to compare passed candidates, not to claim exact subagent cost and not to score rejected candidates. Treat proxy differences under 5% as noise; differences over 20% are usually meaningful.

Record workflow invocation count, observation interval, and source before estimating aggregate savings, payback, or ROI. If usage-frequency evidence is missing, report only per-run tested proxies or list-price estimates and state `aggregate_savings_not_measured`.

## Quality Hard Gates

Apply hard gates before scoring:

- Any secret/private/raw boundary violation fails.
- Missing required output shape fails.
- Incorrect core decision fails.
- Candidate claims it ran commands or read files when it did not fails.
- Candidate uses golden output or golden-derived criteria fails.
- Candidate ran on an unresolved or incompatible runner/model/effort combination fails eligibility before scoring.

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

After scoring, label the selection `lowest_cost_passing_among_tested` only when the chosen candidate is the lowest supported cost among the candidates actually tested and passed. Otherwise state the narrower evidence-backed claim. Never promote that label to global cheapest; record exhaustive coverage, when present, as a separate scope fact tied to the runner capability snapshot.

For procedure outputs, emphasize ordered steps, evidence/assumption separation, boundary handling, failure branches, completion criteria, and next action.

For diagrams or circuit-style outputs, evaluate structure separately from appearance: required parts, connections, labels, values, safety-critical omissions, readability, and implementation feasibility.

For code workflows, include tests, behavioral correctness, repo conventions, minimal scope, and whether the model chose appropriate tools.
