import { createHash } from "node:crypto";
import path from "node:path";

import {
  CURRENT_STATES,
  PHYSICAL_ROOT_CLASSES,
} from "../../../../../guild_hall/path_registry/src/path_registry_core.mjs";
import {
  STORAGE_MAP_ROW_KINDS,
  aggregateStorageMapState,
} from "../../../../../guild_hall/path_registry/src/storage_map_projection.mjs";
import { readStableFile } from "./receipt-expiry-adapter.mjs";

export const STORAGE_MAP_PATH = "/storage-map.snapshot.json";
export const STORAGE_MAP_BINDING_SCHEMA = "soulforge.team_ops_board.storage_map_binding.v1";
export const STORAGE_MAP_SCHEMA = "soulforge.watch_storage_map.v0";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/u;
const WATCH_STATES = new Set(["healthy", "degraded", "stale", "unavailable", "unknown", "hold"]);
const ROW_KINDS = new Set(STORAGE_MAP_ROW_KINDS);
const ROOT_CLASSES = new Set(PHYSICAL_ROOT_CLASSES);
const MIGRATION_STATES = new Set(CURRENT_STATES);
const BINDING_STATES = new Set(["bound", "unbound", "unavailable", "unknown"]);
const COVERAGE_STATES = new Set(["covered", "missing_evidence"]);
const PATH_DRIFT_STATES = new Set(["none_observed", "drift"]);
const FRESHNESS_STATES = new Set(["fresh", "stale", "unknown"]);
const POLICY_STATES = new Set(["present", "unknown"]);
const ACCEPTANCE_STATES = new Set(["accepted", "pending", "unknown"]);
const APPLICABILITY_STATES = new Set(["applicable", "not_applicable"]);
const CLOCK_SKEW_MS = 5_000;
const MAX_ROWS = 512;

