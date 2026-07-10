{
  "workflow_id": "technical_risk_open_question_burndown_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|auditor",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "outputs": {
    "technical_risk_register": "TR-001 | Severity: medium | Status: open | Risk: an unresolved quantitative field may affect the technical assessment | Boundary: synthetic scenario only; no value or impact magnitude is inferred.",
    "open_question_register": "OQ-001 | Status: open | Question: what approved value and supporting source should populate the unresolved quantitative field? | Linked risk: TR-001.",
    "burndown_summary": "Open risks: 1 medium. Open questions: 1. Closed items: 0. Burndown status: blocked pending owner-supplied approved evidence; no false resolution recorded.",
    "closure_criteria_register": "CC-001 | Applies to: TR-001 and OQ-001 | Closure criterion: the owner provides an approved quantitative value with an attributable source, and a subsequent bounded review confirms that the value answers OQ-001 without exceeding the public-safe boundary.",
    "owner_followup_needed": "Owner action required: provide or approve the quantitative value and its source authority. Until then, TR-001 and OQ-001 remain open.",
    "rerun_routes": "RR-001 | Trigger: CC-001 evidence becomes available | Route: rerun technical_risk_open_question_burndown_v0 using the updated approved risk-scope references and policy, then reassess status without modifying upstream artifacts.",
    "boundary_review_note": "The register preserves the single medium risk, open question, closure criterion, and rerun route. It makes no claim that the uncertainty has been resolved and assigns no authority beyond the synthetic workflow contract."
  },
  "provenance": [
    "Public-safe synthetic workflow contract for technical_risk_open_question_burndown_v0.",
    "Synthetic scenario facts specifying one medium technical risk, one open question, one closure criterion, and one rerun route."
  ],
  "gaps": [
    "The unresolved quantitative value is not supplied.",
    "No approved supporting source or owner confirmation is supplied."
  ],
  "downstream_handoff": [
    "Owner: supply or approve the missing quantitative value and supporting source.",
    "Workflow rerun: evaluate CC-001 and update TR-001 and OQ-001 only after approved evidence is available."
  ],
  "boundary_review_note": [
    "All content remains public-safe and synthetic.",
    "No upstream mutation, hidden evidence, runtime activity, or stronger canon authority is asserted."
  ],
  "no_claims": [
    "No claim is made that TR-001 or OQ-001 is resolved.",
    "No claim is made of tool use, file edits, runtime paths, simulation results, or access to private evidence."
  ]
}
