{
  "interface_control_ledger": [
    {"ref":"interfaces.outputs.J1_PIN1","item":"J1_PIN1","ceiling":"source_supported_possible","evidence_basis":["external confirmed","source-confirmed power output","direction output","domain power","kind wire_to_wire","5V","500mA","quantity source-confirmed"],"gap_or_blocker_reason":null,"owner_route":"none_required","ceiling_only":"readiness ceiling, not final harness approval"},
    {"ref":"interfaces.inputs.J2_PIN3","item":"GPIO_WAKE","ceiling":"review_required","evidence_basis":["external candidate digital input","direction input","domain digital","kind signal_wire","3.3V logic","quantity partial"],"gap_or_blocker_reason":"timing constraint missing and quantitative support is partial","owner_route":"source_or_page_owner_confirm_timing_and_quant_constraints","ceiling_only":"cannot promote until missing timing/quantity gaps close"},
    {"ref":"interfaces.local_internal_candidates.TP5","item":"TP5","ceiling":"blocked","evidence_basis":["local_internal_candidates container","local test/debug only","bidirectional or unknown","kind test_point"],"gap_or_blocker_reason":"local/test-only non-external item blocks external harness composition","owner_route":"scoped_owner_reclassification_required_before_external_use","ceiling_only":"blocked for harness composition"},
    {"ref":"interfaces.passive_or_none.NC7","item":"NC7","ceiling":"blocked","evidence_basis":["passive_or_none container","no connect"],"gap_or_blocker_reason":"no-connect item is non-composition-scope","owner_route":"none_unless_source_reclassifies_nc_status","ceiling_only":"blocked for harness composition"},
    {"ref":"interfaces.outputs.PWM_A","item":"PWM_A","ceiling":"review_required","evidence_basis":["role and direction inferred from label only","no official source confirmation","quantity missing"],"gap_or_blocker_reason":"label inference lacks official/source support and quantitative constraints","owner_route":"source_or_page_owner_confirm_pwm_semantics_direction_and_quant_constraints","ceiling_only":"label-only inference cannot exceed review_required"}
  ],
  "harness_readiness_matrix": [
    {"join_id":"JOIN_1","endpoints":["J1_PIN1","external_load_vbus"],"previous_harness_status":"candidate_safe","interface_ceiling":"source_supported_possible","harness_ceiling":"candidate_safe_possible","evidence_basis":["J1_PIN1 source-supported","requires 5V and 500mA present"],"gap_or_blocker_reason":null,"owner_route":"none_required","ceiling_only":"previous harness status is not final approval"},
    {"join_id":"JOIN_2","endpoints":["TP5","external_debug_header"],"previous_harness_status":"candidate_safe","interface_ceiling":"blocked","harness_ceiling":"blocked","evidence_basis":["TP5 is local_internal/test_point/test-debug only"],"gap_or_blocker_reason":"external debug-header join uses blocked local-only item","owner_route":"scoped_owner_reclassification_required_before_external_use","ceiling_only":"harness weakened by interface ceiling"},
    {"join_id":"JOIN_3","endpoints":["GPIO_WAKE","wake_controller"],"previous_harness_status":"review_required","interface_ceiling":"review_required","harness_ceiling":"review_required","evidence_basis":["GPIO_WAKE external candidate input","3.3V logic present","timing constraint required"],"gap_or_blocker_reason":"required timing constraint missing","owner_route":"source_or_page_owner_confirm_timing_constraint","ceiling_only":"cannot exceed interface-control ceiling"},
    {"join_id":"JOIN_4","endpoints":["PWM_A","motor_ctrl_pwm"],"previous_harness_status":"candidate_safe","interface_ceiling":"review_required","harness_ceiling":"review_required","evidence_basis":["PWM_A semantics inferred from label only","requires source-confirmed PWM semantics"],"gap_or_blocker_reason":"source-confirmed PWM semantics missing","owner_route":"source_or_page_owner_confirm_pwm_semantics","ceiling_only":"harness weakened by interface ceiling"}
  ],
  "blocked_interface_items": [
    {"item":"TP5","ref":"interfaces.local_internal_candidates.TP5","evidence_basis":["local test/debug only","local_internal_candidates"],"gap_or_blocker_reason":"non-external local/test-only item","owner_route":"scoped_owner_reclassification_required","ceiling_only":"blocked"},
    {"item":"NC7","ref":"interfaces.passive_or_none.NC7","evidence_basis":["no connect"],"gap_or_blocker_reason":"no-connect item","owner_route":"none_unless_reclassified_by_source","ceiling_only":"blocked"}
  ],
  "review_required_interface_items": [
    {"item":"GPIO_WAKE","ref":"interfaces.inputs.J2_PIN3","evidence_basis":["external candidate digital input","3.3V logic","quantity partial"],"gap_or_blocker_reason":"timing missing and quantity partial","owner_route":"source_or_page_owner","ceiling_only":"review_required"},
    {"item":"PWM_A","ref":"interfaces.outputs.PWM_A","evidence_basis":["label-only role/direction inference","no official source confirmation"],"gap_or_blocker_reason":"missing source-confirmed PWM semantics and quantity","owner_route":"source_or_page_owner","ceiling_only":"review_required"}
  ],
  "candidate_safe_possible_items": [],
  "source_supported_possible_items": [
    {"item":"J1_PIN1","ref":"interfaces.outputs.J1_PIN1","evidence_basis":["external confirmed power output","5V","500mA","quantity source-confirmed"],"gap_or_blocker_reason":null,"owner_route":"none_required","ceiling_only":"source_supported_possible"}
  ],
  "compatibility_gap_report": [
    {"scope":"JOIN_2","gap":"TP5 is local/test-only and not externally eligible"},
    {"scope":"JOIN_3","gap":"GPIO_WAKE lacks required timing constraint"},
    {"scope":"JOIN_4","gap":"PWM_A lacks source-confirmed PWM semantics and quantitative constraints"}
  ],
  "owner_followup_needed": [
    {"item":"TP5","owner_route":"scoped owner/source evidence needed to reclassify from local_internal before any external harness use"},
    {"item":"GPIO_WAKE","owner_route":"source/page owner must provide timing and complete quantitative constraints"},
    {"item":"PWM_A","owner_route":"source/page owner must confirm PWM semantics, direction, domain, and quantities"}
  ],
  "interface_open_questions": [
    {"item":"GPIO_WAKE","question":"What timing constraint governs wake_controller composition?"},
    {"item":"PWM_A","question":"Is PWM_A officially source-confirmed as an external PWM output, and what quantitative constraints apply?"},
    {"item":"TP5","question":"Is there scoped owner/source evidence reclassifying TP5 as external composition-scope?"}
  ],
  "source_gap_rerun_triggers": [
    "New official/source evidence for GPIO_WAKE timing or quantitative constraints",
    "Scoped owner/source reclassification evidence for TP5 external eligibility",
    "Official/source confirmation for PWM_A PWM semantics and quantitative constraints",
    "Source correction changing NC7 from no-connect to a valid composition endpoint"
  ],
  "harness_input_delta": [
    {"join_id":"JOIN_1","delta":"retain as candidate_safe_possible ceiling; source support exists but harness status is not strengthened to final approval"},
    {"join_id":"JOIN_2","delta":"downgrade from previous candidate_safe to blocked"},
    {"join_id":"JOIN_3","delta":"remain review_required due to timing gap"},
    {"join_id":"JOIN_4","delta":"downgrade from previous candidate_safe to review_required"}
  ],
  "boundary_review_note": "Public-safe synthetic calibration only. Used fixture-provided facts only; no private data, hidden golden output, telemetry, file access, command execution, or upstream mutation assumed."
}