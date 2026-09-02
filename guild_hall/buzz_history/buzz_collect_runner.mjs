// Buzz read-only collection runner (HPP source lane, every 15 minutes).
//
// The Linear lane's operating pattern, kept deliberately identical where the
// boundary is the same: one SHA-256-pinned private binding, exact
// repository/runtime forbidden roots, writer authority/epoch fencing, a
// fail-closed lease, health written before any rejection returns, refs-only
// receipts, and immutable create-only custody. Three differences follow from
// the relay being local rather than a hosted API:
//   1. there is no credential at all — PostgreSQL is reached over the
//      container's local socket by the pinned exporter script, so the binding
//      has no `credentials` key to fence;
//   2. capture is a two-watermark cursor (`received_at` for live rows,
//      `deleted_at` for tombstones) plus a per-community audit sequence,
//      instead of one `updatedAt` window with a page cursor;
//   3. the transport writes a bounded export into a staging directory and the
//      runner re-hashes every file before parsing a byte of it.
// Collection is not backup: nothing here creates a backup generation, restore
// test, or acceptance record. The lane issues no statement that can write.

import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";

import { sha256Canonical } from "../shared/project_history_envelope.mjs";

import {
  BUZZ_COLLECT_CURSOR_SCHEMA_VERSION,
  BUZZ_COLLECT_OBJECT_KINDS,
  BUZZ_COLLECT_RUN_RECEIPT_SCHEMA_VERSION,
  BUZZ_READ_OPERATIONS,
  assertRelayIso,
  observedObjectTotal,
  validateBuzzCollectCursor,
  validateBuzzCollectRunReceipt,
} from "./buzz_collect_receipt.mjs";
import {
  acquireExclusiveLease,
  assertNoReparseComponents,
  atomicWritePrivateJson,
  lstatOrNull,
  readPrivateJson,
  resolveGuardedPrivatePath,
  sha256Bytes,
  writeCreateOnlyJson,
} from "./buzz_custody.mjs";
import {
  BUZZ_EXPORT_FILE_KINDS,
  BUZZ_EXPORT_RUNTIME_RELATIVE_PATH,
  BUZZ_LIVENESS_URL_PATTERN,
  assertExporterScriptShape,
  assertWslExecutableShape,
  createBuzzWslExporter,
} from "./buzz_wsl_exporter.mjs";

export const BUZZ_COLLECT_BINDING_SCHEMA_VERSION = "soulforge.buzz_collect.binding.v1";
export const BUZZ_COLLECT_STATE_SCHEMA_VERSION = "soulforge.buzz_collect.state.v1";
export const BUZZ_COLLECT_HEALTH_SCHEMA_VERSION = "soulforge.buzz_collect.health.v1";
export const BUZZ_CUSTODY_OBJECT_SCHEMA_VERSION = "soulforge.buzz_collect.custody_object.v1";
export const BUZZ_COLLECT_LEASE_NAME = "buzz-collect.lock";
export const BUZZ_SOURCE_REF = "source.buzz";
export const BUZZ_COLLECT_HEALTH_LANE = "buzz_collect";
// In-process run deadline. The registrar's Scheduled Task ExecutionTimeLimit
// is PT10M; the lane refuses to start an export whose own timeout could carry
// it past this, so the receipt, cursor, state, health, and lease release
// always complete inside the task limit instead of being killed mid-write.
export const BUZZ_COLLECT_DEFAULT_RUN_DEADLINE_MS = 8 * 60 * 1000;
export const BUZZ_COLLECT_MAX_RUN_DEADLINE_MS = 9 * 60 * 1000;

const BINDING_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "lane_id",
  "private_root",
  "data_root",
  "state_root",
  "forbidden_roots",
  "writer",
  "relay",
  "cursor",
]);
const WRITER_FIELDS = Object.freeze(["authority_id", "epoch"]);
const RELAY_FIELDS = Object.freeze([
  "relay_key",
  "liveness_url",
  "wsl_executable",
  "wsl_distro",
  "mount_prefix",
  "postgres_container",
  "db_name",
  "db_user",
]);
const CURSOR_POLICY_FIELDS = Object.freeze([
  "overlap_seconds",
  "initial_received_at",
  "row_limit",
  "timeout_ms",
]);
const CURSOR_POLICY_OPTIONAL_FIELDS = Object.freeze(["run_deadline_ms"]);
// No `object_index`: Buzz dedup is the overlap re-read plus content-addressed
// create-only custody, so the lane never needs a tail id list and the state
// file cannot grow with the relay.
const STATE_FIELDS = Object.freeze([
  "schema_version",
  "lane_id",
  "identity_digest",
  "writer_authority_id",
  "writer_epoch",
  "cursor",
  "last_run_id",
  "last_completed_at",
]);

const EVENT_ROW_FIELDS = Object.freeze([
  "community_id",
  "id",
  "pubkey",
  "created_at",
  "kind",
  "tags",
  "content",
  "sig",
  "received_at",
  "channel_id",
  "deleted_at",
  "d_tag",
  "not_before",
  "delivered_at",
]);
const AUDIT_ROW_FIELDS = Object.freeze([
  "community_id",
  "seq",
  "hash",
  "prev_hash",
  "action",
  "actor_pubkey",
  "object_id",
  "detail",
  "created_at",
]);
const SNAPSHOT_FIELDS = Object.freeze([
  "channels",
  "channel_members",
  "users",
  "communities",
  "relay_members",
  "thread_metadata",
  "reactions",
]);

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const RELAY_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const DISTRO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const CONTAINER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const PG_IDENT_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;
const MOUNT_PREFIX_PATTERN = /^\/[a-z]{1,32}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/u;
const HEX_PATTERN = /^[0-9a-f]*$/u;
const ISO_MS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const OBJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]{0,38})$/u;
// A Nostr secret key or a JWT anywhere in the binding is a hard stop. The
// relay itself needs no secret, so a binding carrying one is misconfigured by
// definition.
const TOKEN_VALUE_PATTERN = /^(?:nsec1[a-z0-9]{20,}|eyJ[A-Za-z0-9_-]{8,}\.|(?:xox[abprs]|xapp)-|lin_(?:api|oauth)_|Bearer\s)/u;
const SECRET_FIELD_PATTERN = /(?:access_token|client_secret|password|token_value|credential_value|api_key_value|signing_key|secret_key|private_key)/iu;

// Bounds on one parsed export. They are far above the relay's observed size
// (2,282 events / 3.2 MB of content) and exist so a corrupted or hostile
// export cannot exhaust memory before the row shape is even checked.
const MAX_EXPORT_FILE_BYTES = 256 * 1024 * 1024;
const MAX_ROW_BYTES = 8 * 1024 * 1024;
const MAX_VALUE_DEPTH = 32;
const MAX_VALUE_NODES = 2_000_000;

export class BuzzCollectError extends Error {
  constructor(code, target, message) {
    super(`${code} at ${target}: ${message}`);
    this.name = "BuzzCollectError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target, message) {
  throw new BuzzCollectError(code, target, message);
}

function plainRecord(value, target) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", target, "Expected a plain object");
  }
  return value;
}

