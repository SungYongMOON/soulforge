{
  "workflow_id": "monster_knowledge_preflight_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|pathfinder",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "pathfinder"
  },
  "outputs": {
    "knowledge_preflight_packet": "Metadata-only packet: bind the monster request to the existing wiki binding and the single approved source ref; record the remaining source gap without embedding source content or raising authority.",
    "wiki_first_query_plan": "Query the existing project wiki first for request terminology, known decisions, and references. Compare returned metadata with the approved source ref. Deepen through an approved reference route only if the unresolved source gap affects a required claim.",
    "source_scope_recommendation": "Begin with the existing wiki binding and one approved source ref. Keep the unresolved source gap explicit and narrowly scoped. Use archivist follow-on only if deeper source retrieval is needed; add auditor review only if the proposed claim strength grows.",
    "claim_ceiling_seed": "Current ceiling: claims may state only that an existing wiki binding and one approved source ref are available and that one source gap remains. No completeness, correctness, canon, or source-resolution claim is supported.",
    "main_workflow_handoff": "Proceed to the main workflow with wiki-first querying, metadata-only references, the approved source ref, the explicit source-gap marker, and the seeded claim ceiling. Pause or request archivist follow-on if the gap blocks a necessary claim.",
    "boundary_review_note": "Public-safe synthetic boundary preserved: no tool-use, file-edit, runtime-path, hidden-evidence, upstream-mutation, or stronger-authority claim is made."
  },
  "provenance": [
    "Synthetic scenario fact: an existing wiki binding is available.",
    "Synthetic scenario facts: one approved source ref exists, one source gap remains, and the packet stays metadata-only."
  ],
  "gaps": [
    "One source gap remains unresolved.",
    "The synthetic contract does not specify the gap's subject, severity, or approved resolution route."
  ],
  "downstream_handoff": [
    "Main worker should query the existing wiki binding before seeking deeper sources.",
    "If the source gap affects a required claim, route to archivist follow-on; use auditor posture only if claim strength expands."
  ],
  "boundary_review_note": [
    "All references remain metadata-only and point to existing project surfaces by ref.",
    "No upstream artifact mutation or promotion of source or canon authority is authorized."
  ],
  "no_claims": [
    "No claim that the wiki or approved source fully resolves the monster request.",
    "No claim of tool use, file edits, runtime paths, hidden private evidence, canon promotion, or gap closure."
  ]
}
