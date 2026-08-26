const freeze = (value) => Object.freeze(value);

const statusFromBoolean = (value) => value === true ? 'supported' : value === false ? 'contradicted' : 'unknown';

// Internal deep Module: derives platform-control evidence from closed typed control facts.
// It is deliberately independent of the caller's per-rule verdict label, so an evaluator can
// refuse a hard finding when those two statements disagree.
export function analysePlatformControlProof(controls = {}) {
  const sqlite = controls.sqlite && typeof controls.sqlite === 'object' ? controls.sqlite : {};
  const postgresql = controls.postgresql && typeof controls.postgresql === 'object' ? controls.postgresql : {};
  const dirtyReadStatus = sqlite.shared_cache_enabled === true && sqlite.read_uncommitted_enabled === true
    ? 'contradicted'
    : sqlite.shared_cache_enabled === false || sqlite.read_uncommitted_enabled === false
      ? 'supported'
      : 'unknown';
  return freeze({
    sqlite_fk_connection: freeze({ status: statusFromBoolean(sqlite.foreign_keys_enabled), analyzer: 'platform_control_proof' }),
    sqlite_fk_check: freeze({ status: statusFromBoolean(sqlite.foreign_key_check_clean), analyzer: 'platform_control_proof' }),
    sqlite_integrity_check: freeze({ status: statusFromBoolean(sqlite.integrity_check_clean), analyzer: 'platform_control_proof' }),
    sqlite_dirty_read_exception: freeze({ status: dirtyReadStatus, analyzer: 'platform_control_proof' }),
    sqlite_single_writer: freeze({ status: statusFromBoolean(sqlite.single_writer_requirement_met), analyzer: 'platform_control_proof' }),
    postgresql_constraints: freeze({ status: statusFromBoolean(postgresql.constraints_requirement_met), analyzer: 'platform_control_proof' }),
    postgresql_isolation: freeze({ status: statusFromBoolean(postgresql.isolation_requirement_met), analyzer: 'platform_control_proof' }),
    postgresql_rls: freeze({ status: statusFromBoolean(postgresql.rls_requirement_met), analyzer: 'platform_control_proof' }),
    postgresql_pitr: freeze({ status: statusFromBoolean(postgresql.pitr_preconditions_met), analyzer: 'platform_control_proof' }),
  });
}
