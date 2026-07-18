#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const DESCRIPTOR_SCHEMA = "soulforge.task_engine_inventory_descriptor.v1";
const MANIFEST_SCHEMA = "soulforge.task_engine_inventory_manifest.v1";
const ERROR_SCHEMA = "soulforge.task_engine_inventory_error.v1";
const LANES = ["mail", "voice", "structured_pc_work", "file", "run_log"];
const PROOFS = ["C00-LIVE-01", "C00-LIVE-02", "C00-LIVE-03", "C00-LIVE-04"];
const ADAPTERS = new Set(["attested_metadata_v1", "sqlite_catalog_v1"]);
const AVAILABILITY = new Set(["available", "attested_absent", "attested_gap", "unknown"]);
const REQUIREMENTS = new Set(["required", "optional", "not_applicable"]);
const PROFILES = new Set(["synthetic", "authorized_observation"]);
const SAFE_REF = /^[a-z][a-z0-9_-]{1,63}(?::[a-z0-9][a-z0-9_-]{0,63})*$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const ENUM_VALUE = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,62}$/;
const HASH_64 = /^[a-f0-9]{64}$/;
const EXPLICIT_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const SET_ARRAY_KEYS = new Set([
  "baseline_refs", "source_authority_refs", "source_refs", "writer_candidates",
  "direct_caller_candidates", "consumer_candidates", "evidence_refs", "proof_scope",
  "error_codes", "reason_codes", "blockers", "raw_sentinel_violations",
  "unresolved_live_proofs", "table_count_allowlist", "values",
]);

class InventoryError extends Error {
  constructor(exitCode, reasonCode) {
    super(reasonCode);
    this.exitCode = exitCode;
    this.reasonCode = reasonCode;
  }
}

const invalid = (code = "descriptor_invalid") => { throw new InventoryError(2, code); };
const blocked = (code = "inventory_blocked") => { throw new InventoryError(3, code); };
const guardFailure = (code = "zero_mutation_guard_failed") => { throw new InventoryError(4, code); };
const sentinelFailure = (code = "raw_path_secret_sentinel") => { throw new InventoryError(5, code); };
const operationalFailure = (code = "operational_query_failed") => { throw new InventoryError(6, code); };

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, required, optional = []) {
  if (!isObject(value)) invalid();
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key))) invalid();
  if (Object.keys(value).some((key) => !allowed.has(key))) invalid();
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function requireSafeInteger(value) {
  if (!safeInteger(value)) invalid();
}

function parseTime(value) {
  if (typeof value !== "string") invalid("timestamp_invalid");
  const match = EXPLICIT_OFFSET.exec(value);
  if (!match) invalid("timestamp_invalid");
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, , zone, , offsetHourRaw, offsetMinuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || hour > 23 || minute > 59 || second > 59) {
    invalid("timestamp_invalid");
  }
  if (zone !== "Z" && (Number(offsetHourRaw) > 23 || Number(offsetMinuteRaw) > 59)) invalid("timestamp_invalid");
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) invalid("timestamp_invalid");
  return epoch;
}

function requireSafeRef(value) {
  if (typeof value !== "string" || !SAFE_REF.test(value) || /(?:^|[_:-])unknown(?:$|[_:-])/.test(value)) {
    blocked("unknown_ref");
  }
}

function requireSafeRefShape(value) {
  if (typeof value !== "string" || !SAFE_REF.test(value)) invalid();
}

function uniqueStrings(values) {
  return Array.isArray(values) && values.every((value) => typeof value === "string") && new Set(values).size === values.length;
}

function requireSafeRefArray(values, { semantic = false } = {}) {
  if (!uniqueStrings(values)) invalid();
  for (const value of values) (semantic ? requireSafeRef : requireSafeRefShape)(value);
}

