import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildMaterialProcurementReadinessPublicSyntheticRequest,
  buildMaterialProcurementReadinessPublicSyntheticEvidenceInput,
  MATERIAL_PROCUREMENT_READINESS_PUBLIC_CASES,
} from "../fixtures/material_procurement_readiness_public_synthetic.mjs";
import { adaptMaterialProcurementProjectEvidence, MPR_PROJECT_EVIDENCE_ERROR_CODES } from "../evaluator/material_procurement_project_evidence_adapter.mjs";
import {
  materialProcurementReadinessAdapter,
  MPR_ERROR_CODES,
} from "../evaluator/material_procurement_readiness_evaluator_adapter.mjs";
import { compileMaterialProcurementReadinessRules } from "../compiler/material_procurement_readiness_compiler_adapter.mjs";

function clone(value) {
  return structuredClone(value);
}

function cutoffsFor(typedProjectFacts) {
  return { valid_at: typedProjectFacts.valid_at, known_at: typedProjectFacts.known_at };
}

function evaluateTyped(compiled, typedProjectFacts) {
  return materialProcurementReadinessAdapter.evaluate(
    compiled.effective_rule_set,
    typedProjectFacts,
    {},
    cutoffsFor(typedProjectFacts),
  );
}

function adaptSynthetic(caseId, mutate = null) {
  const input = buildMaterialProcurementReadinessPublicSyntheticEvidenceInput(caseId);
  if (mutate) mutate(input);
  return adaptMaterialProcurementProjectEvidence(input).typed_project_facts;
}

function evaluateCase(caseId) {
  const request = buildMaterialProcurementReadinessPublicSyntheticRequest(caseId);
  const compiled = compileMaterialProcurementReadinessRules();
  return evaluateTyped(compiled, request.typed_project_facts);
}

test("public-synthetic cases deterministically cover stock, inbound, shortage, late, and unknown readiness", () => {
  for (const expected of MATERIAL_PROCUREMENT_READINESS_PUBLIC_CASES) {
    const result = evaluateCase(expected.case_id);
    const row = result.domain_result.rows[0];
    assert.equal(result.assessment.state, expected.assessment_state, expected.case_id);
    assert.equal(row.readiness_state, expected.readiness_state, expected.case_id);
    assert.equal(row.schedule_state, expected.schedule_state, expected.case_id);
    assert.equal(row.receipt_state, expected.receipt_state, expected.case_id);
    assert.equal(result.receipt.effects.erp_mutation, 0, expected.case_id);
    assert.equal(result.receipt.effects.purchase_order_mutation, 0, expected.case_id);
    assert.equal(result.receipt.effects.supplier_commitment, 0, expected.case_id);
    assert.equal(result.receipt.effects.network, 0, expected.case_id);
  }
});

test("replay is byte-stable, non-mutating, and returns deeply frozen result material", () => {
  const request = buildMaterialProcurementReadinessPublicSyntheticRequest("READY_INBOUND");
  const before = clone(request);
  const compiled = compileMaterialProcurementReadinessRules();

  const first = evaluateTyped(compiled, request.typed_project_facts);
  const second = evaluateTyped(compiled, request.typed_project_facts);

  assert.deepEqual(request, before);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.domain_result.rows[0]), true);
  assert.throws(() => {
    first.assessment.state = "ready";
  }, TypeError);
});

test("floating ERP snapshot revisions and incoherent order facts fail closed", () => {
  const compiled = compileMaterialProcurementReadinessRules();
  const floating = buildMaterialProcurementReadinessPublicSyntheticEvidenceInput("READY_INBOUND");
  floating.erp_snapshot.erp_snapshot_ref.revision_id = "latest";

  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(floating),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID,
  );

  const incoherent = buildMaterialProcurementReadinessPublicSyntheticEvidenceInput("READY_INBOUND");
  incoherent.erp_snapshot.rows[0].purchase_order_state = "not_ordered";
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(incoherent),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID,
  );
});

test("rows arrays reject symbol keys, sparse entries, and named properties with the closed facts error", () => {
  const compiled = compileMaterialProcurementReadinessRules();
  const evaluateFacts = (typedProjectFacts) => evaluateTyped(compiled, typedProjectFacts);

  const symbolKeyed = structuredClone(buildMaterialProcurementReadinessPublicSyntheticRequest("READY_INBOUND"));
  symbolKeyed.typed_project_facts.rows[Symbol("unexpected")] = "value";
  assert.throws(
    () => evaluateFacts(symbolKeyed.typed_project_facts),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID,
  );

  const sparse = structuredClone(buildMaterialProcurementReadinessPublicSyntheticRequest("READY_INBOUND"));
  const sparseRows = [];
  sparseRows[1] = sparse.typed_project_facts.rows[0];
  sparse.typed_project_facts.rows = sparseRows;
  assert.throws(
    () => evaluateFacts(sparse.typed_project_facts),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID,
  );

  const named = structuredClone(buildMaterialProcurementReadinessPublicSyntheticRequest("READY_INBOUND"));
  named.typed_project_facts.rows.unexpected = "value";
  assert.throws(
    () => evaluateFacts(named.typed_project_facts),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID,
  );
});

