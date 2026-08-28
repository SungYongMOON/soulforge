import types from "node:util/types";

import { canonicalise, compareCodePoints, isCanonicalInstant } from "../../../core/validators/canonical.mjs";
import {
  arrayOrderRules as coreArrayOrderRules,
  COMPILATION_TRACE_SCHEMA_VERSION,
  EFFECTIVE_RULE_SET_SCHEMA_VERSION,
  withoutNulls,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";
import {
  ALTERNATE_STATUSES,
  BOM_SCR_DOMAIN_ENGINE_ID,
  BOM_SCR_SNAPSHOT_KIND,
  CONTINUITY_STATUSES,
  COUNTERFEIT_CONTROL_STATUSES,
  LIFECYCLE_STATUSES,
  OBSOLESCENCE_SIGNALS,
  RISK_DIMENSIONS,
  SOURCE_APPLICABILITY_STATUSES,
  THRESHOLD_METRICS,
} from "../vocabulary/bom_supply_chain_risk_vocabulary.mjs";
import {
  BOM_SCR_RULES,
  BOM_SCR_RULESET_REF,
  BOM_SCR_RULESET_SCHEMA_VERSION,
  BOM_SCR_SOURCE_PACKET_REF,
  deriveBomSupplyChainRiskRulesetRef,
} from "../rules/bom_supply_chain_risk_rules.mjs";

export const BOM_SCR_ASSESSMENT_SCHEMA_VERSION = "soulforge.bom_supply_chain_risk.assessment.v0";
export const BOM_SCR_DOMAIN_RESULT_SCHEMA_VERSION = "soulforge.bom_supply_chain_risk.domain_result.v0";
export const BOM_SCR_RECEIPT_SCHEMA_VERSION = "soulforge.bom_supply_chain_risk.receipt.v0";

export const BOM_SCR_EVALUATOR_ERROR_CODES = Object.freeze({
  INPUT_INVALID: "BOM_SCR_INPUT_INVALID",
  PROJECT_FACTS_REQUIRED: "BOM_SCR_PROJECT_FACTS_REQUIRED",
  DOMAIN_MISMATCH: "BOM_SCR_DOMAIN_MISMATCH",
  EFFECTIVE_RULESET_INVALID: "BOM_SCR_EFFECTIVE_RULESET_INVALID",
  EFFECTIVE_RULESET_UNSUPPORTED: "BOM_SCR_EFFECTIVE_RULESET_UNSUPPORTED",
  TYPED_FACTS_DIGEST_MISMATCH: "BOM_SCR_TYPED_FACTS_DIGEST_MISMATCH",
  DERIVED_RULESET_INTEGRITY: "BOM_SCR_DERIVED_RULESET_INTEGRITY",
  AUTHORITY_INVALID: "BOM_SCR_AUTHORITY_INVALID",
  CUTOFFS_INVALID: "BOM_SCR_CUTOFFS_INVALID",
  APPLICABILITY_EVIDENCE_INVALID: "BOM_SCR_APPLICABILITY_EVIDENCE_INVALID",
  ASSEMBLY_INTEGRITY: "BOM_SCR_ASSEMBLY_INTEGRITY",
});

const TYPED_FACTS_SCHEMA_VERSION = "soulforge.typed_project_facts.v0";
const OPAQUE_REF_REGEX = /^[a-z][a-z0-9_-]{0,48}:[A-Za-z0-9._-]{1,128}$/u;
const ITEM_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const BINDING_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_PLAIN_DATA_NODES = 50000;
const MAX_PLAIN_ARRAY_LENGTH = 10000;
const MAX_PLAIN_OBJECT_KEYS = 128;
const PUBLIC_SAFE_REFERENCE_FORBIDDEN = Object.freeze([
  /^[A-Za-z]:[\\/]/u,
  /^\\\\[^\\]+\\[^\\]+/u,
  /^\/(?:etc|var|usr|home|root|tmp|workspace|workspaces|users|private|data|opt|srv|mnt|media)(?:\/|$)/iu,
  /^file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /(?:secret|password|passwd|bearer|token|credential|api[_-]?key|access[_-]?token|refresh[_-]?token)/iu,
]);
const CONDITIONAL_SOURCE_IDS = new Set([
  "S2-DFARS-252.246-7007",
  "S3-DFARS-252.246-7008",
]);
const DFARS_7007_GATES = Object.freeze([
  "clause_incorporation",
  "cost_accounting_standards_applicability",
]);
const APPLICABILITY_EVIDENCE_CLASS = "project_typed_fact";
const APPLICABILITY_BASIS_PATTERNS = Object.freeze({
  "S2-DFARS-252.246-7007\u0000clause_incorporation": /^basis:s2_clause-[A-Za-z0-9._-]{1,96}$/u,
  "S2-DFARS-252.246-7007\u0000cost_accounting_standards_applicability": /^basis:s2_cas-[A-Za-z0-9._-]{1,96}$/u,
  "S3-DFARS-252.246-7008\u0000clause_incorporation": /^basis:s3_clause-[A-Za-z0-9._-]{1,96}$/u,
});
const CORE_PROFILE_TRACE_FIELDS = Object.freeze([
  "applied_operations_count",
  "domain_engine_id",
  "extends_or_base_pin",
  "operation_digest",
  "order",
  "profile_id",
  "profile_kind",
  "revision_or_hash",
  "source_refs",
]);
const EFFECTS = Object.freeze({
  filesystem_writes: 0,
  network_requests: 0,
  model_calls: 0,
  procurement_actions: 0,
  erp_writes: 0,
  authority_actions: 0,
});

const ITEM_REQUIRED_FIELDS = Object.freeze([
  "alternate_status",
  "conflict_dimensions",
  "continuity_status",
  "counterfeit_control_status",
  "criticality",
  "item_id",
  "lifecycle_status",
  "obsolescence_signal",
]);

const ITEM_OPTIONAL_FIELDS = Object.freeze([
  "alternate_evidence_ref",
  "alternate_not_required_basis_ref",
  "approved_source_count",
  "counterfeit_evidence_ref",
  "continuity_evidence_ref",
  "geography_count",
  "geography_evidence_ref",
  "lead_time_days",
  "lead_time_evidence_ref",
  "lifecycle_evidence_ref",
  "obsolescence_evidence_ref",
  "supplier_count",
  "supplier_evidence_ref",
]);

const ITEM_ALLOWED_FIELDS = new Set([...ITEM_REQUIRED_FIELDS, ...ITEM_OPTIONAL_FIELDS]);

const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertPlainData(value, code, label, depth = 0, ancestors = new Set()) {
  if (depth > 16) fail(code, `${label} exceeds the maximum nesting depth`);
  if (value === null || typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    fail(code, `${label} must contain JSON values only and cannot contain null`);
  }
  if (typeof value === "string") {
    if (value.length > 1024 || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
      fail(code, `${label} contains an invalid string`);
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail(code, `${label} must be a safe integer when numeric`);
    return;
  }
  if (typeof value === "boolean") return;
  if (typeof value !== "object" || (types && types.isProxy(value)) || ancestors.has(value)) {
    fail(code, `${label} must be plain, non-cyclic JSON data`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) fail(code, `${label} must use the standard Array prototype`);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) {
          fail(code, `${label} contains a non-index array key`);
        }
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
          fail(code, `${label} contains an accessor-backed or sparse entry`);
        }
        assertPlainData(descriptor.value, code, `${label}[${index}]`, depth + 1, ancestors);
      }
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) fail(code, `${label} must use Object.prototype`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype") {
        fail(code, `${label} contains a prohibited key`);
      }
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
        fail(code, `${label} contains an accessor-backed or hidden value`);
      }
      assertPlainData(descriptor.value, code, `${label}.${key}`, depth + 1, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function snapshotPlainData(value, code, label) {
  const state = { nodes: 0 };
  const copy = (current, currentLabel, depth = 0, ancestors = new Set()) => {
    state.nodes += 1;
    if (state.nodes > MAX_PLAIN_DATA_NODES) fail(code, `${label} exceeds the aggregate plain-data budget`);
    if (depth > 16) fail(code, `${currentLabel} exceeds the maximum nesting depth`);
    if (current === null) return null;
    if (typeof current === "undefined" || typeof current === "function"
        || typeof current === "symbol" || typeof current === "bigint") {
      fail(code, `${currentLabel} must contain JSON values only`);
    }
    if (typeof current === "string") {
      if (current.length > 1024 || current.normalize("NFC") !== current || /[\u0000-\u001f\u007f]/u.test(current)) {
        fail(code, `${currentLabel} contains an invalid string`);
      }
      return current;
    }
    if (typeof current === "number") {
      if (!Number.isSafeInteger(current)) fail(code, `${currentLabel} must be a safe integer when numeric`);
      return current;
    }
    if (typeof current === "boolean") return current;
    if (typeof current !== "object" || (types && types.isProxy(current)) || ancestors.has(current)) {
      fail(code, `${currentLabel} must be plain, non-cyclic JSON data`);
    }
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype || current.length > MAX_PLAIN_ARRAY_LENGTH) {
          fail(code, `${currentLabel} must be a bounded standard Array`);
        }
        const descriptors = Object.getOwnPropertyDescriptors(current);
        for (const key of Reflect.ownKeys(current)) {
          if (typeof key === "symbol" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))) {
            fail(code, `${currentLabel} contains a non-index array key`);
          }
        }
        const out = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
            fail(code, `${currentLabel} contains an accessor-backed or sparse entry`);
          }
          out.push(copy(descriptor.value, `${currentLabel}[${index}]`, depth + 1, ancestors));
        }
        return Object.freeze(out);
      }
      if (Object.getPrototypeOf(current) !== Object.prototype) fail(code, `${currentLabel} must use Object.prototype`);
      const keys = Reflect.ownKeys(current);
      if (keys.length > MAX_PLAIN_OBJECT_KEYS) fail(code, `${currentLabel} exceeds the object-key budget`);
      const descriptors = Object.getOwnPropertyDescriptors(current);
      const out = {};
      for (const key of keys) {
        if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype") {
          fail(code, `${currentLabel} contains a prohibited key`);
        }
        const descriptor = descriptors[key];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
          fail(code, `${currentLabel} contains an accessor-backed or hidden value`);
        }
        out[key] = copy(descriptor.value, `${currentLabel}.${key}`, depth + 1, ancestors);
      }
      return Object.freeze(out);
    } finally {
      ancestors.delete(current);
    }
  };
  return copy(value, label);
}

