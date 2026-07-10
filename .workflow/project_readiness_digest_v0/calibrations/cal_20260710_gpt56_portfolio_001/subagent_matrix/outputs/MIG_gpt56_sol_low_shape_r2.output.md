{
  "project_readiness_digest": {
    "fixture_id": "PUBLIC_SYNTH_PROJECT_READINESS_DIGEST",
    "workflow_id": "project_readiness_digest_v0",
    "scope_refs": [
      "workflow_status:alpha",
      "review_gate:beta",
      "owner_backlog:gamma"
    ],
    "readiness": "ready_with_gap",
    "summary": "The in-scope status reports a validated source packet with profile calibration pending. Publication readiness remains constrained by a boundary-review blocker requiring owner confirmation and a high-priority request to confirm the release-scope owner.",
    "uncertainty": [
      "The required owner confirmation is not supplied.",
      "No completion evidence for profile calibration is supplied.",
      "workflow_status:delta is supplied but excluded from the digest rollup because it is not listed in digest_scope_refs."
    ]
  },
  "status_rollup": [
    {
      "ref": "workflow_status:alpha",
      "state": "ready_with_gap",
      "reported_note": "source packet validated; profile calibration pending",
      "scope_status": "in_scope",
      "non_claim": "This digest preserves the supplied status and does not independently establish validation or calibration completion."
    },
    {
      "ref": "workflow_status:delta",
      "state": "blocked",
      "reported_note": "owner decision missing for release scope",
      "scope_status": "out_of_scope",
      "non_claim": "This status is recorded only as supplied context and does not affect the bounded rollup."
    }
  ],
  "priority_blockers": [
    {
      "priority": "high",
      "blocker": "boundary review needs owner confirmation",
      "source_ref": "review_gate:beta",
      "stop_condition": "Do not represent boundary review or release readiness as complete until the required owner confirmation is supplied through the authoritative upstream process."
    }
  ],
  "owner_input_queue": [
    {
      "priority": "high",
      "ask": "Confirm release scope owner",
      "source_ref": "owner_backlog:gamma",
      "owner_boundary": "The digest may surface this request but cannot identify, appoint, or confirm the release-scope owner."
    }
  ],
  "next_action_recommendations": [
    {
      "order": 1,
      "action": "Obtain the owner response requested by owner_backlog:gamma and route it to the authoritative upstream artifact.",
      "condition": "Required before treating the boundary-review blocker as resolved.",
      "non_claim": "No owner response is present in the fixture."
    },
    {
      "order": 2,
      "action": "Reassess review_gate:beta after authoritative owner confirmation is available.",
      "condition": "Stop if confirmation remains absent or ambiguous.",
      "non_claim": "This digest does not alter the review-gate packet."
    },
    {
      "order": 3,
      "action": "Address the pending calibration item reported by workflow_status:alpha.",
      "condition": "Retain ready_with_gap until bounded evidence supports a different state.",
      "non_claim": "Calibration completion is not established."
    },
    {
      "order": 4,
      "action": "Consider owner_decision_packet_v0 as the next calibration priority.",
      "source": {
        "workflow_id": "owner_decision_packet_v0",
        "priority": "next"
      },
      "condition": "This is a supplied priority, not evidence that the workflow has started or completed."
    }
  ],
  "boundary_review_note": {
    "result": "publication_with_explicit_gaps_only",
    "source_boundary": "All statements are limited to the supplied synthetic fixture and bounded digest scope. Upstream refs remain authoritative.",
    "owner_boundary": "Owner identity, confirmation, release scope, and blocker resolution remain owner or upstream decisions.",
    "mutation_boundary": "This deliverable is a reporting layer and does not replace or mutate workflow statuses, review gates, owner backlogs, or calibration priorities.",
    "stop_conditions": [
      "Do not claim release readiness while review_gate:beta requires owner confirmation.",
      "Do not claim calibration completion without bounded supporting evidence.",
      "Do not promote workflow_status:delta into the scoped rollup unless digest_scope_refs is authoritatively expanded."
    ]
  }
}
