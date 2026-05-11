# Verification Gate

Use this reference when deciding whether target skill B can be reported as draft, usable, or production-ready.

## Fresh-Context B Execution

B's actual task performance must be tested in a fresh-context subagent whenever subagents are authorized and available.

- A may inspect and edit B, run structure validators, and run deterministic script checks.
- In benchmark or skill-validation mode, A must not inspect raw oracle/reference artifacts or detailed oracle-derived mismatch reports.
- A must not treat a current-context walkthrough as B execution evidence.
- Each benchmark or evaluation round should use a new subagent so prior diagnosis, expected answers, or comparison notes do not leak.
- Hidden oracle/reference artifacts must not be passed to B. Examples include `REF.xml`, `REF.md`, accepted outputs, expected-answer files, target drawings, expected images, and answer keys. A may route them to V after B returns its output, but must not inspect them directly or replace required V verification with self-review.
- Enforce oracle isolation by copying only allowed inputs into a clean evaluation workspace before spawning B when the original directory also contains oracle files. Use `scripts/prepare_isolated_eval_workspace.py --run-root <run_root>` or an equivalent explicit allow-list copy. The destination must be a subdirectory of the current run root.
- If subagents are unavailable or not authorized, report `blocked-pending-subagent-eval`, `draft`, or `usable-pending-fresh-eval`; do not report `usable` or `production-ready`.

## Separate Verifier Subagent

When the benchmark has a reference/oracle artifact, accepted answer, final target, or explicit independent verification requirement, B's output must be checked by a separate fresh-context verifier subagent V.

- V must not be A and must not be the B executor subagent that produced the candidate output.
- V receives the candidate output, the reference/oracle artifact, the acceptance contract, and verification-only instructions.
- V is read-only. It must not edit B, rerun B, modify the candidate, modify the reference, commit, or push.
- A must not replace V by doing its own oracle comparison in the current context when independent verification is required.
- Oracle/reference artifacts that are forbidden to B may be visible to V only after B has produced the candidate output.
- Create a clean verification workspace before spawning V. Include only the candidate output, required oracle/reference files, the acceptance contract, and deterministic verification scripts or checklists. Use `scripts/prepare_verification_workspace.py --run-root <run_root>` or an equivalent explicit copy. The destination must be a subdirectory of the current run root.
- If V cannot run, report `blocked-pending-verifier-subagent`, `draft`, or `usable-pending-verifier-eval`; do not report `production-ready`.

## Strict Reference-Level Verification

Use this gate when the user asks for reference-level, oracle-level, accepted-output-level, or "V must pass before human review" behavior.

- A must write the strict pass bar in V's prompt before spawning V.
- V's default verdict is fail until all must-have criteria have concrete observed evidence.
- V must pass only artifact-level differences that the acceptance contract explicitly tolerates.
- A and V must separate artifact-level completion from later human/tool review. Later human review may cover GUI import, simulation, rendering, or owner judgment, but it must not hide missing artifact construction work.
- `pass with human-review conditions` is not enough for production-ready unless every condition is outside the artifact-level target.
- Missing or wrong objects, sections, values, links, relations, notes, metadata, layout/presentation constraints, embedded asset handling, or script-check evidence are artifact-level failures unless explicitly marked tolerated.
- In benchmark or skill-validation mode, V must return a redacted verdict to A. It may report failure class, abstract delta, missing capability, source gap, boundary issue, confidence, and tolerated/non-tolerated counts, but must not include oracle payloads, exact target values, coordinates, object IDs, embedded assets, answer-key steps, or target-specific patch instructions.
- If V is unsure whether a difference is acceptable, V must fail and request a sharper acceptance contract.
- V must verify the evaluation boundary: B did not receive the oracle/reference, V is separate from B, and V received the oracle/reference read-only after B produced the candidate.
- V must not repair the candidate. In benchmark mode, any recommendation must be an abstract capability recommendation for A's next B/workflow edit and a later fresh B run.

## Baseline-Fixed Skill Verification Gate

Use this gate when the user wants evidence that B can reach a reference/oracle result from an original input, not from an already-repaired intermediate artifact.

- The run manifest must declare `run_mode: baseline_fixed_skill_eval`.
- The manifest must fix `reference_artifact_path`, `baseline_artifact_path`, `current_candidate_artifact_path`, `artifact_type`, `current_iteration`, `budget`, `stop_reason`, and `status`.
- Every round must start from the same `baseline_artifact_path`; if the baseline path changes, stop immediately.
- B receives only the current B skill, the realistic task prompt, the fixed baseline input workspace, and safety constraints.
- B must not receive previous candidates, repair target packets, V reports, A diagnosis, expected answers, or reference/oracle content.
- A may use only V's redacted verdict to edit B between rounds. Detailed mismatch reports are discovery/repair or reconstruction evidence and must not drive benchmark construction.
- Earlier candidate artifacts may be kept as diagnosis artifacts for A, but they are never the next round input in this mode.
- `verified-against-reference` is forbidden unless the final clean run also uses the fixed baseline input and no repair packet.

