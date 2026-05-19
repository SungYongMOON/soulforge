{
  "workflow_id": "page_module_trace_matrix_v0",
  "candidate_label": "gpt-5.5|xhigh|elf|auditor",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "xhigh",
    "species": "elf",
    "class": "auditor"
  },
  "outputs": {
    "trace_matrix": "R1 page-module-to-source: evidence_authority=source_confirmed; claim_ceiling=source_confirmed; downstream_use=seed harness and review index. R2 page-module-to-layout/materials: evidence_authority=review_required; claim_ceiling=review_required; downstream_use=block automatic source-supported verdict. R3 page-module-to-quantitative/interface-control: evidence_authority=missing; claim_ceiling=missing; downstream_use=gap only. R4 harness-delta-row: evidence_authority=derived; claim_ceiling=review_required because harness delta must stay below source authority.",
    "evidence_authority_map": "source_confirmed means approved packet refs directly support the row. derived means trace is computed or transformed from approved refs and cannot exceed its source ceiling. review_required means plausible linkage needs explicit review before stronger use. missing means required evidence is absent and must remain a blocker.",
    "trace_gap_register": "G1 R2 requires reviewer confirmation before any source-supported claim. G2 R3 lacks evidence and must remain a missing-evidence blocker. G3 R4 harness delta is usable only as a bounded derived signal and must not become a source authority claim.",
    "harness_trace_delta": "Harness receives R1 as source_confirmed seed, R2 as review_required blocker, R3 as missing blocker, and R4 as derived delta capped below source authority. No automatic connection verdict is emitted.",
    "verification_seed_matrix": "V1 seed from R1: verify source-confirmed continuity. V2 seed from R2: verify reviewer decision requirement. V3 seed from R3: verify evidence absence handling. V4 seed from R4: verify harness delta ceiling enforcement.",
    "review_gate_evidence_index": "Index rows: R1 source-confirmed evidence authority; R2 review-required decision point; R3 missing-evidence blocker; R4 derived harness delta with capped authority. The index supports review, not review completion.",
    "trace_provenance": "All rows are derived only from the public-safe synthetic workflow contract and synthetic scenario facts. Provenance is portable, sanitized, and limited to orchestration semantics, authority states, and trace behavior.",
    "boundary_review_note": "No upstream mutation, no hidden evidence, no runtime artifacts, and no stronger authority promotion are asserted. The output remains a synthetic calibration artifact."
  },
  "provenance": [
    "Public-safe synthetic workflow contract for page_module_trace_matrix_v0.",
    "Synthetic scenario facts: one source-supported row, one review-required row, one missing-evidence row, and one harness delta below source authority."
  ],
  "gaps": [
    "The review-required row cannot be promoted without an explicit review decision.",
    "The missing-evidence row cannot support verification or harness claims beyond gap registration."
  ],
  "downstream_handoff": [
    "Harness consumers receive claim ceilings and blockers, not automatic source-supported verdicts.",
    "Verification and review consumers receive seed and index rows, not completed verification evidence or final review decisions."
  ],
  "boundary_review_note": [
    "This calibration output does not claim tool use, file edits, runtime paths, hidden refs, or private/raw evidence.",
    "This calibration output does not mutate or replace upstream artifact owners."
  ],
  "no_claims": [
    "No source XML, sidecar, intake packet, source packet, materials output, layout guide, quantitative overlay, or harness contract was changed.",
    "No row authority is promoted beyond source_confirmed, derived, review_required, or missing as allowed by the synthetic contract."
  ]
}