function assertRecord(value, code, label) {
  assertPlainData(value, code, label);
  if (Array.isArray(value)) fail(code, `${label} must be an object`);
}

function assertExactKeys(value, required, allowed, code, label) {
  assertRecord(value, code, label);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(code, `${label} is missing required field ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(code, `${label} contains unsupported field ${key}`);
  }
}

function assertExactRecordKeys(value, required, allowed, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, `${label} must be an object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype"
        || !descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(code, `${label} must contain only enumerable own data properties`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(code, `${label} is missing required field ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(code, `${label} contains unsupported field ${key}`);
  }
}

function assertEnum(value, allowed, code, label) {
  if (!allowed.includes(value)) fail(code, `${label} is outside the closed vocabulary`);
  return value;
}

function assertPublicSafeReference(value, code, label) {
  if (typeof value !== "string" || PUBLIC_SAFE_REFERENCE_FORBIDDEN.some((pattern) => pattern.test(value))) {
    fail(code, `${label} must be a public-safe opaque value`);
  }
  return value;
}

function assertOpaqueRef(value, code, label) {
  if (typeof value !== "string" || !OPAQUE_REF_REGEX.test(value)) {
    fail(code, `${label} must be a bounded opaque reference, not a path, URL, or source body`);
  }
  assertPublicSafeReference(value, code, label);
  return value;
}

function assertOptionalOpaqueRef(value, key, code, label) {
  if (!Object.hasOwn(value, key)) return undefined;
  return assertOpaqueRef(value[key], code, `${label}.${key}`);
}

function assertOptionalCount(value, key, code, label) {
  if (!Object.hasOwn(value, key)) return undefined;
  if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 1000000000) {
    fail(code, `${label}.${key} must be an integer from 0 through 1000000000`);
  }
  return value[key];
}

function normaliseItem(raw, index) {
  const label = `bom_items[${index}]`;
  assertExactKeys(raw, ITEM_REQUIRED_FIELDS, [...ITEM_ALLOWED_FIELDS], BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, label);
  if (typeof raw.item_id !== "string" || !ITEM_ID_REGEX.test(raw.item_id)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.item_id must be a bounded opaque identity`);
  }
  assertPublicSafeReference(raw.item_id, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.item_id`);
  assertEnum(raw.criticality, ["low", "medium", "high", "unknown"], BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.criticality`);
  assertEnum(raw.lifecycle_status, LIFECYCLE_STATUSES, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.lifecycle_status`);
  assertEnum(raw.obsolescence_signal, OBSOLESCENCE_SIGNALS, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.obsolescence_signal`);
  assertEnum(raw.alternate_status, ALTERNATE_STATUSES, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.alternate_status`);
  assertEnum(raw.counterfeit_control_status, COUNTERFEIT_CONTROL_STATUSES, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.counterfeit_control_status`);
  assertEnum(raw.continuity_status, CONTINUITY_STATUSES, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.continuity_status`);
  if (!Array.isArray(raw.conflict_dimensions)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.conflict_dimensions must be an array`);
  }
  const conflictDimensions = [...raw.conflict_dimensions].map((dimension) => assertEnum(
    dimension,
    RISK_DIMENSIONS,
    BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID,
    `${label}.conflict_dimensions`,
  )).sort(compareCodePoints);
  if (new Set(conflictDimensions).size !== conflictDimensions.length) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `${label}.conflict_dimensions must not contain duplicates`);
  }
  const item = {
    item_id: raw.item_id,
    criticality: raw.criticality,
    lifecycle_status: raw.lifecycle_status,
    obsolescence_signal: raw.obsolescence_signal,
    alternate_status: raw.alternate_status,
    counterfeit_control_status: raw.counterfeit_control_status,
    continuity_status: raw.continuity_status,
    conflict_dimensions: conflictDimensions,
  };
  for (const field of ["lead_time_days", "approved_source_count", "supplier_count", "geography_count"]) {
    const count = assertOptionalCount(raw, field, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, label);
    if (count !== undefined) item[field] = count;
  }
  for (const field of ITEM_OPTIONAL_FIELDS.filter((field) => field.endsWith("_ref"))) {
    const ref = assertOptionalOpaqueRef(raw, field, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, label);
    if (ref !== undefined) item[field] = ref;
  }
  return Object.freeze(item);
}

function normaliseApplicabilityEvidence(raw) {
  if (raw === undefined) return Object.freeze([]);
  if (!Array.isArray(raw)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, "applicability_evidence must be an array");
  }
  const seenBasisRefs = new Set();
  const seenSourceGates = new Set();
  return Object.freeze(raw.map((entry, index) => {
    const label = `applicability_evidence[${index}]`;
    assertExactKeys(
      entry,
      ["basis_ref", "source_id", "gate", "evidence_class"],
      ["basis_ref", "source_id", "gate", "evidence_class"],
      BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID,
      label,
    );
    const basis_ref = assertOpaqueRef(entry.basis_ref, BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, `${label}.basis_ref`);
    if (!CONDITIONAL_SOURCE_IDS.has(entry.source_id)) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, `${label}.source_id must be a conditional source`);
    }
    const allowedGates = entry.source_id === "S2-DFARS-252.246-7007"
      ? DFARS_7007_GATES
      : ["clause_incorporation"];
    if (!allowedGates.includes(entry.gate) || entry.evidence_class !== APPLICABILITY_EVIDENCE_CLASS) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, `${label} has an unsupported source/gate/evidence class`);
    }
    const sourceGate = `${entry.source_id}\u0000${entry.gate}`;
    if (seenBasisRefs.has(basis_ref) || seenSourceGates.has(sourceGate)) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, "applicability evidence basis refs and source/gate slots must be unique");
    }
    seenBasisRefs.add(basis_ref);
    seenSourceGates.add(sourceGate);
    return Object.freeze({ basis_ref, source_id: entry.source_id, gate: entry.gate, evidence_class: entry.evidence_class });
  }));
}

function requireApplicabilityEvidence(basis_ref, source_id, gate, members, consumed) {
  const pattern = APPLICABILITY_BASIS_PATTERNS[`${source_id}\u0000${gate}`];
  if (!pattern || !pattern.test(basis_ref)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, "applicability basis_ref must use the closed source/gate-scoped opaque token shape");
  }
  const member = members.find((entry) => entry.basis_ref === basis_ref);
  if (!member || member.source_id !== source_id || member.gate !== gate || member.evidence_class !== APPLICABILITY_EVIDENCE_CLASS) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, "applicability basis_ref does not resolve to a matching admitted evidence member");
  }
  consumed.add(basis_ref);
  return basis_ref;
}

