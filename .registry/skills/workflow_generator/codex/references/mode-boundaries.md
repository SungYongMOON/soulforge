# Mode Boundaries

Use this reference before A edits a skill or workflow.

## Controller Modes

- `single_skill_build`: create a new B skill for a narrow, repeatable task.
- `single_skill_modify`: improve an existing skill without changing the surrounding workflow.
- `multi_skill_workflow`: coordinate several responsibilities, roles, tools, or skills.
- `goal_reconstruction`: solve one concrete case by any safe means; useful when reference/oracle material is part of construction.
- `workflow_evolution`: evolve a workflow across multiple fixtures with regression protection.
- `skill_extraction_after_success`: extract a reusable skill after a one-off or workflow solution has succeeded.

## Selection Rules

- If the task is narrow and repeatable, use `single_skill_build` or `single_skill_modify`.
- If the task requires multiple responsibilities such as source review, construction, tool operation, verification, and evidence packaging, use `multi_skill_workflow`.
- If the goal is to solve one concrete case by any safe means, use `goal_reconstruction`.
- If multiple examples or fixtures are provided, use `workflow_evolution` by default.
- If a successful ad hoc procedure should become reusable, use `skill_extraction_after_success`.

## Evidence Meaning

- Skill-validation evidence requires oracle isolation and fresh executor/verifier separation when applicable.
- Benchmark skill-validation evidence also requires A-controller oracle blindness: A must not read raw reference/oracle content or detailed oracle-derived mismatch reports.
- Workflow evidence proves the workflow handled the tested fixture set; it does not automatically validate every underlying skill in isolation.
- Reconstruction evidence may solve the case, but if reference/oracle material is used for construction it must not be represented as benchmark skill-validation evidence.
- Extraction evidence is a draft candidate until the extracted skill passes normal skill validation.
- Run evidence belongs to a unique run root for that request. It must not accumulate inside the A skill folder.

## Run Identity

Before writing evidence, assign:

- `workflow_family_id`: stable family such as `block_diagram`, `wiring_diagram`, `cable_drawing`, or `system_diagram`
- `run_id`: one execution instance
- `run_root`: the isolated evidence folder for that instance

Do not merge separate workflow requests into one evidence folder. Same-family reruns create sibling run roots. If no safe run root is available, stop and request a human decision.

## Workflow Evolution Phases

`workflow_evolution` may use phases inside one controller mode:

- `warm_evolve`: learn from prior candidates, logs, redacted verifier verdicts, and strategy ledgers. This is learning evidence, not benchmark validation.
- `cold_replay`: run the current workflow again from the baseline artifact without warm artifacts in the executor context. This is validation evidence for the current workflow.
- `final_cold_gate`: final clean replay before readiness or promotion claims.

Do not mix phase evidence. A may use warm evidence to edit workflow/skill files, but benchmark claims require `cold_replay` or `final_cold_gate`.

## Starting State

When no workflow exists, record `starting_state: no_existing_workflow`.

Required order:

1. Run `preflight_source_survey`.
2. Write `SOURCE_DISCOVERY_PACKET.yaml`.
3. Create the minimal seed workflow only from approved non-oracle evidence.
4. Run warm/cold phases as needed.

Do not use reference/oracle content to design the seed workflow in benchmark mode.

## Artifact Roles

A is format-agnostic. Do not route by XML, Markdown, PDF, image, spreadsheet, drawing, or tool-native extension. Route by role:

- `baseline_artifact`: the original input or starting state.
- `reference_artifact`: oracle, accepted answer, or target artifact reserved for verifier-only use in benchmark mode.
- `candidate_artifact`: output produced by the executor skill or workflow.
- `source_packet`: approved non-oracle evidence used for construction.

## Goal-Seeking Escalation

If the selected method fails and the blocker shows the method is saturated, A must pick a different safe strategy rather than repeating the same attempt. Examples:

- add approved non-oracle source packets when evidence is missing
- run `preflight_source_survey` when source sufficiency or tool readiness is unknown
- create a seed workflow when `starting_state: no_existing_workflow` and source discovery is sufficient
- run domain-source review when domain facts, standards, or assets are unclear
- use tool roundtrip workflow when artifact construction cannot be trusted without tool feedback
- split one skill into multiple skills when responsibilities are mixed
- promote to `multi_skill_workflow` when coordination is the blocker
- switch to `goal_reconstruction` when reference/oracle data is needed for the concrete case
- create `workflow_evolution` when several fixtures are available
- write an experience packet when warm evidence should be compressed before the next edit
- run `cold_replay` when warm learning needs validation from the original baseline artifact
- extract reusable skill candidates after successful reconstruction
- propose pass-bar split only when evidence shows the current pass bar mixes general skill quality with fixture-specific strictness

Record each decision in the strategy ledger.

## Boundary Rules

Do not mix evidence across modes. A run may contain an outer controller mode plus an inner B/V evaluation mode, but the manifest must name both. If a run changes from skill validation to reconstruction, record the mode switch and why.
