// Package-local Project Binding / ERP snapshot seam. This adapter accepts injected, pinned
// public-safe metadata and facts only; it performs no ERP query, file, network, RAG, or action.
import { types } from "node:util";

import { compareCodePoints } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { validateCanonicalInstant } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { isPurchaseOrderState } from "../rules/material_procurement_readiness_rules.mjs";

export const MPR_PROJECT_BINDING_SCHEMA = "soulforge.material_procurement_readiness.project_binding.v0";
export const MPR_ERP_SNAPSHOT_FACTS_SCHEMA = "soulforge.material_procurement_readiness.erp_snapshot_facts.v0";
export const MPR_TYPED_FACTS_SCHEMA_V1 = "soulforge.material_procurement_readiness.typed_project_facts.v1";
export const MPR_OBSERVATION_RECEIPT_SCHEMA = "soulforge.material_procurement_readiness.observation_receipt.v0";

export const MPR_PROJECT_EVIDENCE_ERROR_CODES = Object.freeze({
  INPUT_INVALID: "MPR_PROJECT_EVIDENCE_INPUT_INVALID",
  BINDING_INVALID: "MPR_PROJECT_BINDING_INVALID",
  SNAPSHOT_MISMATCH: "MPR_PROJECT_SNAPSHOT_MISMATCH",
  SOURCE_NOT_MEMBER: "MPR_PROJECT_SOURCE_NOT_MEMBER",
  MATERIAL_COVERAGE_INVALID: "MPR_PROJECT_MATERIAL_COVERAGE_INVALID",
  NET_OPEN_PROOF_REQUIRED: "MPR_PROJECT_NET_OPEN_PROOF_REQUIRED",
  CUTOFF_INVALID: "MPR_PROJECT_CUTOFF_INVALID",
  TYPED_FACTS_INVALID: "MPR_TYPED_FACTS_INVALID",
  FACTS_DIGEST_INVALID: "MPR_TYPED_FACTS_DIGEST_INVALID",
});

const REF_FIELDS = Object.freeze(["content_hash_alg", "content_id", "entity_id", "revision_id"]);
const ROW_FIELDS = Object.freeze([
  "available_quantity",
  "confirmed_receipt_date",
  "lead_time_days",
  "material_need_ref",
  "material_ref",
  "need_date",
  "open_purchase_quantity",
  "order_date",
  "planned_receipt_date",
  "promised_delivery_date",
  "purchase_order_state",
  "quantity_uom",
  "receipt_required",
  "received_quantity",
  "required_quantity",
]);
const BINDING_FIELDS = Object.freeze([
  "binding_revision_hash",
  "domain_engine_id",
  "erp_snapshot_ref",
  "fact_authority",
  "material_need_bindings",
  "project_id",
  "schema_version",
  "source_manifest_ref",
  "source_refs",
]);
const MATERIAL_NEED_BINDING_FIELDS = Object.freeze([
  "material_need_ref",
  "open_purchase_quantity_proof_ref",
  "source_ref",
]);
const SNAPSHOT_FIELDS = Object.freeze([
  "as_of_date",
  "erp_snapshot_ref",
  "fact_authority",
  "project_id",
  "rows",
  "schema_version",
]);
const ADAPTER_INPUT_FIELDS = Object.freeze(["cutoffs", "erp_snapshot", "project_binding"]);
const TYPED_FACTS_FIELDS = Object.freeze([
  "as_of_date",
  "erp_snapshot_ref",
  "fact_authority",
  "facts_digest",
  "known_at",
  "project_binding",
  "rows",
  "schema_version",
  "valid_at",
]);
const CUTOFF_FIELDS = Object.freeze(["known_at", "valid_at"]);

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SHA256_VALUE = /^sha256:[0-9a-f]{64}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const FLOATING_REVISION = /(?:^|[-_.:])(latest|current|head|main|master|develop|development|dev|trunk|branch|release|stable|production|prod)(?:$|[-_.:])|[*^~<>]/iu;
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const NO_OPEN_SUPPLY_STATES = new Set(["not_ordered", "draft", "closed", "cancelled"]);
const FORBIDDEN_PUBLIC_SENTINELS = Object.freeze([
  /^[A-Za-z]:[\\/]/u,
  /^\\\\[^\\]+\\/u,
  /^\/(?:etc|var|usr|home|root|tmp)(?:\/|$)/iu,
  /^file:/iu,
  /^(?:sk-|ghp_|github_pat_|xox[abprs]-|AIza)/u,
  /(?:^|[-_.:])(password|passwd|secret|credential|api[_-]?key|bearer|private[_-]?key|cookie|session|token)(?:$|[-_.:])/iu,
]);

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function assertPlainObject(value, label, code) {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, `${label} must be an ordinary non-proxy object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || PROTOTYPE_SENSITIVE_KEYS.has(key)
      || !descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(code, `${label} may not carry unsafe keys, accessors, symbols, or hidden fields`);
    }
  }
}

function copyExactFields(value, fields, label, code) {
  assertPlainObject(value, label, code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort(compareCodePoints);
  const expected = [...fields].sort(compareCodePoints);
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(code, `${label} must use its exact field set`);
  }
  const copy = {};
  for (const field of fields) copy[field] = descriptors[field].value;
  return copy;
}

function copyDenseArray(value, label, code, { min = 0, max = 256 } = {}) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < min || value.length > max) {
    fail(code, `${label} must be a bounded ordinary array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string"
    || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) {
    fail(code, `${label} may not carry named or symbol fields`);
  }
  const copy = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(code, `${label} must be dense and data-only`);
    }
    copy.push(descriptor.value);
  }
  return copy;
}

