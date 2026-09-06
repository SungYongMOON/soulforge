# Engineering Engine Contracts (Legacy Pointer)

The canonical contracts for domain engines have been physically relocated:
- Systems Engineering: `guild_hall/engineering_engine/engines/systems_engineering/contracts/`
- Quality Readiness: `guild_hall/engineering_engine/engines/quality_readiness/contracts/`
- Database Engineering: `guild_hall/engineering_engine/engines/database_engineering/contracts/`
- Material Procurement Readiness: `guild_hall/engineering_engine/engines/material_procurement_readiness/contracts/`
- Reliability & Maintainability: `guild_hall/engineering_engine/engines/reliability_maintainability/contracts/`
- Calibration & Measurement Validity: `guild_hall/engineering_engine/engines/calibration_measurement_validity/contracts/`
- Configuration Change Impact: `guild_hall/engineering_engine/engines/configuration_change_impact/contracts/`
- Manufacturing Readiness: `guild_hall/engineering_engine/engines/manufacturing_readiness/contracts/`
- Field Failure Corrective Action: `guild_hall/engineering_engine/engines/field_failure_corrective_action/contracts/`
- Safety Hazard: `guild_hall/engineering_engine/engines/safety_hazard/contracts/`
- BOM & Supply-Chain Risk: `guild_hall/engineering_engine/engines/bom_supply_chain_risk/contracts/`
- Interface Consistency: `guild_hall/engineering_engine/engines/interface_consistency/contracts/`
- PCB Compliance: `guild_hall/engineering_engine/engines/pcb_compliance/contracts/`

This directory is a non-authoritative compatibility pointer for the per-engine contracts listed
above and contains no definitions for those. It also owns one cross-engine contract of its own,
which does not belong to any single domain engine above:

- **Task hierarchy (candidate, not canon)**: `task_hierarchy_v1.md` +
  `../schemas/task_hierarchy_v1.schema.json` — the Stage / WorkPackage / Task / Step / Action
  machine contract that Rune (`engineering_engine`)'s stage order (`orderStageWork`) projects
  into. Read-only with respect to Rune: it never feeds back into the compiler, its rules, or its
  MCP surface. Its validator (`../schemas/task_hierarchy_v1_schema_validator.mjs`) stays a
  contracts-local copy for this commit; hoisting it to `guild_hall/shared` is left as a commit-2
  decision.
- **Follow-up, not yet added**: `task_invariants_v0.json` — the five cross-blueprint invariants
  (`INV-PROC-01` … `INV-BASE-05`) that populate `task_hierarchy_v1`'s `preconditions[]` and
  `completion_contract`. Planned for the next commit in the same lane; not present yet.
