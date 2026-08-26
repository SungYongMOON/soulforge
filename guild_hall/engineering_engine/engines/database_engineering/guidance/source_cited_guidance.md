# Source-cited guidance

Use this package only with a project-bound requirement, an exact supported
platform/version, and machine-observable evidence. SQLite foreign-key checks,
transaction/dirty-read constraints, PostgreSQL constraints/isolation/RLS/PITR,
and recovery evidence are bounded by the source inventory. SQLite `EXPLAIN
QUERY PLAN` text is not a verdict input. Backup or PITR evidence does not prove
RPO, RTO, disaster recovery, security, or approval.

When a state is `gap_unknown`, collect the missing project requirement or
evidence rather than inventing it from an external source. See the
[source packet](../contracts/database_engineering_source_packet_v0.md) and
[authority boundary](../contracts/database_engineering_authority_boundary_v0.md).