Use `discovery_repair` instead when the purpose is mismatch discovery or artifact repair. A `discovery_repair` run may improve B, but it must be labeled ineligible for `verified-against-reference`.

Final clean run requirements:

- Run only in `baseline_fixed_skill_eval`.
- Spawn a fresh B executor with baseline input plus current B skill only.
- Spawn a separate fresh V verifier with candidate artifact, reference/oracle artifact, acceptance criteria, and strict pass bar.
- V must report zero non-tolerated mismatches before A may report a `verified-against-reference` candidate.

Additional stop conditions for baseline-fixed runs:

- `max_iterations` is reached.
- `max_runtime_minutes` or `max_token_budget` is reached.
- The same residual mismatch repeats for two consecutive rounds.
- Score improvement stalls for two consecutive rounds.
- V evaluator conflict requires human review.
- Protected public contract changes are needed without explicit authorization.

For a strict benchmark V report, require a redacted verdict shape:

```yaml
redacted_verdict:
  pass: false
  default_was_fail: true
  strict_pass_bar_used: true
  oracle_visible_to_B: false
  oracle_visible_to_A: false
  verifier_separate_from_B: true
  candidate_file_identity:
  reference_identity_redacted: true
  failure_classes: []
  abstract_deltas: []
  missing_capabilities: []
  source_gaps: []
  boundary_issues: []
  tolerated_residual_count:
  non_tolerated_residual_count:
  next_capability_recommendations_for_A: []
  forbidden_content_absent:
    no_copied_oracle_payload: true
    no_exact_target_values: true
    no_coordinates_or_object_ids: true
    no_answer_key_steps: true
    no_target_specific_patch: true
  completion_report_allowed:
    value: false
    reason:
```

## Structure Validator

For a Codex skill folder, run the installed skill-creator validator:

```bash
python <skill-creator-dir>/scripts/quick_validate.py <target-skill-folder>
```

If the validator fails because `PyYAML` is unavailable and `uv` is installed, use:

```bash
uv run --with pyyaml python <skill-creator-dir>/scripts/quick_validate.py <target-skill-folder>
```

If the validator cannot be located, do not call B complete. Report `validator_missing` and provide the command shape that should be run.

## Script Checks

For each changed script in B, choose the safest applicable check:

1. `--help`, `-h`, or equivalent usage command.
2. Dry-run mode if the script supports it.
3. Minimal fixture execution using synthetic non-private input.
4. Static inspection only, if no execution path is safe.

Static inspection alone cannot qualify B as production-ready when the script is part of the critical workflow. Mark the result as `usable-pending-script-run` or `draft`.

## Score Rubric

Use this operational meaning for all 0-3 scorecard fields:

- `0`: Fails the criterion or violates a boundary.
- `1`: Partially addresses the criterion but misses important required behavior.
- `2`: Satisfies the criterion for bounded real use with minor residual gaps recorded.
- `3`: Satisfies the criterion cleanly, with evidence from validation, evaluator output, or concrete artifact.

Production-ready requires:

- No must-have failures.
- No score below 2.
- `target_match = 3`.
- `boundary_safety = 3`.
- At least two B-to-V fresh-context cycles when independent verification is required, unless the user explicitly accepts `owner-approved`.
- For reference/oracle-level targets, no unresolved artifact-level conditions remain in V's strict verifier report.

## Completion Report Status

Use one of these labels:

- `draft`: structure is valid and current-context walkthrough exists, but fresh-context validation is absent or incomplete.
- `blocked-pending-subagent-eval`: B execution is required but no authorized fresh-context subagent run is available.
- `blocked-pending-verifier-subagent`: independent V verification is required but no authorized separate verifier subagent run is available.
- `usable-pending-fresh-eval`: B appears usable, but authorized fresh-context evaluation has not passed yet.
- `usable-pending-verifier-eval`: B produced a candidate in a fresh context, but required separate V verification has not passed yet.
- `usable`: at least one B executor pass plus one separate V verifier pass when independent verification is required, no must-have failures, no score below 2.
- `production-ready`: production-ready rule met.
- `owner-approved`: user explicitly accepts remaining gaps.
- `blocked`: next step requires missing user criteria, domain facts, private data, unsafe execution, or boundary clarification.

`draft`, current-context walkthroughs, and A's own inspection never satisfy a gate that requires a fresh B executor subagent or separate V verifier subagent.
