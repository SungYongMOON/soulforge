{
  "workflow_id": "test_evaluation_execution_result_ingest_v0",
  "candidate_label": "gpt-5.6-sol|low|dwarf|auditor",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "outputs": {
    "execution_run_packet": "Synthetic run packet containing two scoped rows: INSPECTION-001 completed with a passed candidate verdict, and EXECUTION-002 blocked before completion. No raw logs, payloads, private outputs, or runtime paths are included.",
    "execution_result_register": "INSPECTION-001: inspection, completed, passed candidate verdict, evidence represented only by a public-safe synthetic reference. EXECUTION-002: execution, blocked, no result verdict, blocker retained for owner review.",
    "result_verdicts": "INSPECTION-001 is recorded as passed for review preparation only; this is not an acceptance decision. EXECUTION-002 has no pass or fail verdict because execution was blocked.",
    "run_blockers": "EXECUTION-002 remains blocked. The synthetic contract supplies no authorized cause, resolution evidence, or rerun outcome, so the blocker must remain explicit and unresolved.",
    "owner_followup_needed": "Owner review is needed to determine the disposition of EXECUTION-002 and to provide the scoped acceptance basis required for any downstream accepted, blocked, or inconclusive decision.",
    "downstream_handoff": "Hand off the synthetic result register, the passed inspection candidate verdict, the unresolved execution blocker, provenance limits, and boundary notes to acceptance review. accepted_verification_result_packet_v0 remains responsible for acceptance classification.",
    "boundary_review_note": "Output remains at the contract-only and public-safe synthetic evidence ceiling. It makes no acceptance, approval, pilot-execution, usability, production-readiness, or optimizer-result claim."
  },
  "provenance": [
    "Public-safe synthetic workflow contract for test_evaluation_execution_result_ingest_v0.",
    "Synthetic scenario facts: one passed inspection row, one blocked execution row, and one downstream handoff to acceptance review."
  ],
  "gaps": [
    "No scoped acceptance basis is provided for converting candidate verdicts into accepted, blocked, or inconclusive results.",
    "No authorized blocker cause, corrective action, rerun evidence, or owner disposition is provided for EXECUTION-002."
  ],
  "downstream_handoff": [
    "Provide INSPECTION-001 as a passed candidate-verdict row to acceptance review without representing it as accepted.",
    "Provide EXECUTION-002 with its unresolved blocker and request owner disposition before any acceptance classification."
  ],
  "boundary_review_note": [
    "No raw test logs, waveform data, vendor payloads, private project outputs, credentials, sessions, or runtime absolute paths are included.",
    "Simulation-specific ownership remains with simulation_run_verify_v0; no simulation payload is duplicated or implied."
  ],
  "no_claims": [
    "No owner acceptance, TRR/DT/FCA/OT/PCA approval, pilot execution, usable status, production readiness, or optimizer result is claimed.",
    "No tool use, file edit, upstream mutation, runtime path, hidden reference, or private/raw evidence access is claimed."
  ]
}
