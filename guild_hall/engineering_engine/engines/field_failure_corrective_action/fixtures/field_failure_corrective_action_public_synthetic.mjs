// Public-synthetic FFCA fixture. Identifiers are opaque synthetic references, never source
// bodies, customer data, real lots/assets, dispositions, approvals, or closure decisions.
import {
  FFCA_RULESET_REF,
  FFCA_SOURCE_PACKET_REF,
} from "../rules/field_failure_corrective_action_rules.mjs";
import { computeFfcaSourceManifestDigest } from "../rules/field_failure_corrective_action_binding_integrity.mjs";
import { adaptProjectEvidence } from "../../../core/interfaces/domain_engine_adapter.mjs";
import {
  FFCA_DOMAIN_INPUT_SCHEMA,
  FFCA_REQUEST_SCHEMA,
} from "../evaluator/field_failure_corrective_action.mjs";

export const FFCA_PUBLIC_SYNTHETIC_FIXTURE_ID = "field_failure_corrective_action_public_synthetic_v0";

const SOURCE_BINDINGS = Object.freeze([
  Object.freeze({
    access_class: "official_public_html",
    applicability_binding_ref: "applicability-nrc50-synthetic-v1",
    source_id: "S1-NRC-10CFR50-APPB",
    source_revision_ref: "ecfr-title10-2026-08-21",
  }),
  Object.freeze({
    access_class: "official_public_html",
    applicability_binding_ref: "applicability-nrc21-synthetic-v1",
    source_id: "S2-NRC-10CFR21",
    source_revision_ref: "ecfr-title10-2026-08-21",
  }),
  Object.freeze({
    access_class: "official_public_html_with_protected_ibr",
    applicability_binding_ref: "applicability-fda-qmsr-synthetic-v1",
    source_id: "S3-FDA-QMSR-2026",
    source_revision_ref: "fda-qmsr-page-2026-02-02",
  }),
]);

export const FFCA_PUBLIC_SYNTHETIC_PROJECT_BINDING = Object.freeze({
  schema_version: "soulforge.project_binding.v0",
  project_id: "ffca-public-synthetic-project",
  domain_engine_id: "field_failure_corrective_action",
  binding_revision_hash: "a".repeat(64),
  source_manifest_ref: "sha256:" + computeFfcaSourceManifestDigest(SOURCE_BINDINGS),
});

function links(id) {
  return {
    affected_asset_refs: [`asset-${id}`],
    affected_lot_refs: [],
    configuration_refs: [`config-${id}`],
    evidence_receipt_refs: [`receipt-${id}`],
    test_refs: [`test-${id}`],
  };
}

function satisfiedRow({ row_id, case_id, rule_id, case_kind = "field_failure", evidence, change_state = undefined }) {
  return {
    ...(change_state === undefined ? {} : { change_state }),
    applicability_state: "applicable",
    case_id,
    case_kind,
    evidence,
    links: links(row_id.toLowerCase()),
    observation_state: "present",
    row_id,
    rule_id,
  };
}

