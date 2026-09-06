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
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ACL_RECEIPT_SUFFIX = ".acl_receipt.json";

function outcome(attempted, applied, detail) {
  return Object.freeze({ attempted, applied, detail });
}

/**
 * Narrow `path` to the current user with the fixed system `icacls.exe`
 * (`/inheritance:r /grant:r <USERNAME>:F`), which also drops the inherited
 * SYSTEM and Administrators entries. Not attempted off Windows. Returns
 * `{ attempted, applied, detail }` and never throws.
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
    if (Number.isInteger(error?.code)) return outcome(true, false, `icacls_exit_${error.code}`);
    if (error?.killed) return outcome(true, false, "icacls_timeout");
    return outcome(true, false, typeof error?.code === "string" ? error.code : "icacls_failed");
  }
  return outcome(true, true, "ICACLS_OK");
}

export function aclReceiptPath(path) {
  return `${String(path)}${ACL_RECEIPT_SUFFIX}`;
}

/**
 * Sidecar receipt next to the protected file: schema plus the outcome, nothing
 * else. It carries neither the path nor the contents of the file, so it can be
 * quoted in a report. Overwrites a stale receipt from an earlier attempt.
 */
export async function writeAclReceipt(path, schema, lockdown) {
  const receipt = {
    schema,
    attempted: lockdown.attempted === true,
    applied: lockdown.applied === true,
    detail: String(lockdown.detail),
  };
  const target = aclReceiptPath(path);
  await writeFile(target, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return target;
}

/**
 * Summarize the receipt for a doctor/health surface. Never throws.
 * `status` is one of `applied`, `failed`, `not_attempted`, `receipt_missing`,
 * `receipt_unreadable`; `detail` is the recorded reason or null.
 */
export async function readAclReceipt(path) {
  let raw;
  try {
    raw = await readFile(aclReceiptPath(path), "utf8");
  } catch (error) {
    return { status: error?.code === "ENOENT" ? "receipt_missing" : "receipt_unreadable", detail: null };
  }
  let receipt;
  try { receipt = JSON.parse(raw); } catch { return { status: "receipt_unreadable", detail: null }; }
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)
    || typeof receipt.attempted !== "boolean" || typeof receipt.applied !== "boolean") {
    return { status: "receipt_unreadable", detail: null };
  }
  const detail = typeof receipt.detail === "string" ? receipt.detail : null;
  if (!receipt.attempted) return { status: "not_attempted", detail };
  return { status: receipt.applied ? "applied" : "failed", detail };
}
