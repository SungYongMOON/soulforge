Calibration replay metadata: candidate_id=MIG_gpt56_sol_low_shape_r2; model=gpt-5.6-sol; reasoning_effort=low.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "test_harness_asset_planning_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "test_harness_asset_planning_v0",
  "candidate_label": "gpt-5.6-sol|low|human|auditor",
  "profile": { "model": "gpt-5.6-sol", "reasoning_effort": "low", "species": "human", "class": "auditor" },
  "outputs": {
  "test_harness_manifest": "...",
  "test_interface_list": "...",
  "simulation_fixture_needs": "...",
  "instrumentation_resource_list": "...",
  "trr_readiness_checklist": "...",
  "planning_blockers": "...",
  "owner_followup_needed": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Test Harness Asset Planning v0
- summary: Plan the physical, simulation, or software test-harness assets needed to verify page modules and composed harness candidates without executing tests, approving TRR, or mutating upstream artifacts.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- test_harness_planning_binding
- verification_readiness_refs
- approved_test_harness_planning_policy
- expected output groups:
  - test_harness_manifest
  - test_interface_list
  - simulation_fixture_needs
  - instrumentation_resource_list
  - trr_readiness_checklist
  - planning_blockers
  - owner_followup_needed
  - boundary_review_note
- must preserve:
- planning only
- readiness
- blocker
- boundary
- no execution claim
- workflow notes:
- This workflow plans harness assets and readiness only. It does not run tests or simulations and does not approve readiness by itself.
- Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.

Synthetic scenario facts:
- one physical fixture need
- one simulation harness need
- one planning blocker
- one owner follow-up item

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
