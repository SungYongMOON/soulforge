# 08 — Decisions

Modeling, normalization, indexing, partitioning, sharding, DBMS choice, and
isolation tradeoffs remain advisory unless the project closes the requirement,
platform, and machine-observable evidence triple. Human acceptance remains
outside this engine.

| Result or error | Interpretation | Safe next action |
| --- | --- | --- |
| `gap_unknown` / `project_requirement_unbound` | The engine has no project requirement to compare. | Bind an approved project requirement; do not infer one from documentation. |
| `gap_unknown` / `platform_unsupported` | DBMS family or exact version is outside v0. | Hold or add a separately reviewed platform pack. |
| `gap_unknown` / `evidence_key_mismatch` | Evidence was not produced by the rule's named analyzer. | Correct the closed typed fact or collect the appropriate observation. |
| `gap_conflict` / `caller_and_analyzer_evidence_conflict` | Caller label and analysis facts disagree. | Preserve both facts and resolve with the project evidence authority. |
| `gap_missing` with `hard_technical_failure: true` | A project requirement, exact supported platform, and matching analyzer-confirmed contradiction are present. | Confirm remediation owner and re-evaluate; this is still not approval. |
| `DBE_SOURCE_TAMPERED` | Inventory/ruleset or exact PostgreSQL source-pin metadata drifted. | Refresh public source metadata through review; never copy a body into the package. |
