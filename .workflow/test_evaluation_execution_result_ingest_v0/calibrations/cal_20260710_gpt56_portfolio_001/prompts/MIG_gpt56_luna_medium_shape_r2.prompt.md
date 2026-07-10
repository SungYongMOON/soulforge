Calibration replay metadata: candidate_id=MIG_gpt56_luna_medium_shape_r2; model=gpt-5.6-luna; reasoning_effort=medium.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "test_evaluation_execution_result_ingest_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "test_evaluation_execution_result_ingest_v0",
  "candidate_label": "gpt-5.6-luna|medium|dwarf|auditor",
  "profile": { "model": "gpt-5.6-luna", "reasoning_effort": "medium", "species": "dwarf", "class": "auditor" },
  "outputs": {
  "execution_run_packet": "...",
  "execution_result_register": "...",
  "result_verdicts": "...",
  "run_blockers": "...",
  "owner_followup_needed": "...",
  "downstream_handoff": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Test Evaluation Execution Result Ingest v0
- summary: General TRR/DT-to-FCA/OT execution and result-ingest workflow for packaging non-simulation-specific test, evaluation, inspection, analysis, and demonstration result evidence without claiming acceptance.
- current public readiness label: registered
- execution mode: local_tool_sequence
- inputs:
- test_evaluation_execution_binding
- verification_execution_scope_refs
- approved_test_evaluation_execution_policy
- expected output groups:
  - execution_run_packet
  - execution_result_register
  - result_verdicts
  - run_blockers
  - owner_followup_needed
  - downstream_handoff
  - boundary_review_note
- must preserve:
- result evidence
- no acceptance claim
- blocker
- boundary
- downstream handoff
- workflow notes:
- This package is registered as a workflow canon entry at a contract-only/private-evidence claim ceiling.
- Registration does not claim pilot execution, owner acceptance, TRR/DT/FCA/OT/PCA approval, usable status, production readiness, or optimizer results.
- It fills the general execution/result lane between planning and accepted-result or audit consumers.
- Simulation-specific execution remains owned by simulation_run_verify_v0; this workflow may consume simulation result packet refs but must not duplicate raw simulation payloads.
- Candidate verdict rows can be useful for review and acceptance preparation, but accepted_verification_result_packet_v0 must still decide accepted, blocked, or inconclusive rows from a scoped acceptance basis.
- Public workflow files must not contain raw test logs, waveform data, vendor payloads, private project outputs, credentials, sessions, or runtime absolute paths.

Synthetic scenario facts:
- one passed inspection row
- one blocked execution row
- one downstream handoff to acceptance review

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
