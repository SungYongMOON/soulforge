Calibration replay metadata: candidate_id=MIG_gpt56_luna_medium_shape_r2; model=gpt-5.6-luna; reasoning_effort=medium.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "build_lineage_map".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "build_lineage_map",
  "candidate_label": "gpt-5.6-luna|medium|dwarf|archivist",
  "profile": { "model": "gpt-5.6-luna", "reasoning_effort": "medium", "species": "dwarf", "class": "archivist" },
  "outputs": {
  "research_notes.md": "...",
  "lineage_pbs.md": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Build Lineage Map
- summary: Bounded opening workflow for lineage-map production that stops at evidence-backed planning artifacts.
- current public readiness label: registered
- execution mode: party_sequence
- inputs:
- source_documents
- source_notes
- expected output groups:
  - research_notes.md
  - lineage_pbs.md
- must preserve:
- evidence-backed
- planning
- runtime truth
- boundary
- workflow notes:
- This sample models the bounded opening phase of a work procedure workflow rather than a fully materialized delivery pipeline.
- The opening handoff uses the party's `stabilizer` slot to bound risk before the `investigator` slot drafts the first structure.
- Runtime truth and produced artifacts still belong under `_workmeta/<project_code>/runs/<run_id>/`.

Synthetic scenario facts:
- two source documents partially agree
- one unresolved ambiguity stays in research notes
- the output stops at planning artifacts and does not claim finished delivery

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
