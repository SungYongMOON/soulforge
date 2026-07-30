import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalize,
  normalizeUtc,
  operationalNonAcceptanceReceipt,
} from "./five_field_recovery_contract.mjs";

export const RUNTIME_PREFLIGHT_V1_INPUT_SCHEMA =
  "soulforge.five_field_runtime_preflight_input.v1";
export const RUNTIME_PREFLIGHT_INPUT_SCHEMA =
  "soulforge.five_field_runtime_preflight_input.v2";
export const RUNTIME_PREFLIGHT_RECEIPT_SCHEMA =
  "soulforge.five_field_runtime_preflight_receipt.v2";

export const LEASE_TTL_MINUTES_MIN = 15;
export const LEASE_TTL_MINUTES_MAX = 120;
export const LEASE_TTL_FORMULA =
  "expires_at=acquired_at+ttl_minutes";
export const WRITER_EPOCH_FORMULA =
  "max(restored_writer_epoch,authority_writer_epoch,receipt_writer_epoch,0)+1";
export const STALE_RECOVERY_POLICY =
  "same_host_dead_pid_expired_owner_approved";
export const WORKTREE_INVENTORY_SOURCE_CLASSIFICATION =
  "filesystem_metadata_only";
export const WORKTREE_INVENTORY_TOOL_CLASSIFICATION =
  "owner_approved_read_only_inventory_probe_v1";

const ATTESTATION_MAX_AGE_MS = 15 * 60 * 1000;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const PUBLIC_HEAD_REF_RE =
  /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u;
const LOGICAL_REMOTE_RE = /^[a-z0-9][a-z0-9._-]{0,119}$/u;
const TRANSPORT_CLASSES = new Set(["local", "https", "ssh"]);
const ROOT_LABELS = Object.freeze([
  "runner",
  "source",
  "writer_workmeta",
  "writer_private_state",
  "config",
  "locks",
]);
const ROOT_BASENAMES = Object.freeze({
  runner: "runner",
  source: "source",
  writer_workmeta: "writer-workmeta",
  writer_private_state: "writer-private-state",
  config: "config",
  locks: "locks",
});
const GUARDED_ROOT_LABELS = Object.freeze([
  "active_public_root",
  "active_workmeta",
  "active_private_state",
  "automation_control_root",
]);
export const RUNTIME_FORBIDDEN_ROOT_KINDS = Object.freeze([
  ...GUARDED_ROOT_LABELS,
  "codex_worktree",
  "orca_worktree",
]);
const FORBIDDEN_KIND_SET = new Set(RUNTIME_FORBIDDEN_ROOT_KINDS);
const FORBIDDEN_KEY_RE =
  /^(?:raw|chat|payload|body|messages?|transcript|credentials?|tokens?|owner_token|passwords?|cookies?|sessions?|remote_url|url|userinfo|signature|private_key|public_key)$/iu;
const SECRET_RE =
  /(?:ghp_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization|bearer|credential|cookie)\s*[:=]\s*\S+)/iu;
const URL_RE = /(?:^[a-z][a-z0-9+.-]*:\/\/|^git@)/iu;

class PreflightError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new PreflightError(code);
}

function exactKeys(value, allowed, code) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))
    || allowed.some((key) => !Object.hasOwn(value, key))
  ) fail(code);
}

