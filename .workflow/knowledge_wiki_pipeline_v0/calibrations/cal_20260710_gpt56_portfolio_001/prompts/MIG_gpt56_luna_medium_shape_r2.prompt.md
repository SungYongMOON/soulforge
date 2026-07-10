Calibration replay metadata: candidate_id=MIG_gpt56_luna_medium_shape_r2; model=gpt-5.6-luna; reasoning_effort=medium.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "knowledge_wiki_pipeline_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "knowledge_wiki_pipeline_v0",
  "candidate_label": "gpt-5.6-luna|medium|dwarf|pathfinder",
  "profile": { "model": "gpt-5.6-luna", "reasoning_effort": "medium", "species": "dwarf", "class": "pathfinder" },
  "outputs": {
  "pipeline_request_packet": "...",
  "routing_decision_note": "...",
  "stage_chain_manifest": "...",
  "source_packet_refs": "...",
  "sourcebound_packet_refs": "...",
  "archive_manifest_refs": "...",
  "obsidian_export_refs": "...",
  "knowledge_access_refs": "...",
  "closeout_review_refs": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Knowledge Wiki Pipeline v0
- summary: Composite request-level workflow candidate that routes knowledge wikiization requests through registered source intake, sourcebound projection, archive/package handoff, Obsidian export decisioning, metadata capture, and closeout review stages while inserting stronger gates only when the request demands them.
- current public readiness label: pilot-executed
- execution mode: party_sequence
- inputs:
- knowledge_wiki_request_packet
- approved_source_policy
- source_scope_binding
- expected output groups:
  - pipeline_request_packet
  - routing_decision_note
  - stage_chain_manifest
  - source_packet_refs
  - sourcebound_packet_refs
  - archive_manifest_refs
  - obsidian_export_refs
  - knowledge_access_refs
  - closeout_review_refs
  - boundary_review_note
- must preserve:
- query-first
- sourcebound
- archive
- boundary
- no source authority grant
- workflow notes:
- The package was extracted from a successful private sourcebound wiki run and an existing `knowledge_wiki_cell` smoke chain.
- The workflow is now registered in `.workflow/index.yaml`.
- `knowledge_wiki_cell` may use this workflow as its default entry while the registered four-stage lane remains the downstream execution chain owned by this composite package.
- "`query_only_with_existing_projection` may bypass fresh intake and fresh projection when a bounded existing private projection ref is already available."
- Owner-held archive refs may be inserted before intake for Drive inbox/candidate storage and after projection/review for working or canon package backup, but storage status does not promote canon.
- Obsidian export is a generated read-only local view over canon-backed knowledge only. It is not a canon owner surface and must not expose `_workmeta` payloads, raw source files, or NotebookLM answers.

Synthetic scenario facts:
- one request can reuse an existing projection
- one stage requires fresh sourcebound work
- one archive/storage note must remain non-authoritative
- one closeout review ref is required

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
