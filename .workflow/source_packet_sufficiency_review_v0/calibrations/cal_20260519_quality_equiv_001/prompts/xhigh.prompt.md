You are calibrating the Soulforge workflow "source_packet_sufficiency_review_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "source_packet_sufficiency_review_v0",
  "candidate_label": "gpt-5.5|xhigh|dwarf|auditor",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "xhigh", "species": "dwarf", "class": "auditor" },
  "outputs": {
  "source_sufficiency_packet": "...",
  "evidence_coverage_table": "...",
  "blocked_fields_register": "...",
  "owner_followup_needed": "...",
  "allowed_claim_ceiling": "...",
  "rerun_routes": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Source Packet Sufficiency Review v0
- summary: Decide whether collected datasheets, EVAL docs, layout guidance, simulation sources, and owner-approved local packets are sufficient for the intended claim strength without inventing missing evidence or mutating upstream artifacts.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- sufficiency_scope_refs
- source_packet_refs
- approved_sufficiency_policy
- expected output groups:
  - source_sufficiency_packet
  - evidence_coverage_table
  - blocked_fields_register
  - owner_followup_needed
  - allowed_claim_ceiling
  - rerun_routes
  - boundary_review_note
- must preserve:
- sufficient
- blocked
- claim ceiling
- boundary
- no mutation
- workflow notes:
- This workflow is a sufficiency-review lane. It judges whether evidence is enough for a bounded claim family and leaves missing evidence visible.
- Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.

Synthetic scenario facts:
- one claim family has enough evidence
- one claim family is blocked by missing layout guidance
- one owner follow-up remains open

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