function rejectSensitive(value, key = null) {
  if (key && FORBIDDEN_KEY_RE.test(key)) {
    if (
      ["remote_url", "credential", "owner_token"].includes(key)
      && value === "capture_prohibited"
    ) return;
    fail("input_boundary_invalid");
  }
  if (Array.isArray(value)) {
    for (const item of value) rejectSensitive(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      rejectSensitive(child, childKey);
    }
    return;
  }
  if (
    typeof value === "string"
    && (SECRET_RE.test(value) || URL_RE.test(value))
  ) fail("input_boundary_invalid");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function comparablePath(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathContains(root, target) {
  const rel = relative(root, target);
  return rel === "" || (
    rel !== ".."
    && !rel.startsWith(`..${sep}`)
    && !isAbsolute(rel)
  );
}

function exactDirectoryRealpath(value, code) {
  if (
    typeof value !== "string"
    || !isAbsolute(value)
    || /[\0\r\n]/u.test(value)
  ) fail(code);
  let physical;
  let stat;
  try {
    physical = realpathSync.native(resolve(value));
    stat = lstatSync(resolve(value));
  } catch {
    fail(code);
  }
  if (
    comparablePath(physical) !== comparablePath(value)
    || !stat.isDirectory()
    || stat.isSymbolicLink()
  ) fail(code);
  return physical;
}

function exactFileRealpath(value, code) {
  if (
    typeof value !== "string"
    || !isAbsolute(value)
    || /[\0\r\n]/u.test(value)
  ) fail(code);
  let physical;
  let stat;
  try {
    physical = realpathSync.native(resolve(value));
    stat = lstatSync(resolve(value));
  } catch {
    fail(code);
  }
  if (
    comparablePath(physical) !== comparablePath(value)
    || !stat.isFile()
    || stat.isSymbolicLink()
  ) fail(code);
  return physical;
}

function assertPairwiseDisjoint(roots, code = "runtime_roots_overlap") {
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (
        pathContains(roots[left], roots[right])
        || pathContains(roots[right], roots[left])
      ) fail(code);
    }
  }
}

function assertDigest(value, code) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail(code);
}

function sortedUniqueDigests(values, code) {
  if (!Array.isArray(values) || values.some((value) => !DIGEST_RE.test(value))) {
    fail(code);
  }
  const expected = [...new Set(values)].sort();
  if (canonicalize(values) !== canonicalize(expected)) fail(code);
  return expected;
}

export function runtimeAttestationDigest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("attestation_contract_invalid");
  }
  const body = { ...value };
  delete body.attestation_digest;
  return sha256(canonicalize(body));
}

function assertCanonicalAttestation(value, code) {
  assertDigest(value.attestation_digest, code);
  if (value.attestation_digest !== runtimeAttestationDigest(value)) fail(code);
}

export function runtimePathDigest(value) {
  const physical = exactDirectoryRealpath(value, "runtime_path_digest_invalid");
  return sha256(`runtime_path\0${comparablePath(physical)}`);
}

export function runtimeRootSetDigest(rows) {
  if (
    !Array.isArray(rows)
    || rows.some((row) =>
      !row
      || typeof row !== "object"
      || Array.isArray(row)
      || !FORBIDDEN_KIND_SET.has(row.kind)
      || typeof row.path !== "string")
  ) fail("runtime_root_set_invalid");
  const values = rows.map((row) =>
    `${row.kind}\0${runtimePathDigest(row.path)}`).sort();
  if (new Set(values).size !== values.length) fail("forbidden_root_duplicate");
  return sha256(canonicalize(values));
}

export function runtimeLatestReceiptDigest(
  workmetaReceiptDigest,
  privateStateReceiptDigest,
) {
  assertDigest(
    workmetaReceiptDigest,
    "workmeta_backup_receipt_digest_invalid",
  );
  assertDigest(
    privateStateReceiptDigest,
    "private_state_backup_receipt_digest_invalid",
  );
  return sha256(canonicalize({
    workmeta_backup_receipt_digest: workmetaReceiptDigest,
    private_state_backup_receipt_digest: privateStateReceiptDigest,
  }));
}

function normalizedNow(options) {
  const candidate = options?.now ?? new Date();
  const parsed = candidate instanceof Date ? candidate : new Date(candidate);
  if (!Number.isFinite(parsed.valueOf())) fail("preflight_clock_invalid");
  return parsed.valueOf();
}

function assertFreshWindow(value, code, nowMs) {
  const observed = new Date(normalizeUtc(value.observed_at, code)).valueOf();
  const expires = new Date(normalizeUtc(value.expires_at, code)).valueOf();
  if (
    expires <= observed
    || expires - observed > ATTESTATION_MAX_AGE_MS
    || nowMs < observed
    || nowMs >= expires
  ) fail(code);
}

