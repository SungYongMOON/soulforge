# Optimizer Run Report - long_thread_handoff_v0 - 2026-06-11

## Scope

- Target workflow: `long_thread_handoff_v0`
- Calibration id: `cal_20260611_long_thread_handoff_quality_equiv_001`
- Mode: repo-local `cli_quality_equivalence` shortlist
- Fixture: public-safe synthetic long-thread handoff packet
- Non-claims: no raw transcript, private payload, secret, mail, attachment,
  real handoff mutation, external notification, route switch, owner approval,
  pilot execution, production-ready claim, or default-route claim.

## Candidate Matrix

| Candidate | Profile | Quality | Total tokens | Reasoning tokens | Wall s |
| --- | --- | --- | ---: | ---: | ---: |
| A | `gpt-5.4-mini|low|dwarf|auditor` | fail: missing `night_work_handoff.final_goal` | 17743 | 36 | 22.541 |
| B | `gpt-5.4|low|dwarf|auditor` | pass, score 98 | 18293 | 18 | 30.053 |
| C | `gpt-5.5|low|dwarf|auditor` | pass, score 96 | 19533 | 13 | 24.531 |
| D | `gpt-5.5|medium|dwarf|auditor` | pass, score 95 | 19292 | 22 | 24.762 |
| E | `gpt-5.5|xhigh|dwarf|auditor` | pass, score 97 | 19769 | 516 | 32.599 |

## Recommendation

Primary profile: `gpt-5.4|low|dwarf|auditor`.

Reason: Candidate B was the lowest-token quality pass after Candidate A failed
the hard gate for required handoff field placement. Candidate B preserved the
durable handoff shape, worker-report-as-evidence posture, validation gap
handling, `continue_without_clear_or_compact` reset decision, and the
no-default-route/no-production-ready claim ceiling.

First shadow: `gpt-5.5|low|dwarf|auditor`, the fastest measured passing profile.

## Validation Summary

- Scoped archive YAML/JSON/JSONL parse and path scan: pass, 31 structured files
  parsed, 49 files scanned, zero absolute-path or email-like findings.
- `npm.cmd run validate:path-policy`: pass, 0 violations.
- `npm.cmd run validate:canon`: pass, checked 118, 0 errors, 0 warnings.
- `git diff --check -- .workflow/long_thread_handoff_v0`: pass.
- `npm.cmd run done:check`: pass root done-check. Symlink-related unit fixtures
  were skipped on Windows because symlink creation is unavailable, with no
  failures.

## Evidence Refs

- `input_fixture.public.json`
- `prompts/*.prompt.md`
- `quality_gate/criteria.json`
- `subagent_matrix/outputs/*.output.md`
- `subagent_matrix/outputs/*.events.jsonl`
- `subagent_matrix/quality_eval.jsonl`
- `cli_telemetry_probe/telemetry.jsonl`
- `evaluation/final_ranking.json`
- `recommendation.yaml`
