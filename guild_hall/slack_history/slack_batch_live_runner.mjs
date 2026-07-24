import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";

import {
  digestSlackContinuousBinding,
  runSlackContinuousIngress,
  SLACK_CONTINUOUS_BINDING_SCHEMA_VERSION_V2,
  validateSlackContinuousBinding,
} from "./slack_continuous_runner.mjs";
import {
  atomicWritePrivateJson,
  resolveGuardedPrivatePath,
} from "./slack_custody.mjs";
import {
  createSlackHostedFileTransport,
  createSlackWebApiCall,
  createSlackWebApiPollingTransport,
  loadSlackBotToken,
} from "./slack_transport.mjs";

export const SLACK_BATCH_LIVE_BINDING_SCHEMA_VERSION = "soulforge.slack_batch_live.binding.v1";
export const SLACK_BATCH_LIVE_STATE_SCHEMA_VERSION = "soulforge.slack_batch_live.state.v1";

const BATCH_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "batch_id",
  "private_root",
  "state_root",
  "forbidden_roots",
  "writer",
  "bindings",
]);
const WRITER_FIELDS = Object.freeze(["authority_id", "epoch"]);
const BINDING_REF_FIELDS = Object.freeze([
  "binding_id",
  "workspace_id",
  "channel_id",
  "binding_path",
  "binding_sha256",
  "max_events",
  "max_pages",
]);
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const WORKSPACE_ID_PATTERN = /^T[A-Z0-9]{2,31}$/u;
const CHANNEL_ID_PATTERN = /^C[A-Z0-9]{2,31}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const TOKEN_VALUE_PATTERN = /^(?:(?:xox[abprs]|xapp)-|eyJ[A-Za-z0-9_-]{8,}\.)/u;

export class SlackBatchLiveError extends Error {
  constructor(code, target, message) {
    super(`${code} at ${target}: ${message}`);
    this.name = "SlackBatchLiveError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target, message) {
  throw new SlackBatchLiveError(code, target, message);
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
  if (actual.length !== expected.length
    || actual.some((entry, index) => entry !== expected[index])) {
    fail("exact_keys_required", target, `Expected exact keys: ${expected.join(",")}`);
  }
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

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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

async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoReparseComponents(target, targetLabel) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = await lstatOrNull(current);
    if (stat === null) break;
    if (stat.isSymbolicLink()) {
      fail("reparse_path_forbidden", targetLabel, "Symbolic links and junctions are forbidden");
    }
  }
  return absolute;
}

async function canonicalExistingDirectory(value, target) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail("absolute_path_required", target, "Expected an absolute directory path");
  }
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
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail("absolute_path_required", target, "Expected an absolute directory path");
  }
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
    fail("directory_required", target, "State root ancestor must be a normal directory");
  }
  const canonicalAncestor = await realpath(cursor);
  if (!samePath(canonicalAncestor, cursor)) {
    fail("canonical_path_required", target, "State root ancestor must not resolve through an alias");
  }
  return path.resolve(canonicalAncestor, ...missing);
}

async function readPinnedJsonFile(filePath, expectedDigest, target, ownerRoot) {
  assertDigest(expectedDigest, `${target}.sha256`);
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    fail("absolute_path_required", `${target}.path`, "Expected an absolute private JSON path");
  }
  const absolute = await assertNoReparseComponents(filePath, `${target}.path`);
  if (!isPathWithin(ownerRoot, absolute, true)) {
    fail("private_path_escape", `${target}.path`, "Private JSON must be a strict child of its owner root");
  }
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

function assertNoEmbeddedSecret(value, target) {
  if (typeof value === "string") {
    if (TOKEN_VALUE_PATTERN.test(value)) {
      fail("secret_value_forbidden", target, "Token-like values are forbidden in batch bindings");
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:access_token|client_secret|password|token_value|credential_value)/iu.test(key)) {
      fail("secret_field_forbidden", `${target}.${key}`, "Secret fields are forbidden");
    }
    assertNoEmbeddedSecret(child, `${target}.${key}`);
  }
}

