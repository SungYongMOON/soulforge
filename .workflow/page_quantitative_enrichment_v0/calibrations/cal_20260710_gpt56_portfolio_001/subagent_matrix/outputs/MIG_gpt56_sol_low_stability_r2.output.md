{
  "schema_version": "page_quantitative_enrichment_result_v0",
  "workflow_id": "page_quantitative_enrichment_v0",
  "fixture_id": "public_synthetic_values_gaps_conflict_overlay",
  "page_id": "PAGE-DEMO",
  "execution_kind": "dry_run",
  "quantitative_slot_inventory": [
    {
      "target_slot": "interfaces.power.input_voltage",
      "quantity_kind": "voltage",
      "scope": "nominal input",
      "applies_to": "PAGE-DEMO",
      "existing_status": "missing",
      "required_for_harness": true,
      "evidence_candidates": [
        "fixture://sources/power-guide"
      ],
      "missing_or_conflict_reason": null
    },
    {
      "target_slot": "performance.max_current",
      "quantity_kind": "current",
      "scope": "maximum current",
      "applies_to": "PAGE-DEMO",
      "existing_status": "review_required",
      "required_for_harness": true,
      "evidence_candidates": [
        "fixture://sources/load-guide",
        "fixture://sources/conflict-guide"
      ],
      "missing_or_conflict_reason": "Official synthetic sources provide conflicting values under non-equivalent or unclear conditions."
    },
    {
      "target_slot": "performance.max_power",
      "quantity_kind": "power",
      "scope": "requested derivation",
      "applies_to": "PAGE-DEMO",
      "existing_status": "missing",
      "required_for_harness": true,
      "evidence_candidates": [],
      "missing_or_conflict_reason": "The requested derivation lacks a source-confirmed, non-conflicting max-current operand."
    },
    {
      "target_slot": "interfaces.aux.input_voltage",
      "quantity_kind": "voltage",
      "scope": "auxiliary input",
      "applies_to": "PAGE-DEMO",
      "existing_status": "missing",
      "required_for_harness": true,
      "evidence_candidates": [],
      "review_only_context": [
        {
          "kind": "label_hint",
          "value": "12V AUX",
          "approved_value_evidence": false
        },
        {
          "kind": "previous_harness_blocker",
          "value": "missing approved voltage evidence"
        }
      ],
      "missing_or_conflict_reason": "No approved evidence supports an auxiliary input-voltage value."
    }
  ],
  "quantitative_claims": [
    {
      "claim_id": "claim://PAGE-DEMO/interfaces.power.input_voltage",
      "target_slot": "interfaces.power.input_voltage",
      "claim_status": "filled",
      "field_status": "source_confirmed",
      "value": 5,
      "unit": "V",
      "condition_or_scope": "nominal",
      "approved_evidence_ref": "fixture://sources/power-guide",
      "source_location_or_packet_ref": "fixture://sources/power-guide#page-4"
    },
    {
      "claim_id": "claim://PAGE-DEMO/performance.max_current",
      "target_slot": "performance.max_current",
      "claim_status": "conflict",
      "field_status": "review_required",
      "value": null,
      "unit": "A",
      "condition_or_scope": "Unresolved because the cited conditions are non-equivalent or unclear.",
      "evidence_candidates": [
        {
          "value": 2,
          "unit": "A",
          "condition": "ambient <= 40 C",
          "approved_evidence_ref": "fixture://sources/load-guide",
          "source_location_or_packet_ref": "fixture://sources/load-guide#page-8"
        },
        {
          "value": 1.5,
          "unit": "A",
          "condition": "condition unclear",
          "approved_evidence_ref": "fixture://sources/conflict-guide",
          "source_location_or_packet_ref": "fixture://sources/conflict-guide#page-3"
        }
      ],
      "source_gap_ref": "gap://PAGE-DEMO/performance.max_current"
    },
    {
      "claim_id": "claim://PAGE-DEMO/performance.max_power",
      "target_slot": "performance.max_power",
      "claim_status": "blocked_missing_source",
      "field_status": "missing",
      "value": null,
      "unit": "W",
      "requested_formula": "input_voltage * max_current",
      "operand_refs": [
        "claim://PAGE-DEMO/interfaces.power.input_voltage",
        "claim://PAGE-DEMO/performance.max_current"
      ],
      "derivation_performed": false,
      "explicit_gap_reason": "The max-current operand is review-required due to conflicting evidence.",
      "available_inputs": [
        "fixture://sources/power-guide",
        "fixture://sources/load-guide",
        "fixture://sources/conflict-guide"
      ],
      "downstream_impact": "Maximum-power-dependent harness review remains blocked.",
      "source_gap_ref": "gap://PAGE-DEMO/performance.max_power"
    },
    {
      "claim_id": "claim://PAGE-DEMO/interfaces.aux.input_voltage",
      "target_slot": "interfaces.aux.input_voltage",
      "claim_status": "blocked_missing_source",
      "field_status": "missing",
      "value": null,
      "unit": "V",
      "explicit_gap_reason": "Only an unapproved label hint and a blocker description are available; neither is value evidence.",
      "available_inputs": [
        "owner_recorded_constraints",
        "previous_harness_blocker_packet"
      ],
      "downstream_impact": "Auxiliary-input harness consideration remains blocked.",
      "source_gap_ref": "gap://PAGE-DEMO/interfaces.aux.input_voltage"
    }
  ],
  "enriched_sidecar_overlay": {
    "overlay_kind": "patch_like_overlay_against_page_module_spec_v0",
    "target_page_id": "PAGE-DEMO",
    "target_schema": "page_module_spec_v0",
    "target_sidecar_ref": "fixture://sidecars/page-demo-v0",
    "replace_original_sidecar": false,
    "operations": [
      {
        "operation": "propose_status_update",
        "target_slot": "interfaces.power.input_voltage",
        "from_status": "missing",
        "to_status": "source_confirmed",
        "proposed_value": 5,
        "unit": "V",
        "condition_or_scope": "nominal",
        "evidence_refs": [
          "fixture://sources/power-guide#page-4"
        ]
      },
      {
        "operation": "preserve_with_review_context",
        "target_slot": "performance.max_current",
        "from_status": "review_required",
        "to_status": "review_required",
        "proposed_value": null,
        "evidence_refs": [
          "fixture://sources/load-guide#page-8",
          "fixture://sources/conflict-guide#page-3"
        ],
        "source_gap_refs": [
          "gap://PAGE-DEMO/performance.max_current"
        ]
      },
      {
        "operation": "preserve_missing",
        "target_slot": "performance.max_power",
        "from_status": "missing",
        "to_status": "missing",
        "proposed_value": null,
        "source_gap_refs": [
          "gap://PAGE-DEMO/performance.max_power"
        ],
        "derivation_refs": [
          "derivation-request://PAGE-DEMO/performance.max_power"
        ]
      },
      {
        "operation": "preserve_missing",
        "target_slot": "interfaces.aux.input_voltage",
        "from_status": "missing",
        "to_status": "missing",
        "proposed_value": null,
        "source_gap_refs": [
          "gap://PAGE-DEMO/interfaces.aux.input_voltage"
        ]
      }
    ]
  },
  "source_gap_report": [
    {
      "gap_id": "gap://PAGE-DEMO/performance.max_current",
      "target_slot": "performance.max_current",
      "gap_type": "source_conflict",
      "blocking_level": "blocks_harness",
      "reason": "Two official synthetic sources state 2 A and 1.5 A under non-equivalent or unclear conditions.",
      "required_resolution": "Obtain approved evidence that reconciles applicability and operating conditions or identifies the controlling value.",
      "rerun_trigger": "A conflict-resolution source packet or owner-approved source-scope decision becomes available."
    },
    {
      "gap_id": "gap://PAGE-DEMO/performance.max_power",
      "target_slot": "performance.max_power",
      "gap_type": "missing_operating_condition",
      "blocking_level": "blocks_harness",
      "reason": "The requested formula cannot yield a valid derived claim until max current is source-confirmed and non-conflicting.",
      "required_resolution": "Resolve gap://PAGE-DEMO/performance.max_current, then evaluate the requested formula using source-confirmed operands with compatible scope.",
      "rerun_trigger": "A non-conflicting max-current claim becomes available."
    },
    {
      "gap_id": "gap://PAGE-DEMO/interfaces.aux.input_voltage",
      "target_slot": "interfaces.aux.input_voltage",
      "gap_type": "missing_source_value",
      "blocking_level": "blocks_harness",
      "reason": "No approved evidence supports a voltage value; the 12V label hint is explicitly unapproved.",
      "required_resolution": "Provide an approved source reference with value, unit, target slot, location, and applicable condition or scope.",
      "rerun_trigger": "Approved auxiliary-input voltage evidence becomes available."
    }
  ],
  "owner_followup_needed": [
    {
      "followup_id": "followup://PAGE-DEMO/performance.max_current",
      "target_slot": "performance.max_current",
      "action_needed": "Supply or approve evidence that resolves which current limit applies and under what conditions.",
      "related_gap_refs": [
        "gap://PAGE-DEMO/performance.max_current",
        "gap://PAGE-DEMO/performance.max_power"
      ]
    },
    {
      "followup_id": "followup://PAGE-DEMO/interfaces.aux.input_voltage",
      "target_slot": "interfaces.aux.input_voltage",
      "action_needed": "Supply approved auxiliary-input voltage evidence; do not promote the label hint as a value.",
      "related_gap_refs": [
        "gap://PAGE-DEMO/interfaces.aux.input_voltage"
      ]
    }
  ],
  "harness_readiness_delta": {
    "delta_only": true,
    "before": {
      "interfaces.power.input_voltage": "blocked_missing_quantity",
      "performance.max_current": "review_required",
      "performance.max_power": "blocked_missing_quantity",
      "interfaces.aux.input_voltage": "blocked_missing_approved_evidence"
    },
    "after": {
      "interfaces.power.input_voltage": "quantity_source_confirmed_for_downstream_consideration",
      "performance.max_current": "review_required_source_conflict",
      "performance.max_power": "blocked_by_unresolved_operand",
      "interfaces.aux.input_voltage": "blocked_missing_approved_evidence"
    },
    "closed_blockers": [
      {
        "target_slot": "interfaces.power.input_voltage",
        "closed_blocker": "missing approved nominal input-voltage value",
        "evidence_ref": "fixture://sources/power-guide#page-4",
        "scope": "quantity evidence only"
      }
    ],
    "remaining_blockers": [
      {
        "target_slot": "performance.max_current",
        "reason": "Conflicting values and unresolved applicability conditions.",
        "gap_ref": "gap://PAGE-DEMO/performance.max_current"
      },
      {
        "target_slot": "performance.max_power",
        "reason": "Derivation blocked by unresolved max-current operand.",
        "gap_ref": "gap://PAGE-DEMO/performance.max_power"
      },
      {
        "target_slot": "interfaces.aux.input_voltage",
        "reason": "No approved voltage evidence.",
        "gap_ref": "gap://PAGE-DEMO/interfaces.aux.input_voltage"
      }
    ],
    "newly_discovered_blockers": [
      {
        "target_slot": "performance.max_current",
        "reason": "Official synthetic evidence conflict between 2 A and 1.5 A."
      }
    ],
    "candidate_safe_possible_for": [],
    "source_supported_possible_for": [],
    "not_claimed": [
      "final_harness_connection_validity",
      "final_circuit_synthesis",
      "automatic_source_supported_join_promotion",
      "global_page_readiness",
      "compatibility of the confirmed power-input quantity with any mating interface"
    ]
  },
  "enrichment_provenance": {
    "page_id": "PAGE-DEMO",
    "manifest_source_checksum": "sha256:fixture-page",
    "provenance_source_checksum": "sha256:fixture-page",
    "input_refs": [
      "fixture://enrichment/page-demo",
      "fixture://sidecars/page-demo-v0",
      "fixture://handoff/harness-demo",
      "fixture://sources/power-guide",
      "fixture://sources/load-guide",
      "fixture://sources/conflict-guide"
    ],
    "boundary_attestation": "All identifiers, evidence references, values, slots, checksums, and constraints in this deliverable are synthetic and public-safe.",
    "source_authority_preserved": true,
    "raw_source_payload_included": false,
    "runtime_absolute_paths_included": false
  },
  "quantitative_enrichment_summary": {
    "slot_count": 4,
    "source_confirmed_count": 1,
    "derived_count": 0,
    "review_required_count": 1,
    "missing_count": 2,
    "filled_targets": [
      "interfaces.power.input_voltage"
    ],
    "unresolved_targets": [
      "performance.max_current",
      "performance.max_power",
      "interfaces.aux.input_voltage"
    ],
    "stop_conditions": [
      "Do not derive performance.max_power while performance.max_current remains conflicting.",
      "Do not fill interfaces.aux.input_voltage from the 12V AUX label hint.",
      "Do not promote any final harness connection or global readiness state.",
      "Resume enrichment only when an identified rerun trigger supplies approved evidence or an owner-approved source-scope decision."
    ],
    "boundary_summary": {
      "overlay_not_replacement": true,
      "sidecar_mutation": false,
      "schema_mutation": false,
      "source_mutation": false,
      "final_composition_approval": false,
      "uncertainty_preserved": true
    }
  }
}