function normaliseDfars7007Gate(entry, gate, members, consumed) {
  assertRecord(entry, BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, `source_applicability.S2-DFARS-252.246-7007.${gate}`);
  const status = assertEnum(
    entry.status,
    ["affirmative", "negative", "unknown"],
    BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID,
    `source_applicability.S2-DFARS-252.246-7007.${gate}.status`,
  );
  const expectedKeys = status === "affirmative" ? ["status", "basis_ref"] : ["status"];
  assertExactKeys(
    entry,
    expectedKeys,
    expectedKeys,
    BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID,
    `source_applicability.S2-DFARS-252.246-7007.${gate}`,
  );
  if (status !== "affirmative") return Object.freeze({ status });
  const basis_ref = assertOpaqueRef(entry.basis_ref, BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, `source_applicability.S2-DFARS-252.246-7007.${gate}.basis_ref`);
  return Object.freeze({
    status,
    basis_ref: requireApplicabilityEvidence(basis_ref, "S2-DFARS-252.246-7007", gate, members, consumed),
  });
}

function normaliseSourceApplicability(raw, members) {
  const sourceIds = [
    "S1-DODM-4245.15",
    "S2-DFARS-252.246-7007",
    "S3-DFARS-252.246-7008",
    "S4-NIST-MEP-2024",
    "S5-NIST-SP-800-161R1-UPD1",
  ];
  if (raw === undefined) {
    if (members.length !== 0) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, "applicability evidence is not allowed without source applicability");
    }
    return Object.freeze({
      "S1-DODM-4245.15": Object.freeze({ status: "vocabulary_only" }),
      "S2-DFARS-252.246-7007": Object.freeze({
        status: "unknown",
        clause_incorporation: Object.freeze({ status: "unknown" }),
        cost_accounting_standards_applicability: Object.freeze({ status: "unknown" }),
      }),
      "S3-DFARS-252.246-7008": Object.freeze({ status: "unknown" }),
      "S4-NIST-MEP-2024": Object.freeze({ status: "educational_only" }),
      "S5-NIST-SP-800-161R1-UPD1": Object.freeze({ status: "educational_only" }),
    });
  }
  assertExactKeys(raw, sourceIds, sourceIds, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, "source_applicability");
  const consumed = new Set();
  const out = {};
  for (const sourceId of sourceIds) {
    const entry = raw[sourceId];
    assertRecord(entry, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `source_applicability.${sourceId}`);
    if (sourceId === "S2-DFARS-252.246-7007") {
      assertExactKeys(
        entry,
        ["status", ...DFARS_7007_GATES],
        ["status", ...DFARS_7007_GATES],
        BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID,
        `source_applicability.${sourceId}`,
      );
      const clause_incorporation = normaliseDfars7007Gate(entry.clause_incorporation, "clause_incorporation", members, consumed);
      const cost_accounting_standards_applicability = normaliseDfars7007Gate(
        entry.cost_accounting_standards_applicability,
        "cost_accounting_standards_applicability",
        members,
        consumed,
      );
      const bothAffirmative = clause_incorporation.status === "affirmative"
        && cost_accounting_standards_applicability.status === "affirmative";
      const expectedStatus = bothAffirmative ? "bound_applicable" : "unknown";
      if (entry.status !== expectedStatus) {
        fail(BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, "DFARS 252.246-7007 status must be bound_applicable only when both closed gates are affirmative");
      }
      out[sourceId] = Object.freeze({ status: expectedStatus, clause_incorporation, cost_accounting_standards_applicability });
      continue;
    }
    if (CONDITIONAL_SOURCE_IDS.has(sourceId)) {
      const status = assertEnum(
        entry.status,
        ["bound_applicable", "bound_not_applicable", "unknown"],
        BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID,
        `source_applicability.${sourceId}.status`,
      );
      const expectedKeys = status === "unknown" ? ["status"] : ["status", "basis_ref"];
      assertExactKeys(entry, expectedKeys, expectedKeys, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `source_applicability.${sourceId}`);
      if (status === "unknown") {
        out[sourceId] = Object.freeze({ status });
      } else {
        const basis_ref = assertOpaqueRef(entry.basis_ref, BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, `source_applicability.${sourceId}.basis_ref`);
        out[sourceId] = Object.freeze({
          status,
          basis_ref: requireApplicabilityEvidence(basis_ref, sourceId, "clause_incorporation", members, consumed),
        });
      }
      continue;
    }
    const expectedStatus = sourceId === "S1-DODM-4245.15" ? "vocabulary_only" : "educational_only";
    assertExactKeys(entry, ["status"], ["status"], BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `source_applicability.${sourceId}`);
    if (entry.status !== expectedStatus || !SOURCE_APPLICABILITY_STATUSES.includes(entry.status)) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, `source_applicability.${sourceId} must remain ${expectedStatus}`);
    }
    out[sourceId] = Object.freeze({ status: entry.status });
  }
  if (consumed.size !== members.length) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.APPLICABILITY_EVIDENCE_INVALID, "every applicability evidence member must be consumed by a matching basis_ref");
  }
  return Object.freeze(out);
}

function extractTypedSnapshot(typedProjectFacts) {
  const safeEnvelope = snapshotPlainData(
    typedProjectFacts,
    BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED,
    "typed_project_facts_envelope",
  );
  const hasTypedFactsEnvelope = Object.hasOwn(safeEnvelope, "typed_project_facts");
  if (hasTypedFactsEnvelope) {
    assertExactKeys(
      safeEnvelope,
      ["typed_project_facts"],
      ["typed_project_facts"],
      BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED,
      "typed_project_facts_envelope",
    );
  }
  const facts = hasTypedFactsEnvelope ? safeEnvelope.typed_project_facts : safeEnvelope;
  assertExactKeys(
    facts,
    ["schema_version", "project_binding_ref", "facts", "facts_digest", "valid_at", "known_at"],
    ["schema_version", "project_binding_ref", "facts", "facts_digest", "valid_at", "known_at"],
    BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED,
    "typed_project_facts",
  );
  if (facts.schema_version !== TYPED_FACTS_SCHEMA_VERSION) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED, "typed_project_facts schema_version is not the Core typed-facts schema");
  }
  assertRecord(facts.project_binding_ref, BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED, "typed_project_facts.project_binding_ref");
  if (facts.project_binding_ref.domain_engine_id !== BOM_SCR_DOMAIN_ENGINE_ID) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.DOMAIN_MISMATCH, "typed project binding domain does not match bom_supply_chain_risk");
  }
  for (const field of ["project_id", "binding_revision_hash"]) {
    if (typeof facts.project_binding_ref[field] !== "string" || !BINDING_ID_REGEX.test(facts.project_binding_ref[field])) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED, `typed project binding ${field} must be an opaque identifier`);
    }
    assertPublicSafeReference(facts.project_binding_ref[field], BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED, `typed project binding ${field}`);
  }
  if (typeof facts.facts_digest !== "string" || !/^[a-f0-9]{64}$/u.test(facts.facts_digest)
      || !isCanonicalInstant(facts.valid_at) || !isCanonicalInstant(facts.known_at)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED, "typed project facts must preserve Core digest and canonical valid/known cutoffs");
  }
  if (Date.parse(facts.known_at) < Date.parse(facts.valid_at)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED, "typed project facts known_at must not precede valid_at");
  }
  if (!Array.isArray(facts.facts)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED, "typed_project_facts.facts must be an array");
  }
  const coreDigest = sha256Hex(
    `soulforge.project_observations.v0\n${canonicalise(withoutNulls(facts.facts), coreArrayOrderRules(withoutNulls(facts.facts)))}`,
  );
  if (facts.facts_digest !== coreDigest) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.TYPED_FACTS_DIGEST_MISMATCH, "typed project facts do not match the existing Core observations digest");
  }
  const snapshots = facts.facts.filter((entry) => entry.snapshot_kind === BOM_SCR_SNAPSHOT_KIND);
  if (snapshots.length !== 1) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.PROJECT_FACTS_REQUIRED, "typed project facts must contain exactly one BOM/SCR snapshot observation");
  }
  const snapshot = snapshots[0];
  assertExactKeys(
    snapshot,
    [
      "snapshot_kind",
      "snapshot_revision",
      "bom_identity_ref",
      "bom_revision_ref",
      "source_system_revision_ref",
      "bom_items",
    ],
    [
      "snapshot_kind",
      "snapshot_revision",
      "bom_identity_ref",
      "bom_revision_ref",
      "source_system_revision_ref",
      "source_applicability",
      "applicability_evidence",
      "bom_items",
    ],
    BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID,
    "bom_supply_chain_risk_snapshot",
  );
  if (snapshot.snapshot_kind !== BOM_SCR_SNAPSHOT_KIND || typeof snapshot.snapshot_revision !== "string" || !BINDING_ID_REGEX.test(snapshot.snapshot_revision)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, "BOM/SCR snapshot identity is invalid");
  }
  assertPublicSafeReference(snapshot.snapshot_revision, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, "BOM/SCR snapshot_revision");
  const bom_scope = Object.freeze({
    bom_identity_ref: assertOpaqueRef(snapshot.bom_identity_ref, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, "bom_identity_ref"),
    bom_revision_ref: assertOpaqueRef(snapshot.bom_revision_ref, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, "bom_revision_ref"),
    source_system_revision_ref: assertOpaqueRef(snapshot.source_system_revision_ref, BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, "source_system_revision_ref"),
  });
  const applicability_evidence = normaliseApplicabilityEvidence(snapshot.applicability_evidence);
  const source_applicability = normaliseSourceApplicability(snapshot.source_applicability, applicability_evidence);
  if (!Array.isArray(snapshot.bom_items) || snapshot.bom_items.length === 0 || snapshot.bom_items.length > 10000) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, "BOM/SCR snapshot must have 1 through 10000 BOM items");
  }
  const items = snapshot.bom_items.map(normaliseItem).sort((left, right) => compareCodePoints(left.item_id, right.item_id));
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1].item_id === items[index].item_id) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, "BOM/SCR snapshot must not contain duplicate item_id values");
    }
  }
  return Object.freeze({
    project_binding_ref: {
      project_id: facts.project_binding_ref.project_id,
      domain_engine_id: facts.project_binding_ref.domain_engine_id,
      binding_revision_hash: facts.project_binding_ref.binding_revision_hash,
    },
    facts_digest: facts.facts_digest,
    valid_at: facts.valid_at,
    known_at: facts.known_at,
    snapshot_revision: snapshot.snapshot_revision,
    bom_scope,
    source_applicability,
    applicability_evidence,
    items,
  });
}

