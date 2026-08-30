import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import {
  constants as FS_CONSTANTS,
  existsSync,
} from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  parse as parsePath,
} from "node:path";
import { types } from "node:util";

import {
  createLinearLb1ActualReader,
  linearLb1AttachmentAllowlistContentId,
} from "./linear_lb1_actual_reader.mjs";
import {
  buildImmutableLinearLb1BackupRunV2,
  checkLinearLb1RestoreV2,
  deserializeBackupRunV2,
  serializeBackupRunV2,
} from "./linear_lb1_v2.mjs";
import { evaluateLinearLb1OwnerGateV2 } from "./linear_lb1_owner_gate_v2.mjs";
import { parseIcaclsWriterExclusive } from "./preflight.mjs";

export const LINEAR_LB1_PHYSICAL_CONFIG_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.physical_one_shot_config.v0";
export const LINEAR_LB1_PHYSICAL_CAPTURE_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.physical_capture_input.v0";
export const LINEAR_LB1_CONNECTOR_EFFECT_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.connector_effect_receipt.v0";

export const LINEAR_LB1_CODEX_READ_CAPABILITIES = Object.freeze([
  "mcp__codex_apps__linear_get_issue",
  "mcp__codex_apps__linear_get_team",
  "mcp__codex_apps__linear_get_workspace",
  "mcp__codex_apps__linear_list_comments",
  "mcp__codex_apps__linear_list_issue_labels",
  "mcp__codex_apps__linear_list_issue_statuses",
  "mcp__codex_apps__linear_list_issues",
  "mcp__codex_apps__linear_list_projects",
  "mcp__codex_apps__linear_list_teams",
  "mcp__codex_apps__linear_list_users",
]);

const CONFIG_FIELDS = Object.freeze([
  "approved_recovery_parent", "claim_root", "claim_store_ref", "connector_binding_ref",
  "control_root", "data_root", "generation_root", "owner_packet", "reader_binding",
  "recovery_root", "run_key", "schema_version", "single_use_token_ref", "storage_adapter_ref",
  "trusted_pin", "writer_identities",
]);
const READER_FIELDS = Object.freeze([
  "adapter_ref", "approved_attachment_ids", "attachment_policy_ref", "credential_ref",
  "resource_limits", "workspace_ref",
]);
const CAPTURE_FIELDS = Object.freeze(["effect_receipt", "pages", "schema_version"]);
const EFFECT_FIELDS = Object.freeze([
  "binding_ref", "body_free", "call_ledger", "call_ledger_sha256", "capability_counts",
  "capability_set_sha256", "claim_receipt_ref", "ended_at", "evidence_state", "linear_mutations",
  "network_calls", "page_bundle_sha256", "producer_kind", "schema_version", "session_ref",
  "started_at", "workspace_ref",
]);
const RESOURCE_LIMIT_FIELDS = Object.freeze(["max_issues", "max_pages", "max_runtime_ms", "max_total_bytes"]);
const CALL_FIELDS = Object.freeze(["capability", "input_sha256", "is_error", "output_sha256", "sequence"]);
const REF_FIELDS = Object.freeze(["content_hash_alg", "content_id", "entity_id", "revision_id"]);
const CLAIM_RECORD_FIELDS = Object.freeze([
  "claim_store_ref", "claimed_at", "expires_at", "owner_packet_sha256", "run_key",
  "schema_version", "session_host_ref", "session_pid", "session_ref", "single_use_token_ref",
  "writer_id", "writer_epoch",
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH_SEGMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const HASH_REF = /^sha256:[a-f0-9]{64}$/u;
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const SECRET = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const BROAD_WRITER_IDENTITY = /^(?:everyone|users|authenticated users|builtin\\users|nt authority\\authenticated users)$/iu;
const BROAD_WRITER_SID = /^\*?(?:S-1-1-0|S-1-5-4|S-1-5-7|S-1-5-11|S-1-5-32-545|S-1-5-32-546)$/iu;

export class LinearLb1PhysicalError extends Error {
  constructor(code) {
    super(code);
    this.name = "LinearLb1PhysicalError";
    this.code = code;
  }
}

function fail(code) { throw new LinearLb1PhysicalError(code); }
function codepointCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) return false;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) return false;
  }
  actual.sort(codepointCompare);
  const wanted = [...expected].sort(codepointCompare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}
function exactRef(value) {
  return exactKeys(value, REF_FIELDS) && UUID_V4.test(value.entity_id) && UUID_V4.test(value.revision_id)
    && HASH_REF.test(value.content_id) && value.content_hash_alg === "sha256";
}
function strictIso(value) {
  return typeof value === "string" && ISO_UTC.test(value) && Number.isSafeInteger(Date.parse(value))
    && new Date(Date.parse(value)).toISOString() === value;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(codepointCompare).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256Text(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function sha256Bytes(value) { return createHash("sha256").update(value).digest("hex"); }
function hashRef(value) { return `sha256:${sha256Text(stableJson(value))}`; }
function sameRef(left, right) { return exactRef(left) && exactRef(right) && stableJson(left) === stableJson(right); }
function plainSnapshot(root, code = "linear_lb1_physical_input_invalid", { privatePayload = false } = {}) {
  const seen = new WeakSet();
  let values = 0;
  function walk(value, depth) {
    values += 1;
    if (values > 100_000 || depth > 32) fail(code);
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 4096 || value.normalize("NFC") !== value || CONTROL.test(value)
          || (!privatePayload && SECRET.test(value))) fail(code);
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) fail(code);
      return value;
    }
    if (typeof value !== "object" || types.isProxy(value) || seen.has(value)) fail(code);
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 100_000) fail(code);
      return value.map((entry) => walk(entry, depth + 1));
    }
    if (!isPlainRecord(value)) fail(code);
    const keys = Reflect.ownKeys(value);
    if (keys.length > 128 || keys.some((key) => typeof key !== "string")) fail(code);
    const output = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) fail(code);
      output[key] = walk(descriptor.value, depth + 1);
    }
    return output;
  }
  return walk(root, 0);
}
function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function linearLb1ConnectorCapabilitySetSha256() {
  return hashRef({
    schema_version: "soulforge.backup_controller.linear_lb1.connector_capability_set.v0",
    capabilities: [...LINEAR_LB1_CODEX_READ_CAPABILITIES],
  });
}

