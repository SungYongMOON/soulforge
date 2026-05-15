{
  "interface_control_ledger": [
    {
      "ref": "interfaces.outputs.J1_PIN1",
      "item_id": "J1_PIN1",
      "ceiling": "source_supported_possible",
      "evidence_basis": ["external confirmed power output", "direction output", "domain power", "kind wire_to_wire", "5V", "500mA", "quantity source-confirmed"],
      "gap_or_blocker_reason": null,
      "owner_route": "source/owner confirmation already represented by SRC_VBUS and quantitative source facts",
      "ceiling_only": "readiness ceiling only; not final harness approval"
    },
    {
      "ref": "interfaces.inputs.J2_PIN3",
      "item_id": "GPIO_WAKE",
      "ceiling": "review_required",
      "evidence_basis": ["external candidate digital input", "direction input", "domain digital", "kind signal_wire", "3.3V logic", "quantity partial"],
      "gap_or_blocker_reason": "timing constraint missing and quantitative constraints only partial",
      "owner_route": "owner/source must confirm timing and complete quantitative constraints",
      "ceiling_only": "may not be promoted to candidate_safe_possible until required constraints are present, derived, or not applicable"
    },
    {
      "ref": "interfaces.local_internal_candidates.TP5",
      "item_id": "TP5",
      "ceiling": "blocked",
      "evidence_basis": ["local test/debug only", "bidirectional or unknown", "domain digital", "kind test_point"],
      "gap_or_blocker_reason": "local_internal/test-only item is non-external by default and blocked for external harness endpoint use",
      "owner_route": "scoped owner/source reclassification required before any external harness composition",
      "ceiling_only": "previous harness candidate status cannot override interface-control block"
    },
    {
      "ref": "interfaces.passive_or_none.NC7",
      "item_id": "NC7",
      "ceiling": "blocked",
      "evidence_basis": ["no connect"],
      "gap_or_blocker_reason": "no-connect item is blocked for harness composition",
      "owner_route": "no harness route unless official source redefines the item as connectable",
      "ceiling_only": "readiness ceiling only"
    },
    {
      "ref": "interfaces.outputs.PWM_A",
      "item_id": "PWM_A",
      "ceiling": "review_required",
      "evidence_basis": ["role and direction inferred from label only", "no official source confirmation", "quantity missing"],
      "gap_or_blocker_reason": "label inference without official/source support cannot be promoted beyond review_required",
      "owner_route": "owner/source must confirm PWM semantics, role/direction, and quantitative constraints",
      "ceiling_only": "previous harness candidate status cannot strengthen beyond interface-control ceiling"
    }
  ],
  "harness_readiness_matrix": [
    {
      "join_id": "JOIN_1",
      "endpoints": ["J1_PIN1", "external_load_vbus"],
      "previous_harness_status": "candidate_safe",
      "interface_ceiling": "source_supported_possible",
      "harness_ceiling": "source_supported_possible",
      "evidence_basis": ["J1_PIN1 source-supported external power output", "requires 5V and 500mA both source-confirmed"],
      "gap_or_blocker_reason": null,
      "owner_route": "no immediate owner follow-up for stated constraints",
      "ceiling_only": "candidate remains ceiling-level readiness, not final approval"
    },
    {
      "join_id": "JOIN_2",
      "endpoints": ["TP5", "external_debug_header"],
      "previous_harness_status": "candidate_safe",
      "interface_ceiling": "blocked",
      "harness_ceiling": "blocked",
      "evidence_basis": ["TP5 is local test/debug only", "local_internal_candidates are non-external by default"],
      "gap_or_blocker_reason": "external debug header join is blocked by local/test-only interface classification",
      "owner_route": "requires scoped owner/source evidence to reclassify TP5 before rerun",
      "ceiling_only": "harness candidate is weakened by interface-control block"
    },
    {
      "join_id": "JOIN_3",
      "endpoints": ["GPIO_WAKE", "wake_controller"],
      "previous_harness_status": "review_required",
      "interface_ceiling": "review_required",
      "harness_ceiling": "review_required",
      "evidence_basis": ["GPIO_WAKE external candidate digital input", "requires timing constraint", "timing missing"],
      "gap_or_blocker_reason": "required timing constraint unresolved",
      "owner_route": "owner/source must supply timing constraint or mark it not applicable",
      "ceiling_only": "cannot exceed interface-control review_required ceiling"
    },
    {
      "join_id": "JOIN_4",
      "endpoints": ["PWM_A", "motor_ctrl_pwm"],
      "previous_harness_status": "candidate_safe",
      "interface_ceiling": "review_required",
      "harness_ceiling": "review_required",
      "evidence_basis": ["PWM_A semantics inferred from label only", "requires source-confirmed PWM semantics", "quantity missing"],
      "gap_or_blocker_reason": "source-confirmed PWM semantics and quantitative constraints are missing",
      "owner_route": "owner/source must confirm PWM semantics and constraints before promotion",
      "ceiling_only": "previous candidate_safe is weakened to review_required by interface-control ceiling"
    }
  ],
  "blocked_interface_items": [
    {
      "item_id": "TP5",
      "ref": "interfaces.local_internal_candidates.TP5",
      "evidence_basis": ["local test/debug only", "local_internal_candidates"],
      "gap_or_blocker_reason": "non-external local/test-only interface blocks external harness endpoint use",
      "owner_route": "scoped reclassification evidence required",
      "ceiling_only": "blocked ceiling"
    },
    {
      "item_id": "NC7",
      "ref": "interfaces.passive_or_none.NC7",
      "evidence_basis": ["no connect"],
      "gap_or_blocker_reason": "no-connect item blocked for harness composition",
      "owner_route": "official source change required",
      "ceiling_only": "blocked ceiling"
    }
  ],
  "review_required_interface_items": [
    {
      "item_id": "GPIO_WAKE",
      "ref": "interfaces.inputs.J2_PIN3",
      "evidence_basis": ["external candidate digital input", "3.3V logic", "timing missing", "quantity partial"],
      "gap_or_blocker_reason": "missing timing and incomplete quantitative constraints",
      "owner_route": "owner/source timing and quantity confirmation",
      "ceiling_only": "review_required ceiling"
    },
    {
      "item_id": "PWM_A",
      "ref": "interfaces.outputs.PWM_A",
      "evidence_basis": ["label inference only", "no official source confirmation", "quantity missing"],
      "gap_or_blocker_reason": "unsupported label inference",
      "owner_route": "source/owner semantic and quantitative confirmation",
      "ceiling_only": "review_required ceiling"
    }
  ],
  "candidate_safe_possible_items": [],
  "source_supported_possible_items": [
    {
      "item_id": "J1_PIN1",
      "ref": "interfaces.outputs.J1_PIN1",
      "evidence_basis": ["source-confirmed external power output", "5V", "500mA", "quantity source-confirmed"],
      "gap_or_blocker_reason": null,
      "owner_route": "SRC_VBUS/source basis",
      "ceiling_only": "source_supported_possible ceiling"
    }
  ],
  "compatibility_gap_report": [
    {
      "scope": "JOIN_2",
      "gap": "TP5 local/test-only classification incompatible with external_debug_header composition"
    },
    {
      "scope": "JOIN_3",
      "gap": "GPIO_WAKE lacks required timing constraint for wake_controller join"
    },
    {
      "scope": "JOIN_4",
      "gap": "PWM_A lacks source-confirmed PWM semantics and quantity constraints"
    }
  ],
  "owner_followup_needed": [
    {
      "item_or_join": "TP5/JOIN_2",
      "owner_route": "scoped owner/source reclassification if external debug harness use is intended"
    },
    {
      "item_or_join": "GPIO_WAKE/JOIN_3",
      "owner_route": "confirm timing constraint and complete quantitative constraints"
    },
    {
      "item_or_join": "PWM_A/JOIN_4",
      "owner_route": "confirm PWM semantics, role/direction, and quantitative constraints"
    }
  ],
  "interface_open_questions": [
    "Is GPIO_WAKE timing required, and what exact timing constraint applies?",
    "Can TP5_BOOT be reclassified from local test/debug only to an external-eligible interface by scoped owner/source evidence?",
    "Does PWM_A have official/source-confirmed PWM semantics, direction, domain, kind, and quantitative limits?"
  ],
  "source_gap_rerun_triggers": [
    "New source or owner-baselined timing/quantity evidence for GPIO_WAKE",
    "Scoped owner/source reclassification evidence for TP5",
    "Official/source-confirmed PWM semantics and quantitative constraints for PWM_A",
    "Any source change redefining NC7 as connectable"
  ],
  "harness_input_delta": [
    {
      "join_id": "JOIN_1",
      "delta": "retain as source_supported_possible ceiling candidate"
    },
    {
      "join_id": "JOIN_2",
      "delta": "downgrade from previous candidate_safe to blocked"
    },
    {
      "join_id": "JOIN_3",
      "delta": "remain review_required pending timing constraint"
    },
    {
      "join_id": "JOIN_4",
      "delta": "downgrade from previous candidate_safe to review_required"
    }
  ],
  "boundary_review_note": "This is a public-safe synthetic readiness-ceiling evaluation only. It uses only the supplied fixture, does not rely on prior harness status as approval, does not claim telemetry, and does not assume hidden golden output."
}