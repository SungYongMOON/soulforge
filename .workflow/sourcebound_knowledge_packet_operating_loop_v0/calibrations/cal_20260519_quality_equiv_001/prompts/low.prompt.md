You are calibrating the Soulforge workflow "sourcebound_knowledge_packet_operating_loop_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "sourcebound_knowledge_packet_operating_loop_v0",
  "candidate_label": "gpt-5.5|low|dwarf|archivist",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "low", "species": "dwarf", "class": "archivist" },
  "outputs": {
  "source_intake_manifest": "...",
  "sourcebound_knowledge_packet_manifest": "...",
  "compiled_projection_index": "...",
  "compiled_projection_log": "...",
  "contradiction_gap_lint_report": "...",
  "concept_candidate_register": "...",
  "claim_ceiling_and_promotion_route": "...",
  "knowledge_package_archive_manifest": "...",
  "optional_notebooklm_advisory_handoff": "...",
  "notebooklm_handoff_validation": "...",
  "ontology_candidate_rule_register": "...",
  "workflowization_review_packet": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Sourcebound Knowledge Packet Operating Loop v0
- summary: Operate a Karpathy-style source-bound knowledge packet loop from approved source intake through private compiled projection, contradiction/gap lint, concept-candidate extraction, claim ceiling review, optional advisory bookshelf handoff, and workflowization routing.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- source_scope_binding
- approved_source_policy
- knowledge_packet_scope
- promotion_policy
- expected output groups:
  - source_intake_manifest
  - sourcebound_knowledge_packet_manifest
  - compiled_projection_index
  - compiled_projection_log
  - contradiction_gap_lint_report
  - concept_candidate_register
  - claim_ceiling_and_promotion_route
  - knowledge_package_archive_manifest
  - optional_notebooklm_advisory_handoff
  - notebooklm_handoff_validation
  - ontology_candidate_rule_register
  - workflowization_review_packet
  - boundary_review_note
- must preserve:
- source-bound
- claim ceiling
- metadata-only
- boundary
- no canon promotion
- workflow notes:
- Public package files contain only portable orchestration rules and blank templates.
- Runtime source payloads, copied documents, extracted text, hashes for private files, and project-local run truth belong only in private/project-local evidence.
- Optional NotebookLM or similar handoff is preparation metadata only; the tool answer is advisory context, never acceptance authority.
- Owner-held archive surfaces such as Google Drive may hold source candidates, private working bundles, reviewed private packets, and canon packages for backup; archive presence does not promote canon or prove truth.
- When archive policy declares `codex_skill_auto_sync`, an approved Codex skill or Google Drive connector may upload or sync bounded package files without per-file owner confirmation.
- Automatic upload/sync must remain inside the declared archive policy and cannot promote canon, approve source truth, or bypass secret/private boundaries.

Synthetic scenario facts:
- one approved source ref
- one contradiction gap
- one concept candidate
- one claim ceiling that remains below canon authority

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