export function linearLb1ConnectorBindingContentId(workspaceRef) {
  if (!exactRef(workspaceRef)) fail("linear_lb1_physical_workspace_ref_invalid");
  return hashRef({
    schema_version: "soulforge.backup_controller.linear_lb1.connector_binding.v0",
    workspace_ref: workspaceRef,
    capability_set_sha256: linearLb1ConnectorCapabilitySetSha256(),
    mutation_capabilities: [],
  });
}

export function linearLb1PhysicalPageBundleSha256(pages) {
  if (!Array.isArray(pages)) fail("linear_lb1_physical_pages_invalid");
  return hashRef({
    schema_version: "soulforge.backup_controller.linear_lb1.provider_page_bundle.v0",
    pages,
  });
}

function canonicalWriterIdentities(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16
      || value.some((item) => typeof item !== "string" || item.length < 1 || item.length > 256
        || item.normalize("NFC") !== item || CONTROL.test(item) || SECRET.test(item)
        || BROAD_WRITER_IDENTITY.test(item.trim()) || BROAD_WRITER_SID.test(item.trim()))) {
    fail("linear_lb1_physical_writer_identity_invalid");
  }
  const identities = [...value].sort(codepointCompare);
  if (new Set(identities.map((item) => item.toLowerCase())).size !== identities.length) {
    fail("linear_lb1_physical_writer_identity_invalid");
  }
  return identities;
}

export function linearLb1GenerationTargetContentId(dataRootInput, generationRootInput) {
  const dataRoot = safeAbsolutePath(dataRootInput, "linear_lb1_physical_data_root_invalid");
  const generationRoot = safeAbsolutePath(generationRootInput, "linear_lb1_physical_generation_root_invalid");
  if (relative(dataRoot, generationRoot) !== join("60_BACKUP_GENERATIONS", "linear")) {
    fail("linear_lb1_physical_path_scope_invalid");
  }
  return hashRef({
    schema_version: "soulforge.backup_controller.linear_lb1.generation_target_binding.v0",
    physical_root_class: "data_root",
    data_root_sha256: hashRef(dataRoot),
    generation_root_sha256: hashRef(generationRoot),
    create_only: true,
    overwrite_allowed: false,
    prune_or_delete_allowed: false,
  });
}

export function linearLb1ClaimStoreContentId(controlRootInput, claimRootInput, writerIdentitiesInput) {
  const controlRoot = safeAbsolutePath(controlRootInput, "linear_lb1_physical_control_root_invalid");
  const claimRoot = safeAbsolutePath(claimRootInput, "linear_lb1_physical_claim_root_invalid");
  const writerIdentities = canonicalWriterIdentities(writerIdentitiesInput);
  if (!strictDescendant(claimRoot, controlRoot)) fail("linear_lb1_physical_path_scope_invalid");
  return hashRef({
    schema_version: "soulforge.backup_controller.linear_lb1.claim_store_binding.v0",
    physical_root_class: "control_root",
    control_root_sha256: hashRef(controlRoot),
    claim_root_sha256: hashRef(claimRoot),
    writer_identities_sha256: hashRef(writerIdentities),
    atomic_create_only: true,
  });
}

export function linearLb1PhysicalBindingContentId(value) {
  if (!isPlainRecord(value) || !exactKeys(value, [
    "approved_recovery_parent", "claim_root", "control_root", "data_root", "generation_root",
    "reader_resource_limits", "recovery_root", "writer_identities",
  ])) fail("linear_lb1_physical_binding_invalid");
  const controlRoot = safeAbsolutePath(value.control_root, "linear_lb1_physical_control_root_invalid");
  const claimRoot = safeAbsolutePath(value.claim_root, "linear_lb1_physical_claim_root_invalid");
  const dataRoot = safeAbsolutePath(value.data_root, "linear_lb1_physical_data_root_invalid");
  const generationRoot = safeAbsolutePath(value.generation_root, "linear_lb1_physical_generation_root_invalid");
  const approvedRecoveryParent = safeAbsolutePath(value.approved_recovery_parent, "linear_lb1_physical_recovery_root_invalid");
  const recoveryRoot = safeAbsolutePath(value.recovery_root, "linear_lb1_physical_recovery_root_invalid");
  const writerIdentities = canonicalWriterIdentities(value.writer_identities);
  const limits = value.reader_resource_limits;
  if (!isPlainRecord(limits) || !exactKeys(limits, RESOURCE_LIMIT_FIELDS)
      || !Number.isSafeInteger(limits.max_pages) || limits.max_pages < 1 || limits.max_pages > 10_000
      || !Number.isSafeInteger(limits.max_issues) || limits.max_issues < 1 || limits.max_issues > 100_000
      || !Number.isSafeInteger(limits.max_total_bytes) || limits.max_total_bytes < 1 || limits.max_total_bytes > 1_073_741_824
      || !Number.isSafeInteger(limits.max_runtime_ms) || limits.max_runtime_ms < 1_000 || limits.max_runtime_ms > 3_600_000) {
    fail("linear_lb1_physical_resource_limits_invalid");
  }
  return hashRef({
    schema_version: "soulforge.backup_controller.linear_lb1.physical_binding.v0",
    roots: {
      control_root_sha256: hashRef(controlRoot),
      claim_root_sha256: hashRef(claimRoot),
      data_root_sha256: hashRef(dataRoot),
      generation_root_sha256: hashRef(generationRoot),
      approved_recovery_parent_sha256: hashRef(approvedRecoveryParent),
      recovery_root_sha256: hashRef(recoveryRoot),
    },
    writer_identities_sha256: hashRef(writerIdentities),
    reader_resource_limits_sha256: hashRef(limits),
    generation_target_content_id: linearLb1GenerationTargetContentId(dataRoot, generationRoot),
    claim_store_content_id: linearLb1ClaimStoreContentId(controlRoot, claimRoot, writerIdentities),
  });
}

