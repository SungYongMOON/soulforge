{
  "accepted_verification_result_packet": {
    "workflow_id": "accepted_verification_result_packet_v0",
    "fixture_id": "PUBLIC_SYNTH_ACCEPTED_VERIFICATION_RESULT",
    "source_kind": "synthetic_from_workflow_contract",
    "public_safe": true,
    "result_scope_identity": [
      "scope:interface-smoke-public"
    ],
    "verification_plan_refs": [
      "plan:interface-contract-v0"
    ],
    "acceptance_policy": "Accept only rows with scoped result artifact and acceptance basis; blocked or inconclusive rows remain explicit.",
    "accepted_result_row_ids": [
      "VR-001"
    ],
    "blocked_or_inconclusive_row_ids": [
      "VR-002"
    ],
    "packet_status": "accepted_with_explicit_blocked_rows"
  },
  "result_summary": {
    "total_rows": 2,
    "accepted_rows": 1,
    "blocked_or_inconclusive_rows": 1,
    "pass_rows": 1,
    "fail_rows": 0,
    "inconclusive_rows": 1,
    "summary_verdict": "partial_acceptance",
    "scope": "scope:interface-smoke-public",
    "non_claim": "This packet records fixture-provided acceptance states only and does not establish acceptance beyond the stated synthetic scope."
  },
  "accepted_result_rows": [
    {
      "accepted_result_row_identity": "VR-001",
      "result_artifact_ref": "VR-001",
      "scope_ref": "scope:interface-smoke-public",
      "verdict": "pass",
      "acceptance": "accepted",
      "acceptance_basis": "public synthetic smoke log ref",
      "basis_status": "scoped_basis_present",
      "source_authority": "public synthetic fixture",
      "limitations": "No execution, runtime verification, or owner acceptance beyond the supplied scope is claimed."
    }
  ],
  "blocked_or_inconclusive_rows": [
    {
      "result_row_identity": "VR-002",
      "result_artifact_ref": "VR-002",
      "scope_ref": "scope:interface-smoke-public",
      "verdict": "inconclusive",
      "acceptance": "blocked",
      "acceptance_basis": "missing measurement artifact",
      "blocker": "Required scoped measurement artifact is absent from the fixture.",
      "stop_condition": "Do not accept this row unless a scoped measurement artifact and applicable acceptance basis are supplied.",
      "source_authority": "public synthetic fixture"
    }
  ],
  "acceptance_provenance": {
    "policy_source": "approved_result_acceptance_policy",
    "scope_refs": [
      "scope:interface-smoke-public"
    ],
    "plan_refs": [
      "plan:interface-contract-v0"
    ],
    "accepted_row_basis": {
      "VR-001": "public synthetic smoke log ref"
    },
    "blocked_row_basis": {
      "VR-002": "missing measurement artifact"
    },
    "provenance_limit": "All provenance is limited to the supplied public-safe synthetic fixture; no external or runtime facts are asserted."
  },
  "boundary_review_note": {
    "upstream_artifacts_treated_as_read_only": true,
    "execution_artifact_mutation_claimed": false,
    "owner_acceptance_beyond_scope_claimed": false,
    "source_authority_replacement_claimed": false,
    "uncertainty_preserved": [
      "VR-002 remains blocked and inconclusive because its measurement artifact is missing."
    ],
    "publication_boundary": "Usable only as a synthetic, scope-bounded handoff for later audit or review consumers."
  }
}
