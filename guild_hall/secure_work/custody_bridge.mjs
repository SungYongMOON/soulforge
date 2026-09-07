// Only the existing ingress client owns the transport. This bridge binds its
// replies and every byte-sending boundary to the approved candidate snapshot.
import { createHash } from "node:crypto";
import { mkdtemp, open, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IngressClient } from "../../ui-workspace/apps/dev-erp-mcp/src/ingress_client.mjs";
import { loadCustodyAuthority } from "./custody_authority.mjs";
import CUSTODY_RUNTIME_BINDING from "./custody_runtime_binding.json" with { type: "json" };

const MAX_BYTES = 1048576;
const MAX_REPLY = 32768;
const FIELDS = ["submission_id", "lane", "project_hint", "status", "sha256", "size",
  "official_history_written", "source_deleted"].sort();
function fail() { throw new Error("CUSTODY_BRIDGE_DENIED"); }
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function checkedStatus(value, binding, submissionId = null) {
  if (!value || Array.isArray(value) || JSON.stringify(value).length > MAX_REPLY
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(FIELDS)
    || !/^sfigsub_[a-f0-9]{32}$/.test(value.submission_id)
    || (submissionId && value.submission_id !== submissionId)
    || value.project_hint !== binding.project_hint || value.lane !== "team_files"
    || value.sha256 !== binding.sha256 || value.size !== binding.size
    || !["pending_server_ack", "verified_server_ack"].includes(value.status)
    || value.official_history_written !== false || value.source_deleted !== false) fail();
  return value;
}

