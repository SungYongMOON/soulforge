```json
{
  "interface_control_ledger": [
    {
      "item_ref": "interfaces.outputs.J1_PIN1",
      "short_id": "J1_PIN1",
      "page_asset_id": "PAGE_A",
      "label": "VBUS_OUT",
      "container": "outputs",
      "readiness_ceiling": "source_supported_possible",
      "evidence_basis": [
        "external confirmed power output",
        "direction output",
        "domain power",
        "kind wire_to_wire",
        "5V",
        "500mA",
        "quantity source-confirmed",
        "approved_refs: ref_source_alpha_v1 official_present_synthetic",
        "approved_refs: ref_quant_alpha_v1"
      ],
      "gap_or_blocker_reason": [],
      "owner_route": "none_required_for_current_ceiling",
      "ceiling_only": "Readiness ceiling only; not final harness approval."
    },
    {
      "item_ref": "interfaces.inputs.J2_PIN3",
      "short_id": "GPIO_WAKE",
      "page_asset_id": "PAGE_A",
      "label": "GPIO_WAKE",
      "container": "inputs",
      "readiness_ceiling": "review_required",
      "evidence_basis": [
        "external candidate digital input",
        "direction input",
        "domain digital",
        "kind signal_wire",
        "3.3V logic",
        "timing missing",
        "quantity partial"
      ],
      "gap_or_blocker_reason": [
        "Required timing constraint is missing.",
        "External eligibility is candidate-level rather than source-confirmed.",
        "Quantitative support is partial."
      ],
      "owner_route": "page/source owner to confirm external semantics and timing envelope",
      "ceiling_only": "Cannot promote to candidate_safe_possible until required constraints are present or derived."
    },
    {
      "item_ref": "interfaces.local_internal_candidates.TP5",
      "short_id": "TP5",
      "page_asset_id": "PAGE_A",
      "label": "TP5_BOOT",
      "container": "local_internal_candidates",
      "readiness_ceiling": "blocked",
      "evidence_basis": [
        "local test/debug only",
        "bidirectional or unknown",
        "domain digital",
        "kind test_point"
      ],
      "gap_or_blocker_reason": [
        "local_internal candidates are non-external by default",
        "test/debug-only item is out of harness composition scope",
        "direction/role not stable enough for external harness use"
      ],
      "owner_route": "scoped owner/source evidence required to reclassify out of local_internal_candidates",
      "ceiling_only": "Blocked for external harness use unless formally reclassified."
    },
    {
      "item_ref": "interfaces.passive_or_none.NC7",
      "short_id": "NC7",
      "page_asset_id": "PAGE_A",
      "label": "NC7",
      "container": "passive_or_none",
      "readiness_ceiling": "blocked",
      "evidence_basis": [
        "no connect"
      ],
      "gap_or_blocker_reason": [
        "no-connect items are blocked for harness composition"
      ],
      "owner_route": "none unless source classification itself is challenged",
      "ceiling_only": "Blocked by interface class, not a provisional review state."
    },
    {
      "item_ref": "interfaces.outputs.PWM_A",
      "short_id": "PWM_A",
      "page_asset_id": "PAGE_B",
      "label": "PWM_A",
      "container": "outputs",
      "readiness_ceiling": "review_required",
      "evidence_basis": [
        "role and direction inferred from label only",
        "no official source confirmation",
        "quantity missing"
      ],
      "gap_or_blocker_reason": [
        "Label inference without official/source support cannot exceed review_required.",
        "Quantitative constraints are missing.",
        "Output/PWM semantics are not source-confirmed."
      ],
      "owner_route": "source owner to provide official semantic confirmation and quantitative constraints",
      "ceiling_only": "Previous downstream harness status cannot strengthen this interface ceiling."
    }
  ],
  "harness_readiness_matrix": [
    {
      "join_id": "JOIN_1",
      "endpoints": ["J1_PIN1", "external_load_vbus"],
      "previous_harness_status": "candidate_safe",
      "derived_interface_ceiling": "source_supported_possible",
      "join_readiness_ceiling": "source_supported_possible",
      "evidence_basis": [
        "Interface J1_PIN1 is source-supported for external power output",
        "requires: 5V",
        "requires: 500mA",
        "required quantities are present and source-confirmed"
      ],
      "gap_or_blocker_reason": [],
      "owner_route": "none_required_for_current_ceiling",
      "ceiling_only": "Join remains a ceiling-only outcome; not final approval."
    },
    {
      "join_id": "JOIN_2",
      "endpoints": ["TP5", "external_debug_header"],
      "previous_harness_status": "candidate_safe",
      "derived_interface_ceiling": "blocked",
      "join_readiness_ceiling": "blocked",
      "evidence_basis": [
        "Endpoint TP5 is local_internal_candidates",
        "TP5 is local test/debug only"
      ],
      "gap_or_blocker_reason": [
        "External harness endpoint use is blocked by local_internal classification.",
        "Previous harness status is weakened by interface-control ceiling."
      ],
      "owner_route": "scoped owner/source evidence required for reclassification before any re-run",
      "ceiling_only": "Harness cannot exceed blocked interface ceiling."
    },
    {
      "join_id": "JOIN_3",
      "endpoints": ["GPIO_WAKE", "wake_controller"],
      "previous_harness_status": "review_required",
      "derived_interface_ceiling": "review_required",
      "join_readiness_ceiling": "review_required",
      "evidence_basis": [
        "Interface GPIO_WAKE is only candidate-level external input",
        "requires: timing constraint",
        "interface facts explicitly state timing missing"
      ],
      "gap_or_blocker_reason": [
        "Required timing constraint is unresolved.",
        "Quantitative support remains partial."
      ],
      "owner_route": "page/source owner to supply timing contract and confirm external semantics",
      "ceiling_only": "Join cannot be promoted until interface constraints are completed."
    },
    {
      "join_id": "JOIN_4",
      "endpoints": ["PWM_A", "motor_ctrl_pwm"],
      "previous_harness_status": "candidate_safe",
      "derived_interface_ceiling": "review_required",
      "join_readiness_ceiling": "review_required",
      "evidence_basis": [
        "Interface PWM_A semantics are inferred from label only",
        "requires: source-confirmed PWM semantics",
        "quantity missing"
      ],
      "gap_or_blocker_reason": [
        "Required source-confirmed PWM semantics are absent.",
        "Quantitative constraints are missing.",
        "Previous harness status is weakened by interface-control ceiling."
      ],
      "owner_route": "source owner to provide official PWM semantics and quantitative limits",
      "ceiling_only": "Harness cannot exceed review_required while source support is absent."
    }
  ],
  "blocked_interface_items": [
    {
      "item_ref": "interfaces.local_internal_candidates.TP5",
      "short_id": "TP5",
      "evidence_basis": ["local test/debug only", "kind test_point"],
      "gap_or_blocker_reason": ["non-external by default", "test/debug-only composition block"],
      "owner_route": "scoped owner/source reclassification required",
      "ceiling_only": "blocked"
    },
    {
      "item_ref": "interfaces.passive_or_none.NC7",
      "short_id": "NC7",
      "evidence_basis": ["no connect"],
      "gap_or_blocker_reason": ["no-connect composition block"],
      "owner_route": "none unless classification dispute arises",
      "ceiling_only": "blocked"
    }
  ],
  "review_required_interface_items": [
    {
      "item_ref": "interfaces.inputs.J2_PIN3",
      "short_id": "GPIO_WAKE",
      "evidence_basis": ["external candidate digital input", "3.3V logic", "timing missing", "quantity partial"],
      "gap_or_blocker_reason": ["missing timing constraint", "external semantics not fully source-confirmed"],
      "owner_route": "page/source owner confirmation",
      "ceiling_only": "review_required"
    },
    {
      "item_ref": "interfaces.outputs.PWM_A",
      "short_id": "PWM_A",
      "evidence_basis": ["label-only inference", "no official source confirmation", "quantity missing"],
      "gap_or_blocker_reason": ["label inference cannot exceed review_required", "missing quantitative support"],
      "owner_route": "source owner confirmation",
      "ceiling_only": "review_required"
    }
  ],
  "candidate_safe_possible_items": [],
  "source_supported_possible_items": [
    {
      "item_ref": "interfaces.outputs.J1_PIN1",
      "short_id": "J1_PIN1",
      "evidence_basis": ["external confirmed power output", "5V", "500mA", "quantity source-confirmed", "official_present_synthetic source ref"],
      "gap_or_blocker_reason": [],
      "owner_route": "none_required_for_current_ceiling",
      "ceiling_only": "source_supported_possible"
    }
  ],
  "compatibility_gap_report": [
    {
      "target": "JOIN_2",
      "gap": "TP5 is local_internal/test-only and incompatible with external harness composition."
    },
    {
      "target": "JOIN_3",
      "gap": "GPIO_WAKE lacks required timing constraint for compatible harness use."
    },
    {
      "target": "JOIN_4",
      "gap": "PWM_A lacks source-confirmed PWM semantics and quantitative limits."
    },
    {
      "target": "interfaces.outputs.PWM_A",
      "gap": "Role/direction semantics are inferred from label only."
    }
  ],
  "owner_followup_needed": [
    {
      "target": "interfaces.inputs.J2_PIN3",
      "owner_route": "page/source owner",
      "need": "Confirm external input semantics and provide timing envelope."
    },
    {
      "target": "interfaces.local_internal_candidates.TP5",
      "owner_route": "scoped owner/source owner",
      "need": "Provide explicit reclassification evidence if any external harness use is intended."
    },
    {
      "target": "interfaces.outputs.PWM_A",
      "owner_route": "source owner",
      "need": "Provide official PWM semantic confirmation and quantitative limits."
    }
  ],
  "interface_open_questions": [
    "Is GPIO_WAKE truly external-facing or only candidate-marked pending source confirmation?",
    "What timing constraint governs GPIO_WAKE for wake_controller composition?",
    "Can TP5 ever be reclassified out of local_internal/test-only scope?",
    "Is PWM_A an actual external PWM output, and what are its duty/frequency/voltage limits?"
  ],
  "source_gap_rerun_triggers": [
    "Official/source evidence confirming GPIO_WAKE external semantics plus timing contract.",
    "Scoped owner/source reclassification packet for TP5 if external composition is intended.",
    "Official/source-backed PWM_A semantics and quantitative constraints.",
    "Any source correction that changes container classification, role, direction, domain, or kind."
  ],
  "harness_input_delta": [
    {
      "join_id": "JOIN_3",
      "required_addition": "timing constraint for GPIO_WAKE to wake_controller"
    },
    {
      "join_id": "JOIN_4",
      "required_addition": "source-confirmed PWM semantics"
    },
    {
      "join_id": "JOIN_4",
      "required_addition": "quantitative constraints for PWM_A"
    },
    {
      "join_id": "JOIN_2",
      "required_addition": "formal TP5 reclassification evidence before any external harness use"
    }
  ],
  "boundary_review_note": "Public-safe synthetic calibration output only. This uses only the prompt fixture, does not claim telemetry or hidden golden knowledge, and reports readiness ceilings rather than final approval."
}
```