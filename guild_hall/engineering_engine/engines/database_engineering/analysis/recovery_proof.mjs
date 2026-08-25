const freeze = (value) => Object.freeze(value);

// Internal deep Module: differentiates a submitted recoverability proof from RPO/RTO or DR
// sufficiency, which remain project-owned decisions.
export function analyseRecoveryProof(recovery = {}) {
  const proofs = Array.isArray(recovery.proofs) ? recovery.proofs : [];
  const restoreProofs = proofs.filter((proof) => proof?.kind === 'restore_test');
  const restoreTestObserved = restoreProofs.some((proof) => proof.passed === true);
  const restoreTestFailed = restoreProofs.some((proof) => proof.passed === false);
  const recoveryPlanObserved = recovery.plan_evidence_present === true;
  const pitrProofs = proofs.filter((proof) => proof?.kind === 'pitr_preconditions');
  const pitrPreconditionsStatus = pitrProofs.length === 0
    ? 'unknown'
    : pitrProofs.some((proof) => proof.passed === false)
      ? 'contradicted'
      : pitrProofs.some((proof) => proof.passed === true)
        ? 'supported'
        : 'unknown';
  // An explicit required failure cannot be masked by a separate passed proof. Multiple
  // submitted restore proofs with opposite states are likewise conflicting evidence.
  const restoreTestStatus = recovery.restore_test_required_but_failed === true
    ? restoreTestObserved ? 'conflict' : 'contradicted'
    : restoreTestObserved && restoreTestFailed
      ? 'conflict'
      : restoreTestFailed
        ? 'contradicted'
        : restoreTestObserved
          ? 'supported'
          : 'unknown';
  return freeze({
    proof_count: proofs.length,
    restore_test_observed: restoreTestObserved,
    restore_test_status: restoreTestStatus,
    pitr_preconditions_observed: pitrPreconditionsStatus === 'supported',
    pitr_preconditions_status: pitrPreconditionsStatus,
    recovery_evidence_status: restoreTestStatus === 'conflict'
      ? 'conflict'
      : recoveryPlanObserved && restoreTestStatus === 'supported'
        ? 'supported'
        : recovery.plan_evidence_present === false || restoreTestStatus === 'contradicted'
          ? 'contradicted'
          : 'unknown',
    claimed_rpo_rto: false,
    claimed_dr_sufficiency: false,
  });
}