function assertDate(value, label, code, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !ISO_DATE.test(value)) fail(code, `${label} must be an ISO date${nullable ? " or null" : ""}`);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    fail(code, `${label} must be a real calendar date`);
  }
  return value;
}

function assertQuantity(value, label, code) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) fail(code, `${label} must be a non-negative safe integer or null`);
  return value;
}

function assertCanonicalInstant(value, label, code) {
  try {
    return validateCanonicalInstant(value, label);
  } catch {
    fail(code, `${label} must be a real canonical UTC instant with exact millisecond precision`);
  }
}

function assertPublicToken(value, label, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) {
    fail(code, `${label} must be a bounded token`);
  }
  if (FORBIDDEN_PUBLIC_SENTINELS.some((pattern) => pattern.test(value))) {
    fail(code, `${label} contains a forbidden path or credential sentinel`);
  }
  return value;
}

function copyRef(value, label, code) {
  const ref = copyExactFields(value, REF_FIELDS, label, code);
  if (FLOATING_REVISION.test(ref.revision_id)
    || !SHA256_CONTENT_ID.test(ref.content_id) || ref.content_hash_alg !== "sha256") {
    fail(code, `${label} must be an exact entity/revision/SHA-256 reference`);
  }
  assertPublicToken(ref.entity_id, `${label}.entity_id`, code);
  assertPublicToken(ref.revision_id, `${label}.revision_id`, code);
  return ref;
}

function refKey(ref) {
  return `${ref.entity_id}\u0000${ref.revision_id}\u0000${ref.content_id}\u0000${ref.content_hash_alg}`;
}

function sameRef(left, right) {
  return refKey(left) === refKey(right);
}

function copyReferenceArray(value, label, code) {
  const raw = copyDenseArray(value, label, code, { min: 1, max: 64 });
  const refs = raw.map((item, index) => copyRef(item, `${label}[${index}]`, code));
  refs.sort((left, right) => compareCodePoints(refKey(left), refKey(right)));
  for (let index = 1; index < refs.length; index += 1) {
    if (refKey(refs[index - 1]) === refKey(refs[index])) fail(code, `${label} must not contain duplicate references`);
  }
  return refs;
}