function sameRef(left, right) {
  return left?.entity_id === right.entity_id
    && left?.revision_id === right.revision_id
    && left?.content_id === right.content_id
    && left?.content_hash_alg === right.content_hash_alg;
}

function assertEntityRef(value, code, label, expected = null) {
  assertExactKeys(
    value,
    ["entity_id", "revision_id", "content_id", "content_hash_alg"],
    ["entity_id", "revision_id", "content_id", "content_hash_alg"],
    code,
    label,
  );
  if (typeof value.entity_id !== "string" || !BINDING_ID_REGEX.test(value.entity_id)
      || typeof value.revision_id !== "string" || !BINDING_ID_REGEX.test(value.revision_id)
      || !/^sha256:[a-f0-9]{64}$/u.test(value.content_id)
      || value.content_hash_alg !== "sha256") {
    fail(code, `${label} is not a bounded SHA-256 entity reference`);
  }
  if (expected && !sameRef(value, expected)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_UNSUPPORTED, `${label} does not match the bound reference`);
  }
  return Object.freeze({ ...value });
}

function normaliseProfileThresholdProvenance(raw, thresholdKeys) {
  assertRecord(raw, BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "effective_rule_set.profile_threshold_provenance");
  const provenanceKeys = Object.keys(raw).sort(compareCodePoints);
  if (provenanceKeys.length !== thresholdKeys.length || !provenanceKeys.every((key, index) => key === thresholdKeys[index])) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.DERIVED_RULESET_INTEGRITY, "threshold and provenance key sets must be identical");
  }
  const provenance = {};
  for (const metric of thresholdKeys) {
    const entry = raw[metric];
    assertExactKeys(
      entry,
      ["profile_kind", "profile_id", "revision_or_hash", "extends_or_base_pin", "operation_digest", "order", "operation_index", "source_refs"],
      ["profile_kind", "profile_id", "revision_or_hash", "extends_or_base_pin", "operation_digest", "order", "operation_index", "source_refs"],
      BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      `effective_rule_set.profile_threshold_provenance.${metric}`,
    );
    if ((entry.profile_kind !== "organization" && entry.profile_kind !== "project")
        || typeof entry.profile_id !== "string" || !BINDING_ID_REGEX.test(entry.profile_id)
        || typeof entry.revision_or_hash !== "string" || !BINDING_ID_REGEX.test(entry.revision_or_hash)
        || typeof entry.extends_or_base_pin !== "string" || !BINDING_ID_REGEX.test(entry.extends_or_base_pin)
        || typeof entry.operation_digest !== "string" || !/^[a-f0-9]{64}$/u.test(entry.operation_digest)
        || !Number.isSafeInteger(entry.order) || entry.order < 0 || entry.order > 1
        || !Number.isSafeInteger(entry.operation_index) || entry.operation_index < 0
        || !Array.isArray(entry.source_refs) || entry.source_refs.length === 0) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "threshold provenance is incomplete or invalid");
    }
    for (const [field, value] of Object.entries({
      profile_id: entry.profile_id,
      revision_or_hash: entry.revision_or_hash,
      extends_or_base_pin: entry.extends_or_base_pin,
    })) {
      assertPublicSafeReference(value, BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `threshold provenance ${field}`);
    }
    const source_refs = entry.source_refs.map((sourceRef) => {
      if (typeof sourceRef !== "string" || !sourceRef || sourceRef.length > 256 || /[\u0000-\u001f\u007f]/u.test(sourceRef)) {
        fail(BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "threshold provenance source ref is invalid");
      }
      assertPublicSafeReference(sourceRef, BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "threshold provenance source ref");
      return sourceRef;
    });
    if (new Set(source_refs).size !== source_refs.length) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "threshold provenance source refs must be unique");
    }
    provenance[metric] = Object.freeze({
      profile_kind: entry.profile_kind,
      profile_id: entry.profile_id,
      revision_or_hash: entry.revision_or_hash,
      extends_or_base_pin: entry.extends_or_base_pin,
      operation_digest: entry.operation_digest,
      order: entry.order,
      operation_index: entry.operation_index,
      source_refs: Object.freeze(source_refs),
    });
  }
  return Object.freeze(provenance);
}

