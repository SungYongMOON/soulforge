You are calibrating the Soulforge workflow "workflow_knowledge_preflight_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "workflow_knowledge_preflight_v0",
  "candidate_label": "gpt-5.5|xhigh|dwarf|pathfinder",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "xhigh", "species": "dwarf", "class": "pathfinder" },
  "outputs": {
  "knowledge_preflight_packet": "...",
  "query_first_plan": "...",
  "source_scope_recommendation": "...",
  "claim_ceiling_seed": "...",
  "target_workflow_handoff": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Workflow Knowledge Preflight v0
- summary: Investigate needed knowledge in a fixed order before a target workflow starts, so the target receives grounded reusable refs, uncertainty notes, claim-seed guidance, and source-deepening routes without re-reading everything from scratch.
- current public readiness label: draft
- execution mode: local_tool_sequence
- inputs:
- workflow_request_binding
- target_workflow_id
- project_knowledge_context_refs
- preflight_policy
- expected output groups:
  - knowledge_preflight_packet
  - query_first_plan
  - source_scope_recommendation
  - claim_ceiling_seed
  - target_workflow_handoff
  - boundary_review_note
- must preserve:
- fixed order
- query-first
- metadata-only
- boundary
- not an end-to-end replacement
- workflow notes:
- "The investigation order is fixed as: `.registry/knowledge` and canon-backed Obsidian export first, NotebookLM bindings second, `_workmeta` evidence and source packets third, Drive/package refs last when still needed."
- "This workflow is intended to run before another workflow starts, not as an end-to-end replacement for the target workflow."
- "The preflight packet is metadata-only and should point at existing surfaces by ref."

Synthetic scenario facts:
- registry knowledge provides one starting ref
- NotebookLM provides one binding but no authority
- one source packet gap remains
- the target workflow receives only refs and claim-seed guidance

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