function validateInventoryGroup(group, actualDigests, code) {
  exactKeys(
    group,
    ["count", "zero_count", "root_digests"],
    `${code}_contract_invalid`,
  );
  const rootDigests = sortedUniqueDigests(
    group.root_digests,
    `${code}_digest_set_invalid`,
  );
  if (
    !Number.isSafeInteger(group.count)
    || group.count < 0
    || group.count !== rootDigests.length
    || group.zero_count !== (group.count === 0)
    || canonicalize(rootDigests) !== canonicalize(actualDigests)
  ) fail(`${code}_mismatch`);
}

function validateWorktreeInventory(inventory, forbiddenRows, nowMs) {
  exactKeys(inventory, [
    "observed_at",
    "expires_at",
    "source_classification",
    "tool_classification",
    "complete",
    "codex",
    "orca",
    "root_set_digest",
    "attestation_digest",
  ], "worktree_inventory_contract_invalid");
  if (
    inventory.source_classification
      !== WORKTREE_INVENTORY_SOURCE_CLASSIFICATION
    || inventory.tool_classification
      !== WORKTREE_INVENTORY_TOOL_CLASSIFICATION
  ) fail("worktree_inventory_classification_invalid");
  if (inventory.complete !== true) fail("worktree_inventory_incomplete");
  assertFreshWindow(inventory, "worktree_inventory_stale", nowMs);
  assertCanonicalAttestation(
    inventory,
    "worktree_inventory_attestation_invalid",
  );
  const codex = forbiddenRows
    .filter((row) => row.kind === "codex_worktree")
    .map((row) => runtimePathDigest(row.path))
    .sort();
  const orca = forbiddenRows
    .filter((row) => row.kind === "orca_worktree")
    .map((row) => runtimePathDigest(row.path))
    .sort();
  validateInventoryGroup(inventory.codex, codex, "codex_inventory");
  validateInventoryGroup(inventory.orca, orca, "orca_inventory");
  const expectedSetDigest = sha256(canonicalize({ codex, orca }));
  if (inventory.root_set_digest !== expectedSetDigest) {
    fail("worktree_inventory_root_set_mismatch");
  }
  return {
    codex,
    orca,
    rootSetDigest: expectedSetDigest,
  };
}

function validateAclEvidence(acl) {
  exactKeys(acl, [
    "status",
    "principal_intent",
    "runner_read_execute",
    "source_read_only",
    "config_read_only",
    "writers_modify",
    "locks_modify",
    "active_roots_write_denied",
    "attestation_digest",
  ], "acl_evidence_contract_invalid");
  if (
    acl.status !== "VERIFIED"
    || acl.principal_intent !== "dedicated_runner_least_privilege"
    || !acl.runner_read_execute
    || !acl.source_read_only
    || !acl.config_read_only
    || !acl.writers_modify
    || !acl.locks_modify
    || !acl.active_roots_write_denied
  ) fail("acl_evidence_missing");
  assertCanonicalAttestation(acl, "acl_attestation_invalid");
}

function validateAuthorityRow(row, code) {
  exactKeys(row, [
    "classification",
    "authority_fingerprint",
    "backup_receipt_digest",
  ], `${code}_contract_invalid`);
  if (row.classification !== "backup_recovery_included") {
    fail(`${code}_classification_invalid`);
  }
  assertDigest(row.authority_fingerprint, `${code}_fingerprint_invalid`);
  assertDigest(row.backup_receipt_digest, `${code}_receipt_invalid`);
}

function validateRestoreRow(
  row,
  authorityFingerprint,
  backupReceiptDigest,
  restoreManifestDigest,
  code,
) {
  exactKeys(
    row,
    [
      "status",
      "authority_fingerprint",
      "receipt_digest",
      "manifest_digest",
      "destination_binding_digest",
      "latest_receipt",
      "manifest_match",
      "hash_match",
      "ref_match",
      "remote_inclusion_verified",
      "monotonic_sequence",
      "monotonic_writer_epoch",
    ],
    `${code}_contract_invalid`,
  );
  if (
    row.status !== "VERIFIED"
    || row.authority_fingerprint !== authorityFingerprint
    || row.receipt_digest !== backupReceiptDigest
    || row.manifest_digest !== restoreManifestDigest
    || row.latest_receipt !== true
    || row.manifest_match !== true
    || row.hash_match !== true
    || row.ref_match !== true
    || row.remote_inclusion_verified !== true
    || row.monotonic_sequence !== true
    || row.monotonic_writer_epoch !== true
  ) fail(`${code}_authority_mismatch`);
  assertDigest(row.receipt_digest, `${code}_receipt_invalid`);
  assertDigest(row.manifest_digest, `${code}_manifest_invalid`);
  assertDigest(
    row.destination_binding_digest,
    `${code}_destination_binding_invalid`,
  );
}