function normaliseTraceSourceRefs(raw, label) {
  if (!Array.isArray(raw)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label} must be an array`);
  }
  const source_refs = raw.map((sourceRef) => {
    if (typeof sourceRef !== "string" || !sourceRef || sourceRef.length > 256 || /[\u0000-\u001f\u007f]/u.test(sourceRef)) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label} contains an invalid source ref`);
    }
    assertPublicSafeReference(sourceRef, BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label} source ref`);
    return sourceRef;
  });
  if (new Set(source_refs).size !== source_refs.length) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label} must not contain duplicate source refs`);
  }
  return Object.freeze(source_refs);
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normaliseCoreProfileTrace(raw, label, expectedOrder = null) {
  const fields = expectedOrder === null
    ? ["profile_id", "domain_engine_id", "revision_or_hash", "extends_or_base_pin", "operation_digest", "applied_operations_count", "source_refs"]
    : ["order", "profile_kind", "profile_id", "domain_engine_id", "revision_or_hash", "extends_or_base_pin", "operation_digest", "applied_operations_count", "source_refs"];
  assertExactKeys(raw, fields, fields, BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, label);
  if (raw.domain_engine_id !== BOM_SCR_DOMAIN_ENGINE_ID
      || typeof raw.profile_id !== "string" || !BINDING_ID_REGEX.test(raw.profile_id)
      || typeof raw.revision_or_hash !== "string" || !BINDING_ID_REGEX.test(raw.revision_or_hash)
      || typeof raw.extends_or_base_pin !== "string" || !BINDING_ID_REGEX.test(raw.extends_or_base_pin)
      || typeof raw.operation_digest !== "string" || !/^[a-f0-9]{64}$/u.test(raw.operation_digest)
      || !Number.isSafeInteger(raw.applied_operations_count) || raw.applied_operations_count < 0) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label} is not a closed Core profile trace`);
  }
  for (const [field, value] of Object.entries({
    profile_id: raw.profile_id,
    revision_or_hash: raw.revision_or_hash,
    extends_or_base_pin: raw.extends_or_base_pin,
  })) {
    assertPublicSafeReference(value, BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label}.${field}`);
  }
  const source_refs = normaliseTraceSourceRefs(raw.source_refs, `${label}.source_refs`);
  const trace = {
    profile_id: raw.profile_id,
    domain_engine_id: raw.domain_engine_id,
    revision_or_hash: raw.revision_or_hash,
    extends_or_base_pin: raw.extends_or_base_pin,
    operation_digest: raw.operation_digest,
    applied_operations_count: raw.applied_operations_count,
    source_refs,
  };
  if (expectedOrder !== null) {
    if (raw.order !== expectedOrder || (raw.profile_kind !== "organization" && raw.profile_kind !== "project")) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label} does not preserve Core profile order/kind`);
    }
    trace.order = raw.order;
    trace.profile_kind = raw.profile_kind;
  }
  return Object.freeze(trace);
}

function sameCoreProfileTrace(left, right, includeKind = false) {
  return left.profile_id === right.profile_id
    && left.domain_engine_id === right.domain_engine_id
    && left.revision_or_hash === right.revision_or_hash
    && left.extends_or_base_pin === right.extends_or_base_pin
    && left.operation_digest === right.operation_digest
    && left.applied_operations_count === right.applied_operations_count
    && sameStringArray(left.source_refs, right.source_refs)
    && (!includeKind || (left.order === right.order && left.profile_kind === right.profile_kind));
}

function normaliseProfileOperationPrograms(raw) {
  if (!Array.isArray(raw) || raw.length > 2) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "profile_operation_programs must be a bounded array");
  }
  return Object.freeze(raw.map((program, index) => {
    const label = `effective_rule_set.profile_operation_programs[${index}]`;
    assertExactKeys(
      program,
      ["domain_engine_id", "profile_kind", "profile_id", "revision_or_hash", "extends_or_base_pin", "operation_digest", "order", "source_refs", "operations", "applied_operations_count"],
      ["domain_engine_id", "profile_kind", "profile_id", "revision_or_hash", "extends_or_base_pin", "operation_digest", "order", "source_refs", "operations", "applied_operations_count"],
      BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY,
      label,
    );
    if ((program.profile_kind !== "organization" && program.profile_kind !== "project")
        || program.order !== index || program.domain_engine_id !== BOM_SCR_DOMAIN_ENGINE_ID
        || typeof program.profile_id !== "string" || !BINDING_ID_REGEX.test(program.profile_id)
        || typeof program.revision_or_hash !== "string" || !BINDING_ID_REGEX.test(program.revision_or_hash)
        || typeof program.extends_or_base_pin !== "string" || !BINDING_ID_REGEX.test(program.extends_or_base_pin)
        || typeof program.operation_digest !== "string" || !/^[a-f0-9]{64}$/u.test(program.operation_digest)) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label} is not a closed profile operation program`);
    }
    for (const [field, value] of Object.entries({
      profile_id: program.profile_id,
      revision_or_hash: program.revision_or_hash,
      extends_or_base_pin: program.extends_or_base_pin,
    })) {
      assertPublicSafeReference(value, BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label}.${field}`);
    }
    const source_refs = normaliseTraceSourceRefs(program.source_refs, `${label}.source_refs`);
    if (!Array.isArray(program.operations)) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label}.operations must be an array`);
    }
    const seenMetrics = new Set();
    const operations = program.operations.map((operation, operationIndex) => {
      assertExactKeys(
        operation,
        ["op", "metric", "value"],
        ["op", "metric", "value"],
        BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY,
        `${label}.operations[${operationIndex}]`,
      );
      if (operation.op !== "set_threshold" || !THRESHOLD_METRICS.includes(operation.metric)
          || !Number.isSafeInteger(operation.value) || operation.value < 1 || operation.value > 100000
          || seenMetrics.has(operation.metric)) {
        fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label}.operations must be an ordered unique closed threshold program`);
      }
      seenMetrics.add(operation.metric);
      return Object.freeze({ op: "set_threshold", metric: operation.metric, value: operation.value });
    });
    let normalized;
    try {
      normalized = normalizeProfileOperations(operations);
    } catch {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label}.operations cannot be normalised by the Core operation canon`);
    }
    if (normalized.operation_digest !== program.operation_digest || program.applied_operations_count !== operations.length) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, `${label} operation_digest does not match its full Core operation program`);
    }
    return Object.freeze({
      domain_engine_id: program.domain_engine_id,
      profile_kind: program.profile_kind,
      profile_id: program.profile_id,
      revision_or_hash: program.revision_or_hash,
      extends_or_base_pin: program.extends_or_base_pin,
      operation_digest: program.operation_digest,
      order: program.order,
      source_refs,
      operations: Object.freeze(operations),
      applied_operations_count: operations.length,
    });
  }));
}

function validateCoreAssemblyWrapper(raw) {
  assertExactRecordKeys(
    raw,
    ["schema_version", "domain_engine_id", "effective_rule_set", "compilation_trace", "rule_count", "assembly_digest"],
    ["schema_version", "domain_engine_id", "effective_rule_set", "compilation_trace", "rule_count", "assembly_digest"],
    BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY,
    "effective_rule_set_assembly",
  );
  if (raw.schema_version !== EFFECTIVE_RULE_SET_SCHEMA_VERSION || raw.domain_engine_id !== BOM_SCR_DOMAIN_ENGINE_ID
      || raw.rule_count !== BOM_SCR_RULES.length || typeof raw.assembly_digest !== "string" || !/^[a-f0-9]{64}$/u.test(raw.assembly_digest)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "Core effective-rule-set assembly identity is invalid");
  }
  const trace = raw.compilation_trace;
  assertExactRecordKeys(
    trace,
    ["schema_version", "domain_engine_id", "domain_adapter_revision", "organization_trace", "project_trace", "profiles", "compilation_scope", "effective_ruleset_digest", "rule_count"],
    ["schema_version", "domain_engine_id", "domain_adapter_revision", "organization_trace", "project_trace", "profiles", "compilation_scope", "effective_ruleset_digest", "rule_count"],
    BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY,
    "compilation_trace",
  );
  if (trace.schema_version !== COMPILATION_TRACE_SCHEMA_VERSION || trace.domain_engine_id !== BOM_SCR_DOMAIN_ENGINE_ID
      || trace.domain_adapter_revision !== "soulforge.bom_supply_chain_risk.adapter.v0"
      || trace.rule_count !== BOM_SCR_RULES.length || typeof trace.effective_ruleset_digest !== "string"
      || !/^[a-f0-9]{64}$/u.test(trace.effective_ruleset_digest)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "Core compilation trace identity is invalid");
  }
  assertExactKeys(trace.compilation_scope, [], [], BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "compilation_trace.compilation_scope");
  if (!Array.isArray(trace.profiles)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "compilation_trace.profiles must be an array");
  }
  const profiles = trace.profiles.map((entry, index) => normaliseCoreProfileTrace(entry, `compilation_trace.profiles[${index}]`, index));
  if (profiles.length > 2 || new Set(profiles.map((entry) => entry.profile_kind)).size !== profiles.length
      || profiles.some((entry) => entry.profile_kind === "organization" && entry.order !== 0)
      || (profiles.length === 2 && (profiles[0].profile_kind !== "organization" || profiles[1].profile_kind !== "project"))) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "Core compilation trace profiles must retain ordered organization/project slots");
  }
  const organization_trace = trace.organization_trace === null
    ? null
    : normaliseCoreProfileTrace(trace.organization_trace, "compilation_trace.organization_trace");
  const project_trace = trace.project_trace === null
    ? null
    : normaliseCoreProfileTrace(trace.project_trace, "compilation_trace.project_trace");
  return Object.freeze({
    effective_rule_set: raw.effective_rule_set,
    assembly_digest: raw.assembly_digest,
    compilation_trace: Object.freeze({ ...trace, profiles, organization_trace, project_trace }),
  });
}

