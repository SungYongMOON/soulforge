import { analyseSchemaGraph } from './schema_graph.mjs';
import { analyseMigrationDiff } from './migration_diff.mjs';
import { analyseTransactionSemantics } from './transaction_semantics.mjs';
import { analyseQueryWorkloadEvidence } from './query_workload_evidence.mjs';
import { analyseRecoveryProof } from './recovery_proof.mjs';
import { analyseDataQualityEvidence } from './data_quality_evidence.mjs';
import { analysePlatformControlProof } from './platform_control_proof.mjs';

const coherenceForKnownStatuses = (left, right) => {
  if (left === 'conflict' || right === 'conflict') return 'conflict';
  if (left === 'unknown' || right === 'unknown') return 'unknown';
  return left === right ? 'coherent' : 'conflict';
};

const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

// The package's one internal analysis facade concentrates the seven analysis Modules while the
// public Core-facing adapter remains only compile/evaluate.
export function analyseDatabaseEvidence(analysisInput = {}) {
  const schemaGraph = analyseSchemaGraph(analysisInput.schema);
  const migrationDiff = analyseMigrationDiff(analysisInput.migrations);
  const transactionSemantics = analyseTransactionSemantics(analysisInput.transactions);
  const queryWorkload = analyseQueryWorkloadEvidence(analysisInput.workload);
  const recoveryProof = analyseRecoveryProof(analysisInput.recovery);
  const dataQuality = analyseDataQualityEvidence(analysisInput.data_quality);
  const platformControls = analysePlatformControlProof(analysisInput.platform_controls);
  const transactionDirtyReadStatus = transactionSemantics.dirty_read_exception_observed ? 'contradicted' : 'supported';
  const sqliteDirtyReadStatus = platformControls.sqlite_dirty_read_exception.status;
  const sqliteDirtyReadCoherent = sqliteDirtyReadStatus === transactionDirtyReadStatus;
  const recoveryStatus = recoveryProof.recovery_evidence_status;
  const postgresqlPitrStatus = platformControls.postgresql_pitr.status;
  const pitrProofStatus = recoveryProof.pitr_preconditions_status;
  const pitrProofCoherence = coherenceForKnownStatuses(pitrProofStatus, postgresqlPitrStatus);
  const pitrSpecificStatus = pitrProofCoherence === 'unknown'
    ? 'unknown'
    : pitrProofCoherence === 'coherent' ? postgresqlPitrStatus : 'conflict';
  // Generic restore evidence is a different proposition. Only an explicit project-declared
  // required restore failure cross-cuts PITR: it blocks a positive PITR result, but does not
  // turn coherent PITR contradiction into a conflict.
  const requiredRestoreFailureCrosscut = !recoveryProof.restore_test_required_failure_observed
    ? 'not_triggered'
    : pitrSpecificStatus === 'supported'
      ? 'conflict'
      : pitrSpecificStatus === 'contradicted'
        ? 'consistent_negative'
        : pitrSpecificStatus === 'conflict'
          ? 'conflict'
          : 'unknown';
  const postgresqlPitrEvidenceStatus = requiredRestoreFailureCrosscut === 'conflict'
    ? 'conflict'
    : pitrSpecificStatus;
  return freezeDeep({
    schema_graph: schemaGraph,
    migration_diff: migrationDiff,
    transaction_semantics: transactionSemantics,
    query_workload: queryWorkload,
    recovery_proof: recoveryProof,
    data_quality: dataQuality,
    platform_control_proof: platformControls,
    cross_analyzer_coherence: {
      sqlite_transaction_semantics_vs_platform_controls: sqliteDirtyReadCoherent ? 'coherent' : 'conflict',
      recovery_plan_vs_postgresql_pitr_controls: 'distinct_propositions_not_compared',
      pitr_precondition_proof_vs_postgresql_pitr_controls: pitrProofCoherence,
      restore_test_vs_postgresql_pitr_controls: 'distinct_propositions_not_compared',
      required_restore_failure_crosscut_pitr: requiredRestoreFailureCrosscut,
    },
    evidence_by_key: {
      schema_graph: { status: schemaGraph.structurally_consistent ? 'supported' : 'contradicted', analyzer: 'schema_graph' },
      migration_diff: { status: migrationDiff.migration_proof_complete ? 'supported' : 'contradicted', analyzer: 'migration_diff' },
      query_workload: { status: queryWorkload.capacity_evidence_present ? 'supported' : 'unknown', analyzer: 'query_workload' },
      data_quality: { status: dataQuality.quality_evidence_present && dataQuality.failed_check_ids.length === 0 ? 'supported' : dataQuality.failed_check_ids.length > 0 ? 'contradicted' : 'unknown', analyzer: 'data_quality' },
      recovery_proof: { status: recoveryStatus, analyzer: 'recovery_proof' },
      ...platformControls,
      sqlite_dirty_read_exception: { status: sqliteDirtyReadCoherent ? sqliteDirtyReadStatus : 'conflict', analyzer: 'transaction_semantics+platform_control_proof' },
      postgresql_pitr: { status: postgresqlPitrEvidenceStatus, analyzer: 'recovery_proof.pitr_preconditions+platform_control_proof+required_restore_failure_crosscut' },
    },
  });
}