function exactKeys(value, fields, target) {
  plainRecord(value, target);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    fail("exact_keys_required", target, `Expected exact keys: ${expected.join(",")}`);
  }
  return value;
}

function safeRef(value, target) {
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value)
    || /^(?:https?|file|data):/iu.test(value)
    || value.includes("/") || value.includes("\\")) {
    fail("safe_ref_required", target, "Expected an opaque non-locator reference");
  }
  return value;
}

function assertDigest(value, target) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("digest_invalid", target, "Expected a lowercase sha256 digest");
  }
  return value;
}

function assertIso(value, target) {
  if (typeof value !== "string" || !ISO_MS_PATTERN.test(value) || new Date(value).toISOString() !== value) {
    fail("clock_invalid", target, "Expected a canonical UTC millisecond timestamp");
  }
  return value;
}

// `assertRelayIso` calls its failure hook with (code, target); the runner's
// `fail` also takes a message, so the hook supplies one rather than leaving
// "undefined" in the error string.
function relayIso(value, target) {
  return assertRelayIso(value, target, (code, failTarget) => fail(
    code, failTarget, "Expected a relay UTC timestamp with 1-6 fractional digits",
  ));
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalizedPath(left) === normalizedPath(right);
}

function isPathWithin(parent, candidate, strict = false) {
  const relative = path.relative(normalizedPath(parent), normalizedPath(candidate));
  if (relative === "") return !strict;
  return relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function pathsOverlap(left, right) {
  return isPathWithin(left, right) || isPathWithin(right, left);
}

function absolutePath(value, target) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail("absolute_path_required", target, "Expected an absolute private path");
  }
  return value;
}

function assertNoEmbeddedSecret(value, target) {
  if (typeof value === "string") {
    if (TOKEN_VALUE_PATTERN.test(value)) {
      fail("secret_value_forbidden", target, "Token-like values are forbidden in bindings");
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_FIELD_PATTERN.test(key)) {
      fail("secret_field_forbidden", `${target}.${key}`, "Secret fields are forbidden");
    }
    assertNoEmbeddedSecret(child, `${target}.${key}`);
  }
}

export function custodyRootFor(binding) {
  return path.resolve(binding.data_root, binding.relay.relay_key);
}

export function validateBuzzCollectBinding(binding) {
  exactKeys(binding, BINDING_FIELDS, "$binding");
  if (binding.schema_version !== BUZZ_COLLECT_BINDING_SCHEMA_VERSION) {
    fail("binding_schema_invalid", "$binding.schema_version", "Unexpected binding schema version");
  }
  if (binding.feature_enabled !== true) {
    fail("binding_feature_must_be_on", "$binding.feature_enabled", "Live collection binding must be enabled");
  }
  safeRef(binding.lane_id, "$binding.lane_id");
  absolutePath(binding.private_root, "$binding.private_root");
  absolutePath(binding.state_root, "$binding.state_root");
  if (!isPathWithin(binding.private_root, binding.state_root, true)) {
    fail("state_root_not_strict_private_child", "$binding.state_root", "State root must be inside private root");
  }
  if (!Array.isArray(binding.forbidden_roots)
    || Object.keys(binding.forbidden_roots).length !== binding.forbidden_roots.length
    || binding.forbidden_roots.length < 2) {
    fail("forbidden_roots_required", "$binding.forbidden_roots", "At least repository and runtime roots are required");
  }
  const forbidden = new Set();
  binding.forbidden_roots.forEach((value, index) => {
    absolutePath(value, `$binding.forbidden_roots[${index}]`);
    const normalized = normalizedPath(value);
    if (forbidden.has(normalized)) {
      fail("duplicate_forbidden_root", `$binding.forbidden_roots[${index}]`, "Forbidden roots must be unique");
    }
    forbidden.add(normalized);
    if (pathsOverlap(binding.private_root, value) || pathsOverlap(binding.state_root, value)) {
      fail("private_forbidden_overlap", "$binding.private_root", "Private roots must be disjoint from forbidden roots");
    }
  });
  exactKeys(binding.writer, WRITER_FIELDS, "$binding.writer");
  safeRef(binding.writer.authority_id, "$binding.writer.authority_id");
  if (!Number.isSafeInteger(binding.writer.epoch) || binding.writer.epoch < 1) {
    fail("writer_epoch_invalid", "$binding.writer.epoch", "Expected a positive writer epoch");
  }
  exactKeys(binding.relay, RELAY_FIELDS, "$binding.relay");
  if (typeof binding.relay.relay_key !== "string" || !RELAY_KEY_PATTERN.test(binding.relay.relay_key)) {
    fail("relay_key_invalid", "$binding.relay.relay_key", "Expected a slug naming the custody subfolder");
  }
  if (typeof binding.relay.liveness_url !== "string"
    || !BUZZ_LIVENESS_URL_PATTERN.test(binding.relay.liveness_url)) {
    fail("relay_liveness_url_invalid", "$binding.relay.liveness_url", "Only a loopback _liveness URL is allowed");
  }
  absolutePath(binding.relay.wsl_executable, "$binding.relay.wsl_executable");
  if (path.basename(binding.relay.wsl_executable).toLowerCase() !== "wsl.exe") {
    fail("wsl_executable_invalid", "$binding.relay.wsl_executable", "Expected the wsl.exe basename");
  }
  if (binding.forbidden_roots.some((root) => isPathWithin(root, binding.relay.wsl_executable))) {
    fail("wsl_executable_forbidden_overlap", "$binding.relay.wsl_executable", "The interpreter must not live under a forbidden root");
  }
  if (typeof binding.relay.wsl_distro !== "string" || !DISTRO_PATTERN.test(binding.relay.wsl_distro)) {
    fail("wsl_distro_invalid", "$binding.relay.wsl_distro", "Expected a plain distribution name");
  }
  if (typeof binding.relay.mount_prefix !== "string" || !MOUNT_PREFIX_PATTERN.test(binding.relay.mount_prefix)) {
    fail("wsl_mount_prefix_invalid", "$binding.relay.mount_prefix", "Expected a single-segment absolute mount prefix");
  }
  if (typeof binding.relay.postgres_container !== "string"
    || !CONTAINER_PATTERN.test(binding.relay.postgres_container)) {
    fail("postgres_container_invalid", "$binding.relay.postgres_container", "Expected a plain container name");
  }
  for (const field of ["db_name", "db_user"]) {
    if (typeof binding.relay[field] !== "string" || !PG_IDENT_PATTERN.test(binding.relay[field])) {
      fail("postgres_identifier_invalid", `$binding.relay.${field}`, "Expected an unquoted PostgreSQL identifier");
    }
  }
  plainRecord(binding.cursor, "$binding.cursor");
  exactKeys(
    binding.cursor,
    Object.hasOwn(binding.cursor, "run_deadline_ms")
      ? [...CURSOR_POLICY_FIELDS, ...CURSOR_POLICY_OPTIONAL_FIELDS]
      : CURSOR_POLICY_FIELDS,
    "$binding.cursor",
  );
  const boundedInteger = (value, minimum, maximum, target) => {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      fail("cursor_policy_invalid", target, `Expected an integer from ${minimum} to ${maximum}`);
    }
  };
  boundedInteger(binding.cursor.overlap_seconds, 0, 86_400, "$binding.cursor.overlap_seconds");
  if (binding.cursor.initial_received_at !== null) {
    relayIso(binding.cursor.initial_received_at, "$binding.cursor.initial_received_at");
  }
  boundedInteger(binding.cursor.row_limit, 1, 50_000, "$binding.cursor.row_limit");
  boundedInteger(binding.cursor.timeout_ms, 1_000, 300_000, "$binding.cursor.timeout_ms");
  if (Object.hasOwn(binding.cursor, "run_deadline_ms")) {
    boundedInteger(
      binding.cursor.run_deadline_ms,
      1_000,
      BUZZ_COLLECT_MAX_RUN_DEADLINE_MS,
      "$binding.cursor.run_deadline_ms",
    );
  }
  // The export process is the only long call in the run, so its timeout must
  // fit inside the deadline that keeps the whole run under the task limit.
  if (binding.cursor.timeout_ms > runDeadlineMsFor(binding.cursor)) {
    fail("cursor_policy_invalid", "$binding.cursor.timeout_ms", "Export timeout must not exceed the run deadline");
  }
  absolutePath(binding.data_root, "$binding.data_root");
  if (!isPathWithin(binding.private_root, binding.data_root, true)) {
    fail("data_root_not_strict_private_child", "$binding.data_root", "Data root must be a strict child of the private root");
  }
  if (pathsOverlap(binding.data_root, binding.state_root)) {
    fail("data_root_state_overlap", "$binding.state_root", "State root must be disjoint from the Buzz data root");
  }
  if (binding.forbidden_roots.some((root) => pathsOverlap(root, binding.data_root))) {
    fail("data_root_forbidden_overlap", "$binding.data_root", "Data root must be disjoint from every forbidden root");
  }
  assertNoEmbeddedSecret(binding, "$binding");
  return binding;
}

