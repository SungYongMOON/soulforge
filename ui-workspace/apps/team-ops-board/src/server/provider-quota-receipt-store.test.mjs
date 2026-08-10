import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createOfficialProviderQuotaSnapshot } from "../core/provider-quota-snapshot.mjs";
import {
  PROVIDER_QUOTA_RECEIPT_FILE_NAME,
  createProviderQuotaReceiptStore,
} from "./provider-quota-receipt-store.mjs";

const NOW_MS = Date.parse("2026-08-10T00:00:00.000Z");

async function temporaryReceipt(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "provider-quota-receipt-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    receiptPath: path.join(directory, PROVIDER_QUOTA_RECEIPT_FILE_NAME),
  };
}

function snapshotAt(observedAtMs, percentage = 50) {
  return createOfficialProviderQuotaSnapshot({
    source_kind: "antigravity_sanitized_local_receipt",
    observed_at: new Date(observedAtMs).toISOString(),
    limits: [
      {
        limit_id: "antigravity_five_hour",
        percentage_kind: "remaining_percentage",
        percentage,
        window_minutes: 300,
        resets_at: new Date(observedAtMs + (290 * 60 * 1_000)).toISOString(),
      },
      {
        limit_id: "antigravity_weekly",
        percentage_kind: "remaining_percentage",
        percentage,
        window_minutes: 10_080,
        resets_at: new Date(observedAtMs + (10_000 * 60 * 1_000)).toISOString(),
      },
    ],
  }, { nowMs: observedAtMs });
}

test("accepted receipt is atomically persisted and read-only loads it as STALE/HOLD", async (t) => {
  const { directory, receiptPath } = await temporaryReceipt(t);
  const snapshot = snapshotAt(NOW_MS);
  const store = createProviderQuotaReceiptStore({ receiptPath, now: () => NOW_MS });

  const result = await store.persistAcceptedSnapshot(snapshot);
  assert.equal(result.write_state, "written");
  assert.equal(result.snapshot.digest, snapshot.digest);

  const beforeRead = await readFile(receiptPath, "utf8");
  const projection = await store.readReadOnlyProjection();
  const afterRead = await readFile(receiptPath, "utf8");
  assert.equal(beforeRead, afterRead);
  assert.equal(projection.capture_status, "hold");
  assert.equal(projection.freshness, "stale");
  assert.equal(projection.snapshot.observed_at, snapshot.observed_at);
  assert.equal(projection.snapshot.digest, snapshot.digest);
  assert.deepEqual(await readdir(directory), [PROVIDER_QUOTA_RECEIPT_FILE_NAME]);
});

test("read-only cache miss returns UNKNOWN/HOLD without creating a state directory", async (t) => {
  const { directory } = await temporaryReceipt(t);
  const missingDirectory = path.join(directory, "not-created");
  const store = createProviderQuotaReceiptStore({
    receiptPath: path.join(missingDirectory, PROVIDER_QUOTA_RECEIPT_FILE_NAME),
    now: () => NOW_MS,
  });

  assert.deepEqual(await store.readReadOnlyProjection(), {
    schema_version: "soulforge.team_ops_board_provider_quota_projection.v1",
    capture_status: "hold",
    freshness: "unknown",
    snapshot: null,
  });
  await assert.rejects(() => readdir(missingDirectory), { code: "ENOENT" });
});

test("writer creates only its local receipt directory after validating a complete snapshot", async (t) => {
  const { directory } = await temporaryReceipt(t);
  const receiptPath = path.join(directory, "writer-state", PROVIDER_QUOTA_RECEIPT_FILE_NAME);
  const store = createProviderQuotaReceiptStore({ receiptPath, now: () => NOW_MS });

  const result = await store.persistAcceptedSnapshot(snapshotAt(NOW_MS));
  assert.equal(result.write_state, "written");
  assert.equal(await readFile(receiptPath, "utf8"), `${JSON.stringify(result.snapshot)}\n`);
});

