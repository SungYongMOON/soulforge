# Database Engineering Domain Engine

`database_engineering` is a source-supported candidate for deterministic review
of project-bound relational database-engineering evidence. Its small public
Interface is the existing Engineering Engine Core adapter:

- `compile(profileBindings, scope)` assembles an effective rule set;
- `evaluate(effectiveRuleSet, typedFacts, authority, cutoffs)` returns
  per-rule Core gap states and a zero-effect receipt.

The package exposes two closed receipts: the Project Binding adapter's
`soulforge.database_engineering.evidence_receipt.v0` and the evaluator's
`soulforge.database_engineering.evaluation_receipt.v0`.

The package hides schema-graph, migration, transaction, workload, recovery,
and data-quality analysis behind that Interface. It covers common relational
concepts plus public-synthetic SQLite 3.53.4 and PostgreSQL 18.6 facts only.
Other DBMS families or versions are `gap_unknown`/`HOLD`.

It is not a DBMS, central database, live DBA, migration executor, Task/Context
writer, RAG verdict authority, or approval authority. Project requirements,
RPO/RTO, policy thresholds, source truth, and human acceptance remain outside
this package.

See [contracts](contracts/), [guidance](guidance/), and the twelve-part
[manual](manual/README.md). Shared discovery, release, topology, and manifest
registration are intentionally deferred in the package-local integration
request.
