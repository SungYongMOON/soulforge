import { createHash } from "node:crypto";
import { types } from "node:util";

export const AUTHENTICATED_ARTIFACT_CUSTODY_RECEIPT_SCHEMA =
  "soulforge.vault.authenticated_artifact_custody_receipt.v0";
export const TRUSTED_VAULT_SUBMISSION_CURRENT_SCHEMA =
  "soulforge.vault.submission_trusted_current.v0";
export const VAULT_SUBMISSION_PROPOSAL_SCHEMA =
  "soulforge.vault.submission_proposal.v0";

const EXECUTION_RECEIPT_SCHEMA = "soulforge.candidate_execution.receipt.v1";
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const VAULT_REF = /^[a-z][a-z0-9_.:-]{1,120}$/u;
const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]/iu;
const LOCAL_PATH_VALUE = /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[A-Za-z0-9]|(?:^|[^A-Za-z0-9])\/(?:Users|home|mnt|opt|srv|var|etc|tmp|root|Volumes|Applications)\//iu;
const MAX_DEPTH = 12;
const MAX_LIST = 64;

export const HERMES_VAULT_SUBMISSION_HOLD_CODES = Object.freeze({
  REQUEST_INVALID: "VAULT_SUBMISSION_REQUEST_INVALID",
  CUSTODY_RECEIPT_REQUIRED: "AUTHENTICATED_CUSTODY_RECEIPT_REQUIRED",
  TRUSTED_CURRENT_REQUIRED: "TRUSTED_VAULT_SUBMISSION_CURRENT_REQUIRED",
  EXECUTION_RECEIPT_INVALID: "EXECUTION_RECEIPT_INVALID",
  EXECUTION_NOT_SUCCEEDED: "EXECUTION_NOT_SUCCEEDED",
  ARTIFACT_REFS_FORBIDDEN: "EXECUTION_ARTIFACT_REF_SHORTCUT_FORBIDDEN",
  CUSTODY_RECEIPT_DIGEST_MISMATCH: "CUSTODY_RECEIPT_DIGEST_MISMATCH",
  CURRENT_STATE_DIGEST_MISMATCH: "TRUSTED_CURRENT_DIGEST_MISMATCH",
  PROJECT_MISMATCH: "PROJECT_BINDING_MISMATCH",
  TASK_MISMATCH: "TASK_BINDING_MISMATCH",
  ASSIGNMENT_MISMATCH: "ASSIGNMENT_BINDING_MISMATCH",
  RUN_MISMATCH: "RUN_BINDING_MISMATCH",
  AGENT_MISMATCH: "AGENT_BINDING_MISMATCH",
  WORK_BRIEF_MISMATCH: "WORK_BRIEF_BINDING_MISMATCH",
  LOGICAL_ARTIFACT_MISMATCH: "LOGICAL_ARTIFACT_BINDING_MISMATCH",
  PARENT_REVISION_MISMATCH: "PARENT_REVISION_CHANGED",
  MANIFEST_MISMATCH: "FILE_MANIFEST_MISMATCH",
  CONTENT_DIGEST_MISMATCH: "CONTENT_DIGEST_MISMATCH",
  SCAN_NOT_CLEAN: "SCAN_NOT_CLEAN",
  QUARANTINE_NOT_RELEASED: "QUARANTINE_NOT_RELEASED",
  AUTHORITY_STALE: "UPLOADER_AUTHORITY_STALE",
  TRUSTED_PIN_MISMATCH: "TRUSTED_PIN_MISMATCH",
  RESULT_EVIDENCE_MISMATCH: "RESULT_EVIDENCE_BINDING_MISMATCH",
  SOURCE_MISMATCH: "SOURCE_BINDING_MISMATCH",
  AUTHENTICATION_MISMATCH: "UPLOAD_AUTHENTICATION_BINDING_MISMATCH",
  REPLAY: "CUSTODY_RECEIPT_REPLAY",
  VAULT_INPUT_INCOMPATIBLE: "VAULT_INPUT_INCOMPATIBLE",
});

const H = HERMES_VAULT_SUBMISSION_HOLD_CODES;

