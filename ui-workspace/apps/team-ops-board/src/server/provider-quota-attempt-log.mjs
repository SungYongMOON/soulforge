// provider-quota-attempt-log.mjs — sanitized evidence that a quota collection
// attempt happened, separate from the accepted quota snapshot itself.
//
// The accepted receipt answers "what was the last good value". This log answers
// "did collection actually run, and how did it end". Keeping them apart is what
// stops a stale last-good percentage from reading as a current observation.
//
// It stores only a fixed result token and its class. No token, header, body,
// account, URL, path, provider payload, or error text ever reaches this file.

import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { classifyBoundedHistory, planBoundedHistoryAppend } from "../core/bounded-observability-history.mjs";

export const PROVIDER_QUOTA_ATTEMPT_SCHEMA = "soulforge.team_ops_board_provider_quota_attempt.v1";
export const PROVIDER_QUOTA_ATTEMPT_HISTORY_SCHEMA =
  "soulforge.team_ops_board_provider_quota_attempt_history.v1";
export const PROVIDER_QUOTA_ATTEMPT_FILE_NAME = "provider_quota.attempt.v1.json";
export const PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME = "provider_quota.attempt-history.v1.json";
export const PROVIDER_QUOTA_ATTEMPT_HISTORY_LIMIT = 50;
// A bounded read, not just a bounded write. Evidence is read back by the
// loopback adapter on a refresh, so the reader inspects the entry first and
// refuses anything that is not a regular, unlinked file inside a fixed byte
// budget. 50 rows of four short fields sit far under this.
export const PROVIDER_QUOTA_ATTEMPT_MAX_BYTES = 64 * 1024;

export const PROVIDER_QUOTA_ATTEMPT_PROVIDERS = Object.freeze(["claude"]);

// gate_disabled is intentionally absent: a disabled feature made no attempt, so
// recording one would manufacture liveness evidence that does not exist.
const RESULT_CLASSES = Object.freeze({
  written: "accepted",
  already_current: "accepted",
  retained_newer: "accepted",
  auth_rejected: "auth_rejected",
  credential_unavailable: "credential_unavailable",
  request_failed: "transport_failed",
  response_invalid: "response_invalid",
  receipt_failed: "receipt_failed",
});

export const PROVIDER_QUOTA_ATTEMPT_RESULTS = Object.freeze(Object.keys(RESULT_CLASSES));
export const PROVIDER_QUOTA_ATTEMPT_CLASSES = Object.freeze([
  ...new Set(Object.values(RESULT_CLASSES)),
]);

const ENTRY_KEYS = Object.freeze(["provider", "attempted_at", "result", "result_class"]);
const LATEST_KEYS = Object.freeze(["schema_version", ...ENTRY_KEYS]);
const NONCE_PATTERN = /^[A-Za-z0-9_-]{8,80}$/u;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function isExactIso(value) {
  if (typeof value !== "string") return false;
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) && new Date(epochMs).toISOString() === value;
}

export function classifyProviderQuotaAttempt(result) {
  return Object.hasOwn(RESULT_CLASSES, result) ? RESULT_CLASSES[result] : null;
}

export function isProviderQuotaAttemptEntry(value) {
  return hasExactKeys(value, ENTRY_KEYS)
    && PROVIDER_QUOTA_ATTEMPT_PROVIDERS.includes(value.provider)
    && isExactIso(value.attempted_at)
    && classifyProviderQuotaAttempt(value.result) !== null
    && classifyProviderQuotaAttempt(value.result) === value.result_class;
}

export function createProviderQuotaAttemptEntry({ provider, attemptedAt, result } = {}) {
  const entry = {
    provider,
    attempted_at: attemptedAt,
    result,
    result_class: classifyProviderQuotaAttempt(result),
  };
  return isProviderQuotaAttemptEntry(entry) ? entry : null;
}

