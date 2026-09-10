import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { symlinkSync } from "node:fs";
import { lstat, mkdtemp, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import {
  DeliveryContractError,
  acknowledgeDelivery,
  getDeliveryStatus,
  prepareDeliveryReceipt,
  validateDeliveryReceipt,
} from "./delivery_receipt.mjs";
import { writeRecordingLibraryEntry } from "./voice_capture.mjs";

const CLI_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "cli.mjs");
const DIRECTORY_LINK_TYPE = process.platform === "win32" ? "junction" : "dir";
const generatedSharedRoots = new Set();

after(async () => {
  await Promise.all([...generatedSharedRoots].map((value) => rm(value, { recursive: true, force: true })));
});

test("delivery receipt and acknowledgement prove exact bytes without payload or secret fields", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    const prepared = await prepareDeliveryReceipt({
      repoRoot,
      sessionDir: fixture.sessionDir,
      stage: "plaud_import_ready",
      producerNode: "producer_01",
      apply: true,
    });
    assert.equal(prepared.status, "ready");
    assert.equal(prepared.applied, true);
    assert.equal(prepared.receipt.files.every((row) => row.required === true), true);
    const receiptRaw = await readFile(path.join(repoRoot, prepared.receipt_ref), "utf8");
    assert.equal(receiptRaw.includes("synthetic transcript body"), false);
    assert.equal(/(?:token|password|secret|credential)/iu.test(receiptRaw), false);
    assert.deepEqual(Object.keys(prepared.receipt).sort(), [
      "created_at", "files", "producer_node", "receipt_id", "recording_id", "schema_version", "session_id", "stage", "status",
    ]);
    assert.match(prepared.receipt.created_at, /^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/u);

    const acknowledged = await acknowledgeDelivery({
      repoRoot,
      sessionId: fixture.sessionId,
      consumerNode: "consumer_01",
      apply: true,
    });
    assert.equal(acknowledged.status, "delivered");
    assert.match(acknowledged.acknowledgement.checked_at, /^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/u);
    assert.equal(acknowledged.acknowledgement.files.every((row) => row.status === "delivered"), true);
    assert.deepEqual(Object.keys(acknowledged.acknowledgement.files[0]).sort(), [
      "observed_sha256", "observed_size_bytes", "ref", "role", "status",
    ]);
    assert.equal(acknowledged.acknowledgement.files.every((row) => Number.isSafeInteger(row.observed_size_bytes)), true);
    assert.equal(acknowledged.acknowledgement.files.every((row) => /^[a-f0-9]{64}$/u.test(row.observed_sha256)), true);
    assert.equal((await getDeliveryStatus({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" })).status, "delivered");
    await assert.rejects(
      readFile(path.join(repoRoot, "guild_hall", "voice_capture", "delivery", "producer_receipts", `${fixture.sessionId}.json`), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("delivery acknowledgement distinguishes missing and same-size mismatch", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-mismatch-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    await prepareDeliveryReceipt({
      repoRoot,
      sessionDir: fixture.sessionDir,
      stage: "plaud_import_ready",
      producerNode: "producer_01",
      apply: true,
      now: "2026-07-10T23:59:00.000Z",
    });
    await unlink(fixture.audioPath);
    const missing = await acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01", apply: true, now: "2026-07-11T00:00:00.000Z" });
    assert.equal(missing.status, "missing");
    const missingAudio = missing.acknowledgement.files.find((row) => row.role === "source_audio");
    assert.equal(missingAudio.observed_size_bytes, null);
    assert.equal(missingAudio.observed_sha256, null);
    await writeFile(fixture.audioPath, "ZYXWV", "utf8");
    const mismatch = await acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01", apply: true, now: "2026-07-11T00:01:00.000Z" });
    assert.equal(mismatch.status, "mismatch");
    const mismatchedAudio = mismatch.acknowledgement.files.find((row) => row.role === "source_audio");
    assert.equal(mismatchedAudio.observed_size_bytes, 5);
    assert.match(mismatchedAudio.observed_sha256, /^[a-f0-9]{64}$/u);
    assert.notEqual(mismatch.acknowledgement.checked_at, missing.acknowledgement.checked_at);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("identical receipt and acknowledgement applications preserve mtimes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-idempotent-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    const first = await prepareDeliveryReceipt({ repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "producer_01", apply: true, now: "2026-07-11T00:00:00.000Z" });
    const receiptPath = path.join(repoRoot, first.receipt_ref);
    const receiptMtime = (await stat(receiptPath)).mtimeMs;
    await delay(25);
    const second = await prepareDeliveryReceipt({ repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "producer_01", apply: true, now: "2026-07-11T00:01:00.000Z" });
    assert.equal(second.changed, false);
    assert.equal(second.receipt.created_at, first.receipt.created_at);
    assert.equal((await stat(receiptPath)).mtimeMs, receiptMtime);

    const ackOne = await acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01", apply: true, now: "2026-07-11T00:02:00.000Z" });
    const ackPath = path.join(repoRoot, ackOne.acknowledgement_ref);
    const ackMtime = (await stat(ackPath)).mtimeMs;
    await delay(25);
    const ackTwo = await acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01", apply: true, now: "2026-07-11T00:03:00.000Z" });
    assert.equal(ackTwo.changed, false);
    assert.equal(ackTwo.acknowledgement.checked_at, ackOne.acknowledgement.checked_at);
    assert.equal((await stat(ackPath)).mtimeMs, ackMtime);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("a changed producer receipt makes the previous acknowledgement stale", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-stale-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    const first = await prepareDeliveryReceipt({ repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "producer_01", apply: true, now: "2026-07-11T00:00:00.000Z" });
    await acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01", apply: true });
    await writeFile(fixture.audioPath, "changed bytes", "utf8");
    const second = await prepareDeliveryReceipt({ repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "producer_01", apply: true, now: "2026-07-11T00:05:00.000Z" });
    assert.notEqual(second.receipt.receipt_id, first.receipt.receipt_id);
    assert.equal(second.receipt.created_at, "2026-07-11T00:05:00.000Z");
    assert.equal((await getDeliveryStatus({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" })).status, "stale");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("consumer node must differ from the producer node", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-node-separation-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    await prepareDeliveryReceipt({ repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "node_01", apply: true });
    await assert.rejects(
      acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "node_01", apply: true }),
      /consumer_node_must_differ_from_producer_node/u,
    );
    await assert.rejects(
      readFile(path.join(repoRoot, "_workspaces", "system", "voice_capture", "delivery", "consumer_acknowledgements", "node_01", `${fixture.sessionId}.json`), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("delivery status rejects a forged acknowledgement with omitted receipt files", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-forged-ack-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    await prepareDeliveryReceipt({ repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "producer_01", apply: true });
    const acknowledged = await acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01", apply: true });
    const ackPath = path.join(repoRoot, acknowledged.acknowledgement_ref);
    const forged = JSON.parse(await readFile(ackPath, "utf8"));
    forged.files.pop();
    await writeFile(ackPath, `${JSON.stringify(forged, null, 2)}\n`, "utf8");
    const status = await getDeliveryStatus({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" });
    assert.equal(status.status, "stale");
    assert.equal(status.ok, false);
    forged.checked_at = "2026-07-11T10:00:00+09:00";
    await writeFile(ackPath, `${JSON.stringify(forged, null, 2)}\n`, "utf8");
    await assert.rejects(
      getDeliveryStatus({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" }),
      /delivery_acknowledgement_checked_at_invalid/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("delivery status rejects status-only tampering when observed bytes still mismatch", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-forged-status-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    await prepareDeliveryReceipt({
      repoRoot,
      sessionDir: fixture.sessionDir,
      stage: "plaud_import_ready",
      producerNode: "producer_01",
      apply: true,
      now: "2026-07-11T10:00:00.000Z",
    });
    await writeFile(fixture.audioPath, "ZYXWV", "utf8");
    const acknowledged = await acknowledgeDelivery({
      repoRoot,
      sessionId: fixture.sessionId,
      consumerNode: "consumer_01",
      apply: true,
      now: "2026-07-11T10:01:00.000Z",
    });
    assert.equal(acknowledged.status, "mismatch");
    const ackPath = path.join(repoRoot, acknowledged.acknowledgement_ref);
    const forged = JSON.parse(await readFile(ackPath, "utf8"));
    forged.status = "delivered";
    forged.files.find((row) => row.role === "source_audio").status = "delivered";
    await writeFile(ackPath, `${JSON.stringify(forged, null, 2)}\n`, "utf8");
    const status = await getDeliveryStatus({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" });
    assert.equal(status.status, "stale");
    assert.equal(status.ok, false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("acknowledgement fails closed before write when consumer clock predates the receipt", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-clock-order-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    await prepareDeliveryReceipt({
      repoRoot,
      sessionDir: fixture.sessionDir,
      stage: "plaud_import_ready",
      producerNode: "producer_01",
      apply: true,
      now: "2099-07-11T10:00:00.000Z",
    });
    await assert.rejects(
      acknowledgeDelivery({
        repoRoot,
        sessionId: fixture.sessionId,
        consumerNode: "consumer_01",
        apply: true,
        now: "2099-07-11T09:59:59.000Z",
      }),
      /consumer_checked_at_predates_receipt_created_at/u,
    );
    const ackRoot = path.join(repoRoot, "_workspaces", "system", "voice_capture", "delivery", "consumer_acknowledgements");
    await assert.rejects(readFile(path.join(ackRoot, "consumer_01", `${fixture.sessionId}.json`), "utf8"), /ENOENT/u);
    await assert.rejects(readFile(path.join(ackRoot, "consumer_01", "latest.json"), "utf8"), /ENOENT/u);

    const cli = spawnSync(process.execPath, [
      CLI_PATH, "ack-delivery", "--repo-root", repoRoot, "--session-id", fixture.sessionId,
      "--consumer-node", "consumer_02", "--apply", "--json",
    ], { encoding: "utf8" });
    assert.equal(cli.status, 2);
    assert.match(cli.stderr, /consumer_checked_at_predates_receipt_created_at/u);
    await assert.rejects(readFile(path.join(ackRoot, "consumer_02", `${fixture.sessionId}.json`), "utf8"), /ENOENT/u);
    await assert.rejects(readFile(path.join(ackRoot, "consumer_02", "latest.json"), "utf8"), /ENOENT/u);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("delivery status keeps the stale guard for a forged earlier checked_at", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-forged-clock-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    await prepareDeliveryReceipt({
      repoRoot,
      sessionDir: fixture.sessionDir,
      stage: "plaud_import_ready",
      producerNode: "producer_01",
      apply: true,
      now: "2026-07-11T10:00:00.000Z",
    });
    const acknowledged = await acknowledgeDelivery({
      repoRoot,
      sessionId: fixture.sessionId,
      consumerNode: "consumer_01",
      apply: true,
      now: "2026-07-11T10:01:00.000Z",
    });
    const ackPath = path.join(repoRoot, acknowledged.acknowledgement_ref);
    const forged = JSON.parse(await readFile(ackPath, "utf8"));
    forged.checked_at = "2026-07-11T09:59:59.000Z";
    await writeFile(ackPath, `${JSON.stringify(forged, null, 2)}\n`, "utf8");
    const status = await getDeliveryStatus({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" });
    assert.equal(status.status, "stale");
    assert.equal(status.ok, false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("optional delivery file specs are rejected instead of being partially supported", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-required-only-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    await assert.rejects(
      prepareDeliveryReceipt({
        repoRoot,
        sessionDir: fixture.sessionDir,
        stage: "plaud_import_ready",
        producerNode: "producer_01",
        files: [{ role: "source_audio", ref: "_workspaces/system/voice_capture/sessions/2026-07-11/fixture_session/audio/source.ogg", required: false }],
      }),
      /delivery_file_optional_not_supported/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("100 concurrent identical receipt and acknowledgement writes settle to valid idempotent contracts", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-concurrent-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    const prepareOptions = {
      repoRoot,
      sessionDir: fixture.sessionDir,
      stage: "plaud_import_ready",
      producerNode: "producer_01",
      apply: true,
      now: "2026-07-11T01:00:00.000Z",
    };
    const prepared = await Promise.all(Array.from({ length: 100 }, () => prepareDeliveryReceipt(prepareOptions)));
    const receiptRef = prepared[0].receipt_ref;
    const receiptPath = path.join(repoRoot, receiptRef);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(receipt.created_at, "2026-07-11T01:00:00.000Z");
    assert.equal(prepared.every((row) => row.receipt.receipt_id === receipt.receipt_id), true);

    const ackOptions = {
      repoRoot,
      sessionId: fixture.sessionId,
      consumerNode: "consumer_01",
      apply: true,
      now: "2026-07-11T01:01:00.000Z",
    };
    const acknowledged = await Promise.all(Array.from({ length: 100 }, () => acknowledgeDelivery(ackOptions)));
    assert.equal(acknowledged.every((row) => row.status === "delivered"), true);
    const receiptMtime = (await stat(receiptPath)).mtimeMs;
    const ackPath = path.join(repoRoot, acknowledged[0].acknowledgement_ref);
    const ackMtime = (await stat(ackPath)).mtimeMs;
    await delay(25);
    const settledReceipt = await prepareDeliveryReceipt({ ...prepareOptions, now: "2026-07-11T02:00:00.000Z" });
    const settledAck = await acknowledgeDelivery({ ...ackOptions, now: "2026-07-11T02:01:00.000Z" });
    assert.equal(settledReceipt.changed, false);
    assert.equal(settledAck.changed, false);
    assert.equal((await stat(receiptPath)).mtimeMs, receiptMtime);
    assert.equal((await stat(ackPath)).mtimeMs, ackMtime);
    assert.equal((await getDeliveryStatus({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" })).status, "delivered");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("delivery refs reject traversal, absolute paths, URLs, and nested symlink escape", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-unsafe-"));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-outside-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    const base = { repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "producer_01" };
    for (const ref of ["_workspaces/system/voice_capture/../escape.txt", path.join(outsideRoot, "escape.txt"), "https://example.test/payload"]) {
      await assert.rejects(
        prepareDeliveryReceipt({ ...base, files: [{ role: "source_audio", ref, required: true }] }),
        DeliveryContractError,
      );
    }
    await writeFile(path.join(outsideRoot, "escape.txt"), "outside", "utf8");
    const nestedLink = path.join(repoRoot, "_workspaces", "system", "voice_capture", "nested-link");
    symlinkSync(outsideRoot, nestedLink, DIRECTORY_LINK_TYPE);
    await assert.rejects(
      prepareDeliveryReceipt({
        ...base,
        files: [{ role: "source_audio", ref: "_workspaces/system/voice_capture/nested-link/escape.txt", required: true }],
      }),
      /nested_symlink_rejected/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("the intended _workspaces/system symlink is allowed while receipt schema rejects body and secret keys", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-link-"));
  const sharedRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-shared-"));
  try {
    await mkdir(path.join(repoRoot, "_workspaces"), { recursive: true });
    symlinkSync(sharedRoot, path.join(repoRoot, "_workspaces", "system"), DIRECTORY_LINK_TYPE);
    const fixture = await createPlaudFixture(repoRoot);
    const prepared = await prepareDeliveryReceipt({ repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "producer_01", apply: true });
    const receiptPath = path.join(repoRoot, prepared.receipt_ref);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receipt.body = "must not be accepted";
    await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`, "utf8");
    await assert.rejects(
      acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" }),
      DeliveryContractError,
    );
    delete receipt.body;
    receipt.token = "must-not-be-accepted";
    await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`, "utf8");
    await assert.rejects(
      acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" }),
      /unknown_key:token|secret_like_key/u,
    );
    delete receipt.token;
    receipt.created_at = "2026-07-11T10:00:00+09:00";
    await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`, "utf8");
    await assert.rejects(
      acknowledgeDelivery({ repoRoot, sessionId: fixture.sessionId, consumerNode: "consumer_01" }),
      /delivery_receipt_created_at_invalid/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(sharedRoot, { recursive: true, force: true });
  }
});

test("_workspaces/system symlink into the public repo is rejected before delivery writes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-malicious-link-"));
  try {
    const inRepoTarget = path.join(repoRoot, "guild_hall", "shared-system-target");
    await mkdir(inRepoTarget, { recursive: true });
    await mkdir(path.join(repoRoot, "_workspaces"), { recursive: true });
    symlinkSync(inRepoTarget, path.join(repoRoot, "_workspaces", "system"), DIRECTORY_LINK_TYPE);
    const fixture = await createPlaudFixture(repoRoot);
    await assert.rejects(
      prepareDeliveryReceipt({ repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "producer_01", apply: true }),
      /shared_system_symlink_must_resolve_outside_public_repo/u,
    );
    await assert.rejects(
      readFile(path.join(inRepoTarget, "voice_capture", "delivery", "producer_receipts", `${fixture.sessionId}.json`), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("a normal in-repo _workspaces/system directory is rejected before delivery writes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-in-repo-system-"));
  try {
    await mkdir(path.join(repoRoot, "_workspaces", "system"), { recursive: true });
    const fixture = await createPlaudFixture(repoRoot);
    await assert.rejects(
      prepareDeliveryReceipt({ repoRoot, sessionDir: fixture.sessionDir, stage: "plaud_import_ready", producerNode: "producer_01", apply: true }),
      /delivery_shared_system_must_be_external_symlink/u,
    );
    await assert.rejects(
      readFile(path.join(repoRoot, "_workspaces", "system", "voice_capture", "delivery", "producer_receipts", `${fixture.sessionId}.json`), "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("delivery CLI uses 0 for success, 1 for delivery gaps, and 2 for unsafe input", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-delivery-cli-"));
  try {
    const fixture = await createPlaudFixture(repoRoot);
    const common = [
      CLI_PATH, "prepare-delivery", "--repo-root", repoRoot, "--session-dir", fixture.sessionDir,
      "--stage", "plaud_import_ready", "--producer-node", "producer_01", "--json",
    ];
    assert.equal(spawnSync(process.execPath, common, { encoding: "utf8" }).status, 0);
    await assert.rejects(readFile(path.join(repoRoot, "_workspaces", "system", "voice_capture", "delivery", "producer_receipts", `${fixture.sessionId}.json`), "utf8"), /ENOENT/u);
    assert.equal(spawnSync(process.execPath, [...common, "--apply"], { encoding: "utf8" }).status, 0);
    assert.equal(spawnSync(process.execPath, [CLI_PATH, "delivery-status", "--repo-root", repoRoot, "--session-id", fixture.sessionId, "--consumer-node", "consumer_01"], { encoding: "utf8" }).status, 1);
    assert.equal(spawnSync(process.execPath, [CLI_PATH, "ack-delivery", "--repo-root", repoRoot, "--session-id", fixture.sessionId, "--consumer-node", "consumer_01", "--apply"], { encoding: "utf8" }).status, 0);
    await writeFile(fixture.audioPath, "ZYXWV", "utf8");
    assert.equal(spawnSync(process.execPath, [CLI_PATH, "ack-delivery", "--repo-root", repoRoot, "--session-id", fixture.sessionId, "--consumer-node", "consumer_01", "--apply"], { encoding: "utf8" }).status, 1);
    assert.equal(spawnSync(process.execPath, [CLI_PATH, "ack-delivery", "--repo-root", repoRoot, "--session-id", fixture.sessionId, "--consumer-node", "../unsafe"], { encoding: "utf8" }).status, 2);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("direct delivery requires explicit fixed root and preserves required artifact checks", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-direct-delivery-"));
  try {
    const voiceRootRef = "ingress/plaud";
    const fixture = await createPlaudFixture(repoRoot, voiceRootRef);
    const base = { repoRoot, voiceRootRef, sessionDir: fixture.sessionDir,
      stage: "plaud_import_ready", producerNode: "synthetic-producer", apply: true };
    await assert.rejects(writeRecordingLibraryEntry({ repoRoot, sessionDir: fixture.sessionDir,
      voiceRootRef: "_workspaces/system/voice_capture", apply: true }), /recording_library_session_outside_selected_root/);
    await assert.rejects(prepareDeliveryReceipt({ ...base, voiceRootRef: undefined }), /delivery_ref_outside_allowlist/);
    await assert.rejects(prepareDeliveryReceipt({ ...base, voiceRootRef: "ingress/other" }), /delivery_voice_root_not_supported/);
    for (const ref of ["_workmeta/forbidden.json", "_workspaces/system/voice_capture/transcript.txt", "ingress/plaud/../other/data"]) {
      await assert.rejects(prepareDeliveryReceipt({ ...base, files: [{ role: "source_audio", ref, required: true }] }), /delivery_ref_/);
    }
    const prepared = await prepareDeliveryReceipt(base);
    assert.equal(prepared.status, "ready");
    assert.ok(prepared.receipt_ref.startsWith(`${voiceRootRef}/delivery/`));
    const ack = await acknowledgeDelivery({ repoRoot, voiceRootRef, sessionId: fixture.sessionId,
      consumerNode: "synthetic-consumer", apply: true });
    assert.equal(ack.status, "delivered");
    assert.equal((await getDeliveryStatus({ repoRoot, voiceRootRef, sessionId: fixture.sessionId,
      consumerNode: "synthetic-consumer" })).status, "delivered");
    const receiptBytes = await readFile(path.join(repoRoot, prepared.receipt_ref));
    await unlink(path.join(fixture.sessionDir, "transcript.jsonl"));
    const missing = await prepareDeliveryReceipt(base);
    assert.equal(missing.status, "missing");
    assert.deepEqual(missing.missing.map((item) => item.role), ["provider_transcript_segments"]);
    assert.deepEqual(await readFile(path.join(repoRoot, prepared.receipt_ref)), receiptBytes);
    await writeFile(path.join(fixture.sessionDir, "transcript.jsonl"), "synthetic transcript\n");
    const manifestPath = path.join(fixture.sessionDir, "session_manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.provider_summary = { status: "provider_output_present_untrusted",
      ref: `${voiceRootRef}/sessions/2026-07-11/${fixture.sessionId}/provider_export/summary.md` };
    await writeFile(manifestPath, JSON.stringify(manifest));
    const missingSummary = await prepareDeliveryReceipt(base);
    assert.equal(missingSummary.status, "missing");
    assert.deepEqual(missingSummary.missing.map((item) => item.role), ["provider_summary"]);
    manifest.provider_summary.status = "provider_output_failed_optional";
    await writeFile(manifestPath, JSON.stringify(manifest));
    assert.equal((await prepareDeliveryReceipt(base)).status, "ready");
    assert.equal(await stat(path.join(repoRoot, "_workspaces")).then(() => true, () => false), false);
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
});

for (const boundary of [1, 2, 3]) test(`direct delivery revalidates write boundary ${boundary} and never cleans an outside temporary`, async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-delivery-write-boundary-"));
  try {
    const voiceRootRef = "ingress/plaud";
    const fixture = await createPlaudFixture(repoRoot, voiceRootRef);
    const destination = path.join(repoRoot, voiceRootRef, "delivery/producer_receipts");
    const outside = path.join(repoRoot, "outside");
    const displaced = path.join(repoRoot, "displaced");
    await mkdir(outside);
    await mkdir(path.dirname(destination), { recursive: true });
    let callbacks = 0;
    let protectedNames = [];
    await assert.rejects(prepareDeliveryReceipt({ repoRoot, voiceRootRef, sessionDir: fixture.sessionDir,
      stage: "plaud_import_ready", producerNode: "synthetic-producer", apply: true,
      beforeWrite: async () => {
        callbacks += 1;
        if (callbacks !== boundary) return;
        if (boundary > 1) await rename(destination, displaced);
        if (boundary === 3) {
          protectedNames = await readdir(displaced);
          assert.equal(protectedNames.length, 1);
          for (const name of protectedNames) await writeFile(path.join(outside, name), "outside-owned-sentinel");
        }
        symlinkSync(outside, destination, DIRECTORY_LINK_TYPE);
      },
    }), /delivery_/);
    assert.equal(callbacks, boundary);
    assert.deepEqual(await readdir(outside), protectedNames);
    for (const name of protectedNames) assert.equal(await readFile(path.join(outside, name), "utf8"), "outside-owned-sentinel");
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
});

test("direct current receipt replaces only a strictly valid same-identity legacy generation", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-direct-generation-"));
  try {
    const legacy = await createPlaudFixture(repoRoot);
    const prior = await prepareDeliveryReceipt({ repoRoot, sessionDir: legacy.sessionDir,
      stage: "plaud_import_ready", producerNode: "synthetic-producer", apply: true });
    const priorBytes = await readFile(path.join(repoRoot, prior.receipt_ref));
    const direct = await createPlaudFixture(repoRoot, "ingress/plaud");
    const currentRef = `ingress/plaud/delivery/producer_receipts/${direct.sessionId}.json`;
    await mkdir(path.dirname(path.join(repoRoot, currentRef)), { recursive: true });
    await writeFile(path.join(repoRoot, currentRef), priorBytes);
    const base = { repoRoot, voiceRootRef: "ingress/plaud", sessionDir: direct.sessionDir,
      stage: "plaud_import_ready", producerNode: "synthetic-producer", apply: true };
    const next = await prepareDeliveryReceipt(base);
    assert.equal(next.status, "ready");
    assert.notEqual(next.receipt.receipt_id, prior.receipt.receipt_id);
    assert.equal(next.previous_generation.receipt_id, prior.receipt.receipt_id);
    assert.equal(next.previous_generation.receipt_sha256, createHash("sha256").update(priorBytes).digest("hex"));
    validateDeliveryReceipt(next.receipt, { voiceRootRef: "ingress/plaud" });
    assert.deepEqual(await readFile(path.join(repoRoot, prior.receipt_ref)), priorBytes, "legacy history stays byte-identical");
    for (const kind of ["identity", "mixed", "arbitrary", "wrong-session-ref"]) {
      const unsafe = structuredClone(prior.receipt);
      if (kind === "identity") unsafe.recording_id = "wrong-recording";
      if (kind === "mixed") unsafe.files[0].ref = unsafe.files[0].ref.replace("_workspaces/system/voice_capture", "ingress/plaud");
      if (kind === "arbitrary") unsafe.files[0].ref = "ingress/other/source.ogg";
      if (kind === "wrong-session-ref") unsafe.files.find((file) => file.role === "session_manifest").ref = "_workspaces/system/voice_capture/sessions/2026-07-11/wrong-session/session_manifest.json";
      unsafe.receipt_id = `voice-delivery-${createHash("sha256").update(JSON.stringify(unsafe.files)).digest("hex").slice(0, 24)}`;
      const bytes = JSON.stringify(unsafe);
      await writeFile(path.join(repoRoot, currentRef), bytes);
      await assert.rejects(prepareDeliveryReceipt(base), DeliveryContractError, kind);
      assert.equal(await readFile(path.join(repoRoot, currentRef), "utf8"), bytes);
    }
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
});

test("direct library and delivery reject nested links before outside writes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-direct-library-link-"));
  try {
    const voiceRootRef = "ingress/plaud";
    const fixture = await createPlaudFixture(repoRoot, voiceRootRef);
    const libraryRoot = path.join(repoRoot, voiceRootRef, "library");
    const outside = path.join(repoRoot, "outside-library");
    await mkdir(outside);
    await rm(libraryRoot, { recursive: true, force: true });
    symlinkSync(outside, libraryRoot, DIRECTORY_LINK_TYPE);
    await assert.rejects(writeRecordingLibraryEntry({ repoRoot, voiceRootRef, sessionDir: fixture.sessionDir, apply: true }), /delivery_ref_nested_symlink_rejected/);
    await assert.rejects(prepareDeliveryReceipt({ repoRoot, voiceRootRef, sessionDir: fixture.sessionDir,
      stage: "plaud_import_ready", producerNode: "synthetic-producer", apply: true }), /delivery_ref_nested_symlink_rejected/);
    assert.deepEqual(await readdir(outside), []);
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
});

async function createPlaudFixture(repoRoot, voiceRootRef = "_workspaces/system/voice_capture") {
  const systemPath = path.join(repoRoot, "_workspaces", "system");
  if (voiceRootRef === "_workspaces/system/voice_capture") try {
    await lstat(systemPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const sharedRoot = path.join(os.tmpdir(), `soulforge-voice-delivery-shared-${randomUUID()}`);
    generatedSharedRoots.add(sharedRoot);
    await mkdir(sharedRoot, { recursive: true });
    await mkdir(path.dirname(systemPath), { recursive: true });
    symlinkSync(sharedRoot, systemPath, DIRECTORY_LINK_TYPE);
  }
  const sessionId = "fixture_session";
  const date = "2026-07-11";
  const sessionDir = path.join(repoRoot, voiceRootRef, "sessions", date, sessionId);
  const ref = (suffix) => `${voiceRootRef}/sessions/${date}/${sessionId}/${suffix}`;
  await mkdir(path.join(sessionDir, "audio"), { recursive: true });
  await mkdir(path.join(sessionDir, "provider_export"), { recursive: true });
  const audioPath = path.join(sessionDir, "audio", "source.ogg");
  await writeFile(audioPath, "ABCDE", "utf8");
  await writeFile(path.join(sessionDir, "transcript.txt"), "synthetic transcript body\n", "utf8");
  await writeFile(path.join(sessionDir, "transcript.jsonl"), '{"content":"synthetic transcript body"}\n', "utf8");
  await writeFile(path.join(sessionDir, "provider_export", "transcript.txt"), "synthetic transcript body\n", "utf8");
  await writeFile(path.join(sessionDir, "source_event_draft.yaml"), "raw_payload_copied: false\n", "utf8");
  await writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify({
    schema_version: "soulforge.voice_capture_session.v0",
    session_id: sessionId,
    audio: { ref: ref("audio/source.ogg") },
    transcript: {
      ref: ref("transcript.txt"),
      jsonl_ref: ref("transcript.jsonl"),
      provider_original_ref: ref("provider_export/transcript.txt"),
    },
    provider_summary: { status: "not_available" },
  }, null, 2)}\n`, "utf8");
  const recordingManifest = path.join(repoRoot, voiceRootRef, "library", "recordings", date, sessionId, "recording_manifest.json");
  await mkdir(path.dirname(recordingManifest), { recursive: true });
  await writeFile(recordingManifest, '{"recording_id":"fixture_session"}\n', "utf8");
  return { sessionId, sessionDir, audioPath };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
