// Linear read-only collection runner (HPP source lane, every 15 minutes).
//
// Mirrors the Slack batch lane's operating pattern: one SHA-256-pinned private
// binding, exact repository/runtime forbidden roots, writer authority/epoch
// fencing, a fail-closed lease, refs-only receipts, and immutable create-only
// custody. Two deliberate differences from the Slack lane:
//   1. the health receipt is written BEFORE any fail-closed rejection returns
//      (the Slack lane only reaches its health lane after the binding context
//      resolves, so a broken binding exits 1 silently);
//   2. delta capture is a bounded `updatedAt` window with a small overlap and
//      an explicit backfill continuation instead of a provider page cursor.
// Collection is not backup: nothing here creates a backup generation, restore
// test, or acceptance record. The lane never sends a GraphQL mutation.

import { createHash, randomBytes } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import path from "node:path";

import { sha256Canonical } from "../shared/project_history_envelope.mjs";

import {
  LINEAR_COLLECT_CURSOR_SCHEMA_VERSION,
  LINEAR_COLLECT_OBJECT_KINDS,
  LINEAR_COLLECT_RUN_RECEIPT_SCHEMA_VERSION,
  observedObjectTotal,
  validateLinearCollectCursor,
  validateLinearCollectRunReceipt,
} from "./linear_collect_receipt.mjs";
import {
  acquireExclusiveLease,
  assertNoReparseComponents,
  atomicWritePrivateJson,
  lstatOrNull,
  readPrivateJson,
  sha256Bytes,
  writeCreateOnlyJson,
} from "./linear_custody.mjs";
import {
  LINEAR_CATALOG_KINDS,
  LINEAR_READ_OPERATIONS,
  assertApiKeyFileShape,
  createLinearGraphqlTransport,
  loadLinearApiKey,
  operationForCatalogKind,
} from "./linear_graphql_client.mjs";

export const LINEAR_COLLECT_BINDING_SCHEMA_VERSION = "soulforge.linear_collect.binding.v1";
export const LINEAR_COLLECT_STATE_SCHEMA_VERSION = "soulforge.linear_collect.state.v1";
export const LINEAR_COLLECT_HEALTH_SCHEMA_VERSION = "soulforge.linear_collect.health.v1";
export const LINEAR_CUSTODY_OBJECT_SCHEMA_VERSION = "soulforge.linear_collect.custody_object.v1";
export const LINEAR_READ_EVIDENCE_SCHEMA_VERSION = "soulforge.linear.official_task_read_evidence.v0";
export const LINEAR_READ_EVIDENCE_ENVELOPE_SCHEMA_VERSION = "soulforge.linear_collect.read_evidence_envelope.v1";
export const LINEAR_COLLECT_LEASE_NAME = "linear-collect.lock";
export const LINEAR_SOURCE_REF = "source.linear";
export const LINEAR_COLLECT_HEALTH_LANE = "linear_collect";
// In-process run deadline. The registrar's Scheduled Task ExecutionTimeLimit
// is PT10M; the lane stops opening new pages well before that so the receipt,
// cursor, state, health, and lease release always complete inside the task
// limit instead of being killed mid-write. The optional binding key
// `cursor.run_deadline_ms` may narrow or widen it, bounded so the deadline
// plus one request timeout (<= 60 s) stays below the task limit.
export const LINEAR_COLLECT_DEFAULT_RUN_DEADLINE_MS = 8 * 60 * 1000;
export const LINEAR_COLLECT_MAX_RUN_DEADLINE_MS = 9 * 60 * 1000;

const BINDING_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "lane_id",
  "private_root",
  "data_root",
  "state_root",
  "forbidden_roots",
  "writer",
  "credentials",
  "workspace",
  "cursor",
]);
const WRITER_FIELDS = Object.freeze(["authority_id", "epoch"]);
const CREDENTIAL_FIELDS = Object.freeze(["api_key_env", "api_key_file"]);
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/u;
const WORKSPACE_FIELDS = Object.freeze(["url_key", "organization_id", "project_scope_map"]);
const PROJECT_SCOPE_FIELDS = Object.freeze(["linear_project_id", "project_scope_ref"]);
const CURSOR_POLICY_FIELDS = Object.freeze([
  "overlap_seconds",
  "initial_updated_at",
  "page_size",
  "max_pages_per_run",
  "timeout_ms",
]);
const CURSOR_POLICY_OPTIONAL_FIELDS = Object.freeze(["run_deadline_ms"]);
const STATE_FIELDS = Object.freeze([
  "schema_version",
  "lane_id",
  "identity_digest",
  "writer_authority_id",
  "writer_epoch",
  "cursor",
  "object_index",
  "last_run_id",
  "last_completed_at",
]);

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const URL_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ADMISSION_SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const OBJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const TOKEN_VALUE_PATTERN = /^(?:lin_(?:api|oauth)_|(?:xox[abprs]|xapp)-|eyJ[A-Za-z0-9_-]{8,}\.)/u;
const SECRET_FIELD_PATTERN = /(?:access_token|client_secret|password|token_value|credential_value|api_key_value)/iu;