function validateBackupRestoreEvidence(value, nowMs) {
  exactKeys(value, [
    "status",
    "observed_at",
    "expires_at",
    "authorities",
    "surface_classifications",
    "clone_state",
    "cursor_ledger_binding",
    "restore",
    "attestation_digest",
  ], "backup_restore_contract_invalid");
  if (value.status !== "VERIFIED") fail("backup_restore_evidence_missing");
  assertFreshWindow(value, "backup_restore_evidence_stale", nowMs);
  exactKeys(
    value.authorities,
    ["workmeta", "private_state"],
    "backup_authorities_contract_invalid",
  );
  validateAuthorityRow(value.authorities.workmeta, "workmeta_backup_authority");
  validateAuthorityRow(
    value.authorities.private_state,
    "private_state_backup_authority",
  );
  const expectedClassifications = {
    runner: "regenerable_excluded",
    source: "regenerable_excluded",
    writer_workmeta_clone: "regenerable_excluded",
    writer_private_state_clone: "regenerable_excluded",
    locks: "regenerable_excluded",
    execution_temp: "regenerable_excluded",
    config: "capture_prohibited",
    remote_url: "capture_prohibited",
    credential: "capture_prohibited",
    owner_token: "capture_prohibited",
    authoritative_ledger: "backup_restore_included",
    authoritative_cursor_authority: "backup_restore_included",
    redacted_receipt: "backup_restore_included",
  };
  exactKeys(
    value.surface_classifications,
    Object.keys(expectedClassifications),
    "backup_surface_classification_contract_invalid",
  );
  if (
    Object.entries(expectedClassifications).some(
      ([surface, classification]) =>
        value.surface_classifications[surface] !== classification,
    )
  ) fail("backup_surface_classification_invalid");
  exactKeys(value.clone_state, [
    "writer_workmeta_dirty",
    "writer_private_state_dirty",
    "writer_workmeta_unpushed_commits",
    "writer_private_state_unpushed_commits",
  ], "backup_clone_state_contract_invalid");
  if (
    value.clone_state.writer_workmeta_dirty !== false
    || value.clone_state.writer_private_state_dirty !== false
    || value.clone_state.writer_workmeta_unpushed_commits !== 0
    || value.clone_state.writer_private_state_unpushed_commits !== 0
  ) fail("backup_clone_unpublished_state_invalid");
  exactKeys(value.cursor_ledger_binding, [
    "status",
    "ledger_remote_inclusion_verified",
    "cursor_points_only_to_included_ledger",
    "included_ledger_digest",
    "cursor_binding_digest",
  ], "cursor_ledger_binding_contract_invalid");
  if (
    value.cursor_ledger_binding.status !== "VERIFIED"
    || value.cursor_ledger_binding.ledger_remote_inclusion_verified !== true
    || value.cursor_ledger_binding.cursor_points_only_to_included_ledger
      !== true
  ) fail("cursor_ledger_binding_invalid");
  assertDigest(
    value.cursor_ledger_binding.included_ledger_digest,
    "included_ledger_digest_invalid",
  );
  assertDigest(
    value.cursor_ledger_binding.cursor_binding_digest,
    "cursor_binding_digest_invalid",
  );
  exactKeys(value.restore, [
    "destination_class",
    "destination_root_digest",
    "latest_receipt_digest",
    "manifest_digest",
    "forbidden_root_clear",
    "excluded_surfaces_absent",
    "active_roots_untouched",
    "workmeta",
    "private_state",
  ], "restore_contract_invalid");
  if (
    value.restore.destination_class
      !== "isolated_scratch_non_authority"
    || value.restore.forbidden_root_clear !== true
    || value.restore.excluded_surfaces_absent !== true
    || value.restore.active_roots_untouched !== true
  ) fail("restore_destination_invalid");
  assertDigest(
    value.restore.destination_root_digest,
    "restore_destination_digest_invalid",
  );
  assertDigest(
    value.restore.latest_receipt_digest,
    "restore_latest_receipt_digest_invalid",
  );
  assertDigest(
    value.restore.manifest_digest,
    "restore_manifest_digest_invalid",
  );
  if (
    value.restore.latest_receipt_digest !== runtimeLatestReceiptDigest(
      value.authorities.workmeta.backup_receipt_digest,
      value.authorities.private_state.backup_receipt_digest,
    )
  ) fail("restore_latest_receipt_aggregate_mismatch");
  validateRestoreRow(
    value.restore.workmeta,
    value.authorities.workmeta.authority_fingerprint,
    value.authorities.workmeta.backup_receipt_digest,
    value.restore.manifest_digest,
    "workmeta_restore",
  );
  validateRestoreRow(
    value.restore.private_state,
    value.authorities.private_state.authority_fingerprint,
    value.authorities.private_state.backup_receipt_digest,
    value.restore.manifest_digest,
    "private_state_restore",
  );
  assertCanonicalAttestation(
    value,
    "backup_restore_attestation_invalid",
  );
}

