import { randomBytes } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  buildOfficialProviderQuotaProjection,
  validateOfficialProviderQuotaSnapshot,
} from "../core/provider-quota-snapshot.mjs";

export const PROVIDER_QUOTA_RECEIPT_FILE_NAME = "provider_quota.receipt.v1.json";

const DEFAULT_FS_OPS = Object.freeze({
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function nowMs(now) {
  const value = typeof now === "function" ? now() : now;
  if (!Number.isFinite(value)) fail("provider_quota_receipt_clock_invalid");
  return Number(value);
}

function safeNonce(value) {
  const candidate = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{8,80}$/u.test(candidate)) fail("provider_quota_receipt_nonce_invalid");
  return candidate;
}

function observedAtMs(snapshot) {
  const value = Date.parse(snapshot.observed_at);
  if (!Number.isFinite(value)) fail("provider_quota_receipt_existing_invalid");
  return value;
}

async function readValidatedReceipt(receiptPath, fsOps, referenceMs) {
  let raw;
  try {
    raw = await fsOps.readFile(receiptPath, "utf8");
  } catch (error) {
    return error?.code === "ENOENT"
      ? { state: "missing", snapshot: null }
      : { state: "invalid", snapshot: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: "invalid", snapshot: null };
  }
  try {
    return {
      state: "valid",
      snapshot: validateOfficialProviderQuotaSnapshot(parsed, { nowMs: referenceMs }),
    };
  } catch {
    return { state: "invalid", snapshot: null };
  }
}

async function acquireExclusiveLock(lockPath, fsOps) {
  let handle;
  try {
    handle = await fsOps.open(lockPath, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") fail("provider_quota_receipt_store_busy");
    fail("provider_quota_receipt_lock_failed");
  }
  try {
    await handle.close();
  } catch {
    await fsOps.unlink(lockPath).catch(() => {});
    fail("provider_quota_receipt_lock_failed");
  }
}

async function withExclusiveLock(lockPath, fsOps, operation) {
  await acquireExclusiveLock(lockPath, fsOps);
  try {
    return await operation();
  } finally {
    await fsOps.unlink(lockPath).catch(() => {});
  }
}

async function writeAtomically(receiptPath, snapshot, fsOps, nonce) {
  const directory = path.dirname(receiptPath);
  const temporary = path.join(
    directory,
    `.${path.basename(receiptPath)}.${safeNonce(nonce())}.tmp`,
  );
  try {
    await fsOps.mkdir(directory, { recursive: true });
    await fsOps.writeFile(temporary, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", flag: "wx" });
    await fsOps.rename(temporary, receiptPath);
  } catch {
    await fsOps.unlink(temporary).catch(() => {});
    fail("provider_quota_receipt_write_failed");
  }
}

async function ensureReceiptDirectory(receiptPath, fsOps) {
  try {
    await fsOps.mkdir(path.dirname(receiptPath), { recursive: true });
  } catch {
    fail("provider_quota_receipt_write_failed");
  }
}

// The store has no transport, provider, configuration, or scheduler authority.
// It accepts only a fully validated snapshot and leaves an unreadable receipt
// untouched rather than attempting to repair or replace it.
export function createProviderQuotaReceiptStore({
  receiptPath,
  fsOps = {},
  now = Date.now,
  nonce = () => randomBytes(12).toString("hex"),
} = {}) {
  if (typeof receiptPath !== "string" || receiptPath.trim() === "") {
    fail("provider_quota_receipt_path_invalid");
  }
  if (typeof nonce !== "function") fail("provider_quota_receipt_nonce_invalid");
  const selectedFsOps = { ...DEFAULT_FS_OPS, ...fsOps };
  const resolvedReceiptPath = path.resolve(receiptPath);
  const lockPath = `${resolvedReceiptPath}.lock`;

  return {
    // A read-only consumer intentionally treats a retained receipt as stale.
    // It does not create directories, contact a provider, or write state.
    async readReadOnlyProjection() {
      const referenceMs = nowMs(now);
      const stored = await readValidatedReceipt(resolvedReceiptPath, selectedFsOps, referenceMs);
      return buildOfficialProviderQuotaProjection({
        snapshot: stored.snapshot,
        sourceAvailable: false,
        nowMs: referenceMs,
      });
    },

    async persistAcceptedSnapshot(snapshot) {
      const referenceMs = nowMs(now);
      const candidate = validateOfficialProviderQuotaSnapshot(snapshot, { nowMs: referenceMs });
      await ensureReceiptDirectory(resolvedReceiptPath, selectedFsOps);
      return withExclusiveLock(lockPath, selectedFsOps, async () => {
        const existing = await readValidatedReceipt(resolvedReceiptPath, selectedFsOps, referenceMs);
        if (existing.state === "invalid") fail("provider_quota_receipt_existing_invalid");
        if (existing.snapshot !== null) {
          const candidateObservedAt = observedAtMs(candidate);
          const existingObservedAt = observedAtMs(existing.snapshot);
          if (candidateObservedAt < existingObservedAt) {
            return { write_state: "retained_newer", snapshot: existing.snapshot };
          }
          if (candidateObservedAt === existingObservedAt) {
            if (candidate.digest !== existing.snapshot.digest) {
              fail("provider_quota_receipt_observation_conflict");
            }
            return { write_state: "already_current", snapshot: existing.snapshot };
          }
        }
        await writeAtomically(resolvedReceiptPath, candidate, selectedFsOps, nonce);
        return { write_state: "written", snapshot: candidate };
      });
    },
  };
}
