import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  PROVIDER_QUOTA_ATTEMPT_CLASSES,
  PROVIDER_QUOTA_ATTEMPT_FILE_NAME,
  PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME,
  PROVIDER_QUOTA_ATTEMPT_HISTORY_LIMIT,
  PROVIDER_QUOTA_ATTEMPT_HISTORY_SCHEMA,
  PROVIDER_QUOTA_ATTEMPT_MAX_BYTES,
  PROVIDER_QUOTA_ATTEMPT_RESULTS,
  classifyProviderQuotaAttempt,
  createProviderQuotaAttemptLog,
  isProviderQuotaAttemptEntry,
} from "./provider-quota-attempt-log.mjs";

const RECEIPT_DIR = path.resolve("test-fixtures", "quota-attempt");
const ATTEMPTED_AT = "2026-08-19T00:00:00.000Z";

function memoryFs() {
  const files = new Map();
  return {
    files,
    ops: {
      mkdir: async () => undefined,
      readFile: async (file) => {
        if (!files.has(path.resolve(file))) {
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        }
        return files.get(path.resolve(file));
      },
      writeFile: async (file, data) => { files.set(path.resolve(file), String(data)); },
      rename: async (from, to) => {
        files.set(path.resolve(to), files.get(path.resolve(from)));
        files.delete(path.resolve(from));
      },
      unlink: async (file) => { files.delete(path.resolve(file)); },
      lstat: async (file) => {
        const key = path.resolve(file);
        if (!files.has(key)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        return { size: Buffer.byteLength(files.get(key)), isFile: () => true, isSymbolicLink: () => false };
      },
    },
  };
}

function createLog(fs, overrides = {}) {
  let nonce = 0;
  return createProviderQuotaAttemptLog({
    receiptDirectory: RECEIPT_DIR,
    fsOps: fs.ops,
    nonce: () => `nonce${(nonce += 1).toString().padStart(8, "0")}`,
    ...overrides,
  });
}

function parsed(fs, name) {
  return JSON.parse(fs.files.get(path.join(RECEIPT_DIR, name)));
}

test("every collector result maps to exactly one fixed sanitized class", () => {
  assert.deepEqual([...PROVIDER_QUOTA_ATTEMPT_RESULTS].sort(), [
    "already_current", "auth_rejected", "credential_unavailable", "rate_limited",
    "receipt_failed", "request_failed", "response_invalid", "retained_newer", "written",
  ]);
  assert.deepEqual([...PROVIDER_QUOTA_ATTEMPT_CLASSES].sort(), [
    "accepted", "auth_rejected", "credential_unavailable", "rate_limited",
    "receipt_failed", "response_invalid", "transport_failed",
  ]);
  assert.equal(classifyProviderQuotaAttempt("written"), "accepted");
  assert.equal(classifyProviderQuotaAttempt("already_current"), "accepted");
  assert.equal(classifyProviderQuotaAttempt("retained_newer"), "accepted");
  assert.equal(classifyProviderQuotaAttempt("auth_rejected"), "auth_rejected");
  assert.equal(classifyProviderQuotaAttempt("credential_unavailable"), "credential_unavailable");
  assert.equal(classifyProviderQuotaAttempt("request_failed"), "transport_failed");
  assert.equal(classifyProviderQuotaAttempt("rate_limited"), "rate_limited");
  assert.equal(classifyProviderQuotaAttempt("response_invalid"), "response_invalid");
  assert.equal(classifyProviderQuotaAttempt("receipt_failed"), "receipt_failed");
  assert.equal(classifyProviderQuotaAttempt("gate_disabled"), null);
  assert.equal(classifyProviderQuotaAttempt("anything_else"), null);
});

test("a failed attempt persists a latest receipt and an append-only history row", async () => {
  const fs = memoryFs();
  const log = createLog(fs);
  const result = await log.recordAttempt({ provider: "claude", attemptedAt: ATTEMPTED_AT, result: "auth_rejected" });
  const entry = result.entry;

  assert.deepEqual(entry, { provider: "claude", attempted_at: ATTEMPTED_AT, result: "auth_rejected", result_class: "auth_rejected" });
  assert.equal(result.latest_outcome, "written");
  assert.equal(result.history_outcome, "created");
  assert.equal(result.history_reason, null);
  const latest = parsed(fs, PROVIDER_QUOTA_ATTEMPT_FILE_NAME);
  assert.deepEqual(Object.keys(latest).sort(), ["attempted_at", "provider", "result", "result_class", "schema_version"]);
  assert.equal(latest.result_class, "auth_rejected");
  const history = parsed(fs, PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME);
  assert.deepEqual(history.entries, [entry]);
  assert.deepEqual([...fs.files.keys()].map((file) => path.basename(file)).sort(), [
    PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME,
    PROVIDER_QUOTA_ATTEMPT_FILE_NAME,
  ].sort());
});

test("a successful attempt is recorded exactly like a failed one", async () => {
  const fs = memoryFs();
  const log = createLog(fs);
  await log.recordAttempt({ provider: "claude", attemptedAt: ATTEMPTED_AT, result: "written" });
  assert.equal(parsed(fs, PROVIDER_QUOTA_ATTEMPT_FILE_NAME).result_class, "accepted");
  assert.equal(parsed(fs, PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME).entries.length, 1);
});

test("history retention is bounded and keeps the newest attempts", async () => {
  const fs = memoryFs();
  const log = createLog(fs, { historyLimit: 3 });
  for (let index = 0; index < 5; index += 1) {
    await log.recordAttempt({
      provider: "claude",
      attemptedAt: new Date(Date.parse(ATTEMPTED_AT) + index * 1_000).toISOString(),
      result: index % 2 === 0 ? "auth_rejected" : "written",
    });
  }
  const history = parsed(fs, PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME);
  assert.equal(history.entries.length, 3);
  assert.deepEqual(history.entries.map((row) => row.result), ["auth_rejected", "written", "auth_rejected"]);
  assert.equal(PROVIDER_QUOTA_ATTEMPT_HISTORY_LIMIT, 50);
});

test("the log rejects unknown providers, results, and timestamps without writing", async () => {
  const fs = memoryFs();
  const log = createLog(fs);
  for (const options of [
    { provider: "slack", attemptedAt: ATTEMPTED_AT, result: "written" },
    { provider: "claude", attemptedAt: ATTEMPTED_AT, result: "gate_disabled" },
    { provider: "claude", attemptedAt: "not-a-time", result: "written" },
  ]) {
    assert.equal(await log.recordAttempt(options), null);
  }
  assert.equal(fs.files.size, 0);
});

test("a write failure is contained and reported, never escaping to the collector", async () => {
  const fs = memoryFs();
  const log = createLog(fs, { fsOps: { ...fs.ops, writeFile: async () => { throw new Error("disk"); } } });
  const result = await log.recordAttempt({ provider: "claude", attemptedAt: ATTEMPTED_AT, result: "written" });
  assert.equal(result.entry.result, "written");
  assert.equal(result.latest_outcome, "latest_write_failed");
  assert.equal(result.history_outcome, "preserved");
  assert.equal(result.history_reason, "history_write_failed");
  assert.equal(fs.files.size, 0);
});

test("readLatest returns only an exact validated entry and never invents one", async () => {
  const fs = memoryFs();
  const log = createLog(fs);
  assert.equal(await log.readLatest(), null);
  await log.recordAttempt({ provider: "claude", attemptedAt: ATTEMPTED_AT, result: "auth_rejected" });
  assert.deepEqual(await log.readLatest(), { provider: "claude", attempted_at: ATTEMPTED_AT, result: "auth_rejected", result_class: "auth_rejected" });

  fs.files.set(path.join(RECEIPT_DIR, PROVIDER_QUOTA_ATTEMPT_FILE_NAME), JSON.stringify({ schema_version: "other", provider: "claude" }));
  assert.equal(await log.readLatest(), null);
  fs.files.set(path.join(RECEIPT_DIR, PROVIDER_QUOTA_ATTEMPT_FILE_NAME), "{not json");
  assert.equal(await log.readLatest(), null);
});

test("entry validation is exact-key and rejects extra or unsafe fields", () => {
  const valid = { provider: "claude", attempted_at: ATTEMPTED_AT, result: "written", result_class: "accepted" };
  assert.equal(isProviderQuotaAttemptEntry(valid), true);
  assert.equal(isProviderQuotaAttemptEntry({ ...valid, detail: "raw response body" }), false);
  assert.equal(isProviderQuotaAttemptEntry({ ...valid, result_class: "auth_rejected" }), false);
  assert.equal(isProviderQuotaAttemptEntry({ ...valid, attempted_at: "2026-13-99" }), false);
  assert.equal(isProviderQuotaAttemptEntry(null), false);
});

test("a reader refuses an oversized, symlinked, or non-regular evidence file before reading it", async () => {
  const fs = memoryFs();
  const log = createLog(fs);
  await log.recordAttempt({ provider: "claude", attemptedAt: ATTEMPTED_AT, result: "auth_rejected" });
  const latestKey = path.join(RECEIPT_DIR, PROVIDER_QUOTA_ATTEMPT_FILE_NAME);
  const historyKey = path.join(RECEIPT_DIR, PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME);

  for (const boundary of [
    { size: PROVIDER_QUOTA_ATTEMPT_MAX_BYTES + 1, isFile: true, isSymbolicLink: false },
    { size: 64, isFile: true, isSymbolicLink: true },
    { size: 64, isFile: false, isSymbolicLink: false },
  ]) {
    let reads = 0;
    const guarded = createLog(fs, {
      fsOps: {
        ...fs.ops,
        lstat: async () => ({ size: boundary.size, isFile: () => boundary.isFile, isSymbolicLink: () => boundary.isSymbolicLink }),
        readFile: async (file) => { reads += 1; return fs.ops.readFile(file); },
      },
    });
    assert.equal(await guarded.readLatest(), null, "oversized or non-regular latest is refused");
    const refused = await guarded.readHistory();
    assert.equal(refused.state, "invalid", "a present-but-unreadable history is invalid, not missing");
    assert.deepEqual(refused.entries, [], "no partial row set is exposed");
    assert.equal(reads, 0, "the file is never read once the boundary rejects it");
  }

  // A file that is regular, unlinked, and within the bound still reads normally.
  const allowed = createLog(fs, {
    fsOps: { ...fs.ops, lstat: async () => ({ size: 512, isFile: () => true, isSymbolicLink: () => false }) },
  });
  assert.equal((await allowed.readLatest()).result, "auth_rejected");
  assert.equal((await allowed.readHistory()).state, "valid");
  assert.equal((await allowed.readHistory()).entries.length, 1);
  assert.ok(fs.files.has(latestKey) && fs.files.has(historyKey));
});

test("an append onto an oversized history preserves the bytes and reports the failure", async () => {
  const fs = memoryFs();
  const corrupt = "CORRUPT-HISTORY-BYTES-DO-NOT-OVERWRITE";
  const historyKey = path.join(RECEIPT_DIR, PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME);
  fs.files.set(historyKey, corrupt);
  const guarded = createLog(fs, {
    fsOps: { ...fs.ops, lstat: async () => ({ size: PROVIDER_QUOTA_ATTEMPT_MAX_BYTES + 1, isFile: () => true, isSymbolicLink: () => false }) },
  });

  const result = await guarded.recordAttempt({ provider: "claude", attemptedAt: ATTEMPTED_AT, result: "written" });

  assert.equal(result.entry.result, "written");
  assert.equal(result.history_outcome, "preserved");
  assert.equal(result.history_reason, "history_present_invalid");
  assert.equal(fs.files.get(historyKey), corrupt, "corrupt history bytes are unchanged");
});

test("a corrupt history is preserved byte-for-byte while latest still records liveness", async () => {
  const historyKey = path.join(RECEIPT_DIR, PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME);
  const latestKey = path.join(RECEIPT_DIR, PROVIDER_QUOTA_ATTEMPT_FILE_NAME);
  const corruptions = [
    "{not json at all",
    JSON.stringify({ schema_version: "soulforge.foreign.v1", entries: [] }),
    JSON.stringify({ schema_version: PROVIDER_QUOTA_ATTEMPT_HISTORY_SCHEMA, entries: "nope" }),
    JSON.stringify({ schema_version: PROVIDER_QUOTA_ATTEMPT_HISTORY_SCHEMA, entries: [{ provider: "claude" }] }),
    JSON.stringify({
      schema_version: PROVIDER_QUOTA_ATTEMPT_HISTORY_SCHEMA,
      entries: [
        { provider: "claude", attempted_at: ATTEMPTED_AT, result: "written", result_class: "accepted" },
        { tampered: true },
      ],
    }),
  ];

  for (const corrupt of corruptions) {
    const fs = memoryFs();
    fs.files.set(historyKey, corrupt);
    const log = createLog(fs);

    const result = await log.recordAttempt({ provider: "claude", attemptedAt: ATTEMPTED_AT, result: "auth_rejected" });

    assert.equal(result.history_outcome, "preserved");
    assert.equal(result.history_reason, "history_present_invalid");
    assert.equal(fs.files.get(historyKey), corrupt, "the corrupt history is byte-identical afterwards");
    // Current liveness is still visible even though history could not append.
    assert.equal(result.latest_outcome, "written");
    assert.equal(JSON.parse(fs.files.get(latestKey)).result, "auth_rejected");
    // Even a history holding one good row plus one bad row is never salvaged.
    assert.deepEqual((await log.readHistory()), { state: "invalid", entries: [] });
  }
});

test("a repeated attempt against a corrupt history keeps preserving it, never accumulating over it", async () => {
  const fs = memoryFs();
  const historyKey = path.join(RECEIPT_DIR, PROVIDER_QUOTA_ATTEMPT_HISTORY_FILE_NAME);
  const corrupt = JSON.stringify({ schema_version: "soulforge.foreign.v1", entries: [{ any: "row" }] });
  fs.files.set(historyKey, corrupt);
  const log = createLog(fs);

  for (let index = 0; index < 3; index += 1) {
    const result = await log.recordAttempt({
      provider: "claude",
      attemptedAt: new Date(Date.parse(ATTEMPTED_AT) + index * 1_000).toISOString(),
      result: "written",
    });
    assert.equal(result.history_outcome, "preserved");
  }
  assert.equal(fs.files.get(historyKey), corrupt);
});

test("the attempt evidence byte bound is fixed and small", () => {
  assert.equal(PROVIDER_QUOTA_ATTEMPT_MAX_BYTES, 64 * 1024);
});