// Effective in-process deadline for one run, from the validated cursor policy.
export function runDeadlineMsFor(policy) {
  return Object.hasOwn(policy, "run_deadline_ms")
    ? policy.run_deadline_ms
    : BUZZ_COLLECT_DEFAULT_RUN_DEADLINE_MS;
}

export function identityDigestForBinding(binding) {
  return sha256Canonical({
    lane_id: binding.lane_id,
    relay_key: binding.relay.relay_key,
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
  });
}

async function canonicalExistingDirectory(value, target) {
  absolutePath(value, target);
  const absolute = await assertNoReparseComponents(value, target);
  const stat = await lstatOrNull(absolute);
  if (stat === null || !stat.isDirectory() || stat.isSymbolicLink()) {
    fail("directory_required", target, "Expected an existing normal directory");
  }
  const canonical = await realpath(absolute);
  if (!samePath(canonical, absolute)) {
    fail("canonical_path_required", target, "Directory must not resolve through an alias");
  }
  return canonical;
}

async function canonicalPlannedDirectory(value, target) {
  absolutePath(value, target);
  const absolute = await assertNoReparseComponents(value, target);
  const missing = [];
  let cursor = absolute;
  let stat = await lstatOrNull(cursor);
  while (stat === null) {
    const parent = path.dirname(cursor);
    if (parent === cursor) fail("directory_ancestor_missing", target, "No existing directory ancestor");
    missing.unshift(path.basename(cursor));
    cursor = parent;
    stat = await lstatOrNull(cursor);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail("directory_required", target, "Planned directory ancestor must be a normal directory");
  }
  const canonicalAncestor = await realpath(cursor);
  if (!samePath(canonicalAncestor, cursor)) {
    fail("canonical_path_required", target, "Planned directory ancestor must not resolve through an alias");
  }
  return path.resolve(canonicalAncestor, ...missing);
}

async function readPinnedJsonFile(filePath, expectedDigest, target) {
  assertDigest(expectedDigest, `${target}.sha256`);
  absolutePath(filePath, `${target}.path`);
  const absolute = await assertNoReparseComponents(filePath, `${target}.path`);
  const before = await lstatOrNull(absolute);
  if (before === null || !before.isFile() || before.isSymbolicLink()
    || before.nlink !== 1 || before.size < 2 || before.size > 1_048_576) {
    fail("private_json_file_invalid", `${target}.path`, "Expected one bounded normal JSON file");
  }
  const canonical = await realpath(absolute);
  if (!samePath(canonical, absolute)) {
    fail("canonical_path_required", `${target}.path`, "Private JSON must not resolve through an alias");
  }
  const handle = await open(absolute, "r");
  let bytes;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1
      || String(opened.dev) !== String(before.dev)
      || String(opened.ino) !== String(before.ino)
      || opened.size !== before.size) {
      fail("private_json_identity_changed", `${target}.path`, "Private JSON changed before open");
    }
    bytes = await handle.readFile();
    const after = await handle.stat();
    if (String(after.dev) !== String(opened.dev)
      || String(after.ino) !== String(opened.ino)
      || after.nlink !== 1
      || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs) {
      fail("private_json_identity_changed", `${target}.path`, "Private JSON changed while read");
    }
  } finally {
    await handle.close();
  }
  if (sha256Bytes(bytes) !== expectedDigest) {
    fail("private_json_digest_mismatch", `${target}.sha256`, "Pinned JSON bytes changed");
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8").replace(/^﻿/u, ""));
  } catch {
    fail("private_json_invalid", target, "Pinned file is not valid JSON");
  }
  return { path: canonical, value };
}

// The registered state root is guarded from the CLI arguments alone so a
// health receipt can be written even when the binding itself is unreadable.
export async function guardHealthRoot({
  state_root: stateRoot,
  repository_root: repositoryRoot,
  runtime_root: runtimeRoot,
}) {
  absolutePath(stateRoot, "$state_root");
  absolutePath(repositoryRoot, "$repository_root");
  absolutePath(runtimeRoot, "$runtime_root");
  if (pathsOverlap(stateRoot, repositoryRoot) || pathsOverlap(stateRoot, runtimeRoot)) {
    fail("state_root_forbidden_overlap", "$state_root", "State root must be disjoint from repository and runtime roots");
  }
  return canonicalPlannedDirectory(stateRoot, "$state_root");
}

