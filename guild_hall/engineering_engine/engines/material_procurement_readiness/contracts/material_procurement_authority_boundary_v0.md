# Material Procurement Authority Boundary v0

ERP remains the transaction and inventory authority. This package accepts only the literal
`erp_owned_read_only_snapshot` fact authority in both Project Binding and typed facts.

Evaluator authority input must be an empty plain object. Non-empty action/procurement authority is
refused. The package cannot create, change, release, approve, expedite, receive, reserve, allocate,
accept, or communicate a purchase/supplier decision.

The package also owns no contract interpretation, project applicability decision, calendar/MRP/ATP/
CTP calculation, conflict resolution, unit conversion, supplier scoring, MCP capability, guidance
executor, observation collector, or writer.
