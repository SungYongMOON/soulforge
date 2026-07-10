{
  "workflow_id": "owner_decision_packet_v0",
  "fixture_id": "PUBLIC_SYNTH_OWNER_DECISION_PACKET",
  "owner_decision_packet": {
    "decision_id": "owner-decision:public-synthetic-001",
    "scope": "public sample release naming convention only",
    "statement": "Owner approves renaming the public sample output field from old_label to display_label for future examples.",
    "policy": "Record scope, affected artifacts, downstream effects, and non-claims. Do not mutate upstream artifacts or claim tests passed.",
    "evidence_basis_refs": [
      "decision-note:public-synthetic-001"
    ],
    "affected_workflow_refs": [
      "workflow:project_readiness_digest_v0"
    ],
    "approval_boundary": "Applies only to future public sample examples and the specified output-field naming convention.",
    "status": "recorded"
  },
  "decision_effect_register": [
    {
      "effect_id": "effect:public-synthetic-001",
      "affected_artifact": "future public sample output field",
      "current_label": "old_label",
      "approved_label": "display_label",
      "effect_type": "future-example-naming-update",
      "upstream_mutation": false
    }
  ],
  "downstream_effect_map": [
    {
      "downstream_ref": "workflow:project_readiness_digest_v0",
      "expected_effect": "Future public examples may use display_label instead of old_label where the approved scope applies.",
      "required_follow_up": "Apply the naming convention only when preparing future examples within scope.",
      "non_claims": [
        "Does not establish that tests passed.",
        "Does not establish technical readiness.",
        "Does not alter upstream workflow artifacts.",
        "Does not validate any implementation or runtime behavior."
      ]
    }
  ],
  "boundary_review_note": {
    "scope_check": "Decision is limited to the public sample release naming convention.",
    "source_boundary": "Evidence basis is limited to decision-note:public-synthetic-001.",
    "owner_boundary": "Owner approval is recorded; no technical or runtime authority is inferred.",
    "mutation_check": "No upstream artifact mutation is authorized or represented.",
    "technical_evidence_check": "No technical evidence is asserted beyond the supplied owner decision.",
    "stop_conditions": [
      "Stop if the requested change extends beyond future public sample examples.",
      "Stop if implementation, testing, runtime verification, or upstream artifact mutation is requested under this packet.",
      "Stop if additional evidence or owner authority is required but not supplied."
    ],
    "review_status": "boundary-preserved"
  }
}