function copyRows(value, code) {
  const rawRows = copyDenseArray(value, "ERP snapshot rows", code, { min: 1, max: 256 });
  const seenNeedRefs = new Set();
  const rows = rawRows.map((raw, index) => {
    const row = copyExactFields(raw, ROW_FIELDS, `ERP snapshot rows[${index}]`, code);
    assertPublicToken(row.material_need_ref, "material_need_ref", code);
    assertPublicToken(row.material_ref, "material_ref", code);
    assertPublicToken(row.quantity_uom, "quantity_uom", code);
    if (seenNeedRefs.has(row.material_need_ref)) fail(code, "material_need_ref values must be unique within one snapshot");
    seenNeedRefs.add(row.material_need_ref);
    if (!isPurchaseOrderState(row.purchase_order_state) || typeof row.receipt_required !== "boolean") {
      fail(code, "purchase_order_state or receipt_required is invalid");
    }
    const openPurchaseQuantity = assertQuantity(row.open_purchase_quantity, "open_purchase_quantity", code);
    if (NO_OPEN_SUPPLY_STATES.has(row.purchase_order_state) && openPurchaseQuantity !== null && openPurchaseQuantity !== 0) {
      fail(code, "a non-open purchase-order state cannot carry open purchase quantity");
    }
    if (row.purchase_order_state === "unknown" && openPurchaseQuantity !== null) {
      fail(code, "unknown purchase-order state must preserve unknown open purchase quantity as null");
    }
    const leadTimeDays = assertQuantity(row.lead_time_days, "lead_time_days", code);
    if (leadTimeDays !== null && leadTimeDays > 3650) fail(code, "lead_time_days exceeds the candidate bound");
    return {
      material_need_ref: row.material_need_ref,
      material_ref: row.material_ref,
      quantity_uom: row.quantity_uom,
      required_quantity: assertQuantity(row.required_quantity, "required_quantity", code),
      available_quantity: assertQuantity(row.available_quantity, "available_quantity", code),
      open_purchase_quantity: openPurchaseQuantity,
      received_quantity: assertQuantity(row.received_quantity, "received_quantity", code),
      purchase_order_state: row.purchase_order_state,
      need_date: assertDate(row.need_date, "need_date", code, { nullable: true }),
      lead_time_days: leadTimeDays,
      order_date: assertDate(row.order_date, "order_date", code, { nullable: true }),
      planned_receipt_date: assertDate(row.planned_receipt_date, "planned_receipt_date", code, { nullable: true }),
      promised_delivery_date: assertDate(row.promised_delivery_date, "promised_delivery_date", code, { nullable: true }),
      confirmed_receipt_date: assertDate(row.confirmed_receipt_date, "confirmed_receipt_date", code, { nullable: true }),
      receipt_required: row.receipt_required,
    };
  });
  rows.sort((left, right) => compareCodePoints(left.material_need_ref, right.material_need_ref));
  return rows;
}

function copyBinding(value) {
  const binding = copyExactFields(value, BINDING_FIELDS, "project binding", MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID);
  if (binding.schema_version !== MPR_PROJECT_BINDING_SCHEMA
    || binding.domain_engine_id !== "material_procurement_readiness" || !SHA256_VALUE.test(binding.binding_revision_hash)
    || binding.fact_authority !== "erp_owned_read_only_snapshot") {
    fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID, "project binding identity, revision, domain, or authority is invalid");
  }
  assertPublicToken(binding.project_id, "project binding project_id", MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID);
  const sourceManifestRef = copyRef(binding.source_manifest_ref, "project binding source_manifest_ref", MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID);
  const sourceRefs = copyReferenceArray(binding.source_refs, "project binding source_refs", MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID);
  const erpSnapshotRef = copyRef(binding.erp_snapshot_ref, "project binding erp_snapshot_ref", MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID);
  const sourceKeys = new Set(sourceRefs.map(refKey));
  if (!sourceKeys.has(refKey(sourceManifestRef))) {
    fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.SOURCE_NOT_MEMBER, "source_manifest_ref is not a member of project binding source_refs");
  }
  if (!sourceKeys.has(refKey(erpSnapshotRef))) {
    fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.SOURCE_NOT_MEMBER, "erp_snapshot_ref is not a member of project binding source_refs");
  }
  const rawNeedBindings = copyDenseArray(binding.material_need_bindings, "project binding material_need_bindings", MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID, { min: 1, max: 256 });
  const seenNeedRefs = new Set();
  const materialNeedBindings = rawNeedBindings.map((raw, index) => {
    const needBinding = copyExactFields(raw, MATERIAL_NEED_BINDING_FIELDS, `project binding material_need_bindings[${index}]`, MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID);
    if (seenNeedRefs.has(needBinding.material_need_ref)) {
      fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID, "material need bindings must use unique bounded material_need_ref values");
    }
    assertPublicToken(needBinding.material_need_ref, "material need binding material_need_ref", MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID);
    seenNeedRefs.add(needBinding.material_need_ref);
    const sourceRef = copyRef(needBinding.source_ref, "material need binding source_ref", MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID);
    if (!sourceKeys.has(refKey(sourceRef))) fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.SOURCE_NOT_MEMBER, "material need source_ref is not a member of project binding source_refs");
    let proofRef = null;
    if (needBinding.open_purchase_quantity_proof_ref !== null) {
      proofRef = copyRef(needBinding.open_purchase_quantity_proof_ref, "material need binding open_purchase_quantity_proof_ref", MPR_PROJECT_EVIDENCE_ERROR_CODES.BINDING_INVALID);
      if (!sourceKeys.has(refKey(proofRef))) fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.SOURCE_NOT_MEMBER, "net-open proof ref is not a member of project binding source_refs");
    }
    return {
      material_need_ref: needBinding.material_need_ref,
      source_ref: sourceRef,
      open_purchase_quantity_proof_ref: proofRef,
    };
  });
  materialNeedBindings.sort((left, right) => compareCodePoints(left.material_need_ref, right.material_need_ref));
  return {
    schema_version: MPR_PROJECT_BINDING_SCHEMA,
    project_id: binding.project_id,
    domain_engine_id: "material_procurement_readiness",
    binding_revision_hash: binding.binding_revision_hash,
    source_manifest_ref: sourceManifestRef,
    source_refs: sourceRefs,
    erp_snapshot_ref: erpSnapshotRef,
    fact_authority: "erp_owned_read_only_snapshot",
    material_need_bindings: materialNeedBindings,
  };
}