function validateForbiddenConfig(value, code) {
  exactKeys(value, [
    "include",
    "include_if",
    "instead_of",
    "push_instead_of",
  ], `${code}_forbidden_config_contract_invalid`);
  if (Object.values(value).some((entry) => entry !== false)) {
    fail(`${code}_forbidden_config_present`);
  }
}

function validateNoninteractive(value, code) {
  exactKeys(value, [
    "terminal_prompt_blocked",
    "credential_interactive_blocked",
    "askpass_blocked",
    "ssh_batch_mode",
    "failure_output_discarded",
  ], `${code}_noninteractive_contract_invalid`);
  if (Object.values(value).some((entry) => entry !== true)) {
    fail(`${code}_noninteractive_missing`);
  }
}

function validateGitAuthorityWriter(value, code, expectedRole) {
  exactKeys(value, [
    "status",
    "writer_role",
    "logical_remote",
    "ref",
    "transport_class",
    "authority_fingerprint",
    "config_projection_digest",
    "config_content_digest",
    "read_probe_status",
    "full_config_read",
    "config_read_only",
    "immutable_recheck",
    "forbidden_config",
    "noninteractive",
  ], `${code}_git_authority_contract_invalid`);
  if (
    value.status !== "VERIFIED"
    || value.writer_role !== expectedRole
    || typeof value.logical_remote !== "string"
    || !LOGICAL_REMOTE_RE.test(value.logical_remote)
    || typeof value.ref !== "string"
    || !PUBLIC_HEAD_REF_RE.test(value.ref)
    || !TRANSPORT_CLASSES.has(value.transport_class)
    || value.read_probe_status !== "PASS"
    || value.full_config_read !== true
    || value.config_read_only !== true
    || value.immutable_recheck !== true
  ) fail(`${code}_git_authority_missing`);
  assertDigest(value.authority_fingerprint, `${code}_authority_invalid`);
  assertDigest(
    value.config_projection_digest,
    `${code}_config_projection_invalid`,
  );
  assertDigest(value.config_content_digest, `${code}_config_digest_invalid`);
  validateForbiddenConfig(value.forbidden_config, code);
  validateNoninteractive(value.noninteractive, code);
}

