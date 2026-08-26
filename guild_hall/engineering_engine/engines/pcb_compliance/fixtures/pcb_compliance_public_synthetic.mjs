// Public-synthetic only. These refs are deliberately opaque tokens and not project paths,
// standard bodies, customer facts, or an actual application decision.
import {
  PCB_COMPLIANCE_RULESET_REF,
  PCB_COMPLIANCE_SOURCE_PACKET_REF,
  PCB_COMPLIANCE_SOURCE_PACKET_SHA256 as SOURCE_PACKET_SHA256,
} from "../rules/pcb_compliance_rules.mjs";

const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

const APPLICABLE = Object.freeze({
  approval_scope: true,
  document_revision: true,
  jurisdiction: true,
  project_binding: true,
  time_window: true,
});

function row(rule_id, case_id, observation, extras = {}) {
  return {
    case_id,
    rule_id,
    applicability: { ...APPLICABLE },
    authority_bindings: [{ family: "project_contract_baseline", authority_ref: "synthetic_contract_baseline_v0" }],
    observation,
    ...extras,
  };
}

export const PCB_COMPLIANCE_SOURCE_PACKET_SHA256 = SOURCE_PACKET_SHA256;

export const PCB_COMPLIANCE_PUBLIC_SYNTHETIC_FIXTURE = freezeDeep({
  claim_ceiling: "source_supported",
  ruleset_ref: { ...PCB_COMPLIANCE_RULESET_REF },
  source_packet_ref: { ...PCB_COMPLIANCE_SOURCE_PACKET_REF },
  locked_case_ids: [
    "pcb_synthetic_fab_satisfied",
    "pcb_synthetic_inspect_missing",
    "pcb_synthetic_protect_not_applicable",
    "pcb_synthetic_tool_authority_hold",
    "pcb_synthetic_trace_conflict",
    "pcb_synthetic_standard_controlled_hold",
  ],
});

export function buildPcbCompliancePublicSyntheticRequest() {
  return {
    schema_version: "soulforge.pcb_compliance.request.v0",
    binding: {
      domain_engine_id: "pcb_compliance",
      source_packet_ref: { ...PCB_COMPLIANCE_SOURCE_PACKET_REF },
      ruleset_ref: { ...PCB_COMPLIANCE_RULESET_REF },
    },
    domain_input: {
      schema_version: "soulforge.pcb_compliance.domain_input.v0",
      rows: [
        row("PCB-NASA-FAB-01", "pcb_synthetic_fab_satisfied", {
          attempted: true,
          evidence_state: "present",
          evidence_by_key: {
            approved_instruction_ref: ["synthetic_approved_instruction"],
            manufacturing_documentation_ref: ["synthetic_manufacturing_documentation"],
          },
        }),
        row("PCB-NASA-INSPECT-01", "pcb_synthetic_inspect_missing", {
          attempted: true,
          evidence_state: "absent_confirmed",
          evidence_by_key: {
            applicable_criteria_ref: ["synthetic_criteria_absence_observation"],
            inspection_record_ref: ["synthetic_inspection_absence_observation"],
          },
        }, {
          standard_binding: {
            body_access_state: "owner_approved_lawful",
            lawful_source_ref: "synthetic_authorized_criteria_source_v0",
            standard_revision_ref: "synthetic_authorized_criteria_v0",
          },
        }),
        row("PCB-NASA-PROTECT-01", "pcb_synthetic_protect_not_applicable", {
          attempted: false,
          evidence_state: "unknown",
          evidence_by_key: {
            manufacturing_documentation_ref: ["synthetic_protection_scope_observation"],
          },
        }, {
          applicability: {
            approval_scope: false,
            document_revision: true,
            jurisdiction: true,
            project_binding: true,
            time_window: true,
          },
        }),
        row("PCB-NASA-TOOL-01", "pcb_synthetic_tool_authority_hold", {
          attempted: true,
          evidence_state: "present",
          evidence_by_key: {
            tool_control_ref: ["synthetic_tool_control"],
          },
        }, {
          authority_bindings: [],
        }),
        row("PCB-NASA-TRACE-01", "pcb_synthetic_trace_conflict", {
          attempted: true,
          evidence_state: "conflict",
          evidence_by_key: {
            build_record_ref: ["synthetic_build_record"],
            nonconformance_record_ref: ["synthetic_ncr"],
          },
        }),
        row("PCB-STD-APPLICABILITY-01", "pcb_synthetic_standard_controlled_hold", {
          attempted: true,
          evidence_state: "present",
          evidence_by_key: {
            lawful_access_authorization_ref: ["synthetic_ipc_revision_catalog"],
            standard_applicability_ref: ["synthetic_standard_applicability"],
            standard_revision_ref: ["ipc-a-610-rev-j-2024-03"],
          },
        }, {
          standard_binding: {
            body_access_state: "metadata_only",
            lawful_source_ref: "synthetic_no_body_authority_v0",
            standard_revision_ref: "ipc-a-610-rev-j-2024-03",
          },
        }),
      ],
    },
    cutoffs: {
      valid_at: "2026-08-26T00:00:00.000Z",
      known_at: "2026-08-26T00:00:00.000Z",
    },
  };
}
