import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  buildImmutableLinearLb1BackupRunV2,
  collectFeatureOffLinearLb1V2Fixture,
  serializeBackupRunV2,
} from "./linear_lb1_v2.mjs";
import { makeCompleteLinearLb1V2Fixture } from "./linear_lb1_v2_fixture.mjs";
import {
  LinearLb1ProjectIndexBackfillError,
  backfillLinearLb1ProjectIndex,
} from "./linear_lb1_project_index_backfill.mjs";

function sha(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "linear-index-backfill-"));
  const source = join(root, "source", "run-001");
  const restore = join(root, "restore", "run-001");
  await mkdir(source, { recursive: true });
  await mkdir(restore, { recursive: true });
  const snapshot = makeCompleteLinearLb1V2Fixture();
  snapshot.projects.push({
    project_id: "synthetic-project-empty", name: "Empty Project",
    team_id: "synthetic-team-001", updated_at: "2026-08-20T08:00:00.000Z",
  });
  snapshot.issues[1].project_id = null;
  snapshot.issues[1].project_history = [];
  const collection = collectFeatureOffLinearLb1V2Fixture(snapshot);
  const run = buildImmutableLinearLb1BackupRunV2({ run_key: "run-001", collection });
  const bytes = serializeBackupRunV2(run);
  await writeFile(join(source, "run.json"), bytes);
  await writeFile(join(restore, "run.json"), bytes);
  const generationDigest = sha(bytes);
  await writeFile(join(source, "receipt.json"), JSON.stringify({
    generation_digest: generationDigest,
    manifest_sha256: run.manifest.manifest_sha256,
    exact_byte_readback: true,
    overwrite_allowed: false,
    prune_or_delete_allowed: false,
  }));
  return {
    root,
    source,
    restore,
    input: {
      source_run_path: join(source, "run.json"),
      source_generation_receipt_path: join(source, "receipt.json"),
      restore_run_path: join(restore, "run.json"),
      expected_generation_digest: generationDigest,
      expected_manifest_sha256: `sha256:${run.manifest.manifest_sha256}`,
    },
  };
}

test("backfill writes one exact project index and receipt to source and isolated restore", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const result = await backfillLinearLb1ProjectIndex(f.input);
  assert.equal(result.status, "PROJECT_INDEX_TECHNICAL_RESTORE_CANDIDATE");
  assert.equal(result.project_count, 2);
  assert.equal(result.classified_issue_count, 1);
  assert.equal(result.unassigned_issue_count, 1);
  assert.equal(result.human_acceptance, false);
  assert.equal(result.official_task_done, false);
  assert.deepEqual(result.write_states, {
    source_index: "created", restore_index: "created",
    source_receipt: "created", restore_receipt: "created",
  });
  assert.deepEqual(
    await readFile(join(f.source, "project-index.json")),
    await readFile(join(f.restore, "project-index.json")),
  );
});

test("exact replay is a no-op and never overwrites the generation", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const original = await readFile(f.input.source_run_path);
  await backfillLinearLb1ProjectIndex(f.input);
  const replay = await backfillLinearLb1ProjectIndex(f.input);
  assert.deepEqual(replay.write_states, {
    source_index: "replayed", restore_index: "replayed",
    source_receipt: "replayed", restore_receipt: "replayed",
  });
  assert.deepEqual(await readFile(f.input.source_run_path), original);
});

test("generation, restore, receipt, and existing-index drift fail closed", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  await assert.rejects(
    () => backfillLinearLb1ProjectIndex({ ...f.input, expected_generation_digest: `sha256:${"0".repeat(64)}` }),
    (error) => error instanceof LinearLb1ProjectIndexBackfillError
      && error.code === "linear_lb1_project_index_backfill_generation_mismatch",
  );
  await writeFile(f.input.restore_run_path, "tampered");
  await assert.rejects(
    () => backfillLinearLb1ProjectIndex(f.input),
    (error) => error instanceof LinearLb1ProjectIndexBackfillError
      && error.code === "linear_lb1_project_index_backfill_generation_mismatch",
  );
  await writeFile(f.input.restore_run_path, await readFile(f.input.source_run_path));
  const receiptPath = f.input.source_generation_receipt_path;
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  receipt.manifest_sha256 = "0".repeat(64);
  await writeFile(receiptPath, JSON.stringify(receipt));
  await assert.rejects(
    () => backfillLinearLb1ProjectIndex({
      ...f.input, expected_manifest_sha256: `sha256:${"0".repeat(64)}`,
    }),
    (error) => error instanceof LinearLb1ProjectIndexBackfillError
      && error.code === "linear_lb1_project_index_backfill_generation_invalid",
  );
  receipt.manifest_sha256 = f.input.expected_manifest_sha256.slice("sha256:".length);
  await writeFile(receiptPath, JSON.stringify(receipt));
  await writeFile(join(f.source, "project-index.json"), "conflict");
  await assert.rejects(
    () => backfillLinearLb1ProjectIndex(f.input),
    (error) => error instanceof LinearLb1ProjectIndexBackfillError
      && error.code === "linear_lb1_project_index_backfill_conflict",
  );
});
