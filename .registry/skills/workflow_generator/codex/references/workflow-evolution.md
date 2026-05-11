# Workflow Evolution

Use `workflow_evolution` when A must improve a workflow across multiple fixtures.

## Manifest Fields

Record:

- `controller_mode: workflow_evolution`
- `workflow_family_id`
- unique `run_id`
- `run_root_repo_path` when the run root is inside Soulforge
- `run_root_runtime_path` for local tool execution
- `fixture_queue_root`
- `starting_state: existing_workflow|no_existing_workflow|unknown`
- artifact roles for each fixture: baseline, reference/oracle when present, candidate output, source packets
- `evolution_phase: warm_evolve|cold_replay|final_cold_gate`
- source discovery packet path
- experience packet path
- workflow extraction packet path when extraction is being prepared
- fixture ordering rule
- current fixture id
- current workflow/skill versions
- pass bar
- budget
- allowed tools
- unsafe tool stop rules
- regression matrix path
- next action and human-decision status

## Run Storage

Before selecting the first fixture, create or declare a unique `run_root` for this workflow request. Do not write workflow-evolution evidence under the A skill folder.

Keep workflow family and run instance separate. For example, `block_diagram` is a family and `block_diagram_workflow_evolution_20260509_01` is one run. A later block-diagram request creates another sibling run root instead of merging evidence into the previous run.

Store run-local packets, candidates, verdicts, and regression evidence under the run root. Only extracted reusable workflow or skill candidates move to a workflow/skill package after the extraction boundary is satisfied.

When extracting a reusable workflow or skill candidate, convert artifact paths to Soulforge-root-relative POSIX paths. Do not promote `run_root_runtime_path`, installed skill paths, drive-letter paths, home-directory paths, or other host-specific absolute paths into `.workflow/**`, `.registry/**`, or public-safe examples.

## Loop

1. Inspect queue metadata and record the starting state.
2. Create or declare `workflow_family_id`, `run_id`, and `run_root`.
3. If the workflow does not exist or source sufficiency is unknown, run `preflight_source_survey` and write a source discovery packet inside the run root.
4. If `starting_state: no_existing_workflow`, create a minimal seed workflow from approved non-oracle evidence before spawning any executor.
5. Select the next fixture.
6. Choose an evolution phase:
   - `warm_evolve` for fast learning from prior candidate artifacts, logs, redacted verifier verdicts, and strategy ledger entries.
   - `cold_replay` for validation from the original baseline artifact after warm learning edits.
   - `final_cold_gate` for readiness or promotion claims.
7. Prepare an isolated execution workspace for that fixture according to the phase.
8. Run the current workflow/skills with only inputs allowed by that phase.
9. Run independent verification when the fixture has oracle/reference acceptance.
10. Classify the failure or pass from observed evidence.
11. In `warm_evolve`, write an experience packet before modifying workflow or skill files.
12. Modify only the responsible workflow or skill files inside the allowed boundary.
13. If the fixture passes in `cold_replay` or `final_cold_gate`, run regression on all previously passed fixtures.
14. Update the regression matrix and manifest before continuing.

## Phase Evidence Meaning

- `warm_evolve`: learning evidence. It can use distilled prior results to improve the workflow, but it is not benchmark skill-validation evidence.
- `cold_replay`: validation evidence for the current workflow on the selected fixture. The executor starts again from the baseline artifact and approved non-oracle source packets.
- `final_cold_gate`: readiness evidence for the covered fixtures. It must use fresh executor/verifier separation, hide warm packets from executors, and run required regressions.

## Failure Classification

Use a concrete class:

- `mode_selection_error`
- `missing_source_packet`
- `missing_source_asset`
- `missing_local_library_metadata`
- `fixture_input_invalid`
- `executor_context_leak`
- `workflow_handoff_failure`
- `skill_instruction_gap`
- `script_or_parser_gap`
- `tool_readiness_blocked`
- `unsafe_tool_action_required`
- `verifier_contract_ambiguous`
- `human_pass_bar_decision_required`
- `repeated_failure`
- `budget_exhausted`

## Strategy Ledger

After each fixture attempt, update:

```yaml
strategy_ledger:
  - attempted_strategy:
    result:
    blocker:
    next_strategy:
    why_next_strategy_is_different:
    evidence_file:
    benchmark_integrity_remains_valid:
```

When a strategy is saturated, choose a different safe strategy instead of retrying the same fixture path. Safe alternatives include adding approved non-oracle source packets, domain-source review, tool roundtrip workflow, splitting a skill into multiple skills, promoting to a multi-skill workflow, switching to goal reconstruction with evidence reclassification, expanding the fixture queue, or extracting a reusable skill after a successful reconstruction.

## Stop Conditions

Stop when:

- unsafe tool action would be required
- original files would be modified
- required source asset or source packet is missing
- the same failure repeats after a focused edit
- repeated attempts show no new information
- regression breaks a previously passed fixture
- budget is exhausted
- pass-bar decision needs human judgment
- oracle-only data would enter benchmark construction
- public/protected contract change would be required
- oracle/reference boundaries cannot be preserved

## Modification Rule

Modify workflow files when the failure is coordination, handoff, fixture selection, tool sequence, evidence packaging, or regression policy. Modify a skill only when the failure is local to that skill's trigger, workflow, validation, source policy, or script behavior.
