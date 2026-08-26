// Public-safe synthetic facts only. No supplier, customer, project, ERP, inventory, or PO data
// is represented here; all identifiers and values are artificial test material.
import { adaptMaterialProcurementProjectEvidence } from "../evaluator/material_procurement_project_evidence_adapter.mjs";

const SNAPSHOT_HASH = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const SOURCE_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MANIFEST_HASH = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NET_OPEN_PROOF_HASH = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

function ref(entityId, revisionId, contentHash) {
  return {
    entity_id: entityId,
    revision_id: revisionId,
    content_id: `sha256:${contentHash}`,
    content_hash_alg: "sha256",
  };
}

const CASES = Object.freeze({
  READY_STOCK: Object.freeze({
    assessment_state: "ready",
    readiness_state: "ready",
    schedule_state: "stock_ready",
    receipt_state: "not_received",
    row: Object.freeze({
      available_quantity: 10,
      confirmed_receipt_date: null,
      lead_time_days: 10,
      material_need_ref: "synthetic-need-ready-stock",
      material_ref: "synthetic-material-stock",
      need_date: "2026-10-15",
      open_purchase_quantity: 0,
      order_date: null,
      planned_receipt_date: null,
      promised_delivery_date: null,
      purchase_order_state: "not_ordered",
      quantity_uom: "ea",
      receipt_required: false,
      received_quantity: 0,
      required_quantity: 10,
    }),
  }),
  READY_INBOUND: Object.freeze({
    assessment_state: "ready",
    readiness_state: "ready",
    schedule_state: "on_time",
    receipt_state: "not_received",
    row: Object.freeze({
      available_quantity: 2,
      confirmed_receipt_date: "2026-10-10",
      lead_time_days: 10,
      material_need_ref: "synthetic-need-ready-inbound",
      material_ref: "synthetic-material-inbound",
      need_date: "2026-10-15",
      open_purchase_quantity: 8,
      order_date: "2026-09-20",
      planned_receipt_date: "2026-10-11",
      promised_delivery_date: "2026-10-12",
      purchase_order_state: "supplier_acknowledged",
      quantity_uom: "ea",
      receipt_required: false,
      received_quantity: 0,
      required_quantity: 10,
    }),
  }),
  SHORTAGE: Object.freeze({
    assessment_state: "not_ready",
    readiness_state: "gap_shortage",
    schedule_state: "shortage",
    receipt_state: "partially_received",
    row: Object.freeze({
      available_quantity: 2,
      confirmed_receipt_date: "2026-10-10",
      lead_time_days: 10,
      material_need_ref: "synthetic-need-shortage",
      material_ref: "synthetic-material-shortage",
      need_date: "2026-10-15",
      open_purchase_quantity: 3,
      order_date: "2026-09-20",
      planned_receipt_date: null,
      promised_delivery_date: null,
      purchase_order_state: "released",
      quantity_uom: "ea",
      receipt_required: false,
      received_quantity: 1,
      required_quantity: 10,
    }),
  }),
  LATE_DELIVERY: Object.freeze({
    assessment_state: "not_ready",
    readiness_state: "gap_late_delivery",
    schedule_state: "late",
    receipt_state: "not_received",
    row: Object.freeze({
      available_quantity: 0,
      confirmed_receipt_date: "2026-10-20",
      lead_time_days: 10,
      material_need_ref: "synthetic-need-late-delivery",
      material_ref: "synthetic-material-late-delivery",
      need_date: "2026-10-15",
      open_purchase_quantity: 10,
      order_date: "2026-10-01",
      planned_receipt_date: null,
      promised_delivery_date: null,
      purchase_order_state: "released",
      quantity_uom: "ea",
      receipt_required: false,
      received_quantity: 0,
      required_quantity: 10,
    }),
  }),
  OVERDUE_RECEIPT: Object.freeze({
    assessment_state: "not_ready",
    readiness_state: "gap_overdue_receipt",
    schedule_state: "overdue",
    receipt_state: "not_received",
    row: Object.freeze({
      available_quantity: 2,
      confirmed_receipt_date: "2026-10-09",
      lead_time_days: 10,
      material_need_ref: "synthetic-need-overdue-receipt",
      material_ref: "synthetic-material-overdue-receipt",
      need_date: "2026-10-15",
      open_purchase_quantity: 8,
      order_date: "2026-09-20",
      planned_receipt_date: "2026-10-11",
      promised_delivery_date: "2026-10-12",
      purchase_order_state: "supplier_acknowledged",
      quantity_uom: "ea",
      receipt_required: false,
      received_quantity: 0,
      required_quantity: 10,
    }),
  }),
  LATE_ORDER: Object.freeze({
    assessment_state: "not_ready",
    readiness_state: "gap_late_order",
    schedule_state: "supply_unconfirmed",
    receipt_state: "not_received",
    row: Object.freeze({
      available_quantity: 1,
      confirmed_receipt_date: null,
      lead_time_days: 10,
      material_need_ref: "synthetic-need-late-order",
      material_ref: "synthetic-material-late-order",
      need_date: "2026-10-15",
      open_purchase_quantity: 0,
      order_date: null,
      planned_receipt_date: null,
      promised_delivery_date: null,
      purchase_order_state: "not_ordered",
      quantity_uom: "ea",
      receipt_required: false,
      received_quantity: 0,
      required_quantity: 10,
    }),
  }),
  UNKNOWN: Object.freeze({
    assessment_state: "unknown",
    readiness_state: "unknown",
    schedule_state: "unknown",
    receipt_state: "unknown",
    row: Object.freeze({
      available_quantity: 5,
      confirmed_receipt_date: null,
      lead_time_days: null,
      material_need_ref: "synthetic-need-unknown",
      material_ref: "synthetic-material-unknown",
      need_date: "2026-10-15",
      open_purchase_quantity: null,
      order_date: null,
      planned_receipt_date: null,
      promised_delivery_date: null,
      purchase_order_state: "unknown",
      quantity_uom: "ea",
      receipt_required: false,
      received_quantity: null,
      required_quantity: 10,
    }),
  }),
});

