{
  "fixture_id": "PUBLIC_SYNTH_PROJECT_READINESS_DIGEST",
  "workflow_id": "project_readiness_digest_v0",
  "project_readiness_digest": {
    "summary": "Readiness is incomplete: the workflow status is ready with a calibration gap, while release-scope ownership and boundary-review confirmation remain unresolved.",
    "source_boundary": "This digest reports only supplied synthetic references and does not replace or mutate upstream artifacts."
  },
  "status_rollup": [
    {
      "ref": "workflow_status:alpha",
      "state": "ready_with_gap",
      "note": "Source packet validated; profile calibration pending."
    },
    {
      "ref": "workflow_status:delta",
      "state": "blocked",
      "note": "Owner decision is missing for release scope.",
      "scope_note": "This ref was supplied but is not listed in digest_scope_refs; scope inclusion requires confirmation."
    }
  ],
  "priority_blockers": [
    {
      "ref": "review_gate:beta",
      "blocker": "Boundary review needs owner confirmation."
    },
    {
      "ref": "workflow_status:delta",
      "blocker": "Release-scope owner decision is missing.",
      "scope_note": "Scope alignment is unresolved."
    }
  ],
  "owner_input_queue": [
    {
      "ref": "owner_backlog:gamma",
      "ask": "Confirm release scope owner",
      "priority": "high"
    },
    {
      "ref": "review_gate:beta",
      "ask": "Confirm boundary review",
      "priority": "unspecified"
    }
  ],
  "next_action_recommendations": [
    {
      "priority": "next",
      "action": "Resolve the owner decision for release scope.",
      "source_ref": "workflow_status:delta",
      "condition": "Confirm that workflow_status:delta is within the approved digest scope."
    },
    {
      "priority": "next",
      "action": "Obtain owner confirmation for the boundary review.",
      "source_ref": "review_gate:beta"
    },
    {
      "priority": "next",
      "action": "Address the pending profile-calibration gap.",
      "source_ref": "workflow_status:alpha"
    },
    {
      "priority": "next",
      "action": "Review owner_decision_packet_v0 as the stated calibration priority.",
      "source_ref": "calibration_priority_refs"
    }
  ],
  "boundary_review_note": {
    "upstream_mutation": "None performed or implied.",
    "non_claims": [
      "No release scope is confirmed.",
      "No owner assignment is confirmed.",
      "No boundary review is approved.",
      "No profile calibration completion is established.",
      "No runtime or external-system state is inferred."
    ],
    "stop_conditions": [
      "Stop publication if any referenced packet is unavailable or conflicting.",
      "Stop release-readiness conclusions until release-scope ownership is confirmed.",
      "Stop boundary approval until owner confirmation is received.",
      "Do not treat workflow_status:delta as in-scope until scope alignment is confirmed."
    ],
    "uncertainty": [
      "The supplied fixture contains workflow_status:delta, but digest_scope_refs does not list it.",
      "Priority for the boundary-review owner input was not specified."
    ]
  }
}
