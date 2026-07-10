{
  "workflow_id": "knowledge_candidate_triage_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|archivist",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "archivist"
  },
  "outputs": {
    "candidate_triage_register": "Candidate A: packet-eligible; Candidate B: owner-review; Candidate C: hold-private; Candidate D: rejected because it lacks sufficient synthetic contract support for an authorized route.",
    "bookshelf_placement_decision": "No candidate is promoted to CANON. Candidate A remains packet-eligible, Candidate B awaits owner review, Candidate C remains hold-private, and Candidate D is rejected.",
    "notebooklm_packet_eligibility_note": "Candidate A is eligible for downstream packet preparation within the public-safe synthetic boundary; eligibility does not establish source truth, CANON status, or owner approval.",
    "owner_review_queue": "Candidate B is queued for owner review because its placement requires authority beyond archivist classification. No approval outcome is inferred.",
    "downstream_route_map": "Candidate A -> packet preparation; Candidate B -> owner-review gate; Candidate C -> hold-private with no public downstream route; Candidate D -> rejected with no downstream promotion.",
    "boundary_review_note": "Routing remains classification-only. No source truth, CANON promotion, owner approval, hidden evidence, upstream mutation, tool use, file edit, or runtime-path claim is made."
  },
  "provenance": [
    "Public-safe synthetic workflow contract for knowledge_candidate_triage_v0.",
    "Synthetic scenario facts and boundary policy supplied in the calibration prompt."
  ],
  "gaps": [
    "Candidate contents and source-quality evidence are not provided.",
    "Owner-review criteria and final owner decisions are not provided."
  ],
  "downstream_handoff": [
    "Prepare Candidate A for packet processing while preserving its non-CANON and unapproved status.",
    "Present Candidate B to the owner gate; retain Candidate C as hold-private and Candidate D as rejected unless new authorized evidence changes classification."
  ],
  "boundary_review_note": [
    "The register distinguishes packet eligibility, owner review, hold-private, and rejection without asserting source truth.",
    "No route grants stronger authority than the synthetic contract supports."
  ],
  "no_claims": [
    "No claim is made that any candidate is verified, approved, or CANON.",
    "No claim is made regarding tool use, file edits, runtime paths, hidden references, private evidence, or upstream mutation."
  ]
}
