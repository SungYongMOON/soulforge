You are calibrating the Soulforge workflow "page_module_trace_matrix_v0".

Use only the public-safe synthetic workflow contract below.
Do not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.
Do not mutate upstream artifacts.
Return JSON only with no code fences and no leading or trailing commentary.

Required JSON shape:
{
  "workflow_id": "page_module_trace_matrix_v0",
  "candidate_label": "gpt-5.5|low|elf|auditor",
  "profile": { "model": "gpt-5.5", "reasoning_effort": "low", "species": "elf", "class": "auditor" },
  "outputs": {
  "trace_matrix": "...",
  "evidence_authority_map": "...",
  "trace_gap_register": "...",
  "harness_trace_delta": "...",
  "verification_seed_matrix": "...",
  "review_gate_evidence_index": "...",
  "trace_provenance": "...",
  "boundary_review_note": "..."
  },
  "provenance": ["...", "..."],
  "gaps": ["...", "..."],
  "downstream_handoff": ["...", "..."],
  "boundary_review_note": ["...", "..."],
  "no_claims": ["...", "..."]
}

Workflow contract:
- title: Page Module Trace Matrix v0
- summary: Build a row-level governance matrix over page-module, source, materials, layout, quantitative, and harness packets so later harness, verification, and review workflows can consume explicit evidence authority, gaps, and trace links without replacing upstream artifact owners.
- current public readiness label: pilot-executed
- execution mode: local_tool_sequence
- inputs:
- trace_matrix_project_binding
- page_module_spec_refs
- page_asset_manifest_refs
- approved_trace_intake_policy
- expected output groups:
  - trace_matrix
  - evidence_authority_map
  - trace_gap_register
  - harness_trace_delta
  - verification_seed_matrix
  - review_gate_evidence_index
  - trace_provenance
  - boundary_review_note
- must preserve:
- evidence authority
- trace
- boundary
- no mutation
- verification seed
- workflow notes:
- This workflow sits above the page/source/materials/layout/quantitative/interface-control/harness lane as a traceability and governance layer.
- It reads approved packet refs and writes project-local trace outputs; it does not patch source XML, normalized sidecars, intake packets, source packets, materials outputs, layout guides, quantitative overlays, or harness contracts.
- "`source_confirmed`, `derived`, `review_required`, and `missing` are row-level evidence authority states and must not be collapsed into harness claim status."
- Harness consumers receive a claim-strength ceiling and explicit blockers, not an automatic source-supported connection verdict.
- Verification and review consumers receive seed/index rows, not completed verification evidence or review decisions.
- Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.

Synthetic scenario facts:
- one source-supported row
- one review-required row
- one missing-evidence row
- one harness delta must stay below source authority

Boundary policy:
- Do not claim tool use, file edits, runtime paths, or hidden private evidence.
- Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.
- Keep public-safe synthetic boundaries explicit.

The output should be concrete enough for calibration comparison, but it must stay strictly within the synthetic contract above.
