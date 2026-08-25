#!/usr/bin/env node
// Public-synthetic, zero-write demonstration only. The runner reads no caller files and emits
// a deterministic JSON result on stdout.
import { compileMaterialProcurementReadinessRules } from "../compiler/material_procurement_readiness_compiler_adapter.mjs";
import { materialProcurementReadinessAdapter } from "../evaluator/material_procurement_readiness_evaluator_adapter.mjs";
import { buildMaterialProcurementReadinessPublicSyntheticRequest } from "../fixtures/material_procurement_readiness_public_synthetic.mjs";

const compiled = compileMaterialProcurementReadinessRules();
const request = buildMaterialProcurementReadinessPublicSyntheticRequest();
const result = materialProcurementReadinessAdapter.evaluate(compiled.effective_rule_set, request.typed_project_facts);
process.stdout.write(`${JSON.stringify(result)}\n`);