export function validateSlackBatchLiveBinding(binding) {
  exactKeys(binding, BATCH_FIELDS, "$batch");
  if (binding.schema_version !== SLACK_BATCH_LIVE_BINDING_SCHEMA_VERSION) {
    fail("batch_schema_invalid", "$batch.schema_version", "Unexpected batch schema version");
  }
  if (binding.feature_enabled !== true) {
    fail("batch_feature_must_be_on", "$batch.feature_enabled", "Live batch binding must be enabled");
  }
  safeRef(binding.batch_id, "$batch.batch_id");
  for (const [key, value] of [
    ["private_root", binding.private_root],
    ["state_root", binding.state_root],
  ]) {
    if (typeof value !== "string" || !path.isAbsolute(value)) {
      fail("absolute_path_required", `$batch.${key}`, "Expected an absolute private path");
    }
  }
  if (!isPathWithin(binding.private_root, binding.state_root, true)) {
    fail("state_root_not_strict_private_child", "$batch.state_root", "State root must be inside private root");
  }
  if (!Array.isArray(binding.forbidden_roots)
    || Object.keys(binding.forbidden_roots).length !== binding.forbidden_roots.length
    || binding.forbidden_roots.length < 2) {
    fail("forbidden_roots_required", "$batch.forbidden_roots", "At least repository and runtime roots are required");
  }
  const forbidden = new Set();
  binding.forbidden_roots.forEach((value, index) => {
    if (typeof value !== "string" || !path.isAbsolute(value)) {
      fail("absolute_path_required", `$batch.forbidden_roots[${index}]`, "Expected an absolute root");
    }
    const normalized = normalizedPath(value);
    if (forbidden.has(normalized)) {
      fail("duplicate_forbidden_root", `$batch.forbidden_roots[${index}]`, "Forbidden roots must be unique");
    }
    forbidden.add(normalized);
    if (pathsOverlap(binding.private_root, value) || pathsOverlap(binding.state_root, value)) {
      fail("private_forbidden_overlap", "$batch.private_root", "Private roots must be disjoint from forbidden roots");
    }
  });
  exactKeys(binding.writer, WRITER_FIELDS, "$batch.writer");
  safeRef(binding.writer.authority_id, "$batch.writer.authority_id");
  if (!Number.isSafeInteger(binding.writer.epoch) || binding.writer.epoch < 1) {
    fail("writer_epoch_invalid", "$batch.writer.epoch", "Expected a positive writer epoch");
  }
  if (!Array.isArray(binding.bindings)
    || Object.keys(binding.bindings).length !== binding.bindings.length
    || binding.bindings.length < 1
    || binding.bindings.length > 256) {
    fail("binding_allowlist_invalid", "$batch.bindings", "Expected 1 to 256 dense binding entries");
  }
  const bindingIds = new Set();
  const channelKeys = new Set();
  let previousSortKey = null;
  binding.bindings.forEach((entry, index) => {
    const target = `$batch.bindings[${index}]`;
    exactKeys(entry, BINDING_REF_FIELDS, target);
    safeRef(entry.binding_id, `${target}.binding_id`);
    if (!WORKSPACE_ID_PATTERN.test(String(entry.workspace_id ?? ""))) {
      fail("workspace_id_invalid", `${target}.workspace_id`, "Expected an exact Slack workspace ID");
    }
    if (!CHANNEL_ID_PATTERN.test(String(entry.channel_id ?? ""))) {
      fail("channel_id_invalid", `${target}.channel_id`, "Expected an exact public channel ID");
    }
    if (typeof entry.binding_path !== "string" || !path.isAbsolute(entry.binding_path)) {
      fail("absolute_path_required", `${target}.binding_path`, "Expected an absolute private binding path");
    }
    if (!isPathWithin(binding.private_root, entry.binding_path, true)
      || pathsOverlap(binding.state_root, entry.binding_path)) {
      fail("binding_path_outside_private_config", `${target}.binding_path`, "Binding path escaped private config custody");
    }
    assertDigest(entry.binding_sha256, `${target}.binding_sha256`);
    if (!Number.isSafeInteger(entry.max_events) || entry.max_events < 1 || entry.max_events > 1000) {
      fail("max_events_invalid", `${target}.max_events`, "Expected 1 to 1000");
    }
    if (!Number.isSafeInteger(entry.max_pages) || entry.max_pages < 1 || entry.max_pages > 100) {
      fail("max_pages_invalid", `${target}.max_pages`, "Expected 1 to 100");
    }
    const channelKey = `${entry.workspace_id}\u0000${entry.channel_id}`;
    if (bindingIds.has(entry.binding_id)) {
      fail("duplicate_binding_id", `${target}.binding_id`, "Binding IDs must be unique");
    }
    if (channelKeys.has(channelKey)) {
      fail("duplicate_channel_binding", `${target}.channel_id`, "Workspace/channel pairs must be unique");
    }
    const sortKey = `${entry.workspace_id}\u0000${entry.channel_id}\u0000${entry.binding_id}`;
    if (previousSortKey !== null && previousSortKey.localeCompare(sortKey) >= 0) {
      fail("binding_allowlist_not_canonical", target, "Bindings must be canonically ordered");
    }
    bindingIds.add(entry.binding_id);
    channelKeys.add(channelKey);
    previousSortKey = sortKey;
  });
  assertNoEmbeddedSecret(binding, "$batch");
  return binding;
}

