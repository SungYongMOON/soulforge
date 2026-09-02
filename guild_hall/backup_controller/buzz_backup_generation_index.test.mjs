import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BUZZ_BACKUP_INDEX_GAPS,
  BUZZ_BACKUP_INDEX_SCHEMA,
  BUZZ_RESTORE_OBSERVATION_SCHEMA,
  BuzzBackupIndexError,
  buildBackupGenerationPointer,
  buildBuzzBackupIndex,
  canonicalDigest,
  generationRefFor,
  parseBuzzBackupReceipts,
  runBuzzBackupGenerationIndex,
  stampFor,
} from "./buzz_backup_generation_index.mjs";
import { parseBuzzBackupIndexArguments } from "./buzz_backup_generation_index_cli.mjs";
import { validateLaneRecord } from "../path_registry/src/source_lane_index.mjs";

const STAMP = "20260903T001500Z";

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// A synthetic stand-in for the Buzz controller's own backup tree. Nothing here
// touches a real relay; the test never runs anything that could.
async function createControllerFixture({
  withReceipts = true,
  withRestoreTest = true,
  streams = ["postgres", "redis", "minio", "git"],
  extraFiles = {},
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-buzz-backup-"));
  const buzzRoot = path.join(root, "buzz");
  const dataRoot = path.join(root, "data");
  await mkdir(dataRoot, { recursive: true });

  const contents = {};
  for (const stream of streams) {
    const streamRoot = path.join(buzzRoot, "backup", stream);
    await mkdir(streamRoot, { recursive: true });
    const body = `synthetic-${stream}-generation-1\n`;
    await writeFile(path.join(streamRoot, `${stream}-20260902.dump`), body, "utf8");
    contents[stream] = sha256Hex(body);
  }
  for (const [relative, body] of Object.entries(extraFiles)) {
    const target = path.join(buzzRoot, "backup", relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, "utf8");
  }

  if (withReceipts) {
    const lines = [
      JSON.stringify({
        backup: "2026-09-02T03:30:00.000Z",
        state: "ok",
        pg_digest: (contents.postgres ?? "0".repeat(16)).slice(0, 16),
        pg_bytes: 32,
        redis_digest: (contents.redis ?? "0".repeat(16)).slice(0, 16),
        minio_digest: (contents.minio ?? "0".repeat(16)).slice(0, 16),
        git_digest: (contents.git ?? "0".repeat(16)).slice(0, 16),
      }),
    ];
    if (withRestoreTest) {
      lines.push(JSON.stringify({ restore_test: "2026-08-30T04:00:00.000Z", source: "postgres", state: "ok" }));
    }
    lines.push("");
    const logRoot = path.join(buzzRoot, "logs", "backup");
    await mkdir(logRoot, { recursive: true });
    await writeFile(path.join(logRoot, "receipts.jsonl"), lines.join("\n"), "utf8");
  } else {
    await mkdir(buzzRoot, { recursive: true });
  }
  return { root, buzzRoot, dataRoot, contents };
}

test("the index names every stream file, verifies it against the controller receipt, and copies nothing", async () => {
  const fixture = await createControllerFixture();
  const { index } = await buildBuzzBackupIndex({
    buzz_root: fixture.buzzRoot,
    stamp: STAMP,
    now: () => new Date("2026-09-03T00:15:00.000Z"),
  });

  assert.equal(index.schema_version, BUZZ_BACKUP_INDEX_SCHEMA);
  // An index is not a backup, and the record has to say so itself.
  assert.equal(index.claim_ceiling, "index_only");
  assert.equal(index.bytes_duplicated, 0);
  assert.equal(index.generation_ref, generationRefFor(STAMP));
  assert.equal(index.file_count, 4);
  assert.equal(index.verified_file_count, 4);
  assert.equal(index.streams.length, 4);
  assert.deepEqual(index.streams.map((stream) => stream.stream), ["postgres", "redis", "minio", "git"]);
  for (const stream of index.streams) {
    assert.equal(stream.present, true);
    assert.equal(stream.files.length, 1);
    assert.equal(stream.files[0].digest_verified, true);
    assert.ok(stream.files[0].sha256.startsWith("sha256:"));
    assert.ok(stream.files[0].sha256.slice(7).startsWith(stream.files[0].receipt_digest_prefix));
  }
  assert.equal(index.controller.backup_receipts_observed, 1);
  assert.equal(index.controller.restore_test_receipts_observed, 1);
  assert.equal(index.controller.latest_backup_at, "2026-09-02T03:30:00.000Z");
  // Retention is a real limit on what any index can see, and every index says so.
  assert.deepEqual(index.coverage_gaps, ["retention_window_only"]);
  for (const gap of index.coverage_gaps) assert.ok(BUZZ_BACKUP_INDEX_GAPS.includes(gap));

  // The index carries no backup bytes: no file body appears anywhere in it.
  const serialized = JSON.stringify(index);
  assert.ok(!serialized.includes("synthetic-postgres-generation-1"));

  await rm(fixture.root, { recursive: true, force: true });
});

test("a missing stream, a missing receipts log and an unreceipted file are declared, not hidden", async () => {
  const fixture = await createControllerFixture({ streams: ["postgres", "redis"], withReceipts: false });
  const { index } = await buildBuzzBackupIndex({
    buzz_root: fixture.buzzRoot, stamp: STAMP, now: () => new Date("2026-09-03T00:15:00.000Z"),
  });
  assert.ok(index.coverage_gaps.includes("stream_missing"));
  assert.ok(index.coverage_gaps.includes("receipts_log_missing"));
  assert.ok(index.coverage_gaps.includes("file_digest_unreceipted"));
  assert.ok(index.coverage_gaps.includes("restore_test_never_observed"));
  assert.equal(index.verified_file_count, 0);
  assert.equal(index.streams.filter((stream) => stream.present === false).length, 2);
  for (const gap of index.coverage_gaps) assert.ok(BUZZ_BACKUP_INDEX_GAPS.includes(gap));
  await rm(fixture.root, { recursive: true, force: true });
});

test("a credential-shaped backup file is named and never opened", async () => {
  const fixture = await createControllerFixture({
    extraFiles: { "postgres/.env": "DO_NOT_READ\n", "git/deploy.key": "DO_NOT_READ\n" },
  });
  const { index } = await buildBuzzBackupIndex({
    buzz_root: fixture.buzzRoot, stamp: STAMP, now: () => new Date("2026-09-03T00:15:00.000Z"),
  });
  assert.ok(index.coverage_gaps.includes("secret_named_file_skipped"));
  const postgres = index.streams.find((stream) => stream.stream === "postgres");
  const git = index.streams.find((stream) => stream.stream === "git");
  assert.deepEqual(postgres.skipped_secret_names, [".env"]);
  assert.deepEqual(git.skipped_secret_names, ["deploy.key"]);
  // Skipped means skipped: no digest, no size, no entry in the file list.
  assert.equal(postgres.files.some((file) => file.name === ".env"), false);
  assert.ok(!JSON.stringify(index).includes("DO_NOT_READ"));
  await rm(fixture.root, { recursive: true, force: true });
});

test("the backup pointer is a real lane record and is withheld without a collection generation", async () => {
  const fixture = await createControllerFixture();
  const { index } = await buildBuzzBackupIndex({
    buzz_root: fixture.buzzRoot, stamp: STAMP, now: () => new Date("2026-09-03T00:15:00.000Z"),
  });

  const pointer = buildBackupGenerationPointer({ index, generation_seq: 3 });
  assert.deepEqual({ ...validateLaneRecord(pointer) }, {
    record_kind: "backup_generation_pointer",
    source_ref: "source.buzz",
    generation_seq: 3,
    backup_generation_ref: generationRefFor(STAMP),
    content_digest: index.content_digest,
    backed_up_at: "2026-09-02T03:30:00.000Z",
  });

  for (const bad of [null, 0, -1, 1.5]) {
    assert.throws(
      () => buildBackupGenerationPointer({ index, generation_seq: bad }),
      (error) => error instanceof BuzzBackupIndexError && error.code === "generation_seq_required",
    );
  }

  await rm(fixture.root, { recursive: true, force: true });
});

test("plan writes nothing, apply writes create-only, and a repeated stamp is refused", async () => {
  const fixture = await createControllerFixture();
  const options = {
    buzz_root: fixture.buzzRoot,
    data_root: fixture.dataRoot,
    stamp: STAMP,
    now: () => new Date("2026-09-03T00:15:00.000Z"),
  };

  const planned = await runBuzzBackupGenerationIndex(options);
  assert.equal(planned.mode, "plan");
  assert.equal(planned.written, false);
  assert.equal(planned.bytes_duplicated, 0);
  assert.equal(planned.backup_generation_pointer, null);
  assert.deepEqual(planned.withheld, ["backup_generation_pointer_withheld_no_collection_generation"]);
  assert.equal(planned.would_write.length, 2);
  await assert.rejects(readFile(planned.would_write[0], "utf8"));

  const applied = await runBuzzBackupGenerationIndex({ ...options, apply: true, generation_seq: 3 });
  assert.equal(applied.mode, "apply");
  assert.deepEqual(applied.withheld, []);
  assert.equal(applied.written_paths.length, 3);

  const indexPath = path.join(
    fixture.dataRoot, "60_BACKUP_GENERATIONS", "buzz", `buzz-controller-${STAMP}`, "index.json",
  );
  const pointerPath = path.join(
    fixture.dataRoot, "10_SOURCE_CAPTURE_CATALOG", "buzz", "backup-generation-refs", `${STAMP}.json`,
  );
  const restorePath = path.join(
    fixture.dataRoot, "10_SOURCE_CAPTURE_CATALOG", "buzz", "restore-tests", `${STAMP}.json`,
  );
  const written = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(written.claim_ceiling, "index_only");
  assert.deepEqual(validateLaneRecord(JSON.parse(await readFile(pointerPath, "utf8"))).source_ref, "source.buzz");

  const restore = JSON.parse(await readFile(restorePath, "utf8"));
  assert.equal(restore.schema_version, BUZZ_RESTORE_OBSERVATION_SCHEMA);
  assert.equal(restore.claim_ceiling, "observed");
  // The whole point: Soulforge has not restored anything, and the record says
  // exactly that rather than emitting a restore_test lane record.
  assert.equal(restore.soulforge_isolated_restore_performed, false);
  assert.equal(restore.readback_digest, null);
  assert.equal(restore.human_acceptance_state, "pending");
  assert.deepEqual(restore.blocking_reasons, [
    "no_isolated_restore_root", "no_readback_digest", "no_human_acceptance",
  ]);
  assert.equal(restore.latest_controller_restore_test_at, "2026-08-30T04:00:00.000Z");
  assert.throws(() => validateLaneRecord(restore), /record_kind_invalid|record_invalid/u);

  // Create-only: the same stamp cannot be re-published.
  await assert.rejects(
    runBuzzBackupGenerationIndex({ ...options, apply: true, generation_seq: 3 }),
    (error) => error instanceof BuzzBackupIndexError && error.code === "output_exists",
  );

  await rm(fixture.root, { recursive: true, force: true });
});

test("the controller root is never written to and overlapping roots are refused", async () => {
  const fixture = await createControllerFixture();
  const before = JSON.parse(JSON.stringify(
    (await buildBuzzBackupIndex({
      buzz_root: fixture.buzzRoot, stamp: STAMP, now: () => new Date("2026-09-03T00:15:00.000Z"),
    })).index,
  ));

  await runBuzzBackupGenerationIndex({
    buzz_root: fixture.buzzRoot,
    data_root: fixture.dataRoot,
    stamp: STAMP,
    apply: true,
    generation_seq: 1,
    now: () => new Date("2026-09-03T00:15:00.000Z"),
  });

  const after = (await buildBuzzBackupIndex({
    buzz_root: fixture.buzzRoot, stamp: STAMP, now: () => new Date("2026-09-03T00:15:00.000Z"),
  })).index;
  assert.deepEqual(after.streams, before.streams);
  assert.equal(after.content_digest, before.content_digest);

  await assert.rejects(
    runBuzzBackupGenerationIndex({
      buzz_root: fixture.buzzRoot,
      data_root: path.join(fixture.buzzRoot, "spine"),
      stamp: STAMP,
    }),
    (error) => error instanceof BuzzBackupIndexError && error.code === "roots_overlap",
  );

  await rm(fixture.root, { recursive: true, force: true });
});

test("receipt lines are classified, not guessed at", () => {
  const parsed = parseBuzzBackupReceipts([
    JSON.stringify({ backup: "2026-09-02T03:30:00.000Z", state: "ok", pg_digest: "abcd" }),
    JSON.stringify({ restore_test: "2026-08-30T04:00:00.000Z", source: "postgres", state: "ok" }),
    JSON.stringify({ something_else: 1 }),
    "not json at all",
    "",
    "   ",
  ].join("\n"));
  assert.equal(parsed.backups.length, 1);
  assert.equal(parsed.restore_tests.length, 1);
  assert.equal(parsed.unparsable_lines, 2);
});

test("stamps, digests and CLI arguments are exact", () => {
  assert.equal(stampFor(new Date("2026-09-03T00:15:00.000Z")), "20260903T001500Z");
  assert.equal(canonicalDigest({ b: 1, a: 2 }), canonicalDigest({ a: 2, b: 1 }));
  assert.notEqual(canonicalDigest({ a: 1 }), canonicalDigest({ a: 2 }));

  const parsed = parseBuzzBackupIndexArguments([
    "--buzz-root", path.join(os.tmpdir(), "buzz"),
    "--data-root", path.join(os.tmpdir(), "data"),
    "--generation-seq", "7",
    "--apply",
  ]);
  assert.equal(parsed.generation_seq, 7);
  assert.equal(parsed.apply, true);

  // `--plan` is the default and is accepted explicitly for readability.
  assert.equal(parseBuzzBackupIndexArguments([
    "--buzz-root", path.join(os.tmpdir(), "buzz"),
    "--data-root", path.join(os.tmpdir(), "data"),
    "--plan",
  ]).apply, false);

  for (const argv of [
    [],
    ["--buzz-root", path.join(os.tmpdir(), "buzz")],
    ["--buzz-root", path.join(os.tmpdir(), "b"), "--data-root", path.join(os.tmpdir(), "d"), "--generation-seq", "0"],
    ["--buzz-root", path.join(os.tmpdir(), "b"), "--data-root", path.join(os.tmpdir(), "d"), "--unknown", "x"],
  ]) {
    assert.throws(() => parseBuzzBackupIndexArguments(argv), (error) => typeof error?.code === "string");
  }

  const stampRejected = buildBuzzBackupIndex({ buzz_root: path.join(os.tmpdir(), "buzz"), stamp: "nope" });
  return assert.rejects(stampRejected, (error) => error instanceof BuzzBackupIndexError
    && error.code === "stamp_invalid");
});