const TOP_LEVEL_KEYS = Object.freeze([
  "status", "schema", "projection_kind", "registry_snapshot_digest",
  "rows", "summary", "observed_at",
]);
const SUMMARY_REQUIRED_KEYS = Object.freeze([
  "coverage_registered", "coverage_expected", "unclassified_count", "aggregate_state",
]);
const ROW_KEYS = Object.freeze([
  "row_key", "row_kind", "logical_id", "physical_root_class",
  "registry_snapshot_ref", "registry_snapshot_digest", "registry_record_ref",
  "topology_node_refs", "binding_state", "latest_capture_ref",
  "backup_generation_ref", "coverage_state", "coverage_registered",
  "coverage_expected", "unclassified_count", "path_drift_state",
  "freshness_state", "retention_policy_state", "rpo_policy_state",
  "restore_test_ref", "human_acceptance_state", "migration_state",
  "applicability_state", "watch_state", "evidence_at", "owner_pointer",
  "hold_code",
]);
const BINDING_KEYS = Object.freeze([
  "schema_version", "enabled", "snapshot_path", "expected_snapshot_sha256",
  "expected_registry_snapshot_digest", "access_policy",
]);
const ACCESS_POLICY_KEYS = Object.freeze([
  "read_only", "loopback_only", "follow_symlinks", "require_single_link",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function exactTimestamp(value, nowMs) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    && new Date(parsed).toISOString() === value
    && parsed <= nowMs + CLOCK_SKEW_MS;
}

function safeRef(value) {
  return typeof value === "string"
    && SAFE_REF.test(value)
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !value.startsWith("/")
    && !value.startsWith("\\\\")
    && !value.includes("\\");
}

function optionalSafeRef(value) {
  return value === null || safeRef(value);
}

function safeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function fixedUnavailable(reason, nowMs) {
  return {
    schema_version: "soulforge.team_ops_board.storage_map_adapter.v1",
    status: "unavailable",
    observed_at: new Date(nowMs).toISOString(),
    reason,
    authority_boundary: {
      read_only: true,
      writer_authority: false,
      repair_authority: false,
    },
  };
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function writeJson(response, body) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}

export function validateStorageMapBinding(value) {
  if (!hasExactKeys(value, BINDING_KEYS)
    || value.schema_version !== STORAGE_MAP_BINDING_SCHEMA
    || typeof value.enabled !== "boolean"
    || typeof value.snapshot_path !== "string"
    || !path.isAbsolute(value.snapshot_path)
    || !SHA256.test(value.expected_snapshot_sha256)
    || !SHA256.test(value.expected_registry_snapshot_digest)
    || !hasExactKeys(value.access_policy, ACCESS_POLICY_KEYS)
    || value.access_policy.read_only !== true
    || value.access_policy.loopback_only !== true
    || value.access_policy.follow_symlinks !== false
    || value.access_policy.require_single_link !== true) {
    throw new TypeError("storage_map_binding_invalid");
  }
  return {
    schema_version: value.schema_version,
    enabled: value.enabled,
    snapshot_path: value.snapshot_path,
    expected_snapshot_sha256: value.expected_snapshot_sha256,
    expected_registry_snapshot_digest: value.expected_registry_snapshot_digest,
    access_policy: { ...value.access_policy },
  };
}

function validateStorageMapRow(row, rootDigest, summary, nowMs, identities, topologyIdentities) {
  if (!hasExactKeys(row, ROW_KEYS)
    || !ROW_KINDS.has(row.row_kind)
    || !safeRef(row.logical_id)
    || row.row_key !== `storage_map:${row.logical_id}`
    || !ROOT_CLASSES.has(row.physical_root_class)
    || row.registry_snapshot_ref !== rootDigest
    || row.registry_snapshot_digest !== rootDigest
    || row.registry_record_ref !== row.logical_id
    || !Array.isArray(row.topology_node_refs)
    || row.topology_node_refs.length > 64
    || row.topology_node_refs.some((ref) => !safeRef(ref))
    || new Set(row.topology_node_refs).size !== row.topology_node_refs.length
    || !BINDING_STATES.has(row.binding_state)
    || !optionalSafeRef(row.latest_capture_ref)
    || !optionalSafeRef(row.backup_generation_ref)
    || !COVERAGE_STATES.has(row.coverage_state)
    || row.coverage_registered !== summary.coverage_registered
    || row.coverage_expected !== summary.coverage_expected
    || row.unclassified_count !== summary.unclassified_count
    || !PATH_DRIFT_STATES.has(row.path_drift_state)
    || !FRESHNESS_STATES.has(row.freshness_state)
    || !POLICY_STATES.has(row.retention_policy_state)
    || !POLICY_STATES.has(row.rpo_policy_state)
    || !optionalSafeRef(row.restore_test_ref)
    || !ACCEPTANCE_STATES.has(row.human_acceptance_state)
    || !MIGRATION_STATES.has(row.migration_state)
    || !APPLICABILITY_STATES.has(row.applicability_state)
    || !WATCH_STATES.has(row.watch_state)
    || !(row.evidence_at === null || exactTimestamp(row.evidence_at, nowMs))
    || !safeRef(row.owner_pointer)
    || !optionalSafeRef(row.hold_code)
    || (summary.unclassified_count > 0 && row.path_drift_state !== "drift")
    || identities.has(row.logical_id)) {
    throw new TypeError("storage_map_row_invalid");
  }
  for (const topologyRef of row.topology_node_refs) {
    if (topologyIdentities.has(topologyRef)) throw new TypeError("storage_map_topology_identity_duplicate");
    topologyIdentities.add(topologyRef);
  }
  identities.add(row.logical_id);
  return Object.fromEntries(ROW_KEYS.map((key) => [key, Array.isArray(row[key]) ? [...row[key]] : row[key]]));
}

export function validateStorageMapSnapshot(value, {
  expectedRegistrySnapshotDigest,
  now = Date.now(),
} = {}) {
  if (!hasExactKeys(value, TOP_LEVEL_KEYS)
    || value.status !== "projected"
    || value.schema !== STORAGE_MAP_SCHEMA
    || value.projection_kind !== "backup_readiness_overlay"
    || !SHA256.test(value.registry_snapshot_digest)
    || value.registry_snapshot_digest !== expectedRegistrySnapshotDigest
    || !Array.isArray(value.rows)
    || value.rows.length === 0
    || value.rows.length > MAX_ROWS
    || !exactTimestamp(value.observed_at, now)) {
    throw new TypeError("storage_map_snapshot_invalid");
  }

  const summaryKeys = Object.hasOwn(value.summary ?? {}, "hold_code")
    ? [...SUMMARY_REQUIRED_KEYS, "hold_code"]
    : SUMMARY_REQUIRED_KEYS;
  if (!hasExactKeys(value.summary, summaryKeys)
    || !safeInteger(value.summary.coverage_registered, MAX_ROWS)
    || value.summary.coverage_registered !== value.rows.length
    || !safeInteger(value.summary.coverage_expected, value.rows.length)
    || !safeInteger(value.summary.unclassified_count)
    || !WATCH_STATES.has(value.summary.aggregate_state)
    || (Object.hasOwn(value.summary, "hold_code") && !safeRef(value.summary.hold_code))) {
    throw new TypeError("storage_map_summary_invalid");
  }

  const identities = new Set();
  const topologyIdentities = new Set();
  const rows = value.rows.map((row) => validateStorageMapRow(
    row,
    value.registry_snapshot_digest,
    value.summary,
    now,
    identities,
    topologyIdentities,
  ));
  const expectedCoverage = rows.filter((row) => row.applicability_state === "applicable").length;
  const aggregateInputs = rows
    .filter((row) => row.applicability_state === "applicable")
    .map((row) => row.watch_state);
  if (value.summary.unclassified_count > 0) aggregateInputs.push("hold");
  if (value.summary.coverage_expected !== expectedCoverage
    || aggregateStorageMapState(aggregateInputs) !== value.summary.aggregate_state) {
    throw new TypeError("storage_map_aggregate_invalid");
  }

  return {
    status: value.status,
    schema: value.schema,
    projection_kind: value.projection_kind,
    registry_snapshot_digest: value.registry_snapshot_digest,
    rows,
    summary: { ...value.summary },
    observed_at: value.observed_at,
  };
}

export async function readStorageMapSnapshot(options = {}) {
  const nowMs = typeof options.now === "function" ? options.now() : Date.now();
  let binding;
  try {
    if (options.binding !== undefined) {
      binding = validateStorageMapBinding(options.binding);
    } else if (typeof options.bindingPath === "string"
      && path.isAbsolute(options.bindingPath)
      && typeof options.bindingSha256 === "string"
      && SHA256.test(options.bindingSha256)) {
      const rawBinding = await readStableFile(options.bindingPath, options.testHooks);
      const bindingDigest = `sha256:${createHash("sha256").update(rawBinding, "utf8").digest("hex")}`;
      if (bindingDigest !== options.bindingSha256) {
        return fixedUnavailable("storage_map_binding_unavailable", nowMs);
      }
      binding = validateStorageMapBinding(JSON.parse(rawBinding));
    } else {
      return fixedUnavailable("storage_map_binding_unconfigured", nowMs);
    }
  } catch {
    return fixedUnavailable("storage_map_binding_unavailable", nowMs);
  }

  if (!binding.enabled) return fixedUnavailable("storage_map_disabled_by_binding", nowMs);

  try {
    const raw = await readStableFile(binding.snapshot_path, options.testHooks);
    const digest = `sha256:${createHash("sha256").update(raw, "utf8").digest("hex")}`;
    if (digest !== binding.expected_snapshot_sha256) {
      return fixedUnavailable("storage_map_snapshot_unavailable", nowMs);
    }
    return validateStorageMapSnapshot(JSON.parse(raw), {
      expectedRegistrySnapshotDigest: binding.expected_registry_snapshot_digest,
      now: nowMs,
    });
  } catch {
    return fixedUnavailable("storage_map_snapshot_unavailable", nowMs);
  }
}

export function createStorageMapServerAdapter(options = {}) {
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      if (request.url !== STORAGE_MAP_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isLoopbackAddress(request.socket?.remoteAddress)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      void readStorageMapSnapshot(options).then(
        (snapshot) => writeJson(response, snapshot),
        () => writeJson(response, fixedUnavailable("storage_map_snapshot_unavailable", Date.now())),
      );
    });
  };

  return {
    name: "soulforge-storage-map-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
