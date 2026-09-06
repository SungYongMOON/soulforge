// Best-effort Windows ACL lockdown for locally generated secret-bearing files.
//
// `{ mode: 0o600 }` and `chmod(path, 0o600)` do not restrict access on Windows:
// Node maps the mode bits to the read-only attribute only, and the real access
// control list of the file is inherited from its parent directory. Observed
// 2026-09-06: a file created with `{ flag: "wx", mode: 0o600 }` under a checkout
// whose drive root grants `Authenticated Users:(M)` and `BUILTIN\Users:(RX)`
// inherited both ACEs, so every local account could read and modify it; the
// same file under a directory already narrowed to one account inherited that
// narrow ACL. The gap therefore depends entirely on where the operator points
// the output, which the writing code cannot know.
//
// This module narrows a freshly created file to the current user and always
// reports what actually happened, so the code that creates the file and any
// operator-facing surface (CLI result, canary preflight) can say "we tried and
// it worked" or "we tried and it failed", never assume success. It never reads
// or logs the contents of the file and never throws for a failed lockdown: that
// is a fact to report, and the caller decides whether it is fatal. It is the
// Node counterpart of `guild_hall/secure_work/src/soulforge_secure_work/winsec.py`
// and is kept per-language on purpose rather than shared across Python and Node.
//
// Two consequences of `/inheritance:r /grant:r <user>:F` that callers and docs
// must not hide: the inherited SYSTEM and Administrators entries are dropped
// too (only the creating account keeps access, so create and use the file
// under the same account), and the grant names the account rather than its
// SID, so the module proves the running account can still open the file
// afterwards before it reports `applied`.
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readFile, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ACL_RECEIPT_SUFFIX = ".acl_receipt.json";
const UNKNOWN_ON_WINDOWS = new Set(["not_attempted", "receipt_missing", "receipt_unreadable"]);

function outcome(attempted, applied, detail) {
  return Object.freeze({ attempted, applied, detail });
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

/**
 * Narrow `path` to the current user with the fixed system `icacls.exe`
 * (`/inheritance:r /grant:r <USERNAME>:F`). Not attempted off Windows.
 * Returns `{ attempted, applied, detail }` and never throws.
 */
export async function restrictToCurrentUser(path, { platform = process.platform, env = process.env } = {}) {
  if (platform !== "win32") return outcome(false, false, "NOT_WINDOWS");
  const user = env.USERNAME;
  if (typeof user !== "string" || user === "") return outcome(true, false, "USERNAME_UNSET");
  const systemRoot = env.SystemRoot;
  if (typeof systemRoot !== "string" || !isAbsolute(systemRoot)) return outcome(true, false, "SYSTEMROOT_UNSET");
  const icacls = join(systemRoot, "System32", "icacls.exe");
  try {
    await execFileAsync(icacls, [String(path), "/inheritance:r", "/grant:r", `${user}:F`], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      encoding: "utf8",
    });
  } catch (error) {
    // A timed-out child is killed and still carries an exit code on Windows,
    // so the kill has to be recognised before the exit code is.
    if (error?.killed) return outcome(true, false, "icacls_timeout");
    if (Number.isInteger(error?.code)) return outcome(true, false, `icacls_exit_${error.code}`);
    return outcome(true, false, typeof error?.code === "string" ? error.code : "icacls_failed");
  }
  // Read-back: open and close a handle to prove the running account kept
  // access after the narrowing. The contents are never read.
  try {
    const handle = await open(path, "r");
    await handle.close();
  } catch {
    return outcome(true, false, "ICACLS_OK_READBACK_DENIED");
  }
  return outcome(true, true, "ICACLS_OK");
}

export function aclReceiptPath(path) {
  return `${String(path)}${ACL_RECEIPT_SUFFIX}`;
}

/**
 * The one shape every operator-facing surface reports: `status` is
 * `applied`, `failed` or `not_attempted` for a fresh outcome (a receipt read
 * back later can also be `receipt_missing` or `receipt_unreadable`), `detail`
 * is the recorded reason or null.
 */
export function summarizeLockdown(lockdown) {
  const detail = typeof lockdown?.detail === "string" ? lockdown.detail : null;
  if (lockdown?.attempted !== true) return { status: "not_attempted", detail };
  return { status: lockdown.applied === true ? "applied" : "failed", detail };
}

/**
 * Warnings for a doctor/health surface. A failed lockdown always warns; on
 * Windows a file whose lockdown is unknown (no receipt, unreadable receipt,
 * or never attempted) warns too, because there the file mode protects nothing.
 */
export function lockdownWarnings(label, summary, { platform = process.platform } = {}) {
  if (summary?.status === "failed") return [`${label}_acl_lockdown_failed:${summary.detail}`];
  if (platform === "win32" && UNKNOWN_ON_WINDOWS.has(summary?.status)) {
    return [`${label}_acl_lockdown_unknown:${summary.status}`];
  }
  return [];
}

/**
 * Sidecar receipt next to the protected file: schema plus the outcome, nothing
 * else. It carries neither the path nor the contents of the file, so it can be
 * quoted in a report. Written with the same discipline as the secret writers
 * next to it: a planted link at the receipt path is refused, only a plain
 * stale receipt is replaced, and the new one is created exclusively.
 */
export async function writeAclReceipt(path, schema, lockdown) {
  const receipt = {
    schema,
    attempted: lockdown.attempted === true,
    applied: lockdown.applied === true,
    detail: String(lockdown.detail),
  };
  const target = aclReceiptPath(path);
  let existing = null;
  try {
    existing = await lstat(target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (existing !== null) {
    if (existing.isSymbolicLink() || !existing.isFile()) fail("acl_receipt_path_unsafe");
    await unlink(target);
  }
  const handle = await open(
    target,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  return target;
}

/**
 * Summarize the receipt for a doctor/health surface (see `summarizeLockdown`
 * for the shape). Never throws; a link at the receipt path is not followed.
 */
export async function readAclReceipt(path) {
  const target = aclReceiptPath(path);
  let raw;
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) return { status: "receipt_unreadable", detail: null };
    raw = await readFile(target, "utf8");
  } catch (error) {
    return { status: error?.code === "ENOENT" ? "receipt_missing" : "receipt_unreadable", detail: null };
  }
  let receipt;
  try { receipt = JSON.parse(raw); } catch { return { status: "receipt_unreadable", detail: null }; }
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)
    || typeof receipt.attempted !== "boolean" || typeof receipt.applied !== "boolean") {
    return { status: "receipt_unreadable", detail: null };
  }
  return summarizeLockdown(receipt);
}