export async function runCustody(request, { token, fetchImpl = globalThis.fetch, authorize = null } = {}) {
  // Only a separately supplied verifier may authorize this module. JSON fields
  // are not an authority source. The CLI builds its callback only through the
  // independently pinned installation loader; a missing binding denies use.
  if (typeof authorize !== "function") fail();
  request = structuredClone(request);
  const b = request?.binding;
  if (!["upload", "status"].includes(request?.action) || !b
    || !/^[a-f0-9]{64}$/.test(b.sha256) || !Number.isSafeInteger(b.size)
    || b.size < 1 || b.size > MAX_BYTES || typeof b.input_revision !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(b.input_revision)
    || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(b.project_hint)
    || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(b.occurrence_id)
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(b.idempotency_key)
    || typeof request.ingress_url !== "string" || digest(request.ingress_url) !== b.route_sha256) fail();
  const origin = new URL(request.ingress_url).origin;
  // There is no localhost/control-port fallback: the approved route is exact.
  let calls = 0;
  let principalExpiresAt = 0;
  const deadline = Date.now() + 45000;
  function current() {
    if (Date.now() >= deadline || !Number.isFinite(request.authorization_expires_at)
      || Date.now() >= request.authorization_expires_at * 1000
      || authorize(structuredClone(request)) !== true) fail();
    // A real verifier can take time. Expiry still applies after it returns.
    if (Date.now() >= deadline || Date.now() >= request.authorization_expires_at * 1000
      || (principalExpiresAt && Date.now() >= principalExpiresAt)) fail();
  }
  let client;
  let source;
  async function principal() {
    current();
    const actual = await client.whoami();
    if (!actual || ["account_id", "device_id", "agent_id"].some((key) =>
      typeof request.principal?.[key] !== "string" || actual[key] !== request.principal[key])
      || !Array.isArray(actual.project_scopes) || !actual.project_scopes.includes(b.project_hint)
      || !Array.isArray(actual.capabilities)
      || !["upload:team_files", "receipt:read"].every((cap) => actual.capabilities.includes(cap))
      || !Number.isFinite(Date.parse(actual.expires_at)) || Date.parse(actual.expires_at) <= Date.now()) fail();
    principalExpiresAt = Date.parse(actual.expires_at);
  }
  async function boundedFetch(url, options = {}) {
    current();
    if (++calls > 128 || new URL(url).origin !== origin) fail();
    const target = new URL(url);
    // This port is request/response only. The SDK's optional SSE listener is
    // deliberately disabled; it cannot outlive the bounded submission call.
    if (options.method === "GET" && target.pathname.endsWith("/mcp")) {
      return new Response(null, { status: 405 });
    }
    if (/^\/ingress\/uploads\//.test(target.pathname)) {
      await principal(); // real /mcp authenticates anew for every request
      current();
      if (options.method === "PUT") {
        const offset = Number(target.searchParams.get("offset"));
        if (!Number.isSafeInteger(offset) || offset < 0 || !Buffer.isBuffer(options.body)
          || !source || options.body.length < 1 || offset + options.body.length > source.length
          || !options.body.equals(source.subarray(offset, offset + options.body.length))) fail();
      }
    }
    const response = await fetchImpl(url, { ...options, redirect: "error",
      signal: AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - Date.now()))) });
    if (response.status === 204) return response;
    const reader = response.body?.getReader();
    if (!reader) fail();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_REPLY) fail();
        chunks.push(Buffer.from(part.value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
  }
  client = new IngressClient({ baseUrl: request.ingress_url, token, fetchImpl: boundedFetch, timeoutMs: 10000 });
  let directory;
  let snapshot;
  let finalResult;
  async function currentStatus(submissionId) {
    const result = checkedStatus(await client.submissionStatus(submissionId), b, submissionId);
    // Status is untrusted until schema binding AND post-response authority pass.
    await principal();
    current();
    finalResult = result;
    return result;
  }
  try {
    await principal();
    if (request.action === "status") {
      if (!/^sfigsub_[a-f0-9]{32}$/.test(request.submission_id)) fail();
      return await currentStatus(request.submission_id);
    }
    const input = await open(request.candidate_path, "r");
    try {
      const info = await input.stat();
      if (!info.isFile() || info.size !== b.size) fail();
      source = Buffer.alloc(b.size + 1);
      const { bytesRead } = await input.read(source, 0, source.length, 0);
      if (bytesRead !== b.size) fail();
      source = source.subarray(0, bytesRead);
      if (digest(source) !== b.sha256) fail();
    } finally { await input.close(); }
    directory = await mkdtemp(resolve(tmpdir(), "secure-work-custody-"));
    snapshot = resolve(directory, "candidate.md");
    const output = await open(snapshot, "wx", 0o600);
    try { await output.writeFile(source); await output.sync(); } finally { await output.close(); }
    await principal();
    const result = checkedStatus(await client.uploadFile({ path: snapshot, projectHint: b.project_hint,
      occurrenceId: `sw_${digest(JSON.stringify([b.occurrence_id, b.project_hint, b.input_revision])).slice(0, 32)}`,
      idempotencyKey: b.idempotency_key, mediaType: "text/markdown" }), b);
    // Bind a separately read per-submission result, not just finalize success.
    await principal();
    return await currentStatus(result.submission_id);
  } finally {
    await client.close().catch(() => {});
    if (snapshot) await unlink(snapshot).catch(() => {});
    if (directory) await rmdir(directory).catch(() => {});
    // Cleanup also awaits work; do not expose an ACK if authority expired or
    // was revoked while it ran. This does not undo the already-sent request.
    if (finalResult) current();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > MAX_REPLY) fail();
      chunks.push(chunk);
    }
    const request = JSON.parse(Buffer.concat(chunks));
    // The immutable runtime binding comes from installation-owned code, never
    // request/env/argv. The sender independently rechecks OS and policy state.
    const authority = loadCustodyAuthority(CUSTODY_RUNTIME_BINDING);
    const proof = authority.authorize(request.binding);
    const result = request.operation === "authorize"
      ? { binding_sha256: proof.binding_sha256, ...proof.principal, expires_at: proof.expires_at }
      : await runCustody({ ...request, principal: proof.principal, authorization_expires_at: proof.expires_at },
        { token: authority.token(request.binding), authorize: value => authority.authorizeRequest(value) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('{"code":"CUSTODY_BRIDGE_DENIED"}\n');
    process.exitCode = 1;
  }
}