async function resolveBatchContext({
  batch_binding_path: batchBindingPath,
  expected_batch_binding_sha256: expectedBatchBindingSha256,
  repository_root: repositoryRoot,
  runtime_root: runtimeRoot,
}) {
  assertDigest(expectedBatchBindingSha256, "$expected_batch_binding_sha256");
  const canonicalRepositoryRoot = await canonicalExistingDirectory(repositoryRoot, "$repository_root");
  const canonicalRuntimeRoot = await canonicalExistingDirectory(runtimeRoot, "$runtime_root");
  if (pathsOverlap(canonicalRepositoryRoot, canonicalRuntimeRoot)) {
    fail("repository_runtime_overlap", "$runtime_root", "Repository and runtime roots must be disjoint");
  }

  if (typeof batchBindingPath !== "string" || !path.isAbsolute(batchBindingPath)) {
    fail("absolute_path_required", "$batch_binding_path", "Expected an absolute private batch binding path");
  }
  const plannedBatchPath = await assertNoReparseComponents(batchBindingPath, "$batch_binding_path");
  const batchParent = await canonicalExistingDirectory(path.dirname(plannedBatchPath), "$batch_binding_parent");
  const provisional = await readPinnedJsonFile(
    plannedBatchPath,
    expectedBatchBindingSha256,
    "$batch_binding",
    batchParent,
  );
  const batchBinding = validateSlackBatchLiveBinding(provisional.value);
  const canonicalPrivateRoot = await canonicalExistingDirectory(
    batchBinding.private_root,
    "$batch.private_root",
  );
  if (!isPathWithin(canonicalPrivateRoot, provisional.path, true)) {
    fail("batch_binding_outside_private_root", "$batch_binding_path", "Batch binding escaped private root");
  }
  const canonicalStateRoot = await canonicalPlannedDirectory(
    batchBinding.state_root,
    "$batch.state_root",
  );
  if (!isPathWithin(canonicalPrivateRoot, canonicalStateRoot, true)) {
    fail("state_root_not_strict_private_child", "$batch.state_root", "State root escaped private root");
  }
  for (const [root, target] of [
    [canonicalRepositoryRoot, "$repository_root"],
    [canonicalRuntimeRoot, "$runtime_root"],
  ]) {
    if (pathsOverlap(canonicalPrivateRoot, root)
      || pathsOverlap(canonicalStateRoot, root)
      || pathsOverlap(provisional.path, root)) {
      fail("private_public_runtime_overlap", target, "Private binding and state must be disjoint");
    }
    if (!batchBinding.forbidden_roots.some((entry) => samePath(entry, root))) {
      fail("required_forbidden_root_missing", "$batch.forbidden_roots", "Repository and runtime roots must be pinned as forbidden");
    }
  }
  return {
    batch_binding: batchBinding,
    batch_binding_sha256: expectedBatchBindingSha256,
    batch_binding_path: provisional.path,
    private_root: canonicalPrivateRoot,
    state_root: canonicalStateRoot,
    repository_root: canonicalRepositoryRoot,
    runtime_root: canonicalRuntimeRoot,
  };
}

async function loadChannelBinding(context, reference, index) {
  const target = `$batch.bindings[${index}]`;
  const loaded = await readPinnedJsonFile(
    reference.binding_path,
    reference.binding_sha256,
    target,
    context.private_root,
  );
  if (pathsOverlap(context.state_root, loaded.path)) {
    fail("binding_path_state_overlap", `${target}.binding_path`, "Binding file overlaps batch state");
  }
  const binding = validateSlackContinuousBinding(loaded.value);
  if (binding.schema_version !== SLACK_CONTINUOUS_BINDING_SCHEMA_VERSION_V2
    || binding.feature_enabled !== true) {
    fail("live_binding_required", target, "Batch entries require enabled v2 live bindings");
  }
  for (const key of ["binding_id", "workspace_id", "channel_id"]) {
    if (binding[key] !== reference[key]) {
      fail("binding_identity_mismatch", `${target}.${key}`, "Referenced binding identity changed");
    }
  }
  if (!isPathWithin(context.private_root, binding.private_root)
    || pathsOverlap(context.state_root, binding.data_root)
    || pathsOverlap(context.state_root, binding.attachment_policy.custody_root)) {
    fail("channel_private_boundary_invalid", target, "Channel state escaped or overlapped batch custody");
  }
  const privateConfigPaths = [
    context.batch_binding_path,
    ...context.batch_binding.bindings.map((entry) => entry.binding_path),
  ];
  if (privateConfigPaths.some((configPath) => pathsOverlap(binding.data_root, configPath))) {
    fail("channel_state_config_overlap", target, "Channel state must be disjoint from private binding files");
  }
  for (const credentialPath of [
    binding.credentials.app_token_file,
    binding.credentials.bot_token_file,
  ].filter((entry) => entry !== null)) {
    if (pathsOverlap(loaded.path, credentialPath)) {
      fail("binding_credential_overlap", target, "Binding and credential files must be disjoint");
    }
  }
  for (const root of [context.repository_root, context.runtime_root]) {
    if (pathsOverlap(binding.private_root, root)
      || pathsOverlap(binding.data_root, root)
      || !binding.forbidden_roots.some((entry) => samePath(entry, root))) {
      fail("channel_forbidden_root_missing", target, "Channel binding must exclude repository and runtime roots");
    }
  }
  return {
    binding,
    binding_digest: digestSlackContinuousBinding(binding),
  };
}

