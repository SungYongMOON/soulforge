Calibration replay metadata: candidate_id=MIG_gpt56_luna_medium_shape_r2; model=gpt-5.6-luna; reasoning_effort=medium.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "knowledge_access_event_capture_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "knowledge_access_event_capture_v0",
  "candidate_label": "gpt-5.6-luna|medium|dwarf|archivist",
  "profile": { "model": "gpt-5.6-luna", "reasoning_effort": "medium", "species": "dwarf", "class": "archivist" },
  "outputs": {
  "project_binding": "...",
  "knowledge_access_event_batch": "...",
  "normalized_access_event_log": "...",
  "usage_rollup": "...",
  "retention_label_packet": "...",
  "link_strength_analysis": "...",
  "knowledge_accumulation_delta": "...",
  "graph_update_packet": "...",
  "orphan_redundancy_candidate_register": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Knowledge Access Event Capture v0
- summary: Normalize and analyze metadata-only knowledge access ledger/register entries for existing knowledge nodes, packets, concepts, workflows, skills, missions, user tasks, tools, and advisory handoffs so later workflows can compute usage counts, retention labels, relation strength, orphan/redundant candidates, and graph update packets.
- current public readiness label: draft
- execution mode: local_tool_sequence
- inputs:
- knowledge_access_scope
- knowledge_node_ref_set
- knowledge_access_ledger_refs
- retention_label_policy
- expected output groups:
  - project_binding
  - knowledge_access_event_batch
  - normalized_access_event_log
  - usage_rollup
  - retention_label_packet
  - link_strength_analysis
  - knowledge_accumulation_delta
  - graph_update_packet
  - orphan_redundancy_candidate_register
  - boundary_review_note
- must preserve:
- metadata-only
- retention
- graph update
- boundary
- not source truth
- workflow notes:
- During ordinary work, agents or tooling append lightweight metadata-only ledger/register rows when a knowledge ref is used; this workflow is the later normalization, rollup, analysis, and routing lane for those rows.
- This workflow must not copy source text, private packet payloads, advisory answers, credentials, or local runtime paths into public workflow canon.
- Labels such as hot, warm, cold, stale, archive candidate, retire candidate, strong, weak, orphan, and redundant are candidate signals until a project policy or owner decision accepts an action.
- Output packets are designed to feed later graph or Obsidian-style visualization by carrying stable node refs, edge refs, event ids, counts, recency, outcome states, and confidence hints.
- Knowledge accumulation deltas capture metadata-only changes in observed usage or candidate linkage; they are not ontology acceptance, source truth, or canon promotion.
- The workflow is not profile-optimized and does not claim production readiness.

Synthetic scenario facts:
- three metadata-only access events
- one hot retention label
- one orphan candidate edge
- one graph update packet candidate

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