export async function resolveLaneContext({
  binding_path: bindingPath,
  expected_binding_sha256: expectedBindingSha256,
  repository_root: repositoryRoot,
  runtime_root: runtimeRoot,
  state_root: registeredStateRoot,
}) {
  assertDigest(expectedBindingSha256, "$expected_binding_sha256");
  const canonicalRepositoryRoot = await canonicalExistingDirectory(repositoryRoot, "$repository_root");
  const canonicalRuntimeRoot = await canonicalExistingDirectory(runtimeRoot, "$runtime_root");
  if (pathsOverlap(canonicalRepositoryRoot, canonicalRuntimeRoot)) {
    fail("repository_runtime_overlap", "$runtime_root", "Repository and runtime roots must be disjoint");
  }
  absolutePath(bindingPath, "$binding_path");
  const plannedBindingPath = await assertNoReparseComponents(bindingPath, "$binding_path");
  await canonicalExistingDirectory(path.dirname(plannedBindingPath), "$binding_parent");
  const provisional = await readPinnedJsonFile(plannedBindingPath, expectedBindingSha256, "$binding");
  const binding = validateBuzzCollectBinding(provisional.value);
  const canonicalPrivateRoot = await canonicalExistingDirectory(binding.private_root, "$binding.private_root");
  if (!isPathWithin(canonicalPrivateRoot, provisional.path, true)) {
    fail("binding_outside_private_root", "$binding_path", "Binding escaped private root");
  }
  const canonicalStateRoot = await canonicalPlannedDirectory(binding.state_root, "$binding.state_root");
  if (!isPathWithin(canonicalPrivateRoot, canonicalStateRoot, true)) {
    fail("state_root_not_strict_private_child", "$binding.state_root", "State root escaped private root");
  }
  if (registeredStateRoot !== undefined && !samePath(registeredStateRoot, canonicalStateRoot)) {
    fail("state_root_mismatch", "$state_root", "Registered state root differs from the binding state root");
  }
  const canonicalDataRoot = await canonicalPlannedDirectory(binding.data_root, "$binding.data_root");
  if (!isPathWithin(canonicalPrivateRoot, canonicalDataRoot, true)
    || pathsOverlap(canonicalDataRoot, canonicalStateRoot)) {
    fail("data_root_boundary_invalid", "$binding.data_root", "Data root must be a private child disjoint from state");
  }
  const canonicalCustodyRoot = await canonicalPlannedDirectory(custodyRootFor(binding), "$custody_root");
  if (!isPathWithin(canonicalPrivateRoot, canonicalCustodyRoot, true)
    || pathsOverlap(canonicalCustodyRoot, canonicalStateRoot)) {
    fail("custody_root_boundary_invalid", "$custody_root", "Custody root must be a private child disjoint from state");
  }
  if (pathsOverlap(provisional.path, canonicalStateRoot) || pathsOverlap(provisional.path, canonicalCustodyRoot)) {
    fail("binding_path_state_overlap", "$binding_path", "Binding file must be disjoint from state and custody");
  }
  for (const [root, target] of [
    [canonicalRepositoryRoot, "$repository_root"],
    [canonicalRuntimeRoot, "$runtime_root"],
  ]) {
    if (pathsOverlap(canonicalPrivateRoot, root)
      || pathsOverlap(canonicalStateRoot, root)
      || pathsOverlap(canonicalCustodyRoot, root)
      || pathsOverlap(provisional.path, root)) {
      fail("private_public_runtime_overlap", target, "Private binding, state and custody must be disjoint");
    }
    if (!binding.forbidden_roots.some((entry) => samePath(entry, root))) {
      fail("required_forbidden_root_missing", "$binding.forbidden_roots", "Repository and runtime roots must be pinned as forbidden");
    }
  }
  return {
    binding,
    binding_sha256: expectedBindingSha256,
    binding_path: provisional.path,
    identity_digest: identityDigestForBinding(binding),
    private_root: canonicalPrivateRoot,
    data_root: canonicalDataRoot,
    state_root: canonicalStateRoot,
    custody_root: canonicalCustodyRoot,
    repository_root: canonicalRepositoryRoot,
    runtime_root: canonicalRuntimeRoot,
  };
}

// ---------------------------------------------------------------------------
// Health receipt (written first, before any rejection).
// ---------------------------------------------------------------------------

function safeFailureCode(error) {
  const candidate = String(error?.code ?? "");
  return /^[a-z][a-z0-9_]{0,95}$/u.test(candidate) ? candidate : "unknown_failure";
}

export async function writeBuzzCollectHealth(stateRoot, {
  attemptedAt,
  succeeded,
  errorCodes = [],
  runId = null,
  receivedWatermark = null,
  deletedWatermark = null,
  objectsCreated = null,
  coverageGaps = null,
  now = () => new Date(),
}) {
  const prior = await readPrivateJson(stateRoot, ["health", "buzz_collect.json"]).catch(() => null);
  const priorValid = prior?.schema_version === BUZZ_COLLECT_HEALTH_SCHEMA_VERSION;
  const priorLastSuccess = priorValid
    && typeof prior.last_success_at === "string" && Number.isFinite(Date.parse(prior.last_success_at))
    ? prior.last_success_at : null;
  const keepPrior = (key, predicate) => (
    priorValid && predicate(prior[key]) ? prior[key] : null
  );
  const completedAt = now().toISOString();
  const record = {
    schema_version: BUZZ_COLLECT_HEALTH_SCHEMA_VERSION,
    lane: BUZZ_COLLECT_HEALTH_LANE,
    status: succeeded ? "ok" : "error",
    attempted_at: attemptedAt,
    completed_at: completedAt,
    last_success_at: succeeded ? completedAt : priorLastSuccess,
    error_codes: succeeded ? [] : [...new Set(errorCodes.filter((code) => /^[a-z][a-z0-9_]{0,127}$/u.test(code)))].sort(),
    last_run_id: runId ?? keepPrior("last_run_id", (value) => typeof value === "string"),
    // Watermarks and gaps of the last successful run are kept across a failed
    // run, so an operator can see how far the lane had actually reached.
    received_watermark: succeeded ? receivedWatermark
      : keepPrior("received_watermark", (value) => typeof value === "string"),
    deleted_watermark: succeeded ? deletedWatermark
      : keepPrior("deleted_watermark", (value) => typeof value === "string"),
    objects_created: succeeded ? objectsCreated : null,
    coverage_gaps: succeeded ? coverageGaps : keepPrior("coverage_gaps", (value) => Array.isArray(value)),
  };
  await atomicWritePrivateJson(stateRoot, ["health", "buzz_collect.json"], record);
  return record;
}

// ---------------------------------------------------------------------------
// State.
// ---------------------------------------------------------------------------

function initialCursor() {
  return {
    schema_version: BUZZ_COLLECT_CURSOR_SCHEMA_VERSION,
    received_watermark: null,
    deleted_watermark: null,
    audit_seq_max: {},
    generation_seq: 0,
  };
}

function initialState(context) {
  return {
    schema_version: BUZZ_COLLECT_STATE_SCHEMA_VERSION,
    lane_id: context.binding.lane_id,
    identity_digest: context.identity_digest,
    writer_authority_id: context.binding.writer.authority_id,
    writer_epoch: context.binding.writer.epoch,
    cursor: initialCursor(),
    last_run_id: null,
    last_completed_at: null,
  };
}