test("proxy-backed facts and ruleset material fail closed without invoking hostile getters", () => {
  const compiled = compileMaterialProcurementReadinessRules();
  const request = buildMaterialProcurementReadinessPublicSyntheticRequest("READY_INBOUND");
  const requestCutoffs = cutoffsFor(request.typed_project_facts);
  const evaluateFacts = (typedProjectFacts) => materialProcurementReadinessAdapter.evaluate(
    compiled.effective_rule_set,
    typedProjectFacts,
    {},
    cutoffsFor(typedProjectFacts),
  );

  let rootGets = 0;
  const rootProxy = new Proxy(request.typed_project_facts, {
    get() {
      rootGets += 1;
      throw new Error("root getter must not run");
    },
  });
  assert.throws(
    () => materialProcurementReadinessAdapter.evaluate(compiled.effective_rule_set, rootProxy, {}, requestCutoffs),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID,
  );
  assert.equal(rootGets, 0);

  const rowsProxyRequest = structuredClone(buildMaterialProcurementReadinessPublicSyntheticRequest("READY_INBOUND"));
  let rowsGets = 0;
  rowsProxyRequest.typed_project_facts.rows = new Proxy(rowsProxyRequest.typed_project_facts.rows, {
    get() {
      rowsGets += 1;
      throw new Error("rows getter must not run");
    },
  });
  assert.throws(
    () => evaluateFacts(rowsProxyRequest.typed_project_facts),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID,
  );
  assert.equal(rowsGets, 0);

  const rowProxyRequest = structuredClone(buildMaterialProcurementReadinessPublicSyntheticRequest("READY_INBOUND"));
  let rowGets = 0;
  rowProxyRequest.typed_project_facts.rows[0] = new Proxy(rowProxyRequest.typed_project_facts.rows[0], {
    get() {
      rowGets += 1;
      throw new Error("row getter must not run");
    },
  });
  assert.throws(
    () => evaluateFacts(rowProxyRequest.typed_project_facts),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID,
  );
  assert.equal(rowGets, 0);

  let rulesetGets = 0;
  const rulesetProxy = new Proxy(compiled.effective_rule_set, {
    get() {
      rulesetGets += 1;
      throw new Error("ruleset getter must not run");
    },
  });
  assert.throws(
    () => evaluateTyped({ effective_rule_set: rulesetProxy }, request.typed_project_facts),
    (error) => error?.code === MPR_ERROR_CODES.RULESET_INVALID,
  );
  assert.equal(rulesetGets, 0);

  const policyProxyRuleset = structuredClone(compiled.effective_rule_set);
  policyProxyRuleset.policy = new Proxy(policyProxyRuleset.policy, {
    get() {
      throw new Error("policy getter must not run");
    },
  });
  assert.throws(
    () => evaluateTyped({ effective_rule_set: policyProxyRuleset }, request.typed_project_facts),
    (error) => error?.code === MPR_ERROR_CODES.RULESET_INVALID,
  );

  const refProxyRuleset = structuredClone(compiled.effective_rule_set);
  refProxyRuleset.source_packet_ref = new Proxy(refProxyRuleset.source_packet_ref, {
    get() {
      throw new Error("reference getter must not run");
    },
  });
  assert.throws(
    () => evaluateTyped({ effective_rule_set: refProxyRuleset }, request.typed_project_facts),
    (error) => error?.code === MPR_ERROR_CODES.RULESET_INVALID,
  );
});

test("malformed ruleset material is always classified as a ruleset error and accepted caller material remains mutable", () => {
  const compiled = compileMaterialProcurementReadinessRules();
  const request = buildMaterialProcurementReadinessPublicSyntheticRequest("READY_INBOUND");
  const malformed = structuredClone(compiled.effective_rule_set);
  malformed.rules = [undefined];
  assert.throws(
    () => evaluateTyped({ effective_rule_set: malformed }, request.typed_project_facts),
    (error) => error?.code === MPR_ERROR_CODES.RULESET_INVALID,
  );

  const callerRuleset = structuredClone(compiled.effective_rule_set);
  const before = structuredClone(callerRuleset);
  const result = evaluateTyped({ effective_rule_set: callerRuleset }, request.typed_project_facts);
  assert.equal(Object.isFrozen(callerRuleset), false);
  assert.equal(Object.isFrozen(callerRuleset.source_packet_ref), false);
  assert.equal(Object.isFrozen(callerRuleset.ruleset_ref), false);
  assert.deepEqual(callerRuleset, before);
  assert.equal(Object.isFrozen(result.domain_result.source_packet_ref), true);
});

