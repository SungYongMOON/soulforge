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

Recovery-plan evidence and PostgreSQL PITR precondition evidence are distinct
propositions. The package does not equate them. Instead, the PITR rule compares
the submitted `pitr_preconditions` recovery proof with the PostgreSQL platform
control; disagreement produces `gap_conflict`. The common recovery rule keeps
its own recovery-plan and restore-proof path.

The synthetic fixture has opaque references only. It supplies tables and
foreign-key targets, a migration with rollback proof, transaction controls,
workload metrics, recovery proof, data-quality checks, and platform controls.
Those are evidence shapes, not commands or live configuration collection.
