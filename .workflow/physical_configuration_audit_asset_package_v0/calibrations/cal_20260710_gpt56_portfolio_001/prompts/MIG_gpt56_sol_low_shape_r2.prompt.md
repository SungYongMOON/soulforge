Calibration replay metadata: candidate_id=MIG_gpt56_sol_low_shape_r2; model=gpt-5.6-sol; reasoning_effort=low.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are calibrating the Soulforge workflow "physical_configuration_audit_asset_package_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "physical_configuration_audit_asset_package_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|auditor",
  "profile": { "model": "gpt-5.6-sol", "reasoning_effort": "low", "species": "dwarf", "class": "auditor" },
  "outputs": {
  "physical_audit_packet": "...",
  "artifact_inventory_report": "...",
  "checksum_report": "...",
  "missing_or_mismatched_artifacts": "...",
  "release_blocking_discrepancies": "...",
  "owner_followup_needed": "...",
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
- title: Physical Configuration Audit Asset Package v0
- summary: Verify that an artifact package matches the declared physical/configuration baseline using checksums, attachment records, source refs, and release-candidate package inventory without judging functional adequacy or mutating upstream artifacts.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- physical_audit_project_binding
- baseline_manifest_refs
- approved_physical_audit_policy
- expected output groups:
  - physical_audit_packet
  - artifact_inventory_report
  - checksum_report
  - missing_or_mismatched_artifacts
  - release_blocking_discrepancies
  - owner_followup_needed
  - closure_handoff
  - boundary_review_note
- must preserve:
- baseline
- checksum
- discrepancy
- boundary
- no functional claim
- workflow notes:
- This workflow is a PCA-style governance consumer. It checks package alignment to a declared configuration baseline, not whether the system function is adequate.
- Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.

Synthetic scenario facts:
- one checksum match
- one missing artifact
- one release-blocking discrepancy

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
