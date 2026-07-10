{
  "schema_version": "page_quantitative_enrichment_deliverable_v0",
  "workflow_id": "page_quantitative_enrichment_v0",
  "fixture_id": "public_synthetic_values_gaps_conflict_overlay",
  "page_id": "PAGE-DEMO",
  "execution_kind": "dry_run",
  "quantitative_slot_inventory": [
    {
      "target_slot": "interfaces.power.input_voltage",
      "quantity_kind": "voltage",
      "scope": "nominal input",
      "applies_to": "power interface",
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
      "applies_to": "page performance",
      "existing_status": "review_required",
      "required_for_harness": true,
      "evidence_candidates": [
        "fixture://sources/load-guide",
        "fixture://sources/conflict-guide"
      ],
      "missing_or_conflict_reason": "Official evidence provides conflicting values under non-equivalent or unclear conditions."
    },
    {
      "target_slot": "performance.max_power",
      "quantity_kind": "power",
      "scope": "derived maximum power",
      "applies_to": "page performance",
      "existing_status": "missing",
      "required_for_harness": true,
      "evidence_candidates": [
        "fixture://sources/power-guide",
        "fixture://sources/load-guide",
        "fixture://sources/conflict-guide"
      ],
      "missing_or_conflict_reason": "The requested derivation lacks a source-confirmed max_current operand because current evidence conflicts."
    },
    {
      "target_slot": "interfaces.aux.input_voltage",
      "quantity_kind": "voltage",
      "scope": "auxiliary input",
      "applies_to": "aux interface",
      "existing_status": "missing",
      "required_for_harness": true,
      "evidence_candidates": [],
      "missing_or_conflict_reason": "Only an unapproved label hint and a previous blocker are available."
    }
  ],
  "quantitative_claims": [
    {
      "claim_id": "claim-page-demo-power-input-voltage",
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
      "claim_id": "claim-page-demo-max-current",
      "target_slot": "performance.max_current",
      "claim_status": "conflict",
      "field_status": "review_required",
      "value": null,
      "unit": "A",
      "condition_or_scope": "Unresolved conflict between 2 A at ambient <= 40 C and 1.5 A under an unclear condition.",
      "evidence_refs": [
        {
          "approved_evidence_ref": "fixture://sources/load-guide",
          "source_location_or_packet_ref": "fixture://sources/load-guide#page-8",
          "reported_value": 2,
          "unit": "A",
          "condition": "ambient <= 40 C"
        },
        {
          "approved_evidence_ref": "fixture://sources/conflict-guide",
          "source_location_or_packet_ref": "fixture://sources/conflict-guide#page-3",
          "reported_value": 1.5,
          "unit": "A",
          "condition": "condition unclear"
        }
      ],
      "gap_ref": "gap-page-demo-max-current-conflict"
    },
    {
      "claim_id": "claim-page-demo-max-power",
      "target_slot": "performance.max_power",
      "claim_status": "blocked_missing_source",
      "field_status": "missing",
      "value": null,
      "unit": "W",
      "requested_formula": "input_voltage * max_current",
      "operand_refs": [
        "interfaces.power.input_voltage",
        "performance.max_current"
      ],
      "derivation_performed": false,
      "explicit_gap_reason": "performance.max_current is not source_confirmed and cannot serve as a derivation operand.",
      "available_inputs": [
        "claim-page-demo-power-input-voltage",
        "claim-page-demo-max-current"
      ],
      "downstream_impact": "Maximum-power-dependent harness evaluation remains blocked.",
      "gap_ref": "gap-page-demo-max-power-operand"
    },
    {
      "claim_id": "claim-page-demo-aux-input-voltage",
      "target_slot": "interfaces.aux.input_voltage",
      "claim_status": "unchanged_missing",
      "field_status": "missing",
      "value": null,
      "unit": "V",
      "explicit_gap_reason": "No approved evidence supports an auxiliary input-voltage value.",
      "available_inputs": [
        "owner constraint containing unapproved label hint",
        "previous harness blocker"
      ],
      "downstream_impact": "Auxiliary-interface harness evaluation remains blocked.",
      "gap_ref": "gap-page-demo-aux-input-voltage"
    }
  ],
  "enriched_sidecar_overlay": {
    "overlay_kind": "patch_like_overlay_against_page_module_spec_v0",
    "target_schema": "page_module_spec_v0",
    "target_page_id": "PAGE-DEMO",
    "replaces_original_sidecar": false,
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
        "operation": "preserve_with_review",
        "target_slot": "performance.max_current",
        "from_status": "review_required",
        "to_status": "review_required",
        "proposed_value": null,
        "evidence_refs": [
          "fixture://sources/load-guide#page-8",
          "fixture://sources/conflict-guide#page-3"
        ],
        "source_gap_refs": [
          "gap-page-demo-max-current-conflict"
        ]
      },
      {
        "operation": "preserve_missing",
        "target_slot": "performance.max_power",
        "from_status": "missing",
        "to_status": "missing",
        "proposed_value": null,
        "source_gap_refs": [
          "gap-page-demo-max-power-operand"
        ],
        "derivation_refs": []
      },
      {
        "operation": "preserve_missing",
        "target_slot": "interfaces.aux.input_voltage",
        "from_status": "missing",
        "to_status": "missing",
        "proposed_value": null,
        "source_gap_refs": [
          "gap-page-demo-aux-input-voltage"
        ]
      }
    ]
  },
  "source_gap_report": [
    {
      "gap_id": "gap-page-demo-max-current-conflict",
      "target_slot": "performance.max_current",
      "gap_type": "source_conflict",
      "blocking_level": "blocks_harness",
      "reason": "Two official sources report 2 A and 1.5 A with different or insufficiently defined operating conditions.",
      "required_resolution": "Establish the applicable operating condition and authoritative current limit using approved evidence.",
      "rerun_trigger": "Approved evidence resolves the value and applicable condition without conflict."
    },
    {
      "gap_id": "gap-page-demo-max-power-operand",
      "target_slot": "performance.max_power",
      "gap_type": "missing_operating_condition",
      "blocking_level": "blocks_harness",
      "reason": "The max_current operand remains conflicted, so the requested power derivation is invalid.",
      "required_resolution": "Resolve gap-page-demo-max-current-conflict before deriving maximum power.",
      "rerun_trigger": "Both voltage and current operands are source_confirmed under compatible scopes."
    },
    {
      "gap_id": "gap-page-demo-aux-input-voltage",
      "target_slot": "interfaces.aux.input_voltage",
      "gap_type": "missing_source_value",
      "blocking_level": "blocks_harness",
      "reason": "The label hint '12V AUX' is not approved value evidence.",
      "required_resolution": "Provide approved source evidence for the auxiliary voltage, unit, scope, and applicable condition.",
      "rerun_trigger": "An approved source packet or owner-approved evidence record supports the quantity."
    }
  ],
  "owner_followup_needed": [
    {
      "followup_id": "followup-page-demo-current-authority",
      "target_slot": "performance.max_current",
      "action_needed": "Identify the applicable source value and operating condition or provide approved evidence that reconciles the conflict.",
      "blocking_level": "blocks_harness",
      "related_gap_refs": [
        "gap-page-demo-max-current-conflict",
        "gap-page-demo-max-power-operand"
      ]
    },
    {
      "followup_id": "followup-page-demo-aux-evidence",
      "target_slot": "interfaces.aux.input_voltage",
      "action_needed": "Supply approved auxiliary-voltage evidence; the label hint alone cannot authorize a value.",
      "blocking_level": "blocks_harness",
      "related_gap_refs": [
        "gap-page-demo-aux-input-voltage"
      ]
    }
  ],
  "harness_readiness_delta": {
    "delta_only": true,
    "before": {
      "interfaces.power.input_voltage": "blocked_missing_quantity",
      "performance.max_current": "review_required",
      "performance.max_power": "blocked_missing_quantity",
      "interfaces.aux.input_voltage": "blocked_missing_quantity"
    },
    "after": {
      "interfaces.power.input_voltage": "quantity_source_confirmed",
      "performance.max_current": "review_required_source_conflict",
      "performance.max_power": "blocked_invalid_derivation_operands",
      "interfaces.aux.input_voltage": "blocked_missing_approved_evidence"
    },
    "closed_blockers": [
      {
        "target_slot": "interfaces.power.input_voltage",
        "blocker": "missing approved nominal input-voltage quantity",
        "closure_scope": "quantity evidence only",
        "evidence_ref": "fixture://sources/power-guide#page-4"
      }
    ],
    "remaining_blockers": [
      {
        "target_slot": "performance.max_current",
        "reason": "Conflicting source values and unresolved operating scope."
      },
      {
        "target_slot": "performance.max_power",
        "reason": "Current operand is not source_confirmed."
      },
      {
        "target_slot": "interfaces.aux.input_voltage",
        "reason": "No approved value evidence."
      }
    ],
    "newly_discovered_blockers": [
      {
        "target_slot": "performance.max_power",
        "reason": "Requested derivation is blocked by the max_current source conflict."
      }
    ],
    "candidate_safe_possible_for": [],
    "source_supported_possible_for": [],
    "not_claimed": [
      "final harness connection validity",
      "final circuit synthesis",
      "automatic source-supported join promotion",
      "global page readiness",
      "complete interface semantics"
    ]
  },
  "enrichment_provenance": {
    "binding": "fixture://enrichment/page-demo",
    "sidecar_ref": "fixture://sidecars/page-demo-v0",
    "downstream_handoff": "fixture://handoff/harness-demo",
    "page_id": "PAGE-DEMO",
    "source_checksum": "sha256:fixture-page",
    "manifest_checksum_match": true,
    "evidence_refs_used": [
      "fixture://sources/power-guide#page-4",
      "fixture://sources/load-guide#page-8",
      "fixture://sources/conflict-guide#page-3"
    ],
    "review_only_inputs": [
      {
        "target_slot": "interfaces.aux.input_voltage",
        "basis": "unapproved label hint"
      },
      {
        "target_slot": "interfaces.aux.input_voltage",
        "basis": "previous harness blocker"
      }
    ],
    "raw_source_payload_included": false,
    "runtime_absolute_paths_included": false
  },
  "quantitative_enrichment_summary": {
    "source_confirmed_count": 1,
    "derived_count": 0,
    "review_required_count": 1,
    "missing_count": 2,
    "conflict_count": 1,
    "overlay_replaces_sidecar": false,
    "source_or_schema_mutation": false,
    "final_composition_approval": false,
    "stop_conditions": [
      "Do not derive performance.max_power until performance.max_current is source_confirmed under a compatible scope.",
      "Do not fill interfaces.aux.input_voltage from its label hint.",
      "Do not promote final harness connections or global page readiness from this delta."
    ],
    "boundary_attestation": "All identifiers, source references, values, slots, checksums, and constraints in this deliverable are synthetic and public-safe."
  }
}