export function validateBuzzCollectState(state, context) {
  exactKeys(state, STATE_FIELDS, "$state");
  if (state.schema_version !== BUZZ_COLLECT_STATE_SCHEMA_VERSION) {
    fail("state_schema_invalid", "$state.schema_version", "Unexpected state schema");
  }
  if (state.lane_id !== context.binding.lane_id || state.identity_digest !== context.identity_digest) {
    fail("state_identity_fence", "$state.identity_digest", "State belongs to a different lane identity");
  }
  if (state.writer_authority_id !== context.binding.writer.authority_id
    || state.writer_epoch !== context.binding.writer.epoch) {
    fail("state_writer_fence", "$state.writer_epoch", "State belongs to another writer authority or epoch");
  }
  try {
    validateBuzzCollectCursor(state.cursor, "$state.cursor");
  } catch (error) {
    fail(safeFailureCode(error), "$state.cursor", "Persisted cursor is invalid");
  }
  if (state.last_run_id !== null && typeof state.last_run_id !== "string") {
    fail("state_run_id_invalid", "$state.last_run_id", "Expected null or a run id");
  }
  if (state.last_completed_at !== null) assertIso(state.last_completed_at, "$state.last_completed_at");
  return state;
}

// ---------------------------------------------------------------------------
// Export normalization and row shapes.
// ---------------------------------------------------------------------------

