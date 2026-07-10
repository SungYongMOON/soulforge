{
  "workflow_id": "functional_configuration_audit_page_library_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|auditor",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "outputs": {
    "functional_audit_packet": "Synthetic FCA/SVR-style audit packet covering one verified claim, one unverified claim, and one discrepancy carrying residual risk. The audit compares declared claims with accepted evidence and controlled baseline context without granting acceptance or changing upstream artifacts.",
    "verified_claim_register": "VC-001: One in-scope functional or performance claim is supported by accepted verification evidence within the declared audit scope. Status: verified for audit reporting only; this is not system acceptance.",
    "unverified_claim_register": "UC-001: One in-scope functional or performance claim lacks sufficient accepted verification evidence. Status: unverified and open; no inference of compliance or acceptance is permitted.",
    "discrepancy_register": "DR-001: One discrepancy exists between the configured page-module or harness composition and the declared claim or controlled baseline context. Status: open; the workflow records but does not close the discrepancy.",
    "residual_risk_register": "RR-001: Residual risk remains because DR-001 is open and UC-001 is unsupported by sufficient accepted evidence. Impact and disposition require downstream owner review under approved policy.",
    "audit_readiness": "Pilot-executed and conditionally ready for downstream review. The packet is structurally complete for the synthetic scope, but closure and acceptance readiness are not established because one claim is unverified and one discrepancy with residual risk remains.",
    "closure_handoff": "Handoff VC-001 as verified-for-audit, UC-001 as evidence-deficient, DR-001 as open, and RR-001 as unresolved. The authorized downstream owner must obtain or reject additional evidence, disposition the discrepancy and residual risk, and make any acceptance decision outside this workflow.",
    "boundary_review_note": "The result uses only public-safe synthetic facts and portable workflow semantics. It makes no claim of tool use, file modification, runtime inspection, hidden evidence access, discrepancy closure, or system acceptance."
  },
  "provenance": [
    "Public-safe synthetic workflow contract for functional_configuration_audit_page_library_v0.",
    "Synthetic scenario facts specifying one verified claim, one unverified claim, and one discrepancy with residual risk."
  ],
  "gaps": [
    "The unverified claim lacks sufficient accepted verification evidence.",
    "The discrepancy remains open, and its associated residual risk has not been dispositioned."
  ],
  "downstream_handoff": [
    "Request and assess additional accepted evidence for UC-001 under the approved audit policy.",
    "Assign DR-001 and RR-001 to an authorized owner for disposition; keep acceptance authority outside this workflow."
  ],
  "boundary_review_note": [
    "No upstream artifact was mutated, and no stronger source or canon authority is asserted.",
    "Verified status is limited to audit reporting and does not constitute acceptance, discrepancy closure, or release approval."
  ],
  "no_claims": [
    "No claim is made that the system, page library, module configuration, or harness composition is accepted.",
    "No claim is made that UC-001, DR-001, or RR-001 is resolved or closed."
  ]
}
