# Run Storage Policy

Use this before writing any workflow-evolution, reconstruction, or skill-extraction evidence.

## Core Rule

The A skill folder is a reusable controller package. It is not a runtime log store.

Do not write these under the A skill folder:

- run manifests
- source discovery packets
- source packets collected for a specific case
- strategy ledgers
- experience packets
- candidates
- verifier verdicts or reports
- regression matrices
- workflow extraction packets
- raw fixture outputs

Only edit the A skill folder when the user is explicitly changing the A skill itself.

## One Request, One Run Root

Every non-trivial workflow request gets a unique `run_root` before evidence is written.

Keep these identities separate:

- `workflow_family_id`: stable family name, such as `block_diagram`, `wiring_diagram`, `cable_drawing`, or `system_diagram`
- `run_id`: one execution instance, such as `block_diagram_workflow_evolution_20260509_01`
- `run_root`: directory where that run's evidence lives

The next request in the same family creates a new sibling run root. Do not silently merge separate requests into one folder.

## Preferred Locations

Use the safest available owner:

1. If a project code and approved private procedure-capture area are known, use that project run evidence area.
2. If project ownership is unknown or `project_code: none`, use a local/temp run folder such as `$CODEX_HOME/runs/<run_id>`.
3. Do not use public repo folders, original input folders, A skill folders, B skill folders, or protected canon folders for transient run evidence unless the user explicitly asks and the boundary allows it.
4. Workspace preparation scripts must receive the current `run_root` and may write only to refreshable subdirectories under it.

## Expected Layout

Prefer this shape:

```text
<run_root>/
  run_evidence/
    GOAL_DECLARATION.yaml
    RUN_MANIFEST.yaml
    SOURCE_DISCOVERY_PACKET.yaml
    SOURCE_PACKETS/
    STRATEGY_LEDGER.yaml
    EXPERIENCE_PACKETS/
    CANDIDATES/
    VERDICTS/
    REGRESSION_MATRIX.yaml
    WORKFLOW_EXTRACTION_PACKET.yaml
    stage_packets/
    stage_logs/
  workflow_draft/
    workflow.yaml
    step_graph.yaml
    role_slots.yaml
    handoff_rules.yaml
```

Use only the folders needed by the selected mode. A root-level manifest copy is optional, but `run_evidence/RUN_MANIFEST.yaml` is the canonical manifest location for the run evidence bundle. Keep raw artifacts out of evidence bundles when they are sensitive, target-specific, private, or too large.

## Extraction Boundary

Reusable workflow or skill candidates are extracted from successful run evidence. Extraction may create or modify a workflow or skill package only after:

- the run evidence is complete enough to justify the reusable step
- reference/oracle leakage classification is clear
- cold replay or final gate evidence supports the claim being made
- the destination write boundary is approved

Raw run logs and fixture-specific packets remain in the run root.
