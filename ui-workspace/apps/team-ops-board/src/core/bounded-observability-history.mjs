// bounded-observability-history.mjs — shared retention contract for the Board's
// append-only observability evidence (quota attempts, usage producer cycles,
// runtime lifecycle transitions).
//
// It is deliberately pure: it owns classification, retention, and shape, never a
// file, clock, provider, or scheduler. Each caller keeps its own atomic write
// helper and its own exact entry contract, so this module can never widen what a
// caller is allowed to persist.
//
// The central rule is that a history is an audit record, not a cache. A history
// that is present but unreadable, foreign, or holding even one invalid row is
// evidence of something having gone wrong, and it is preserved byte-for-byte.
// Filtering the bad rows away or restarting from empty would destroy exactly the
// trace an Owner needs to reconstruct what happened, so this module refuses to
// produce a replacement record in that case and reports a bounded failure
// instead. Only a genuinely missing history is a safe first write.

export const BOUNDED_HISTORY_DEFAULT_LIMIT = 50;
export const BOUNDED_HISTORY_MAX_LIMIT = 500;

// What the caller's filesystem probe found. `unreadable` covers oversized,
// symlinked, non-regular, IO-failed, and unparsable entries: the file is there,
// we simply cannot trust it, which is not the same as it not existing.
export const BOUNDED_HISTORY_PRESENCE = Object.freeze(["missing", "present", "unreadable"]);
export const BOUNDED_HISTORY_STATES = Object.freeze(["missing", "valid", "invalid"]);
export const BOUNDED_HISTORY_APPEND_OUTCOMES = Object.freeze(["created", "appended", "preserved"]);
export const BOUNDED_HISTORY_PRESERVED_REASON = "history_present_invalid";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > BOUNDED_HISTORY_MAX_LIMIT) {
    fail("bounded_history_limit_invalid");
  }
  return value;
}

function normalizedSchemaVersion(value) {
  if (typeof value !== "string" || value === "") fail("bounded_history_schema_invalid");
  return value;
}

function entryIsValid(isEntry, entry) {
  try {
    return isEntry(entry) === true;
  } catch {
    return false;
  }
}

// Classification is all-or-nothing on purpose. One bad row makes the whole
// stored history `invalid`, because a partially valid audit log cannot be
// distinguished from a tampered or truncated one, and salvaging the good rows
// would quietly drop the anomaly that mattered.
export function classifyBoundedHistory({
  presence = "present",
  value = null,
  schemaVersion,
  isEntry = () => true,
} = {}) {
  const schema = normalizedSchemaVersion(schemaVersion);
  if (!BOUNDED_HISTORY_PRESENCE.includes(presence)) fail("bounded_history_presence_invalid");
  if (presence === "missing") return { state: "missing", entries: [] };
  if (presence === "unreadable") return { state: "invalid", entries: [] };
  if (!isRecord(value)
    || Object.keys(value).length !== 2
    || !Object.hasOwn(value, "schema_version")
    || !Object.hasOwn(value, "entries")
    || value.schema_version !== schema
    || !Array.isArray(value.entries)
    || !value.entries.every((entry) => entryIsValid(isEntry, entry))) {
    return { state: "invalid", entries: [] };
  }
  return { state: "valid", entries: [...value.entries] };
}

// Returns a plan, never a side effect. `preserved` means the caller must leave
// the stored history exactly as it found it and report the bounded failure
// upward; `record` is null precisely so a caller cannot write it by accident.
export function planBoundedHistoryAppend({
  classified,
  entry,
  schemaVersion,
  limit = BOUNDED_HISTORY_DEFAULT_LIMIT,
  isEntry = () => true,
} = {}) {
  const schema = normalizedSchemaVersion(schemaVersion);
  const retention = normalizedLimit(limit);
  if (!isRecord(classified) || !BOUNDED_HISTORY_STATES.includes(classified.state)) {
    fail("bounded_history_state_invalid");
  }
  if (!entryIsValid(isEntry, entry)) fail("bounded_history_entry_invalid");
  if (classified.state === "invalid") {
    return { outcome: "preserved", record: null, reason: BOUNDED_HISTORY_PRESERVED_REASON };
  }
  const prior = classified.state === "valid" ? classified.entries : [];
  return {
    outcome: classified.state === "missing" ? "created" : "appended",
    record: { schema_version: schema, entries: [...prior, entry].slice(-retention) },
    reason: null,
  };
}