function verifyCoreAssemblyIntegrity(assembly, candidate, thresholds, profileThresholdProvenance, profileOperationPrograms) {
  const cleanRules = withoutNulls(candidate);
  const expectedDigest = sha256Hex(
    `soulforge.effective_rule_set.v0\n${canonicalise(cleanRules, coreArrayOrderRules(cleanRules))}`,
  );
  const trace = assembly.compilation_trace;
  if (assembly.assembly_digest !== expectedDigest || trace.effective_ruleset_digest !== expectedDigest) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "Core assembly_digest and effective_ruleset_digest must root the exact effective ruleset");
  }
  if (profileOperationPrograms.length !== trace.profiles.length) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "Core profile trace and full profile operation programs must have identical slots");
  }
  const finalThresholds = {};
  for (let profileIndex = 0; profileIndex < profileOperationPrograms.length; profileIndex += 1) {
    const program = profileOperationPrograms[profileIndex];
    const profile = trace.profiles[profileIndex];
    if (!sameCoreProfileTrace(program, profile, true) || profile.applied_operations_count !== program.operations.length) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "full profile operation program does not root the Core profile trace");
    }
    const summary = profile.profile_kind === "organization" ? trace.organization_trace : trace.project_trace;
    if (!summary || !sameCoreProfileTrace(profile, summary)) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "Core organization/project trace must match the rooted profile slot");
    }
    for (let operationIndex = 0; operationIndex < program.operations.length; operationIndex += 1) {
      const operation = program.operations[operationIndex];
      finalThresholds[operation.metric] = {
        value: operation.value,
        profile_kind: program.profile_kind,
        profile_id: program.profile_id,
        revision_or_hash: program.revision_or_hash,
        extends_or_base_pin: program.extends_or_base_pin,
        operation_digest: program.operation_digest,
        order: program.order,
        operation_index: operationIndex,
        source_refs: program.source_refs,
      };
    }
  }
  const finalMetrics = Object.keys(finalThresholds).sort(compareCodePoints);
  const provenanceMetrics = Object.keys(profileThresholdProvenance).sort(compareCodePoints);
  if (finalMetrics.length !== provenanceMetrics.length || !finalMetrics.every((metric, index) => metric === provenanceMetrics[index])) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "final threshold provenance must retain exactly the last operation for each metric");
  }
  for (const metric of finalMetrics) {
    const final = finalThresholds[metric];
    const provenance = profileThresholdProvenance[metric];
    if (thresholds[metric] !== final.value || provenance.profile_kind !== final.profile_kind
        || provenance.profile_id !== final.profile_id || provenance.revision_or_hash !== final.revision_or_hash
        || provenance.extends_or_base_pin !== final.extends_or_base_pin || provenance.operation_digest !== final.operation_digest
        || provenance.order !== final.order || provenance.operation_index !== final.operation_index
        || !sameStringArray(provenance.source_refs, final.source_refs)) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "threshold provenance must bind the final operation while retaining the full Core program trace");
    }
  }
  if ((trace.organization_trace !== null) !== trace.profiles.some((entry) => entry.profile_kind === "organization")
      || (trace.project_trace !== null) !== trace.profiles.some((entry) => entry.profile_kind === "project")) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "Core organization/project trace presence must match profile slots");
  }
}

function validateEffectiveRuleSet(rawEffectiveRuleSet) {
  const safeEnvelope = snapshotPlainData(
    rawEffectiveRuleSet,
    BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
    "effective_rule_set_envelope",
  );
  const assembly = Object.hasOwn(safeEnvelope, "effective_rule_set")
    ? validateCoreAssemblyWrapper(safeEnvelope)
    : null;
  const candidate = assembly ? assembly.effective_rule_set : safeEnvelope;
  assertExactKeys(
    candidate,
    ["schema_version", "domain_engine_id", "ruleset_ref", "source_packet_ref", "rules", "thresholds", "profile_threshold_provenance", "profile_operation_programs"],
    ["schema_version", "domain_engine_id", "ruleset_ref", "source_packet_ref", "rules", "thresholds", "profile_threshold_provenance", "profile_operation_programs"],
    BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
    "effective_rule_set",
  );
  if (candidate.schema_version !== BOM_SCR_RULESET_SCHEMA_VERSION || candidate.domain_engine_id !== BOM_SCR_DOMAIN_ENGINE_ID) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.DOMAIN_MISMATCH, "effective rule set is not a BOM/SCR ruleset");
  }
  const source_packet_ref = assertEntityRef(
    candidate.source_packet_ref,
    BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
    "effective_rule_set.source_packet_ref",
    BOM_SCR_SOURCE_PACKET_REF,
  );
  if (!Array.isArray(candidate.rules) || candidate.rules.length !== BOM_SCR_RULES.length) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_UNSUPPORTED, "effective rule set must carry every closed BOM/SCR rule");
  }
  for (let index = 0; index < BOM_SCR_RULES.length; index += 1) {
    const actual = candidate.rules[index];
    const expected = BOM_SCR_RULES[index];
    assertExactKeys(
      actual,
      ["rule_id", "risk_dimension", "source_id", "source_revision", "source_locator", "source_applicability", "source_applicability_mode", "purpose"],
      ["rule_id", "risk_dimension", "source_id", "source_revision", "source_locator", "source_applicability", "source_applicability_mode", "purpose"],
      BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      `effective_rule_set.rules[${index}]`,
    );
    for (const field of ["rule_id", "risk_dimension", "source_id", "source_revision", "source_locator", "source_applicability", "source_applicability_mode", "purpose"]) {
      if (actual[field] !== expected[field]) {
        fail(BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_UNSUPPORTED, `effective rule ${index} does not match the bound base rule`);
      }
    }
  }
  assertRecord(candidate.thresholds, BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "effective_rule_set.thresholds");
  const thresholds = {};
  const thresholdKeys = Object.keys(candidate.thresholds).sort(compareCodePoints);
  for (const metric of thresholdKeys) {
    const value = candidate.thresholds[metric];
    if (!THRESHOLD_METRICS.includes(metric) || !Number.isSafeInteger(value) || value < 1 || value > 100000) {
      fail(BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "effective rule set contains an invalid threshold");
    }
    thresholds[metric] = value;
  }
  const profile_threshold_provenance = normaliseProfileThresholdProvenance(candidate.profile_threshold_provenance, thresholdKeys);
  const profile_operation_programs = normaliseProfileOperationPrograms(candidate.profile_operation_programs);
  const ruleset_ref = assertEntityRef(
    candidate.ruleset_ref,
    BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
    "effective_rule_set.ruleset_ref",
  );
  const expectedRulesetRef = deriveBomSupplyChainRiskRulesetRef(thresholds, profile_threshold_provenance);
  if (!sameRef(ruleset_ref, expectedRulesetRef)) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.DERIVED_RULESET_INTEGRITY, "ruleset reference does not match verified thresholds and provenance");
  }
  if (assembly) {
    verifyCoreAssemblyIntegrity(assembly, candidate, thresholds, profile_threshold_provenance, profile_operation_programs);
  } else if (thresholdKeys.length !== 0 || profile_operation_programs.length !== 0) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.ASSEMBLY_INTEGRITY, "Profile-derived thresholds or operation programs require the exact Core effective-rule-set assembly wrapper");
  }
  const verified_ruleset_sha256 = digest("soulforge.bom_supply_chain_risk.verified_ruleset.v0", {
    ruleset_ref,
    source_packet_ref,
    rules: candidate.rules,
    thresholds,
    profile_threshold_provenance,
    profile_operation_programs,
  });
  return Object.freeze({
    thresholds,
    profile_threshold_provenance,
    profile_operation_programs,
    ruleset_ref,
    source_packet_ref,
    verified_ruleset_sha256,
  });
}

function baseFinding(item, rule) {
  return {
    item_id: item.item_id,
    criticality: item.criticality,
    rule_id: rule.rule_id,
    risk_dimension: rule.risk_dimension,
    source: {
      source_id: rule.source_id,
      source_revision: rule.source_revision,
      source_locator: rule.source_locator,
      applicability: rule.source_applicability,
    },
  };
}

function conclusion(item, rule, state, reason_code, options = {}) {
  const finding = {
    ...baseFinding(item, rule),
    state,
    reason_code,
  };
  if (options.observed_evidence_ref) finding.observed_evidence_ref = options.observed_evidence_ref;
  if (options.threshold_metric) finding.threshold_metric = options.threshold_metric;
  if (options.threshold_value !== undefined) finding.threshold_value = options.threshold_value;
  if (options.observed_value !== undefined) finding.observed_value = options.observed_value;
  return finding;
}

