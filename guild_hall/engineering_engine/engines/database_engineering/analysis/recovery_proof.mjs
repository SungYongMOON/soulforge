const freeze = (value) => Object.freeze(value);

// Internal deep Module: differentiates a submitted recoverability proof from RPO/RTO or DR
// sufficiency, which remain project-owned decisions.
export function analyseRecoveryProof(recovery = {}) {
  const proofs = Array.isArray(recovery.proofs) ? recovery.proofs : [];
  const restoreTestObserved = proofs.some((proof) => proof?.kind === 'restore_test' && proof?.passed === true);
  const recoveryPlanObserved = recovery.plan_evidence_present === true;
  return freeze({
    proof_count: proofs.length,
    restore_test_observed: restoreTestObserved,
    pitr_preconditions_observed: proofs.some((proof) => proof?.kind === 'pitr_preconditions' && proof?.passed === true),
    recovery_evidence_status: recoveryPlanObserved && restoreTestObserved ? 'supported' : recovery.plan_evidence_present === false || recovery.restore_test_required_but_failed === true ? 'contradicted' : 'unknown',
    claimed_rpo_rto: false,
    claimed_dr_sufficiency: false,
  });
}
