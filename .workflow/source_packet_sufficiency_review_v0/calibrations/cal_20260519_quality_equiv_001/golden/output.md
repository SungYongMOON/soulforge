{
  "workflow_id": "source_packet_sufficiency_review_v0",
  "candidate_label": "gpt-5.5|xhigh|dwarf|auditor",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "xhigh",
    "species": "dwarf",
    "class": "auditor"
  },
  "outputs": {
    "source_sufficiency_packet": "Result: mixed sufficiency. Claim family A is sufficient for the bounded synthetic claim because the provided contract states one claim family has enough evidence. Claim family B is blocked because required layout guidance is missing. No upstream artifact mutation is allowed or implied.",
    "evidence_coverage_table": "claim_family | status | evidence basis | limit\nA | sufficient | synthetic scenario states enough evidence exists | bounded claim only\nB | blocked | missing layout guidance | no layout-dependent claim allowed\nOwner follow-up | open | synthetic scenario states one follow-up remains | cannot close without owner response",
    "blocked_fields_register": "Blocked field: layout-guidance-dependent claim family. Blocking reason: missing layout guidance. Effect: claim ceiling must exclude layout, placement, routing, thermal layout, EMI layout, and implementation-readiness claims for that family.",
    "owner_followup_needed": "One owner follow-up remains open. Required owner action: provide or approve the missing layout guidance source, or explicitly narrow the claim family so layout guidance is no longer required.",
    "allowed_claim_ceiling": "Allowed ceiling: may claim only that one synthetic claim family is sufficient and one is blocked under the provided public-safe contract. No stronger source authority, implementation readiness, layout correctness, or canon promotion claim is allowed.",
    "rerun_routes": "Rerun route 1: rerun sufficiency review after owner-approved layout guidance is supplied. Rerun route 2: rerun with narrowed claim scope if owner chooses to remove layout-dependent claims. Rerun route 3: keep blocked status if neither evidence nor scope changes.",
    "boundary_review_note": "Boundary preserved: this output uses only the synthetic workflow contract and scenario facts. It does not claim tool use, file edits, runtime paths, hidden refs, private/raw evidence, upstream mutation, or promotion beyond pilot-executed public workflow semantics."
  },
  "provenance": [
    "Public-safe synthetic workflow contract provided in the prompt",
    "Synthetic scenario facts and boundary policy provided in the prompt"
  ],
  "gaps": [
    "Missing layout guidance blocks one claim family",
    "One owner follow-up remains open"
  ],
  "downstream_handoff": [
    "Proceed only with the sufficient claim family at the stated bounded claim ceiling",
    "Route the blocked claim family to owner follow-up or scope narrowing before any stronger claim is made"
  ],
  "boundary_review_note": [
    "No upstream artifacts are mutated or treated as changed",
    "No hidden private evidence, runtime path, tool action, or file edit is used as support"
  ],
  "no_claims": [
    "No claim that all source packets are sufficient",
    "No claim of layout correctness, implementation readiness, canon authority, or private evidence validation"
  ]
}
