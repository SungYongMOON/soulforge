You are calibrating the Soulforge workflow "knowledge_candidate_triage_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "knowledge_candidate_triage_v0",
  "candidate_label": "gpt-5.5|xhigh|dwarf|archivist",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "xhigh", "species": "dwarf", "class": "archivist" },
  "outputs": {
  "candidate_triage_register": "...",
  "bookshelf_placement_decision": "...",
  "notebooklm_packet_eligibility_note": "...",
  "owner_review_queue": "...",
  "downstream_route_map": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Knowledge Candidate Triage v0
- summary: Classify candidate sources and derived knowledge artifacts into inbox, CANON, packet-eligible, owner-review, hold-private, or rejected routes without overclaiming source truth or approval.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- candidate_scope_binding
- bookshelf_state_policy
- triage_policy
- expected output groups:
  - candidate_triage_register
  - bookshelf_placement_decision
  - notebooklm_packet_eligibility_note
  - owner_review_queue
  - downstream_route_map
  - boundary_review_note
- must preserve:
- triage
- owner review
- hold-private
- boundary
- no source truth claim
- workflow notes:
- This workflow unifies candidate routing that was previously scattered across sourcebound outputs, manual procedure capture, and analytics candidates.
- Recommended role posture is archivist for classification, with auditor or owner gate only when the candidate threatens to overclaim.

Synthetic scenario facts:
- one candidate goes to packet-eligible
- one candidate goes to owner review
- one candidate stays hold-private
- one rejection reason is explicit

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
