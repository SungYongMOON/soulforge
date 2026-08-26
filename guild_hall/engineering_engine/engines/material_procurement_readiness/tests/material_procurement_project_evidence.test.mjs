import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptMaterialProcurementProjectEvidence,
  MPR_PROJECT_EVIDENCE_ERROR_CODES,
} from "../evaluator/material_procurement_project_evidence_adapter.mjs";
import {
  materialProcurementReadinessAdapter,
  MPR_ERROR_CODES,
} from "../evaluator/material_procurement_readiness_evaluator_adapter.mjs";
import { compileMaterialProcurementReadinessRules } from "../compiler/material_procurement_readiness_compiler_adapter.mjs";
import { buildMaterialProcurementReadinessPublicSyntheticEvidenceInput } from "../fixtures/material_procurement_readiness_public_synthetic.mjs";
import { MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF } from "../rules/material_procurement_readiness_rules.mjs";

function buildProjectEvidenceInput({ proof = true } = {}) {
  return buildMaterialProcurementReadinessPublicSyntheticEvidenceInput("READY_INBOUND", { proof });
}

test("project evidence adapter admits an exact binding and emits frozen typed facts plus a payload-free receipt", () => {
  const result = adaptMaterialProcurementProjectEvidence(buildProjectEvidenceInput());

  assert.equal(result.typed_project_facts.schema_version, "soulforge.material_procurement_readiness.typed_project_facts.v1");
  assert.equal(result.typed_project_facts.project_binding.project_id, "public-synthetic-e03-project");
  assert.match(result.typed_project_facts.facts_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(result.typed_project_facts.valid_at, "2026-10-10T00:00:00.000Z");
  assert.equal(result.observation_receipt.effects.erp_mutation, 0);
  assert.equal(Object.isFrozen(result.typed_project_facts), true);
  assert.equal(Object.isFrozen(result.observation_receipt), true);
  assert.equal(Object.hasOwn(result.observation_receipt, "rows"), false);
});

test("a non-null open purchase quantity needs an exact net-open proof for the same material need", () => {
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(buildProjectEvidenceInput({ proof: false })),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.NET_OPEN_PROOF_REQUIRED,
  );
});

test("project evidence fails closed for cross-project, source, coverage, revision, and cutoff violations", () => {
  const crossProject = buildProjectEvidenceInput();
  crossProject.erp_snapshot.project_id = "other-public-synthetic-project";
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(crossProject),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.SNAPSHOT_MISMATCH,
  );

  const missingSource = buildProjectEvidenceInput();
  missingSource.project_binding.material_need_bindings[0].source_ref = {
    entity_id: "unbound-source",
    revision_id: "v1",
    content_id: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    content_hash_alg: "sha256",
  };
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(missingSource),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.SOURCE_NOT_MEMBER,
  );

  const missingManifestMembership = buildProjectEvidenceInput();
  missingManifestMembership.project_binding.source_refs = missingManifestMembership.project_binding.source_refs
    .filter((sourceRef) => sourceRef.entity_id !== missingManifestMembership.project_binding.source_manifest_ref.entity_id);
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(missingManifestMembership),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.SOURCE_NOT_MEMBER,
  );

  const missingSnapshotMembership = buildProjectEvidenceInput();
  missingSnapshotMembership.project_binding.source_refs = missingSnapshotMembership.project_binding.source_refs
    .filter((sourceRef) => sourceRef.entity_id !== missingSnapshotMembership.project_binding.erp_snapshot_ref.entity_id);
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(missingSnapshotMembership),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.SOURCE_NOT_MEMBER,
  );

  const duplicate = buildProjectEvidenceInput();
  duplicate.project_binding.material_need_bindings.push(structuredClone(duplicate.project_binding.material_need_bindings[0]));
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(duplicate),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID,
  );

  const coverage = buildProjectEvidenceInput();
  coverage.project_binding.material_need_bindings[0].material_need_ref = "different-need";
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(coverage),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.MATERIAL_COVERAGE_INVALID,
  );

  const floating = buildProjectEvidenceInput();
  floating.project_binding.binding_revision_hash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  floating.project_binding.erp_snapshot_ref.revision_id = "latest";
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(floating),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID,
  );

  const cutoff = buildProjectEvidenceInput();
  cutoff.cutoffs.known_at = "2026-10-09T00:00:00.000Z";
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(cutoff),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.CUTOFF_INVALID,
  );

  const digestTampered = structuredClone(adaptMaterialProcurementProjectEvidence(buildProjectEvidenceInput()).typed_project_facts);
  digestTampered.rows[0].available_quantity = 3;
  const compiled = compileMaterialProcurementReadinessRules();
  assert.throws(
    () => materialProcurementReadinessAdapter.evaluate(
      compiled.effective_rule_set,
      digestTampered,
      {},
      { valid_at: digestTampered.valid_at, known_at: digestTampered.known_at },
    ),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.FACTS_DIGEST_INVALID,
  );
});

