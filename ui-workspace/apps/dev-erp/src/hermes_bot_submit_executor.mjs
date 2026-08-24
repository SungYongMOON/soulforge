import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { open, lstat, realpath } from "node:fs/promises";
import path from "node:path";

const HERMES_JSONL_SCHEMA = "hermes.bot_submit.v1";
const TASK_SCHEMA = "soulforge.candidate_execution.task_packet.v1";
const ASSIGNMENT_SCHEMA = "soulforge.assignment_policy.assignment_packet.v1";
const HERMES_EXECUTOR_REF = "executor.hermes.bot-submit";
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]/iu;
const LOCAL_PATH_VALUE = /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[A-Za-z0-9]|(?:^|[^A-Za-z0-9])\/(?:Users|home|mnt|opt|srv|var|etc|tmp|root|Volumes|Applications)\/|(?:^|[^A-Za-z0-9])(?:_workmeta|_workspaces|private-state)\/|guild_hall\/state\//iu;
const RUNTIME_BINDING_KEYS = [
  "performing_agent_id",
  "bot_ref",
  "durable_session_key",
  "expected_model",
  "executable_path",
  "executable_sha256",
  "HERMES_HOME",
  "working_directory",
];
const EXECUTE_KEYS = [
  "operation_id",
  "fencing_epoch",
  "attempt_no",
  "claim",
  "task_packet",
  "assignment_packet",
];
const MAX_PROMPT_CHARS = 16_000;
const MAX_PROMPT_BYTES = 64 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_WAIT_SECONDS = 3_600;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  const ownKeys = isPlainObject(value) ? Reflect.ownKeys(value) : [];
  return isPlainObject(value)
    && ownKeys.length === keys.length
    && ownKeys.every((key) => typeof key === "string")
    && keys.every((key) => Object.hasOwn(value, key));
}

function snapshotDataObject(value) {
  if (!isPlainObject(value) || Reflect.ownKeys(value).some((key) => typeof key !== "string")) {
    return null;
  }
  const snapshot = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set || !descriptor.enumerable) return null;
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")
    || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function snapshotExecuteInput(value) {
  try {
    return deepFreeze(structuredClone(value));
  } catch {
    return null;
  }
}

function safeIdentifier(value, maxLength = 256) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    && ![...value].some((character) => {
      const codepoint = character.codePointAt(0);
      return codepoint < 0x20 || (codepoint >= 0x7f && codepoint <= 0x9f)
        || (codepoint >= 0xd800 && codepoint <= 0xdfff);
    });
}

function safeAbsolutePath(value) {
  return safeIdentifier(value, 2_048) && path.isAbsolute(value)
    && path.normalize(value) === value
    && path.normalize(value) !== path.parse(value).root;
}

function safeCliValue(value) {
  return safeIdentifier(value) && !value.startsWith("-");
}

function samePath(left, right) {
  const normalize = (value) => path.normalize(value);
  return process.platform === "win32"
    ? normalize(left).toLowerCase() === normalize(right).toLowerCase()
    : normalize(left) === normalize(right);
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value)
    && !SECRET_VALUE.test(value) && !LOCAL_PATH_VALUE.test(value);
}

function sameTaskRef(left, right) {
  return left?.provider === right?.provider && left?.task_id === right?.task_id;
}

function sameRevisionRef(left, right) {
  return left?.provider === right?.provider && left?.task_id === right?.task_id
    && left?.revision_id === right?.revision_id
    && left?.content_sha256 === right?.content_sha256;
}

function validTaskRef(value) {
  return exactKeys(value, ["provider", "task_id"])
    && safeId(value.provider) && safeId(value.task_id);
}

function validRevisionRef(value, taskRef) {
  return exactKeys(value, ["provider", "task_id", "revision_id", "content_sha256"])
    && value.provider === taskRef.provider && value.task_id === taskRef.task_id
    && safeId(value.revision_id) && SHA256.test(value.content_sha256);
}

function validSnapshotRef(value) {
  return exactKeys(value, ["revision_id", "content_sha256"])
    && safeId(value.revision_id) && SHA256.test(value.content_sha256);
}

function validIdList(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 64
    && value.every(safeId) && new Set(value).size === value.length;
}

