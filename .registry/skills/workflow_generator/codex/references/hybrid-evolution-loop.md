# Hybrid Evolution Loop

Use this reference inside `workflow_evolution` to balance fast learning with clean validation.

## Purpose

Do not force every iteration to be a full cold-start replay. Use warm learning packets to compress experience, then periodically prove the current workflow by replaying from the original baseline artifact.

## Phases

### `warm_evolve`

Use when the goal is to learn quickly from observed evidence.

Allowed A-side inputs:

- prior candidate artifact summaries
- redacted verifier verdicts
- strategy ledger entries
- tool logs
- blocker classifications
- source packets
- regression matrix

Rules:

- Write an experience packet before changing workflow or skill files.
- Use the packet to improve the workflow, split roles, add source packets, or sharpen verifier contracts.
- If the packet includes oracle-derived facts, mark it `benchmark_safe_for_executor: false`.
- Do not claim benchmark validation from a warm evolve result.
- In benchmark mode, do not base warm evolve edits on raw oracle content or detailed oracle-derived mismatch reports.

### `cold_replay`

Use after warm learning changes the workflow and A needs to know whether the workflow can start again from the baseline artifact.

Executor may receive only:

- fixed baseline artifact or fixture input
- current workflow/skill files
- approved non-oracle source packets
- safe task prompt and tool constraints

Executor must not receive:

- previous candidates
- verifier reports
- repair packets
- A diagnosis
- experience packets
- workflow extraction packets
- oracle/reference artifacts
- oracle-derived target data

### `final_cold_gate`

Use before readiness, promotion, or canon claims.

Requirements:

- fresh executor context
- separate fresh verifier context when oracle/reference checking is required
- no warm artifacts in executor context
- same baseline artifact or fixture input recorded in the manifest
- regression on previously passed fixtures
- strict artifact-level pass bar

## Phase Selection

Choose `warm_evolve` when the next useful work is learning, compression, source review, workflow decomposition, or strategy change.

Choose `cold_replay` when the workflow has changed and A needs validation that the change works from the original input.

Choose `final_cold_gate` when the user asks for readiness, promotion, benchmark-valid evidence, or final clean proof.

## Evidence Labels

```yaml
phase_evidence:
  warm_evolve:
    evidence_type: learning
    benchmark_validation: false
  cold_replay:
    evidence_type: validation
    benchmark_validation: true
  final_cold_gate:
    evidence_type: readiness_gate
    benchmark_validation: true
```

Warm evidence may guide A. It must not be passed to a cold replay executor unless the run is explicitly reclassified as reconstruction or open-book repair evidence.