test("invalid input, newer stored evidence, and observation conflicts never overwrite last good receipt", async (t) => {
  const { receiptPath } = await temporaryReceipt(t);
  const store = createProviderQuotaReceiptStore({ receiptPath, now: () => NOW_MS });
  const newer = snapshotAt(NOW_MS, 61);
  await store.persistAcceptedSnapshot(newer);
  const before = await readFile(receiptPath, "utf8");

  await assert.rejects(
    () => store.persistAcceptedSnapshot({ ...newer, digest: "0".repeat(64) }),
    { code: "provider_quota_digest_mismatch" },
  );
  assert.equal(await readFile(receiptPath, "utf8"), before);

  const older = snapshotAt(NOW_MS - 30_000, 62);
  const retained = await store.persistAcceptedSnapshot(older);
  assert.equal(retained.write_state, "retained_newer");
  assert.equal(retained.snapshot.digest, newer.digest);
  assert.equal(await readFile(receiptPath, "utf8"), before);

  const conflicting = snapshotAt(NOW_MS, 63);
  await assert.rejects(
    () => store.persistAcceptedSnapshot(conflicting),
    { code: "provider_quota_receipt_observation_conflict" },
  );
  assert.equal(await readFile(receiptPath, "utf8"), before);
});

test("rename failures leave the prior complete receipt visible and clean up only the owned temporary file", async (t) => {
  const { directory, receiptPath } = await temporaryReceipt(t);
  const baselineStore = createProviderQuotaReceiptStore({ receiptPath, now: () => NOW_MS });
  const baseline = snapshotAt(NOW_MS, 44);
  await baselineStore.persistAcceptedSnapshot(baseline);
  const before = await readFile(receiptPath, "utf8");

  const failingStore = createProviderQuotaReceiptStore({
    receiptPath,
    now: () => NOW_MS + 1_000,
    nonce: () => "deterministicnonce",
    fsOps: {
      rename: async () => {
        throw new Error("synthetic rename failure");
      },
    },
  });
  await assert.rejects(
    () => failingStore.persistAcceptedSnapshot(snapshotAt(NOW_MS + 1_000, 45)),
    { code: "provider_quota_receipt_write_failed" },
  );

  assert.equal(await readFile(receiptPath, "utf8"), before);
  assert.deepEqual(await readdir(directory), [PROVIDER_QUOTA_RECEIPT_FILE_NAME]);
});

test("existing invalid receipt and active writer lock fail closed without repair", async (t) => {
  const { directory, receiptPath } = await temporaryReceipt(t);
  await writeFile(receiptPath, "{not-json", "utf8");
  const store = createProviderQuotaReceiptStore({ receiptPath, now: () => NOW_MS });
  await assert.rejects(
    () => store.persistAcceptedSnapshot(snapshotAt(NOW_MS)),
    { code: "provider_quota_receipt_existing_invalid" },
  );
  assert.equal(await readFile(receiptPath, "utf8"), "{not-json");
  assert.deepEqual(await store.readReadOnlyProjection(), {
    schema_version: "soulforge.team_ops_board_provider_quota_projection.v1",
    capture_status: "hold",
    freshness: "unknown",
    snapshot: null,
  });

  await rm(receiptPath, { force: true });
  await writeFile(`${receiptPath}.lock`, "", "utf8");
  await assert.rejects(
    () => store.persistAcceptedSnapshot(snapshotAt(NOW_MS)),
    { code: "provider_quota_receipt_store_busy" },
  );
  assert.deepEqual(await readdir(directory), [`${PROVIDER_QUOTA_RECEIPT_FILE_NAME}.lock`]);
});

test("receipt store source has no provider, process, environment, or configuration authority", async () => {
  const source = await readFile(new URL("./provider-quota-receipt-store.mjs", import.meta.url), "utf8");
  for (const forbiddenReference of [
    "node:child_process",
    "fetch(",
    "process.env",
    "execFile",
    "account list",
  ]) {
    assert.equal(source.includes(forbiddenReference), false, forbiddenReference);
  }
});
