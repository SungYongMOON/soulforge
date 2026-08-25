# 01 — Purpose and shape

The package reviews project-bound database evidence through a small Core
adapter Interface. Internal Modules analyze submitted schema, migration,
transaction, workload, recovery, data-quality, and platform-control facts. It
does not connect to or operate a database.

The caller learns only two operations: compile an Effective Rule Set from
ordered Core Profile Bindings, then evaluate it against closed Typed Database
Facts. The package implementation keeps the detailed analysis Modules behind
that seam. A result is a per-rule Core state, source-authority marker, analyzer
status, and zero-effect receipt—not a database readiness score or approval.

Coverage is intentionally narrow: common relational review context, SQLite
3.53.4, and PostgreSQL 18.6. A different family or minor version is held as
`gap_unknown`; the engine must not borrow behavior from a near match.
