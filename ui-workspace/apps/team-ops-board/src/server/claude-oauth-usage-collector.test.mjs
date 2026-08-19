import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ReadableStream } from "node:stream/web";
import {
  collectClaudeOauthUsage,
  CLAUDE_OAUTH_RATE_LIMIT_BACKOFF_MS,
  CLAUDE_OAUTH_USAGE_GATE_SCHEMA,
  CLAUDE_OAUTH_USAGE_URL,
} from "./claude-oauth-usage-collector.mjs";

const gate = JSON.stringify({ schema_version: CLAUDE_OAUTH_USAGE_GATE_SCHEMA, enabled: true });
const credentials = JSON.stringify({ claudeAiOauth: { accessToken: "synthetic-secret-never-return" } });
const payload = { five_hour: { utilization: 12, resets_at: "2026-08-10T12:00:00.000Z" }, seven_day: { utilization: 34, resets_at: "2026-08-16T12:00:00.000Z" }, limits: [{ kind: "weekly_scoped", percent: 56, resets_at: "2026-08-16T12:00:00.000Z", scope: { model: { display_name: "Fable" } } }] };
const GATE_PATH = path.resolve("test-fixtures", "gate.json");
const RECEIPT_PATH = path.resolve("test-fixtures", "provider_quota.receipt.v1.json");

function response(value, overrides = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  return { status: 200, redirected: false, url: CLAUDE_OAUTH_USAGE_URL, headers: new Headers({ "content-type": "application/json", "content-length": String(bytes.length) }), body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }), ...overrides };
}

function reader(path) { return path.endsWith("gate.json") ? gate : credentials; }

// Tests never write real attempt evidence: the collector's default log is a
// file writer, so every case injects an in-memory one.
const noAttemptLog = { recordAttempt: async () => null };

test("collector is disabled by default and never requests or reads credentials", async () => {
  let calls = 0;
  const result = await collectClaudeOauthUsage({ gatePath: GATE_PATH, receiptPath: RECEIPT_PATH, read: async () => { calls += 1; throw new Error("missing"); }, fetchImpl: async () => { throw new Error("must-not-run"); } });
  assert.deepEqual(result, { status: "gate_disabled" });
  assert.equal(calls, 1);
});

test("collector sanitizes 5h weekly and Fable without returning secret or raw response", async () => {
  let captured;
  const result = await collectClaudeOauthUsage({ gatePath: GATE_PATH, receiptPath: RECEIPT_PATH, read: async (filePath) => reader(filePath), fetchImpl: async (_url, init) => { assert.match(init.headers.Authorization, /^Bearer /u); return response(payload); }, now: () => Date.parse("2026-08-10T10:00:00.000Z"), attemptLog: noAttemptLog, store: { persistAcceptedSnapshot: async (snapshot) => { captured = snapshot; return { write_state: "written" }; } } });
  assert.deepEqual(result, { status: "written" });
  assert.deepEqual(captured.limits.map((row) => [row.limit_id, row.percentage]), [["claude_five_hour", 12], ["claude_weekly", 34], ["claude_fable_weekly", 56]]);
  assert.doesNotMatch(JSON.stringify({ result, captured }), /synthetic-secret|weekly_scoped/u);
});

test("collector retains a reported 5h percentage when its reset is explicitly unknown", async () => {
  let captured;
  const result = await collectClaudeOauthUsage({
    gatePath: GATE_PATH,
    receiptPath: RECEIPT_PATH,
    read: async (filePath) => reader(filePath),
    fetchImpl: async () => response({ ...payload, five_hour: { ...payload.five_hour, resets_at: null } }),
    now: () => Date.parse("2026-08-10T10:00:00.000Z"),
    attemptLog: noAttemptLog,
    store: { persistAcceptedSnapshot: async (snapshot) => { captured = snapshot; return { write_state: "written" }; } },
  });

  assert.deepEqual(result, { status: "written" });
  assert.equal(captured.limits[0].percentage, 12);
  assert.equal(captured.limits[0].resets_at, null);
});

