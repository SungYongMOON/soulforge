{
  "workflow_id": "page_module_trace_matrix_v0",
  "candidate_label": "gpt-5.6-sol|low|elf|auditor",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "elf",
    "class": "auditor"
  },
  "outputs": {
    "trace_matrix": "TM-001 | page-module PM-01 | evidence authority: source_confirmed | approved source packet ref present | downstream ceiling: source-supported candidate; TM-002 | page-module PM-02 | evidence authority: review_required | interpretation requires owner review | downstream ceiling: derived pending review; TM-003 | page-module PM-03 | evidence authority: missing | required evidence ref absent | downstream ceiling: no affirmative claim.",
    "evidence_authority_map": "TM-001=source_confirmed from an approved source packet reference; TM-002=review_required because available trace information does not resolve the interpretation; TM-003=missing because required evidence is absent. These row states remain distinct from harness claim status.",
    "trace_gap_register": "GAP-001 | TM-002 | review decision required before authority may change | blocker for source-supported harness treatment; GAP-002 | TM-003 | evidence reference missing | blocker for any affirmative harness connection claim.",
    "harness_trace_delta": "HD-001 | TM-002 | proposed harness association recorded only as a derived candidate | claim-strength ceiling remains below source authority | no automatic source-supported connection verdict; HD-002 | TM-003 | association withheld because evidence is missing.",
    "verification_seed_matrix": "VS-001 | TM-001 | seed: confirm referenced source support and row mapping; VS-002 | TM-002 | seed: review interpretation and authority assignment; VS-003 | TM-003 | seed: locate or establish an approved evidence reference. These are verification seeds, not completed verification evidence.",
    "review_gate_evidence_index": "RG-001 | TM-001 | index source-supported row and its approved packet trace; RG-002 | TM-002 | index unresolved interpretation and GAP-001; RG-003 | TM-003 | index absent evidence and GAP-002. No review decision is asserted.",
    "trace_provenance": "All rows derive solely from the public-safe synthetic scenario and workflow contract: one source-supported row, one review-required row, and one missing-evidence row. References are sanitized logical identifiers and do not identify runtime paths, raw evidence, or hidden material.",
    "boundary_review_note": "The result is a project-local governance representation only. It preserves upstream ownership, performs no upstream mutation, keeps evidence-authority states separate from harness claim status, and limits harness, verification, and review handoffs to ceilings, blockers, seeds, and indexes."
  },
  "provenance": [
    "Public-safe synthetic workflow contract for page_module_trace_matrix_v0.",
    "Synthetic scenario facts and stated boundary policy supplied in the calibration prompt."
  ],
  "gaps": [
    "TM-002 lacks the review outcome needed to resolve its row-level evidence authority.",
    "TM-003 lacks an approved evidence reference and cannot support an affirmative claim."
  ],
  "downstream_handoff": [
    "Harness consumers receive TM-001 through TM-003 with claim-strength ceilings and GAP-001 through GAP-002 as explicit blockers.",
    "Verification and review consumers receive VS-001 through VS-003 and RG-001 through RG-003 as seeds and indexes, not completed evidence or decisions."
  ],
  "boundary_review_note": [
    "No source XML, sidecar, intake, source, materials, layout, quantitative, interface-control, or harness artifact is mutated.",
    "No tool use, file edit, runtime path, hidden reference, private evidence, completed verification, or stronger source/canon authority is claimed."
  ],
  "no_claims": [
    "No automatic source-supported harness connection verdict is claimed for any row.",
    "No verification completion, review approval, upstream artifact change, or access to private/raw evidence is claimed."
  ]
}