function withSourceApplicability(finding, applicability) {
  finding.source.applicability_status = applicability.status;
  if (applicability.basis_ref) finding.source.applicability_basis_ref = applicability.basis_ref;
  if (applicability.clause_incorporation) {
    finding.source.applicability_gates = {
      clause_incorporation: { ...applicability.clause_incorporation },
      cost_accounting_standards_applicability: { ...applicability.cost_accounting_standards_applicability },
    };
  }
  return finding;
}

function conditionalSourceGate(item, rule, applicability) {
  if (rule.source_applicability_mode !== "conditional_contract") return null;
  if (rule.source_id === "S2-DFARS-252.246-7007") {
    if (applicability.clause_incorporation.status !== "affirmative") {
      return conclusion(item, rule, "unknown", "dfars_252_246_7007_clause_incorporation_unresolved");
    }
    if (applicability.cost_accounting_standards_applicability.status !== "affirmative") {
      return conclusion(item, rule, "unknown", "dfars_252_246_7007_cas_applicability_unresolved");
    }
    return null;
  }
  if (applicability.status === "unknown") {
    return conclusion(item, rule, "unknown", "conditional_source_applicability_unknown");
  }
  if (applicability.status === "bound_not_applicable") {
    return conclusion(item, rule, "unknown", "conditional_source_not_applicable");
  }
  if (applicability.status !== "bound_applicable" || !applicability.basis_ref) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.INPUT_INVALID, "conditional source applicability must be explicitly bound with an opaque basis ref");
  }
  return null;
}

function evaluateLifecycle(item, rule) {
  if (item.lifecycle_status === "unknown") return conclusion(item, rule, "unknown", "lifecycle_status_unknown");
  if (!item.lifecycle_evidence_ref) return conclusion(item, rule, "unknown", "lifecycle_evidence_unbound");
  if (item.lifecycle_status === "active") return conclusion(item, rule, "evidence_sufficient", "lifecycle_active", { observed_evidence_ref: item.lifecycle_evidence_ref });
  return conclusion(item, rule, "risk_detected", "lifecycle_at_risk", { observed_evidence_ref: item.lifecycle_evidence_ref });
}

function evaluateObsolescence(item, rule) {
  if (item.obsolescence_signal === "unknown") return conclusion(item, rule, "unknown", "obsolescence_signal_unknown");
  if (!item.obsolescence_evidence_ref) return conclusion(item, rule, "unknown", "obsolescence_evidence_unbound");
  if (item.obsolescence_signal === "none") return conclusion(item, rule, "evidence_sufficient", "no_obsolescence_signal", { observed_evidence_ref: item.obsolescence_evidence_ref });
  return conclusion(item, rule, "risk_detected", "obsolescence_signal_observed", { observed_evidence_ref: item.obsolescence_evidence_ref });
}

function evaluateLongLead(item, rule, thresholds) {
  const threshold = thresholds.max_lead_time_days;
  if (threshold === undefined) return conclusion(item, rule, "unknown", "lead_time_threshold_unbound");
  if (item.lead_time_days === undefined) return conclusion(item, rule, "unknown", "lead_time_unknown", { threshold_metric: "max_lead_time_days", threshold_value: threshold });
  if (!item.lead_time_evidence_ref) return conclusion(item, rule, "unknown", "lead_time_evidence_unbound", { threshold_metric: "max_lead_time_days", threshold_value: threshold, observed_value: item.lead_time_days });
  const options = {
    observed_evidence_ref: item.lead_time_evidence_ref,
    threshold_metric: "max_lead_time_days",
    threshold_value: threshold,
    observed_value: item.lead_time_days,
  };
  return item.lead_time_days > threshold
    ? conclusion(item, rule, "risk_detected", "lead_time_exceeds_bound_threshold", options)
    : conclusion(item, rule, "evidence_sufficient", "lead_time_within_bound_threshold", options);
}

function evaluateSoleSource(item, rule) {
  if (item.approved_source_count === undefined) {
    return conclusion(item, rule, "unknown", "approved_source_count_unknown");
  }
  if (!item.supplier_evidence_ref) return conclusion(item, rule, "unknown", "supplier_evidence_unbound", { observed_value: item.approved_source_count });
  if (item.approved_source_count === 0) {
    return conclusion(item, rule, "risk_detected", "no_approved_source_observed", { observed_evidence_ref: item.supplier_evidence_ref, observed_value: 0 });
  }
  if (item.approved_source_count > 1) {
    return conclusion(item, rule, "evidence_sufficient", "multiple_approved_sources_observed", { observed_evidence_ref: item.supplier_evidence_ref, observed_value: item.approved_source_count });
  }
  if (item.alternate_status === "unknown") {
    return conclusion(item, rule, "unknown", "single_source_alternate_status_unknown", { observed_evidence_ref: item.supplier_evidence_ref, observed_value: item.approved_source_count });
  }
  if (item.alternate_status === "qualified" && item.alternate_evidence_ref) {
    return conclusion(item, rule, "evidence_sufficient", "single_source_with_qualified_alternate", { observed_evidence_ref: item.alternate_evidence_ref, observed_value: item.approved_source_count });
  }
  return conclusion(item, rule, "risk_detected", "single_source_without_qualified_alternate", { observed_evidence_ref: item.supplier_evidence_ref, observed_value: item.approved_source_count });
}

function evaluateAlternate(item, rule) {
  if (item.alternate_status === "unknown") return conclusion(item, rule, "unknown", "alternate_status_unknown");
  if (item.alternate_status === "not_required") {
    return item.alternate_not_required_basis_ref
      ? conclusion(item, rule, "not_applicable", "alternate_explicitly_not_required", { observed_evidence_ref: item.alternate_not_required_basis_ref })
      : conclusion(item, rule, "unknown", "alternate_not_required_basis_unbound");
  }
  if (!item.alternate_evidence_ref) return conclusion(item, rule, "unknown", "alternate_evidence_unbound");
  return item.alternate_status === "qualified"
    ? conclusion(item, rule, "evidence_sufficient", "alternate_qualified", { observed_evidence_ref: item.alternate_evidence_ref })
    : conclusion(item, rule, "risk_detected", "alternate_not_qualified", { observed_evidence_ref: item.alternate_evidence_ref });
}

function evaluateCounterfeit(item, rule) {
  if (item.counterfeit_control_status === "unknown") return conclusion(item, rule, "unknown", "counterfeit_control_unknown");
  if (!item.counterfeit_evidence_ref) return conclusion(item, rule, "unknown", "counterfeit_control_evidence_unbound");
  return item.counterfeit_control_status === "traceable_verified"
    ? conclusion(item, rule, "evidence_sufficient", "traceability_control_evidenced", { observed_evidence_ref: item.counterfeit_evidence_ref })
    : conclusion(item, rule, "risk_detected", "counterfeit_control_elevated_risk", { observed_evidence_ref: item.counterfeit_evidence_ref });
}

function evaluateSupplierConcentration(item, rule, thresholds) {
  const threshold = thresholds.minimum_supplier_count;
  if (threshold === undefined) return conclusion(item, rule, "unknown", "supplier_count_threshold_unbound");
  if (item.supplier_count === undefined) return conclusion(item, rule, "unknown", "supplier_count_unknown", { threshold_metric: "minimum_supplier_count", threshold_value: threshold });
  if (!item.supplier_evidence_ref) return conclusion(item, rule, "unknown", "supplier_evidence_unbound", { threshold_metric: "minimum_supplier_count", threshold_value: threshold, observed_value: item.supplier_count });
  const options = { observed_evidence_ref: item.supplier_evidence_ref, threshold_metric: "minimum_supplier_count", threshold_value: threshold, observed_value: item.supplier_count };
  return item.supplier_count < threshold
    ? conclusion(item, rule, "risk_detected", "supplier_count_below_bound_threshold", options)
    : conclusion(item, rule, "evidence_sufficient", "supplier_count_meets_bound_threshold", options);
}