export function buildFieldFailureCorrectiveActionPublicSyntheticRequest() {
  return {
    binding: {
      project_binding_ref: { ...FFCA_PUBLIC_SYNTHETIC_PROJECT_BINDING },
      ruleset_ref: { ...FFCA_RULESET_REF },
      source_bindings: SOURCE_BINDINGS.map((source) => ({ ...source })),
      source_packet_ref: { ...FFCA_SOURCE_PACKET_REF },
    },
    cutoffs: {
      known_at: "2026-08-26T00:00:00.000Z",
      valid_at: "2026-08-26T00:00:00.000Z",
    },
    domain_input: {
      rows: [
        satisfiedRow({
          row_id: "ROW-001",
          case_id: "CASE-READY",
          rule_id: "FFCA-ACTION-01",
          evidence: {
            action_owner_ref: "owner-ready-action",
            corrective_action_ref: "action-ready",
            target_date_ref: "target-ready",
          },
        }),
        satisfiedRow({
          row_id: "ROW-002",
          case_id: "CASE-READY",
          rule_id: "FFCA-CHANGE-01",
          change_state: "required",
          evidence: {
            change_propagation_review_ref: "propagation-ready",
            related_change_ref: "change-ready",
          },
        }),
        satisfiedRow({
          row_id: "ROW-003",
          case_id: "CASE-READY",
          rule_id: "FFCA-CLOSURE-01",
          evidence: {
            closure_evidence_index_ref: "closure-evidence-ready",
            closure_readiness_review_ref: "closure-review-ready",
          },
        }),
        satisfiedRow({
          row_id: "ROW-004",
          case_id: "CASE-READY",
          rule_id: "FFCA-CONTAIN-01",
          evidence: {
            containment_owner_ref: "owner-ready-containment",
            containment_record_ref: "containment-ready",
            containment_scope_ref: "scope-ready",
          },
        }),
        satisfiedRow({
          row_id: "ROW-005",
          case_id: "CASE-READY",
          rule_id: "FFCA-EFFECT-01",
          evidence: {
            effectiveness_criteria_ref: "criteria-ready",
            effectiveness_owner_ref: "owner-ready-effectiveness",
            effectiveness_verification_ref: "verification-ready",
          },
        }),
        satisfiedRow({
          row_id: "ROW-006",
          case_id: "CASE-READY",
          rule_id: "FFCA-INTAKE-01",
          evidence: {
            failure_description_ref: "failure-ready",
            intake_owner_ref: "owner-ready-intake",
            intake_receipt_ref: "intake-ready",
          },
        }),
        satisfiedRow({
          row_id: "ROW-007",
          case_id: "CASE-READY",
          rule_id: "FFCA-RCA-01",
          evidence: {
            root_cause_method_ref: "method-ready",
            root_cause_owner_ref: "owner-ready-rootcause",
            root_cause_record_ref: "rootcause-ready",
          },
        }),
        satisfiedRow({
          row_id: "ROW-008",
          case_id: "CASE-READY",
          rule_id: "FFCA-RECURRENCE-01",
          evidence: {
            recurrence_owner_ref: "owner-ready-recurrence",
            recurrence_review_ref: "recurrence-ready",
            recurrence_scope_ref: "recurrence-scope-ready",
          },
        }),
        {
          applicability_state: "applicable",
          case_id: "CASE-MISSING",
          case_kind: "ncr",
          evidence: {},
          links: links("row-009"),
          observation_state: "absent",
          row_id: "ROW-009",
          rule_id: "FFCA-CONTAIN-01",
        },
        {
          applicability_state: "unknown",
          case_id: "CASE-UNKNOWN",
          case_kind: "car",
          evidence: {},
          links: links("row-010"),
          observation_state: "unknown",
          row_id: "ROW-010",
          rule_id: "FFCA-RCA-01",
        },
        {
          applicability_state: "applicable",
          case_id: "CASE-CONFLICT",
          case_kind: "car",
          conflict_claim_refs: ["claim-conflict-a", "claim-conflict-b"],
          evidence: {},
          links: links("row-011"),
          observation_state: "conflict",
          row_id: "ROW-011",
          rule_id: "FFCA-ACTION-01",
        },
      ],
      schema_version: FFCA_DOMAIN_INPUT_SCHEMA,
    },
    schema_version: FFCA_REQUEST_SCHEMA,
  };
}

export function buildFieldFailureCorrectiveActionPublicSyntheticTypedFacts() {
  const request = buildFieldFailureCorrectiveActionPublicSyntheticRequest();
  return adaptProjectEvidence(
    FFCA_PUBLIC_SYNTHETIC_PROJECT_BINDING,
    {
      snapshot_id: "ffca-public-synthetic-snapshot-v1",
      source_refs: ["ffca-public-synthetic-source-snapshot-v1"],
      observations: [request],
    },
    request.cutoffs,
  ).typed_project_facts;
}