function unsafeString(value) {
  return /(?:[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.?[\\/]|https?:\/\/|file:\/\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|-----BEGIN|\bBearer\s+|\bsk-[A-Za-z0-9_-]{12,})/i.test(value);
}

function enforceSentinels(value, key = "") {
  if (Array.isArray(value)) {
    for (const entry of value) enforceSentinels(entry, key);
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string" && key !== "sqlite_path" && unsafeString(value)) sentinelFailure();
    return;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    if (/(?:^|_)(?:body|title|transcript|password|credential|cookie|token|secret|url|hostname|account_name|email_address|raw_path)(?:_|$)/i.test(childKey)) {
      sentinelFailure();
    }
    if (childKey === "raw_payload_copied" && childValue !== false) sentinelFailure();
    enforceSentinels(childValue, childKey);
  }
}

function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalize(value, key = "") {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => canonicalize(entry));
    if (SET_ARRAY_KEYS.has(key)) {
      return normalized.sort((a, b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b)));
    }
    if (normalized.every((entry) => isObject(entry))) {
      return normalized.sort((a, b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b)));
    }
    return normalized;
  }
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((childKey) => [childKey, canonicalize(value[childKey], childKey)]));
}

function compactCanonical(value) {
  return JSON.stringify(canonicalize(value));
}

function digestValue(value) {
  return `sha256:${createHash("sha256").update(compactCanonical(value)).digest("hex")}`;
}

