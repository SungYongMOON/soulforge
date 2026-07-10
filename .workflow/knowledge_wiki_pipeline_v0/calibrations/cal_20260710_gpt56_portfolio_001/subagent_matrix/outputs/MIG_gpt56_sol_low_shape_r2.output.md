{
  "workflow_id": "knowledge_wiki_pipeline_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|pathfinder",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "pathfinder"
  },
  "outputs": {
    "pipeline_request_packet": "Synthetic request packet binding the approved source policy and source scope to two bounded lanes: lane A reuses an approved existing projection for query-only access; lane B requires fresh sourcebound projection before packaging.",
    "routing_decision_note": "Route lane A through query_only_with_existing_projection, bypassing fresh intake and projection only because a bounded existing private projection ref is available. Route lane B through fresh source intake and sourcebound projection. Apply archive, access, boundary, and closeout gates without granting source or canon authority.",
    "stage_chain_manifest": "Planned chain: request routing; lane A existing-projection validation; lane B fresh intake and sourcebound projection; non-authoritative archive/package handoff; conditional Obsidian export decision; knowledge-access metadata capture; required closeout review.",
    "source_packet_refs": "Synthetic planned ref: source-packet:fresh-lane-b; lane A records intake-bypass:existing-bounded-projection.",
    "sourcebound_packet_refs": "Synthetic planned refs: projection:existing-lane-a and projection:fresh-required-lane-b; both remain bounded by approved source scope.",
    "archive_manifest_refs": "Synthetic planned ref: archive-manifest:non-authoritative-storage; storage records custody only and does not promote canon.",
    "obsidian_export_refs": "Synthetic decision ref: obsidian-export:conditional-read-only; export is permitted only for canon-backed knowledge and excludes work metadata, raw sources, and NotebookLM answers.",
    "knowledge_access_refs": "Synthetic planned refs: access:query-lane-a and access:sourcebound-lane-b; access remains query-first and boundary-scoped.",
    "closeout_review_refs": "Synthetic required ref: closeout-review:knowledge-wiki-pipeline-v0.",
    "boundary_review_note": "Public-safe synthetic plan only. All refs are calibration placeholders, upstream artifacts remain unchanged, archive status is non-authoritative, and no source or canon authority is granted."
  },
  "provenance": [
    "Derived only from the supplied public-safe workflow contract and synthetic scenario facts.",
    "Routing preserves the stated query-first, sourcebound, archive, and boundary requirements."
  ],
  "gaps": [
    "No concrete source contents, projection contents, or approval records were supplied.",
    "Obsidian export eligibility remains conditional on confirmation that selected knowledge is canon-backed."
  ],
  "downstream_handoff": [
    "Validate the bounded existing projection for lane A before allowing the query-only bypass.",
    "Complete fresh sourcebound work for lane B, then record non-authoritative archive status and the required closeout review."
  ],
  "boundary_review_note": [
    "Synthetic identifiers are placeholders and do not assert that artifacts, storage operations, or reviews exist.",
    "No raw evidence, private payload, hidden reference, runtime location, or upstream mutation is represented."
  ],
  "no_claims": [
    "No claim of tool use, file editing, workflow execution, storage completion, or artifact creation is made.",
    "No claim of source ownership, canon promotion, archive authority, or Obsidian canon ownership is made."
  ]
}