function assertCoverage(binding, rows, code) {
  if (binding.material_need_bindings.length !== rows.length) {
    fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.MATERIAL_COVERAGE_INVALID, "project binding material coverage count does not match ERP rows");
  }
  const bindingsByNeed = new Map(binding.material_need_bindings.map((row) => [row.material_need_ref, row]));
  for (const row of rows) {
    const needBinding = bindingsByNeed.get(row.material_need_ref);
    if (!needBinding) fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.MATERIAL_COVERAGE_INVALID, "ERP row has no matching project material need binding");
    if (row.open_purchase_quantity !== null && needBinding.open_purchase_quantity_proof_ref === null) {
      fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.NET_OPEN_PROOF_REQUIRED, "non-null open_purchase_quantity requires an exact net-open proof ref for the same material need and snapshot");
    }
  }
}

function copySnapshot(value) {
  const snapshot = copyExactFields(value, SNAPSHOT_FIELDS, "ERP snapshot", MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID);
  if (snapshot.schema_version !== MPR_ERP_SNAPSHOT_FACTS_SCHEMA || snapshot.fact_authority !== "erp_owned_read_only_snapshot") {
    fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID, "ERP snapshot schema or authority is invalid");
  }
  return {
    schema_version: MPR_ERP_SNAPSHOT_FACTS_SCHEMA,
    project_id: snapshot.project_id,
    as_of_date: assertDate(snapshot.as_of_date, "ERP snapshot as_of_date", MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID),
    erp_snapshot_ref: copyRef(snapshot.erp_snapshot_ref, "ERP snapshot erp_snapshot_ref", MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID),
    fact_authority: "erp_owned_read_only_snapshot",
    rows: copyRows(snapshot.rows, MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID),
  };
}

function copyCutoffs(value, asOfDate, code) {
  const cutoffs = copyExactFields(value, CUTOFF_FIELDS, "cutoffs", code);
  const validAt = assertCanonicalInstant(cutoffs.valid_at, "cutoffs.valid_at", code);
  const knownAt = assertCanonicalInstant(cutoffs.known_at, "cutoffs.known_at", code);
  if (Date.parse(knownAt) < Date.parse(validAt)) fail(code, "cutoffs.known_at must be on or after cutoffs.valid_at");
  if (validAt.slice(0, 10) !== asOfDate) fail(code, "cutoffs.valid_at date must equal ERP snapshot as_of_date");
  return { valid_at: validAt, known_at: knownAt };
}

function stableJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort(compareCodePoints).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID, "typed facts digest material is invalid");
}

function factsDigestMaterial(typed) {
  return {
    schema_version: MPR_TYPED_FACTS_SCHEMA_V1,
    project_binding: typed.project_binding,
    erp_snapshot_ref: typed.erp_snapshot_ref,
    fact_authority: typed.fact_authority,
    as_of_date: typed.as_of_date,
    rows: typed.rows,
    valid_at: typed.valid_at,
    known_at: typed.known_at,
  };
}

function makeFactsDigest(typed) {
  return `sha256:${sha256Hex(`soulforge.material_procurement_readiness.typed_facts.v1\n${stableJson(factsDigestMaterial(typed))}`)}`;
}

function makeObservationReceipt(typed) {
  return {
    schema_version: MPR_OBSERVATION_RECEIPT_SCHEMA,
    project_binding_lineage: {
      project_id: typed.project_binding.project_id,
      domain_engine_id: typed.project_binding.domain_engine_id,
      binding_revision_hash: typed.project_binding.binding_revision_hash,
      source_manifest_ref: typed.project_binding.source_manifest_ref,
      source_refs: typed.project_binding.source_refs,
    },
    erp_snapshot_ref: typed.erp_snapshot_ref,
    facts_digest: typed.facts_digest,
    valid_at: typed.valid_at,
    known_at: typed.known_at,
    material_need_count: typed.rows.length,
    effects: {
      filesystem_write: 0,
      network: 0,
      erp_mutation: 0,
      purchase_order_mutation: 0,
      supplier_commitment: 0,
      task_creation: 0,
    },
  };
}

