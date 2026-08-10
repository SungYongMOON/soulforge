import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ReadableStream } from "node:stream/web";
import { collectClaudeOauthUsage, CLAUDE_OAUTH_USAGE_GATE_SCHEMA, CLAUDE_OAUTH_USAGE_URL } from "./claude-oauth-usage-collector.mjs";

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

test("collector is disabled by default and never requests or reads credentials", async () => {
  let calls = 0;
  const result = await collectClaudeOauthUsage({ gatePath: GATE_PATH, receiptPath: RECEIPT_PATH, read: async () => { calls += 1; throw new Error("missing"); }, fetchImpl: async () => { throw new Error("must-not-run"); } });
  assert.deepEqual(result, { status: "gate_disabled" });
  assert.equal(calls, 1);
});

test("collector sanitizes 5h weekly and Fable without returning secret or raw response", async () => {
  let captured;
  const result = await collectClaudeOauthUsage({ gatePath: GATE_PATH, receiptPath: RECEIPT_PATH, read: async (filePath) => reader(filePath), fetchImpl: async (_url, init) => { assert.match(init.headers.Authorization, /^Bearer /u); return response(payload); }, now: () => Date.parse("2026-08-10T10:00:00.000Z"), store: { persistAcceptedSnapshot: async (snapshot) => { captured = snapshot; return { write_state: "written" }; } } });
  assert.deepEqual(result, { status: "written" });
  assert.deepEqual(captured.limits.map((row) => [row.limit_id, row.percentage]), [["claude_five_hour", 12], ["claude_weekly", 34], ["claude_fable_weekly", 56]]);
  assert.doesNotMatch(JSON.stringify({ result, captured }), /synthetic-secret|weekly_scoped/u);
});

test("auth, redirects, malformed, oversized, timeout, and future data fail closed with fixed codes", async () => {
  const common = { gatePath: GATE_PATH, receiptPath: RECEIPT_PATH, read: async (filePath) => reader(filePath), now: () => Date.parse("2026-08-10T10:00:00.000Z") };
  for (const fetchImpl of [
    async () => response(payload, { status: 401 }),
    async () => response(payload, { redirected: true }),
    async () => response({ nope: true }),
    async () => response(payload, { headers: new Headers({ "content-type": "application/json", "content-length": "999999" }) }),
  ]) assert.deepEqual(await collectClaudeOauthUsage({ ...common, fetchImpl }), { status: "response_invalid" });
  assert.deepEqual(await collectClaudeOauthUsage({ ...common, fetchImpl: async () => { throw new Error("secret raw url"); } }), { status: "request_failed" });
  assert.deepEqual(await collectClaudeOauthUsage({ ...common, fetchImpl: async () => response({ ...payload, five_hour: { ...payload.five_hour, resets_at: "2099-01-01T00:00:00.000Z" } }) }), { status: "response_invalid" });
});
