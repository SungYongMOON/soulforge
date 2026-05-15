{
  "interface_control_ledger": {
    "interfaces": [
      {
        "item_ref": "interfaces.outputs.J1_PIN1",
        "page_asset_id": "PAGE_A",
        "label": "VBUS_OUT",
        "container": "outputs",
        "status_ceiling": "source_supported_possible",
        "evidence_basis": [
          "ref_page_mod_alpha_v1 present",
          "ref_asset_manifest_alpha_v1 present",
          "ref_source_alpha_v1 is official_present_synthetic",
          "facts: external confirmed power output, direction output, domain power, kind wire_to_wire, 5V, 500mA, quantity source-confirmed"
        ],
        "gap_or_blocker_reason": [],
        "owner_route": "composition boundary clear; no owner reclassification required",
        "ceiling_only": true
      },
      {
        "item_ref": "interfaces.inputs.J2_PIN3",
        "page_asset_id": "PAGE_A",
        "label": "GPIO_WAKE",
        "container": "inputs",
        "status_ceiling": "review_required",
        "evidence_basis": [
          "ref_page_mod_alpha_v1 present",
          "facts: external candidate digital input, direction input, domain digital, kind signal_wire, 3.3V logic, timing missing, quantity partial"
        ],
        "gap_or_blocker_reason": [
          "timing constraint unresolved",
          "quantity not fully specified",
          "no official/source confirmation"
        ],
        "owner_route": "owner confirmation required in PAGE_A for timing and quantitative semantics before promotion",
        "ceiling_only": true
      },
      {
        "item_ref": "interfaces.local_internal_candidates.TP5",
        "page_asset_id": "PAGE_A",
        "label": "TP5_BOOT",
        "container": "local_internal_candidates",
        "status_ceiling": "blocked",
        "evidence_basis": [
          "ref_page_mod_alpha_v1 present",
          "facts: local test/debug only, bidirectional or unknown, kind test_point"
        ],
        "gap_or_blocker_reason": [
          "local_internal candidates are non-external by default",
          "blocks external harness composition unless reclassified by scoped owner/source evidence"
        ],
        "owner_route": "scoped owner source-route required for any reclassification to external composition scope",
        "ceiling_only": true
      },
      {
        "item_ref": "interfaces.passive_or_none.NC7",
        "page_asset_id": "PAGE_A",
        "label": "NC7",
        "container": "passive_or_none",
        "status_ceiling": "blocked",
        "evidence_basis": [
          "ref_page_mod_alpha_v1 present",
          "facts: no connect"
        ],
        "gap_or_blocker_reason": [
          "no-connect is non-composition-scope for harness"
        ],
        "owner_route": "no harness route unless component intent changes from no-connect",
        "ceiling_only": true
      },
      {
        "item_ref": "interfaces.outputs.PWM_A",
        "page_asset_id": "PAGE_B",
        "label": "PWM_A",
        "container": "outputs",
        "status_ceiling": "review_required",
        "evidence_basis": [
          "ref_page_mod_alpha_v1 present",
          "facts: role and direction inferred from label only",
          "facts: no official source confirmation",
          "facts: quantity missing"
        ],
        "gap_or_blocker_reason": [
          "label-based inference without source support",
          "missing quantitative constraints",
          "no source-confirmed PWM semantics"
        ],
        "owner_route": "PAGE_B and source owner must provide official/source-baselined PWM semantics",
        "ceiling_only": true
      }
    ],
    "harness_joins": [
      {
        "join_id": "JOIN_1",
        "endpoints": ["J1_PIN1", "external_load_vbus"],
        "status_ceiling": "source_supported_possible",
        "required_constraints": ["5V", "500mA"],
        "evidence_basis": [
          "mapped endpoint J1_PIN1 currently source_supported_possible",
          "facts provide 5V and 500mA with source-confirmed quantity"
        ],
        "gap_or_blocker_reason": [],
        "owner_route": "no owner blocker; boundary allows external endpoint pairing",
        "ceiling_only": true
      },
      {
        "join_id": "JOIN_2",
        "endpoints": ["TP5", "external_debug_header"],
        "status_ceiling": "blocked",
        "required_constraints": [],
        "evidence_basis": [
          "mapped endpoint TP5 is local_internal_candidates.TP5"
        ],
        "gap_or_blocker_reason": [
          "local_internal endpoint blocks external harness use by default"
        ],
        "owner_route": "requires scoped owner-source reclassification of TP5",
        "ceiling_only": true
      },
      {
        "join_id": "JOIN_3",
        "endpoints": ["GPIO_WAKE", "wake_controller"],
        "status_ceiling": "review_required",
        "required_constraints": ["timing constraint"],
        "evidence_basis": [
          "mapped endpoint GPIO_WAKE is review_required due missing timing and no official confirmation"
        ],
        "gap_or_blocker_reason": [
          "timing requirement not provided"
        ],
        "owner_route": "owner of GPIO_WAKE semantics must provide timing constraints",
        "ceiling_only": true
      },
      {
        "join_id": "JOIN_4",
        "endpoints": ["PWM_A", "motor_ctrl_pwm"],
        "status_ceiling": "review_required",
        "required_constraints": ["source-confirmed PWM semantics"],
        "evidence_basis": [
          "mapped endpoint PWM_A uses label-inferred role/direction only",
          "no official source confirmation"
        ],
        "gap_or_blocker_reason": [
          "required source-confirmed PWM semantics missing",
          "quantity not supplied"
        ],
        "owner_route": "PAGE_B owner/source owner must confirm PWM semantics and quantitative constraints",
        "ceiling_only": true
      }
    ]
  },
  "harness_readiness_matrix": [
    {
      "join_id": "JOIN_1",
      "previous_harness_status": "candidate_safe",
      "current_readiness_ceiling": "source_supported_possible",
      "endpoints": [
        {"name": "J1_PIN1", "interface_ref": "interfaces.outputs.J1_PIN1"},
        {"name": "external_load_vbus", "interface_ref": null}
      ],
      "required_constraints": ["5V", "500mA"],
      "evidence_basis": [
        "JOIN_1 requirements satisfied by interface facts on J1_PIN1"
      ],
      "gap_or_blocker_reason": [],
      "owner_route": "no owner escalation required for this step",
      "ceiling_only": true
    },
    {
      "join_id": "JOIN_2",
      "previous_harness_status": "candidate_safe",
      "current_readiness_ceiling": "blocked",
      "endpoints": [
        {"name": "TP5", "interface_ref": "interfaces.local_internal_candidates.TP5"},
        {"name": "external_debug_header", "interface_ref": null}
      ],
      "required_constraints": [],
      "evidence_basis": [
        "TP5 is local_internal_candidates and test/debug only"
      ],
      "gap_or_blocker_reason": [
        "endpoint TP5 blocked from external harness composition"
      ],
      "owner_route": "scoped owner reclassification required to proceed",
      "ceiling_only": true
    },
    {
      "join_id": "JOIN_3",
      "previous_harness_status": "review_required",
      "current_readiness_ceiling": "review_required",
      "endpoints": [
        {"name": "GPIO_WAKE", "interface_ref": "interfaces.inputs.J2_PIN3"},
        {"name": "wake_controller", "interface_ref": null}
      ],
      "required_constraints": ["timing constraint"],
      "evidence_basis": [
        "GPIO_WAKE has no timing detail in fixture and no source confirmation"
      ],
      "gap_or_blocker_reason": [
        "required timing constraint absent"
      ],
      "owner_route": "requires owner-provided timing semantics",
      "ceiling_only": true
    },
    {
      "join_id": "JOIN_4",
      "previous_harness_status": "candidate_safe",
      "current_readiness_ceiling": "review_required",
      "endpoints": [
        {"name": "PWM_A", "interface_ref": "interfaces.outputs.PWM_A"},
        {"name": "motor_ctrl_pwm", "interface_ref": null}
      ],
      "required_constraints": ["source-confirmed PWM semantics"],
      "evidence_basis": [
        "PWM_A role/direction inferred from label",
        "no official/source-confirmed semantics"
      ],
      "gap_or_blocker_reason": [
        "source-confirmed PWM semantics missing"
      ],
      "owner_route": "PAGE_B/source owner confirmation required",
      "ceiling_only": true
    }
  ],
  "blocked_interface_items": [
    {
      "item_ref": "interfaces.local_internal_candidates.TP5",
      "evidence_basis": [
        "container local_internal_candidates",
        "facts: local test/debug only"
      ],
      "gap_or_blocker_reason": "local_internal non-external by default; blocks external harness use",
      "owner_route": "scoped owner reclassification required",
      "ceiling_only": true
    },
    {
      "item_ref": "interfaces.passive_or_none.NC7",
      "evidence_basis": ["facts: no connect"],
      "gap_or_blocker_reason": "no-connect is blocked for harness composition",
      "owner_route": "no harness owner route unless intent changes",
      "ceiling_only": true
    }
  ],
  "review_required_interface_items": [
    {
      "item_ref": "interfaces.inputs.J2_PIN3",
      "evidence_basis": [
        "facts: timing missing, quantity partial",
        "facts: no official source confirmation"
      ],
      "gap_or_blocker_reason": "timing and source-backed constraints absent",
      "owner_route": "owner confirmation required for timing + source semantics",
      "ceiling_only": true
    },
    {
      "item_ref": "interfaces.outputs.PWM_A",
      "evidence_basis": [
        "facts: role/direction inferred from label only",
        "facts: no official source confirmation",
        "facts: quantity missing"
      ],
      "gap_or_blocker_reason": "label inference without source support; quantitative/semantic constraints missing",
      "owner_route": "source/behavior owner confirmation required before candidate-safe promotion",
      "ceiling_only": true
    }
  ],
  "candidate_safe_possible_items": [
    {
      "item_ref": "interfaces.outputs.J1_PIN1",
      "evidence_basis": [
        "external confirmed power output",
        "compatible role/direction/domain/kind",
        "5V/500mA provided"
      ],
      "owner_route": "no unresolved owner interpretation",
      "ceiling_only": true
    }
  ],
  "source_supported_possible_items": [
    {
      "item_ref": "interfaces.outputs.J1_PIN1",
      "evidence_basis": [
        "fact: quantity source-confirmed",
        "official source context available (ref_source_alpha_v1)",
        "quantitative constraints (5V,500mA) present"
      ],
      "owner_route": "no additional owner action needed",
      "ceiling_only": true
    }
  ],
  "compatibility_gap_report": {
    "hard_blocks": [
      "TP5_BOOT local_internal candidate blocks JOIN_2",
      "NC7 no-connect blocks composition of JOINs using NC7"
    ],
    "soft_gaps": [
      "GPIO_WAKE missing timing and full quantity detail",
      "PWM_A is label-inferred without source-backed semantics; no quantity"
    ],
    "harness_level_notes": [
      "JOIN_1 satisfies interface constraints; eligible",
      "JOIN_2 blocked by TP5 scope",
      "JOIN_3 blocked from becoming source-supported due missing timing",
      "JOIN_4 blocked from source-supported due missing PWM source semantics"
    ]
  },
  "owner_followup_needed": [
    {
      "target": "interfaces.inputs.J2_PIN3",
      "action": "Provide official/source-confirmed definition and timing constraints; derive/confirm quantitative bounds",
      "owner_route": "PAGE_A interface owner"
    },
    {
      "target": "interfaces.outputs.PWM_A",
      "action": "Provide source-confirmed PWM semantics and quantitative constraints (frequency/duty/current if applicable)",
      "owner_route": "PAGE_B interface owner / source owner"
    },
    {
      "target": "interfaces.local_internal_candidates.TP5",
      "action": "Decide whether TP5_BOOT can be reclassified to external composition scope; if no, remove from harness consideration",
      "owner_route": "scoped local owner"
    }
  ],
  "interface_open_questions": [
    "Are timing constraints for GPIO_WAKE mandatory for harness-level composition at all supported profiles?",
    "What are the required PWM_A constraints that map to join-level `motor_ctrl_pwm` behavior (frequency, polarity, edge/level semantics)?",
    "Can TP5_BOOT remain internal-only while preserving test/debug intent, or should a separate external-safe boundary alias be introduced?"
  ],
  "source_gap_rerun_triggers": [
    "ref_source_alpha_v1 receives official entries for SRC_GPIO including GPIO_WAKE timing and semantics",
    "ref_source_alpha_v1 receives official entries for SRC_PWM including PWM_A semantics",
    "ref_quant_alpha_v1 updated with quantitative limits for GPIO_WAKE and PWM_A",
    "scoped owner provides authoritative reclassification evidence for TP5_BOOT"
  ],
  "harness_input_delta": [
    {
      "join_id": "JOIN_1",
      "previous_harness_status": "candidate_safe",
      "current_readiness_ceiling": "source_supported_possible",
      "delta": "promotion_if_rule-allows",
      "delta_reason": "J1_PIN1 has source-confirmed quantity and matching 5V/500mA constraints"
    },
    {
      "join_id": "JOIN_2",
      "previous_harness_status": "candidate_safe",
      "current_readiness_ceiling": "blocked",
      "delta": "weakened",
      "delta_reason": "TP5 endpoint is local_internal and not externally composition-safe"
    },
    {
      "join_id": "JOIN_3",
      "previous_harness_status": "review_required",
      "current_readiness_ceiling": "review_required",
      "delta": "unchanged",
      "delta_reason": "timing requirement still unresolved for GPIO_WAKE"
    },
    {
      "join_id": "JOIN_4",
      "previous_harness_status": "candidate_safe",
      "current_readiness_ceiling": "review_required",
      "delta": "weakened",
      "delta_reason": "PWM_A lacks source-confirmed semantics and required quantitative constraints"
    }
  ],
  "boundary_review_note": "Fixture-only synthetic calibration run: readiness is ceiling-only and does not imply final approval. Composition boundary is enforced: local_internal and no-connect items are blocked, label-inferred items without source support remain at review_required, and no external/private data was read or used."
}