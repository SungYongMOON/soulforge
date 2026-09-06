import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROXY_PASSAGE_MARKER_HEADERS,
  hasProxyPassageMarker,
  isDirectLoopbackRequest,
  isLoopbackAddress,
} from "./loopback-request-guard.mjs";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const GUARD_MODULE = "loopback-request-guard.mjs";
const LOOPBACK_ADDRESSES = Object.freeze(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
// The 2026-09-06 live reproduction: a tailnet peer behind Tailscale Serve lands
// on 127.0.0.1 with exactly these headers left behind.
const MARKER_SAMPLES = Object.freeze({
  "x-forwarded-for": "100.64.0.9",
  "x-forwarded-host": "evil.ts.net",
  "x-forwarded-proto": "https",
  "forwarded": "for=100.64.0.9;host=evil.ts.net;proto=https",
  "tailscale-user-login": "peer@example.invalid",
});
const SURFACES = Object.freeze(["configureServer", "configurePreviewServer"]);

// One row per middleware-registering adapter in this directory. The
// completeness test below fails when a module registers a middleware but has
// no row here, so a future adapter cannot skip the shared guard silently.
// `guardBeforeMethod` pins the existing order of the trust and method checks
// (only the ERP adapter checks trust first, per its review finding M8); this
// slice must not change any adapter's GET-only handling.
const ADAPTER_TABLE = Object.freeze([
  { module: "agent-runtime-snapshot-adapter.mjs", factory: "createAgentRuntimeSnapshotAdapterPlugin", url: "/agent-runtime.snapshot.json?read_only=1" },
  { module: "ai-usage-adapter.mjs", factory: "createAiUsageAdapterPlugin", url: "/ai-usage-meter.snapshot.json?read_only=1" },
  { module: "antigravity-quota-adapter.mjs", factory: "createAntigravityQuotaAdapterPlugin", url: "/antigravity-quota.snapshot.json" },
  { module: "antigravity-usage-adapter.mjs", factory: "createAntigravityUsageAdapterPlugin", url: "/antigravity-usage.snapshot.json" },
  { module: "claude-usage-adapter.mjs", factory: "createClaudeUsageAdapterPlugin", url: "/claude-usage.snapshot.json" },
  { module: "codex-retention-adapter.mjs", factory: "createCodexRetentionServerAdapter", url: "/codex-retention.snapshot.json" },
  { module: "erp-pending-review-adapter.mjs", factory: "createErpPendingReviewAdapterPlugin", url: "/erp-pending-reviews.snapshot.json?read_only=1", guardBeforeMethod: true },
  { module: "host-stats-adapter.mjs", factory: "createHostStatsAdapterPlugin", url: "/host-stats.snapshot.json" },
  { module: "live-thread-adapter.mjs", factory: "createLiveThreadAdapterPlugin", url: "/codex-threads.snapshot.json" },
  { module: "provider-limits-adapter.mjs", factory: "createProviderLimitsAdapterPlugin", url: "/provider-limits.snapshot.json" },
  { module: "receipt-expiry-adapter.mjs", factory: "createReceiptExpiryServerAdapter", url: "/receipt-expiry.snapshot.json" },
  { module: "scheduled-tasks-adapter.mjs", factory: "createScheduledTasksAdapterPlugin", url: "/scheduled-tasks.snapshot.json" },
  { module: "secure-work-status-adapter.mjs", factory: "createSecureWorkStatusAdapterPlugin", url: "/secure-work.snapshot.json" },
  { module: "storage-map-adapter.mjs", factory: "createStorageMapServerAdapter", url: "/storage-map.snapshot.json" },
  { module: "tongs-heartbeat-adapter.mjs", factory: "createTongsHeartbeatAdapterPlugin", url: "/tongs.snapshot.json" },
  { module: "topology-adapter.mjs", factory: "createTopologyAdapterPlugin", url: "/topology-health.snapshot.json" },
  { module: "topology-federation-adapter.mjs", factory: "createTopologyFederationAdapterPlugin", url: "/topology-federation.snapshot.json" },
  { module: "topology-recovery-adapter.mjs", factory: "createTopologyRecoveryAdapterPlugin", url: "/topology-recovery.snapshot.json" },
]);

function captureMiddleware(plugin, surface) {
  let middleware;
  plugin[surface]({ middlewares: { use(handler) { middleware = handler; } } });
  assert.equal(typeof middleware, "function", `${plugin.name}.${surface} registers one middleware`);
  return middleware;
}

// Every path exercised here is answered before the adapter reads anything
// (403, 405, or next()), so no host state is touched by this test.
function invoke(middleware, request) {
  return new Promise((resolve) => {
    const response = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      end(body = "") { resolve({ statusCode: this.statusCode, body, next: false }); },
    };
    middleware(request, response, () => resolve({ statusCode: null, body: null, next: true }));
  });
}

function request({ url, method = "GET", remoteAddress = "127.0.0.1", headers = {} }) {
  return { method, url, socket: { remoteAddress }, headers };
}

test("isLoopbackAddress accepts exactly the three loopback spellings", () => {
  for (const address of LOOPBACK_ADDRESSES) assert.equal(isLoopbackAddress(address), true, address);
  for (const address of ["127.0.0.2", "::ffff:127.0.0.2", "localhost", "0.0.0.0", "100.64.0.9", "100.127.218.85", "", undefined, null, 127]) {
    assert.equal(isLoopbackAddress(address), false, String(address));
  }
});

