Calibration replay metadata: candidate_id=MIG_gpt56_luna_medium_shape_r2; model=gpt-5.6-luna; reasoning_effort=medium.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "technical_risk_open_question_burndown_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "technical_risk_open_question_burndown_v0",
  "candidate_label": "gpt-5.6-luna|medium|dwarf|auditor",
  "profile": { "model": "gpt-5.6-luna", "reasoning_effort": "medium", "species": "dwarf", "class": "auditor" },
  "outputs": {
  "technical_risk_register": "...",
  "open_question_register": "...",
  "burndown_summary": "...",
  "closure_criteria_register": "...",
  "owner_followup_needed": "...",
  "rerun_routes": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Technical Risk Open Question Burndown v0
- summary: Convert source gaps, ambiguous interfaces, unresolved quantitative fields, blocked simulation needs, and review action items into a bounded technical-risk and open-question register with closure criteria and burndown status.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- risk_scope_refs
- approved_risk_register_policy
- expected output groups:
  - technical_risk_register
  - open_question_register
  - burndown_summary
  - closure_criteria_register
  - owner_followup_needed
  - rerun_routes
  - boundary_review_note
- must preserve:
- risk
- open question
- closure criteria
- boundary
- no false resolution
- workflow notes:
- This workflow is a risk/open-question governance lane. It keeps uncertainty visible and routable; it does not resolve it by itself.
- Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.

Synthetic scenario facts:
- one medium technical risk
- one open question
- one closure criterion
- one rerun route

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
