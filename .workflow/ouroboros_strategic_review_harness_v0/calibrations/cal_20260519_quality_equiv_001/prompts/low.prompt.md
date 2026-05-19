You are calibrating the Soulforge workflow "ouroboros_strategic_review_harness_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "ouroboros_strategic_review_harness_v0",
  "candidate_label": "gpt-5.5|low|dwarf|auditor",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "low", "species": "dwarf", "class": "auditor" },
  "outputs": {
  "vision_alignment_report": "...",
  "owner_intent_gap_register": "...",
  "ambiguity_ledger": "...",
  "socratic_question_packet": "...",
  "owner_question_queue": "...",
  "closure_restatement_note": "...",
  "canon_constraint_candidate_register": "...",
  "next_focus_recommendation": "...",
  "ouroboros_loop_ledger": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Ouroboros Strategic Review Harness v0
- summary: Run a two-lane strategic review loop that checks Soulforge vision alignment and surfaces owner-intent gaps as questions, canon constraint candidates, and next-focus recommendations without inventing missing intent.
- current public readiness label: draft
- execution mode: local_tool_sequence
- inputs:
- vision_and_goal_refs
- roadmap_refs
- current_canon_catalog_refs
- recent_activity_refs
- expected output groups:
  - vision_alignment_report
  - owner_intent_gap_register
  - ambiguity_ledger
  - socratic_question_packet
  - owner_question_queue
  - closure_restatement_note
  - canon_constraint_candidate_register
  - next_focus_recommendation
  - ouroboros_loop_ledger
- must preserve:
- vision alignment
- owner-intent gap
- question
- boundary
- no invented intent
- workflow notes:
- This workflow is a strategic review harness, not a replacement for `post_development_review_gate_v0`.
- The first implementation should be run manually or as a read-only night_watch candidate before any local Codex automation is made active.
- Applied reports belong under `_workmeta/system/` or project-local `_workmeta/<project_code>/`.
- Public canon stores only portable routing rules and blank templates.

Synthetic scenario facts:
- one roadmap alignment confirmation
- one owner-intent gap question
- one next-focus recommendation
- one canon constraint candidate

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
