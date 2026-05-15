# 2026-05-15 Quality-Equivalence Calibration

Calibration archive: `calibrations/cal_20260515_quality_equiv_001/`

## Summary

The prior policy selected `gpt-5.4/low/human/auditor` as primary with quality score 88 under the older pass gate. The revised quality-equivalence policy requires hard-gate pass, output quality score >= 90, at least 90% of the `gpt-5.5/xhigh` baseline score, and no critical section loss compared with that baseline.

Under the revised policy, the previous primary is downgraded to `minimum_viable_pass`: it remained public-safe and usable, but was weaker than the `gpt-5.5/xhigh` baseline on planned method distinctions, handoff detail, and downstream specificity.

## New Result

New primary: `gpt-5.5/medium/human/auditor` (`C04`)

- Quality class: `quality_equivalent_pass`
- Quality score: 91
- Baseline-relative quality: 0.93 against `gpt-5.5/xhigh`
- CLI proxy telemetry: 17,228 input tokens, 7,552 cached input tokens, 3,545 output tokens, 24 reasoning output tokens, 69.70 seconds

Baseline/shadow: `gpt-5.5/xhigh/human/auditor` (`C05`)

- Quality class: `quality_equivalent_pass`
- Quality score: 98
- Baseline-relative quality: 1.00
- CLI proxy telemetry: 17,228 input tokens, 7,552 cached input tokens, 5,612 output tokens, 516 reasoning output tokens, 104.60 seconds

## GPT-5.5 Candidate Comparison

- `gpt-5.5/low` (`C03`) was `minimum_viable_pass`; it covered the fixture but omitted a separate simulation owner followup and fell below the baseline-relative quality threshold.
- `gpt-5.5/medium` (`C04`) was `quality_equivalent_pass`; it preserved required gaps, followups, provenance, and boundary notes with lower telemetry than xhigh.
- `gpt-5.5/xhigh` (`C05`) was the quality baseline and shadow; it was the most complete output, with more granular planned methods and gap decomposition.

## Telemetry And Boundary Limits

The matrix used public-safe synthetic fixture data only. No private run truth, raw project payload, workspace output, credential, or secret material was used.

No separate spawn-agent tool was exposed in this runtime, so candidate quality and telemetry came from ephemeral read-only Codex CLI runs. Exact subagent token telemetry is unavailable, and the recorded token/wall-time values are CLI proxy measurements from single runs, not billing-grade or stability-averaged measurements.