test("auth, redirects, malformed, oversized, timeout, and future data fail closed with fixed codes", async () => {
  const common = { gatePath: GATE_PATH, receiptPath: RECEIPT_PATH, read: async (filePath) => reader(filePath), now: () => Date.parse("2026-08-10T10:00:00.000Z"), attemptLog: noAttemptLog };
  for (const status of [401, 403]) {
    assert.deepEqual(
      await collectClaudeOauthUsage({ ...common, fetchImpl: async () => response(payload, { status }) }),
      { status: "auth_rejected" },
    );
  }
  for (const fetchImpl of [
    async () => response(payload, { status: 500 }),
    async () => response(payload, { redirected: true }),
    async () => response({ nope: true }),
    async () => response(payload, { headers: new Headers({ "content-type": "application/json", "content-length": "999999" }) }),
  ]) assert.deepEqual(await collectClaudeOauthUsage({ ...common, fetchImpl }), { status: "response_invalid" });
  assert.deepEqual(await collectClaudeOauthUsage({ ...common, fetchImpl: async () => { throw new Error("secret raw url"); } }), { status: "request_failed" });
  assert.deepEqual(await collectClaudeOauthUsage({ ...common, fetchImpl: async () => response({ ...payload, five_hour: { ...payload.five_hour, resets_at: "2099-01-01T00:00:00.000Z" } }) }), { status: "response_invalid" });
});

test("HTTP 429 is classified explicitly and suppresses provider calls during a bounded backoff", async () => {
  const attemptedAt = "2026-08-10T10:00:00.000Z";
  const attempts = [];
  const attemptLog = {
    readLatest: async () => null,
    recordAttempt: async (options) => { attempts.push(options); return null; },
  };
  const common = {
    gatePath: GATE_PATH,
    receiptPath: RECEIPT_PATH,
    read: async (filePath) => reader(filePath),
    now: () => Date.parse(attemptedAt),
    attemptLog,
  };

  assert.deepEqual(
    await collectClaudeOauthUsage({ ...common, fetchImpl: async () => response(payload, { status: 429 }) }),
    { status: "rate_limited" },
  );
  assert.deepEqual(attempts.map((entry) => entry.result), ["rate_limited"]);

  let fetches = 0;
  const backoffResult = await collectClaudeOauthUsage({
    ...common,
    now: () => Date.parse(attemptedAt) + CLAUDE_OAUTH_RATE_LIMIT_BACKOFF_MS - 1,
    attemptLog: {
      readLatest: async () => ({
        provider: "claude",
        attempted_at: attemptedAt,
        result: "rate_limited",
        result_class: "rate_limited",
      }),
      recordAttempt: async () => { throw new Error("backoff is not a provider attempt"); },
    },
    fetchImpl: async () => { fetches += 1; return response(payload); },
  });
  assert.deepEqual(backoffResult, { status: "backoff_active" });
  assert.equal(fetches, 0);
});

test("every gate-passing attempt records a sanitized latest receipt and history row", async () => {
  const attempts = [];
  const attemptLog = { recordAttempt: async (options) => { attempts.push(options); return null; } };
  const common = { gatePath: GATE_PATH, receiptPath: RECEIPT_PATH, read: async (filePath) => reader(filePath), now: () => Date.parse("2026-08-10T10:00:00.000Z"), attemptLog };

  await collectClaudeOauthUsage({ ...common, fetchImpl: async () => response(payload, { status: 401 }) });
  await collectClaudeOauthUsage({ ...common, fetchImpl: async () => response(payload), store: { persistAcceptedSnapshot: async () => ({ write_state: "written" }) } });
  await collectClaudeOauthUsage({ ...common, fetchImpl: async () => { throw new Error("secret raw url"); } });

  assert.deepEqual(attempts.map((entry) => entry.result), ["auth_rejected", "written", "request_failed"]);
  assert.ok(attempts.every((entry) => entry.provider === "claude" && entry.attemptedAt === "2026-08-10T10:00:00.000Z"));
  assert.doesNotMatch(JSON.stringify(attempts), /synthetic-secret|api\.anthropic\.com|Bearer/u);
});

test("a disabled gate makes no attempt and therefore records no attempt evidence", async () => {
  let recorded = 0;
  const result = await collectClaudeOauthUsage({
    gatePath: GATE_PATH,
    receiptPath: RECEIPT_PATH,
    read: async () => { throw new Error("missing"); },
    fetchImpl: async () => { throw new Error("must-not-run"); },
    attemptLog: { recordAttempt: async () => { recorded += 1; return null; } },
  });
  assert.deepEqual(result, { status: "gate_disabled" });
  assert.equal(recorded, 0);
});

test("a missing credential is still an attempt worth recording", async () => {
  const attempts = [];
  const result = await collectClaudeOauthUsage({
    gatePath: GATE_PATH,
    receiptPath: RECEIPT_PATH,
    read: async (filePath) => { if (filePath.endsWith("gate.json")) return gate; throw new Error("missing"); },
    fetchImpl: async () => { throw new Error("must-not-run"); },
    now: () => Date.parse("2026-08-10T10:00:00.000Z"),
    attemptLog: { recordAttempt: async (options) => { attempts.push(options); return null; } },
  });
  assert.deepEqual(result, { status: "credential_unavailable" });
  assert.deepEqual(attempts.map((entry) => entry.result), ["credential_unavailable"]);
});
