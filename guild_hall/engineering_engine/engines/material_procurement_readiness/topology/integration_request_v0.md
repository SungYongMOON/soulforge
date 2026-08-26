# E03 shared-surface integration request v0

Status: request only. This package does not modify any shared Core, registry schema, root script,
whole-engine manifest/topology/release, Watchtower federation, or main branch.

## Candidate package

- `domain_engine_id`: `material_procurement_readiness`
- candidate path: `guild_hall/engineering_engine/engines/material_procurement_readiness/**`
- adapter: `evaluator/material_procurement_readiness_evaluator_adapter.mjs`
- compiler: `compiler/material_procurement_readiness_compiler_adapter.mjs`
- project evidence adapter: `evaluator/material_procurement_project_evidence_adapter.mjs`
- typed facts schema: `soulforge.material_procurement_readiness.typed_project_facts.v1`
- execution mode: `deterministic_only`
- authority boundary: `erp_owned_read_only_snapshot`; all write/action effects remain zero
- claim ceiling: `source_supported` at most

## Requested integration-lane checks

1. Review the candidate against the existing Core Domain Adapter Interface without changing that
   interface solely for E03.
2. Add a root focused validation command only after the integration lane verifies the package
   paths and concurrently merged domain packages.
3. Add the package to the whole-engine registry, topology, manifest, and release generators only
   through their canonical regenerate/check sequence; do not hand-edit generated artifacts.
4. Verify adapter registration and two-or-more-domain conformance in the integrated graph.
5. Preserve the package-local Project Binding/typed-facts v1 seam and validate its closed schemas;
   do not replace it with a live ERP adapter or mutable global facts store.
6. Keep all live ERP retrieval, storage, writer, purchase action, supplier communication,
   reservation, allocation, and task activation disconnected unless separately authorized.

## No requested Core Interface change

The candidate uses the existing `compile`/`evaluate` adapter seam, Core profile binding,
effective-rule-set assembly, and typed-facts caller seam. It deliberately does not request a
new Core method or a domain-specific global schema.

## Integration blockers and residual risks

- A real binding must map an exact ERP query/snapshot revision to the typed facts; no live ERP
  endpoint, database, or payload was supplied or inspected.
- Calendar, lead-time, reservation, receipt-attribution, and date-precedence behavior must be
  supplied by an ERP-native binding or project policy. The E03 calendar-day checkpoint is only a
  transparent candidate signal.
- Any future registry/release claim needs fresh review and the factory's integrated validators.