function validTaskPacket(value) {
  return exactKeys(value, [
    "schema_version", "validation_state", "task_class", "task_status", "task_ref",
    "parent_task_ref", "work_brief_revision_ref", "action_ref", "authority_ref",
    "coverage_refs",
  ]) && value.schema_version === TASK_SCHEMA
    && value.validation_state === "prevalidated" && value.task_class === "official"
    && value.task_status === "Todo" && validTaskRef(value.task_ref)
    && (value.parent_task_ref === null || validTaskRef(value.parent_task_ref))
    && (value.parent_task_ref === null || !sameTaskRef(value.parent_task_ref, value.task_ref))
    && validRevisionRef(value.work_brief_revision_ref, value.task_ref)
    && safeId(value.action_ref) && safeId(value.authority_ref)
    && validIdList(value.coverage_refs);
}

function validAssignmentPacket(value) {
  if (!exactKeys(value, [
    "schema_version", "validation_state", "assignment_state", "policy_mode",
    "policy_revision_ref", "task_ref", "work_brief_revision_ref", "action_ref",
    "authority_ref", "responsible_role_ref", "performer_binding",
  ]) || value.schema_version !== ASSIGNMENT_SCHEMA
    || value.validation_state !== "prevalidated" || value.assignment_state !== "assigned"
    || value.policy_mode !== "responsible_ceo_triage"
    || !validSnapshotRef(value.policy_revision_ref) || !validTaskRef(value.task_ref)
    || !validRevisionRef(value.work_brief_revision_ref, value.task_ref)
    || !safeId(value.action_ref) || !safeId(value.authority_ref)
    || !safeId(value.responsible_role_ref)) return false;
  const performer = value.performer_binding;
  return exactKeys(performer, [
    "actor_ref", "performing_agent_id", "bot_ref", "executor_ref",
    "capability_snapshot_ref",
  ]) && safeId(performer.actor_ref) && safeId(performer.performing_agent_id)
    && safeId(performer.bot_ref) && performer.executor_ref === HERMES_EXECUTOR_REF
    && validSnapshotRef(performer.capability_snapshot_ref);
}

function validRuntimeBinding(binding) {
  return exactKeys(binding, RUNTIME_BINDING_KEYS)
    && safeId(binding.performing_agent_id)
    && safeId(binding.bot_ref)
    && safeCliValue(binding.durable_session_key)
    && safeCliValue(binding.expected_model)
    && safeAbsolutePath(binding.executable_path)
    && SHA256.test(binding.executable_sha256)
    && safeAbsolutePath(binding.HERMES_HOME)
    && safeAbsolutePath(binding.working_directory);
}

function validExecuteInput(input) {
  if (!exactKeys(input, EXECUTE_KEYS)
    || !safeId(input.operation_id)
    || !Number.isSafeInteger(input.fencing_epoch) || input.fencing_epoch < 1
    || !Number.isSafeInteger(input.attempt_no) || input.attempt_no < 1
    || !exactKeys(input.claim, ["task_ref", "work_brief_revision_ref", "action_ref"])
    || !validTaskRef(input.claim.task_ref)
    || !validRevisionRef(input.claim.work_brief_revision_ref, input.claim.task_ref)
    || !safeId(input.claim.action_ref)
    || !validTaskPacket(input.task_packet)
    || !validAssignmentPacket(input.assignment_packet)) return false;
  const task = input.task_packet;
  const assignment = input.assignment_packet;
  return sameTaskRef(input.claim.task_ref, task.task_ref)
    && sameRevisionRef(input.claim.work_brief_revision_ref, task.work_brief_revision_ref)
    && input.claim.action_ref === task.action_ref
    && sameTaskRef(assignment.task_ref, task.task_ref)
    && sameRevisionRef(assignment.work_brief_revision_ref, task.work_brief_revision_ref)
    && assignment.action_ref === task.action_ref
    && assignment.authority_ref === task.authority_ref
    && isPlainObject(assignment.performer_binding);
}

