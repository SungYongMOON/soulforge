You are calibrating the Soulforge workflow "llm_wiki_builder_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "llm_wiki_builder_v0",
  "candidate_label": "gpt-5.5|low|dwarf|pathfinder",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "low", "species": "dwarf", "class": "pathfinder" },
  "outputs": {
  "builder_scope_packet": "...",
  "preflight_result_ref": "...",
  "candidate_triage_ref": "...",
  "sourcebound_route_ref": "...",
  "curation_result_ref": "...",
  "usage_capture_note": "...",
  "final_builder_handoff": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: LLM Wiki Builder v0
- summary: Orchestrate query-first project wiki use, candidate triage, optional sourcebound deepening, curation planning, usage-capture handoff, and governance routing for bounded knowledge-heavy project work.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- builder_request_binding
- project_wiki_context_refs
- builder_policy
- expected output groups:
  - builder_scope_packet
  - preflight_result_ref
  - candidate_triage_ref
  - sourcebound_route_ref
  - curation_result_ref
  - usage_capture_note
  - final_builder_handoff
  - boundary_review_note
- must preserve:
- query-first
- triage
- sourcebound
- boundary
- authority stays with sources
- workflow notes:
- The builder exists so a knowledge-heavy monster can be handled as one explicit route instead of scattered manual memory.
- It still leaves authority with sources, owner decisions, and the review gate.

Synthetic scenario facts:
- preflight passes with one source gap
- triage routes one candidate to sourcebound deepening
- one curation follow-up remains
- one usage-capture handoff is explicit

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
