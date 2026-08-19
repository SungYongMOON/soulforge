import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClaudeOauthUsageQuotaSnapshot } from "../core/provider-quota-snapshot.mjs";
import { createProviderQuotaAttemptLog } from "./provider-quota-attempt-log.mjs";
import { createProviderQuotaReceiptStore, PROVIDER_QUOTA_RECEIPT_FILE_NAME } from "./provider-quota-receipt-store.mjs";

export const CLAUDE_OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
export const CLAUDE_OAUTH_USAGE_GATE_SCHEMA = "soulforge.claude_oauth_usage_gate.v1";
export const MAX_CLAUDE_OAUTH_RESPONSE_BYTES = 64 * 1024;
export const CLAUDE_OAUTH_RATE_LIMIT_BACKOFF_MS = 30 * 60_000;
const SAFE_RESULTS = new Set(["written", "already_current", "retained_newer", "gate_disabled", "credential_unavailable", "request_failed", "auth_rejected", "rate_limited", "response_invalid", "receipt_failed"]);
// A rejected credential is a distinct, actionable Owner state: the collector is
// running and reachable, but the stored login no longer works. Collapsing it
// into response_invalid hid that difference and read as a transient parse fault.
const AUTH_REJECTED_STATUSES = new Set([401, 403]);

async function gateEnabled(gatePath, read = readFile) {
  try {
    const value = JSON.parse(await read(gatePath, "utf8"));
    return value?.schema_version === CLAUDE_OAUTH_USAGE_GATE_SCHEMA && value?.enabled === true && Object.keys(value).length === 2;
  } catch { return false; }
}

async function credentialToken(credentialsPath, read = readFile) {
  let parsed = null;
  try {
    parsed = JSON.parse(await read(credentialsPath, "utf8"));
    const token = parsed?.claudeAiOauth?.accessToken;
    return typeof token === "string" && token.length > 0 && token.length <= 16_384 ? token : null;
  } catch { return null; } finally { parsed = null; }
}

async function boundedJson(response) {
  if (response.status !== 200 || response.redirected || response.url !== CLAUDE_OAUTH_USAGE_URL) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:;|$)/iu.test(type)) return null;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CLAUDE_OAUTH_RESPONSE_BYTES) return null;
  const reader = response.body?.getReader?.();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CLAUDE_OAUTH_RESPONSE_BYTES) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks.map((value) => Buffer.from(value))).toString("utf8")); } catch { return null; }
}

export async function collectClaudeOauthUsage({ gatePath, receiptPath, credentialsPath = path.join(os.homedir(), ".claude", ".credentials.json"), fetchImpl = fetch, read = readFile, now = Date.now, store = null, attemptLog = null } = {}) {
  if (!path.isAbsolute(gatePath ?? "") || !path.isAbsolute(receiptPath ?? "") || path.basename(receiptPath) !== PROVIDER_QUOTA_RECEIPT_FILE_NAME) return { status: "gate_disabled" };
  if (!(await gateEnabled(gatePath, read))) return { status: "gate_disabled" };
  const log = attemptLog ?? createProviderQuotaAttemptLog({ receiptDirectory: path.dirname(receiptPath) });
  const nowMs = Number(now());
  const latestAttempt = typeof log?.readLatest === "function"
    ? await Promise.resolve(log.readLatest()).catch(() => null)
    : null;
  const latestAttemptMs = Date.parse(latestAttempt?.attempted_at ?? "");
  if (latestAttempt?.result === "rate_limited"
    && Number.isFinite(latestAttemptMs)
    && nowMs >= latestAttemptMs
    && nowMs - latestAttemptMs < CLAUDE_OAUTH_RATE_LIMIT_BACKOFF_MS) {
    return { status: "backoff_active" };
  }
  // Everything past the gate is a real attempt, so it leaves attempt evidence
  // whether it succeeds or fails. The accepted snapshot stays a separate file:
  // a last-good value must never be read as proof that collection still runs.
  const attemptedAt = new Date(nowMs).toISOString();
  const finish = async (status) => {
    await Promise.resolve(log.recordAttempt({ provider: "claude", attemptedAt, result: status })).catch(() => null);
    return { status };
  };
  let token = await credentialToken(credentialsPath, read);
  if (token === null) return finish("credential_unavailable");
  let response;
  try {
    response = await fetchImpl(CLAUDE_OAUTH_USAGE_URL, { method: "GET", redirect: "error", headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20", "User-Agent": "claude-code/2.1.0", Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  } catch { token = null; return finish("request_failed"); }
  token = null;
  if (AUTH_REJECTED_STATUSES.has(response.status)) {
    await response.body?.cancel?.().catch(() => {});
    return finish("auth_rejected");
  }
  if (response.status === 429) {
    await response.body?.cancel?.().catch(() => {});
    return finish("rate_limited");
  }
  const payload = await boundedJson(response).catch(() => null);
  if (payload === null) return finish("response_invalid");
  const referenceMs = nowMs;
  let snapshot;
  try { snapshot = createClaudeOauthUsageQuotaSnapshot(payload, { observedAt: new Date(referenceMs).toISOString(), nowMs: referenceMs }); } catch { snapshot = null; }
  if (snapshot === null) return finish("response_invalid");
  try {
    const receiptStore = store ?? createProviderQuotaReceiptStore({ receiptPath, now });
    const result = await receiptStore.persistAcceptedSnapshot(snapshot);
    return finish(SAFE_RESULTS.has(result.write_state) ? result.write_state : "receipt_failed");
  } catch { return finish("receipt_failed"); }
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => index % 2 === 0 ? [...rows, [value, all[index + 1]]] : rows, []));
  const result = await collectClaudeOauthUsage({ gatePath: args["--gate-path"], receiptPath: args["--receipt-path"] });
  process.stdout.write(JSON.stringify(result));
  process.exitCode = ["written", "already_current", "retained_newer", "gate_disabled", "backoff_active"].includes(result.status) ? 0 : 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) void main().catch(() => { process.stdout.write('{"status":"request_failed"}'); process.exitCode = 1; });
