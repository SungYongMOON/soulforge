You are calibrating the Soulforge workflow "frontline_assault".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "frontline_assault",
  "candidate_label": "gpt-5.5|low|human|administrator",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "low", "species": "human", "class": "administrator" },
  "outputs": {
  "scout_report": "...",
  "decision_note": "...",
  "delivery_handoff": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Frontline Assault
- summary: Canonical workflow for coordinating the frontline assault, keeping curated lessons distinct from mission runtime truth.
- current public readiness label: registered
- execution mode: unspecified
- inputs:
- none stated
- expected output groups:
  - scout_report
  - decision_note
  - delivery_handoff
  - boundary_review_note
- must preserve:
- curated lessons
- runtime truth
- boundary
- handoff
- workflow notes:
- Curated lessons live in the workflow canon while raw execution truth remains with `_workspaces/<project_code>`.

Synthetic scenario facts:
- one confirmed frontline objective
- one ambiguous threat signal that must remain unresolved
- one delivery handoff that depends on later runtime execution

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
