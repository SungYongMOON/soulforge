import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import {
  WRITER_AUTHORITY_ID,
  WRITER_AUTHORITY_LANES,
  WRITER_AUTHORITY_SCOPE,
  inspectWriterAuthority,
  transitionWriterAuthority,
} from "./writer_authority.mjs";

export const WRITER_AUTHORITY_RENEWAL_POLICY_SCHEMA =
  "soulforge.ingress.writer_authority_renewal_policy.v1";
export const WRITER_AUTHORITY_RENEWAL_RESULT_SCHEMA =
  "soulforge.ingress.writer_authority_renewal_result.v1";
export const WRITER_AUTHORITY_RENEWAL_POLICY_FILE =
  "writer-authority-renewal.policy.v1.json";

const MAX_POLICY_BYTES = 32 * 1024;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const POLICY_KEYS = [
  "schema_version",
  "enabled",
  "expected_binding_digest",
  "expected_authority_id",
  "expected_authority_scope",
  "expected_primary_node_id",
  "expected_fallback_node_id",
  "renew_before_seconds",
  "validity_seconds",
  "policy_expires_at",
  "owner_approval_ref",
];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function exactTimestamp(value) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
}

function safeApprovalRef(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 512
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function validateWriterAuthorityRenewalPolicy(value) {
  if (!exactKeys(value, POLICY_KEYS)
    || value.schema_version !== WRITER_AUTHORITY_RENEWAL_POLICY_SCHEMA
    || typeof value.enabled !== "boolean"
    || !SHA256.test(value.expected_binding_digest)
    || value.expected_authority_id !== WRITER_AUTHORITY_ID
    || value.expected_authority_scope !== WRITER_AUTHORITY_SCOPE
    || !SAFE_ID.test(value.expected_primary_node_id)
    || !SAFE_ID.test(value.expected_fallback_node_id)
    || value.expected_primary_node_id === value.expected_fallback_node_id
    || !Number.isSafeInteger(value.renew_before_seconds)
    || value.renew_before_seconds < 3_600
    || value.renew_before_seconds > 7 * 24 * 3_600
    || !Number.isSafeInteger(value.validity_seconds)
    || value.validity_seconds < 24 * 3_600
    || value.validity_seconds > 31 * 24 * 3_600
    || value.renew_before_seconds >= value.validity_seconds
    || exactTimestamp(value.policy_expires_at) === null
    || !safeApprovalRef(value.owner_approval_ref)) {
    fail("writer_authority_renewal_policy_invalid");
  }
  return Object.fromEntries(POLICY_KEYS.map((key) => [key, value[key]]));
}

export function resolveWriterAuthorityRenewalPolicyPath(bindingPath) {
  if (typeof bindingPath !== "string" || !path.isAbsolute(bindingPath)) {
    fail("writer_authority_renewal_binding_invalid");
  }
  return path.join(path.dirname(path.resolve(bindingPath)), WRITER_AUTHORITY_RENEWAL_POLICY_FILE);
}

async function readPolicyFile(policyPath) {
  let metadata;
  try {
    metadata = await lstat(policyPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("writer_authority_renewal_policy_unavailable");
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0
    || metadata.size > MAX_POLICY_BYTES) {
    fail("writer_authority_renewal_policy_unavailable");
  }
  try {
    return validateWriterAuthorityRenewalPolicy(JSON.parse(await readFile(policyPath, "utf8")));
  } catch (error) {
    if (error?.code === "writer_authority_renewal_policy_invalid") throw error;
    fail("writer_authority_renewal_policy_invalid");
  }
}

function validateAuthorityForPolicy(authority, policy, bindingDigest) {
  if (bindingDigest !== policy.expected_binding_digest) fail("writer_authority_renewal_binding_drift");
  if (authority?.authority_id !== policy.expected_authority_id
    || authority?.authority_scope !== policy.expected_authority_scope
    || authority?.primary_node_id !== policy.expected_primary_node_id
    || authority?.fallback_node_id !== policy.expected_fallback_node_id
    || authority?.mode !== "primary"
    || authority?.node_id !== policy.expected_primary_node_id
    || JSON.stringify(authority?.lanes) !== JSON.stringify(WRITER_AUTHORITY_LANES)) {
    fail("writer_authority_renewal_authority_drift");
  }
}

export function planWriterAuthorityRenewal({ policy, authority, bindingDigest, nowMs = Date.now() } = {}) {
  if (policy === null) return { status: "disabled", due: false };
  const validated = validateWriterAuthorityRenewalPolicy(policy);
  if (!validated.enabled) return { status: "disabled", due: false };
  if (!Number.isFinite(nowMs)) fail("writer_authority_renewal_time_invalid");
  if (exactTimestamp(validated.policy_expires_at) <= nowMs) {
    fail("writer_authority_renewal_policy_expired");
  }
  validateAuthorityForPolicy(authority, validated, bindingDigest);
  const authorityExpiresMs = exactTimestamp(authority.expires_at);
  if (authorityExpiresMs === null) fail("writer_authority_renewal_authority_drift");
  const remainingMs = authorityExpiresMs - nowMs;
  return remainingMs > validated.renew_before_seconds * 1_000
    ? { status: "not_due", due: false, remaining_seconds: Math.floor(remainingMs / 1_000) }
    : { status: "due", due: true, remaining_seconds: Math.max(0, Math.floor(remainingMs / 1_000)) };
}

export async function runWriterAuthorityRenewal({
  bindingPath,
  bindingDigest,
  binding,
  now = Date.now,
  readPolicy = readPolicyFile,
  inspectAuthority = inspectWriterAuthority,
  transitionAuthority = transitionWriterAuthority,
} = {}) {
  const nowMs = Number(now());
  if (!Number.isFinite(nowMs)) fail("writer_authority_renewal_time_invalid");
  const policy = await readPolicy(resolveWriterAuthorityRenewalPolicyPath(bindingPath));
  if (policy === null || policy.enabled === false) {
    return { schema_version: WRITER_AUTHORITY_RENEWAL_RESULT_SCHEMA, status: "disabled", renewed: false };
  }
  if (typeof binding?.writerAuthorityRecordPath !== "string"
    || !path.isAbsolute(binding.writerAuthorityRecordPath)) {
    fail("writer_authority_renewal_binding_invalid");
  }
  const recordPath = path.resolve(binding.writerAuthorityRecordPath);
  const stateRoot = path.dirname(recordPath);
  const authority = await inspectAuthority({ stateRoot, recordPath });
  const plan = planWriterAuthorityRenewal({ policy, authority, bindingDigest, nowMs });
  if (!plan.due) {
    return {
      schema_version: WRITER_AUTHORITY_RENEWAL_RESULT_SCHEMA,
      status: plan.status,
      renewed: false,
      epoch: authority.epoch,
      expires_at: authority.expires_at,
    };
  }
  const notBefore = new Date(nowMs - 1_000).toISOString();
  const expiresAt = new Date(nowMs + policy.validity_seconds * 1_000).toISOString();
  const options = {
    stateRoot,
    recordPath,
    action: "renew",
    expectedCurrentEpoch: authority.epoch,
    expectedCurrentDigest: authority.record_digest,
    expectedNodeId: authority.node_id,
    notBefore,
    expiresAt,
    ownerApprovalRef: policy.owner_approval_ref,
    now: nowMs,
  };
  const dryRun = await transitionAuthority({ ...options, apply: false });
  if (dryRun?.status !== "planned" || dryRun?.authority_mode !== "primary"
    || dryRun?.node_id !== authority.node_id || dryRun?.epoch !== authority.epoch + 1
    || dryRun?.writes_performed !== 0) {
    fail("writer_authority_renewal_plan_invalid");
  }
  const applied = await transitionAuthority({ ...options, apply: true });
  if (applied?.status !== "updated" || applied?.authority_mode !== "primary"
    || applied?.node_id !== authority.node_id || applied?.epoch !== authority.epoch + 1
    || applied?.writes_performed !== 1) {
    fail("writer_authority_renewal_apply_invalid");
  }
  return {
    schema_version: WRITER_AUTHORITY_RENEWAL_RESULT_SCHEMA,
    status: "renewed",
    renewed: true,
    previous_epoch: authority.epoch,
    epoch: applied.epoch,
    expires_at: expiresAt,
  };
}