function validateGitAuthorityEvidence(value, backupRestore, nowMs) {
  exactKeys(value, [
    "status",
    "observed_at",
    "expires_at",
    "writers",
    "attestation_digest",
  ], "git_authority_contract_invalid");
  if (value.status !== "VERIFIED") fail("git_authority_evidence_missing");
  assertFreshWindow(value, "git_authority_evidence_stale", nowMs);
  exactKeys(
    value.writers,
    ["workmeta", "private_state"],
    "git_authority_writers_contract_invalid",
  );
  validateGitAuthorityWriter(
    value.writers.workmeta,
    "workmeta",
    "writer_workmeta",
  );
  validateGitAuthorityWriter(
    value.writers.private_state,
    "private_state",
    "writer_private_state",
  );
  if (
    value.writers.workmeta.logical_remote
      === value.writers.private_state.logical_remote
    || value.writers.workmeta.authority_fingerprint
      === value.writers.private_state.authority_fingerprint
    || value.writers.workmeta.authority_fingerprint
      !== backupRestore.authorities.workmeta.authority_fingerprint
    || value.writers.private_state.authority_fingerprint
      !== backupRestore.authorities.private_state.authority_fingerprint
  ) fail("git_backup_authority_binding_mismatch");
  assertCanonicalAttestation(value, "git_authority_attestation_invalid");
}

function validateLeasePolicy(value) {
  exactKeys(value, [
    "status",
    "authority_profile",
    "operational_primary",
    "owner_token_class",
    "first_lease_stale",
    "host_identity_digest",
    "restored_writer_epoch",
    "authority_writer_epoch",
    "receipt_writer_epoch",
    "initial_writer_epoch",
    "ttl_minutes",
    "ttl_formula",
    "epoch_formula",
    "stale_recovery_policy",
    "attestation_digest",
  ], "lease_policy_contract_invalid");
  if (
    value.status !== "VERIFIED"
    || value.authority_profile !== "owner_with_state"
    || value.operational_primary !== true
    || value.owner_token_class !== "opaque_random_256_v1"
    || value.first_lease_stale !== false
    || !DIGEST_RE.test(value.host_identity_digest || "")
    || !Number.isSafeInteger(value.restored_writer_epoch)
    || value.restored_writer_epoch < 0
    || !Number.isSafeInteger(value.authority_writer_epoch)
    || value.authority_writer_epoch < 0
    || !Number.isSafeInteger(value.receipt_writer_epoch)
    || value.receipt_writer_epoch < 0
    || !Number.isSafeInteger(value.initial_writer_epoch)
    || value.initial_writer_epoch !== Math.max(
      value.restored_writer_epoch,
      value.authority_writer_epoch,
      value.receipt_writer_epoch,
      0,
    ) + 1
    || !Number.isSafeInteger(value.ttl_minutes)
    || value.ttl_minutes < LEASE_TTL_MINUTES_MIN
    || value.ttl_minutes > LEASE_TTL_MINUTES_MAX
    || value.ttl_formula !== LEASE_TTL_FORMULA
    || value.epoch_formula !== WRITER_EPOCH_FORMULA
    || value.stale_recovery_policy !== STALE_RECOVERY_POLICY
  ) fail("lease_policy_invalid");
  assertCanonicalAttestation(value, "lease_policy_attestation_invalid");
}

function validateEvidence(evidence, nowMs) {
  exactKeys(evidence, [
    "acl",
    "backup_restore",
    "git_authority",
    "lease_policy",
  ], "runtime_evidence_contract_invalid");
  validateAclEvidence(evidence.acl);
  validateBackupRestoreEvidence(evidence.backup_restore, nowMs);
  validateGitAuthorityEvidence(
    evidence.git_authority,
    evidence.backup_restore,
    nowMs,
  );
  validateLeasePolicy(evidence.lease_policy);
}