// The log is best effort by contract. Quota collection must never fail, retry,
// or lose its own result because evidence persistence had a bad day.
export function createProviderQuotaAttemptLog({
  receiptDirectory,
  fsOps = {},
  historyLimit = PROVIDER_QUOTA_ATTEMPT_HISTORY_LIMIT,
  nonce = () => randomBytes(12).toString("hex"),
} = {}) {
  const selected = { lstat, mkdir, readFile, rename, unlink, writeFile, ...fsOps };
  const directory = typeof receiptDirectory === "string" && receiptDirectory.trim() !== ""
    ? path.resolve(receiptDirectory)
    : null;
  const latestPath = directory === null ? null : path.join(directory, PROVIDER_QUOTA_ATTEMPT_FILE_NAME);
  const historyPath = directory === null
    ? null
    : path.join(directory, PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME);

  async function writeAtomically(filePath, value) {
    const token = String(nonce());
    if (!NONCE_PATTERN.test(token)) throw new Error("provider_quota_attempt_nonce_invalid");
    const temporary = path.join(directory, `.${path.basename(filePath)}.${token}.tmp`);
    try {
      await selected.writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
      await selected.rename(temporary, filePath);
    } catch (error) {
      await selected.unlink(temporary).catch(() => {});
      throw error;
    }
  }

  // The boundary is checked before any byte is read: an oversized, symlinked, or
  // non-regular entry is refused rather than parsed.
  //
  // The result distinguishes a genuinely absent file from one that is present
  // but untrustworthy. That difference decides whether an append is a safe first
  // write or must preserve what is already on disk.
  async function probeBoundedJson(filePath) {
    let info;
    try {
      info = await selected.lstat(filePath);
    } catch (error) {
      return error?.code === "ENOENT"
        ? { presence: "missing", value: null }
        : { presence: "unreadable", value: null };
    }
    if (!info.isFile() || info.isSymbolicLink() || info.size > PROVIDER_QUOTA_ATTEMPT_MAX_BYTES) {
      return { presence: "unreadable", value: null };
    }
    try {
      return { presence: "present", value: JSON.parse(await selected.readFile(filePath, "utf8")) };
    } catch (error) {
      return error?.code === "ENOENT"
        ? { presence: "missing", value: null }
        : { presence: "unreadable", value: null };
    }
  }

  async function classifyHistory() {
    const probe = await probeBoundedJson(historyPath);
    return classifyBoundedHistory({
      presence: probe.presence,
      value: probe.value,
      schemaVersion: PROVIDER_QUOTA_ATTEMPT_HISTORY_SCHEMA,
      isEntry: isProviderQuotaAttemptEntry,
    });
  }

  return {
    async readLatest() {
      if (latestPath === null) return null;
      const stored = (await probeBoundedJson(latestPath)).value;
      if (!hasExactKeys(stored, LATEST_KEYS) || stored.schema_version !== PROVIDER_QUOTA_ATTEMPT_SCHEMA) {
        return null;
      }
      const entry = {
        provider: stored.provider,
        attempted_at: stored.attempted_at,
        result: stored.result,
        result_class: stored.result_class,
      };
      return isProviderQuotaAttemptEntry(entry) ? entry : null;
    },

    // Reports the audit state alongside the rows. An invalid history yields no
    // rows rather than a salvaged subset, and the file itself is left untouched.
    async readHistory() {
      if (historyPath === null) return { state: "missing", entries: [] };
      return classifyHistory();
    },

    // Latest and history are written independently on purpose. Current liveness
    // must stay visible even when the history cannot be safely appended, and a
    // corrupt history must never be overwritten to make the write succeed. The
    // history outcome is reported back rather than swallowed.
    async recordAttempt(options) {
      if (directory === null) return null;
      const entry = createProviderQuotaAttemptEntry(options);
      if (entry === null) return null;
      let plan = null;
      try {
        plan = planBoundedHistoryAppend({
          classified: await classifyHistory(),
          entry,
          schemaVersion: PROVIDER_QUOTA_ATTEMPT_HISTORY_SCHEMA,
          limit: historyLimit,
          isEntry: isProviderQuotaAttemptEntry,
        });
      } catch {
        plan = { outcome: "preserved", record: null, reason: "history_plan_failed" };
      }
      let latestOutcome = "written";
      try {
        await selected.mkdir(directory, { recursive: true });
        await writeAtomically(latestPath, { schema_version: PROVIDER_QUOTA_ATTEMPT_SCHEMA, ...entry });
      } catch {
        latestOutcome = "latest_write_failed";
      }
      let historyOutcome = plan.outcome;
      let historyReason = plan.reason;
      if (plan.record !== null) {
        try {
          await writeAtomically(historyPath, plan.record);
        } catch {
          historyOutcome = "preserved";
          historyReason = "history_write_failed";
        }
      }
      return {
        entry,
        latest_outcome: latestOutcome,
        history_outcome: historyOutcome,
        history_reason: historyReason,
      };
    },
  };
}
