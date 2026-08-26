# 06 — Evidence trace

`adaptDatabaseProjectEvidence` accepts an exact project binding, opaque source
references, per-rule requirements, and observations. It produces frozen typed
facts and a digest; it rejects paths, credentials, aliases, cycles, accessors,
and cross-project observations.

An observation names both `rule_id` and the rule's closed `evidence_key`. For a
hard technical result, the submitted observation must agree with the named
analyzer projection derived from `analysis_input`. For example, a caller cannot
label SQLite foreign-key enforcement as contradicted while the submitted
platform-control fact says it is enabled and still receive a hard finding; that
becomes `gap_conflict`, not an invented failure.

Recovery-plan/restore-test evidence and PostgreSQL PITR precondition evidence
are distinct propositions. A passed generic restore test never overturns or
conflicts with coherent PITR-specific contradiction. The PITR rule compares the
submitted `pitr_preconditions` proof with the PostgreSQL PITR platform control;
disagreement produces `gap_conflict`. Opposite passed/failed submitted PITR
proofs are also a conflict for that same proposition, never a confirmed hard
contradiction. The common recovery rule keeps its own
recovery-plan and restore-proof path. An explicit
`restore_test_required_but_failed` is a cross-cutting safety signal: it blocks a
positive PITR result to `gap_conflict`, while coherent contradictory PITR facts
remain eligible for `gap_missing` rather than being masked as satisfied.

The synthetic fixture has opaque references only. It supplies tables and
foreign-key targets, a migration with rollback proof, transaction controls,
workload metrics, recovery proof, data-quality checks, and platform controls.
Those are evidence shapes, not commands or live configuration collection.