function fingerprint(path) {
  if (!existsSync(path)) return { exists: false, sha256: null, size: null, mtime: null };
  const stat = statSync(path);
  if (!stat.isFile()) guardFailure();
  return {
    exists: true,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    size: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

function sqliteFingerprints(path) {
  return {
    main: fingerprint(path),
    wal: fingerprint(`${path}-wal`),
    shm: fingerprint(`${path}-shm`),
  };
}

export function openQueryOnlyDatabase(path) {
  let db;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    db.exec("PRAGMA query_only=ON;");
    const queryOnly = Number(db.prepare("PRAGMA query_only").get().query_only);
    const totalChanges = Number(db.prepare("SELECT total_changes() AS n").get().n);
    if (queryOnly !== 1 || totalChanges !== 0) guardFailure();
    return db;
  } catch (error) {
    try { db?.close(); } catch {}
    if (error instanceof InventoryError) throw error;
    operationalFailure();
  }
}

function validateAuthority(authority, evaluationEpoch, requirement) {
  exactKeys(authority, ["source_authority_ref", "issued_at", "expires_at", "proof_scope", "evidence_refs"]);
  requireSafeRef(authority.source_authority_ref);
  const issued = parseTime(authority.issued_at);
  const expires = parseTime(authority.expires_at);
  if (issued > evaluationEpoch || expires <= evaluationEpoch || expires < issued) blocked("authority_expired_or_invalid");
  if (!uniqueStrings(authority.proof_scope) || authority.proof_scope.some((proof) => !PROOFS.includes(proof))) blocked("authority_proof_invalid");
  if (!requirement || requirement !== "not_applicable") {
    if (PROOFS.some((proof) => !authority.proof_scope.includes(proof))) blocked("authority_proof_gap");
  }
  requireSafeRefArray(authority.evidence_refs, { semantic: true });
  if (authority.evidence_refs.length === 0) blocked("authority_evidence_missing");
}

function validateInventory(inventory) {
  exactKeys(inventory, [
    "profile", "physical_owner_ref", "default_root_ref", "writer_candidates",
    "direct_caller_candidates", "consumer_candidates", "source_availability_summary",
  ]);
  if (!PROFILES.has(inventory.profile)) invalid();
  requireSafeRef(inventory.physical_owner_ref);
  requireSafeRef(inventory.default_root_ref);
  requireSafeRefArray(inventory.writer_candidates, { semantic: true });
  requireSafeRefArray(inventory.direct_caller_candidates, { semantic: true });
  requireSafeRefArray(inventory.consumer_candidates, { semantic: true });
  if (!AVAILABILITY.has(inventory.source_availability_summary)) invalid();
}

function validateCountRow(row) {
  exactKeys(row, ["source_ref", "fetched", "new_events", "duplicates", "raw_written", "event_written", "partial", "error_codes"]);
  requireSafeRefShape(row.source_ref);
  for (const key of ["fetched", "new_events", "duplicates", "raw_written", "event_written"]) requireSafeInteger(row[key]);
  if (typeof row.partial !== "boolean" || !uniqueStrings(row.error_codes) || row.error_codes.some((code) => !SAFE_REF.test(code))) invalid();
}

function validateMailRun(run, observedEpoch) {
  exactKeys(run, ["started_at", "finished_at", "partial", "sources", "totals", "error_codes"]);
  const started = parseTime(run.started_at);
  const finished = parseTime(run.finished_at);
  if (started > finished || finished > observedEpoch) invalid("mail_chronology_invalid");
  if (typeof run.partial !== "boolean" || !Array.isArray(run.sources) || run.sources.length === 0) invalid();
  if (!uniqueStrings(run.error_codes) || run.error_codes.some((code) => !SAFE_REF.test(code))) invalid();
  for (const source of run.sources) validateCountRow(source);
  if (new Set(run.sources.map((source) => source.source_ref)).size !== run.sources.length) invalid();
  exactKeys(run.totals, ["fetched", "new_events", "duplicates", "raw_written", "event_written"]);
  for (const key of ["fetched", "new_events", "duplicates", "raw_written", "event_written"]) {
    requireSafeInteger(run.totals[key]);
    if (run.totals[key] !== run.sources.reduce((sum, source) => sum + source[key], 0)) invalid("mail_totals_invalid");
  }
  const sourcePartial = run.sources.some((source) => source.partial);
  const sourceErrors = run.sources.some((source) => source.error_codes.length > 0);
  if (run.partial !== sourcePartial || ((run.error_codes.length > 0) !== sourceErrors)) invalid("mail_partial_error_invalid");
  if (!run.partial && run.error_codes.length > 0) invalid("mail_partial_error_invalid");
  const healthy = !run.partial && run.error_codes.length === 0;
  if (healthy) {
    for (const source of run.sources) {
      if (source.new_events + source.duplicates !== source.fetched) invalid("mail_count_equation_invalid");
    }
    if (run.totals.new_events + run.totals.duplicates !== run.totals.fetched) invalid("mail_count_equation_invalid");
  }
  return { started, finished, failed: run.partial && run.error_codes.length > 0, partial: run.partial };
}

export function evaluateMailSyntheticHealth(observation, evaluationTime) {
  enforceSentinels(observation);
  exactKeys(observation, [
    "source_ref", "observed_at", "max_stale_sec", "fail_streak_threshold",
    "partial_streak_threshold", "recent_runs", "raw_payload_copied",
  ], ["run_summary"]);
  requireSafeRefShape(observation.source_ref);
  if (observation.raw_payload_copied !== false) sentinelFailure();
  const evaluationEpoch = parseTime(evaluationTime);
  const observedEpoch = parseTime(observation.observed_at);
  if (observedEpoch > evaluationEpoch) invalid("mail_chronology_invalid");
  for (const key of ["max_stale_sec", "fail_streak_threshold", "partial_streak_threshold"]) requireSafeInteger(observation[key]);
  if (observation.max_stale_sec === 0 || observation.fail_streak_threshold === 0 || observation.partial_streak_threshold === 0) invalid();
  if (!Array.isArray(observation.recent_runs)) invalid();
  const recent = observation.recent_runs.map((run) => ({ run, meta: validateMailRun(run, observedEpoch) }))
    .sort((a, b) => b.meta.finished - a.meta.finished || compareCodeUnits(compactCanonical(a.run), compactCanonical(b.run)));
  const summaryMeta = observation.run_summary === undefined ? null : validateMailRun(observation.run_summary, observedEpoch);
  const failStreak = recent.findIndex((entry) => !entry.meta.failed);
  const partialStreak = recent.findIndex((entry) => !entry.meta.partial);
  const normalizedFailStreak = failStreak < 0 ? recent.length : failStreak;
  const normalizedPartialStreak = partialStreak < 0 ? recent.length : partialStreak;
  const ageSec = summaryMeta ? Math.max(0, Math.floor((evaluationEpoch - summaryMeta.finished) / 1000)) : null;

  let status = "NORMAL";
  let reasonCodes = ["mail_observation_current"];
  if (!summaryMeta) {
    status = "CRITICAL";
    reasonCodes = ["mail_run_summary_missing"];
  } else if (ageSec > observation.max_stale_sec) {
    status = "CRITICAL";
    reasonCodes = ["mail_run_summary_stale"];
  } else if (normalizedFailStreak >= observation.fail_streak_threshold) {
    status = "CRITICAL";
    reasonCodes = ["mail_fail_streak_threshold"];
  } else if (normalizedPartialStreak >= observation.partial_streak_threshold) {
    status = "WARN";
    reasonCodes = ["mail_partial_streak_threshold"];
  }
  const totals = observation.run_summary?.totals ?? { fetched: 0, new_events: 0, duplicates: 0, raw_written: 0, event_written: 0 };
  const output = {
    kind: "mail",
    observation_profile: "synthetic",
    source_ref: observation.source_ref,
    status,
    reason_codes: reasonCodes,
    aggregate_metrics: {
      age_sec: ageSec,
      fetched: totals.fetched,
      new_events: totals.new_events,
      duplicates: totals.duplicates,
      raw_written: totals.raw_written,
      event_written: totals.event_written,
      fail_streak: normalizedFailStreak,
      partial_streak: normalizedPartialStreak,
      recent_run_count: recent.length,
    },
    coverage_eligible: false,
    blockers: ["d25_policy_missing", "d26_mail_binding_missing"],
    raw_payload_copied: false,
  };
  return canonicalize({ ...output, observation_digest: digestValue(output) });
}

function requireBoolean(value) {
  if (typeof value !== "boolean") invalid();
}

export function evaluateVoiceSyntheticHealth(observation, evaluationTime) {
  enforceSentinels(observation);
  exactKeys(observation, [
    "source_ref", "observed_at", "max_stale_sec", "recording_present", "route_selected",
    "session_bound", "bundle_ready", "source_hash", "source_size_bytes", "stage",
    "recording_id", "receipt_summary", "raw_payload_copied",
  ]);
  requireSafeRefShape(observation.source_ref);
  const evaluationEpoch = parseTime(evaluationTime);
  const observedEpoch = parseTime(observation.observed_at);
  if (observedEpoch > evaluationEpoch) invalid("voice_chronology_invalid");
  requireSafeInteger(observation.max_stale_sec);
  if (observation.max_stale_sec === 0) invalid();
  for (const key of ["recording_present", "route_selected", "session_bound", "bundle_ready"]) requireBoolean(observation[key]);
  if (observation.raw_payload_copied !== false) sentinelFailure();
  if (!HASH_64.test(observation.source_hash)) invalid("voice_hash_invalid");
  requireSafeInteger(observation.source_size_bytes);
  if (!["plaud_import_ready", "local_asr_ready"].includes(observation.stage)) invalid();
  if (typeof observation.recording_id !== "string" || !ENUM_VALUE.test(observation.recording_id)) invalid();

  const receipt = observation.receipt_summary;
  exactKeys(receipt, [
    "receipt_present", "receipt_matches", "ack_present", "ack_matches", "delivery_confirmed",
    "receipt_count", "ack_count", "session_count", "bundle_count", "producer_ref",
    "consumer_ref", "produced_at", "acknowledged_at",
  ]);
  for (const key of ["receipt_present", "receipt_matches", "ack_present", "ack_matches", "delivery_confirmed"]) requireBoolean(receipt[key]);
  for (const key of ["receipt_count", "ack_count", "session_count", "bundle_count"]) requireSafeInteger(receipt[key]);
  requireSafeRefShape(receipt.producer_ref);
  requireSafeRefShape(receipt.consumer_ref);
  if (receipt.producer_ref === receipt.consumer_ref) invalid("voice_identity_invalid");
  const produced = parseTime(receipt.produced_at);
  if (produced > observedEpoch) invalid("voice_chronology_invalid");
  let acknowledged = null;
  if (receipt.acknowledged_at !== null) {
    acknowledged = parseTime(receipt.acknowledged_at);
    if (acknowledged < produced || acknowledged > observedEpoch) invalid("voice_chronology_invalid");
  }
  if ((receipt.receipt_count > 0) !== receipt.receipt_present) invalid("voice_receipt_count_invalid");
  if ((receipt.ack_count > 0) !== receipt.ack_present) invalid("voice_ack_count_invalid");
  if (receipt.ack_present && acknowledged === null) invalid("voice_ack_chronology_missing");
  if (!receipt.ack_present && acknowledged !== null) invalid("voice_ack_chronology_invalid");
  if (receipt.delivery_confirmed && (!receipt.ack_present || !receipt.ack_matches)) invalid("voice_delivery_invalid");

  const freshnessEpoch = acknowledged ?? produced;
  const ageSec = Math.max(0, Math.floor((evaluationEpoch - freshnessEpoch) / 1000));
  let status = "NORMAL";
  let receiptState = "ready";
  let reasonCodes = ["voice_receipt_ready"];
  if (!observation.recording_present || !observation.route_selected || !observation.session_bound || !observation.bundle_ready) {
    status = "CRITICAL";
    receiptState = "missing";
    reasonCodes = [
      !observation.recording_present ? "voice_recording_missing" : null,
      !observation.route_selected ? "voice_route_missing" : null,
      !observation.session_bound ? "voice_session_missing" : null,
      !observation.bundle_ready ? "voice_bundle_missing" : null,
    ].filter(Boolean);
  } else if (!receipt.receipt_present) {
    status = "CRITICAL";
    receiptState = "missing";
    reasonCodes = ["voice_receipt_missing"];
  } else if (!receipt.receipt_matches || (receipt.ack_present && !receipt.ack_matches)) {
    status = "CRITICAL";
    receiptState = "mismatch";
    reasonCodes = ["voice_receipt_or_ack_mismatch"];
  } else if (!receipt.ack_present) {
    status = "WARN";
    receiptState = "no_ack";
    reasonCodes = ["voice_ack_missing"];
  } else if (ageSec > observation.max_stale_sec) {
    status = "WARN";
    receiptState = "stale";
    reasonCodes = ["voice_ack_stale"];
  } else if (receipt.delivery_confirmed) {
    receiptState = "delivered";
    reasonCodes = ["voice_delivery_confirmed"];
  }
  const output = {
    kind: "voice",
    observation_profile: "synthetic",
    source_ref: observation.source_ref,
    status,
    receipt_state: receiptState,
    reason_codes: reasonCodes,
    aggregate_metrics: {
      age_sec: ageSec,
      receipt_count: receipt.receipt_count,
      ack_count: receipt.ack_count,
      session_count: receipt.session_count,
      bundle_count: receipt.bundle_count,
      native_occurrence_candidate_count: observation.recording_present ? 1 : 0,
      receipt_occurrence_contribution: 0,
      ack_occurrence_contribution: 0,
      session_occurrence_contribution: 0,
      bundle_occurrence_contribution: 0,
    },
    coverage_eligible: false,
    blockers: ["d25_policy_missing", "d26_voice_event_revision_mapping_missing"],
    history_event_count: null,
    raw_payload_copied: false,
  };
  return canonicalize({ ...output, observation_digest: digestValue(output) });
}

function validateQuery(query) {
  exactKeys(query, ["table_count_allowlist", "enum_count_allowlist"]);
  if (!uniqueStrings(query.table_count_allowlist) || query.table_count_allowlist.length === 0) blocked("query_allowlist_invalid");
  for (const table of query.table_count_allowlist) if (!IDENTIFIER.test(table)) blocked("identifier_invalid");
  if (!Array.isArray(query.enum_count_allowlist)) blocked("query_allowlist_invalid");
  for (const entry of query.enum_count_allowlist) {
    exactKeys(entry, ["table", "column", "values"]);
    if (!IDENTIFIER.test(entry.table) || !IDENTIFIER.test(entry.column)) blocked("identifier_invalid");
    if (!query.table_count_allowlist.includes(entry.table)) blocked("query_allowlist_invalid");
    if (!uniqueStrings(entry.values) || entry.values.length === 0 || entry.values.some((value) => !ENUM_VALUE.test(value))) blocked("enum_allowlist_invalid");
  }
  const tuples = query.enum_count_allowlist.map((entry) => `${entry.table}\0${entry.column}`);
  if (new Set(tuples).size !== tuples.length) blocked("query_allowlist_invalid");
}

function validateSource(source, evaluationEpoch) {
  exactKeys(source, ["lane", "source_ref", "adapter_id", "requirement", "authority", "inventory"], [
    "applicability_ref", "locator", "query", "synthetic_health_observation",
  ]);
  if (!LANES.includes(source.lane)) invalid();
  requireSafeRefShape(source.source_ref);
  if (!ADAPTERS.has(source.adapter_id)) blocked("unknown_adapter");
  if (!REQUIREMENTS.has(source.requirement)) invalid();
  if (source.requirement === "not_applicable") {
    if (!Object.hasOwn(source, "applicability_ref")) invalid("applicability_ref_required");
    requireSafeRef(source.applicability_ref);
  } else if (Object.hasOwn(source, "applicability_ref")) {
    invalid("applicability_ref_forbidden");
  }
  validateAuthority(source.authority, evaluationEpoch, source.requirement);
  validateInventory(source.inventory);
  if (source.adapter_id === "attested_metadata_v1") {
    if (Object.hasOwn(source, "locator") || Object.hasOwn(source, "query")) invalid("attested_adapter_input_forbidden");
  } else {
    exactKeys(source.locator, ["sqlite_path"]);
    if (typeof source.locator.sqlite_path !== "string" || source.locator.sqlite_path.length === 0 || /[*?\[\]]/.test(source.locator.sqlite_path)) invalid("literal_sqlite_path_required");
    validateQuery(source.query);
  }
  if (Object.hasOwn(source, "synthetic_health_observation")) {
    if (source.inventory.profile !== "synthetic" || !["mail", "voice"].includes(source.lane)) invalid("synthetic_health_forbidden");
    if (source.inventory.source_availability_summary !== "available") invalid("synthetic_health_unavailable");
    enforceSentinels(source.synthetic_health_observation);
    if (source.synthetic_health_observation.source_ref !== source.source_ref) invalid("health_source_ref_mismatch");
  }
  if (source.requirement === "required" && source.inventory.source_availability_summary === "unknown") {
    blocked("required_source_unavailable");
  }
  return source;
}

function inspectSqliteSource(source) {
  const path = isAbsolute(source.locator.sqlite_path)
    ? source.locator.sqlite_path
    : resolve(process.cwd(), source.locator.sqlite_path);
  let before;
  let after;
  let db;
  try {
    before = sqliteFingerprints(path);
    if (!before.main.exists) blocked("required_source_missing");
    if (before.wal.exists || before.shm.exists) blocked("sqlite_wal_quiescence_unapproved");
    db = openQueryOnlyDatabase(path);
    const tableCounts = [];
    const indexNames = [];
    const triggerNames = [];
    const enumCounts = [];
    for (const table of [...source.query.table_count_allowlist].sort()) {
      const exists = Number(db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name=?").get(table).n);
      if (exists !== 1) blocked("catalog_table_missing");
      const count = Number(db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n);
      if (!safeInteger(count)) operationalFailure();
      tableCounts.push({ source_ref: source.source_ref, table, count });
      const catalog = db.prepare("SELECT type, name FROM sqlite_schema WHERE tbl_name=? AND type IN ('index','trigger') ORDER BY type, name").all(table);
      for (const row of catalog) {
        if (!IDENTIFIER.test(row.name)) blocked("identifier_invalid");
        const item = { source_ref: source.source_ref, table, name: row.name };
        if (row.type === "index") indexNames.push(item);
        else triggerNames.push(item);
      }
    }
    for (const entry of source.query.enum_count_allowlist) {
      const columns = db.prepare("SELECT name FROM pragma_table_info(?) ORDER BY cid").all(entry.table).map((row) => row.name);
      if (!columns.includes(entry.column)) blocked("catalog_column_missing");
      for (const value of [...entry.values].sort()) {
        const count = Number(db.prepare(`SELECT COUNT(*) AS n FROM "${entry.table}" WHERE "${entry.column}"=?`).get(value).n);
        if (!safeInteger(count)) operationalFailure();
        enumCounts.push({ source_ref: source.source_ref, table: entry.table, column: entry.column, value, count });
      }
    }
    const queryOnly = Number(db.prepare("PRAGMA query_only").get().query_only);
    const totalChanges = Number(db.prepare("SELECT total_changes() AS n").get().n);
    if (queryOnly !== 1 || totalChanges !== 0) guardFailure();
    db.close();
    db = null;
    after = sqliteFingerprints(path);
    if (compactCanonical(before) !== compactCanonical(after)) guardFailure("sqlite_fingerprint_changed");
    return {
      tableCounts,
      indexNames,
      triggerNames,
      enumCounts,
      mutationProof: {
        source_ref: source.source_ref,
        method: "sqlite_file_equivalence",
        query_only_readback: 1,
        total_changes: 0,
        fingerprints: canonicalize({ before, after }),
        equivalent: true,
      },
    };
  } catch (error) {
    try { db?.close(); } catch {}
    if (error instanceof InventoryError) throw error;
    operationalFailure();
  }
}

function availabilityRollup(sources) {
  const values = sources.map((source) => source.inventory.source_availability_summary);
  for (const value of ["unknown", "attested_gap", "attested_absent", "available"]) if (values.includes(value)) return value;
  return "unknown";
}

function buildLanes(sources) {
  const lanes = {};
  for (const lane of LANES) {
    const allLaneSources = sources.filter((source) => source.lane === lane);
    const applicableLaneSources = allLaneSources.filter((source) => source.requirement !== "not_applicable");
    const laneSources = applicableLaneSources.length > 0 ? applicableLaneSources : allLaneSources;
    if (laneSources.length === 0) blocked("required_lane_missing");
    const ownerRefs = new Set(laneSources.map((source) => source.inventory.physical_owner_ref));
    const rootRefs = new Set(laneSources.map((source) => source.inventory.default_root_ref));
    if (ownerRefs.size !== 1 || rootRefs.size !== 1) blocked("inventory_owner_root_conflict");
    lanes[lane] = {
      physical_owner_ref: [...ownerRefs][0],
      default_root_ref: [...rootRefs][0],
      writer_candidates: [...new Set(laneSources.flatMap((source) => source.inventory.writer_candidates))],
      direct_caller_candidates: [...new Set(laneSources.flatMap((source) => source.inventory.direct_caller_candidates))],
      consumer_candidates: [...new Set(laneSources.flatMap((source) => source.inventory.consumer_candidates))],
      source_availability_summary: availabilityRollup(laneSources),
      source_refs: laneSources.map((source) => source.source_ref),
    };
  }
  return lanes;
}

export function buildInventoryManifest(descriptor) {
  enforceSentinels(descriptor);
  exactKeys(descriptor, ["schema_version", "evaluation_time", "baseline_refs", "expected_sources", "sources"]);
  if (descriptor.schema_version !== DESCRIPTOR_SCHEMA) invalid();
  const evaluationEpoch = parseTime(descriptor.evaluation_time);
  requireSafeRefArray(descriptor.baseline_refs, { semantic: true });
  if (descriptor.baseline_refs.length === 0) invalid();
  requireSafeRefArray(descriptor.expected_sources);
  if (descriptor.expected_sources.length === 0 || !Array.isArray(descriptor.sources)) invalid();
  const sources = descriptor.sources.map((source) => validateSource(source, evaluationEpoch));
  if (new Set(sources.map((source) => source.source_ref)).size !== sources.length) blocked("source_ref_duplicate");
  const expected = new Set(descriptor.expected_sources);
  if (sources.some((source) => !expected.has(source.source_ref))) blocked("unknown_source");
  if (descriptor.expected_sources.some((sourceRef) => !sources.some((source) => source.source_ref === sourceRef))) blocked("required_source_missing");

  const lanes = buildLanes(sources);
  const tableCounts = [];
  const indexNames = [];
  const triggerNames = [];
  const enumCounts = [];
  const mutationProofs = [];
  const rawHealth = [];
  for (const source of sources) {
    if (source.adapter_id === "sqlite_catalog_v1" && source.inventory.source_availability_summary === "available") {
      const inspected = inspectSqliteSource(source);
      tableCounts.push(...inspected.tableCounts);
      indexNames.push(...inspected.indexNames);
      triggerNames.push(...inspected.triggerNames);
      enumCounts.push(...inspected.enumCounts);
      mutationProofs.push(inspected.mutationProof);
    } else {
      mutationProofs.push({
        source_ref: source.source_ref,
        method: "no_source_opened",
        query_only_readback: null,
        total_changes: null,
        fingerprints: null,
        equivalent: true,
      });
    }
    if (source.synthetic_health_observation) {
      rawHealth.push(source.lane === "mail"
        ? evaluateMailSyntheticHealth(source.synthetic_health_observation, descriptor.evaluation_time)
        : evaluateVoiceSyntheticHealth(source.synthetic_health_observation, descriptor.evaluation_time));
    }
  }

  const manifest = {
    schema_version: MANIFEST_SCHEMA,
    evaluation_time: descriptor.evaluation_time,
    query_only: true,
    result: "review_ready_manifest",
    baseline_refs: descriptor.baseline_refs,
    lanes,
    source_authority_refs: [...new Set(sources.map((source) => source.authority.source_authority_ref))],
    table_counts: tableCounts,
    index_names: indexNames,
    trigger_names: triggerNames,
    enum_counts: enumCounts,
    raw_health_observations: rawHealth,
    unresolved_live_proofs: [...PROOFS],
    zero_mutation: { confirmed: true, sources: mutationProofs },
    raw_sentinel_violations: [],
    authority_effect: {
      review_ready: true,
      p0_accepted: false,
      h00_review_unlocked: false,
      p1_adapter_execution_unlocked: false,
      writer_or_activation_authority_created: false,
    },
  };
  const canonical = canonicalize(manifest);
  return canonicalize({ ...canonical, manifest_digest: digestValue(canonical) });
}

function parseCli(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const seen = new Set();
  let descriptorPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!["--query-only", "--json", "--descriptor"].includes(flag) || seen.has(flag)) invalid("cli_invalid");
    seen.add(flag);
    if (flag === "--descriptor") {
      const value = argv[++index];
      if (!value || value.startsWith("--") || /[*?\[\]]/.test(value) || !/\.json$/i.test(value)) invalid("cli_invalid");
      descriptorPath = value;
    }
  }
  if (!seen.has("--query-only") || !seen.has("--json") || !seen.has("--descriptor") || !descriptorPath) invalid("cli_invalid");
  return { help: false, descriptorPath };
}

