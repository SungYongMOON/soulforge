{
  "fixture_id": "PUBLIC_SYNTH_OWNER_DECISION_PACKET",
  "workflow_id": "owner_decision_packet_v0",
  "owner_decision_packet": {
    "scope": "public sample release naming convention only",
    "decision": "Owner approves renaming the public sample output field from old_label to display_label for future examples.",
    "policy": "Record scope, affected artifacts, downstream effects, and non-claims. Do not mutate upstream artifacts or claim tests passed.",
    "evidence_basis_refs": [
      "decision-note:public-synthetic-001"
    ],
    "affected_workflow_refs": [
      "workflow:project_readiness_digest_v0"
    ],
    "decision_boundary": "Applies only to future public examples within the stated naming scope.",
    "technical_evidence_status": "Not established by this decision packet."
  },
  "decision_effect_register": [
    {
      "effect_id": "synthetic-effect-001",
      "affected_artifact": "future public sample output field",
      "from": "old_label",
      "to": "display_label",
      "effect_type": "approved naming change",
      "upstream_mutation": false
    }
  ],
  "downstream_effect_map": [
    {
      "downstream_surface": "future public examples",
      "expected_effect": "Use display_label instead of old_label where the approved scope applies.",
      "dependency": "Future example authoring or generation.",
      "not_proven": [
        "Existing upstream artifacts were changed.",
        "Tests passed.",
        "Technical behavior or compatibility was validated.",
        "The naming change applies outside the stated public-sample scope."
      ]
    }
  ],
  "boundary_review_note": {
    "upstream_artifacts_mutated": false,
    "technical_evidence_claimed": false,
    "owner_authority_boundary_preserved": true,
    "uncertainties": [
      "No implementation location or migration inventory is specified.",
      "The effect on existing examples is unspecified."
    ],
    "stop_conditions": [
      "Stop if the requested scope expands beyond the public sample release naming convention.",
      "Stop if implementation, migration, compatibility, or test claims are requested without separate evidence.",
      "Stop before changing upstream artifacts unless separately authorized."
    ]
  }
}
