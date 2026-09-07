import assert from "node:assert/strict";
import test from "node:test";
import { createReceiptExpiryLoader } from "./receipt-expiry-load.mjs";

function snapshot(status = "current") {
  return {
    schema_version: "soulforge.team_ops_board.receipt_expiry_projection.v1",
    observed_at: "2026-09-08T00:00:00.000Z",
    status: status === "current" ? "ready" : "partial", reason: null,
    summary: { total: 1, current: 0, warning: 0, critical: 0, expired: 0, invalid: 0, unknown: 0,
      [status]: 1, owner_action_required_count: 0 },
    receipts: [{ contract_id: "synthetic_receipt", status, owner_action_required: false }],
    authority_boundary: { read_only: true, runtime_authority: false, repair_authority: false },
  };
}
const ok = (data = snapshot()) => ({ ok: true, json: async () => data });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("initial 503, recovery, later 503, and recovery publish distinct availability without retained healthy counts", async () => {
  const responses = [{ ok: false }, ok(), { ok: false }, ok(snapshot("warning"))];
  const results = [];
  const loader = createReceiptExpiryLoader((result) => results.push(result), async () => responses.shift());
  for (let index = 0; index < 4; index += 1) await loader.load();
  assert.deepEqual(results.map((result) => result.state), ["unavailable", "available", "unavailable", "available"]);
  assert.equal(results[0].snapshot, null);
  assert.equal(results[1].snapshot.summary.current, 1);
  assert.equal(results[2].snapshot, null);
  assert.equal(results[3].snapshot.summary.warning, 1);
  loader.dispose();
});

test("network failures, invalid JSON, malformed envelopes/counts/rows clear a prior valid observation", async () => {
  const malformed = [null, {}, { status: "ready" },
    { ...snapshot(), status: "constructor" },
    { ...snapshot(), summary: { ...snapshot().summary, current: "1" } },
    { ...snapshot(), summary: { ...snapshot().summary, total: 2 } },
    { ...snapshot(), receipts: [null] },
    { ...snapshot(), receipts: [{ contract_id: "bad", status: 1 }] },
    { ...snapshot(), authority_boundary: { read_only: true, runtime_authority: true, repair_authority: false } },
  ];
  const failures = [async () => { throw new TypeError("network"); },
    async () => ({ ok: true, json: async () => { throw new SyntaxError("json"); } }),
    ...malformed.map((value) => async () => ok(value))];
  for (const failure of failures) {
    const results = [];
    let fetchNext = async () => ok();
    const loader = createReceiptExpiryLoader((result) => results.push(result), () => fetchNext());
    await loader.load();
    fetchNext = failure;
    await loader.load();
    assert.equal(results[0].state, "available");
    assert.deepEqual(results[1], { state: "unavailable", snapshot: null });
    loader.dispose();
  }
});

test("source-asserted unavailable remains unavailable source evidence without reclassifying it as ready", async () => {
  const source = { ...snapshot("unknown"), status: "unavailable", reason: "receipt_expiry_disabled_by_binding" };
  let result;
  const loader = createReceiptExpiryLoader((next) => { result = next; }, async () => ok(source));
  await loader.load();
  assert.equal(result.state, "available");
  assert.equal(result.snapshot, source);
  assert.equal(result.snapshot.status, "unavailable");
  loader.dispose();
});

test("superseded success or failure cannot overwrite the newest request, including delayed JSON parsing", async () => {
  for (const olderResponse of [ok(), { ok: false }, { ok: true, json: async () => { throw new Error("late parse error"); } }]) {
    const older = deferred();
    const results = [];
    const signals = [];
    const loader = createReceiptExpiryLoader((result) => results.push(result), (_url, options) => {
      signals.push(options.signal);
      return signals.length === 1 ? older.promise : Promise.resolve(ok(snapshot("expired")));
    });
    const first = loader.load();
    await loader.load();
    older.resolve(olderResponse);
    await first;
    assert.equal(signals[0].aborted, true);
    assert.equal(results.length, 1);
    assert.equal(results[0].snapshot.summary.expired, 1);
    loader.dispose();
  }
  const json = deferred();
  const results = [];
  let calls = 0;
  const loader = createReceiptExpiryLoader((result) => results.push(result), async () => ++calls === 1
    ? { ok: true, json: () => json.promise } : { ok: false });
  const first = loader.load();
  await Promise.resolve();
  await loader.load();
  json.resolve(snapshot());
  await first;
  assert.deepEqual(results, [{ state: "unavailable", snapshot: null }]);
  loader.dispose();
});

test("leaving the surface aborts and suppresses pending results; a fresh mount loads independently", async () => {
  const pending = deferred();
  const oldResults = [];
  let signal;
  const oldLoader = createReceiptExpiryLoader((result) => oldResults.push(result), (_url, options) => {
    signal = options.signal;
    return pending.promise;
  });
  const loading = oldLoader.load();
  oldLoader.dispose();
  const newResults = [];
  const newLoader = createReceiptExpiryLoader((result) => newResults.push(result), async () => ({ ok: false }));
  await newLoader.load();
  pending.resolve(ok());
  await loading;
  assert.equal(signal.aborted, true);
  assert.deepEqual(oldResults, []);
  assert.deepEqual(newResults, [{ state: "unavailable", snapshot: null }]);
  newLoader.dispose();
});