// Exact replica of guild_hall/agent_observation/guard_primitives.mjs digestOf:
// the read-evidence digest must equal what the Forge/ERP admission seam
// recomputes, and the lane test pins the two implementations equal without
// making this source lane depend on the product-owned observation module.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function readEvidenceDigest(value) {
  return `sha256:${createHash("sha256").update(stableStringify(value), "utf8").digest("hex")}`;
}

export class LinearCollectError extends Error {
  constructor(code, target, message) {
    super(`${code} at ${target}: ${message}`);
    this.name = "LinearCollectError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target, message) {
  throw new LinearCollectError(code, target, message);
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
  if (typeof value !== "string" || !ISO_PATTERN.test(value) || new Date(value).toISOString() !== value) {
    fail("clock_invalid", target, "Expected a canonical UTC millisecond timestamp");
  }
  return value;
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
  return path.resolve(binding.data_root, binding.workspace.url_key);
}

export function validateLinearCollectBinding(binding) {
  exactKeys(binding, BINDING_FIELDS, "$binding");
  if (binding.schema_version !== LINEAR_COLLECT_BINDING_SCHEMA_VERSION) {
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
  exactKeys(binding.workspace, WORKSPACE_FIELDS, "$binding.workspace");
  if (typeof binding.workspace.url_key !== "string" || !URL_KEY_PATTERN.test(binding.workspace.url_key)) {
    fail("workspace_url_key_invalid", "$binding.workspace.url_key", "Expected the exact Linear workspace URL key");
  }
  if (binding.workspace.organization_id !== null
    && (typeof binding.workspace.organization_id !== "string"
      || !UUID_PATTERN.test(binding.workspace.organization_id))) {
    fail("workspace_organization_id_invalid", "$binding.workspace.organization_id", "Expected null or a UUID");
  }
  const scopeMap = binding.workspace.project_scope_map;
  if (!Array.isArray(scopeMap) || Object.keys(scopeMap).length !== scopeMap.length || scopeMap.length > 256) {
    fail("project_scope_map_invalid", "$binding.workspace.project_scope_map", "Expected a dense bounded list");
  }
  let previousProjectId = null;
  scopeMap.forEach((entry, index) => {
    const target = `$binding.workspace.project_scope_map[${index}]`;
    exactKeys(entry, PROJECT_SCOPE_FIELDS, target);
    if (typeof entry.linear_project_id !== "string" || !UUID_PATTERN.test(entry.linear_project_id)) {
      fail("project_scope_map_invalid", `${target}.linear_project_id`, "Expected a Linear project UUID");
    }
    if (typeof entry.project_scope_ref !== "string" || !ADMISSION_SAFE_ID.test(entry.project_scope_ref)
      || entry.project_scope_ref.startsWith("hold:")) {
      fail("project_scope_map_invalid", `${target}.project_scope_ref`, "Expected an admission-safe project scope ref");
    }
    if (previousProjectId !== null && previousProjectId.localeCompare(entry.linear_project_id) >= 0) {
      fail("project_scope_map_not_canonical", target, "Project scope entries must be unique and sorted");
    }
    previousProjectId = entry.linear_project_id;
  });
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
  if (binding.cursor.initial_updated_at !== null) {
    assertIso(binding.cursor.initial_updated_at, "$binding.cursor.initial_updated_at");
  }
  boundedInteger(binding.cursor.page_size, 1, 100, "$binding.cursor.page_size");
  boundedInteger(binding.cursor.max_pages_per_run, 1, 200, "$binding.cursor.max_pages_per_run");
  boundedInteger(binding.cursor.timeout_ms, 100, 60_000, "$binding.cursor.timeout_ms");
  if (Object.hasOwn(binding.cursor, "run_deadline_ms")) {
    boundedInteger(
      binding.cursor.run_deadline_ms,
      1_000,
      LINEAR_COLLECT_MAX_RUN_DEADLINE_MS,
      "$binding.cursor.run_deadline_ms",
    );
  }
  absolutePath(binding.data_root, "$binding.data_root");
  if (!isPathWithin(binding.private_root, binding.data_root, true)) {
    fail("data_root_not_strict_private_child", "$binding.data_root", "Data root must be a strict child of the private root");
  }
  if (pathsOverlap(binding.data_root, binding.state_root)) {
    fail("data_root_state_overlap", "$binding.state_root", "State root must be disjoint from the Linear data root");
  }
  if (binding.forbidden_roots.some((root) => pathsOverlap(root, binding.data_root))) {
    fail("data_root_forbidden_overlap", "$binding.data_root", "Data root must be disjoint from every forbidden root");
  }
  exactKeys(binding.credentials, CREDENTIAL_FIELDS, "$binding.credentials");
  if (binding.credentials.api_key_env !== null
    && (typeof binding.credentials.api_key_env !== "string"
      || !ENV_NAME_PATTERN.test(binding.credentials.api_key_env))) {
    fail("credential_env_name_invalid", "$binding.credentials.api_key_env", "Expected null or an environment variable name");
  }
  const credentialFile = absolutePath(binding.credentials.api_key_file, "$binding.credentials.api_key_file");
  if (!isPathWithin(binding.private_root, credentialFile, true)) {
    fail("credential_file_not_strict_private_child", "$binding.credentials.api_key_file", "Credential files must be strict children of the declared private owner root");
  }
  if (pathsOverlap(binding.data_root, credentialFile)) {
    fail("credential_file_data_root_overlap", "$binding.credentials.api_key_file", "Credential files must be disjoint from Linear custody");
  }
  if (binding.forbidden_roots.some((root) => pathsOverlap(root, credentialFile))) {
    fail("credential_file_forbidden_overlap", "$binding.credentials.api_key_file", "Credential files must be disjoint from every forbidden public/runtime root");
  }
  if (pathsOverlap(binding.state_root, credentialFile)) {
    fail("credential_file_state_overlap", "$binding.credentials.api_key_file", "Credential files must be disjoint from lane state");
  }
  assertNoEmbeddedSecret(binding, "$binding");
  return binding;
}

// Effective in-process deadline for one run, from the validated cursor policy.
export function runDeadlineMsFor(policy) {
  return Object.hasOwn(policy, "run_deadline_ms")
    ? policy.run_deadline_ms
    : LINEAR_COLLECT_DEFAULT_RUN_DEADLINE_MS;
}

export function identityDigestForBinding(binding) {
  return sha256Canonical({
    lane_id: binding.lane_id,
    url_key: binding.workspace.url_key,
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
    value = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
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
  const binding = validateLinearCollectBinding(provisional.value);
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
  if (pathsOverlap(binding.credentials.api_key_file, provisional.path)) {
    fail("binding_credential_overlap", "$binding.credentials.api_key_file", "Binding and credential files must be disjoint");
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

function credentialBoundary(context) {
  return {
    private_root: context.private_root,
    data_root: context.data_root,
    forbidden_roots: context.binding.forbidden_roots,
  };
}

// ---------------------------------------------------------------------------
// Health receipt (written first, before any rejection).
// ---------------------------------------------------------------------------

function safeFailureCode(error) {
  const candidate = String(error?.code ?? "");
  return /^[a-z][a-z0-9_]{0,95}$/u.test(candidate) ? candidate : "unknown_failure";
}

export async function writeLinearCollectHealth(stateRoot, {
  attemptedAt,
  succeeded,
  errorCodes = [],
  runId = null,
  watermark = null,
  backfillPending = null,
  objectsCreated = null,
  coverageGaps = null,
  now = () => new Date(),
}) {
  const prior = await readPrivateJson(stateRoot, ["health", "linear_collect.json"]).catch(() => null);
  const priorValid = prior?.schema_version === LINEAR_COLLECT_HEALTH_SCHEMA_VERSION;
  const priorLastSuccess = priorValid
    && typeof prior.last_success_at === "string" && Number.isFinite(Date.parse(prior.last_success_at))
    ? prior.last_success_at : null;
  const completedAt = now().toISOString();
  const record = {
    schema_version: LINEAR_COLLECT_HEALTH_SCHEMA_VERSION,
    lane: LINEAR_COLLECT_HEALTH_LANE,
    status: succeeded ? "ok" : "error",
    attempted_at: attemptedAt,
    completed_at: completedAt,
    last_success_at: succeeded ? completedAt : priorLastSuccess,
    error_codes: succeeded ? [] : [...new Set(errorCodes.filter((code) => /^[a-z][a-z0-9_]{0,127}$/u.test(code)))].sort(),
    last_run_id: runId ?? (priorValid && typeof prior.last_run_id === "string" ? prior.last_run_id : null),
    cursor_watermark: succeeded ? watermark
      : (priorValid && typeof prior.cursor_watermark === "string" ? prior.cursor_watermark : null),
    backfill_pending: succeeded ? backfillPending
      : (priorValid && typeof prior.backfill_pending === "boolean" ? prior.backfill_pending : null),
    objects_created: succeeded ? objectsCreated : null,
    // Sorted coverage gaps of the last successful run (`run_deadline_reached`,
    // `max_pages_continuation_pending`, ...), kept across a failed run like
    // the watermark so an operator sees why a backfill is still pending.
    coverage_gaps: succeeded ? coverageGaps
      : (priorValid && Array.isArray(prior.coverage_gaps) ? prior.coverage_gaps : null),
  };
  await atomicWritePrivateJson(stateRoot, ["health", "linear_collect.json"], record);
  return record;
}

// ---------------------------------------------------------------------------
// State.
// ---------------------------------------------------------------------------

function initialCursor() {
  return {
    schema_version: LINEAR_COLLECT_CURSOR_SCHEMA_VERSION,
    watermark: null,
    backfill: null,
    generation_seq: 0,
  };
}

function initialState(context) {
  return {
    schema_version: LINEAR_COLLECT_STATE_SCHEMA_VERSION,
    lane_id: context.binding.lane_id,
    identity_digest: context.identity_digest,
    writer_authority_id: context.binding.writer.authority_id,
    writer_epoch: context.binding.writer.epoch,
    cursor: initialCursor(),
    object_index: {},
    last_run_id: null,
    last_completed_at: null,
  };
}

export function validateLinearCollectState(state, context) {
  exactKeys(state, STATE_FIELDS, "$state");
  if (state.schema_version !== LINEAR_COLLECT_STATE_SCHEMA_VERSION) {
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
    validateLinearCollectCursor(state.cursor, "$state.cursor");
  } catch (error) {
    fail(safeFailureCode(error), "$state.cursor", "Persisted cursor is invalid");
  }
  plainRecord(state.object_index, "$state.object_index");
  for (const [key, entry] of Object.entries(state.object_index)) {
    if (!/^[a-z_]+:[A-Za-z0-9._-]{1,128}$/u.test(key)) fail("state_object_index_invalid", "$state.object_index", "Invalid index key");
    exactKeys(entry, ["content_sha256", "updated_at"], `$state.object_index.${key}`);
    assertDigest(entry.content_sha256, `$state.object_index.${key}.content_sha256`);
    if (entry.updated_at !== null) assertIso(entry.updated_at, `$state.object_index.${key}.updated_at`);
  }
  if (state.last_run_id !== null && typeof state.last_run_id !== "string") {
    fail("state_run_id_invalid", "$state.last_run_id", "Expected null or a run id");
  }
  if (state.last_completed_at !== null) assertIso(state.last_completed_at, "$state.last_completed_at");
  return state;
}

// ---------------------------------------------------------------------------
// Custody objects and read evidence.
// ---------------------------------------------------------------------------

function objectSegments(kind, objectId, hex) {
  if (typeof objectId !== "string" || !OBJECT_ID_PATTERN.test(objectId)) {
    fail("object_id_invalid", `$${kind}.id`, "Object identifiers must be safe path segments");
  }
  return [kind, objectId, `${hex}.json`];
}

async function writeCustodyObject(custodyRoot, kind, objectId, object) {
  const contentSha256 = sha256Canonical(object);
  const record = {
    schema_version: LINEAR_CUSTODY_OBJECT_SCHEMA_VERSION,
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

function normalizeTaskStatus(stateName) {
  const compact = String(stateName ?? "").replace(/[^A-Za-z0-9_.:-]/gu, "");
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u.test(compact) ? compact : "Unknown";
}

export function projectScopeRefFor(binding, projectId) {
  if (projectId === null) return "linear.project:unassigned";
  const mapped = binding.workspace.project_scope_map.find((entry) => entry.linear_project_id === projectId);
  return mapped ? mapped.project_scope_ref : `linear.project:${projectId}`;
}

export function readEvidenceRecordForIssue(binding, issue) {
  const identifier = String(issue.identifier);
  if (!ADMISSION_SAFE_ID.test(identifier)) {
    fail("issue_identifier_unsafe", "$issue.identifier", "Issue identifier is not an admission-safe id");
  }
  const contentSha256 = sha256Canonical(issue);
  const shortHex = contentSha256.slice("sha256:".length, "sha256:".length + 16);
  const lowered = identifier.toLowerCase();
  const readReceiptRef = `receipt:linear-read:${lowered}:${shortHex}`;
  const body = {
    schema_version: LINEAR_READ_EVIDENCE_SCHEMA_VERSION,
    evidence_state: "current",
    provider: "linear",
    task_id: identifier,
    forge_task_ref: `linear.task:${lowered}`,
    task_status: normalizeTaskStatus(issue.state_name),
    project_scope_ref: projectScopeRefFor(binding, issue.project_id),
    read_receipt_ref: readReceiptRef,
    source_receipt_refs: [readReceiptRef, `receipt:linear-issue-snapshot:${shortHex}`].sort(),
  };
  return {
    envelope: {
      schema_version: LINEAR_READ_EVIDENCE_ENVELOPE_SCHEMA_VERSION,
      issue_id: issue.id,
      issue_identifier: identifier,
      issue_updated_at: issue.updated_at,
      issue_content_sha256: contentSha256,
      evidence: { ...body, read_receipt_digest: readEvidenceDigest(body) },
    },
    content_sha256: contentSha256,
  };
}

// ---------------------------------------------------------------------------
// Window arithmetic.
// ---------------------------------------------------------------------------

function isoAt(milliseconds) {
  return new Date(Math.max(0, milliseconds)).toISOString();
}

export function planWindow(cursor, policy, attemptedAt) {
  if (cursor.backfill !== null) {
    return {
      lower: cursor.backfill.lower,
      upper: cursor.backfill.upper,
      phase: "backfill",
      resume_watermark: cursor.backfill.resume_watermark,
    };
  }
  const lowerMs = cursor.watermark !== null
    ? Date.parse(cursor.watermark) - policy.overlap_seconds * 1000
    : (policy.initial_updated_at !== null ? Date.parse(policy.initial_updated_at) : 0);
  const window = { lower: isoAt(lowerMs), upper: attemptedAt, phase: "delta", resume_watermark: attemptedAt };
  if (Date.parse(window.lower) > Date.parse(window.upper)) {
    fail("window_invalid", "$cursor", "Delta window lower bound is after its upper bound");
  }
  return window;
}

export function observeOrder(timestamps) {
  if (timestamps.length < 2) return "unknown";
  let decreasing = false;
  let increasing = false;
  for (let index = 1; index < timestamps.length; index += 1) {
    const previous = Date.parse(timestamps[index - 1]);
    const current = Date.parse(timestamps[index]);
    if (current < previous) decreasing = true;
    if (current > previous) increasing = true;
  }
  if (decreasing && !increasing) return "descending";
  if (increasing && !decreasing) return "ascending";
  return "unknown";
}

function combineOrders(orders) {
  const known = [...new Set(orders.filter((order) => order !== "unknown"))];
  if (known.length === 1) return known[0];
  return "unknown";
}

export function advanceCursor({ cursor, window, collections, gaps }) {
  const capped = collections.filter((entry) => entry.capped);
  const nextGeneration = cursor.generation_seq + 1;
  if (capped.length === 0) {
    return {
      cursor: {
        schema_version: LINEAR_COLLECT_CURSOR_SCHEMA_VERSION,
        watermark: window.resume_watermark,
        backfill: null,
        generation_seq: nextGeneration,
      },
      order_observed: combineOrders(collections.map((entry) => entry.order)),
    };
  }
  gaps.add("max_pages_continuation_pending");
  const order = combineOrders(capped.map((entry) => entry.order));
  let remaining = { lower: window.lower, upper: window.upper };
  if (order === "descending") {
    const boundary = Math.max(...capped.map((entry) => Math.min(...entry.timestamps.map((value) => Date.parse(value)))));
    remaining = { lower: window.lower, upper: isoAt(Math.min(boundary, Date.parse(window.upper))) };
  } else if (order === "ascending") {
    const boundary = Math.min(...capped.map((entry) => Math.max(...entry.timestamps.map((value) => Date.parse(value)))));
    remaining = { lower: isoAt(Math.max(boundary, Date.parse(window.lower))), upper: window.upper };
  }
  const stalled = remaining.lower === window.lower && remaining.upper === window.upper;
  const priorStalls = cursor.backfill?.stall_count ?? 0;
  // A cap forced by the run deadline read fewer pages than the policy allows,
  // so it is not evidence that the window cannot narrow: it neither counts as
  // a stall nor resets one. Only a max-pages cap that could not narrow does.
  const deadlineCapped = capped.some((entry) => entry.deadline === true);
  const stallCount = stalled ? (deadlineCapped ? priorStalls : priorStalls + 1) : 0;
  if (stallCount >= 2) {
    gaps.add("backfill_stalled_window_advanced");
    return {
      cursor: {
        schema_version: LINEAR_COLLECT_CURSOR_SCHEMA_VERSION,
        watermark: window.resume_watermark,
        backfill: null,
        generation_seq: nextGeneration,
      },
      order_observed: order,
    };
  }
  return {
    cursor: {
      schema_version: LINEAR_COLLECT_CURSOR_SCHEMA_VERSION,
      watermark: cursor.watermark,
      backfill: {
        lower: remaining.lower,
        upper: remaining.upper,
        resume_watermark: window.resume_watermark,
        stall_count: stallCount,
      },
      generation_seq: nextGeneration,
    },
    order_observed: order,
  };
}

// ---------------------------------------------------------------------------
// Transport observation.
// ---------------------------------------------------------------------------

function observeTransport(transport) {
  if (transport === null || typeof transport !== "object"
    || typeof transport.readWorkspace !== "function"
    || typeof transport.readCatalogPage !== "function"
    || typeof transport.readIssuesPage !== "function"
    || typeof transport.readCommentsPage !== "function") {
    fail("transport_invalid", "$transport", "Expected a Linear read transport");
  }
  const byOperation = Object.fromEntries(LINEAR_READ_OPERATIONS.map((operation) => [operation, 0]));
  let total = 0;
  const count = (operation) => {
    if (!(operation in byOperation)) fail("read_operation_unknown", "$transport", "Unknown read operation");
    byOperation[operation] += 1;
    total += 1;
  };
  return {
    kind: transport.kind,
    async readWorkspace() {
      count("linear.read.viewer_organization");
      return transport.readWorkspace();
    },
    async readCatalogPage(kind, after) {
      count(operationForCatalogKind(kind));
      return transport.readCatalogPage(kind, after);
    },
    async readIssuesPage(request) {
      count("linear.read.issues_window");
      return transport.readIssuesPage(request);
    },
    async readCommentsPage(request) {
      count("linear.read.comments_window");
      return transport.readCommentsPage(request);
    },
    readCalls() {
      return { total, by_operation: { ...byOperation } };
    },
  };
}

export async function createDefaultLinearTransport({ binding, context }) {
  const apiKey = await loadLinearApiKey(binding.credentials, process.env, credentialBoundary(context));
  return createLinearGraphqlTransport({
    api_key: apiKey,
    timeout_ms: binding.cursor.timeout_ms,
    page_size: binding.cursor.page_size,
  });
}

// ---------------------------------------------------------------------------
// Preflight (no network, no private writes).
// ---------------------------------------------------------------------------

export async function preflightLinearCollect(options) {
  const context = await resolveLaneContext(options);
  await assertApiKeyFileShape(context.binding.credentials.api_key_file, credentialBoundary(context));
  return {
    mode: "preflight",
    feature_status: "ON",
    configured_count: 1,
    succeeded_count: 1,
    failed_count: 0,
    repository_writes: 0,
    private_writes: 0,
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
  return Object.fromEntries(LINEAR_COLLECT_OBJECT_KINDS.map((kind) => [kind, { observed: 0, created: 0, unchanged: 0 }]));
}

// Reads one collection page by page. The run is capped either by the policy's
// max_pages_per_run or, checked before every page is opened, by the run
// deadline; `deadline: true` tells the caller which one so the receipt can
// carry `run_deadline_reached` and the cursor can keep the backfill window.
async function collectPages({
  policy,
  readPage,
  onNode,
  timestamps,
  deadlineReached = () => false,
}) {
  const seenCursors = new Set();
  let after = null;
  let pages = 0;
  while (true) {
    if (pages >= policy.max_pages_per_run) return { capped: true, deadline: false, pages };
    if (deadlineReached()) return { capped: true, deadline: true, pages };
    const page = await readPage(after);
    pages += 1;
    if (!Array.isArray(page?.nodes)) fail("transport_page_invalid", "$transport", "Transport page nodes must be an array");
    for (const node of page.nodes) {
      timestamps.push(node.updated_at);
      await onNode(node);
    }
    if (page.has_next_page !== true) return { capped: false, deadline: false, pages };
    if (typeof page.end_cursor !== "string" || seenCursors.has(page.end_cursor)) {
      fail("provider_cursor_loop", "$transport", "Provider continuation cursor repeated or missing");
    }
    seenCursors.add(page.end_cursor);
    after = page.end_cursor;
  }
}

export async function runLinearCollect({
  transport_factory: transportFactory = createDefaultLinearTransport,
  clock = { now: () => new Date() },
  run_id: injectedRunId = null,
  ...options
}) {
  if (typeof transportFactory !== "function") {
    fail("transport_factory_invalid", "$transport_factory", "Expected an injected transport factory");
  }
  const attemptedAt = clock.now().toISOString();
  const healthRoot = await guardHealthRoot(options);
  const publishError = (error) => writeLinearCollectHealth(healthRoot, {
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
      lease_name: LINEAR_COLLECT_LEASE_NAME,
      payload: {
        schema_version: LINEAR_COLLECT_STATE_SCHEMA_VERSION,
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
  const objectIndex = {};
  let privateWrites = 0;
  let state = null;
  let cursorBefore = initialCursor();
  let window = null;
  let observed = null;
  let organizationId = null;

  const recordObject = async (kind, objectId, object, updatedAt) => {
    const result = await writeCustodyObject(context.custody_root, kind, objectId, object);
    objectCounts[kind].observed += 1;
    if (result.created) {
      objectCounts[kind].created += 1;
      privateWrites += 1;
    } else {
      objectCounts[kind].unchanged += 1;
    }
    observedRefs.push({ kind, object_id: objectId, content_sha256: result.content_sha256 });
    objectIndex[`${kind}:${objectId}`] = { content_sha256: result.content_sha256, updated_at: updatedAt };
    return result;
  };

  try {
    const loaded = await readPrivateJson(context.state_root, ["state", "linear-collect.json"]);
    state = loaded === null ? initialState(context) : validateLinearCollectState(loaded, context);
    cursorBefore = structuredClone(state.cursor);
    window = planWindow(cursorBefore, binding.cursor, attemptedAt);
    const deadlineAt = Date.parse(attemptedAt) + runDeadlineMsFor(binding.cursor);
    const deadlineReached = () => clock.now().getTime() >= deadlineAt;

    const transport = await transportFactory({ binding, context });
    observed = observeTransport(transport);

    const workspace = await observed.readWorkspace();
    if (workspace.organization.url_key !== binding.workspace.url_key
      || (binding.workspace.organization_id !== null
        && workspace.organization.id !== binding.workspace.organization_id)) {
      fail("workspace_mismatch", "$binding.workspace", "Credential is not bound to the configured Linear workspace");
    }
    organizationId = workspace.organization.id;
    await recordObject("workspace", workspace.organization.id, workspace, workspace.organization.updated_at);

    for (const kind of LINEAR_CATALOG_KINDS) {
      const result = await collectPages({
        policy: binding.cursor,
        readPage: (after) => observed.readCatalogPage(kind, after),
        onNode: (node) => recordObject(kind, node.id, node, node.updated_at),
        timestamps: [],
        deadlineReached,
      });
      if (result.capped) gaps.add("catalog_continuation_pending");
      if (result.deadline) gaps.add("run_deadline_reached");
    }

    const collections = [];
    const issueTimestamps = [];
    const issues = await collectPages({
      policy: binding.cursor,
      readPage: (after) => observed.readIssuesPage({ lower: window.lower, upper: window.upper, after }),
      onNode: async (issue) => {
        await recordObject("issues", issue.id, issue, issue.updated_at);
        const evidence = readEvidenceRecordForIssue(binding, issue);
        await recordObject("read_evidence", issue.id, evidence.envelope, issue.updated_at);
      },
      timestamps: issueTimestamps,
      deadlineReached,
    });
    if (issues.deadline) gaps.add("run_deadline_reached");
    collections.push({
      capped: issues.capped, deadline: issues.deadline, timestamps: issueTimestamps, order: observeOrder(issueTimestamps),
    });
    const commentTimestamps = [];
    const comments = await collectPages({
      policy: binding.cursor,
      readPage: (after) => observed.readCommentsPage({ lower: window.lower, upper: window.upper, after }),
      onNode: (comment) => recordObject("comments", comment.id, comment, comment.updated_at),
      timestamps: commentTimestamps,
      deadlineReached,
    });
    if (comments.deadline) gaps.add("run_deadline_reached");
    collections.push({
      capped: comments.capped, deadline: comments.deadline, timestamps: commentTimestamps, order: observeOrder(commentTimestamps),
    });

    const advanced = advanceCursor({ cursor: cursorBefore, window, collections, gaps });
    const completedAt = clock.now().toISOString();
    observedRefs.sort((left, right) => `${left.kind} ${left.object_id}`.localeCompare(`${right.kind} ${right.object_id}`));
    const custodyManifestDigest = sha256Canonical(observedRefs);
    const receipt = {
      schema_version: LINEAR_COLLECT_RUN_RECEIPT_SCHEMA_VERSION,
      lane_id: binding.lane_id,
      run_id: runId,
      generation_seq: advanced.cursor.generation_seq,
      mode: "apply",
      status: "ok",
      writer_authority_id: binding.writer.authority_id,
      writer_epoch: binding.writer.epoch,
      binding_sha256: context.binding_sha256,
      workspace_url_key: binding.workspace.url_key,
      organization_id: organizationId,
      started_at: attemptedAt,
      completed_at: completedAt,
      duration_ms: Date.parse(completedAt) - Date.parse(attemptedAt),
      window: {
        lower: window.lower,
        upper: window.upper,
        phase: window.phase,
        order_observed: advanced.order_observed,
      },
      cursor_before: cursorBefore,
      cursor_after: advanced.cursor,
      read_calls: observed.readCalls(),
      objects: objectCounts,
      custody_manifest_digest: custodyManifestDigest,
      coverage_gaps: [...gaps].sort(),
      error_codes: [],
      repository_writes: 0,
      private_writes: privateWrites + 3,
      network_used: transport.kind === "graphql",
    };
    validateLinearCollectRunReceipt(receipt);
    const receiptWrite = await writeCreateOnlyJson(context.state_root, ["receipts", `${runId}.json`], receipt);
    if (!receiptWrite.created) fail("run_receipt_exists", "$receipts", "Run receipt already exists for this run id");
    const laneRecord = laneRecordFromReceipt(receipt, sha256Canonical(receipt));
    await writeCreateOnlyJson(context.state_root, ["receipts", `${runId}.lane_record.json`], laneRecord);
    const nextState = {
      ...state,
      cursor: advanced.cursor,
      object_index: { ...state.object_index, ...objectIndex },
      last_run_id: runId,
      last_completed_at: completedAt,
    };
    await atomicWritePrivateJson(context.state_root, ["state", "linear-collect.json"], nextState);
    const created = LINEAR_COLLECT_OBJECT_KINDS.reduce((total, kind) => total + objectCounts[kind].created, 0);
    await writeLinearCollectHealth(context.state_root, {
      attemptedAt,
      succeeded: true,
      runId,
      watermark: advanced.cursor.watermark,
      backfillPending: advanced.cursor.backfill !== null,
      objectsCreated: created,
      coverageGaps: receipt.coverage_gaps,
      now: clock.now,
    });
    return {
      mode: "apply",
      feature_status: "ON",
      status: "ok",
      run_id: runId,
      generation_seq: advanced.cursor.generation_seq,
      window_phase: window.phase,
      order_observed: advanced.order_observed,
      read_calls: receipt.read_calls.total,
      objects: objectCounts,
      objects_created: created,
      backfill_pending: advanced.cursor.backfill !== null,
      coverage_gaps: receipt.coverage_gaps,
      error_code_counts: [],
      repository_writes: 0,
      private_writes: receipt.private_writes + 1,
      network_used: receipt.network_used,
      lane_record: laneRecord,
    };
  } catch (error) {
    await publishError(error);
    if (window !== null && observed !== null) {
      await writeErrorReceipt({
        context, runId, attemptedAt, clock, window, cursorBefore, observed, objectCounts, observedRefs,
        organizationId, gaps, privateWrites, error,
      }).catch(() => {});
    }
    throw error;
  } finally {
    await lease.release();
  }
}

async function writeErrorReceipt({
  context, runId, attemptedAt, clock, window, cursorBefore, observed, objectCounts, observedRefs,
  organizationId, gaps, privateWrites, error,
}) {
  const completedAt = clock.now().toISOString();
  const sortedRefs = [...observedRefs].sort((left, right) => `${left.kind} ${left.object_id}`.localeCompare(`${right.kind} ${right.object_id}`));
  const receipt = {
    schema_version: LINEAR_COLLECT_RUN_RECEIPT_SCHEMA_VERSION,
    lane_id: context.binding.lane_id,
    run_id: runId,
    generation_seq: cursorBefore.generation_seq,
    mode: "apply",
    status: "error",
    writer_authority_id: context.binding.writer.authority_id,
    writer_epoch: context.binding.writer.epoch,
    binding_sha256: context.binding_sha256,
    workspace_url_key: context.binding.workspace.url_key,
    organization_id: organizationId,
    started_at: attemptedAt,
    completed_at: completedAt,
    duration_ms: Date.parse(completedAt) - Date.parse(attemptedAt),
    window: { lower: window.lower, upper: window.upper, phase: window.phase, order_observed: null },
    cursor_before: cursorBefore,
    cursor_after: cursorBefore,
    read_calls: observed.readCalls(),
    objects: objectCounts,
    custody_manifest_digest: sha256Canonical(sortedRefs),
    coverage_gaps: [...gaps].sort(),
    error_codes: [safeFailureCode(error)],
    repository_writes: 0,
    private_writes: privateWrites + 1,
    network_used: observed.kind === "graphql",
  };
  validateLinearCollectRunReceipt(receipt);
  await writeCreateOnlyJson(context.state_root, ["receipts", `${runId}.json`], receipt);
}

// Nine-key refs-only capture_generation record (plan-17 source-lane shape).
// The path_registry Linear adapter derives the same record from the persisted
// receipt; the lane test pins both derivations equal.
export function laneRecordFromReceipt(receipt, receiptDigest) {
  assertDigest(receiptDigest, "$receipt_digest");
  return {
    record_kind: "capture_generation",
    source_ref: LINEAR_SOURCE_REF,
    generation_seq: receipt.generation_seq,
    capture_ref: `receipt.linear.run.${receiptDigest.slice("sha256:".length)}`,
    manifest_ref: `receipt.linear.custody.${receipt.custody_manifest_digest.slice("sha256:".length)}`,
    item_count: observedObjectTotal(receipt),
    content_digest: receipt.custody_manifest_digest,
    captured_at: receipt.window.upper,
    immutable: true,
  };
}

