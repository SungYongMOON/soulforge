{
  "workflow_id": "source_packet_sufficiency_review_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|auditor",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "outputs": {
    "source_sufficiency_packet": "Review result: one claim family is sufficient within the approved bounded scope; one claim family is blocked because required layout guidance is missing. Upstream artifacts remain unchanged.",
    "evidence_coverage_table": "Claim family A: sufficient for its bounded claim family. Claim family B: blocked; layout-guidance coverage is missing. Open follow-up: owner must provide or approve the missing guidance.",
    "blocked_fields_register": "Claim family B — blocked field: layout guidance; reason: no qualifying guidance is present in the synthetic source packet; effect: no layout-dependent conclusion may be asserted.",
    "owner_followup_needed": "Yes. Obtain owner-approved layout guidance or an owner decision that formally narrows the intended claim so it no longer depends on that evidence.",
    "allowed_claim_ceiling": "Claims may state that claim family A is supported within the reviewed scope. Claim family B may only be described as blocked pending layout guidance; no stronger layout-dependent claim is allowed.",
    "rerun_routes": "Rerun this sufficiency review after owner-approved layout guidance is added to the source packet, or after the owner approves a narrower sufficiency scope and corresponding claim family.",
    "boundary_review_note": "The review uses only the public-safe synthetic contract, preserves sufficient and blocked states, exposes the claim ceiling and open follow-up, and makes no mutation or authority-promotion claim."
  },
  "provenance": [
    "Public-safe synthetic workflow contract for source_packet_sufficiency_review_v0.",
    "Synthetic scenario facts and boundary policy supplied in the calibration prompt."
  ],
  "gaps": [
    "Layout guidance required for claim family B is missing.",
    "The owner follow-up concerning missing evidence or scope narrowing remains open."
  ],
  "downstream_handoff": [
    "Downstream users may consume claim family A only at the stated bounded claim ceiling.",
    "Route claim family B to owner follow-up and rerun review after approved evidence or scope resolution."
  ],
  "boundary_review_note": [
    "No tool use, file edit, runtime path, hidden reference, or private evidence is asserted.",
    "No upstream artifact is mutated, and no stronger source or canon authority is promoted."
  ],
  "no_claims": [
    "No claim is made that missing layout guidance exists or has been reviewed.",
    "No claim is made that claim family B is sufficient or that the open owner follow-up is resolved."
  ]
}