function holdReceipt(code) {
  return {
    schema_version: RUNTIME_PREFLIGHT_RECEIPT_SCHEMA,
    status: "HOLD",
    hold_reasons: [code],
    manifest_digest: null,
    launch_binding_digest: null,
    evidence_digest: null,
    forbidden_union_digest: null,
    topology: {
      root_labels: [...ROOT_LABELS],
      same_parent: false,
      canonical_realpaths: false,
      reparse_free: false,
      pairwise_disjoint: false,
      mandatory_roots_bound: false,
      forbidden_union_complete: false,
      forbidden_root_clear: false,
    },
    inventory: {
      status: "UNKNOWN",
      source_classification: "UNKNOWN",
      tool_classification: "UNKNOWN",
      codex_count: null,
      orca_count: null,
      codex_zero: null,
      orca_zero: null,
      root_set_digest: null,
      fresh: false,
    },
    evidence: {
      acl: "UNKNOWN",
      backup_restore: "UNKNOWN",
      git_authority: "UNKNOWN",
      lease_policy: "UNKNOWN",
    },
    lease_policy: {
      authority_profile: "UNKNOWN",
      operational_primary: false,
      owner_token_class: "UNKNOWN",
      first_lease_stale: null,
      host_identity_digest: null,
      restored_writer_epoch: null,
      authority_writer_epoch: null,
      receipt_writer_epoch: null,
      initial_writer_epoch: null,
      ttl_minutes: null,
      ttl_formula: LEASE_TTL_FORMULA,
      epoch_formula: WRITER_EPOCH_FORMULA,
    },
    ...operationalNonAcceptanceReceipt(),
  };
}

export function runtimeLaunchBindingDigest({
  runner_root,
  config_root,
  input_path,
}) {
  return sha256(canonicalize({
    runner_root,
    config_root,
    input_path,
  }));
}

