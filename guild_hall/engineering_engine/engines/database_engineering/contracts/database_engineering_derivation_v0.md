# Database Engineering derivation v0

Each executable candidate is an explicit triple: a project-bound requirement,
an exact supported platform/version, and machine-observable typed evidence.
Only a contradictory observation under all three conditions may yield the Core
`gap_missing` state. Missing requirement, platform applicability, or evidence
yields `gap_unknown`.

For an inventory-anchored hard technical rule, the observation additionally
names the rule's closed `evidence_key` and must agree with the corresponding
analysis Module projection. A caller label that conflicts with the analyzer is
`gap_conflict`; a missing or unknown projection is `gap_unknown`. This prevents
a caller-supplied boolean from manufacturing a hard technical finding.

The SQLite candidates cover explicit foreign-key activation/checks, integrity
check separation, the documented dirty-read exception, and a project-bound
single-writer constraint. PostgreSQL candidates cover project-bound database
constraints, isolation, row-level security, and PITR preconditions. Recovery
planning evidence is a project-bound common candidate. Index choice, modeling,
normalization, partitioning, sharding, DBMS choice, and architecture tradeoffs
are advisory until the same triple is closed.

The rules module carries short metadata, source IDs, and applicability. It does
not copy source text. Replaying the same bindings produces the same derived
ruleset digest; profile-added rules preserve the Core binding provenance and are
evaluated rather than silently ignored.