test("delivery-date precedence is explicit and receipt progress never becomes inventory coverage", () => {
  const compiled = compileMaterialProcurementReadinessRules();
  const promisedOnly = buildMaterialProcurementReadinessPublicSyntheticEvidenceInput("READY_INBOUND");
  const promisedRow = promisedOnly.erp_snapshot.rows[0];
  promisedRow.confirmed_receipt_date = null;
  promisedRow.planned_receipt_date = null;
  promisedRow.promised_delivery_date = "2026-10-12";
  const promisedResult = evaluateTyped(compiled, adaptMaterialProcurementProjectEvidence(promisedOnly).typed_project_facts);
  assert.equal(promisedResult.domain_result.rows[0].inbound_date_field, "promised_delivery_date");
  assert.equal(promisedResult.domain_result.rows[0].schedule_state, "on_time");

  const receiptOnly = buildMaterialProcurementReadinessPublicSyntheticEvidenceInput("LATE_ORDER");
  receiptOnly.erp_snapshot.rows[0].received_quantity = 10;
  const receiptResult = evaluateTyped(compiled, adaptMaterialProcurementProjectEvidence(receiptOnly).typed_project_facts);
  assert.equal(receiptResult.domain_result.rows[0].receipt_state, "fully_received");
  assert.equal(receiptResult.domain_result.rows[0].available_coverage_quantity, 1);
  assert.equal(receiptResult.domain_result.rows[0].readiness_state, "gap_late_order");

  const overdueUnknown = buildMaterialProcurementReadinessPublicSyntheticEvidenceInput("OVERDUE_RECEIPT");
  overdueUnknown.erp_snapshot.rows[0].received_quantity = null;
  const overdueUnknownResult = evaluateTyped(compiled, adaptMaterialProcurementProjectEvidence(overdueUnknown).typed_project_facts);
  assert.equal(overdueUnknownResult.domain_result.rows[0].schedule_state, "overdue");
  assert.equal(overdueUnknownResult.domain_result.rows[0].readiness_state, "unknown");
});

test("row output and receipt digest are stable across caller row order", () => {
  const compiled = compileMaterialProcurementReadinessRules();
  const firstRequest = buildMaterialProcurementReadinessPublicSyntheticEvidenceInput("READY_INBOUND");
  const stockRequest = buildMaterialProcurementReadinessPublicSyntheticEvidenceInput("READY_STOCK");
  firstRequest.erp_snapshot.rows.push(stockRequest.erp_snapshot.rows[0]);
  firstRequest.project_binding.material_need_bindings.push(stockRequest.project_binding.material_need_bindings[0]);
  const reversedRequest = structuredClone(firstRequest);
  reversedRequest.erp_snapshot.rows.reverse();
  reversedRequest.project_binding.material_need_bindings.reverse();

  const first = evaluateTyped(compiled, adaptMaterialProcurementProjectEvidence(firstRequest).typed_project_facts);
  const reversed = evaluateTyped(compiled, adaptMaterialProcurementProjectEvidence(reversedRequest).typed_project_facts);
  assert.deepEqual(first, reversed);
  assert.deepEqual(
    first.domain_result.rows.map((row) => row.material_need_ref),
    ["synthetic-need-ready-inbound", "synthetic-need-ready-stock"],
  );
});

test("the zero-write runner emits only deterministic JSON and leaves its caller directory unchanged", () => {
  const runner = fileURLToPath(new URL("../tools/material_procurement_readiness_runner.mjs", import.meta.url));
  const runOnce = () => {
    const runDirectory = mkdtempSync(join(tmpdir(), "mpr-zero-write-"));
    try {
      const before = readdirSync(runDirectory);
      const executed = spawnSync(process.execPath, [runner], {
        cwd: runDirectory,
        encoding: "utf8",
      });
      assert.equal(executed.status, 0, executed.stderr);
      assert.deepEqual(readdirSync(runDirectory), before);
      return executed.stdout;
    } finally {
      rmSync(runDirectory, { force: true, recursive: true });
    }
  };

  const first = runOnce();
  const second = runOnce();
  assert.equal(first, second);
  const payload = JSON.parse(first);
  assert.equal(payload.receipt.effects.filesystem_write, 0);
  assert.equal(payload.assessment.state, "ready");
});
