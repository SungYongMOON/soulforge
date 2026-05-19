You are calibrating the Soulforge workflow "wiki_curation_maintenance_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "wiki_curation_maintenance_v0",
  "candidate_label": "gpt-5.5|low|dwarf|archivist",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "low", "species": "dwarf", "class": "archivist" },
  "outputs": {
  "source_ledger_curation_packet": "...",
  "packet_map_update_note": "...",
  "notebook_binding_update_note": "...",
  "lifecycle_state_delta": "...",
  "residual_gap_register": "...",
  "review_handoff": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Wiki Curation Maintenance v0
- summary: Maintain project wiki state after bounded work by producing metadata-only update packets for source ledgers, packet maps, notebook bindings, lifecycle states, residual gaps, and review handoff.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- curation_scope_binding
- curation_policy
- lifecycle_policy
- expected output groups:
  - source_ledger_curation_packet
  - packet_map_update_note
  - notebook_binding_update_note
  - lifecycle_state_delta
  - residual_gap_register
  - review_handoff
  - boundary_review_note
- must preserve:
- metadata-only
- curation
- residual gap
- boundary
- no source-truth claim
- workflow notes:
- This workflow produces curation packets and notes, not direct source-truth claims.
- It is the executable companion to the workspace runbook, not a replacement for owner decisions or sourcebound review.

Synthetic scenario facts:
- one source ledger update
- one packet map update
- one residual gap
- one review handoff

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
