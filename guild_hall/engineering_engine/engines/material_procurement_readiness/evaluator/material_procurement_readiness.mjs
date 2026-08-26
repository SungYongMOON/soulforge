// E03 deterministic evaluator. It only assesses caller-supplied ERP-owned snapshot facts and
// exposes gaps. It never reads a live system or changes inventory, purchase, supplier, or schedule truth.
import { canonicalise, compareCodePoints } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { types } from "node:util";
import {
  MPR_TYPED_FACTS_SCHEMA_V1,
  validateMaterialProcurementTypedFacts,
} from "./material_procurement_project_evidence_adapter.mjs";
import {
  MATERIAL_PROCUREMENT_READINESS_RULES,
  MATERIAL_PROCUREMENT_READINESS_RULESET_REF,
  MATERIAL_PROCUREMENT_READINESS_RULESET_REVISION,
  MATERIAL_PROCUREMENT_READINESS_RULESET_SCHEMA,
  MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF,
} from "../rules/material_procurement_readiness_rules.mjs";

export const MPR_TYPED_FACTS_SCHEMA = MPR_TYPED_FACTS_SCHEMA_V1;
export const MPR_ASSESSMENT_SCHEMA = "soulforge.material_procurement_readiness.assessment.v0";
export const MPR_DOMAIN_RESULT_SCHEMA = "soulforge.material_procurement_readiness.domain_result.v0";
export const MPR_RECEIPT_SCHEMA = "soulforge.material_procurement_readiness.evaluation_receipt.v0";

export const MPR_ERROR_CODES = Object.freeze({
  AUTHORITY_REFUSED: "MPR_AUTHORITY_REFUSED",
  FACTS_INVALID: "MPR_FACTS_INVALID",
  RULESET_INVALID: "MPR_RULESET_INVALID",
});

const REF_FIELDS = Object.freeze([
  "content_hash_alg",
  "content_id",
  "entity_id",
  "revision_id",
]);

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const FLOATING_REVISION = /(?:^|[-_.:])(latest|current|head|main|master|develop|development|dev|trunk|branch|release|stable|production|prod)(?:$|[-_.:])|[*^~<>]/iu;
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ACTIVE_PO_STATES = new Set(["released", "supplier_acknowledged", "in_transit"]);
const RULE_BY_ID = new Map(MATERIAL_PROCUREMENT_READINESS_RULES.map((rule) => [rule.rule_id, rule]));

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

