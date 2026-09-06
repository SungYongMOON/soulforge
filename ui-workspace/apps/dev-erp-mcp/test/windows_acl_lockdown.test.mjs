import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  ACL_RECEIPT_SUFFIX,
  aclReceiptPath,
  readAclReceipt,
  restrictToCurrentUser,
  writeAclReceipt,
} from "../src/windows_acl_lockdown.mjs";

const execFileAsync = promisify(execFile);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("lockdown is not attempted off Windows and reports missing prerequisites without throwing", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-acl-lockdown-"));
  const target = resolve(root, "material.bin");
  try {
    await writeFile(target, "synthetic\n", { flag: "wx", mode: 0o600 });
    assert.deepEqual(
      await restrictToCurrentUser(target, { platform: "linux" }),
      { attempted: false, applied: false, detail: "NOT_WINDOWS" },
    );
    assert.deepEqual(
      await restrictToCurrentUser(target, { platform: "win32", env: {} }),
      { attempted: true, applied: false, detail: "USERNAME_UNSET" },
    );
    assert.deepEqual(
      await restrictToCurrentUser(target, { platform: "win32", env: { USERNAME: "synthetic" } }),
      { attempted: true, applied: false, detail: "SYSTEMROOT_UNSET" },
    );
    // A system root without icacls.exe is a spawn failure, reported as such.
    const absent = await restrictToCurrentUser(target, {
      platform: "win32",
      env: { USERNAME: "synthetic", SystemRoot: resolve(root, "no-such-system-root") },
    });
    assert.deepEqual(absent, { attempted: true, applied: false, detail: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("on Windows the lockdown leaves only the current user on the file", async (t) => {
  if (process.platform !== "win32") return t.skip("Windows ACL semantics only");
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-acl-lockdown-win-"));
  const target = resolve(root, "material.bin");
  try {
    await writeFile(target, "synthetic\n", { flag: "wx", mode: 0o600 });
    assert.deepEqual(await restrictToCurrentUser(target), { attempted: true, applied: true, detail: "ICACLS_OK" });
    const { stdout } = await execFileAsync(
      join(process.env.SystemRoot, "System32", "icacls.exe"),
      [target],
      { encoding: "utf8", windowsHide: true },
    );
    const aces = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => /:\(/.test(line));
    assert.equal(aces.length, 1, stdout);
    assert.match(aces[0], new RegExp(`(^|\\\\)${escapeRegExp(process.env.USERNAME)}:\\(F\\)$`, "i"));
    assert.equal(stdout.includes("(I)"), false, stdout);
    assert.equal(await readFile(target, "utf8"), "synthetic\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("receipt carries the schema and outcome only and summarizes for a doctor surface", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-acl-receipt-"));
  const target = resolve(root, "material.bin");
  try {
    await writeFile(target, "synthetic\n", { flag: "wx", mode: 0o600 });
    const receiptPath = await writeAclReceipt(target, "soulforge.test.acl.v0", {
      attempted: true, applied: false, detail: "icacls_exit_5",
    });
    assert.equal(receiptPath, aclReceiptPath(target));
    assert.equal(receiptPath.endsWith(ACL_RECEIPT_SUFFIX), true);
    const parsed = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.deepEqual(parsed, { schema: "soulforge.test.acl.v0", attempted: true, applied: false, detail: "icacls_exit_5" });
    assert.deepEqual(await readAclReceipt(target), { status: "failed", detail: "icacls_exit_5" });

    await writeAclReceipt(target, "soulforge.test.acl.v0", { attempted: true, applied: true, detail: "ICACLS_OK" });
    assert.deepEqual(await readAclReceipt(target), { status: "applied", detail: "ICACLS_OK" });
    await writeAclReceipt(target, "soulforge.test.acl.v0", { attempted: false, applied: false, detail: "NOT_WINDOWS" });
    assert.deepEqual(await readAclReceipt(target), { status: "not_attempted", detail: "NOT_WINDOWS" });

    assert.deepEqual(await readAclReceipt(resolve(root, "absent.bin")), { status: "receipt_missing", detail: null });
    await writeFile(receiptPath, "{not json\n", "utf8");
    assert.deepEqual(await readAclReceipt(target), { status: "receipt_unreadable", detail: null });
    await writeFile(receiptPath, JSON.stringify({ schema: "x", attempted: "yes" }), "utf8");
    assert.deepEqual(await readAclReceipt(target), { status: "receipt_unreadable", detail: null });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