async function prepareChannelBindings(context) {
  const loadedByIndex = new Map();
  const errorsByIndex = new Map();
  for (let index = 0; index < context.batch_binding.bindings.length; index += 1) {
    try {
      loadedByIndex.set(
        index,
        await loadChannelBinding(context, context.batch_binding.bindings[index], index),
      );
    } catch (error) {
      errorsByIndex.set(index, error);
    }
  }
  const retained = [...loadedByIndex.entries()];
  for (let leftIndex = 0; leftIndex < retained.length; leftIndex += 1) {
    const [leftBindingIndex, left] = retained[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < retained.length; rightIndex += 1) {
      const [rightBindingIndex, right] = retained[rightIndex];
      if (pathsOverlap(left.binding.data_root, right.binding.data_root)) {
        const overlapError = new SlackBatchLiveError(
          "channel_state_root_overlap",
          "$batch.bindings",
          "Per-channel state roots must be pairwise disjoint",
        );
        errorsByIndex.set(leftBindingIndex, overlapError);
        errorsByIndex.set(rightBindingIndex, overlapError);
      }
    }
  }
  for (const index of errorsByIndex.keys()) loadedByIndex.delete(index);
  return { loaded_by_index: loadedByIndex, errors_by_index: errorsByIndex };
}

function safeFailureCode(error) {
  const candidate = String(error?.code ?? "");
  return /^[a-z][a-z0-9_]{0,95}$/u.test(candidate) ? candidate : "unknown_failure";
}

function incrementFailure(failures, error) {
  const code = safeFailureCode(error);
  failures.set(code, (failures.get(code) ?? 0) + 1);
}

function failureCounts(failures) {
  return [...failures.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({ code, count }));
}

function baseAggregate(mode, configuredCount) {
  return {
    mode,
    feature_status: "ON",
    configured_count: configuredCount,
    succeeded_count: 0,
    failed_count: 0,
    pulled_count: 0,
    accepted_count: 0,
    held_count: 0,
    processed_pages: 0,
    replayed_pages: 0,
    continuation_pending_count: 0,
    repository_writes: 0,
    private_writes: 0,
    network_used: false,
    coverage_gaps: [],
    error_code_counts: [],
  };
}

function observeTransportPages(transport) {
  if (transport === null || typeof transport !== "object"
    || typeof transport.pull !== "function") {
    fail("transport_invalid", "$transport", "Expected a pull transport");
  }
  let latestHasNextPage = null;
  const observed = {
    kind: transport.kind,
    async pull(request) {
      const page = await transport.pull(request);
      latestHasNextPage = typeof page?.next_cursor_token === "string";
      return page;
    },
  };
  if (typeof transport.fetchHostedFile === "function") {
    observed.fetchHostedFile = (request) => transport.fetchHostedFile(request);
  }
  return {
    transport: Object.freeze(observed),
    latestHasNextPage() {
      return latestHasNextPage;
    },
  };
}

export async function preflightSlackBatchLive(options) {
  const context = await resolveBatchContext(options);
  const aggregate = baseAggregate("preflight", context.batch_binding.bindings.length);
  const failures = new Map();
  const prepared = await prepareChannelBindings(context);
  for (let index = 0; index < context.batch_binding.bindings.length; index += 1) {
    const error = prepared.errors_by_index.get(index);
    if (error === undefined) {
      aggregate.succeeded_count += 1;
    } else {
      aggregate.failed_count += 1;
      incrementFailure(failures, error);
    }
  }
  aggregate.error_code_counts = failureCounts(failures);
  return aggregate;
}