function validPrompt(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_PROMPT_CHARS
    || Buffer.byteLength(text, "utf8") > MAX_PROMPT_BYTES) return false;
  return ![...text].some((character) => {
    const codepoint = character.codePointAt(0);
    if (character === "\t" || character === "\n") return false;
    return codepoint === 0 || codepoint < 0x20
      || (codepoint >= 0x7f && codepoint <= 0x9f)
      || (codepoint >= 0xd800 && codepoint <= 0xdfff);
  });
}

function outcome(status, reasonCode = null, resultRef = null, evidenceRefs = []) {
  return Object.freeze({
    status,
    reason_code: reasonCode,
    result_ref: resultRef,
    artifact_refs: Object.freeze([]),
    evidence_refs: Object.freeze([...evidenceRefs]),
    external_effect_evidence: Object.freeze({
      source: "executor.hermes.bot-submit",
      receipt_ref: "hermes-adapter-receipt.unknown.v1",
      linear_writes: "UNKNOWN",
      network_calls: "UNKNOWN",
      filesystem_writes: "UNKNOWN",
      shell_commands: "UNKNOWN",
    }),
  });
}

function withExternalEffectReceipt(value, receiptRef) {
  return Object.freeze({
    ...value,
    external_effect_evidence: Object.freeze({
      ...value.external_effect_evidence,
      receipt_ref: receiptRef,
    }),
  });
}

function digestRef(prefix, value) {
  return `${prefix}.sha256.${createHash("sha256").update(value).digest("hex")}`;
}

function eventName(record) {
  if (!isPlainObject(record)) return null;
  if (Object.hasOwn(record, "event") === Object.hasOwn(record, "type")) return null;
  return record.event ?? record.type;
}

function hasOnlyKnownRecordKeys(record) {
  const known = new Set([
    "schema_version", "event", "type", "state", "request_id", "session_key",
    "requested_session_key", "actual_session_key", "live_session_id", "started_at",
    "model", "expected_model", "operation_id", "status", "text", "usage",
    "finished_at", "code",
  ]);
  return isPlainObject(record) && Object.keys(record).every((key) => known.has(key));
}

function validOptionalIdentity(record, binding, operationId) {
  const hasRequestedSession = Object.hasOwn(record, "requested_session_key");
  const hasActualSession = Object.hasOwn(record, "actual_session_key");
  if (hasRequestedSession !== hasActualSession) return false;
  for (const key of ["session_key", "requested_session_key", "actual_session_key"]) {
    if (Object.hasOwn(record, key) && record[key] !== binding.durable_session_key) return false;
  }
  if (Object.hasOwn(record, "model") && record.model !== binding.expected_model) return false;
  if (Object.hasOwn(record, "expected_model")
    && record.expected_model !== binding.expected_model) return false;
  if (Object.hasOwn(record, "operation_id") && record.operation_id !== operationId) return false;
  if (Object.hasOwn(record, "live_session_id")
    && !safeIdentifier(record.live_session_id, 256)) return false;
  for (const key of ["started_at", "finished_at"]) {
    if (Object.hasOwn(record, key) && !safeIdentifier(record[key], 64)) return false;
  }
  return true;
}

function validAccepted(record, binding, operationId) {
  const hasLegacySession = Object.hasOwn(record, "session_key");
  const hasRequestedSession = Object.hasOwn(record, "requested_session_key");
  const hasActualSession = Object.hasOwn(record, "actual_session_key");
  return hasOnlyKnownRecordKeys(record)
    && record.schema_version === HERMES_JSONL_SCHEMA
    && eventName(record) === "accepted"
    && (!Object.hasOwn(record, "state") || record.state === "accepted")
    && safeIdentifier(record.request_id, 64)
    && (hasLegacySession || (hasRequestedSession && hasActualSession))
    && hasRequestedSession === hasActualSession
    && Object.hasOwn(record, "model")
    && record.model === binding.expected_model
    && validOptionalIdentity(record, binding, operationId);
}

function validUsage(value) {
  return value === undefined || (isPlainObject(value)
    && Object.keys(value).length <= 16
    && Object.entries(value).every(([key, count]) => (
      /^[a-z][a-z0-9_]{0,63}$/u.test(key)
      && Number.isSafeInteger(count) && count >= 0
    )));
}