test("hasProxyPassageMarker fires on any marker header, even with an empty value, and on nothing else", () => {
  assert.deepEqual([...PROXY_PASSAGE_MARKER_HEADERS], Object.keys(MARKER_SAMPLES));
  for (const [name, value] of Object.entries(MARKER_SAMPLES)) {
    assert.equal(hasProxyPassageMarker({ [name]: value }), true, name);
    assert.equal(hasProxyPassageMarker({ [name]: "" }), true, `${name} (empty value)`);
    assert.equal(hasProxyPassageMarker({ host: "127.0.0.1:4192", "user-agent": "curl/8", [name]: value }), true, `${name} among others`);
  }
  assert.equal(hasProxyPassageMarker({}), false);
  assert.equal(hasProxyPassageMarker({ host: "127.0.0.1:4192", "user-agent": "curl/8", accept: "*/*" }), false);
  assert.equal(hasProxyPassageMarker(undefined), false);
  assert.equal(hasProxyPassageMarker(null), false);
  assert.equal(hasProxyPassageMarker("x-forwarded-for"), false);
});

test("isDirectLoopbackRequest requires a loopback socket and no marker, failing closed on a missing socket", () => {
  for (const remoteAddress of LOOPBACK_ADDRESSES) {
    assert.equal(isDirectLoopbackRequest(request({ url: "/", remoteAddress })), true, remoteAddress);
    assert.equal(isDirectLoopbackRequest({ socket: { remoteAddress } }), true, `${remoteAddress} without a headers object`);
    for (const [name, value] of Object.entries(MARKER_SAMPLES)) {
      assert.equal(isDirectLoopbackRequest(request({ url: "/", remoteAddress, headers: { [name]: value } })), false, `${remoteAddress} + ${name}`);
    }
  }
  assert.equal(isDirectLoopbackRequest(request({ url: "/", remoteAddress: "100.64.0.9" })), false);
  assert.equal(isDirectLoopbackRequest({ headers: {} }), false, "no socket");
  assert.equal(isDirectLoopbackRequest({}), false);
  assert.equal(isDirectLoopbackRequest(undefined), false);
});

test("every middleware-registering module in src/server is in the adapter table and consumes the shared guard", () => {
  const registering = readdirSync(SERVER_DIR)
    .filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs") && name !== GUARD_MODULE)
    .filter((name) => readFileSync(path.join(SERVER_DIR, name), "utf8").includes("middlewares.use("))
    .sort();
  const tabled = ADAPTER_TABLE.map((row) => row.module).sort();
  assert.deepEqual(
    registering,
    tabled,
    "a module that registers a middleware must have a row in ADAPTER_TABLE (and every row must exist)",
  );
  for (const name of registering) {
    const source = readFileSync(path.join(SERVER_DIR, name), "utf8");
    assert.ok(source.includes(`from "./${GUARD_MODULE}"`), `${name} imports the shared guard`);
    assert.doesNotMatch(source, /function isLoopbackAddress\b/u, `${name} keeps no private loopback predicate`);
    assert.doesNotMatch(source, /x-forwarded-/iu, `${name} keeps no private proxy-marker list`);
  }
});

for (const row of ADAPTER_TABLE) {
  test(`${row.module} refuses a proxied request on every loopback address with 403 and no body`, async () => {
    const module = await import(`./${row.module}`);
    const factory = module[row.factory];
    assert.equal(typeof factory, "function", `${row.module} exports ${row.factory}`);
    const plugin = factory({});
    for (const surface of SURFACES) {
      const middleware = captureMiddleware(plugin, surface);
      const label = `${row.module}/${surface}`;

      // Table sanity: an unrelated path is passed through, and the row's own
      // path reaches the trust check (a remote socket is still refused).
      assert.equal((await invoke(middleware, request({ url: "/loopback-request-guard.unrelated" }))).next, true, `${label} unrelated path`);
      const remote = await invoke(middleware, request({ url: row.url, remoteAddress: "100.64.0.9" }));
      assert.deepEqual(remote, { statusCode: 403, body: "", next: false }, `${label} remote socket`);

      for (const remoteAddress of LOOPBACK_ADDRESSES) {
        for (const [name, value] of Object.entries(MARKER_SAMPLES)) {
          const proxied = await invoke(middleware, request({ url: row.url, remoteAddress, headers: { [name]: value } }));
          assert.deepEqual(proxied, { statusCode: 403, body: "", next: false }, `${label} ${remoteAddress} + ${name}`);
        }
        const allMarkers = await invoke(middleware, request({ url: row.url, remoteAddress, headers: { host: "127.0.0.1:4192", ...MARKER_SAMPLES } }));
        assert.deepEqual(allMarkers, { statusCode: 403, body: "", next: false }, `${label} ${remoteAddress} + every marker`);
      }

      // The trust/method order is unchanged by this slice: a proxied non-GET
      // still sees 405 where the method was checked first, and 403 where the
      // adapter already checked trust first.
      const proxiedPost = await invoke(middleware, request({ url: row.url, method: "POST", headers: { "x-forwarded-for": MARKER_SAMPLES["x-forwarded-for"] } }));
      assert.equal(proxiedPost.statusCode, row.guardBeforeMethod ? 403 : 405, `${label} proxied POST`);
      assert.equal(proxiedPost.next, false, `${label} proxied POST is not passed through`);
    }
  });
}