function usage() {
  return "Usage: node tools/task_engine_inventory.mjs --query-only --json --descriptor <literal-json-path>";
}

function safeEnvelope(error) {
  const exitCode = error instanceof InventoryError ? error.exitCode : 6;
  const reasonByExit = {
    2: "descriptor_or_cli_invalid",
    3: "authority_or_source_blocked",
    4: "query_only_or_zero_mutation_guard_failed",
    5: "raw_path_secret_sentinel",
    6: "operational_query_failed",
  };
  return {
    exitCode,
    body: canonicalize({
      schema_version: ERROR_SCHEMA,
      result: "blocked",
      reason_code: reasonByExit[exitCode] ?? reasonByExit[6],
    }),
  };
}

export function runInventoryCli(argv) {
  try {
    const parsed = parseCli(argv);
    if (parsed.help) return { exitCode: 0, output: usage() };
    let descriptor;
    try {
      descriptor = JSON.parse(readFileSync(parsed.descriptorPath, "utf8"));
    } catch {
      invalid("descriptor_invalid");
    }
    const manifest = buildInventoryManifest(descriptor);
    const output = compactCanonical(manifest);
    enforceSentinels(JSON.parse(output));
    return { exitCode: 0, output };
  } catch (error) {
    const envelope = safeEnvelope(error);
    return { exitCode: envelope.exitCode, output: compactCanonical(envelope.body) };
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const result = runInventoryCli(process.argv.slice(2));
  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
}
