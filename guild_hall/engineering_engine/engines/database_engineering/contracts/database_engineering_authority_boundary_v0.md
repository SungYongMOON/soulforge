# Database Engineering authority boundary v0

The package owns public-safe rule metadata, typed-facts validation, deterministic
analysis, and explanatory guidance. The Engineering Engine Core owns shared
assembly, result envelopes, global gap vocabulary, and receipts.

Project requirements, workload, data classification, data-retention policy,
RPO/RTO, acceptance thresholds, source truth, operational configuration, and
human approval remain project or Owner authority. Organization Profiles may add
validated recurring requirements through the Core Profile seam; they do not
turn SQLite or PostgreSQL platform packs into Organization Profiles.

Result rows expose `source_authority`: `inventory_anchored` for source-inventory
base rules, `project_bound` for project-owned common requirements, and
`profile_declared` for Profile-added rules. A Profile-added rule remains
`observed` and advisory until separately inventory-backed; it cannot mint a
hard technical failure merely because the Core Profile Binding is present.

The runner has no default file, network, database, model, Task, Context, or
writer effects. It accepts no credentials, database connection details, raw
source bodies, or customer payload. Unsupported DBMS families and versions
remain `gap_unknown`/`HOLD`.