function safeAbsolutePath(value, code) {
  if (typeof value !== "string" || value.length < 3 || value.length > 1024 || CONTROL.test(value)
      || !isAbsolute(value) || value.includes("\0") || /(^|[\\/])\.\.([\\/]|$)/u.test(value)
      || value.startsWith("\\\\") || value.startsWith("//")
      || value.startsWith("\\?\\") || value.startsWith("\\.\\")) fail(code);
  const normalized = resolve(value);
  if (normalized.startsWith("\\\\") || normalized.startsWith("//")) fail(code);
  const root = parsePath(normalized).root;
  const segments = normalized.slice(root.length).split(/[\\/]/u).filter(Boolean);
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
  if (segments.some((segment) => segment === "." || segment === ".." || /[<>:"|?*]/u.test(segment)
      || /[. ]$/u.test(segment) || reserved.test(segment))) fail(code);
  return normalized;
}
function pathEqual(left, right) {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function strictDescendant(child, parent) {
  const rel = relative(parent, child);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function pathsOverlap(left, right) {
  return pathEqual(left, right) || strictDescendant(left, right) || strictDescendant(right, left);
}
async function assertExistingDirectory(path, code) {
  let stat;
  let actual;
  try {
    stat = await lstat(path);
    actual = await realpath(path);
  } catch { fail(code); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || !pathEqual(actual, path)) fail(code);
}
async function ensureDirectoryChain(parent, target, created) {
  if (!strictDescendant(target, parent)) fail("linear_lb1_physical_path_scope_invalid");
  const rel = relative(parent, target);
  let current = parent;
  for (const segment of rel.split(sep)) {
    if (!PATH_SEGMENT_ID.test(segment)) fail("linear_lb1_physical_path_scope_invalid");
    current = join(current, segment);
    if (existsSync(current)) {
      await assertExistingDirectory(current, "linear_lb1_physical_path_invalid");
      continue;
    }
    let wasCreated = false;
    try { await mkdir(current); wasCreated = true; }
    catch (error) { if (error?.code !== "EEXIST") fail("linear_lb1_physical_directory_create_failed"); }
    await assertExistingDirectory(current, "linear_lb1_physical_path_invalid");
    if (wasCreated) created.push(current);
  }
}
async function defaultAclProbe(path, writerIdentities) {
  if (process.platform !== "win32") return false;
  const systemRoot = process.env.SystemRoot;
  if (typeof systemRoot !== "string" || !isAbsolute(systemRoot)) return false;
  const executable = join(systemRoot, "System32", "icacls.exe");
  const output = await new Promise((resolveOutput, rejectOutput) => {
    execFile(executable, [path], { windowsHide: true, encoding: "utf8" }, (error, stdout) => {
      if (error) rejectOutput(error); else resolveOutput(stdout);
    });
  }).catch(() => null);
  if (output === null) return false;
  try { return parseIcaclsWriterExclusive(output, { writerIdentities, resourcePath: path }); } catch { return false; }
}
function defaultProcessProbe(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function claimFileName(singleUseTokenRef) {
  return `${singleUseTokenRef.content_id.slice("sha256:".length)}.claim.json`;
}
function receiptRef(kind, body) {
  const digest = hashRef({ kind, body });
  const hex = digest.slice("sha256:".length);
  return {
    entity_id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
    revision_id: `${hex.slice(32, 40)}-${hex.slice(40, 44)}-4${hex.slice(45, 48)}-9${hex.slice(49, 52)}-${hex.slice(52, 64)}`,
    content_id: digest,
    content_hash_alg: "sha256",
  };
}

function validateEffectReceipt(rawReceipt, {
  connectorBindingRef, workspaceRef, pages, claimReceiptRef, sessionRef, claimedAt, observedAt,
}) {
  const receipt = plainSnapshot(rawReceipt, "linear_lb1_physical_effect_receipt_invalid");
  if (!exactKeys(receipt, EFFECT_FIELDS) || receipt.schema_version !== LINEAR_LB1_CONNECTOR_EFFECT_SCHEMA_VERSION
      || !sameRef(receipt.binding_ref, connectorBindingRef) || !sameRef(receipt.workspace_ref, workspaceRef)
      || !sameRef(receipt.claim_receipt_ref, claimReceiptRef) || !sameRef(receipt.session_ref, sessionRef)
      || receipt.binding_ref.content_id !== linearLb1ConnectorBindingContentId(workspaceRef)
      || receipt.capability_set_sha256 !== linearLb1ConnectorCapabilitySetSha256()
      || receipt.page_bundle_sha256 !== linearLb1PhysicalPageBundleSha256(pages)
      || receipt.body_free !== true || receipt.linear_mutations !== 0
      || receipt.evidence_state !== "CALLER_OBSERVED_SESSION_BOUND"
      || receipt.producer_kind !== "codex_runtime_tool_orchestrator"
      || !Number.isSafeInteger(receipt.network_calls) || receipt.network_calls < 1
      || !strictIso(receipt.started_at) || !strictIso(receipt.ended_at)
      || Date.parse(receipt.started_at) < Date.parse(claimedAt)
      || Date.parse(receipt.ended_at) < Date.parse(receipt.started_at)
      || Date.parse(receipt.ended_at) > Date.parse(observedAt)
      || !Array.isArray(receipt.call_ledger) || receipt.call_ledger.length !== receipt.network_calls
      || !isPlainRecord(receipt.capability_counts)) fail("linear_lb1_physical_effect_receipt_invalid");
  const allowed = new Set(LINEAR_LB1_CODEX_READ_CAPABILITIES);
  const counts = Object.fromEntries(LINEAR_LB1_CODEX_READ_CAPABILITIES.map((name) => [name, 0]));
  const successfulCounts = Object.fromEntries(LINEAR_LB1_CODEX_READ_CAPABILITIES.map((name) => [name, 0]));
  for (let index = 0; index < receipt.call_ledger.length; index += 1) {
    const row = receipt.call_ledger[index];
    if (!exactKeys(row, CALL_FIELDS) || row.sequence !== index + 1 || !allowed.has(row.capability)
        || !HASH_REF.test(row.input_sha256) || !HASH_REF.test(row.output_sha256) || typeof row.is_error !== "boolean") {
      fail("linear_lb1_physical_effect_receipt_invalid");
    }
    counts[row.capability] += 1;
    if (!row.is_error) successfulCounts[row.capability] += 1;
  }
  if (!exactKeys(receipt.capability_counts, LINEAR_LB1_CODEX_READ_CAPABILITIES)) {
    fail("linear_lb1_physical_effect_receipt_invalid");
  }
  for (const name of LINEAR_LB1_CODEX_READ_CAPABILITIES) {
    if (receipt.capability_counts[name] !== counts[name]) fail("linear_lb1_physical_effect_receipt_invalid");
  }
  const firstCatalog = pages.find((page) => page?.catalog !== null)?.catalog;
  const issueCount = pages.reduce((count, page) => count + (Array.isArray(page?.issues) ? page.issues.length : 0), 0);
  const teamCount = Array.isArray(firstCatalog?.teams) ? firstCatalog.teams.length : 0;
  const requiredSuccesses = {
    mcp__codex_apps__linear_get_issue: issueCount,
    mcp__codex_apps__linear_get_team: teamCount,
    mcp__codex_apps__linear_get_workspace: 1,
    mcp__codex_apps__linear_list_comments: issueCount,
    mcp__codex_apps__linear_list_issue_labels: 1,
    mcp__codex_apps__linear_list_issue_statuses: teamCount,
    mcp__codex_apps__linear_list_issues: pages.length,
    mcp__codex_apps__linear_list_projects: 1,
    mcp__codex_apps__linear_list_teams: 1,
    mcp__codex_apps__linear_list_users: 1,
  };
  for (const [name, minimum] of Object.entries(requiredSuccesses)) {
    if (successfulCounts[name] < minimum) fail("linear_lb1_physical_effect_receipt_invalid");
  }
  if (receipt.call_ledger_sha256 !== hashRef({
    schema_version: "soulforge.backup_controller.linear_lb1.connector_call_ledger.v0",
    calls: receipt.call_ledger,
  })) fail("linear_lb1_physical_effect_receipt_invalid");
  return deepFreeze(receipt);
}

function validateConfig(rawConfig) {
  const config = plainSnapshot(rawConfig, "linear_lb1_physical_config_invalid");
  if (!exactKeys(config, CONFIG_FIELDS) || config.schema_version !== LINEAR_LB1_PHYSICAL_CONFIG_SCHEMA_VERSION
      || !PATH_SEGMENT_ID.test(config.run_key) || !exactRef(config.claim_store_ref)
      || !exactRef(config.single_use_token_ref) || !exactRef(config.storage_adapter_ref)
      || !exactRef(config.connector_binding_ref) || !Array.isArray(config.writer_identities)
      || config.writer_identities.length < 1 || config.writer_identities.some((item) => typeof item !== "string" || item.length < 1)
      || !exactKeys(config.reader_binding, READER_FIELDS) || !exactRef(config.reader_binding.adapter_ref)
      || !exactRef(config.reader_binding.workspace_ref) || !exactRef(config.reader_binding.credential_ref)
      || !exactRef(config.reader_binding.attachment_policy_ref)
      || !Array.isArray(config.reader_binding.approved_attachment_ids)
      || config.reader_binding.attachment_policy_ref.content_id
        !== linearLb1AttachmentAllowlistContentId(config.reader_binding.approved_attachment_ids)
      || config.connector_binding_ref.content_id !== linearLb1ConnectorBindingContentId(config.reader_binding.workspace_ref)) {
    fail("linear_lb1_physical_config_invalid");
  }
  config.control_root = safeAbsolutePath(config.control_root, "linear_lb1_physical_control_root_invalid");
  config.claim_root = safeAbsolutePath(config.claim_root, "linear_lb1_physical_claim_root_invalid");
  config.data_root = safeAbsolutePath(config.data_root, "linear_lb1_physical_data_root_invalid");
  config.generation_root = safeAbsolutePath(config.generation_root, "linear_lb1_physical_generation_root_invalid");
  config.approved_recovery_parent = safeAbsolutePath(config.approved_recovery_parent, "linear_lb1_physical_recovery_root_invalid");
  config.recovery_root = safeAbsolutePath(config.recovery_root, "linear_lb1_physical_recovery_root_invalid");
  config.writer_identities = canonicalWriterIdentities(config.writer_identities);
  const limits = config.reader_binding.resource_limits;
  if (!isPlainRecord(limits) || !exactKeys(limits, RESOURCE_LIMIT_FIELDS)
      || !Number.isSafeInteger(limits.max_pages) || limits.max_pages < 1 || limits.max_pages > 10_000
      || !Number.isSafeInteger(limits.max_issues) || limits.max_issues < 1 || limits.max_issues > 100_000
      || !Number.isSafeInteger(limits.max_total_bytes) || limits.max_total_bytes < 1 || limits.max_total_bytes > 1_073_741_824
      || !Number.isSafeInteger(limits.max_runtime_ms) || limits.max_runtime_ms < 1_000 || limits.max_runtime_ms > 3_600_000) {
    fail("linear_lb1_physical_resource_limits_invalid");
  }
  if (!strictDescendant(config.claim_root, config.control_root)
      || relative(config.data_root, config.generation_root) !== join("60_BACKUP_GENERATIONS", "linear")
      || !strictDescendant(config.recovery_root, config.approved_recovery_parent)
      || pathsOverlap(config.control_root, config.data_root)
      || pathsOverlap(config.control_root, config.approved_recovery_parent)
      || pathsOverlap(config.data_root, config.approved_recovery_parent)
      || pathsOverlap(config.claim_root, config.generation_root)
      || pathsOverlap(config.claim_root, config.recovery_root)
      || pathsOverlap(config.generation_root, config.recovery_root)) {
    fail("linear_lb1_physical_path_scope_invalid");
  }
  return config;
}

function assertGateRuntime(config, nowIso) {
  const gate = evaluateLinearLb1OwnerGateV2(config.owner_packet, config.trusted_pin);
  if (gate.gate.status !== "READY_FOR_ONE_SHOT") fail("linear_lb1_physical_owner_gate_hold");
  if (!sameRef(config.owner_packet.source.workspace_ref, config.reader_binding.workspace_ref)
      || !sameRef(config.owner_packet.source.credential_ref, config.reader_binding.credential_ref)
      || !sameRef(config.owner_packet.claim_store.claim_store_ref, config.claim_store_ref)
      || !sameRef(config.owner_packet.claim_store.single_use_token_ref, config.single_use_token_ref)
      || !sameRef(config.owner_packet.adapters.linear_reader_adapter_ref, config.reader_binding.adapter_ref)
      || !sameRef(config.owner_packet.adapters.storage_adapter_ref, config.storage_adapter_ref)
      || !sameRef(config.owner_packet.adapters.attachment_policy_ref, config.reader_binding.attachment_policy_ref)
      || config.owner_packet.adapters.attachment_allowlist_sha256
        !== linearLb1AttachmentAllowlistContentId(config.reader_binding.approved_attachment_ids)
      || config.owner_packet.target.kind !== "private_data_root_generation"
      || config.owner_packet.target.target_ref.content_id
        !== linearLb1GenerationTargetContentId(config.data_root, config.generation_root)
      || config.claim_store_ref.content_id
        !== linearLb1ClaimStoreContentId(config.control_root, config.claim_root, config.writer_identities)
      || config.storage_adapter_ref.content_id !== linearLb1PhysicalBindingContentId({
        control_root: config.control_root,
        claim_root: config.claim_root,
        data_root: config.data_root,
        generation_root: config.generation_root,
        approved_recovery_parent: config.approved_recovery_parent,
        recovery_root: config.recovery_root,
        writer_identities: config.writer_identities,
        reader_resource_limits: config.reader_binding.resource_limits,
      })
      || config.owner_packet.target.storage_write_authority_ref.content_id !== config.storage_adapter_ref.content_id
      || config.owner_packet.resource_limits.max_issues !== config.reader_binding.resource_limits.max_issues
      || config.owner_packet.resource_limits.max_total_bytes !== config.reader_binding.resource_limits.max_total_bytes
      || config.owner_packet.resource_limits.max_runtime_ms !== config.reader_binding.resource_limits.max_runtime_ms) {
    fail("linear_lb1_physical_owner_binding_mismatch");
  }
  const now = Date.parse(nowIso);
  if (!strictIso(nowIso) || now < Date.parse(config.owner_packet.owner_decision.approved_at_utc)
      || now >= Date.parse(config.owner_packet.owner_decision.expires_at_utc)
      || now < Date.parse(config.trusted_pin.valid_at) || now >= Date.parse(config.trusted_pin.expires_at)) {
    fail("linear_lb1_physical_owner_gate_expired");
  }
  return gate;
}

async function writeCreateOnly(path, bytes) {
  let handle;
  try {
    handle = await open(path, FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL);
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    if (error?.code === "EEXIST") fail("linear_lb1_physical_create_only_collision");
    if (error instanceof LinearLb1PhysicalError) throw error;
    fail("linear_lb1_physical_write_failed");
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function readJsonFile(path, code) {
  let bytes;
  try { bytes = await readFile(path); } catch { fail(code); }
  if (bytes.length < 2 || bytes.length > 1_048_576) fail(code);
  try { return JSON.parse(bytes.toString("utf8")); } catch { fail(code); }
}

async function readSettledClaimAfterCollision(path) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const bytes = await readFile(path);
      if (bytes.length >= 2 && bytes.length <= 1_048_576) {
        const parsed = JSON.parse(bytes.toString("utf8"));
        if (isPlainRecord(parsed)) return parsed;
      }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
  fail("linear_lb1_physical_claim_reconciliation_required");
}

function sameClaimBinding(left, right) {
  if (!exactKeys(left, CLAIM_RECORD_FIELDS) || !exactRef(left.session_ref)
      || !Number.isSafeInteger(left.session_pid) || left.session_pid <= 0
      || !HASH_REF.test(left.session_host_ref) || !strictIso(left.claimed_at)) return false;
  const fields = [
    "schema_version", "claim_store_ref", "single_use_token_ref", "run_key", "owner_packet_sha256",
    "writer_id", "writer_epoch", "expires_at",
  ];
  return fields.every((field) => stableJson(left[field]) === stableJson(right[field]));
}

async function writeStateReceipt(stateRoot, fileName, body) {
  if (!PATH_SEGMENT_ID.test(fileName.replace(/\.json$/u, ""))) fail("linear_lb1_physical_state_invalid");
  await writeCreateOnly(join(stateRoot, fileName), Buffer.from(`${stableJson(body)}\n`, "utf8"));
}

export async function beginLinearLb1PhysicalSession(rawConfig, options = {}) {
  const config = validateConfig(rawConfig);
  const clock = options.clock ?? { nowIso: () => new Date().toISOString(), nowMs: () => Date.now() };
  const aclProbe = options.aclProbe ?? defaultAclProbe;
  const processProbe = options.processProbe ?? defaultProcessProbe;
  if (options.faultAt !== undefined && options.testOnly !== true) fail("linear_lb1_physical_options_invalid");
  const nowIso = clock.nowIso();
  const gate = assertGateRuntime(config, nowIso);
  await assertExistingDirectory(config.control_root, "linear_lb1_physical_control_root_invalid");
  await assertExistingDirectory(config.data_root, "linear_lb1_physical_data_root_invalid");
  await assertExistingDirectory(config.approved_recovery_parent, "linear_lb1_physical_recovery_root_invalid");
  await assertExistingDirectory(config.recovery_root, "linear_lb1_physical_recovery_root_invalid");
  for (const path of [config.control_root, config.data_root, config.recovery_root]) {
    if (await aclProbe(path, config.writer_identities) !== true) fail("linear_lb1_physical_acl_not_writer_exclusive");
  }
  if ((await readdir(config.recovery_root)).length !== 0) fail("linear_lb1_physical_recovery_root_not_empty");
  const createdDirectories = [];
  await ensureDirectoryChain(config.control_root, config.claim_root, createdDirectories);
  if (await aclProbe(config.claim_root, config.writer_identities) !== true) {
    fail("linear_lb1_physical_acl_not_writer_exclusive");
  }
  const stateRoot = join(config.claim_root, `${config.single_use_token_ref.content_id.slice("sha256:".length)}.state`);
  if (existsSync(stateRoot)) await assertExistingDirectory(stateRoot, "linear_lb1_physical_state_invalid");
  else {
    try { await mkdir(stateRoot); }
    catch (error) { if (error?.code !== "EEXIST") fail("linear_lb1_physical_state_invalid"); }
    await assertExistingDirectory(stateRoot, "linear_lb1_physical_state_invalid");
  }
  const hostRef = hashRef({
    hostname: config.owner_packet.writer_identity.hostname,
    writer_identities: config.writer_identities,
  });
  const initialSessionRef = receiptRef("linear_physical_session", {
    run_key: config.run_key,
    single_use_token_ref: config.single_use_token_ref,
    random_nonce_sha256: `sha256:${sha256Bytes(randomBytes(32))}`,
  });
  let sessionRef = initialSessionRef;
  let claimRecord = {
    schema_version: "soulforge.backup_controller.linear_lb1.durable_claim.v0",
    claim_store_ref: config.claim_store_ref,
    single_use_token_ref: config.single_use_token_ref,
    run_key: config.run_key,
    owner_packet_sha256: gate.receipt.packet_sha256,
    writer_id: config.owner_packet.writer_identity.writer_id,
    writer_epoch: config.owner_packet.writer_identity.epoch,
    claimed_at: nowIso,
    expires_at: config.owner_packet.owner_decision.expires_at_utc,
    session_ref: initialSessionRef,
    session_pid: process.pid,
    session_host_ref: hostRef,
  };
  if (!exactKeys(claimRecord, CLAIM_RECORD_FIELDS)) fail("linear_lb1_physical_claim_invalid");
  const claimPath = join(config.claim_root, claimFileName(config.single_use_token_ref));
  let claimCreated = true;
  try {
    const handle = await open(claimPath, FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL);
    try { await handle.writeFile(`${stableJson(claimRecord)}\n`, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
  } catch (error) {
    if (error?.code === "EEXIST") {
      claimCreated = false;
      const existing = await readSettledClaimAfterCollision(claimPath);
      if (!sameClaimBinding(existing, claimRecord)) {
        fail("linear_lb1_physical_claim_conflict");
      }
      claimRecord = existing;
    } else {
      if (error instanceof LinearLb1PhysicalError) throw error;
      fail("linear_lb1_physical_claim_write_failed");
    }
  }
  if (claimCreated && options.faultAt === "after_claim_sync") {
    fail("linear_lb1_physical_fault_injected");
  }
  const claimReceiptRef = receiptRef("linear_durable_claim", claimRecord);
  const existingState = await readdir(stateRoot);
  let latestSequence = 0;
  let latestLease = {
    session_ref: claimRecord.session_ref,
    claim_receipt_ref: claimReceiptRef,
    host_ref: claimRecord.session_host_ref,
    pid: claimRecord.session_pid,
    acquired_at: claimRecord.claimed_at,
    expires_at: claimRecord.expires_at,
  };
  for (const fileName of existingState) {
    const match = fileName.match(/^00-session-(\d{6})\.json$/u);
    if (!match) {
      if (!claimCreated) fail("linear_lb1_physical_claim_reconciliation_required");
      fail("linear_lb1_physical_state_invalid");
    }
    const lease = await readJsonFile(join(stateRoot, fileName), "linear_lb1_physical_claim_reconciliation_required");
    if (lease?.schema_version !== "soulforge.backup_controller.linear_lb1.session_lease.v0"
        || !exactRef(lease.session_ref) || !sameRef(lease.claim_receipt_ref, claimReceiptRef)
        || lease.host_ref !== hostRef || !Number.isSafeInteger(lease.pid) || !strictIso(lease.acquired_at)
        || !strictIso(lease.expires_at)) fail("linear_lb1_physical_claim_reconciliation_required");
    const sequence = Number(match[1]);
    if (!Number.isSafeInteger(sequence) || sequence <= latestSequence) fail("linear_lb1_physical_claim_reconciliation_required");
    latestSequence = sequence;
    latestLease = lease;
  }
  if (!claimCreated) {
    const live = processProbe(latestLease.pid, latestLease.host_ref);
    if (live !== true && live !== false) fail("linear_lb1_physical_options_invalid");
    if (live === true) fail("linear_lb1_physical_concurrent_session");
    const nextSequence = latestSequence + 1;
    if (nextSequence > 999_999) fail("linear_lb1_physical_claim_reconciliation_required");
    sessionRef = receiptRef("linear_physical_resume_session", {
      claim_receipt_ref: claimReceiptRef,
      sequence: nextSequence,
      random_nonce_sha256: `sha256:${sha256Bytes(randomBytes(32))}`,
    });
    try {
      await writeStateReceipt(stateRoot, `00-session-${String(nextSequence).padStart(6, "0")}.json`, {
        schema_version: "soulforge.backup_controller.linear_lb1.session_lease.v0",
        session_ref: sessionRef,
        claim_receipt_ref: claimReceiptRef,
        host_ref: hostRef,
        pid: process.pid,
        acquired_at: nowIso,
        expires_at: claimRecord.expires_at,
      });
    } catch (error) {
      if (error instanceof LinearLb1PhysicalError && error.code === "linear_lb1_physical_create_only_collision") {
        fail("linear_lb1_physical_concurrent_session");
      }
      throw error;
    }
  }
  await ensureDirectoryChain(config.data_root, config.generation_root, createdDirectories);
  if (await aclProbe(config.generation_root, config.writer_identities) !== true) {
    fail("linear_lb1_physical_acl_not_writer_exclusive");
  }
  let completed = false;
  return Object.freeze({
    ready_receipt: deepFreeze({
      schema_version: "soulforge.backup_controller.linear_lb1.physical_ready_receipt.v0",
      status: claimCreated ? "CLAIM_READY" : "CLAIM_RESUME_READY",
      run_key: config.run_key,
      claim_receipt_ref: claimReceiptRef,
      session_ref: sessionRef,
      claimed_at: claimRecord.claimed_at,
      claim_durability: "exclusive_file_create_plus_file_handle_sync",
      resumed: !claimCreated,
      owner_packet_sha256: gate.receipt.packet_sha256,
      created_directory_count: createdDirectories.length,
      effects: { durable_claim_writes: claimCreated ? 1 : 0, generation_writes: 0, restore_writes: 0, linear_mutations: 0 },
    }),
    async complete(rawCapture) {
      if (completed) fail("linear_lb1_physical_session_already_completed");
      completed = true;
      const capture = plainSnapshot(rawCapture, "linear_lb1_physical_capture_invalid", { privatePayload: true });
      if (!exactKeys(capture, CAPTURE_FIELDS) || capture.schema_version !== LINEAR_LB1_PHYSICAL_CAPTURE_SCHEMA_VERSION
          || !Array.isArray(capture.pages) || capture.pages.length < 1) fail("linear_lb1_physical_capture_invalid");
      const captureObservedAt = clock.nowIso();
      if (!strictIso(captureObservedAt)) fail("linear_lb1_physical_clock_invalid");
      assertGateRuntime(config, captureObservedAt);
      await writeStateReceipt(stateRoot, "01-capture-attempt.json", {
        schema_version: "soulforge.backup_controller.linear_lb1.capture_attempt.v0",
        session_ref: sessionRef,
        claim_receipt_ref: claimReceiptRef,
        capture_bundle_sha256: hashRef(capture),
        observed_at: captureObservedAt,
      });
      const effectReceipt = validateEffectReceipt(capture.effect_receipt, {
        connectorBindingRef: config.connector_binding_ref,
        workspaceRef: config.reader_binding.workspace_ref,
        pages: capture.pages,
        claimReceiptRef,
        sessionRef,
        claimedAt: claimRecord.claimed_at,
        observedAt: captureObservedAt,
      });
      const effectReceiptRef = receiptRef("linear_connector_effect", effectReceipt);
      const connectorErrorCalls = effectReceipt.call_ledger.filter((row) => row.is_error).length;
      await writeStateReceipt(stateRoot, "02-effect-receipt.json", {
        schema_version: "soulforge.backup_controller.linear_lb1.effect_receipt_ref.v0",
        effect_receipt_ref: effectReceiptRef,
        call_ledger_sha256: effectReceipt.call_ledger_sha256,
        network_calls_observed: effectReceipt.network_calls,
        connector_error_calls_observed: connectorErrorCalls,
        mutation_calls_observed: effectReceipt.linear_mutations,
        evidence_state: effectReceipt.evidence_state,
        observed_at: captureObservedAt,
      });
      let pageIndex = 0;
      const reader = createLinearLb1ActualReader({
        feature_state: "actual_read_only",
        adapter_ref: config.reader_binding.adapter_ref,
        workspace_ref: config.reader_binding.workspace_ref,
        credential_ref: config.reader_binding.credential_ref,
        attachment_policy_ref: config.reader_binding.attachment_policy_ref,
        approved_attachment_ids: config.reader_binding.approved_attachment_ids,
        resource_limits: config.reader_binding.resource_limits,
        clock,
        async readPage() {
          if (pageIndex >= capture.pages.length) fail("linear_lb1_physical_page_underflow");
          const page = capture.pages[pageIndex];
          pageIndex += 1;
          return page;
        },
      });
      const sourceScope = config.owner_packet.source;
      const collection = await reader.collectSnapshot(sourceScope);
      const run = buildImmutableLinearLb1BackupRunV2({ run_key: config.run_key, collection });
      const bytes = serializeBackupRunV2(run);
      assertGateRuntime(config, clock.nowIso());
      const generationDirectory = join(config.generation_root, config.run_key);
      try { await mkdir(generationDirectory); }
      catch (error) {
        if (error?.code === "EEXIST") fail("linear_lb1_physical_create_only_collision");
        fail("linear_lb1_physical_write_failed");
      }
      await assertExistingDirectory(generationDirectory, "linear_lb1_physical_path_invalid");
      const generationPath = join(generationDirectory, "run.json");
      await writeCreateOnly(generationPath, bytes);
      const storedBytes = await readFile(generationPath);
      if (storedBytes.length !== bytes.length || sha256Bytes(storedBytes) !== sha256Bytes(bytes)) {
        fail("linear_lb1_physical_readback_mismatch");
      }
      const storedRun = deserializeBackupRunV2(storedBytes);
      const generationDigest = `sha256:${sha256Bytes(storedBytes)}`;
      const generationRef = receiptRef("linear_generation", {
        run_key: config.run_key,
        generation_digest: generationDigest,
        manifest_sha256: storedRun.manifest.manifest_sha256,
      });
      await writeCreateOnly(join(generationDirectory, "effect-receipt.json"), Buffer.from(`${stableJson(effectReceipt)}\n`, "utf8"));
      const generationReceipt = {
        schema_version: "soulforge.backup_controller.linear_lb1.generation_receipt.v0",
        run_key: config.run_key,
        generation_ref: generationRef,
        generation_digest: generationDigest,
        byte_length: storedBytes.length,
        manifest_sha256: storedRun.manifest.manifest_sha256,
        run_status: storedRun.run_status,
        missing_dimensions: storedRun.manifest.coverage.missing_dimensions,
        claim_receipt_ref: claimReceiptRef,
        connector_binding_ref: effectReceipt.binding_ref,
        connector_effect_receipt_ref: effectReceiptRef,
        connector_call_ledger_sha256: effectReceipt.call_ledger_sha256,
        connector_effect_evidence_state: effectReceipt.evidence_state,
        connector_error_calls_observed: connectorErrorCalls,
        exact_byte_readback: true,
        durability_evidence: "file_handle_sync_plus_exact_byte_readback",
        overwrite_allowed: false,
        prune_or_delete_allowed: false,
      };
      await writeCreateOnly(join(generationDirectory, "receipt.json"), Buffer.from(`${stableJson(generationReceipt)}\n`, "utf8"));
      await writeStateReceipt(stateRoot, "03-generation-readback.json", {
        schema_version: "soulforge.backup_controller.linear_lb1.generation_state.v0",
        generation_ref: generationRef,
        generation_digest: generationDigest,
        connector_effect_receipt_ref: effectReceiptRef,
        exact_byte_readback: true,
      });
      let restoreReceipt = null;
      if (storedRun.revision !== null) {
        assertGateRuntime(config, clock.nowIso());
        const restoreDirectory = join(config.recovery_root, config.run_key);
        try { await mkdir(restoreDirectory); }
        catch (error) {
          if (error?.code === "EEXIST") fail("linear_lb1_physical_create_only_collision");
          fail("linear_lb1_physical_restore_write_failed");
        }
        await assertExistingDirectory(restoreDirectory, "linear_lb1_physical_path_invalid");
        const restorePath = join(restoreDirectory, "run.json");
        await writeCreateOnly(restorePath, storedBytes);
        const restoredBytes = await readFile(restorePath);
        if (restoredBytes.length !== storedBytes.length || sha256Bytes(restoredBytes) !== sha256Bytes(storedBytes)) {
          fail("linear_lb1_physical_restore_readback_mismatch");
        }
        const restoredRun = deserializeBackupRunV2(restoredBytes);
        const check = checkLinearLb1RestoreV2(storedRun, restoredRun.revision.snapshot, {
          artifact_kinds: ["immutable_revision"],
        });
        restoreReceipt = {
          schema_version: "soulforge.backup_controller.linear_lb1.restore_receipt.v0",
          restore_ref: receiptRef("linear_restore", {
            generation_ref: generationRef,
            restored_digest: `sha256:${sha256Bytes(restoredBytes)}`,
          }),
          generation_ref: generationRef,
          exact_byte_readback: true,
          parity_complete: check.complete,
          reconstructable_dimensions: check.reconstructable_dimensions,
          missing_dimensions: check.missing_dimensions,
          human_acceptance: false,
        };
        await writeCreateOnly(join(restoreDirectory, "receipt.json"), Buffer.from(`${stableJson(restoreReceipt)}\n`, "utf8"));
        await writeStateReceipt(stateRoot, "04-restore-readback.json", {
          schema_version: "soulforge.backup_controller.linear_lb1.restore_state.v0",
          restore_ref: restoreReceipt.restore_ref,
          generation_ref: generationRef,
          exact_byte_readback: true,
          parity_complete: restoreReceipt.parity_complete,
        });
      }
      const result = deepFreeze({
        schema_version: "soulforge.backup_controller.linear_lb1.physical_result.v0",
        status: storedRun.run_status === "failed" ? "HOLD_FAILED_COLLECTION"
          : storedRun.run_status === "complete" ? "COMPLETE_TECHNICAL_RESTORE_CANDIDATE"
            : "PARTIAL_TECHNICAL_RESTORE_CANDIDATE",
        run_key: config.run_key,
        claim_receipt_ref: claimReceiptRef,
        generation: generationReceipt,
        restore: restoreReceipt,
        connector_effects: {
          binding_ref: effectReceipt.binding_ref,
          effect_receipt_ref: effectReceiptRef,
          network_calls_observed: effectReceipt.network_calls,
          connector_error_calls_observed: connectorErrorCalls,
          linear_mutations_observed: effectReceipt.linear_mutations,
          evidence_state: effectReceipt.evidence_state,
          call_ledger_sha256: effectReceipt.call_ledger_sha256,
        },
        effects: { durable_claim_writes: claimCreated ? 1 : 0, generation_writes: 3, restore_writes: restoreReceipt === null ? 0 : 2, linear_mutations_observed: 0 },
        official_task_done: false,
        human_acceptance: false,
        claim_ceiling: "technical_restore_candidate_only",
      });
      await writeStateReceipt(stateRoot, "05-complete.json", {
        schema_version: "soulforge.backup_controller.linear_lb1.physical_terminal_state.v0",
        status: result.status,
        generation_ref: generationRef,
        restore_ref: restoreReceipt?.restore_ref ?? null,
        connector_effect_receipt_ref: effectReceiptRef,
        human_acceptance: false,
      });
      return result;
    },
  });
}

export async function readLinearLb1PhysicalConfig(configPath) {
  const path = safeAbsolutePath(configPath, "linear_lb1_physical_config_path_invalid");
  let stat;
  let actualPath;
  try { stat = await lstat(path); actualPath = await realpath(path); }
  catch { fail("linear_lb1_physical_config_read_failed"); }
  if (!stat.isFile() || stat.isSymbolicLink() || !pathEqual(path, actualPath)) {
    fail("linear_lb1_physical_config_read_failed");
  }
  let bytes;
  try { bytes = await readFile(path); } catch { fail("linear_lb1_physical_config_read_failed"); }
  if (bytes.length < 2 || bytes.length > 1_048_576) fail("linear_lb1_physical_config_read_failed");
  try {
    const config = JSON.parse(bytes.toString("utf8"));
    const controlRoot = safeAbsolutePath(config?.control_root, "linear_lb1_physical_config_invalid");
    if (!strictDescendant(path, controlRoot)) fail("linear_lb1_physical_config_path_invalid");
    return config;
  } catch (error) {
    if (error instanceof LinearLb1PhysicalError) throw error;
    fail("linear_lb1_physical_config_invalid");
  }
}
