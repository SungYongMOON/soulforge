import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative } from "node:path";
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
