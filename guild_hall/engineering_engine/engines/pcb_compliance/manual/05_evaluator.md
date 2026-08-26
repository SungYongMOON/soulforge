# 05. Evaluator

Evaluator: [pcb_compliance.mjs](../evaluator/pcb_compliance.mjs).

Evaluation first resolves all five applicability components. Explicit false yields
`NOT_APPLICABLE`; unresolved applicability, a missing required authority, an unobserved record,
or an unapproved controlled body yields `UNKNOWN`. Confirmed absence is `MISSING`; a bounded
conflict is `CONFLICT`; evidence presence can be `SATISFIED` only as readiness, not compliance.
The observation must use `evidence_by_key` with only that rule's declared evidence keys. A missing
key holds the row at `UNKNOWN`; an unknown key is rejected before a verdict is selected.

The evaluator rechecks controlled IPC-like source references at effective-ruleset admission. A
derived rule cannot switch off its controlled-body hold merely by bypassing the compiler.
