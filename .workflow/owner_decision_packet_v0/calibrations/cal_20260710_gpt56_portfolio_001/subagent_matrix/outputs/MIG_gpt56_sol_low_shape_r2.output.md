{
  "owner_decision_packet": {
    "fixture_id": "PUBLIC_SYNTH_OWNER_DECISION_PACKET",
    "workflow_id": "owner_decision_packet_v0",
    "source_kind": "synthetic_from_workflow_contract",
    "public_safe": true,
    "decision_scope": "public sample release naming convention only",
    "decision_statement": "Owner approves renaming the public sample output field from old_label to display_label for future examples.",
    "decision_policy": "Record scope, affected artifacts, downstream effects, and non-claims. Do not mutate upstream artifacts or claim tests passed.",
    "decision_status": "approved_as_supplied_by_fixture",
    "effective_scope": {
      "included": [
        "Future public examples within the stated sample release naming convention",
        "The example output-field name old_label",
        "Replacement of old_label with display_label"
      ],
      "excluded": [
        "Historical examples unless separately approved",
        "Private or production artifacts",
        "Runtime schemas, implementations, integrations, and stored data",
        "Any artifact outside the explicitly stated decision scope"
      ]
    },
    "affected_workflow_refs": [
      "workflow:project_readiness_digest_v0"
    ],
    "evidence_basis_refs": [
      "decision-note:public-synthetic-001"
    ],
    "unprovided_optional_refs": {
      "affected_page_asset_refs": [],
      "affected_harness_refs": [],
      "affected_connection_refs": []
    },
    "authority_boundary": "This packet records the supplied owner decision. It does not extend the decision beyond its stated scope or authorize unrelated changes.",
    "uncertainties": [
      "The specific future examples affected by the naming change are not identified.",
      "No effective date or release identifier is supplied.",
      "No compatibility, migration, or deprecation policy is supplied.",
      "No page, asset, harness, connection, schema, or implementation references are supplied."
    ]
  },
  "decision_effect_register": [
    {
      "effect_id": "synthetic-effect-001",
      "decision_ref": "decision-note:public-synthetic-001",
      "surface_ref": "workflow:project_readiness_digest_v0",
      "effect_type": "future_example_field_naming",
      "effect": "Future public examples in scope should use display_label instead of old_label.",
      "required_follow_up": "Identify each in-scope future example before applying the naming convention.",
      "mutation_status": "not_performed",
      "non_claims": [
        "No upstream artifact was mutated.",
        "No runtime schema or implementation was changed.",
        "No test, validation, compatibility, or deployment result is established."
      ]
    },
    {
      "effect_id": "synthetic-effect-002",
      "decision_ref": "decision-note:public-synthetic-001",
      "surface_ref": "synthetic:historical_examples",
      "effect_type": "scope_exclusion",
      "effect": "Historical examples remain unchanged unless a separate owner decision includes them.",
      "required_follow_up": "Obtain separate owner approval before revising historical examples.",
      "mutation_status": "not_performed",
      "non_claims": [
        "This decision does not establish retroactive renaming.",
        "This decision does not establish migration requirements."
      ]
    },
    {
      "effect_id": "synthetic-effect-003",
      "decision_ref": "decision-note:public-synthetic-001",
      "surface_ref": "synthetic:technical_surfaces",
      "effect_type": "technical_non_claim",
      "effect": "Technical surfaces remain outside the demonstrated effect of this owner decision.",
      "required_follow_up": "Supply authoritative technical references and separate approval before any implementation, schema, harness, connection, or data change.",
      "mutation_status": "not_performed",
      "non_claims": [
        "The decision does not prove that display_label is implemented or accepted.",
        "The decision does not prove that old_label is deprecated or unsupported.",
        "The decision does not prove that consumers are compatible with the renamed field."
      ]
    }
  ],
  "downstream_effect_map": {
    "source_decision_ref": "decision-note:public-synthetic-001",
    "direct_effects": [
      {
        "target_ref": "workflow:project_readiness_digest_v0",
        "effect": "Future public examples within the approved scope should present display_label in place of old_label.",
        "status": "decision_recorded_only"
      }
    ],
    "conditional_effects": [
      {
        "target_ref": "synthetic:future_public_examples",
        "condition": "The example is confirmed to fall within the public sample release naming convention.",
        "effect": "Apply the approved display_label naming."
      },
      {
        "target_ref": "synthetic:documentation_or_templates",
        "condition": "A specific artifact is identified as a future public example and modification is separately authorized.",
        "effect": "Align the bounded example field name with the owner decision."
      }
    ],
    "blocked_or_unresolved_effects": [
      {
        "target_ref": "synthetic:runtime_schema",
        "reason": "No schema reference, technical evidence, or implementation authority is supplied."
      },
      {
        "target_ref": "synthetic:historical_examples",
        "reason": "Retroactive scope is not approved."
      },
      {
        "target_ref": "synthetic:consumers_and_integrations",
        "reason": "No connection references, compatibility evidence, or migration policy is supplied."
      }
    ],
    "propagation_limit": "Do not propagate the naming change beyond identified future public examples covered by the stated scope.",
    "stop_conditions": [
      "Stop if an artifact is not clearly a future public example within the approved naming scope.",
      "Stop before modifying any upstream, historical, private, production, schema, implementation, harness, connection, or stored-data surface.",
      "Stop if applying the rename would require an unapproved compatibility, migration, or deprecation decision.",
      "Stop if technical acceptance, test passage, deployment, or runtime behavior would need to be asserted without separate evidence."
    ]
  },
  "boundary_review_note": {
    "review_scope": "Synthetic owner-decision packet content only",
    "upstream_mutation": "none_claimed",
    "technical_evidence_posture": "The supplied owner decision is recorded as an authority statement within its stated scope; it is not treated as proof of implementation, compatibility, validation, testing, deployment, or runtime behavior.",
    "source_boundary": "Content is limited to the public synthetic fixture and public workflow contract.",
    "owner_boundary": "Only the owner-approved future-example naming convention is recorded. No additional owner intent is inferred.",
    "optional_reference_boundary": "Absent page, asset, harness, and connection references remain unknown and are not invented.",
    "non_claims": [
      "No commands were run.",
      "No files were opened or changed.",
      "No services were contacted.",
      "No messages were sent.",
      "No runtime facts were verified.",
      "No tests are claimed to have passed."
    ],
    "review_outcome": "bounded_with_unresolved_technical_effects",
    "required_next_boundary": "Any actual artifact change or technical propagation requires identified targets, appropriate authority, and evidence separate from this decision packet."
  }
}