function validCompleted(record, binding, operationId) {
  return hasOnlyKnownRecordKeys(record)
    && record.schema_version === HERMES_JSONL_SCHEMA
    && eventName(record) === "completed"
    && (!Object.hasOwn(record, "state")
      || ["completed", "hold", "unknown", "rejected"].includes(record.state))
    && safeIdentifier(record.request_id, 64)
    && (!Object.hasOwn(record, "code") || safeIdentifier(record.code, 96))
    && (!Object.hasOwn(record, "status")
      || ["complete", "error", "interrupted"].includes(record.status))
    && validOptionalIdentity(record, binding, operationId)
    && validUsage(record.usage);
}

function parseJsonl(stdout, maxOutputBytes) {
  if (!(typeof stdout === "string" || Buffer.isBuffer(stdout))) return null;
  if (Buffer.byteLength(stdout) > maxOutputBytes) return { oversized: true };
  let text;
  try {
    text = Buffer.isBuffer(stdout)
      ? new TextDecoder("utf-8", { fatal: true }).decode(stdout)
      : stdout;
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines.length === 0 || lines.length > 3) return null;
  try {
    const records = lines.map((line) => JSON.parse(line));
    return records.every(isPlainObject) ? { records } : null;
  } catch {
    return null;
  }
}

function mapCommandResult(commandResult, binding, operationId, requestedAt, maxOutputBytes) {
  if (!exactKeys(commandResult, ["exit_code", "stdout", "stderr"])
    || !Number.isInteger(commandResult.exit_code)
    || !(typeof commandResult.stderr === "string" || Buffer.isBuffer(commandResult.stderr))) {
    return outcome("hold", "HERMES_COMMAND_RESULT_INVALID");
  }
  if (Buffer.byteLength(commandResult.stderr) > maxOutputBytes) {
    return outcome("failed", "HERMES_OUTPUT_OVERSIZED");
  }
  const stdoutBytes = typeof commandResult.stdout === "string" || Buffer.isBuffer(commandResult.stdout)
    ? Buffer.byteLength(commandResult.stdout) : 0;
  if (stdoutBytes + Buffer.byteLength(commandResult.stderr) > maxOutputBytes) {
    return outcome("failed", "HERMES_OUTPUT_OVERSIZED");
  }
  if (commandResult.exit_code === 2) {
    return outcome("failed", "HERMES_COMMAND_USAGE_ERROR");
  }
  if (![0, 1, 3, 124].includes(commandResult.exit_code)) {
    return outcome("failed", "HERMES_COMMAND_FAILED");
  }
  if (commandResult.exit_code === 124 && stdoutBytes === 0) {
    return outcome("hold", "HERMES_TIMEOUT_UNKNOWN");
  }
  const parsed = parseJsonl(commandResult.stdout, maxOutputBytes);
  if (parsed?.oversized) return outcome("failed", "HERMES_OUTPUT_OVERSIZED");
  if (!parsed) return outcome("failed", "HERMES_JSONL_MALFORMED");
  const { records } = parsed;
  const acceptedRecords = records.filter((record) => eventName(record) === "accepted");
  const completedRecords = records.filter((record) => eventName(record) === "completed");

  const exactTwoRecordSequence = records.length === 2
    && acceptedRecords.length === 1 && completedRecords.length === 1
    && records[0] === acceptedRecords[0] && records[1] === completedRecords[0];
  const accepted = acceptedRecords[0];
  const completed = completedRecords[0];
  if (records.length === 2 && acceptedRecords.length === 1 && completedRecords.length === 1
    && isPlainObject(accepted) && !Object.hasOwn(accepted, "model")) {
    return outcome("hold", "HERMES_ACCEPTED_MODEL_REQUIRED");
  }
  const validTwoRecordIdentity = exactTwoRecordSequence
    && validAccepted(accepted, binding, operationId)
    && validCompleted(completed, binding, operationId)
    && completed.request_id === accepted.request_id;

  if (commandResult.exit_code === 3) {
    const validSingleHold = records.length === 1 && completedRecords.length === 1
      && validCompleted(completed, binding, operationId)
      && (completed.state === "hold" || completed.status === "interrupted");
    const validAcceptedHold = validTwoRecordIdentity
      && (completed.state === "hold" || completed.status === "interrupted");
    return validSingleHold || validAcceptedHold
      ? outcome("hold", "HERMES_RUNTIME_HOLD")
      : outcome("failed", "HERMES_PROTOCOL_MISMATCH");
  }
  if (commandResult.exit_code === 124) {
    const validPreAckUnknown = records.length === 1 && completedRecords.length === 1
      && validCompleted(completed, binding, operationId) && completed.state === "unknown";
    if (validPreAckUnknown) return outcome("hold", "HERMES_PRE_ACK_UNKNOWN");
    if (validTwoRecordIdentity && completed.state === "unknown") {
      return outcome("hold", "HERMES_RESULT_UNKNOWN");
    }
    return outcome("failed", "HERMES_PROTOCOL_MISMATCH");
  }
  if (commandResult.exit_code === 1 && validTwoRecordIdentity
    && (!Object.hasOwn(completed, "state") || completed.state === "completed")
    && completed.status === "error") {
    return outcome("failed", "HERMES_TERMINAL_ERROR");
  }

  if (commandResult.exit_code !== 0) {
    return outcome("failed", "HERMES_COMMAND_FAILED");
  }
  if (!exactTwoRecordSequence) {
    return outcome("failed", "HERMES_JSONL_SEQUENCE_INVALID");
  }
  if (!validTwoRecordIdentity) {
    return outcome("failed", "HERMES_PROTOCOL_MISMATCH");
  }
  if ((Object.hasOwn(completed, "state") && completed.state !== "completed")
    || completed.status !== "complete") {
    return outcome("failed", "HERMES_TERMINAL_ERROR");
  }
  if (typeof completed.text !== "string" || completed.text.trim().length === 0) {
    return outcome("failed", "HERMES_EMPTY_RESULT");
  }
  const resultRef = digestRef("hermes-result", completed.text);
  const evidenceRef = digestRef("hermes-request", JSON.stringify({
    operation_id: operationId,
    request_id: accepted.request_id,
    requested_at: requestedAt,
  }));
  return outcome("succeeded", null, resultRef, [evidenceRef]);
}

