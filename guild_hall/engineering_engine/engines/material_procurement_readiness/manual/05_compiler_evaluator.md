# Compiler and evaluator

The existing Core calls the domain Adapter through `compile` and `evaluate`. Evaluator adapter
revision `soulforge.material_procurement_readiness.evaluator.v1` requires a
complete `typed_project_facts.v1` envelope emitted by the Project Evidence Adapter, an empty
authority object, and cutoffs exactly matching the typed facts. Cutoffs use real UTC calendar
instants with `Z` only and exact three millisecond digits (`.SSSZ`). `known_at` must not precede
`valid_at`, and `valid_at`'s date equals `as_of_date`.

The package owns no procurement authority. Any non-empty/action authority request fails closed.
The evidence contract is [../contracts/material_procurement_project_evidence_contract_v0.md](../contracts/material_procurement_project_evidence_contract_v0.md), and the closed error model is [../contracts/material_procurement_error_model_v0.md](../contracts/material_procurement_error_model_v0.md).
