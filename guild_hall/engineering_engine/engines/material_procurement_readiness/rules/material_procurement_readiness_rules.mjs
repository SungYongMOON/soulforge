// E03 Material and Procurement Readiness candidate vocabulary. It stores short public-safe
// metadata only; ERP rows, supplier information, contract terms, and source bodies are excluded.
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";

export const MATERIAL_PROCUREMENT_READINESS_RULESET_SCHEMA = "soulforge.material_procurement_readiness.ruleset.v0";
export const MATERIAL_PROCUREMENT_READINESS_RULESET_REVISION = "soulforge.material_procurement_readiness.ruleset.v0";

export const MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF = Object.freeze({
  entity_id: "material-procurement-readiness-source-packet-v0",
  revision_id: "material-procurement-readiness-source-packet-v0",
  content_id: "sha256:330fe1252fa29dff461d0f2b0fd5fa3a6d32848054f19a6630d625a2d1fe9332",
  content_hash_alg: "sha256",
});

const freezeRule = (rule) => Object.freeze({
  ...rule,
  required_fact_fields: Object.freeze([...rule.required_fact_fields]),
  source_refs: Object.freeze([...rule.source_refs]),
});

// Ordered by rule_id. These package-local checks are selected only by an exact bound ruleset;
// they do not create a purchase requirement or a source applicability decision.
export const MATERIAL_PROCUREMENT_READINESS_RULES = Object.freeze([
  freezeRule({
    rule_id: "MPR-DELIVERY-DATE",
    source_refs: ["S1-D365-PO-DATES", "S3-ORACLE-PROCUREMENT-24D"],
    source_locator: "S1 requested/confirmed receipt-date concepts; S3 OriginalPromisedDeliveryDate field",
    required_fact_fields: ["need_date", "promised_delivery_date|confirmed_receipt_date|planned_receipt_date"],
  }),
  freezeRule({
    rule_id: "MPR-LEAD-TIME",
    source_refs: ["S1-D365-PO-DATES"],
    source_locator: "lead time and requested-receipt-date explanation",
    required_fact_fields: ["as_of_date", "lead_time_days", "need_date", "order_date"],
  }),
  freezeRule({
    rule_id: "MPR-PURCHASE-ORDER",
    source_refs: ["S2-OASIS-UBL-2.3", "S3-ORACLE-PROCUREMENT-24D"],
    source_locator: "UBL Order/OrderResponse schemas; Oracle Order field",
    required_fact_fields: ["open_purchase_quantity", "purchase_order_state"],
  }),
  freezeRule({
    rule_id: "MPR-RECEIPT",
    source_refs: ["S2-OASIS-UBL-2.3"],
    source_locator: "UBL ReceiptAdvice schema",
    required_fact_fields: ["received_quantity"],
  }),
  freezeRule({
    rule_id: "MPR-SHORTAGE",
    source_refs: ["S1-D365-PO-DATES", "S2-OASIS-UBL-2.3"],
    source_locator: "date concepts plus order/receipt document distinction",
    required_fact_fields: ["available_quantity", "open_purchase_quantity", "required_quantity"],
  }),
]);

const digestMaterial = {
  schema_version: MATERIAL_PROCUREMENT_READINESS_RULESET_SCHEMA,
  revision: MATERIAL_PROCUREMENT_READINESS_RULESET_REVISION,
  source_packet_ref: MATERIAL_PROCUREMENT_READINESS_SOURCE_PACKET_REF,
  rules: MATERIAL_PROCUREMENT_READINESS_RULES,
};

const rulesetDigest = sha256Hex(
  `soulforge.material_procurement_readiness.ruleset.digest.v0\n${canonicalise(digestMaterial, {
    rules: "sorted_by:rule_id",
    "rules[].required_fact_fields": "insertion_ordered",
    "rules[].source_refs": "insertion_ordered",
  })}`,
);

export const MATERIAL_PROCUREMENT_READINESS_RULESET_REF = Object.freeze({
  entity_id: "material-procurement-readiness-ruleset-v0",
  revision_id: MATERIAL_PROCUREMENT_READINESS_RULESET_REVISION,
  content_id: `sha256:${rulesetDigest}`,
  content_hash_alg: "sha256",
});

export const PURCHASE_ORDER_STATES = Object.freeze([
  "cancelled",
  "closed",
  "draft",
  "in_transit",
  "not_ordered",
  "released",
  "supplier_acknowledged",
  "unknown",
]);

export function isPurchaseOrderState(value) {
  return typeof value === "string" && PURCHASE_ORDER_STATES.includes(value);
}