async function defaultInspectFile(filePath) {
  const before = await lstat(filePath);
  const resolved = await realpath(filePath);
  return {
    is_file: before.isFile()
      && (process.platform === "win32" || (before.mode & 0o111) !== 0),
    is_reparse_point: before.isSymbolicLink() || !samePath(resolved, filePath),
    identity_ref: `file:${before.dev}:${before.ino}`,
  };
}

async function defaultHashFile(filePath) {
  const before = await lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("executable_not_regular");
  const handle = await open(filePath, "r");
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error("executable_not_regular");
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await lstat(filePath);
    if (!after.isFile() || after.isSymbolicLink()
      || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error("executable_changed_during_hash");
    }
  } finally {
    await handle.close();
  }
  return `sha256:${hash.digest("hex")}`;
}

async function defaultRunCommand(
  { command, argv, cwd, env, stdin, shell, max_output_bytes },
  { signal, verifyExecutableAfterSpawn },
) {
  return new Promise((resolve) => {
    const child = spawn(command, argv, {
      cwd,
      env: { ...env },
      shell,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let spawnVerified = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    signal.addEventListener("abort", () => {
      try { child.kill(); } catch {}
    }, { once: true });
    const spawnVerification = Promise.resolve()
      .then(verifyExecutableAfterSpawn)
      .then((verified) => {
        spawnVerified = verified === true;
        if (!spawnVerified) {
          try { child.kill(); } catch {}
        }
        return spawnVerified;
      }, () => {
        try { child.kill(); } catch {}
        return false;
      });
    const append = (chunks, chunk, byteCount, setByteCount) => {
      const next = byteCount + chunk.length;
      setByteCount(next);
      if (next <= max_output_bytes) chunks.push(chunk);
    };
    child.stdout.on("data", (chunk) => append(stdout, chunk, stdoutBytes,
      (value) => { stdoutBytes = value; }));
    child.stderr.on("data", (chunk) => append(stderr, chunk, stderrBytes,
      (value) => { stderrBytes = value; }));
    child.once("error", () => {
      settle({ exit_code: 125, stdout: "", stderr: "" });
    });
    child.once("close", async (code) => {
      await spawnVerification;
      settle({
        exit_code: spawnVerified ? (Number.isInteger(code) ? code : 125) : 126,
        stdout: stdoutBytes > max_output_bytes ? Buffer.alloc(max_output_bytes + 1) : Buffer.concat(stdout),
        stderr: stderrBytes > max_output_bytes ? Buffer.alloc(max_output_bytes + 1) : Buffer.concat(stderr),
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

// `runCommand` injection is a trusted test seam, not production execution evidence.
// A live canary must omit it and exercise `defaultRunCommand` with the pinned executable.
export function createHermesBotSubmitExecutor({
  feature_enabled = false,
  runtime_binding,
  wait_seconds = 60,
  resolveWorkBrief,
  inspectFile = defaultInspectFile,
  hashFile = defaultHashFile,
  runCommand = defaultRunCommand,
  now = Date.now,
  max_output_bytes = DEFAULT_MAX_OUTPUT_BYTES,
  hard_timeout_ms = (wait_seconds * 1_000) + 5_000,
} = {}) {
  const featureEnabled = feature_enabled === true;
  const binding = snapshotDataObject(runtime_binding);

  async function execute(input) {
    const inputSnapshot = snapshotExecuteInput(input);
    if (inputSnapshot === null) return outcome("hold", "HERMES_EXECUTION_PACKET_INVALID");
    if (!featureEnabled) return outcome("hold", "HERMES_EXECUTOR_FEATURE_OFF");
    if (!validRuntimeBinding(binding)) {
      return outcome("hold", "HERMES_RUNTIME_BINDING_INVALID");
    }
    if (!Number.isSafeInteger(wait_seconds) || wait_seconds < 1
      || wait_seconds > MAX_WAIT_SECONDS
      || !Number.isSafeInteger(max_output_bytes) || max_output_bytes < 1
      || !Number.isSafeInteger(hard_timeout_ms) || hard_timeout_ms < 1
      || hard_timeout_ms > ((MAX_WAIT_SECONDS + 60) * 1_000)
      || typeof resolveWorkBrief !== "function" || typeof inspectFile !== "function"
      || typeof hashFile !== "function" || typeof runCommand !== "function"
      || typeof now !== "function") {
      return outcome("hold", "HERMES_EXECUTOR_CONFIG_INVALID");
    }
    if (!validExecuteInput(inputSnapshot)) {
      return outcome("hold", "HERMES_EXECUTION_PACKET_INVALID");
    }
    const assignmentBinding = inputSnapshot.assignment_packet.performer_binding;
    if (assignmentBinding.performing_agent_id !== binding.performing_agent_id
      || assignmentBinding.bot_ref !== binding.bot_ref) {
      return outcome("hold", "HERMES_ASSIGNMENT_IDENTITY_MISMATCH");
    }
    const adapterReceiptRef = digestRef("hermes-adapter-receipt", JSON.stringify({
      operation_id: inputSnapshot.operation_id,
      fencing_epoch: inputSnapshot.fencing_epoch,
      attempt_no: inputSnapshot.attempt_no,
    }));
    const attemptOutcome = (status, reasonCode = null, resultRef = null, evidenceRefs = []) => (
      withExternalEffectReceipt(
        outcome(status, reasonCode, resultRef, evidenceRefs),
        adapterReceiptRef,
      )
    );

    const inspectExecutable = async (expectedIdentity = null) => {
      const inspected = await inspectFile(binding.executable_path);
      const keys = Object.keys(inspected ?? {});
      const exactInspection = exactKeys(inspected, ["is_file", "is_reparse_point"])
        || exactKeys(inspected, ["is_file", "is_reparse_point", "identity_ref"]);
      if (!exactInspection || inspected.is_file !== true || inspected.is_reparse_point !== false
        || (keys.includes("identity_ref") && !safeId(inspected.identity_ref))) {
        return { state: "unsafe", identity_ref: null };
      }
      if (expectedIdentity !== null && inspected.identity_ref !== expectedIdentity) {
        return { state: "drift", identity_ref: null };
      }
      const observedHash = await hashFile(binding.executable_path);
      if (observedHash !== binding.executable_sha256) {
        return { state: expectedIdentity === null ? "hash_mismatch" : "drift", identity_ref: null };
      }
      return { state: "ready", identity_ref: inspected.identity_ref ?? null };
    };
    let initialExecutable;
    try {
      initialExecutable = await inspectExecutable();
    } catch {
      return attemptOutcome("hold", "HERMES_EXECUTABLE_INSPECTION_FAILED");
    }
    if (initialExecutable.state === "unsafe") {
      return attemptOutcome("hold", "HERMES_EXECUTABLE_UNSAFE");
    }
    if (initialExecutable.state === "hash_mismatch") {
      return attemptOutcome("hold", "HERMES_EXECUTABLE_HASH_MISMATCH");
    }

    let workBrief;
    try {
      workBrief = await resolveWorkBrief(
        structuredClone(inputSnapshot.task_packet.work_brief_revision_ref),
      );
    } catch {
      return attemptOutcome("hold", "HERMES_WORK_BRIEF_UNAVAILABLE");
    }
    if (!validPrompt(workBrief)) return attemptOutcome("hold", "HERMES_WORK_BRIEF_INVALID");
    const requestedAt = now();
    if (!Number.isSafeInteger(requestedAt) || requestedAt < 0) {
      return attemptOutcome("hold", "HERMES_CLOCK_INVALID");
    }

    const command = {
      command: binding.executable_path,
      argv: [
        "bot-submit",
        "--session-key", binding.durable_session_key,
        "--expect-model", binding.expected_model,
        "--query-file", "-",
        "--wait-seconds", String(wait_seconds),
        "--jsonl",
      ],
      cwd: binding.working_directory,
      env: { HERMES_HOME: binding.HERMES_HOME },
      stdin: Buffer.from(workBrief, "utf8"),
      shell: false,
      max_output_bytes,
    };
    try {
      const preLaunch = await inspectExecutable(initialExecutable.identity_ref);
      if (preLaunch.state !== "ready") return attemptOutcome("hold", "HERMES_EXECUTABLE_DRIFT");
    } catch {
      return attemptOutcome("hold", "HERMES_EXECUTABLE_INSPECTION_FAILED");
    }
    const abortController = new AbortController();
    let spawnVerificationCalled = false;
    let spawnVerificationPassed = null;
    const verifyExecutableAfterSpawn = async () => {
      if (spawnVerificationCalled) return spawnVerificationPassed;
      spawnVerificationCalled = true;
      try {
        spawnVerificationPassed = (await inspectExecutable(initialExecutable.identity_ref)).state === "ready";
      } catch {
        spawnVerificationPassed = false;
      }
      return spawnVerificationPassed;
    };
    const commandAttempt = Promise.resolve()
      .then(() => runCommand(Object.freeze(command), Object.freeze({
        signal: abortController.signal,
        verifyExecutableAfterSpawn,
      })))
      .then(
        (value) => ({ state: "returned", value }),
        () => ({ state: "threw", value: null }),
      );
    let timeoutId;
    const deadline = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        resolve({ state: "timed_out", value: null });
      }, hard_timeout_ms);
    });
    let attempt;
    try {
      attempt = await Promise.race([commandAttempt, deadline]);
    } finally {
      clearTimeout(timeoutId);
    }
    if (attempt.state === "timed_out") return attemptOutcome("hold", "HERMES_TIMEOUT_UNKNOWN");
    if (attempt.state === "threw") {
      return attemptOutcome("hold", "HERMES_COMMAND_UNCERTAIN");
    }
    if (!spawnVerificationCalled) await verifyExecutableAfterSpawn();
    if (spawnVerificationPassed !== true) {
      return attemptOutcome("hold", "HERMES_EXECUTABLE_DRIFT");
    }
    const commandResult = attempt.value;
    return withExternalEffectReceipt(
      mapCommandResult(
        commandResult,
        binding,
        inputSnapshot.operation_id,
        requestedAt,
        max_output_bytes,
      ),
      adapterReceiptRef,
    );
  }

  return Object.freeze({ execute });
}
