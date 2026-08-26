import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptProjectEvidence,
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { bomSupplyChainRiskAdapter } from "../evaluator/bom_supply_chain_risk_evaluator_adapter.mjs";
import {
  buildBomSupplyChainRiskPublicSyntheticObservation,
  buildBomSupplyChainRiskPublicSyntheticProfile,
  buildBomSupplyChainRiskPublicSyntheticProjectBinding,
} from "../fixtures/bom_supply_chain_risk_public_synthetic.mjs";

test("BOM/SCR Core seam: compiles Profile thresholds and evaluates Core Typed Project Facts deterministically", () => {
  const [profile] = resolveProfileBindings(buildBomSupplyChainRiskPublicSyntheticProfile(), null);
  const firstAssembly = assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, [profile], {});
  const secondAssembly = assembleEffectiveRuleSet(bomSupplyChainRiskAdapter, [profile], {});

  assert.equal(firstAssembly.rule_count, 9);
  assert.equal(firstAssembly.assembly_digest, secondAssembly.assembly_digest);

  const adapted = adaptProjectEvidence(
    buildBomSupplyChainRiskPublicSyntheticProjectBinding(),
    {
      source_refs: ["public-synthetic:bom-supply-chain-risk-fixture-v0"],
      observations: [buildBomSupplyChainRiskPublicSyntheticObservation()],
    },
    {
      valid_at: "2026-08-26T00:00:00.000Z",
      known_at: "2026-08-26T00:00:00.000Z",
    },
  );

  const first = evaluate(bomSupplyChainRiskAdapter, firstAssembly, adapted.typed_project_facts, {}, {});
  const second = evaluate(bomSupplyChainRiskAdapter, secondAssembly, adapted.typed_project_facts, {}, {});

  assert.deepEqual(first, second);
  assert.equal(first.assessment.overall_state, "hold");
  assert.deepEqual(first.domain_result.counts, {
    evidence_sufficient: 25,
    risk_detected: 9,
    unknown: 9,
    conflict: 1,
    not_applicable: 1,
    total: 45,
  });
  assert.deepEqual(first.receipt.effects, {
    filesystem_writes: 0,
    network_requests: 0,
    model_calls: 0,
    procurement_actions: 0,
    erp_writes: 0,
    authority_actions: 0,
  });
  assert.deepEqual(first.assessment.assessment_scope, {
    snapshot_revision: "public-synthetic-v0",
    bom_identity_ref: "bom:public-synthetic-bom-v0",
    bom_revision_ref: "revision:public-synthetic-bom-r1",
    source_system_revision_ref: "source-system:public-synthetic-source-r1",
  });
  assert.deepEqual(first.receipt.bindings.assessment_scope, first.assessment.assessment_scope);
  assert.equal(first.receipt.bindings.source_applicability["S2-DFARS-252.246-7007"].status, "bound_applicable");
});