function assertPlainObject(value, label, code = MPR_ERROR_CODES.FACTS_INVALID) {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, `${label} must be an ordinary object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || PROTOTYPE_SENSITIVE_KEYS.has(key)
      || !descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(code, `${label} may not carry unsafe keys, accessors, symbols, or hidden fields`);
    }
  }
}

function copyExactFields(value, fields, label, code = MPR_ERROR_CODES.FACTS_INVALID) {
  assertPlainObject(value, label, code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(code, `${label} must use the exact typed field set`);
  }
  const copy = {};
  for (const field of fields) copy[field] = descriptors[field].value;
  return copy;
}

function copyRef(value, label, code = MPR_ERROR_CODES.FACTS_INVALID) {
  const ref = copyExactFields(value, REF_FIELDS, label, code);
  if (!TOKEN.test(ref.entity_id) || !TOKEN.test(ref.revision_id)
    || FLOATING_REVISION.test(ref.revision_id)
    || !SHA256_CONTENT_ID.test(ref.content_id)
    || ref.content_hash_alg !== "sha256") {
    fail(code, `${label} must be a pinned public-safe entity/revision/SHA-256 reference`);
  }
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function copyFacts(input, cutoffs) {
  return validateMaterialProcurementTypedFacts(input, cutoffs);
}

function assertNoAuthority(authority) {
  const value = authority === undefined ? {} : authority;
  assertPlainObject(value, "evaluation authority", MPR_ERROR_CODES.AUTHORITY_REFUSED);
  if (Object.keys(value).length !== 0) {
    fail(MPR_ERROR_CODES.AUTHORITY_REFUSED, "material procurement readiness accepts no action or procurement authority");
  }
  return {};
}

function copyPlainData(value, label, code, depth = 0) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(code, `${label} contains a non-finite number`);
    return value;
  }
  if (!value || typeof value !== "object" || types.isProxy(value) || depth > 32) {
    fail(code, `${label} must contain bounded non-proxy plain data`);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 256) {
      fail(code, `${label} must be a bounded ordinary array`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) {
      fail(code, `${label} may not contain named or symbol fields`);
    }
    const copy = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
        fail(code, `${label} must be dense and data-only`);
      }
      copy.push(copyPlainData(descriptor.value, `${label}[${index}]`, code, depth + 1));
    }
    return copy;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, `${label} must contain only ordinary objects`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copy = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || PROTOTYPE_SENSITIVE_KEYS.has(key)
      || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(code, `${label} may not contain unsafe keys, accessors, symbols, or hidden fields`);
    }
    copy[key] = copyPlainData(descriptor.value, `${label}.${key}`, code, depth + 1);
  }
  return copy;
}

function stableJson(value, code = MPR_ERROR_CODES.FACTS_INVALID) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (types.isProxy(value)) fail(code, "digest material may not be proxy-backed");
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item, code)).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key], code)}`).join(",")}}`;
  }
  fail(code, "digest material contains an unsupported value");
}

function sameJson(left, right, code = MPR_ERROR_CODES.FACTS_INVALID) {
  return stableJson(left, code) === stableJson(right, code);
}

function copyAndValidateRuleset(input) {
  assertPlainObject(input, "effective rule set input", MPR_ERROR_CODES.RULESET_INVALID);
  const envelopeDescriptors = Object.getOwnPropertyDescriptors(input);
  const candidate = Object.hasOwn(envelopeDescriptors, "effective_rule_set")
    ? envelopeDescriptors.effective_rule_set.value
    : input;
  const required = [
    "domain_engine_id",
    "policy",
    "revision",
    "rules",
    "ruleset_ref",
    "schema_version",
    "source_packet_ref",
  ];
  const ruleset = copyExactFields(candidate, required, "effective rule set", MPR_ERROR_CODES.RULESET_INVALID);
  const sourcePacketRef = copyRef(ruleset.source_packet_ref, "effective rule set source_packet_ref", MPR_ERROR_CODES.RULESET_INVALID);
  if (ruleset.schema_version !== MATERIAL_PROCUREMENT_READINESS_RULESET_SCHEMA
    || ruleset.revision !== MATERIAL_PROCUREMENT_READINESS_RULESET_REVISION
    || ruleset.domain_engine_id !== "material_procurement_readiness"
    || !sameJson(sourcePacketRef, MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF, MPR_ERROR_CODES.RULESET_INVALID)) {
    fail(MPR_ERROR_CODES.RULESET_INVALID, "effective rule set identity or source packet reference is invalid");
  }
  const rules = copyPlainData(ruleset.rules, "effective rule set rules", MPR_ERROR_CODES.RULESET_INVALID);
  if (!Array.isArray(rules) || !sameJson(rules, MATERIAL_PROCUREMENT_READINESS_RULES, MPR_ERROR_CODES.RULESET_INVALID)) {
    fail(MPR_ERROR_CODES.RULESET_INVALID, "effective rule set must retain the exact base rule vocabulary");
  }
  const policy = copyExactFields(ruleset.policy, ["default_receipt_required"], "effective rule set policy", MPR_ERROR_CODES.RULESET_INVALID);
  if (typeof policy.default_receipt_required !== "boolean") {
    fail(MPR_ERROR_CODES.RULESET_INVALID, "default_receipt_required must be boolean");
  }
  const material = {
    schema_version: ruleset.schema_version,
    revision: ruleset.revision,
    domain_engine_id: ruleset.domain_engine_id,
    source_packet_ref: sourcePacketRef,
    rules,
    policy,
  };
  let computedDigest;
  try {
    computedDigest = sha256Hex(`soulforge.material_procurement_readiness.derived_ruleset.v0\n${canonicalise(material, {
      rules: "sorted_by:rule_id",
      "rules[].required_fact_fields": "insertion_ordered",
      "rules[].source_refs": "insertion_ordered",
    })}`);
  } catch {
    fail(MPR_ERROR_CODES.RULESET_INVALID, "effective rule set canonical material is invalid");
  }
  const base = MATERIAL_PROCUREMENT_READINESS_RULESET_REF;
  const ref = copyRef(ruleset.ruleset_ref, "effective rule set ruleset_ref", MPR_ERROR_CODES.RULESET_INVALID);
  const isBase = sameJson(ref, base, MPR_ERROR_CODES.RULESET_INVALID);
  const isDerived = ref.entity_id === "material-procurement-readiness-ruleset-derived-v0"
    && ref.revision_id === `derived:${computedDigest.slice(0, 16)}`
    && ref.content_id === `sha256:${computedDigest}`;
  if ((!isBase && !isDerived) || (isBase && policy.default_receipt_required !== false)) {
    fail(MPR_ERROR_CODES.RULESET_INVALID, "ruleset reference does not bind the supplied base or derived rule material");
  }
  return {
    ...material,
    ruleset_ref: ref,
  };
}

function subtractCalendarDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day - days));
  return result.toISOString().slice(0, 10);
}

function selectInboundDate(row) {
  if (row.confirmed_receipt_date !== null) return { field: "confirmed_receipt_date", value: row.confirmed_receipt_date };
  if (row.promised_delivery_date !== null) return { field: "promised_delivery_date", value: row.promised_delivery_date };
  if (row.planned_receipt_date !== null) return { field: "planned_receipt_date", value: row.planned_receipt_date };
  return { field: null, value: null };
}

function receiptState(row) {
  if (row.required_quantity === null || row.received_quantity === null) return "unknown";
  if (row.received_quantity >= row.required_quantity) return "fully_received";
  if (row.received_quantity > 0) return "partially_received";
  return "not_received";
}

function orderTimingState(row, asOfDate, requiredInbound) {
  if (requiredInbound === 0) return { state: "not_needed", latest_order_date: null };
  if (row.need_date === null || row.lead_time_days === null) return { state: "unknown", latest_order_date: null };
  const latestOrderDate = subtractCalendarDays(row.need_date, row.lead_time_days);
  if (ACTIVE_PO_STATES.has(row.purchase_order_state)) {
    if (row.order_date === null) return { state: "unknown", latest_order_date: latestOrderDate };
    return {
      state: row.order_date <= latestOrderDate ? "ordered_within_lead_time" : "ordered_after_lead_time",
      latest_order_date: latestOrderDate,
    };
  }
  if (row.purchase_order_state === "unknown") return { state: "unknown", latest_order_date: latestOrderDate };
  return {
    state: asOfDate > latestOrderDate ? "not_ordered_past_lead_time" : "order_window_open",
    latest_order_date: latestOrderDate,
  };
}

function evaluateRow(row, asOfDate, defaultReceiptRequired) {
  const needsReceipt = row.receipt_required || defaultReceiptRequired;
  const receipt = receiptState(row);
  if (row.required_quantity === null || row.available_quantity === null || row.need_date === null) {
    return {
      ...row,
      inbound_date_field: null,
      inbound_date: null,
      inbound_quantity_counted: null,
      available_coverage_quantity: null,
      shortage_quantity: null,
      receipt_required: needsReceipt,
      receipt_state: receipt,
      purchase_order_readiness: "unknown",
      order_timing_state: "unknown",
      latest_order_date: null,
      schedule_state: "unknown",
      readiness_state: "unknown",
      reason: "need date, required quantity, or available quantity is unknown in the ERP snapshot",
    };
  }
  if (row.required_quantity === 0) {
    return {
      ...row,
      inbound_date_field: null,
      inbound_date: null,
      inbound_quantity_counted: 0,
      available_coverage_quantity: row.available_quantity,
      shortage_quantity: 0,
      receipt_required: needsReceipt,
      receipt_state: receipt,
      purchase_order_readiness: "not_needed",
      order_timing_state: "not_needed",
      latest_order_date: null,
      schedule_state: "not_applicable",
      readiness_state: "not_applicable",
      reason: "required quantity is zero",
    };
  }

  const requiredInbound = Math.max(0, row.required_quantity - row.available_quantity);
  const timing = orderTimingState(row, asOfDate, requiredInbound);
  if (requiredInbound === 0) {
    return {
      ...row,
      inbound_date_field: null,
      inbound_date: null,
      inbound_quantity_counted: 0,
      available_coverage_quantity: row.available_quantity,
      shortage_quantity: 0,
      receipt_required: needsReceipt,
      receipt_state: receipt,
      purchase_order_readiness: "not_needed",
      order_timing_state: timing.state,
      latest_order_date: timing.latest_order_date,
      schedule_state: "stock_ready",
      readiness_state: "ready",
      reason: "available ERP quantity covers the requirement; received quantity is not double-counted",
    };
  }
  if (row.purchase_order_state === "unknown" || row.open_purchase_quantity === null) {
    return {
      ...row,
      inbound_date_field: null,
      inbound_date: null,
      inbound_quantity_counted: null,
      available_coverage_quantity: null,
      shortage_quantity: null,
      receipt_required: needsReceipt,
      receipt_state: receipt,
      purchase_order_readiness: "unknown",
      order_timing_state: timing.state,
      latest_order_date: timing.latest_order_date,
      schedule_state: "unknown",
      readiness_state: "unknown",
      reason: "purchase-order state or open quantity is unknown in the ERP snapshot",
    };
  }
  if (!ACTIVE_PO_STATES.has(row.purchase_order_state)) {
    const readinessState = timing.state === "not_ordered_past_lead_time" ? "gap_late_order" : "gap_purchase_order";
    return {
      ...row,
      inbound_date_field: null,
      inbound_date: null,
      inbound_quantity_counted: 0,
      available_coverage_quantity: row.available_quantity,
      shortage_quantity: requiredInbound,
      receipt_required: needsReceipt,
      receipt_state: receipt,
      purchase_order_readiness: "not_ordered",
      order_timing_state: timing.state,
      latest_order_date: timing.latest_order_date,
      schedule_state: "supply_unconfirmed",
      readiness_state: readinessState,
      reason: "available quantity is insufficient and no open released, acknowledged, or in-transit purchase supply is present",
    };
  }
  const countedInbound = row.open_purchase_quantity;
  const coverage = row.available_quantity + countedInbound;
  const shortage = Math.max(0, row.required_quantity - coverage);
  if (shortage > 0) {
    return {
      ...row,
      inbound_date_field: null,
      inbound_date: null,
      inbound_quantity_counted: countedInbound,
      available_coverage_quantity: coverage,
      shortage_quantity: shortage,
      receipt_required: needsReceipt,
      receipt_state: receipt,
      purchase_order_readiness: "insufficient_open_quantity",
      order_timing_state: timing.state,
      latest_order_date: timing.latest_order_date,
      schedule_state: "shortage",
      readiness_state: "gap_shortage",
      reason: "available plus open purchase quantity is below the required quantity",
    };
  }
  const inbound = selectInboundDate(row);
  if (inbound.value === null) {
    return {
      ...row,
      inbound_date_field: null,
      inbound_date: null,
      inbound_quantity_counted: countedInbound,
      available_coverage_quantity: coverage,
      shortage_quantity: 0,
      receipt_required: needsReceipt,
      receipt_state: receipt,
      purchase_order_readiness: "open_supply",
      order_timing_state: timing.state,
      latest_order_date: timing.latest_order_date,
      schedule_state: "unknown",
      readiness_state: "unknown",
      reason: "open supply covers quantity but no planned, promised, or confirmed receipt date is available",
    };
  }
  if (inbound.value < asOfDate && receipt !== "fully_received") {
    const receiptUnknown = receipt === "unknown";
    return {
      ...row,
      inbound_date_field: inbound.field,
      inbound_date: inbound.value,
      inbound_quantity_counted: countedInbound,
      available_coverage_quantity: coverage,
      shortage_quantity: 0,
      receipt_required: needsReceipt,
      receipt_state: receipt,
      purchase_order_readiness: "open_supply",
      order_timing_state: timing.state,
      latest_order_date: timing.latest_order_date,
      schedule_state: "overdue",
      readiness_state: receiptUnknown ? "unknown" : "gap_overdue_receipt",
      reason: receiptUnknown
        ? "the supplied inbound date is before the snapshot date but receipt completion is unknown"
        : "the supplied inbound date is before the snapshot date and receipt is not fully recorded",
    };
  }
  const onTime = inbound.value <= row.need_date;
  return {
    ...row,
    inbound_date_field: inbound.field,
    inbound_date: inbound.value,
    inbound_quantity_counted: countedInbound,
    available_coverage_quantity: coverage,
    shortage_quantity: 0,
    receipt_required: needsReceipt,
    receipt_state: receipt,
    purchase_order_readiness: "open_supply",
    order_timing_state: timing.state,
    latest_order_date: timing.latest_order_date,
    schedule_state: onTime ? "on_time" : "late",
    readiness_state: onTime ? "ready" : "gap_late_delivery",
    reason: onTime
      ? "open supply covers quantity and the supplied inbound date is on or before the need date"
      : "open supply covers quantity but the supplied inbound date is after the need date",
  };
}

function assessmentState(rows) {
  if (rows.every((row) => row.readiness_state === "not_applicable")) return "not_applicable";
  if (rows.some((row) => row.readiness_state.startsWith("gap_"))) return "not_ready";
  if (rows.some((row) => row.readiness_state === "unknown")) return "unknown";
  return "ready";
}

function rootFactFields(row) {
  const fields = new Set(["receipt_required", "required_quantity"]);
  if (row.required_quantity !== null) fields.add("received_quantity");
  if (row.required_quantity !== null) fields.add("available_quantity");
  if (row.required_quantity !== null && row.available_quantity !== null) fields.add("need_date");
  return fields;
}

function timingFactFields(row, requiredInbound) {
  if (requiredInbound === 0) return new Set();
  const fields = new Set(["need_date"]);
  if (row.need_date === null) return fields;
  fields.add("lead_time_days");
  if (row.lead_time_days === null) return fields;
  fields.add("purchase_order_state");
  if (ACTIVE_PO_STATES.has(row.purchase_order_state)) fields.add("order_date");
  return fields;
}

function inboundFactFields(row) {
  const fields = new Set(["confirmed_receipt_date"]);
  if (row.confirmed_receipt_date !== null) return fields;
  fields.add("promised_delivery_date");
  if (row.promised_delivery_date !== null) return fields;
  fields.add("planned_receipt_date");
  return fields;
}

function mergeFields(...sets) {
  return new Set(sets.flatMap((set) => [...set]));
}

function isUnknownFact(field, value) {
  return value === null || (field === "purchase_order_state" && value === "unknown");
}

function branchTrace(row) {
  const rootFields = rootFactFields(row);
  const rules = new Set(["MPR-RECEIPT", "MPR-SHORTAGE"]);
  let fields = rootFields;
  let neededNext = [];
  const requiredInbound = row.required_quantity === null || row.available_quantity === null
    ? null
    : Math.max(0, row.required_quantity - row.available_quantity);

  if (row.required_quantity === null || row.available_quantity === null || row.need_date === null) {
    if (row.need_date === null && rootFields.has("need_date")) rules.add("MPR-DELIVERY-DATE");
    neededNext = [...rootFields].filter((field) => isUnknownFact(field, row[field]));
  } else if (row.required_quantity === 0 || requiredInbound === 0) {
    // Stock-ready and not-applicable both return before timing/PO/date inspection.
  } else {
    const timingFields = timingFactFields(row, requiredInbound);
    fields = mergeFields(rootFields, timingFields, new Set(["purchase_order_state"]));
    rules.add("MPR-PURCHASE-ORDER");
    if (timingFields.has("lead_time_days")) rules.add("MPR-LEAD-TIME");

    if (row.purchase_order_state === "unknown") {
      neededNext = ["purchase_order_state"];
    } else {
      fields.add("open_purchase_quantity");
      if (row.open_purchase_quantity === null) {
        neededNext = ["open_purchase_quantity"];
      } else if (ACTIVE_PO_STATES.has(row.purchase_order_state)
        && row.available_quantity + row.open_purchase_quantity >= row.required_quantity) {
        const inboundFields = inboundFactFields(row);
        fields = mergeFields(fields, inboundFields);
        rules.add("MPR-DELIVERY-DATE");
        if (row.inbound_date === null) neededNext = [...inboundFields].filter((field) => row[field] === null);
        if (row.schedule_state === "overdue" && row.receipt_state === "unknown") neededNext = ["received_quantity"];
      }
    }
  }

  const factFields = [...fields].sort(compareCodePoints);
  return {
    rule_ids: [...rules].sort(compareCodePoints),
    fact_fields_used: factFields,
    unknown_or_missing_fact_fields: factFields.filter((field) => isUnknownFact(field, row[field])),
    needed_next: [...new Set(neededNext)].sort(compareCodePoints),
  };
}

function makeDecisionBasis(row, ruleset, materialNeedBinding) {
  const trace = branchTrace(row);
  const packageSourceRefs = [...new Set(trace.rule_ids.flatMap((ruleId) => RULE_BY_ID.get(ruleId).source_refs))]
    .sort(compareCodePoints);
  return {
    schema_version: "soulforge.material_procurement_readiness.decision_basis.v0",
    rule_ids: trace.rule_ids,
    fact_fields_used: trace.fact_fields_used,
    unknown_or_missing_fact_fields: trace.unknown_or_missing_fact_fields,
    needed_next: trace.needed_next,
    package_source_refs: packageSourceRefs,
    project_evidence_refs: {
      material_need_source_ref: materialNeedBinding.source_ref,
      open_purchase_quantity_proof_ref: materialNeedBinding.open_purchase_quantity_proof_ref,
    },
    source_packet_ref: ruleset.source_packet_ref,
    interpretation: "soulforge_candidate_interpretation_not_source_authored_rule",
  };
}

export function evaluateMaterialProcurementReadiness(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
  const ruleset = copyAndValidateRuleset(effectiveRuleSet);
  assertNoAuthority(authority);
  const facts = copyFacts(typedProjectFacts, cutoffs);
  const materialNeedBindings = new Map(facts.project_binding.material_need_bindings.map((binding) => [binding.material_need_ref, binding]));
  const rows = facts.rows.map((row) => {
    const evaluated = evaluateRow(row, facts.as_of_date, ruleset.policy.default_receipt_required);
    return { ...evaluated, decision_basis: makeDecisionBasis(evaluated, ruleset, materialNeedBindings.get(row.material_need_ref)) };
  });
  const assessment = {
    schema_version: MPR_ASSESSMENT_SCHEMA,
    domain_engine_id: "material_procurement_readiness",
    state: assessmentState(rows),
    material_count: rows.length,
    ready_count: rows.filter((row) => row.readiness_state === "ready").length,
    gap_count: rows.filter((row) => row.readiness_state.startsWith("gap_")).length,
    unknown_count: rows.filter((row) => row.readiness_state === "unknown").length,
  };
  const domainResult = {
    schema_version: MPR_DOMAIN_RESULT_SCHEMA,
    domain_engine_id: "material_procurement_readiness",
    ruleset_ref: ruleset.ruleset_ref,
    source_packet_ref: ruleset.source_packet_ref,
    project_binding_lineage: {
      project_id: facts.project_binding.project_id,
      domain_engine_id: facts.project_binding.domain_engine_id,
      binding_revision_hash: facts.project_binding.binding_revision_hash,
      source_manifest_ref: facts.project_binding.source_manifest_ref,
      source_refs: facts.project_binding.source_refs,
    },
    erp_snapshot_ref: facts.erp_snapshot_ref,
    as_of_date: facts.as_of_date,
    facts_digest: facts.facts_digest,
    valid_at: facts.valid_at,
    known_at: facts.known_at,
    rows,
  };
  const inputDigest = sha256Hex(`soulforge.material_procurement_readiness.input.v0\n${stableJson({ ruleset, facts })}`);
  const resultDigest = sha256Hex(`soulforge.material_procurement_readiness.result.v0\n${stableJson({ assessment, domain_result: domainResult })}`);
  const receipt = {
    schema_version: MPR_RECEIPT_SCHEMA,
    input_digest: `sha256:${inputDigest}`,
    result_digest: `sha256:${resultDigest}`,
    project_binding_lineage: domainResult.project_binding_lineage,
    erp_snapshot_ref: facts.erp_snapshot_ref,
    facts_digest: facts.facts_digest,
    valid_at: facts.valid_at,
    known_at: facts.known_at,
    effects: {
      filesystem_write: 0,
      network: 0,
      erp_mutation: 0,
      purchase_order_mutation: 0,
      supplier_commitment: 0,
      task_creation: 0,
    },
  };
  return freezeDeep({ assessment, domain_result: domainResult, receipt });
}
