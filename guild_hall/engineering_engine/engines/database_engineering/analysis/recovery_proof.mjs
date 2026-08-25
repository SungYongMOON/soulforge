const freeze = (value) => Object.freeze(value);

// Internal deep Module: differentiates a submitted recoverability proof from RPO/RTO or DR
// sufficiency, which remain project-owned decisions.
export function analyseRecoveryProof(recovery = {}) {
  const proofs = Array.isArray(recovery.proofs) ? recovery.proofs : [];
  const restoreTestObserved = proofs.some((proof) => proof?.kind === 'restore_test' && proof?.passed === true);
  const recoveryPlanObserved = recovery.plan_evidence_present === true;
  const pitrProofs = proofs.filter((proof) => proof?.kind === 'pitr_preconditions');
  const pitrPreconditionsStatus = pitrProofs.length === 0
    ? 'unknown'
    : pitrProofs.some((proof) => proof.passed === false)
      ? 'contradicted'
      : pitrProofs.some((proof) => proof.passed === true)
        ? 'supported'
        : 'unknown';
  return freeze({
    proof_count: proofs.length,
    restore_test_observed: restoreTestObserved,
    pitr_preconditions_observed: pitrPreconditionsStatus === 'supported',
    pitr_preconditions_status: pitrPreconditionsStatus,
    recovery_evidence_status: recoveryPlanObserved && restoreTestObserved ? 'supported' : recovery.plan_evidence_present === false || recovery.restore_test_required_but_failed === true ? 'contradicted' : 'unknown',
    claimed_rpo_rto: false,
    claimed_dr_sufficiency: false,
  });
}
