import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import {
  compileMaterialProcurementReadinessRules,
  materialProcurementReadinessCompilerAdapter,
  MPR_COMPILER_ERROR_CODES,
} from "../compiler/material_procurement_readiness_compiler_adapter.mjs";
import { materialProcurementReadinessAdapter } from "../evaluator/material_procurement_readiness_evaluator_adapter.mjs";
import { buildMaterialProcurementReadinessPublicSyntheticRequest } from "../fixtures/material_procurement_readiness_public_synthetic.mjs";
import {
  MATERIAL_PROCUREMENT_READINESS_RULESET_REF,
  MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF,
} from "../rules/material_procurement_readiness_rules.mjs";
import { createMaterialProcurementReadinessModuleManifest } from "../topology/material_procurement_readiness_module_manifest.mjs";

const PROFILE_HASH = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

function projectProfile(operations = []) {
  return {
    profile_id: "public-synthetic-mpr-profile-v0",
    domain_engine_id: "material_procurement_readiness",
    revision_or_hash: PROFILE_HASH,
    extends_or_base_pin: MATERIAL_PROCUREMENT_READINESS_RULESET_REF.revision_id,
    source_refs: ["public-synthetic-source-v0"],
    operations,
  };
}

test("base compiler result is deterministic and its source packet reference pins the actual public packet bytes", () => {
  const first = compileMaterialProcurementReadinessRules();
  const second = compileMaterialProcurementReadinessRules();
  const sourcePacket = readFileSync(new URL("../contracts/material_procurement_readiness_source_packet_v0.md", import.meta.url));
  const actualHash = createHash("sha256").update(sourcePacket).digest("hex");

  assert.equal(first.rule_count, 5);
  assert.equal(first.effective_rule_set.ruleset_ref.content_id, MATERIAL_PROCUREMENT_READINESS_RULESET_REF.content_id);
  assert.equal(MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF.content_id, `sha256:${actualHash}`);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("the existing Core Interface preserves Profile provenance and evaluates typed ERP facts without Core changes", () => {
  const bindings = resolveProfileBindings(null, projectProfile([
    { op: "set_default_receipt_required", value: true },
  ]));
  const assembled = assembleEffectiveRuleSet(materialProcurementReadinessAdapter, bindings, {
    purpose: "public_synthetic",
  });
  const request = buildMaterialProcurementReadinessPublicSyntheticRequest("READY_INBOUND");
  const result = evaluate(materialProcurementReadinessAdapter, assembled, request.typed_project_facts);

  assert.equal(assembled.domain_engine_id, "material_procurement_readiness");
  assert.equal(assembled.compilation_trace.profiles[0].profile_id, "public-synthetic-mpr-profile-v0");
  assert.equal(assembled.effective_rule_set.policy.default_receipt_required, true);
  assert.equal(result.assessment.state, "ready");
  assert.equal(materialProcurementReadinessAdapter.revision, "soulforge.material_procurement_readiness.evaluator.v0");
});

test("unsupported profile operations fail closed instead of changing purchasing policy", () => {
  const bindings = resolveProfileBindings(null, projectProfile([
    { op: "create_purchase_order", vendor: "synthetic" },
  ]));
  assert.throws(
    () => materialProcurementReadinessCompilerAdapter.compile(bindings),
    (error) => error?.code === MPR_COMPILER_ERROR_CODES.PROFILE_OPERATION_UNSUPPORTED,
  );
});

test("compiler rejects proxied binding arrays and options without invoking hostile getters", () => {
  let bindingsGets = 0;
  const bindingsProxy = new Proxy([], {
    get() {
      bindingsGets += 1;
      throw new Error("bindings getter must not run");
    },
  });
  assert.throws(
    () => compileMaterialProcurementReadinessRules(bindingsProxy),
    (error) => error?.code === MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
  );
  assert.equal(bindingsGets, 0);

  let bindingGets = 0;
  const validBinding = resolveProfileBindings(null, projectProfile())[0];
  const bindingProxy = new Proxy(validBinding, {
    get() {
      bindingGets += 1;
      throw new Error("binding getter must not run");
    },
  });
  assert.throws(
    () => compileMaterialProcurementReadinessRules([bindingProxy]),
    (error) => error?.code === MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
  );
  assert.equal(bindingGets, 0);

  let optionsGets = 0;
  const optionsProxy = new Proxy({}, {
    get() {
      optionsGets += 1;
      throw new Error("options getter must not run");
    },
  });
  assert.throws(
    () => compileMaterialProcurementReadinessRules([], optionsProxy),
    (error) => error?.code === MPR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID,
  );
  assert.equal(optionsGets, 0);
});

test("module manifest remains a pre-release deterministic-only contract with caller-pinned build facts", () => {
  const manifest = createMaterialProcurementReadinessModuleManifest({
    module_version: "0.1.0",
    build_commit: "e2acd5d899a1760bd528ffd12a9835c949df1d8e",
    artifact_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    engine_contract_abi_range: ">=1.0.0 <2.0.0",
    supported_project_classifications: ["public_synthetic"],
    dependency_versions: { node: "22.0.0" },
    configuration_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    rollback_compatible_with: [],
    test_receipt_ref: "public-synthetic-test-receipt-v0",
  });

  assert.equal(manifest.execution_mode, "deterministic_only");
  assert.equal(manifest.claim_ceiling, "source_supported");
  assert.equal(manifest.module_id, "soulforge.engineering_engine.material_procurement_readiness");
});