const REQUEST_FIELDS = Object.freeze([
  "execution_receipt", "upload_custody_receipt", "trusted_current_state",
]);
const EXECUTION_FIELDS = Object.freeze([
  "schema_version", "receipt_id", "receipt_kind", "run_id", "attempt_no",
  "fencing_epoch", "claim", "authority_ref", "assignment_policy_revision_ref",
  "attribution", "outcome", "reason_code", "result_ref", "artifact_refs",
  "evidence_refs", "official_task_done", "official_task_mutated",
  "external_effect_evidence",
]);
const CLAIM_FIELDS = Object.freeze(["task_ref", "work_brief_revision_ref", "action_ref"]);
const TASK_REF_FIELDS = Object.freeze(["provider", "task_id"]);
const REVISION_REF_FIELDS = Object.freeze([
  "provider", "task_id", "revision_id", "content_sha256",
]);
const SNAPSHOT_REF_FIELDS = Object.freeze(["revision_id", "content_sha256"]);
const ATTRIBUTION_FIELDS = Object.freeze([
  "responsible_role_ref", "actor_ref", "performing_agent_id", "bot_ref", "executor_ref",
]);
const EFFECT_FIELDS = Object.freeze([
  "source", "receipt_ref", "linear_writes", "network_calls", "filesystem_writes",
  "shell_commands",
]);
const CUSTODY_FIELDS = Object.freeze([
  "schema_version", "status", "custody_receipt_ref", "receipt_digest",
  "upload_ticket_ref", "authentication_receipt_ref", "authentication_claim_digest",
  "submission_id", "idempotency_key", "project_ref",
  "task_ref", "assignment_ref", "assignment_epoch", "task_authority_ref",
  "assignment_policy_revision_ref", "run_id", "fencing_epoch", "agent_mark_ref",
  "performing_agent_id", "bot_ref", "executor_ref", "deployment_ref",
  "deployment_digest", "work_brief_revision_ref", "logical_artifact_id",
  "parent_revision_id", "file_manifest", "file_count", "total_size",
  "manifest_digest", "content_sha256", "scan_state", "quarantine_state",
  "source_refs", "result_ref", "evidence_refs", "uploader_authority_ref",
  "uploader_authority_epoch", "trusted_pin_ref", "trusted_pin_digest",
]);
const FILE_FIELDS = Object.freeze([
  "relative_path", "role_ref", "byte_size", "content_sha256",
]);
const CURRENT_FIELDS = Object.freeze([
  "schema_version", "status", "evaluation_ref", "evaluation_digest", "project_ref",
  "task_ref", "assignment_ref", "current_assignment_epoch", "task_authority_ref",
  "assignment_policy_revision_ref", "run_id", "run_state", "fencing_epoch",
  "agent_mark_ref", "performing_agent_id", "bot_ref", "executor_ref",
  "deployment_ref", "deployment_digest", "work_brief_revision_ref",
  "logical_artifact_id", "current_parent_revision_id", "expected_file_count",
  "expected_total_size", "expected_manifest_digest", "expected_content_sha256",
  "expected_source_refs", "expected_result_ref", "expected_evidence_refs",
  "expected_authentication_receipt_ref", "expected_authentication_claim_digest",
  "uploader_authority_ref", "current_uploader_authority_epoch", "trusted_pin_ref",
  "trusted_pin_digest", "consumed_custody_receipt_refs", "consumed_idempotency_keys",
]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    if (types.isProxy(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function snapshot(value, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  if (value === null || typeof value !== "object") return value;
  try {
    // Proxy reflection can execute hostile getPrototypeOf/ownKeys/descriptor
    // traps. Reject it before any reflective read so every public admission
    // failure remains a fixed HOLD rather than an exception side channel.
    if (types.isProxy(value)) return null;
  } catch {
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_LIST) return null;
    const output = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (!descriptor || descriptor.get || descriptor.set) return null;
      const child = snapshot(descriptor.value, depth + 1);
      if (child === null && descriptor.value !== null) return null;
      output.push(child);
    }
    return output;
  }
  if (!isPlainObject(value)) return null;
  const output = {};
  let propertyNames;
  try {
    propertyNames = Object.getOwnPropertyNames(value);
  } catch {
    return null;
  }
  for (const key of propertyNames) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) return null;
    const child = snapshot(descriptor.value, depth + 1);
    if (child === null && descriptor.value !== null) return null;
    Object.defineProperty(output, key, {
      value: child,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
  ).join(",")}}`;
}

function digestOf(value) {
  return `sha256:${createHash("sha256").update(stableStringify(value), "utf8").digest("hex")}`;
}

export function digestAuthenticatedCustodyReceipt(value) {
  const copy = snapshot(value);
  if (copy === null) throw new TypeError("custody_digest_input_invalid");
  if (isPlainObject(copy)) delete copy.receipt_digest;
  return digestOf(copy);
}

export function digestArtifactFileManifest(value) {
  const copy = snapshot(value);
  if (!Array.isArray(copy)) throw new TypeError("artifact_manifest_digest_input_invalid");
  return digestOf(copy);
}

export function digestTrustedSubmissionCurrentState(value) {
  const copy = snapshot(value);
  if (copy === null) throw new TypeError("trusted_current_digest_input_invalid");
  if (isPlainObject(copy)) delete copy.evaluation_digest;
  return digestOf(copy);
}

function exact(value, fields) {
  return isPlainObject(value) && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value)
    && !SECRET_VALUE.test(value) && !LOCAL_PATH_VALUE.test(value);
}

function vaultRef(value) {
  return typeof value === "string" && VAULT_REF.test(value)
    && !SECRET_VALUE.test(value) && !LOCAL_PATH_VALUE.test(value);
}

function digestRef(value) {
  return typeof value === "string" && SHA256.test(value);
}

function safeEpoch(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function codepointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeList(value, { allowEmpty = false, sorted = false, vault = false } = {}) {
  if (!Array.isArray(value) || value.length > MAX_LIST || (!allowEmpty && value.length === 0)) {
    return false;
  }
  const check = vault ? vaultRef : safeId;
  if (!value.every(check) || new Set(value).size !== value.length) return false;
  return !sorted || value.every((entry, index) => index === 0
    || codepointCompare(value[index - 1], entry) < 0);
}

function sameList(left, right) {
  return left.length === right.length
    && [...left].sort(codepointCompare).every((entry, index) => (
      entry === [...right].sort(codepointCompare)[index]
    ));
}

function taskRef(value) {
  return exact(value, TASK_REF_FIELDS) && safeId(value.provider) && safeId(value.task_id);
}

function sameTask(left, right) {
  return left?.provider === right?.provider && left?.task_id === right?.task_id;
}

function revisionRef(value, task) {
  return exact(value, REVISION_REF_FIELDS) && sameTask(value, task)
    && safeId(value.revision_id) && digestRef(value.content_sha256);
}

function sameRevision(left, right) {
  return REVISION_REF_FIELDS.every((field) => left?.[field] === right?.[field]);
}

function snapshotRef(value) {
  return exact(value, SNAPSHOT_REF_FIELDS) && safeId(value.revision_id)
    && digestRef(value.content_sha256);
}

function countOrUnknown(value) {
  return value === "UNKNOWN" || (Number.isSafeInteger(value) && value >= 0);
}

function relativeFilePath(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240
    || value !== value.normalize("NFC") || value.includes("\\") || value.startsWith("/")
    || value.includes(":") || value.includes("//") || /[\u0000-\u001f\u007f]/u.test(value)) {
    return false;
  }
  const parts = value.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function validExecution(receipt) {
  if (!exact(receipt, EXECUTION_FIELDS)
    || receipt.schema_version !== EXECUTION_RECEIPT_SCHEMA
    || receipt.receipt_kind !== "execution" || !safeId(receipt.receipt_id)
    || !safeId(receipt.run_id) || !safeEpoch(receipt.attempt_no)
    || !safeEpoch(receipt.fencing_epoch) || !exact(receipt.claim, CLAIM_FIELDS)
    || !taskRef(receipt.claim.task_ref)
    || !revisionRef(receipt.claim.work_brief_revision_ref, receipt.claim.task_ref)
    || !safeId(receipt.claim.action_ref) || !safeId(receipt.authority_ref)
    || !snapshotRef(receipt.assignment_policy_revision_ref)
    || !exact(receipt.attribution, ATTRIBUTION_FIELDS)
    || !ATTRIBUTION_FIELDS.every((field) => safeId(receipt.attribution[field]))
    || !["succeeded", "failed", "waiting", "hold"].includes(receipt.outcome)
    || !safeList(receipt.artifact_refs, { allowEmpty: true })
    || !safeList(receipt.evidence_refs, { allowEmpty: true })
    || receipt.official_task_done !== false || receipt.official_task_mutated !== false
    || !exact(receipt.external_effect_evidence, EFFECT_FIELDS)
    || !safeId(receipt.external_effect_evidence.source)
    || !safeId(receipt.external_effect_evidence.receipt_ref)
    || !EFFECT_FIELDS.slice(2).every((field) => countOrUnknown(
      receipt.external_effect_evidence[field],
    ))) return false;
  if (receipt.outcome === "succeeded") {
    return receipt.reason_code === null && safeId(receipt.result_ref);
  }
  return safeId(receipt.reason_code) && receipt.result_ref === null;
}

function validFileManifestShape(receipt) {
  if (!Array.isArray(receipt.file_manifest) || receipt.file_manifest.length < 1
    || receipt.file_manifest.length > MAX_LIST) return false;
  const paths = [];
  for (const entry of receipt.file_manifest) {
    if (!exact(entry, FILE_FIELDS) || !relativeFilePath(entry.relative_path)
      || !vaultRef(entry.role_ref) || !Number.isSafeInteger(entry.byte_size)
      || entry.byte_size < 0 || !digestRef(entry.content_sha256)) return false;
    paths.push(entry.relative_path);
  }
  if (new Set(paths).size !== paths.length
    || !paths.every((entry, index) => index === 0
      || codepointCompare(paths[index - 1], entry) < 0)) return false;
  return true;
}

function validManifest(receipt) {
  if (!validFileManifestShape(receipt)) return false;
  const total = receipt.file_manifest.reduce((sum, entry) => sum + entry.byte_size, 0);
  if (!Number.isSafeInteger(total)) return false;
  return receipt.file_count === receipt.file_manifest.length
    && receipt.total_size === total && total > 0
    && receipt.manifest_digest === digestArtifactFileManifest(receipt.file_manifest);
}

function validCustody(receipt) {
  return exact(receipt, CUSTODY_FIELDS)
    && receipt.schema_version === AUTHENTICATED_ARTIFACT_CUSTODY_RECEIPT_SCHEMA
    && receipt.status === "AUTHENTICATED_CUSTODY"
    && [receipt.custody_receipt_ref, receipt.upload_ticket_ref,
      receipt.authentication_receipt_ref, receipt.submission_id, receipt.idempotency_key,
      receipt.project_ref, receipt.assignment_ref,
      receipt.task_authority_ref, receipt.agent_mark_ref, receipt.performing_agent_id,
      receipt.bot_ref, receipt.executor_ref, receipt.deployment_ref,
      receipt.logical_artifact_id, receipt.uploader_authority_ref,
      receipt.trusted_pin_ref].every(vaultRef)
    && digestRef(receipt.authentication_claim_digest)
    && taskRef(receipt.task_ref) && safeEpoch(receipt.assignment_epoch)
    && snapshotRef(receipt.assignment_policy_revision_ref) && safeId(receipt.run_id)
    && safeEpoch(receipt.fencing_epoch) && digestRef(receipt.deployment_digest)
    && revisionRef(receipt.work_brief_revision_ref, receipt.task_ref)
    && (receipt.parent_revision_id === null || vaultRef(receipt.parent_revision_id))
    && Number.isSafeInteger(receipt.file_count) && receipt.file_count > 0
    && Number.isSafeInteger(receipt.total_size) && receipt.total_size > 0
    && digestRef(receipt.manifest_digest) && digestRef(receipt.content_sha256)
    && ["pending", "clean", "rejected", "malware", "unscannable",
      "policy_hold", "unknown"].includes(receipt.scan_state)
    && ["quarantined", "released", "rejected", "unknown"].includes(
      receipt.quarantine_state,
    )
    && safeList(receipt.source_refs, { sorted: true, vault: true })
    && safeId(receipt.result_ref)
    && safeList(receipt.evidence_refs, { sorted: true, vault: true })
    && safeEpoch(receipt.uploader_authority_epoch)
    && digestRef(receipt.trusted_pin_digest) && digestRef(receipt.receipt_digest)
    && validFileManifestShape(receipt);
}

function validCurrent(current) {
  return exact(current, CURRENT_FIELDS)
    && current.schema_version === TRUSTED_VAULT_SUBMISSION_CURRENT_SCHEMA
    && current.status === "TRUSTED_CURRENT" && vaultRef(current.evaluation_ref)
    && digestRef(current.evaluation_digest) && vaultRef(current.project_ref)
    && taskRef(current.task_ref) && vaultRef(current.assignment_ref)
    && safeEpoch(current.current_assignment_epoch) && vaultRef(current.task_authority_ref)
    && snapshotRef(current.assignment_policy_revision_ref) && safeId(current.run_id)
    && current.run_state === "succeeded" && safeEpoch(current.fencing_epoch)
    && [current.agent_mark_ref, current.performing_agent_id, current.bot_ref,
      current.executor_ref, current.deployment_ref, current.logical_artifact_id,
      current.uploader_authority_ref, current.trusted_pin_ref].every(vaultRef)
    && digestRef(current.deployment_digest)
    && revisionRef(current.work_brief_revision_ref, current.task_ref)
    && (current.current_parent_revision_id === null
      || vaultRef(current.current_parent_revision_id))
    && Number.isSafeInteger(current.expected_file_count) && current.expected_file_count > 0
    && Number.isSafeInteger(current.expected_total_size) && current.expected_total_size > 0
    && digestRef(current.expected_manifest_digest) && digestRef(current.expected_content_sha256)
    && safeList(current.expected_source_refs, { sorted: true, vault: true })
    && safeId(current.expected_result_ref)
    && safeList(current.expected_evidence_refs, { sorted: true, vault: true })
    && vaultRef(current.expected_authentication_receipt_ref)
    && digestRef(current.expected_authentication_claim_digest)
    && safeEpoch(current.current_uploader_authority_epoch)
    && digestRef(current.trusted_pin_digest)
    && safeList(current.consumed_custody_receipt_refs, {
      allowEmpty: true, sorted: true, vault: true,
    })
    && safeList(current.consumed_idempotency_keys, {
      allowEmpty: true, sorted: true, vault: true,
    });
}

function hold(holdCode) {
  return deepFreeze({ status: "HOLD", hold_code: holdCode });
}

function noForbiddenString(value) {
  if (typeof value === "string") return !SECRET_VALUE.test(value) && !LOCAL_PATH_VALUE.test(value);
  if (Array.isArray(value)) return value.every(noForbiddenString);
  if (isPlainObject(value)) return Object.values(value).every(noForbiddenString);
  return true;
}

function sameAgent(execution, custody, current) {
  return execution.attribution.performing_agent_id === custody.performing_agent_id
    && execution.attribution.performing_agent_id === current.performing_agent_id
    && execution.attribution.bot_ref === custody.bot_ref
    && execution.attribution.bot_ref === current.bot_ref
    && execution.attribution.executor_ref === custody.executor_ref
    && execution.attribution.executor_ref === current.executor_ref
    && custody.agent_mark_ref === current.agent_mark_ref
    && custody.deployment_ref === current.deployment_ref
    && custody.deployment_digest === current.deployment_digest;
}

function buildProposal(execution, custody) {
  const body = {
    schema_version: VAULT_SUBMISSION_PROPOSAL_SCHEMA,
    status: "PROPOSED",
    project_ref: custody.project_ref,
    task_ref: structuredClone(custody.task_ref),
    assignment_ref: custody.assignment_ref,
    assignment_epoch: custody.assignment_epoch,
    run_id: custody.run_id,
    agent_binding: {
      agent_mark_ref: custody.agent_mark_ref,
      performing_agent_id: custody.performing_agent_id,
      bot_ref: custody.bot_ref,
      executor_ref: custody.executor_ref,
      deployment_ref: custody.deployment_ref,
      deployment_digest: custody.deployment_digest,
    },
    work_brief_revision_ref: structuredClone(custody.work_brief_revision_ref),
    artifact_basis: {
      logical_artifact_id: custody.logical_artifact_id,
      parent_revision_id: custody.parent_revision_id,
      custody_receipt_ref: custody.custody_receipt_ref,
      file_manifest: structuredClone(custody.file_manifest),
      file_count: custody.file_count,
      total_size: custody.total_size,
      manifest_digest: custody.manifest_digest,
      content_sha256: custody.content_sha256,
      source_refs: [...custody.source_refs],
      result_ref: execution.result_ref,
      evidence_refs: [...custody.evidence_refs],
      authentication_receipt_ref: custody.authentication_receipt_ref,
      authentication_claim_digest: custody.authentication_claim_digest,
    },
    vault_inputs: {
      record_submission_input: {
        submission_id: custody.submission_id,
        actor_ref: execution.attribution.actor_ref,
        assignment_ref: custody.assignment_ref,
        project_ref: custody.project_ref,
        idempotency_key: custody.idempotency_key,
        declared_sha256: custody.content_sha256.slice("sha256:".length),
        declared_size: custody.total_size,
      },
      record_custody_receipt_input: {
        custody_receipt_ref: custody.custody_receipt_ref,
        submission_id: custody.submission_id,
        stored_sha256: custody.content_sha256.slice("sha256:".length),
      },
      record_scan_class_input: {
        custody_receipt_ref: custody.custody_receipt_ref,
        scan_class: "clean",
      },
      candidate_basis: {
        logical_artifact_id: custody.logical_artifact_id,
        parent_revision_id: custody.parent_revision_id,
        custody_receipt_ref: custody.custody_receipt_ref,
        assignment_ref: custody.assignment_ref,
      },
      scope: { project_ref: custody.project_ref },
    },
    claim: "proposal_only_no_store_mutation_no_revision_no_acceptance",
  };
  const proposalDigest = digestOf(body);
  return deepFreeze({
    ...body,
    proposal_ref: `vault.submission.proposal.${proposalDigest.slice("sha256:".length)}`,
    proposal_digest: proposalDigest,
  });
}

function admitHermesArtifactSubmissionGuarded(rawRequest) {
  const request = snapshot(rawRequest);
  if (!request || !isPlainObject(request)) return hold(H.REQUEST_INVALID);
  if (!Object.hasOwn(request, "upload_custody_receipt")) {
    return hold(H.CUSTODY_RECEIPT_REQUIRED);
  }
  if (!Object.hasOwn(request, "trusted_current_state")) {
    return hold(H.TRUSTED_CURRENT_REQUIRED);
  }
  if (!exact(request, REQUEST_FIELDS) || !noForbiddenString(request)) {
    return hold(H.REQUEST_INVALID);
  }
  const execution = request.execution_receipt;
  const custody = request.upload_custody_receipt;
  const current = request.trusted_current_state;
  if (!validExecution(execution)) return hold(H.EXECUTION_RECEIPT_INVALID);
  if (execution.artifact_refs.length !== 0) return hold(H.ARTIFACT_REFS_FORBIDDEN);
  if (execution.outcome !== "succeeded") return hold(H.EXECUTION_NOT_SUCCEEDED);
  if (!validCustody(custody)) return hold(H.CUSTODY_RECEIPT_REQUIRED);
  if (custody.receipt_digest !== digestAuthenticatedCustodyReceipt(custody)) {
    return hold(H.CUSTODY_RECEIPT_DIGEST_MISMATCH);
  }
  if (!validCurrent(current)) return hold(H.TRUSTED_CURRENT_REQUIRED);
  if (current.evaluation_digest !== digestTrustedSubmissionCurrentState(current)) {
    return hold(H.CURRENT_STATE_DIGEST_MISMATCH);
  }
  if (!validManifest(custody)) return hold(H.MANIFEST_MISMATCH);

  if (custody.project_ref !== current.project_ref) return hold(H.PROJECT_MISMATCH);
  if (!sameTask(execution.claim.task_ref, custody.task_ref)
    || !sameTask(custody.task_ref, current.task_ref)) return hold(H.TASK_MISMATCH);
  if (custody.assignment_ref !== current.assignment_ref
    || custody.assignment_epoch !== current.current_assignment_epoch
    || custody.task_authority_ref !== execution.authority_ref
    || current.task_authority_ref !== execution.authority_ref
    || !sameRevision(custody.assignment_policy_revision_ref,
      execution.assignment_policy_revision_ref)
    || !sameRevision(current.assignment_policy_revision_ref,
      execution.assignment_policy_revision_ref)) return hold(H.ASSIGNMENT_MISMATCH);
  if (execution.run_id !== custody.run_id || custody.run_id !== current.run_id
    || execution.fencing_epoch !== custody.fencing_epoch
    || custody.fencing_epoch !== current.fencing_epoch || current.run_state !== "succeeded") {
    return hold(H.RUN_MISMATCH);
  }
  if (!sameAgent(execution, custody, current)) return hold(H.AGENT_MISMATCH);
  if (!sameRevision(execution.claim.work_brief_revision_ref,
    custody.work_brief_revision_ref)
    || !sameRevision(custody.work_brief_revision_ref,
      current.work_brief_revision_ref)) return hold(H.WORK_BRIEF_MISMATCH);
  if (custody.logical_artifact_id !== current.logical_artifact_id) {
    return hold(H.LOGICAL_ARTIFACT_MISMATCH);
  }
  if (custody.parent_revision_id !== current.current_parent_revision_id) {
    return hold(H.PARENT_REVISION_MISMATCH);
  }
  if (custody.file_count !== current.expected_file_count
    || custody.total_size !== current.expected_total_size
    || custody.manifest_digest !== current.expected_manifest_digest) {
    return hold(H.MANIFEST_MISMATCH);
  }
  if (custody.content_sha256 !== current.expected_content_sha256) {
    return hold(H.CONTENT_DIGEST_MISMATCH);
  }
  if (custody.scan_state !== "clean") return hold(H.SCAN_NOT_CLEAN);
  if (custody.quarantine_state !== "released") return hold(H.QUARANTINE_NOT_RELEASED);
  if (custody.uploader_authority_ref !== current.uploader_authority_ref
    || custody.uploader_authority_epoch !== current.current_uploader_authority_epoch) {
    return hold(H.AUTHORITY_STALE);
  }
  if (custody.trusted_pin_ref !== current.trusted_pin_ref
    || custody.trusted_pin_digest !== current.trusted_pin_digest) {
    return hold(H.TRUSTED_PIN_MISMATCH);
  }
  if (custody.result_ref !== execution.result_ref
    || custody.result_ref !== current.expected_result_ref
    || !sameList(custody.evidence_refs, execution.evidence_refs)
    || !sameList(custody.evidence_refs, current.expected_evidence_refs)) {
    return hold(H.RESULT_EVIDENCE_MISMATCH);
  }
  if (!sameList(custody.source_refs, current.expected_source_refs)) {
    return hold(H.SOURCE_MISMATCH);
  }
  if (custody.authentication_receipt_ref !== current.expected_authentication_receipt_ref
    || custody.authentication_claim_digest !== current.expected_authentication_claim_digest) {
    return hold(H.AUTHENTICATION_MISMATCH);
  }
  if (current.consumed_custody_receipt_refs.includes(custody.custody_receipt_ref)
    || current.consumed_idempotency_keys.includes(custody.idempotency_key)) {
    return hold(H.REPLAY);
  }
  if (![custody.submission_id, execution.attribution.actor_ref, custody.assignment_ref,
    custody.project_ref, custody.idempotency_key, custody.custody_receipt_ref,
    custody.logical_artifact_id].every(vaultRef)) return hold(H.VAULT_INPUT_INCOMPATIBLE);

  return buildProposal(execution, custody);
}

export function admitHermesArtifactSubmission(rawRequest) {
  try {
    return admitHermesArtifactSubmissionGuarded(rawRequest);
  } catch {
    return hold(H.REQUEST_INVALID);
  }
}
