Calibration replay metadata: candidate_id=MIG_gpt56_luna_medium_shape_r2; model=gpt-5.6-luna; reasoning_effort=medium.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "monster_knowledge_preflight_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "monster_knowledge_preflight_v0",
  "candidate_label": "gpt-5.6-luna|medium|dwarf|pathfinder",
  "profile": { "model": "gpt-5.6-luna", "reasoning_effort": "medium", "species": "dwarf", "class": "pathfinder" },
  "outputs": {
  "knowledge_preflight_packet": "...",
  "wiki_first_query_plan": "...",
  "source_scope_recommendation": "...",
  "claim_ceiling_seed": "...",
  "main_workflow_handoff": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Monster Knowledge Preflight v0
- summary: Inspect project wiki, NotebookLM bindings, source ledgers, and approved reference routes before a knowledge-heavy monster enters its main workflow, so the worker can query first and deepen only when needed.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- monster_request_binding
- project_knowledge_context_refs
- preflight_policy
- expected output groups:
  - knowledge_preflight_packet
  - wiki_first_query_plan
  - source_scope_recommendation
  - claim_ceiling_seed
  - main_workflow_handoff
  - boundary_review_note
- must preserve:
- query first
- metadata-only
- source gap
- boundary
- claim ceiling
- workflow notes:
- Recommended class posture is pathfinder first, archivist follow-on, auditor only when the claim grows.
- This workflow is intended to sit ahead of source-heavy or ambiguity-heavy monsters, not every workflow in the repo.
- The preflight packet is metadata-only and should point at existing project surfaces by ref.

Synthetic scenario facts:
- existing wiki binding is available
- one approved source ref exists
- one source gap remains
- the packet stays metadata-only

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