test("project evidence rejects public-unsafe sentinels and proxy/accessor traps without caller mutation", () => {
  const unsafeProject = buildProjectEvidenceInput();
  unsafeProject.project_binding.project_id = "password:abc";
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(unsafeProject),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID,
  );

  const unsafeRef = buildProjectEvidenceInput();
  unsafeRef.project_binding.source_refs[0].entity_id = "file:C:/private/input";
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(unsafeRef),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID,
  );

  const unsafeMaterial = buildProjectEvidenceInput();
  unsafeMaterial.erp_snapshot.rows[0].material_ref = "bearer-token";
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(unsafeMaterial),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID,
  );

  const credentialProbes = [
    ["project_id", "sk-1234567890abcdef", "binding"],
    ["source_ref.entity_id", "ghp_1234567890abcdef", "binding"],
    ["source_ref.revision_id", "github_pat_1234567890abcdef", "binding"],
    ["material_need_ref", "xoxb-1234567890abcdef", "snapshot"],
    ["material_ref", "xoxa-1234567890abcdef", "snapshot"],
    ["quantity_uom", "AIza1234567890abcdef", "snapshot"],
  ];
  for (const [field, value, plane] of credentialProbes) {
    const input = buildProjectEvidenceInput();
    if (plane === "binding" && field === "project_id") input.project_binding.project_id = value;
    if (plane === "binding" && field === "source_ref.entity_id") input.project_binding.source_refs[0].entity_id = value;
    if (plane === "binding" && field === "source_ref.revision_id") input.project_binding.source_refs[0].revision_id = value;
    if (plane === "snapshot") input.erp_snapshot.rows[0][field] = value;
    assert.throws(
      () => adaptMaterialProcurementProjectEvidence(input),
      (error) => error?.code === (plane === "binding"
        ? MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID
        : MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID),
      `${field}=${value}`,
    );
  }

  const proxied = buildProjectEvidenceInput();
  let proxyGets = 0;
  proxied.project_binding = new Proxy(proxied.project_binding, {
    get() {
      proxyGets += 1;
      throw new Error("project binding getter must not run");
    },
  });
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(proxied),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID,
  );
  assert.equal(proxyGets, 0);

  const accessor = buildProjectEvidenceInput();
  let accessorGets = 0;
  Object.defineProperty(accessor.project_binding, "project_id", {
    enumerable: true,
    configurable: true,
    get() {
      accessorGets += 1;
      throw new Error("project binding accessor must not run");
    },
  });
  assert.throws(
    () => adaptMaterialProcurementProjectEvidence(accessor),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID,
  );
  assert.equal(accessorGets, 0);

  const immutable = buildProjectEvidenceInput();
  const before = structuredClone(immutable);
  const result = adaptMaterialProcurementProjectEvidence(immutable);
  assert.deepEqual(immutable, before);
  assert.equal(Object.isFrozen(immutable), false);
  assert.equal(Object.isFrozen(immutable.project_binding), false);
  assert.equal(Object.isFrozen(immutable.erp_snapshot.rows[0]), false);
  assert.equal(Object.isFrozen(result.typed_project_facts), true);
});