export const MATERIAL_PROCUREMENT_READINESS_PUBLIC_CASES = Object.freeze(
  Object.entries(CASES).map(([case_id, expected]) => Object.freeze({ case_id, ...expected })),
);

export function buildMaterialProcurementReadinessPublicSyntheticEvidenceInput(caseId = "READY_INBOUND", { proof = true } = {}) {
  const selected = CASES[caseId];
  if (!selected) throw new Error(`unknown public synthetic material-procurement case: ${caseId}`);
  const erpSnapshotRef = ref("public-synthetic-erp-snapshot-v0", "2026-10-10", SNAPSHOT_HASH);
  const sourceRef = ref("public-synthetic-e03-source", "v1", SOURCE_HASH);
  const manifestRef = ref("public-synthetic-e03-manifest", "v1", MANIFEST_HASH);
  const proofRef = proof && selected.row.open_purchase_quantity !== null
    ? ref("public-synthetic-net-open-proof", "v1", NET_OPEN_PROOF_HASH)
    : null;
  return {
    project_binding: {
      schema_version: "soulforge.material_procurement_readiness.project_binding.v0",
      project_id: "public-synthetic-e03-project",
      domain_engine_id: "material_procurement_readiness",
      binding_revision_hash: `sha256:${MANIFEST_HASH}`,
      source_manifest_ref: manifestRef,
      source_refs: proofRef ? [sourceRef, proofRef, manifestRef, erpSnapshotRef] : [sourceRef, manifestRef, erpSnapshotRef],
      erp_snapshot_ref: erpSnapshotRef,
      fact_authority: "erp_owned_read_only_snapshot",
      material_need_bindings: [{
        material_need_ref: selected.row.material_need_ref,
        source_ref: sourceRef,
        open_purchase_quantity_proof_ref: proofRef,
      }],
    },
    erp_snapshot: {
      schema_version: "soulforge.material_procurement_readiness.erp_snapshot_facts.v0",
      project_id: "public-synthetic-e03-project",
      as_of_date: "2026-10-10",
      erp_snapshot_ref: erpSnapshotRef,
      fact_authority: "erp_owned_read_only_snapshot",
      rows: [structuredClone(selected.row)],
    },
    cutoffs: {
      valid_at: "2026-10-10T00:00:00.000Z",
      known_at: "2026-10-10T00:00:00.000Z",
    },
  };
}

export function buildMaterialProcurementReadinessPublicSyntheticRequest(caseId = "READY_INBOUND") {
  return adaptMaterialProcurementProjectEvidence(buildMaterialProcurementReadinessPublicSyntheticEvidenceInput(caseId));
}