export async function createDefaultSlackBatchTransport({ binding }) {
  const token = await loadSlackBotToken(binding.credentials, process.env, {
    private_root: binding.private_root,
    data_root: binding.data_root,
    forbidden_roots: binding.forbidden_roots,
  });
  const apiCall = createSlackWebApiCall({
    bot_token: token,
    timeout_ms: binding.attachment_policy.timeout_ms,
  });
  const hostedFileTransport = binding.attachment_policy.feature_enabled
    ? createSlackHostedFileTransport({
      bot_token: token,
      policy: binding.attachment_policy,
    })
    : null;
  return createSlackWebApiPollingTransport({
    apiCall,
    binding,
    hosted_file_transport: hostedFileTransport,
  });
}

async function acquireBatchLease(context) {
  const target = await resolveGuardedPrivatePath(
    context.state_root,
    "leases",
    "slack-batch-live.lock",
  );
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(target, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({
      schema_version: SLACK_BATCH_LIVE_STATE_SCHEMA_VERSION,
      batch_binding_sha256: context.batch_binding_sha256,
      writer_authority_id: context.batch_binding.writer.authority_id,
      writer_epoch: context.batch_binding.writer.epoch,
      pid: process.pid,
    })}\n`);
    await handle.sync();
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error?.code === "EEXIST") {
      fail("batch_lease_unavailable", "$batch.state_root", "Another batch writer owns the lease");
    }
    throw error;
  }
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      await handle.close();
      await rm(target, { force: true });
    },
  };
}

export async function runSlackBatchLive({
  transport_factory: transportFactory = createDefaultSlackBatchTransport,
  ...options
}) {
  if (typeof transportFactory !== "function") {
    fail("transport_factory_invalid", "$transport_factory", "Expected an injected transport factory");
  }
  const context = await resolveBatchContext(options);
  const aggregate = baseAggregate("apply", context.batch_binding.bindings.length);
  const failures = new Map();
  const prepared = await prepareChannelBindings(context);
  const lease = await acquireBatchLease(context);
  try {
    for (let index = 0; index < context.batch_binding.bindings.length; index += 1) {
      const reference = context.batch_binding.bindings[index];
      let channelSucceeded = false;
      try {
        const preparationError = prepared.errors_by_index.get(index);
        if (preparationError !== undefined) throw preparationError;
        const loaded = prepared.loaded_by_index.get(index);
        const transport = await transportFactory({
          binding: loaded.binding,
          binding_index: index,
        });
        if (transport?.kind === "web_api") aggregate.network_used = true;
        const observedTransport = observeTransportPages(transport);
        let continuationPending = false;
        for (let pageIndex = 0; pageIndex < reference.max_pages; pageIndex += 1) {
          const result = await runSlackContinuousIngress({
            binding: loaded.binding,
            expected_binding_digest: loaded.binding_digest,
            writer_authority_id: loaded.binding.writer.authority_id,
            writer_epoch: loaded.binding.writer.epoch,
            transport: observedTransport.transport,
            dry_run: false,
            max_events: reference.max_events,
          });
          aggregate.pulled_count += result.pulled_count;
          aggregate.accepted_count += result.accepted_count;
          aggregate.held_count += result.held_count;
          aggregate.processed_pages += result.processed_pages;
          aggregate.replayed_pages += result.replayed_pages;
          aggregate.private_writes += result.private_writes;
          aggregate.network_used ||= result.network_used;
          if (result.pulled_count === 0
            || result.processed_pages === 0
            || result.replayed_pages > 0
            || observedTransport.latestHasNextPage() !== true) {
            break;
          }
          if (pageIndex === reference.max_pages - 1) continuationPending = true;
        }
        if (continuationPending) aggregate.continuation_pending_count += 1;
        channelSucceeded = true;
      } catch (error) {
        incrementFailure(failures, error);
      }
      if (channelSucceeded) aggregate.succeeded_count += 1;
      else aggregate.failed_count += 1;
    }
    if (aggregate.continuation_pending_count > 0) {
      aggregate.coverage_gaps = ["max_pages_continuation_pending"];
    }
    aggregate.error_code_counts = failureCounts(failures);
    aggregate.private_writes += 1;
    await atomicWritePrivateJson(
      context.state_root,
      ["state", "slack-batch-live.json"],
      {
        schema_version: SLACK_BATCH_LIVE_STATE_SCHEMA_VERSION,
        result: aggregate,
      },
    );
    return aggregate;
  } finally {
    await lease.release();
  }
}
