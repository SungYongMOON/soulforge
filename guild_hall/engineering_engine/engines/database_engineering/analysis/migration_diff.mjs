const freeze = (value) => Object.freeze(value);

// Internal deep Module: validates only the submitted migration proof shape. It neither
// generates a migration nor decides whether a project should accept one.
export function analyseMigrationDiff(migrations = []) {
  const ids = new Set();
  const duplicate_ids = [];
  const irreversible_without_rollback_proof = [];
  for (const migration of Array.isArray(migrations) ? migrations : []) {
    if (!migration || typeof migration.id !== 'string') continue;
    if (ids.has(migration.id)) duplicate_ids.push(migration.id);
    ids.add(migration.id);
    if (migration.irreversible === true && migration.rollback_proof !== true) {
      irreversible_without_rollback_proof.push(migration.id);
    }
  }
  return freeze({
    migration_count: ids.size,
    duplicate_ids: freeze([...new Set(duplicate_ids)].sort()),
    irreversible_without_rollback_proof: freeze([...new Set(irreversible_without_rollback_proof)].sort()),
    migration_proof_complete: duplicate_ids.length === 0 && irreversible_without_rollback_proof.length === 0,
  });
}