export function validateMaterialProcurementTypedFacts(typedFacts, requiredCutoffs = null) {
  const typed = copyExactFields(typedFacts, TYPED_FACTS_FIELDS, "typed project facts", MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID);
  if (typed.schema_version !== MPR_TYPED_FACTS_SCHEMA_V1 || typed.fact_authority !== "erp_owned_read_only_snapshot") {
    fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID, "typed facts schema or authority is invalid");
  }
  const projectBinding = copyBinding(typed.project_binding);
  const erpSnapshotRef = copyRef(typed.erp_snapshot_ref, "typed facts erp_snapshot_ref", MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID);
  if (!sameRef(projectBinding.erp_snapshot_ref, erpSnapshotRef)) {
    fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.SNAPSHOT_MISMATCH, "typed facts ERP snapshot ref does not match its project binding");
  }
  const asOfDate = assertDate(typed.as_of_date, "typed facts as_of_date", MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID);
  const cutoffs = copyCutoffs({ valid_at: typed.valid_at, known_at: typed.known_at }, asOfDate, MPR_PROJECT_EVIDENCE_ERROR_CODES.CUTOFF_INVALID);
  if (requiredCutoffs !== null) {
    const expected = copyCutoffs(requiredCutoffs, asOfDate, MPR_PROJECT_EVIDENCE_ERROR_CODES.CUTOFF_INVALID);
    if (expected.valid_at !== cutoffs.valid_at || expected.known_at !== cutoffs.known_at) {
      fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.CUTOFF_INVALID, "evaluation cutoffs must exactly match typed facts cutoffs");
    }
  }
  const rows = copyRows(typed.rows, MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID);
  assertCoverage(projectBinding, rows, MPR_PROJECT_EVIDENCE_ERROR_CODES.TYPED_FACTS_INVALID);
  if (!SHA256_VALUE.test(typed.facts_digest)) fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.FACTS_DIGEST_INVALID, "typed facts facts_digest is invalid");
  const normalized = {
    schema_version: MPR_TYPED_FACTS_SCHEMA_V1,
    project_binding: projectBinding,
    erp_snapshot_ref: erpSnapshotRef,
    fact_authority: "erp_owned_read_only_snapshot",
    as_of_date: asOfDate,
    rows,
    valid_at: cutoffs.valid_at,
    known_at: cutoffs.known_at,
  };
  const expectedDigest = makeFactsDigest(normalized);
  if (typed.facts_digest !== expectedDigest) fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.FACTS_DIGEST_INVALID, "typed facts digest does not bind the supplied facts and lineage");
  return freezeDeep({ ...normalized, facts_digest: expectedDigest });
}

export function adaptMaterialProcurementProjectEvidence(input) {
  const material = copyExactFields(input, ADAPTER_INPUT_FIELDS, "project evidence adapter input", MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID);
  const projectBinding = copyBinding(material.project_binding);
  const snapshot = copySnapshot(material.erp_snapshot);
  if (snapshot.project_id !== projectBinding.project_id) {
    fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.SNAPSHOT_MISMATCH, "injected ERP snapshot project_id does not match its project binding");
  }
  assertPublicToken(snapshot.project_id, "ERP snapshot project_id", MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID);
  if (!sameRef(projectBinding.erp_snapshot_ref, snapshot.erp_snapshot_ref)) {
    fail(MPR_PROJECT_EVIDENCE_ERROR_CODES.SNAPSHOT_MISMATCH, "project binding ERP snapshot ref does not match injected ERP snapshot facts");
  }
  const cutoffs = copyCutoffs(material.cutoffs, snapshot.as_of_date, MPR_PROJECT_EVIDENCE_ERROR_CODES.CUTOFF_INVALID);
  assertCoverage(projectBinding, snapshot.rows, MPR_PROJECT_EVIDENCE_ERROR_CODES.INPUT_INVALID);
  const typedMaterial = {
    schema_version: MPR_TYPED_FACTS_SCHEMA_V1,
    project_binding: projectBinding,
    erp_snapshot_ref: snapshot.erp_snapshot_ref,
    fact_authority: "erp_owned_read_only_snapshot",
    as_of_date: snapshot.as_of_date,
    rows: snapshot.rows,
    valid_at: cutoffs.valid_at,
    known_at: cutoffs.known_at,
  };
  const typedProjectFacts = validateMaterialProcurementTypedFacts({
    ...typedMaterial,
    facts_digest: makeFactsDigest(typedMaterial),
  }, cutoffs);
  const observationReceipt = freezeDeep(makeObservationReceipt(typedProjectFacts));
  return freezeDeep({ typed_project_facts: typedProjectFacts, observation_receipt: observationReceipt });
}
