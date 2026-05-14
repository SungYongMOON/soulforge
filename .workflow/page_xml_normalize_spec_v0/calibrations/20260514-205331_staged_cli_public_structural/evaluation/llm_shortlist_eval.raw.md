{
  "final_primary_candidate_id": "C_shadow_gpt_5_4_mini_medium",
  "final_primary_profile": {
    "model": "gpt-5.4-mini",
    "effort": "medium",
    "species": "elf",
    "class": "auditor"
  },
  "decision": "select_as_primary_with_gaps",
  "rationale": "No critical errors, acceptable quality, and best shortlist position with lower reasoning/output cost than the high-effort mini candidate. Higher-scoring gpt-5.4 candidates are not selected because their quality gain does not offset much longer wall time and larger output cost.",
  "downgrade": {
    "from": "clean_pass",
    "to": "pass_with_gaps",
    "reason": "Required gate coverage is incomplete.",
    "missing_gate_ids": [
      "classification_basis_review_required",
      "module_scope_unknown_or_review",
      "module_spec_manifest_records_refs",
      "source_immutable_no_mutation",
      "project_local_not_workflow"
    ]
  },
  "rejected_candidates": [
    {
      "candidate_id": "C_primary_gpt_5_4_mini_high",
      "reason": "Slightly higher quality but higher reasoning/output cost; still has required-gate gaps."
    },
    {
      "candidate_id": "C_shadow_gpt_5_4_mini_low",
      "reason": "Failed quality gate."
    },
    {
      "candidate_id": "B_gpt_5_4_medium",
      "reason": "Highest score, but substantially slower and more expensive; still pass_with_gaps."
    },
    {
      "candidate_id": "B_gpt_5_4_low",
      "reason": "No advantage over selected mini profile; slower and still pass_with_gaps."
    }
  ]
}