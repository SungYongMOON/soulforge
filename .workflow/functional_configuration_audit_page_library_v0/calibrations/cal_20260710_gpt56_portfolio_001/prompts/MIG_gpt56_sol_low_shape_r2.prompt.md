Calibration replay metadata: candidate_id=MIG_gpt56_sol_low_shape_r2; model=gpt-5.6-sol; reasoning_effort=low.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "functional_configuration_audit_page_library_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "functional_configuration_audit_page_library_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|auditor",
  "profile": { "model": "gpt-5.6-sol", "reasoning_effort": "low", "species": "dwarf", "class": "auditor" },
  "outputs": {
  "functional_audit_packet": "...",
  "verified_claim_register": "...",
  "unverified_claim_register": "...",
  "discrepancy_register": "...",
  "residual_risk_register": "...",
  "audit_readiness": "...",
  "closure_handoff": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Functional Configuration Audit Page Library v0
- summary: Audit whether configured page modules and harness compositions satisfy declared functional or performance claims using accepted verification evidence and controlled baseline context, without approving acceptance or mutating upstream artifacts.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- functional_audit_project_binding
- audit_scope_refs
- approved_audit_policy
- expected output groups:
  - functional_audit_packet
  - verified_claim_register
  - unverified_claim_register
  - discrepancy_register
  - residual_risk_register
  - audit_readiness
  - closure_handoff
  - boundary_review_note
- must preserve:
- accepted evidence
- discrepancy
- residual risk
- no acceptance claim
- boundary
- workflow notes:
- This workflow is an FCA/SVR-style governance consumer. It audits claims against accepted evidence and known gaps; it does not itself accept the system or close discrepancies.
- Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.

Synthetic scenario facts:
- one verified claim
- one unverified claim
- one discrepancy with residual risk

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
