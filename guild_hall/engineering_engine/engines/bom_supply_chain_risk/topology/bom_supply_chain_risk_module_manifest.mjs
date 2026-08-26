import { sha256Hex } from "../../../core/validators/fingerprint.mjs";

export const BOM_SCR_MODULE_MANIFEST_SCHEMA_VERSION = "soulforge.domain_engine_module_manifest.v0";

// This list is deliberately static: the production manifest has zero filesystem
// effects and the boundary test compares it to the exact package inventory.
export const BOM_SCR_OWNED_PATHS = Object.freeze([
  "README.md",
  "compiler/bom_supply_chain_risk_compiler_adapter.mjs",
  "contracts/bom_supply_chain_risk_contract_v0.md",
  "contracts/bom_supply_chain_risk_source_packet_v0.md",
  "engine.yaml",
  "evaluator/bom_supply_chain_risk.mjs",
  "evaluator/bom_supply_chain_risk_evaluator_adapter.mjs",
  "fixtures/bom_supply_chain_risk_public_synthetic.mjs",
  "integration_request.md",
  "manual/01_purpose_and_shape.md",
  "manual/02_source_and_rag_boundary.md",
  "manual/03_rules_and_profile_thresholds.md",
  "manual/04_typed_facts_and_evaluator.md",
  "manual/05_runs_receipts_and_limits.md",
  "manual/06_integration_door.md",
  "manual/README.md",
  "rules/bom_supply_chain_risk_rules.mjs",
  "schemas/bom_supply_chain_risk_assessment_schema_v0.json",
  "schemas/bom_supply_chain_risk_receipt_schema_v0.json",
  "schemas/bom_supply_chain_risk_result_schema_v0.json",
  "schemas/bom_supply_chain_risk_ruleset_schema_v0.json",
  "schemas/bom_supply_chain_risk_schema_v0.json",
  "tests/bom_supply_chain_risk_boundary.test.mjs",
  "tests/bom_supply_chain_risk_contract.test.mjs",
  "tests/bom_supply_chain_risk_hostile.test.mjs",
  "tests/bom_supply_chain_risk_runner.test.mjs",
  "tools/bom_supply_chain_risk_runner.mjs",
  "topology/bom_supply_chain_risk_module_manifest.mjs",
  "topology/bom_supply_chain_risk_topology.json",
  "vocabulary/bom_supply_chain_risk_vocabulary.mjs",
]);

export const BOM_SCR_SHARED_DEPENDENCIES = Object.freeze([
  "guild_hall/engineering_engine/core/interfaces/domain_engine_adapter.mjs",
  "guild_hall/engineering_engine/core/interfaces/profile_operation_canon.mjs",
  "guild_hall/engineering_engine/core/validators/canonical.mjs",
  "guild_hall/engineering_engine/core/validators/errors.mjs",
  "guild_hall/engineering_engine/core/validators/fingerprint.mjs",
]);

export function createBomSupplyChainRiskModuleManifest() {
  const manifest = {
    schema_version: BOM_SCR_MODULE_MANIFEST_SCHEMA_VERSION,
    domain_engine_id: "bom_supply_chain_risk",
    version: "0.1.0",
    status: "candidate",
    execution_mode: "deterministic_only",
    owned_paths: [...BOM_SCR_OWNED_PATHS],
    shared_dependencies: [...BOM_SCR_SHARED_DEPENDENCIES],
    effects: {
      filesystem_writes: 0,
      network_requests: 0,
      model_calls: 0,
      procurement_actions: 0,
      erp_writes: 0,
      authority_actions: 0,
    },
  };
  return Object.freeze({
    ...manifest,
    manifest_sha256: sha256Hex(`${BOM_SCR_MODULE_MANIFEST_SCHEMA_VERSION}\n${JSON.stringify(manifest)}`),
  });
}
