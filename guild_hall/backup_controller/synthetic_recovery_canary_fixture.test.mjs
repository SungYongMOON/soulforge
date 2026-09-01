import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, relative, resolve, sep } from "node:path";
import test from "node:test";

import {
  SyntheticRecoveryCanaryFixtureError,
  createSyntheticRecoveryCanaryFixture,
  disposeSyntheticRecoveryCanaryFixture,
} from "./synthetic_recovery_canary_fixture.mjs";

test("synthetic recovery fixture is deterministic and materialized only below temp", async (t) => {
  const first = await createSyntheticRecoveryCanaryFixture();
  const second = await createSyntheticRecoveryCanaryFixture();
  t.after(async () => {
    await disposeSyntheticRecoveryCanaryFixture(first);
    await disposeSyntheticRecoveryCanaryFixture(second);
  });

  for (const fixture of [first, second]) {
    const fromTemp = relative(tmpdir(), fixture.workspace_root);
    assert.equal(fromTemp === "" || fromTemp.startsWith(".."), false);
    assert.equal(fixture.item_count, 3);
    assert.equal(fixture.byte_length > 0, true);
    assert.equal(fixture.item_manifest.items.every((item) => item.content_digest.startsWith("sha256:")), true);
  }
  assert.equal(first.content_digest, second.content_digest);
  assert.deepEqual(first.item_manifest, second.item_manifest);

  const sourceItem = first.item_manifest.items[0];
  const firstBytes = await readFile(`${first.source_root}/${sourceItem.relative_path}`);
  const secondBytes = await readFile(`${second.source_root}/${sourceItem.relative_path}`);
  assert.deepEqual(firstBytes, secondBytes);
});

test("synthetic recovery fixture refuses a non-temp workspace", async () => {
  await assert.rejects(
    () => createSyntheticRecoveryCanaryFixture({ workspace_root: process.cwd() }),
    (error) => error instanceof SyntheticRecoveryCanaryFixtureError
      && error.code === "synthetic_recovery_canary_fixture_temp_root_required",
  );
});

test("the temp-root guard holds across filesystem roots, not only across parent hops", { skip: process.platform !== "win32" ? "win32-only: relative() only returns an absolute path across roots" : false }, async () => {
  // relative() from the temp root to a path on ANOTHER drive returns that
  // absolute path — no "..", so a hop-only containment check reads a whole
  // other drive as inside temp. The roots are assembled from parts here: a
  // literal drive-rooted path in source bytes is a tracked path-policy
  // violation.
  const tempDriveLetter = parse(resolve(tmpdir())).root.slice(0, 1).toUpperCase();
  const otherDriveLetter = tempDriveLetter === "C" ? "D" : "C";
  const otherRoot = `${otherDriveLetter}:${sep}`;
  await assert.rejects(
    () => createSyntheticRecoveryCanaryFixture({ workspace_root: join(otherRoot, "soulforge-canary-cross-root-probe") }),
    (error) => error instanceof SyntheticRecoveryCanaryFixtureError
      && error.code === "synthetic_recovery_canary_fixture_temp_root_required",
  );
});
