import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncCopyOnlyMirror } from "./copy_only_mirror.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "voice-copy-only-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  const legacy = join(destination, "legacy_workspace_capture");
  const state = join(root, "state");
  const checkpoint = join(state, "checkpoints", "voice.json");
  const receipts = join(state, "receipts", "voice");
  await mkdir(join(source, "sessions"), { recursive: true });
  return { root, source, destination, legacy, state, checkpoint, receipts };
}

function options(f, extra = {}) {
  return {
    sourceRoot: f.source,
    destinationRoot: f.destination,
    legacyRoot: f.legacy,
    stateRoot: f.state,
    checkpointPath: f.checkpoint,
    receiptRoot: f.receipts,
    sourceOwnerRef: "voice_capture_onedrive",
    lanes: ["sessions"],
    now: () => "2026-07-17T00:00:00.000Z",
    ...extra,
  };
}

test("existing verified tree seeds checkpoint without a second payload copy", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.source, "sessions", "one.txt"), "voice-one");
    await mkdir(join(f.legacy, "sessions"), { recursive: true });
    await writeFile(join(f.legacy, "sessions", "one.txt"), "voice-one");
    const result = await syncCopyOnlyMirror(options(f));
    assert.equal(result.seeded_legacy, 1);
    assert.equal(result.copied_new, 0);
    assert.equal(result.receipts_written, 1);
    const checkpoint = JSON.parse(await readFile(f.checkpoint, "utf8"));
    assert.equal(checkpoint.files["sessions/one.txt"].custody_kind, "legacy_verified");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("new source is copied once and rerun is idempotent", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.source, "sessions", "new.txt"), "voice-new");
    const first = await syncCopyOnlyMirror(options(f));
    const second = await syncCopyOnlyMirror(options(f));
    assert.equal(first.copied_new, 1);
    assert.equal(second.copied_new, 0);
    assert.equal(second.unchanged, 1);
    assert.equal(await readFile(join(f.destination, "live_workspace_capture", "sessions", "new.txt"), "utf8"), "voice-new");
    assert.equal((await readdir(f.receipts)).length, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("changed source keeps original live copy and creates immutable version", async () => {
  const f = await fixture();
  try {
    const sourceFile = join(f.source, "sessions", "change.txt");
    await writeFile(sourceFile, "version-one");
    await syncCopyOnlyMirror(options(f));
    await writeFile(sourceFile, "version-two");
    const result = await syncCopyOnlyMirror(options(f));
    assert.equal(result.copied_version, 1);
    assert.equal(await readFile(join(f.destination, "live_workspace_capture", "sessions", "change.txt"), "utf8"), "version-one");
    const versionFiles = await readdir(join(f.destination, "versions", "sessions"));
    assert.equal(versionFiles.length, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("missing source never deletes retained custody", async () => {
  const f = await fixture();
  try {
    const sourceFile = join(f.source, "sessions", "keep.txt");
    await writeFile(sourceFile, "keep-me");
    await syncCopyOnlyMirror(options(f));
    await rm(sourceFile);
    const result = await syncCopyOnlyMirror(options(f));
    assert.equal(result.source_missing_since_checkpoint, 1);
    assert.equal(await readFile(join(f.destination, "live_workspace_capture", "sessions", "keep.txt"), "utf8"), "keep-me");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("missing source still requires intact retained custody", async () => {
  const f = await fixture();
  try {
    const sourceFile = join(f.source, "sessions", "missing-custody.txt");
    const liveFile = join(f.destination, "live_workspace_capture", "sessions", "missing-custody.txt");
    await writeFile(sourceFile, "retained");
    await syncCopyOnlyMirror(options(f));
    await rm(sourceFile);
    await writeFile(liveFile, "corrupt");
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "checkpoint_custody_mismatch" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("mismatched legacy seed and unsafe state path fail closed", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.source, "sessions", "bad.txt"), "source");
    await mkdir(join(f.legacy, "sessions"), { recursive: true });
    await writeFile(join(f.legacy, "sessions", "bad.txt"), "different");
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "legacy_seed_mismatch" });
    await assert.rejects(
      syncCopyOnlyMirror(options(f, { checkpointPath: join(f.root, "outside.json") })),
      { code: "state_path_escape" },
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("checkpoint revalidates retained payload and existing receipt", async () => {
  const f = await fixture();
  try {
    const sourceFile = join(f.source, "sessions", "custody.txt");
    await writeFile(sourceFile, "custody");
    await syncCopyOnlyMirror(options(f));
    const receiptName = (await readdir(f.receipts))[0];
    const receiptPath = join(f.receipts, receiptName);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    await writeFile(receiptPath, JSON.stringify({ ...receipt, unexpected: true }));
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "existing_receipt_mismatch" });

    receipt.size += 1;
    await writeFile(receiptPath, JSON.stringify(receipt));
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "existing_receipt_mismatch" });

    await writeFile(receiptPath, JSON.stringify({ ...receipt, size: receipt.size - 1 }));
    await rm(join(f.destination, "live_workspace_capture", "sessions", "custody.txt"));
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "checkpoint_custody_missing" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("changed source still requires intact previous custody before versioning", async () => {
  const f = await fixture();
  try {
    const sourceFile = join(f.source, "sessions", "prior.txt");
    const liveFile = join(f.destination, "live_workspace_capture", "sessions", "prior.txt");
    await writeFile(sourceFile, "version-one");
    await syncCopyOnlyMirror(options(f));
    await writeFile(sourceFile, "version-two");
    await rm(liveFile);
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "checkpoint_custody_missing" });

    await writeFile(liveFile, "corrupt");
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "checkpoint_custody_mismatch" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("later versions continue to verify every retained custody generation", async () => {
  const f = await fixture();
  try {
    const sourceFile = join(f.source, "sessions", "history.txt");
    const firstCustody = join(f.destination, "live_workspace_capture", "sessions", "history.txt");
    await writeFile(sourceFile, "version-one");
    await syncCopyOnlyMirror(options(f));
    await writeFile(sourceFile, "version-two");
    await syncCopyOnlyMirror(options(f));
    const checkpoint = JSON.parse(await readFile(f.checkpoint, "utf8"));
    assert.equal(checkpoint.files["sessions/history.txt"].custody_history.length, 1);

    await writeFile(firstCustody, "corrupt-old-generation");
    await writeFile(sourceFile, "version-three");
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "checkpoint_custody_mismatch" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("checkpoint identity is bound to source owner and key", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.source, "sessions", "identity.txt"), "identity");
    await syncCopyOnlyMirror(options(f));
    const checkpoint = JSON.parse(await readFile(f.checkpoint, "utf8"));
    checkpoint.files["sessions/identity.txt"].source_owner_ref = "different_owner";
    await writeFile(f.checkpoint, JSON.stringify(checkpoint));
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "checkpoint_identity_mismatch" });
    assert.equal((await readdir(f.receipts)).length, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("partial failure adopts an exact payload and receipt on restart", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.source, "sessions", "a.txt"), "a");
    await writeFile(join(f.source, "sessions", "b.txt"), "b");
    await mkdir(join(f.legacy, "sessions"), { recursive: true });
    await writeFile(join(f.legacy, "sessions", "b.txt"), "mismatch");
    await assert.rejects(
      syncCopyOnlyMirror(options(f, { now: () => "2026-07-17T00:00:00.000Z" })),
      { code: "legacy_seed_mismatch" },
    );
    assert.equal((await readdir(f.receipts)).length, 1);
    await rm(join(f.legacy, "sessions", "b.txt"));
    const result = await syncCopyOnlyMirror(options(f, { now: () => "2026-07-17T01:00:00.000Z" }));
    assert.equal(result.copied_new, 1);
    assert.equal((await readdir(f.receipts)).length, 2);
    const checkpoint = JSON.parse(await readFile(f.checkpoint, "utf8"));
    assert.deepEqual(Object.keys(checkpoint.files).sort(), ["sessions/a.txt", "sessions/b.txt"]);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("preexisting corrupt immutable version is rejected", async () => {
  const f = await fixture();
  try {
    const sourceFile = join(f.source, "sessions", "version.txt");
    await writeFile(sourceFile, "version-one");
    await syncCopyOnlyMirror(options(f));
    await writeFile(sourceFile, "version-two");
    const digest = createHash("sha256").update("version-two").digest("hex");
    const versionPath = join(f.destination, "versions", "sessions", `version.txt.${digest}`);
    await mkdir(join(f.destination, "versions", "sessions"), { recursive: true });
    await writeFile(versionPath, "corrupt");
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "existing_version_mismatch" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("copy limit does not mark unvisited present sources missing", async () => {
  const f = await fixture();
  try {
    const a = join(f.source, "sessions", "a.txt");
    const b = join(f.source, "sessions", "b.txt");
    await writeFile(a, "a-one");
    await writeFile(b, "b-one");
    await syncCopyOnlyMirror(options(f));
    await writeFile(a, "a-two");
    await writeFile(b, "b-two");
    const result = await syncCopyOnlyMirror(options(f, { maxNewFiles: 1 }));
    const checkpoint = JSON.parse(await readFile(f.checkpoint, "utf8"));
    assert.equal(result.limit_reached, true);
    assert.equal(result.source_missing_since_checkpoint, 0);
    assert.equal(checkpoint.files["sessions/a.txt"].source_present, true);
    assert.equal(checkpoint.files["sessions/b.txt"].source_present, true);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("source lane and destination child links fail closed", async () => {
  const f = await fixture();
  try {
    const outsideSource = join(f.root, "outside-source");
    await mkdir(outsideSource);
    await writeFile(join(outsideSource, "escape.txt"), "escape");
    await rm(join(f.source, "sessions"), { recursive: true });
    await symlink(outsideSource, join(f.source, "sessions"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "unsafe_source_lane" });

    await rm(join(f.source, "sessions"), { recursive: true, force: true });
    await mkdir(join(f.source, "sessions"));
    const nestedOutside = join(f.root, "nested-outside");
    await mkdir(nestedOutside);
    await writeFile(join(nestedOutside, "nested.txt"), "nested");
    const nestedLink = join(f.source, "sessions", "nested");
    await symlink(nestedOutside, nestedLink, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "unsafe_source_link" });
    await rm(nestedLink, { recursive: true, force: true });
    await writeFile(join(f.source, "sessions", "escape.txt"), "source");
    const outsideDestination = join(f.root, "outside-destination");
    await mkdir(outsideDestination);
    await mkdir(join(f.destination, "live_workspace_capture"), { recursive: true });
    await symlink(
      outsideDestination,
      join(f.destination, "live_workspace_capture", "sessions"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(syncCopyOnlyMirror(options(f)), { code: "unsafe_directory_chain" });
    assert.deepEqual(await readdir(outsideDestination), []);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("missing destination beneath a link is rejected before outside creation", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.source, "sessions", "outside.txt"), "source");
    const outside = join(f.root, "outside-root");
    await mkdir(outside);
    const linkedParent = join(f.root, "linked-parent");
    await symlink(outside, linkedParent, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      syncCopyOnlyMirror(options(f, { destinationRoot: join(linkedParent, "destination") })),
      { code: "unsafe_directory" },
    );
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