function evaluateGeographicConcentration(item, rule, thresholds) {
  const threshold = thresholds.minimum_geography_count;
  if (threshold === undefined) return conclusion(item, rule, "unknown", "geography_count_threshold_unbound");
  if (item.geography_count === undefined) return conclusion(item, rule, "unknown", "geography_count_unknown", { threshold_metric: "minimum_geography_count", threshold_value: threshold });
  if (!item.geography_evidence_ref) return conclusion(item, rule, "unknown", "geography_evidence_unbound", { threshold_metric: "minimum_geography_count", threshold_value: threshold, observed_value: item.geography_count });
  const options = { observed_evidence_ref: item.geography_evidence_ref, threshold_metric: "minimum_geography_count", threshold_value: threshold, observed_value: item.geography_count };
  return item.geography_count < threshold
    ? conclusion(item, rule, "risk_detected", "geography_count_below_bound_threshold", options)
    : conclusion(item, rule, "evidence_sufficient", "geography_count_meets_bound_threshold", options);
}

function evaluateContinuity(item, rule) {
  if (item.continuity_status === "unknown") return conclusion(item, rule, "unknown", "continuity_status_unknown");
  if (!item.continuity_evidence_ref) return conclusion(item, rule, "unknown", "continuity_evidence_unbound");
  return item.continuity_status === "covered"
    ? conclusion(item, rule, "evidence_sufficient", "continuity_evidence_present", { observed_evidence_ref: item.continuity_evidence_ref })
    : conclusion(item, rule, "risk_detected", "continuity_gap_observed", { observed_evidence_ref: item.continuity_evidence_ref });
}

function evaluateRule(item, rule, thresholds, sourceApplicability) {
  const applicability = sourceApplicability[rule.source_id];
  const gated = conditionalSourceGate(item, rule, applicability);
  if (gated) return withSourceApplicability(gated, applicability);
  let finding;
  if (item.conflict_dimensions.includes(rule.risk_dimension)) {
    finding = conclusion(item, rule, "conflict", "typed_fact_conflict_retained");
    return withSourceApplicability(finding, applicability);
  }
  switch (rule.risk_dimension) {
    case "lifecycle_status": finding = evaluateLifecycle(item, rule); break;
    case "obsolescence_signal": finding = evaluateObsolescence(item, rule); break;
    case "long_lead": finding = evaluateLongLead(item, rule, thresholds); break;
    case "sole_source": finding = evaluateSoleSource(item, rule); break;
    case "alternate_qualification": finding = evaluateAlternate(item, rule); break;
    case "counterfeit_control": finding = evaluateCounterfeit(item, rule); break;
    case "supplier_concentration": finding = evaluateSupplierConcentration(item, rule, thresholds); break;
    case "geographic_concentration": finding = evaluateGeographicConcentration(item, rule, thresholds); break;
    case "continuity_gap": finding = evaluateContinuity(item, rule); break;
    default: fail(BOM_SCR_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_UNSUPPORTED, "rule carries an unsupported risk dimension");
  }
  return withSourceApplicability(finding, applicability);
}

function countStates(findings) {
  const counts = { evidence_sufficient: 0, risk_detected: 0, unknown: 0, conflict: 0, not_applicable: 0, total: findings.length };
  for (const finding of findings) counts[finding.state] += 1;
  return counts;
}

function overallState(counts) {
  if (counts.risk_detected || counts.unknown || counts.conflict) return "hold";
  if (counts.total === counts.not_applicable) return "not_applicable";
  return "evidence_ready_for_owner_review";
}

function arrayOrderRules(value, path = "", rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = "insertion_ordered";
    for (const child of value) arrayOrderRules(child, `${path}[]`, rules);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) arrayOrderRules(child, path ? `${path}.${key}` : key, rules);
  }
  return rules;
}

function digest(domain, value) {
  return sha256Hex(`${domain}\n${canonicalise(value, arrayOrderRules(value))}`);
}

function admitNoActionAuthority(authority) {
  const admitted = snapshotPlainData(
    authority,
    BOM_SCR_EVALUATOR_ERROR_CODES.AUTHORITY_INVALID,
    "authority",
  );
  assertExactKeys(
    admitted,
    [],
    [],
    BOM_SCR_EVALUATOR_ERROR_CODES.AUTHORITY_INVALID,
    "authority",
  );
  return admitted;
}

function admitCutoffsEnvelope(cutoffs) {
  return snapshotPlainData(
    cutoffs,
    BOM_SCR_EVALUATOR_ERROR_CODES.CUTOFFS_INVALID,
    "cutoffs",
  );
}

function validateCutoffs(admittedCutoffs, snapshot) {
  assertRecord(admittedCutoffs, BOM_SCR_EVALUATOR_ERROR_CODES.CUTOFFS_INVALID, "cutoffs");
  const keys = Object.keys(admittedCutoffs);
  if (keys.length === 0) return Object.freeze({});
  assertExactKeys(
    admittedCutoffs,
    ["valid_at", "known_at"],
    ["valid_at", "known_at"],
    BOM_SCR_EVALUATOR_ERROR_CODES.CUTOFFS_INVALID,
    "cutoffs",
  );
  if (!isCanonicalInstant(admittedCutoffs.valid_at) || !isCanonicalInstant(admittedCutoffs.known_at)
      || Date.parse(admittedCutoffs.known_at) < Date.parse(admittedCutoffs.valid_at)
      || admittedCutoffs.valid_at !== snapshot.valid_at || admittedCutoffs.known_at !== snapshot.known_at) {
    fail(BOM_SCR_EVALUATOR_ERROR_CODES.CUTOFFS_INVALID, "cutoffs must be exact canonical valid_at/known_at matching typed project facts");
  }
  return Object.freeze({ valid_at: admittedCutoffs.valid_at, known_at: admittedCutoffs.known_at });
}

/**
 * Evaluates only existing Core-typed facts. This function does not access the
 * filesystem, network, RAG, an ERP, a procurement system, or an authority system.
 */
export function evaluateBomSupplyChainRisk(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
  admitNoActionAuthority(authority);
  const admittedCutoffs = admitCutoffsEnvelope(cutoffs);
  const {
    thresholds,
    ruleset_ref,
    source_packet_ref,
    verified_ruleset_sha256,
  } = validateEffectiveRuleSet(effectiveRuleSet);
  const snapshot = extractTypedSnapshot(typedProjectFacts);
  validateCutoffs(admittedCutoffs, snapshot);
  const assessment_scope = {
    snapshot_revision: snapshot.snapshot_revision,
    ...snapshot.bom_scope,
  };
  const findings = snapshot.items.flatMap((item) => BOM_SCR_RULES.map((rule) => (
    evaluateRule(item, rule, thresholds, snapshot.source_applicability)
  )));
  const counts = countStates(findings);
  const domain_result = {
    schema_version: BOM_SCR_DOMAIN_RESULT_SCHEMA_VERSION,
    claim_ceiling: "source_supported",
    assessment_scope,
    findings,
    counts,
  };
  const assessment = {
    schema_version: BOM_SCR_ASSESSMENT_SCHEMA_VERSION,
    assessment_kind: "bom_supply_chain_risk_readiness",
    claim_ceiling: "source_supported",
    assessment_scope: { ...assessment_scope },
    overall_state: overallState(counts),
    result_counts: { ...counts },
  };
  const receipt = {
    schema_version: BOM_SCR_RECEIPT_SCHEMA_VERSION,
    digests: {
      typed_facts_sha256: digest("soulforge.bom_supply_chain_risk.typed_facts.v0", {
        project_binding_ref: snapshot.project_binding_ref,
        facts_digest: snapshot.facts_digest,
        valid_at: snapshot.valid_at,
        known_at: snapshot.known_at,
        assessment_scope,
        source_applicability: snapshot.source_applicability,
        applicability_evidence: snapshot.applicability_evidence,
        items: snapshot.items,
      }),
      ruleset_sha256: verified_ruleset_sha256,
      domain_result_sha256: digest("soulforge.bom_supply_chain_risk.domain_result.v0", domain_result),
      assessment_sha256: digest("soulforge.bom_supply_chain_risk.assessment.v0", assessment),
    },
    bindings: {
      domain_engine_id: BOM_SCR_DOMAIN_ENGINE_ID,
      project_binding_ref: { ...snapshot.project_binding_ref },
      source_packet_ref,
      ruleset_ref,
      assessment_scope: { ...assessment_scope },
      source_applicability: snapshot.source_applicability,
      applicability_evidence: snapshot.applicability_evidence,
      valid_at: snapshot.valid_at,
      known_at: snapshot.known_at,
    },
    counts: { ...counts },
    effects: { ...EFFECTS },
  };
  return freezeDeep({ assessment, domain_result, receipt });
}