// `canonicalJson` accepts only safe integers and already-NFC strings, so an
// export value is brought into that domain before it is ever hashed: strings
// are NFC-normalized, and any number a JSON parser cannot round-trip exactly
// (a fraction, or an integer beyond 2^53) becomes its decimal string. The
// exporter already casts the relay's bigint columns to text, so this is the
// backstop for whole-table snapshot rows whose schema the lane does not pin.
export function normalizeExportValue(value, target = "$row", budget = { nodes: 0 }, depth = 0) {
  if (depth > MAX_VALUE_DEPTH) fail("export_row_too_deep", target, "Export value nests too deeply");
  budget.nodes += 1;
  if (budget.nodes > MAX_VALUE_NODES) fail("export_row_too_large", target, "Export value has too many nodes");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("export_number_invalid", target, "Export numbers must be finite");
    if (Number.isSafeInteger(value) && !Object.is(value, -0)) return value;
    // `String(1e21)` is "1e+21", which is not a decimal literal; the exact
    // value is recovered through its full-precision fixed form instead.
    return Number.isInteger(value) ? BigInt(value).toString() : String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeExportValue(entry, `${target}[${index}]`, budget, depth + 1));
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const normalized = {};
    for (const key of Object.keys(value)) {
      // Assigning `__proto__` with `=` would mutate the prototype instead of
      // adding a key, so every field is defined explicitly.
      Object.defineProperty(normalized, key.normalize("NFC"), {
        value: normalizeExportValue(value[key], `${target}.${key}`, budget, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return normalized;
  }
  fail("export_value_unsupported", target, "Unsupported export value");
  return null;
}

function assertHex(value, target, { nullable = false, exactLength = null } = {}) {
  if (value === null && nullable) return value;
  if (typeof value !== "string" || !HEX_PATTERN.test(value)
    || (exactLength !== null && value.length !== exactLength)) {
    fail("export_row_invalid", target, "Expected a lowercase hex string");
  }
  return value;
}

function assertNullableDecimal(value, target) {
  if (value === null) return value;
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    fail("export_row_invalid", target, "Expected a decimal integer string");
  }
  return value;
}

export function validateEventRow(row, target) {
  exactKeys(row, EVENT_ROW_FIELDS, target);
  if (typeof row.community_id !== "string" || !UUID_PATTERN.test(row.community_id)) {
    fail("export_row_invalid", `${target}.community_id`, "Expected a community UUID");
  }
  assertHex(row.id, `${target}.id`, { exactLength: 64 });
  assertHex(row.pubkey, `${target}.pubkey`, { nullable: true });
  assertHex(row.sig, `${target}.sig`, { nullable: true });
  relayIso(row.created_at, `${target}.created_at`);
  relayIso(row.received_at, `${target}.received_at`);
  if (row.deleted_at !== null) relayIso(row.deleted_at, `${target}.deleted_at`);
  if (!Number.isSafeInteger(row.kind) || row.kind < 0) {
    fail("export_row_invalid", `${target}.kind`, "Expected a non-negative event kind");
  }
  if (row.channel_id !== null && (typeof row.channel_id !== "string" || !UUID_PATTERN.test(row.channel_id))) {
    fail("export_row_invalid", `${target}.channel_id`, "Expected null or a channel UUID");
  }
  if (row.d_tag !== null && typeof row.d_tag !== "string") {
    fail("export_row_invalid", `${target}.d_tag`, "Expected null or a string d-tag");
  }
  if (row.content !== null && typeof row.content !== "string") {
    fail("export_row_invalid", `${target}.content`, "Expected null or string content");
  }
  assertNullableDecimal(row.not_before, `${target}.not_before`);
  assertNullableDecimal(row.delivered_at, `${target}.delivered_at`);
  return row;
}

export function validateAuditRow(row, target) {
  exactKeys(row, AUDIT_ROW_FIELDS, target);
  if (typeof row.community_id !== "string" || !UUID_PATTERN.test(row.community_id)) {
    fail("export_row_invalid", `${target}.community_id`, "Expected a community UUID");
  }
  if (typeof row.seq !== "string" || !/^(?:0|[1-9][0-9]{0,18})$/u.test(row.seq)) {
    fail("export_row_invalid", `${target}.seq`, "Expected a non-negative decimal sequence");
  }
  assertHex(row.hash, `${target}.hash`, { nullable: true });
  assertHex(row.prev_hash, `${target}.prev_hash`, { nullable: true });
  assertHex(row.actor_pubkey, `${target}.actor_pubkey`, { nullable: true });
  if (typeof row.action !== "string") {
    fail("export_row_invalid", `${target}.action`, "Expected a string action");
  }
  if (row.object_id !== null && typeof row.object_id !== "string") {
    fail("export_row_invalid", `${target}.object_id`, "Expected null or a string object id");
  }
  relayIso(row.created_at, `${target}.created_at`);
  return row;
}

export function validateSnapshotDocument(document, target) {
  exactKeys(document, SNAPSHOT_FIELDS, target);
  for (const field of SNAPSHOT_FIELDS) {
    if (!Array.isArray(document[field])) {
      fail("export_snapshot_invalid", `${target}.${field}`, "Expected an array of relay rows");
    }
  }
  return document;
}

async function readStagedExportFile(stagingDir, name, expectedDigest, kind) {
  const target = path.resolve(stagingDir, name);
  if (path.dirname(target) !== path.resolve(stagingDir)) {
    fail("export_file_escape", `$staging.${kind}`, "Export file escaped the staging directory");
  }
  const stat = await lstatOrNull(target);
  if (stat === null || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
    || stat.size > MAX_EXPORT_FILE_BYTES) {
    fail("export_file_invalid", `$staging.${kind}`, "Expected one bounded normal export file");
  }
  const bytes = await readFile(target);
  if (sha256Bytes(bytes) !== expectedDigest) {
    fail("export_digest_mismatch", `$staging.${kind}`, "Export file bytes differ from the exporter meta");
  }
  return bytes;
}

function parseJsonLines(bytes, kind, declaredRows) {
  const text = bytes.toString("utf8");
  if (text.length > 0 && !text.endsWith("\n")) {
    fail("export_truncated_line", `$staging.${kind}`, "Export file does not end with a complete row");
  }
  const lines = text.length === 0 ? [] : text.slice(0, -1).split("\n");
  if (lines.length !== declaredRows) {
    fail("export_row_count_mismatch", `$staging.${kind}`, "Export row count differs from the exporter meta");
  }
  return lines.map((line, index) => {
    if (line.length > MAX_ROW_BYTES) {
      fail("export_row_too_large", `$staging.${kind}[${index}]`, "Export row exceeds the row size bound");
    }
    try {
      return JSON.parse(line);
    } catch {
      fail("export_row_invalid_json", `$staging.${kind}[${index}]`, "Export row is not valid JSON");
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// Window arithmetic.
// ---------------------------------------------------------------------------

export function planWindow(cursor, policy) {
  const receivedSince = cursor.received_watermark ?? policy.initial_received_at;
  const communitySeqs = Object.values(cursor.audit_seq_max);
  return {
    received_since: receivedSince,
    deleted_since: cursor.deleted_watermark,
    // The exporter takes one lower bound for every community, so the run reads
    // from the least-advanced community's sequence and the per-community
    // filter below drops what each one has already taken into custody.
    audit_seq_min: communitySeqs.length === 0 ? 0 : Math.min(...communitySeqs) + 1,
    phase: receivedSince === null ? "initial" : "delta",
  };
}

// A watermark only ever advances to an instant the run actually observed, so a
// row that arrives with an earlier `received_at` than the wall clock can never
// be skipped. With no rows the prior watermark is kept unchanged.
export function advanceWatermark(prior, observed) {
  if (observed.length === 0) return prior;
  let best = observed[0];
  let bestMs = relayIso(best, "$watermark");
  for (const candidate of observed.slice(1)) {
    const candidateMs = relayIso(candidate, "$watermark");
    // Equal milliseconds still differ in the microsecond digits PostgreSQL
    // keeps, so the lexicographic order breaks the tie exactly as the
    // timestamp order would.
    if (candidateMs > bestMs || (candidateMs === bestMs && candidate > best)) {
      best = candidate;
      bestMs = candidateMs;
    }
  }
  if (prior === null) return best;
  const priorMs = relayIso(prior, "$watermark");
  if (bestMs > priorMs || (bestMs === priorMs && best > prior)) return best;
  return prior;
}

// ---------------------------------------------------------------------------
// Exporter observation.
// ---------------------------------------------------------------------------

function observeExporter(exporter) {
  if (exporter === null || typeof exporter !== "object"
    || typeof exporter.probeLiveness !== "function"
    || typeof exporter.export !== "function") {
    fail("exporter_invalid", "$exporter", "Expected a Buzz read exporter");
  }
  const byOperation = Object.fromEntries(BUZZ_READ_OPERATIONS.map((operation) => [operation, 0]));
  let total = 0;
  let processCalls = 0;
  const count = (operation) => {
    byOperation[operation] += 1;
    total += 1;
  };
  return {
    kind: exporter.kind,
    async probeLiveness(request) {
      count("buzz.read.liveness");
      return exporter.probeLiveness(request);
    },
    async export(request) {
      count("buzz.read.export");
      processCalls += 1;
      return exporter.export(request);
    },
    readCalls() {
      return { total, by_operation: { ...byOperation } };
    },
    processCalls() {
      return processCalls;
    },
  };
}

export async function createDefaultBuzzExporter({ binding, context }) {
  return createBuzzWslExporter({ relay: binding.relay, runtime_root: context.runtime_root });
}

// ---------------------------------------------------------------------------
// Preflight (no process, no network, no private writes).
// ---------------------------------------------------------------------------

export async function preflightBuzzCollect(options) {
  const context = await resolveLaneContext(options);
  await assertWslExecutableShape(context.binding.relay.wsl_executable);
  await assertExporterScriptShape(
    path.resolve(context.runtime_root, ...BUZZ_EXPORT_RUNTIME_RELATIVE_PATH.split("/")),
  );
  return {
    mode: "preflight",
    feature_status: "ON",
    configured_count: 1,
    succeeded_count: 1,
    failed_count: 0,
    repository_writes: 0,
    private_writes: 0,
    process_calls: 0,
    network_used: false,
    error_code_counts: [],
  };
}

// ---------------------------------------------------------------------------
// Apply.
// ---------------------------------------------------------------------------

function defaultRunId(attemptedAt) {
  return `${attemptedAt.replace(/[-:.]/gu, "")}-${process.pid}-${randomBytes(4).toString("hex")}`;
}

function emptyObjectCounts() {
  return Object.fromEntries(BUZZ_COLLECT_OBJECT_KINDS.map((kind) => [kind, { observed: 0, created: 0, unchanged: 0 }]));
}

function objectSegments(kind, objectId, hex) {
  if (typeof objectId !== "string" || !OBJECT_ID_PATTERN.test(objectId)) {
    fail("object_id_invalid", `$${kind}.id`, "Object identifiers must be safe path segments");
  }
  return [kind, objectId, `${hex}.json`];
}

async function writeCustodyObject(custodyRoot, kind, objectId, object) {
  const contentSha256 = sha256Canonical(object);
  const record = {
    schema_version: BUZZ_CUSTODY_OBJECT_SCHEMA_VERSION,
    kind,
    object_id: objectId,
    content_sha256: contentSha256,
    object,
  };
  const result = await writeCreateOnlyJson(
    custodyRoot,
    objectSegments(kind, objectId, contentSha256.slice("sha256:".length)),
    record,
  );
  return { ...result, content_sha256: contentSha256 };
}

export async function runBuzzCollect({
  exporter_factory: exporterFactory = createDefaultBuzzExporter,
  clock = { now: () => new Date() },
  run_id: injectedRunId = null,
  ...options
}) {
  if (typeof exporterFactory !== "function") {
    fail("exporter_factory_invalid", "$exporter_factory", "Expected an injected exporter factory");
  }
  const attemptedAt = clock.now().toISOString();
  const healthRoot = await guardHealthRoot(options);
  const publishError = (error) => writeBuzzCollectHealth(healthRoot, {
    attemptedAt,
    succeeded: false,
    errorCodes: [safeFailureCode(error)],
    now: clock.now,
  }).catch(() => {});

  let context;
  try {
    context = await resolveLaneContext(options);
  } catch (error) {
    await publishError(error);
    throw error;
  }
  const { binding } = context;
  let lease;
  try {
    lease = await acquireExclusiveLease({
      state_root: context.state_root,
      lease_name: BUZZ_COLLECT_LEASE_NAME,
      payload: {
        schema_version: BUZZ_COLLECT_STATE_SCHEMA_VERSION,
        binding_sha256: context.binding_sha256,
        writer_authority_id: binding.writer.authority_id,
        writer_epoch: binding.writer.epoch,
      },
    });
  } catch (error) {
    await publishError(error);
    throw error;
  }

  const runId = injectedRunId ?? defaultRunId(attemptedAt);
  const gaps = new Set(["polling_cannot_prove_hard_deletes"]);
  const objectCounts = emptyObjectCounts();
  const observedRefs = [];
  let privateWrites = 0;
  let state = null;
  let cursorBefore = initialCursor();
  let window = null;
  let observed = null;
  let communityCount = null;
  let stagingDir = null;
  let stagingRetained = false;
  let exportDigests = null;

  const recordObject = async (kind, objectId, object) => {
    const result = await writeCustodyObject(context.custody_root, kind, objectId, object);
    objectCounts[kind].observed += 1;
    if (result.created) {
      objectCounts[kind].created += 1;
      privateWrites += 1;
    } else {
      objectCounts[kind].unchanged += 1;
    }
    observedRefs.push({ kind, object_id: objectId, content_sha256: result.content_sha256 });
    return result;
  };

  try {
    const loaded = await readPrivateJson(context.state_root, ["state", "buzz-collect.json"]);
    state = loaded === null ? initialState(context) : validateBuzzCollectState(loaded, context);
    cursorBefore = structuredClone(state.cursor);
    window = planWindow(cursorBefore, binding.cursor);

    const exporter = await exporterFactory({ binding, context });
    observed = observeExporter(exporter);
    await observed.probeLiveness({ timeout_ms: Math.min(binding.cursor.timeout_ms, 30_000) });

    stagingDir = await resolveGuardedPrivatePath(context.state_root, "staging", runId);
    // Create-only: a staging directory that already exists belongs to another
    // run and is never reused or cleared.
    await mkdir(path.dirname(stagingDir), { recursive: true });
    await mkdir(stagingDir);
    stagingRetained = true;

    const meta = await observed.export({
      run_id: runId,
      staging_dir: stagingDir,
      received_since: window.received_since,
      deleted_since: window.deleted_since,
      audit_seq_min: window.audit_seq_min,
      overlap_seconds: binding.cursor.overlap_seconds,
      row_limit: binding.cursor.row_limit,
      timeout_ms: binding.cursor.timeout_ms,
    });
    communityCount = meta.community_count;
    const fileByKind = new Map(meta.files.map((entry) => [entry.kind, entry]));
    exportDigests = Object.fromEntries(
      BUZZ_EXPORT_FILE_KINDS.map((kind) => [kind, fileByKind.get(kind).sha256]),
    );

    const readRows = async (kind) => {
      const entry = fileByKind.get(kind);
      const bytes = await readStagedExportFile(stagingDir, entry.name, entry.sha256, kind);
      return parseJsonLines(bytes, kind, entry.rows);
    };

    const eventRows = (await readRows("events")).map((row, index) => (
      validateEventRow(normalizeExportValue(row, `$events[${index}]`), `$events[${index}]`)
    ));
    const tombstoneRows = (await readRows("tombstones")).map((row, index) => (
      validateEventRow(normalizeExportValue(row, `$tombstones[${index}]`), `$tombstones[${index}]`)
    ));
    const auditRows = (await readRows("audit")).map((row, index) => (
      validateAuditRow(normalizeExportValue(row, `$audit[${index}]`), `$audit[${index}]`)
    ));
    const snapshotEntry = fileByKind.get("snapshot");
    const snapshotBytes = await readStagedExportFile(
      stagingDir, snapshotEntry.name, snapshotEntry.sha256, "snapshot",
    );
    let snapshotParsed;
    try {
      snapshotParsed = JSON.parse(snapshotBytes.toString("utf8"));
    } catch {
      fail("export_row_invalid_json", "$staging.snapshot", "Snapshot export is not valid JSON");
    }
    const snapshot = validateSnapshotDocument(
      normalizeExportValue(snapshotParsed, "$snapshot"), "$snapshot",
    );

    // A run that filled its row limit has more to read; the next run resumes
    // from the watermark this one reached.
    if ([eventRows, tombstoneRows, auditRows].some((rows) => rows.length >= binding.cursor.row_limit)) {
      gaps.add("row_limit_reached");
    }

    for (const row of eventRows) {
      if (!EVENT_ID_PATTERN.test(row.id)) {
        fail("object_id_invalid", "$events.id", "Event identifiers must be 32-byte hex");
      }
      await recordObject("events", row.id, row);
    }
    for (const row of tombstoneRows) {
      await recordObject("tombstones", row.id, row);
    }

    // Audit rows are published as one immutable bundle per run, filtered to
    // the rows each community has not already had taken into custody.
    const freshAudit = auditRows.filter((row) => (
      Number(row.seq) > (cursorBefore.audit_seq_max[row.community_id] ?? -1)
    ));
    if (freshAudit.length > 0) {
      await recordObject("audit", runId, { schema_version: BUZZ_CUSTODY_OBJECT_SCHEMA_VERSION, rows: freshAudit });
    }
    await recordObject("snapshots", binding.relay.relay_key, snapshot);

    const nextReceived = advanceWatermark(
      cursorBefore.received_watermark, eventRows.map((row) => row.received_at),
    );
    const nextDeleted = advanceWatermark(
      cursorBefore.deleted_watermark, tombstoneRows.map((row) => row.deleted_at),
    );
    const nextAuditSeq = { ...cursorBefore.audit_seq_max };
    for (const row of auditRows) {
      const seq = Number(row.seq);
      if (!Number.isSafeInteger(seq)) {
        fail("export_row_invalid", "$audit.seq", "Audit sequence exceeds the safe integer range");
      }
      nextAuditSeq[row.community_id] = Math.max(nextAuditSeq[row.community_id] ?? 0, seq);
    }
    // The limit was hit and neither watermark moved: the next run would read
    // exactly the same page again, so the stall is reported rather than hidden.
    if (gaps.has("row_limit_reached")
      && nextReceived === cursorBefore.received_watermark
      && nextDeleted === cursorBefore.deleted_watermark) {
      gaps.add("export_truncated");
    }
    const cursorAfter = {
      schema_version: BUZZ_COLLECT_CURSOR_SCHEMA_VERSION,
      received_watermark: nextReceived,
      deleted_watermark: nextDeleted,
      audit_seq_max: nextAuditSeq,
      generation_seq: cursorBefore.generation_seq + 1,
    };

    const completedAt = clock.now().toISOString();
    observedRefs.sort((left, right) => `${left.kind} ${left.object_id}`.localeCompare(`${right.kind} ${right.object_id}`));
    const custodyManifestDigest = sha256Canonical(observedRefs);
    const receipt = {
      schema_version: BUZZ_COLLECT_RUN_RECEIPT_SCHEMA_VERSION,
      lane_id: binding.lane_id,
      run_id: runId,
      generation_seq: cursorAfter.generation_seq,
      mode: "apply",
      status: "ok",
      writer_authority_id: binding.writer.authority_id,
      writer_epoch: binding.writer.epoch,
      binding_sha256: context.binding_sha256,
      relay_key: binding.relay.relay_key,
      community_count: communityCount,
      started_at: attemptedAt,
      completed_at: completedAt,
      duration_ms: Date.parse(completedAt) - Date.parse(attemptedAt),
      window: {
        received_since: window.received_since,
        deleted_since: window.deleted_since,
        audit_seq_min: window.audit_seq_min,
        phase: window.phase,
      },
      cursor_before: cursorBefore,
      cursor_after: cursorAfter,
      read_calls: observed.readCalls(),
      process_calls: observed.processCalls(),
      objects: objectCounts,
      export_digests: exportDigests,
      custody_manifest_digest: custodyManifestDigest,
      coverage_gaps: [...gaps].sort(),
      error_codes: [],
      repository_writes: 0,
      // Custody objects created, the four staged export files, and the
      // receipt, lane record and state written below.
      private_writes: privateWrites + BUZZ_EXPORT_FILE_KINDS.length + 3,
      network_used: false,
    };
    validateBuzzCollectRunReceipt(receipt);
    const receiptWrite = await writeCreateOnlyJson(context.state_root, ["receipts", `${runId}.json`], receipt);
    if (!receiptWrite.created) fail("run_receipt_exists", "$receipts", "Run receipt already exists for this run id");
    const laneRecord = laneRecordFromReceipt(receipt, sha256Canonical(receipt));
    await writeCreateOnlyJson(context.state_root, ["receipts", `${runId}.lane_record.json`], laneRecord);
    const nextState = {
      ...state,
      cursor: cursorAfter,
      last_run_id: runId,
      last_completed_at: completedAt,
    };
    await atomicWritePrivateJson(context.state_root, ["state", "buzz-collect.json"], nextState);
    // Only a fully published run releases its staging directory; a failed run
    // keeps it for inspection.
    await rm(stagingDir, { recursive: true, force: true });
    stagingRetained = false;
    const created = BUZZ_COLLECT_OBJECT_KINDS.reduce((total, kind) => total + objectCounts[kind].created, 0);
    await writeBuzzCollectHealth(context.state_root, {
      attemptedAt,
      succeeded: true,
      runId,
      receivedWatermark: cursorAfter.received_watermark,
      deletedWatermark: cursorAfter.deleted_watermark,
      objectsCreated: created,
      coverageGaps: receipt.coverage_gaps,
      now: clock.now,
    });
    return {
      mode: "apply",
      feature_status: "ON",
      status: "ok",
      run_id: runId,
      generation_seq: cursorAfter.generation_seq,
      window_phase: window.phase,
      read_calls: receipt.read_calls.total,
      process_calls: receipt.process_calls,
      objects: objectCounts,
      objects_created: created,
      coverage_gaps: receipt.coverage_gaps,
      error_code_counts: [],
      repository_writes: 0,
      private_writes: receipt.private_writes + 1,
      network_used: false,
      staging_retained: false,
      lane_record: laneRecord,
    };
  } catch (error) {
    await publishError(error);
    if (window !== null && observed !== null) {
      await writeErrorReceipt({
        context, runId, attemptedAt, clock, window, cursorBefore, observed, objectCounts, observedRefs,
        communityCount, exportDigests, gaps, privateWrites, error,
      }).catch(() => {});
    }
    throw error;
  } finally {
    if (stagingRetained) {
      // Deliberately left on disk: the staged export is the only evidence of
      // what the failed run actually read.
    }
    await lease.release();
  }
}

const ZERO_DIGEST = `sha256:${"0".repeat(64)}`;

async function writeErrorReceipt({
  context, runId, attemptedAt, clock, window, cursorBefore, observed, objectCounts, observedRefs,
  communityCount, exportDigests, gaps, privateWrites, error,
}) {
  const completedAt = clock.now().toISOString();
  const sortedRefs = [...observedRefs].sort((left, right) => `${left.kind} ${left.object_id}`.localeCompare(`${right.kind} ${right.object_id}`));
  const receipt = {
    schema_version: BUZZ_COLLECT_RUN_RECEIPT_SCHEMA_VERSION,
    lane_id: context.binding.lane_id,
    run_id: runId,
    generation_seq: cursorBefore.generation_seq,
    mode: "apply",
    status: "error",
    writer_authority_id: context.binding.writer.authority_id,
    writer_epoch: context.binding.writer.epoch,
    binding_sha256: context.binding_sha256,
    relay_key: context.binding.relay.relay_key,
    community_count: communityCount,
    started_at: attemptedAt,
    completed_at: completedAt,
    duration_ms: Date.parse(completedAt) - Date.parse(attemptedAt),
    window: {
      received_since: window.received_since,
      deleted_since: window.deleted_since,
      audit_seq_min: window.audit_seq_min,
      phase: window.phase,
    },
    cursor_before: cursorBefore,
    cursor_after: cursorBefore,
    read_calls: observed.readCalls(),
    process_calls: observed.processCalls(),
    objects: objectCounts,
    // A run that failed before or during the export has no digests to report;
    // the all-zero digest states that plainly instead of omitting the field.
    export_digests: exportDigests ?? Object.fromEntries(
      BUZZ_EXPORT_FILE_KINDS.map((kind) => [kind, ZERO_DIGEST]),
    ),
    custody_manifest_digest: sha256Canonical(sortedRefs),
    coverage_gaps: [...gaps].sort(),
    error_codes: [safeFailureCode(error)],
    repository_writes: 0,
    private_writes: privateWrites + 1,
    network_used: false,
  };
  validateBuzzCollectRunReceipt(receipt);
  await writeCreateOnlyJson(context.state_root, ["receipts", `${runId}.json`], receipt);
}

// Nine-key refs-only capture_generation record (plan-17 source-lane shape).
// The path_registry Buzz adapter derives the same record from the persisted
// receipt; the lane test pins both derivations equal.
export function laneRecordFromReceipt(receipt, receiptDigest) {
  assertDigest(receiptDigest, "$receipt_digest");
  return {
    record_kind: "capture_generation",
    source_ref: BUZZ_SOURCE_REF,
    generation_seq: receipt.generation_seq,
    capture_ref: `receipt.buzz.run.${receiptDigest.slice("sha256:".length)}`,
    manifest_ref: `receipt.buzz.custody.${receipt.custody_manifest_digest.slice("sha256:".length)}`,
    item_count: observedObjectTotal(receipt),
    content_digest: receipt.custody_manifest_digest,
    captured_at: receipt.completed_at,
    immutable: true,
  };
}