export function runRuntimePreflight(input, options = {}) {
  try {
    if (input?.schema_version === RUNTIME_PREFLIGHT_V1_INPUT_SCHEMA) {
      fail("runtime_preflight_v1_explicit_hold");
    }
    exactKeys(input, [
      "schema_version",
      "roots",
      "launch",
      "guarded_roots",
      "forbidden_roots",
      "worktree_inventory",
      "evidence",
    ], "runtime_preflight_contract_invalid");
    if (input.schema_version !== RUNTIME_PREFLIGHT_INPUT_SCHEMA) {
      fail("runtime_preflight_schema_invalid");
    }
    rejectSensitive(input);
    const nowMs = normalizedNow(options);

    exactKeys(input.roots, ROOT_LABELS, "runtime_roots_contract_invalid");
    exactKeys(
      input.guarded_roots,
      GUARDED_ROOT_LABELS,
      "guarded_roots_contract_invalid",
    );
    exactKeys(input.launch, ["input_path"], "runtime_launch_contract_invalid");

    const roots = {};
    for (const label of ROOT_LABELS) {
      roots[label] = exactDirectoryRealpath(
        input.roots[label],
        "runtime_root_realpath_invalid",
      );
      if (basename(roots[label]) !== ROOT_BASENAMES[label]) {
        fail("runtime_root_name_invalid");
      }
    }
    assertPairwiseDisjoint(ROOT_LABELS.map((label) => roots[label]));
    if (
      new Set(
        ROOT_LABELS.map((label) => comparablePath(dirname(roots[label]))),
      ).size !== 1
    ) fail("runtime_roots_not_siblings");

    const guardedRoots = {};
    for (const label of GUARDED_ROOT_LABELS) {
      guardedRoots[label] = exactDirectoryRealpath(
        input.guarded_roots[label],
        "guarded_root_realpath_invalid",
      );
    }
    if (
      comparablePath(guardedRoots.active_public_root)
        === comparablePath(guardedRoots.active_workmeta)
      || comparablePath(guardedRoots.active_public_root)
        === comparablePath(guardedRoots.active_private_state)
      || !pathContains(
        guardedRoots.active_public_root,
        guardedRoots.active_workmeta,
      )
      || !pathContains(
        guardedRoots.active_public_root,
        guardedRoots.active_private_state,
      )
      || pathContains(
        guardedRoots.active_public_root,
        guardedRoots.automation_control_root,
      )
      || pathContains(
        guardedRoots.automation_control_root,
        guardedRoots.active_public_root,
      )
    ) fail("guarded_root_topology_invalid");

    if (!Array.isArray(input.forbidden_roots)) {
      fail("forbidden_roots_contract_invalid");
    }
    const forbiddenRows = input.forbidden_roots.map((row) => {
      exactKeys(row, ["kind", "path"], "forbidden_root_contract_invalid");
      if (!FORBIDDEN_KIND_SET.has(row.kind)) {
        fail("forbidden_root_kind_invalid");
      }
      return {
        kind: row.kind,
        path: exactDirectoryRealpath(
          row.path,
          "forbidden_root_realpath_invalid",
        ),
      };
    });
    runtimeRootSetDigest(forbiddenRows);

    for (const label of GUARDED_ROOT_LABELS) {
      const matching = forbiddenRows.filter((row) => row.kind === label);
      if (
        matching.length !== 1
        || comparablePath(matching[0].path)
          !== comparablePath(guardedRoots[label])
      ) fail("mandatory_forbidden_root_mismatch");
    }

    const inventory = validateWorktreeInventory(
      input.worktree_inventory,
      forbiddenRows,
      nowMs,
    );
    validateEvidence(input.evidence, nowMs);

    const inputPath = exactFileRealpath(
      input.launch.input_path,
      "runtime_input_realpath_invalid",
    );
    if (
      comparablePath(inputPath) === comparablePath(roots.config)
      || !pathContains(roots.config, inputPath)
    ) fail("runtime_input_outside_config");

    for (const root of Object.values(roots)) {
      for (const forbidden of forbiddenRows) {
        if (
          pathContains(root, forbidden.path)
          || pathContains(forbidden.path, root)
        ) fail("forbidden_root_overlap");
      }
    }

    const manifestDigest = sha256(canonicalize(input));
    const launchBindingDigest = runtimeLaunchBindingDigest({
      runner_root: roots.runner,
      config_root: roots.config,
      input_path: inputPath,
    });
    const evidenceDigest = sha256(canonicalize(input.evidence));
    const forbiddenUnionDigest = runtimeRootSetDigest(forbiddenRows);
    const leasePolicy = input.evidence.lease_policy;
    return {
      schema_version: RUNTIME_PREFLIGHT_RECEIPT_SCHEMA,
      status: "PASS",
      hold_reasons: [],
      manifest_digest: manifestDigest,
      launch_binding_digest: launchBindingDigest,
      evidence_digest: evidenceDigest,
      forbidden_union_digest: forbiddenUnionDigest,
      topology: {
        root_labels: [...ROOT_LABELS],
        same_parent: true,
        canonical_realpaths: true,
        reparse_free: true,
        pairwise_disjoint: true,
        mandatory_roots_bound: true,
        forbidden_union_complete: true,
        forbidden_root_clear: true,
      },
      inventory: {
        status: "VERIFIED",
        source_classification:
          input.worktree_inventory.source_classification,
        tool_classification:
          input.worktree_inventory.tool_classification,
        codex_count: inventory.codex.length,
        orca_count: inventory.orca.length,
        codex_zero: inventory.codex.length === 0,
        orca_zero: inventory.orca.length === 0,
        root_set_digest: inventory.rootSetDigest,
        fresh: true,
      },
      evidence: {
        acl: "VERIFIED",
        backup_restore: "VERIFIED",
        git_authority: "VERIFIED",
        lease_policy: "VERIFIED",
      },
      lease_policy: {
        authority_profile: leasePolicy.authority_profile,
        operational_primary: leasePolicy.operational_primary,
        owner_token_class: leasePolicy.owner_token_class,
        first_lease_stale: leasePolicy.first_lease_stale,
        host_identity_digest: leasePolicy.host_identity_digest,
        restored_writer_epoch: leasePolicy.restored_writer_epoch,
        authority_writer_epoch: leasePolicy.authority_writer_epoch,
        receipt_writer_epoch: leasePolicy.receipt_writer_epoch,
        initial_writer_epoch: leasePolicy.initial_writer_epoch,
        ttl_minutes: leasePolicy.ttl_minutes,
        ttl_formula: leasePolicy.ttl_formula,
        epoch_formula: leasePolicy.epoch_formula,
      },
      ...operationalNonAcceptanceReceipt(),
    };
  } catch (error) {
    return holdReceipt(
      error instanceof PreflightError
        ? error.code
        : "runtime_preflight_failed",
    );
  }
}

function isMain() {
  return process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  process.stdout.write(`${JSON.stringify(holdReceipt(
    "runtime_preflight_library_only",
  ))}\n`);
  process.exitCode = 2;
}
