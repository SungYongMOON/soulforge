const freeze = (value) => Object.freeze(value);

// Internal deep Module: records exact submitted transaction facts. It intentionally does not
// infer an adequate isolation level from an application architecture.
export function analyseTransactionSemantics(transactions = {}) {
  const keys = Array.isArray(transactions.idempotency_keys) ? transactions.idempotency_keys : [];
  const unique = new Set(keys.filter((key) => typeof key === 'string'));
  return freeze({
    configured_isolation: typeof transactions.isolation === 'string' ? transactions.isolation : 'unknown',
    shared_cache_enabled: transactions.shared_cache_enabled === true,
    read_uncommitted_enabled: transactions.read_uncommitted_enabled === true,
    idempotency_key_count: unique.size,
    duplicate_idempotency_keys: freeze(keys.filter((key, index) => keys.indexOf(key) !== index).sort()),
    dirty_read_exception_observed: transactions.shared_cache_enabled === true && transactions.read_uncommitted_enabled === true,
  });
}
