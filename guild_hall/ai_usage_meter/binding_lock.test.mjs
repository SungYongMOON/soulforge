import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { withUsageBindingLock } from "./binding_store.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((accept) => { resolve = accept; });
  return { promise, resolve };
}

test("a stale lock holder cannot delete a replacement holder lock", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-bind-lock-"));
  const lockPath = path.join(state, "bindings.lock");
  const firstEntered = deferred();
  const releaseFirst = deferred();
  const first = withUsageBindingLock(state, async () => {
    firstEntered.resolve();
    await releaseFirst.promise;
  });
  await firstEntered.promise;

  const firstOwner = JSON.parse(await readFile(lockPath, "utf8"));
  await writeFile(lockPath, `${JSON.stringify({
    ...firstOwner,
    started_at: "2000-01-01T00:00:00.000Z",
  })}\n`, "utf8");

  const secondEntered = deferred();
  const releaseSecond = deferred();
  const second = withUsageBindingLock(state, async () => {
    secondEntered.resolve();
    await releaseSecond.promise;
  });
  await secondEntered.promise;
  const secondOwner = JSON.parse(await readFile(lockPath, "utf8"));
  assert.notEqual(secondOwner.token, firstOwner.token);

  releaseFirst.resolve();
  await first;
  const ownerAfterOldRelease = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(ownerAfterOldRelease.token, secondOwner.token);

  releaseSecond.resolve();
  await second;
  await assert.rejects(access(lockPath), { code: "ENOENT" });
});
