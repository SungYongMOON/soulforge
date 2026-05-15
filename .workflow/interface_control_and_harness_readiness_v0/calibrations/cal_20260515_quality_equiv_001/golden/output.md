{
  "interface_control_ledger": [
    {
      "ref": "interfaces.outputs.J1_PIN1",
      "ceiling": "source_supported_possible",
      "evidence_basis": ["external confirmed power output", "direction output", "domain power", "kind wire_to_wire", "5V", "500mA", "quantity source-confirmed"],
      "gap_or_blocker_reason": null,
      "owner_route": "no_owner_followup_needed",
      "ceiling_only": "readiness ceiling only; not final harness approval"
    },
    {
      "ref": "interfaces.inputs.J2_PIN3",
      "ceiling": "review_required",
      "evidence_basis": ["external candidate digital input", "direction input", "domain digital", "kind signal_wire", "3.3V logic", "quantity partial"],
      "gap_or_blocker_reason": "timing constraint missing and quantitative constraints are partial",
      "owner_route": "interface_owner_or_source_owner",
      "ceiling_only": "cannot reach candidate_safe_possible until required timing/quantity constraints are resolved"
    },
    {
      "ref": "interfaces.local_internal_candidates.TP5",
      "ceiling": "blocked",
      "evidence_basis": ["local test/debug only", "bidirectional or unknown", "domain digital", "kind test_point"],
      "gap_or_blocker_reason": "local_internal/test-only item is non-external by default and blocked for external harness composition",
      "owner_route": "scoped_owner_reclassification_required",
      "ceiling_only": "prior harness status cannot override interface-control block"
    },
    {
      "ref": "interfaces.passive_or_none.NC7",
      "ceiling": "blocked",
      "evidence_basis": ["no connect"],
      "gap_or_blocker_reason": "no-connect item is blocked for harness composition",
      "owner_route": "no_owner_followup_needed_unless_design_intent_changes",
      "ceiling_only": "not eligible as harness endpoint"
    },
    {
      "ref": "interfaces.outputs.PWM_A",
      "ceiling": "review_required",
      "evidence_basis": ["role and direction inferred from label only", "no official source confirmation", "quantity missing"],
      "gap_or_blocker_reason": "label inference without official/source support cannot be promoted beyond review_required",
      "owner_route": "source_owner_or_scoped_interface_owner",
      "ceiling_only": "requires source-confirmed PWM semantics and constraints before harness strengthening"
    }
  ],
  "harness_readiness_matrix": [
    {
      "join_id": "JOIN_1",
      "ceiling": "source_supported_possible",
      "evidence_basis": ["J1_PIN1 source_supported_possible", "requires 5V and 500mA satisfied"],
      "gap_or_blocker_reason": null,
      "owner_route": "no_owner_followup_needed",
      "ceiling_only": "previous candidate_safe may stand only as a ceiling-compatible candidate, not final approval"
    },
    {
      "join_id": "JOIN_2",
      "ceiling": "blocked",
      "evidence_basis": ["TP5 is local_internal/test/debug only", "external_debug_header would require external endpoint eligibility"],
      "gap_or_blocker_reason": "interface-control ceiling blocks external harness use",
      "owner_route": "scoped_owner_reclassification_required",
      "ceiling_only": "weakened from previous candidate_safe by interface-control block"
    },
    {
      "join_id": "JOIN_3",
      "ceiling": "review_required",
      "evidence_basis": ["GPIO_WAKE review_required", "join requires timing constraint"],
      "gap_or_blocker_reason": "required timing constraint is unresolved",
      "owner_route": "interface_owner_or_source_owner",
      "ceiling_only": "cannot be strengthened beyond GPIO_WAKE interface ceiling"
    },
    {
      "join_id": "JOIN_4",
      "ceiling": "review_required",
      "evidence_basis": ["PWM_A review_required", "source-confirmed PWM semantics required but absent"],
      "gap_or_blocker_reason": "label-only PWM inference lacks source-confirmed semantics",
      "owner_route": "source_owner_or_scoped_interface_owner",
      "ceiling_only": "weakened from previous candidate_safe by interface-control ceiling"
    }
  ],
  "blocked_interface_items": ["interfaces.local_internal_candidates.TP5", "interfaces.passive_or_none.NC7"],
  "review_required_interface_items": ["interfaces.inputs.J2_PIN3", "interfaces.outputs.PWM_A"],
  "candidate_safe_possible_items": [],
  "source_supported_possible_items": ["interfaces.outputs.J1_PIN1"],
  "compatibility_gap_report": [
    "GPIO_WAKE lacks timing constraint required for candidate-safe harness composition.",
    "TP5 is local/test/debug and not external-eligible.",
    "NC7 is no-connect and not composition-eligible.",
    "PWM_A depends on unsupported label inference and lacks source-confirmed PWM semantics."
  ],
  "owner_followup_needed": [
    "GPIO_WAKE: source/interface owner must provide timing and complete quantitative constraints.",
    "TP5: scoped owner/source evidence required for any external reclassification.",
    "PWM_A: source/interface owner must confirm PWM semantics and required quantities."
  ],
  "interface_open_questions": [
    "What timing constraint applies to GPIO_WAKE?",
    "Is TP5 intentionally reclassifiable as an external debug interface, or must it remain local-only?",
    "What official source confirms PWM_A role, direction, domain, and quantitative constraints?"
  ],
  "source_gap_rerun_triggers": [
    "Official/source-backed timing constraints for GPIO_WAKE are added.",
    "Scoped owner/source evidence reclassifies TP5 as external-eligible.",
    "Official/source-backed PWM_A semantics and quantitative constraints are added."
  ],
  "harness_input_delta": {
    "weakened_by_interface_control": ["JOIN_2", "JOIN_4"],
    "unchanged_review_required": ["JOIN_3"],
    "ceiling_compatible": ["JOIN_1"],
    "note": "prior harness candidate status was not treated as final approval"
  },
  "boundary_review_note": "Evaluation used only the supplied public-safe synthetic fixture. Results are readiness ceilings only and do not approve upstream artifacts or claim runtime telemetry."
}