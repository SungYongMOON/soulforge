{
  "workflow_id": "page_quantitative_enrichment_v0",
  "fixture_id": "public_synthetic_values_gaps_conflict_overlay",
  "quantitative_slot_inventory": [
    {
      "target_slot": "interfaces.power.input_voltage",
      "quantity_kind": "voltage",
      "scope": "nominal",
      "existing_status": "missing",
      "required_for_harness": true,
      "evidence_candidates": ["fixture://sources/power-guide"],
      "missing_or_conflict_reason": null
    },
    {
      "target_slot": "performance.max_current",
      "quantity_kind": "maximum_current",
      "scope": "ambient <= 40 C; conflicting condition also present",
      "existing_status": "review_required",
      "required_for_harness": true,
      "evidence_candidates": [
        "fixture://sources/load-guide",
        "fixture://sources/conflict-guide"
      ],
      "missing_or_conflict_reason": "source_conflict"
    },
    {
      "target_slot": "performance.max_power",
      "quantity_kind": "derived_power",
      "scope": "depends on input voltage and maximum current",
      "existing_status": "missing",
      "required_for_harness": true,
      "evidence_candidates": [],
      "missing_or_conflict_reason": "derivation_blocked_by_conflicting_current_evidence"
    },
    {
      "target_slot": "interfaces.aux.input_voltage",
      "quantity_kind": "voltage",
      "scope": "auxiliary interface",
      "existing_status": "missing",
      "required_for_harness": true,
      "evidence_candidates": [],
      "missing_or_conflict_reason": "label_hint_has_no_approved_value_evidence"
    }
  ],
  "quantitative_claims": [
    {
      "target_slot": "interfaces.power.input_voltage",
      "claim_status": "filled",
      "field_status": "source_confirmed",
      "value": 5,
      "unit": "V",
      "condition": "nominal",
      "approved_evidence_ref": "fixture://sources/power-guide",
      "source_location_or_packet_ref": "page 4"
    },
    {
      "target_slot": "performance.max_current",
      "claim_status": "conflict",
      "field_status": "review_required",
      "candidates": [
        {
          "value": 2,
          "unit": "A",
          "condition": "ambient <= 40 C",
          "approved_evidence_ref": "fixture://sources/load-guide",
          "source_location_or_packet_ref": "page 8"
        },
        {
          "value": 1.5,
          "unit": "A",
          "condition": "condition unclear",
          "approved_evidence_ref": "fixture://sources/conflict-guide",
          "source_location_or_packet_ref": "page 3"
        }
      ],
      "resolution": "owner_or_source_review_required"
    },
    {
      "target_slot": "performance.max_power",
      "claim_status": "blocked_missing_source",
      "field_status": "missing",
      "value": null,
      "gap_ref": "gap-max-power-operands",
      "derivation": {
        "formula": "input_voltage * max_current",
        "operand_refs": [
          "interfaces.power.input_voltage",
          "performance.max_current"
        ],
        "derived_field_status": "blocked"
      }
    },
    {
      "target_slot": "interfaces.aux.input_voltage",
      "claim_status": "unchanged_missing",
      "field_status": "missing",
      "value": null,
      "gap_ref": "gap-aux-input-voltage"
    }
  ],
  "enriched_sidecar_overlay": {
    "overlay_kind": "patch_like_overlay_against_page_module_spec_v0",
    "replaces_original_sidecar": false,
    "source_payload_written": false,
    "patches": [
      {
        "target_slot": "interfaces.power.input_voltage",
        "proposed_status": "source_confirmed",
        "value": 5,
        "unit": "V",
        "condition": "nominal",
        "evidence_refs": ["fixture://sources/power-guide"]
      },
      {
        "target_slot": "performance.max_current",
        "proposed_status": "review_required",
        "evidence_refs": [
          "fixture://sources/load-guide",
          "fixture://sources/conflict-guide"
        ],
        "source_gap_refs": ["gap-max-current-conflict"]
      },
      {
        "target_slot": "performance.max_power",
        "proposed_status": "missing",
        "derivation_ref": "derivation-max-power-blocked",
        "source_gap_refs": ["gap-max-power-operands"]
      },
      {
        "target_slot": "interfaces.aux.input_voltage",
        "proposed_status": "missing",
        "source_gap_refs": ["gap-aux-input-voltage"]
      }
    ]
  },
  "source_gap_report": [
    {
      "gap_id": "gap-max-current-conflict",
      "target_slot": "performance.max_current",
      "gap_type": "source_conflict",
      "blocking_level": "blocks_harness",
      "details": "Two official synthetic sources provide incompatible values or unresolved conditions.",
      "available_inputs": [
        "fixture://sources/load-guide",
        "fixture://sources/conflict-guide"
      ],
      "downstream_impact": "Prevents authoritative maximum-current selection and blocks max-power derivation."
    },
    {
      "gap_id": "gap-max-power-operands",
      "target_slot": "performance.max_power",
      "gap_type": "missing_source_value",
      "blocking_level": "blocks_harness",
      "details": "The requested derivation cannot proceed while the maximum-current operand remains conflicted.",
      "available_inputs": [
        "interfaces.power.input_voltage",
        "performance.max_current"
      ],
      "downstream_impact": "Maximum power remains unavailable to harness composition."
    },
    {
      "gap_id": "gap-aux-input-voltage",
      "target_slot": "interfaces.aux.input_voltage",
      "gap_type": "missing_source_value",
      "blocking_level": "blocks_harness",
      "details": "The 12V AUX label hint is not approved value evidence.",
      "available_inputs": [
        "owner_recorded_constraints",
        "previous_harness_blocker_packet"
      ],
      "downstream_impact": "Auxiliary interface voltage remains unavailable."
    }
  ],
  "owner_followup_needed": [
    {
      "followup_id": "followup-max-current-resolution",
      "target_slot": "performance.max_current",
      "action": "Resolve the conflicting official-source values and clarify the applicable condition.",
      "can_unblock": [
        "performance.max_current",
        "performance.max_power"
      ],
      "required_before_rerun": true
    },
    {
      "followup_id": "followup-aux-voltage-evidence",
      "target_slot": "interfaces.aux.input_voltage",
      "action": "Provide approved voltage evidence and applicable scope for the auxiliary interface.",
      "can_unblock": ["interfaces.aux.input_voltage"],
      "required_before_rerun": true
    }
  ],
  "harness_readiness_delta": {
    "delta_only": true,
    "before": {
      "interfaces.power.input_voltage": "missing",
      "performance.max_current": "review_required",
      "performance.max_power": "missing",
      "interfaces.aux.input_voltage": "missing"
    },
    "after": {
      "interfaces.power.input_voltage": "source_confirmed",
      "performance.max_current": "review_required",
      "performance.max_power": "missing",
      "interfaces.aux.input_voltage": "missing"
    },
    "closed_blockers": [
      "Missing approved evidence for interfaces.power.input_voltage."
    ],
    "remaining_blockers": [
      "Conflicting evidence for performance.max_current.",
      "Blocked derivation for performance.max_power.",
      "Missing approved evidence for interfaces.aux.input_voltage."
    ],
    "newly_discovered_blockers": [],
    "candidate_safe_possible_for": [],
    "source_supported_possible_for": [],
    "not_claimed": [
      "Final harness connection validity",
      "Final circuit synthesis",
      "Automatic source-supported join promotion",
      "Global page readiness"
    ]
  },
  "enrichment_provenance": {
    "page_id": "PAGE-DEMO",
    "schema": "page_module_spec_v0",
    "source_checksum": "sha256:fixture-page",
    "overlay_target": "fixture://sidecars/page-demo-v0",
    "evidence_refs": [
      "fixture://sources/power-guide",
      "fixture://sources/load-guide",
      "fixture://sources/conflict-guide"
    ],
    "authority_preserved": [
      "source_page_xml",
      "page_module_spec_sidecar",
      "official_source_packets",
      "owner_recorded_constraints"
    ],
    "mutations": [],
    "uncertainties": [
      "performance.max_current source conflict unresolved",
      "performance.max_power derivation unavailable",
      "interfaces.aux.input_voltage lacks approved evidence"
    ]
  },
  "quantitative_enrichment_summary": {
    "status": "partial_enrichment_with_blockers",
    "confirmed_claim_count": 1,
    "derived_claim_count": 0,
    "review_required_claim_count": 1,
    "missing_claim_count": 2,
    "overlay_is_non_replacing": true,
    "source_gaps_are_machine_readable": true,
    "owner_followup_required": true,
    "final_harness_approval": "not performed_by_this_workflow"
  }
}