test("cutoffs require exact canonical UTC millisecond instants", () => {
  for (const invalid of [
    "2026-10-10T00:00:00Z",
    "2026-10-10T00:00:00.1Z",
    "2026-10-10T00:00:00.12Z",
    "2026-10-10T00:00:00.0000Z",
    "2026-11-31T01:00:00.000Z",
    "2026-12-01T24:00:00.000Z",
    "2026-12-01T01:60:00.000Z",
    "2026-12-01T01:00:61.000Z",
    "2026-12-01T01:00:00.000+00:00",
  ]) {
    const input = buildProjectEvidenceInput();
    input.cutoffs.valid_at = invalid;
    assert.throws(
      () => adaptMaterialProcurementProjectEvidence(input),
      (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.CUTOFF_INVALID,
      `evidence adapter cutoff: ${invalid}`,
    );

    const compiled = compileMaterialProcurementReadinessRules();
    const validAdapted = adaptMaterialProcurementProjectEvidence(buildProjectEvidenceInput());
    assert.throws(
      () => materialProcurementReadinessAdapter.evaluate(
        compiled.effective_rule_set,
        validAdapted.typed_project_facts,
        {},
        { valid_at: invalid, known_at: invalid },
      ),
      (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.CUTOFF_INVALID,
      `evaluator seam cutoff: ${invalid}`,
    );
  }

  const fractional = buildProjectEvidenceInput();
  fractional.cutoffs.valid_at = "2026-10-10T00:00:00.123Z";
  fractional.cutoffs.known_at = "2026-10-10T00:00:00.123Z";
  const adapted = adaptMaterialProcurementProjectEvidence(fractional);
  assert.equal(adapted.typed_project_facts.valid_at, "2026-10-10T00:00:00.123Z");
});

test("evaluator ingress requires adapted facts, matching cutoffs, and an empty authority request", () => {
  const adapted = adaptMaterialProcurementProjectEvidence(buildProjectEvidenceInput());
  const compiled = compileMaterialProcurementReadinessRules();
  const cutoffs = { valid_at: "2026-10-10T00:00:00.000Z", known_at: "2026-10-10T00:00:00.000Z" };
  const result = materialProcurementReadinessAdapter.evaluate(
    compiled.effective_rule_set,
    adapted.typed_project_facts,
    {},
    cutoffs,
  );

  assert.equal(result.assessment.state, "ready");
  assert.equal(result.domain_result.project_binding_lineage.project_id, "public-synthetic-e03-project");
  assert.equal(result.receipt.facts_digest, adapted.typed_project_facts.facts_digest);
  assert.throws(
    () => materialProcurementReadinessAdapter.evaluate(
      compiled.effective_rule_set,
      adapted.typed_project_facts,
      { purchase_order_action: "create" },
      cutoffs,
    ),
    (error) => error?.code === MPR_ERROR_CODES.AUTHORITY_REFUSED,
  );
  assert.throws(
    () => materialProcurementReadinessAdapter.evaluate(
      compiled.effective_rule_set,
      adapted.typed_project_facts,
      {},
      { valid_at: "2026-10-11T00:00:00.000Z", known_at: "2026-10-11T00:00:00.000Z" },
    ),
    (error) => error?.code === MPR_PROJECT_EVIDENCE_ERROR_CODES.CUTOFF_INVALID,
  );
});

test("decision basis traces only fact fields consumed by each readiness branch", () => {
  const compiled = compileMaterialProcurementReadinessRules();
  const evaluateCase = (caseId, mutate = null) => {
    const input = buildMaterialProcurementReadinessPublicSyntheticEvidenceInput(caseId);
    if (mutate) mutate(input);
    const adapted = adaptMaterialProcurementProjectEvidence(input);
    return materialProcurementReadinessAdapter.evaluate(
      compiled.effective_rule_set,
      adapted.typed_project_facts,
      {},
      { valid_at: adapted.typed_project_facts.valid_at, known_at: adapted.typed_project_facts.known_at },
    );
  };

  const rootUnknown = evaluateCase("READY_INBOUND", (input) => { input.erp_snapshot.rows[0].available_quantity = null; }).domain_result.rows[0].decision_basis;
  const poUnknown = evaluateCase("UNKNOWN").domain_result.rows[0].decision_basis;
  const shortage = evaluateCase("SHORTAGE").domain_result.rows[0].decision_basis;
  const stockReady = evaluateCase("READY_STOCK").domain_result.rows[0].decision_basis;
  const unknown = evaluateCase("UNKNOWN").domain_result.rows[0].decision_basis;
  const overdue = evaluateCase("OVERDUE_RECEIPT").domain_result.rows[0].decision_basis;
  const lateDelivery = evaluateCase("LATE_DELIVERY").domain_result.rows[0].decision_basis;
  const notApplicable = evaluateCase("READY_STOCK", (input) => { input.erp_snapshot.rows[0].required_quantity = 0; }).domain_result.rows[0].decision_basis;

  assert.deepEqual(rootUnknown.fact_fields_used, ["available_quantity", "receipt_required", "received_quantity", "required_quantity"]);
  assert.deepEqual(rootUnknown.unknown_or_missing_fact_fields, ["available_quantity"]);
  assert.deepEqual(poUnknown.fact_fields_used, ["available_quantity", "lead_time_days", "need_date", "purchase_order_state", "receipt_required", "received_quantity", "required_quantity"]);
  assert.deepEqual(poUnknown.needed_next, ["purchase_order_state"]);
  assert.deepEqual(shortage.rule_ids, ["MPR-LEAD-TIME", "MPR-PURCHASE-ORDER", "MPR-RECEIPT", "MPR-SHORTAGE"]);
  assert.deepEqual(shortage.fact_fields_used, ["available_quantity", "lead_time_days", "need_date", "open_purchase_quantity", "order_date", "purchase_order_state", "receipt_required", "received_quantity", "required_quantity"]);
  assert.deepEqual(stockReady.rule_ids, ["MPR-RECEIPT", "MPR-SHORTAGE"]);
  assert.deepEqual(stockReady.fact_fields_used, ["available_quantity", "need_date", "receipt_required", "received_quantity", "required_quantity"]);
  assert.deepEqual(notApplicable.rule_ids, ["MPR-RECEIPT", "MPR-SHORTAGE"]);
  assert.deepEqual(notApplicable.fact_fields_used, ["available_quantity", "need_date", "receipt_required", "received_quantity", "required_quantity"]);
  assert.equal(unknown.unknown_or_missing_fact_fields.includes("open_purchase_quantity"), false);
  assert.ok(unknown.unknown_or_missing_fact_fields.includes("purchase_order_state"));
  assert.ok(overdue.rule_ids.includes("MPR-DELIVERY-DATE"));
  assert.ok(overdue.rule_ids.includes("MPR-RECEIPT"));
  assert.deepEqual(overdue.fact_fields_used, ["available_quantity", "confirmed_receipt_date", "lead_time_days", "need_date", "open_purchase_quantity", "order_date", "purchase_order_state", "receipt_required", "received_quantity", "required_quantity"]);
  assert.ok(lateDelivery.rule_ids.includes("MPR-DELIVERY-DATE"));
  assert.deepEqual(lateDelivery.fact_fields_used, ["available_quantity", "confirmed_receipt_date", "lead_time_days", "need_date", "open_purchase_quantity", "order_date", "purchase_order_state", "receipt_required", "received_quantity", "required_quantity"]);
  assert.deepEqual(overdue.source_packet_ref, MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF);
  assert.equal(overdue.interpretation, "soulforge_candidate_interpretation_not_source_authored_rule");
  assert.equal(Object.hasOwn(overdue, "source_refs"), false);
  assert.ok(overdue.package_source_refs.length > 0);
  assert.ok(overdue.project_evidence_refs.material_need_source_ref);
  assert.equal(Object.isFrozen(overdue), true);
  assert.equal(JSON.stringify(evaluateCase("OVERDUE_RECEIPT").domain_result.rows[0].decision_basis), JSON.stringify(overdue));
});
