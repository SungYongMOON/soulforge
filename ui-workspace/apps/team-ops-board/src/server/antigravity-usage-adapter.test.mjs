import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ANTIGRAVITY_USAGE_SNAPSHOT_PATH,
  createAntigravityUsageAdapterPlugin,
} from "./antigravity-usage-adapter.mjs";

// --- proxy-passage marker guard (Level 2 review finding M1/M8) ----------------
// Mirrors the reference case on the ERP pending-review and Agent Runtime
// adapters. The rule itself lives in loopback-caller-guard.mjs; this case pins
// that this endpoint applies it, and applies it before its method check.
const PROXY_MARKER_HEADER_NAMES = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "forwarded", "tailscale-user-login"];

function captureGuardMiddleware(plugin, surface) {
  let middleware;
  plugin[surface]({ middlewares: { use(handler) { middleware = handler; } } });
  return middleware;
}

function invokeGuard(middleware, request) {
  return new Promise((resolve) => {
    const response = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      end(body = "") { resolve({ statusCode: this.statusCode, headers: this.headers, body }); },
    };
    middleware(request, response, () => resolve({ next: true }));
  });
}

async function assertRejectsProxiedCallers(plugin, loopbackRequest) {
  for (const surface of ["configureServer", "configurePreviewServer"]) {
    const middleware = captureGuardMiddleware(plugin, surface);
    for (const header of PROXY_MARKER_HEADER_NAMES) {
      const proxied = await invokeGuard(middleware, loopbackRequest({ headers: { [header]: "anything" } }));
      assert.equal(proxied.statusCode, 403, `${surface}: ${header}`);
      assert.equal(proxied.body, "", `${surface}: ${header} carries no body`);
      assert.deepEqual(proxied.headers, {}, `${surface}: ${header} sets no response header`);
      // Same header plus a non-GET verb still reports 403, not 405: loopback/proxy
      // trust is checked before the method (M8).
      const proxiedPost = await invokeGuard(middleware, loopbackRequest({ method: "POST", headers: { [header]: "anything" } }));
      assert.equal(proxiedPost.statusCode, 403, `${surface}: ${header} + POST`);
    }
    // A remote socket with a non-GET verb is likewise 403 first, not 405 (M8).
    const remotePost = await invokeGuard(middleware, loopbackRequest({ method: "POST", socket: { remoteAddress: "100.64.0.9" } }));
    assert.equal(remotePost.statusCode, 403, surface);
    // A plain loopback caller with no marker passes the guard and reaches the
    // method check, and a request without any headers bag is not mistaken for a
    // proxy hop.
    const plainPost = await invokeGuard(middleware, loopbackRequest({ method: "POST" }));
    assert.equal(plainPost.statusCode, 405, surface);
    assert.equal(plainPost.headers.Allow, "GET", surface);
    assert.equal((await invokeGuard(middleware, loopbackRequest({ method: "POST", headers: undefined }))).statusCode, 405, surface);
  }
}

test("a request carrying a proxy-passage header is rejected 403 even from a loopback socket, before the method check (M1/M8)", async () => {
  // A state.vscdb path that does not exist: the reader fails closed to null and
  // the test never opens the Owner's real IDE database.
  const plugin = createAntigravityUsageAdapterPlugin({
    dbPath: join(tmpdir(), "team-ops-antigravity-usage-guard-missing", "state.vscdb"),
  });
  const loopbackRequest = (overrides = {}) => ({
    method: "GET",
    url: ANTIGRAVITY_USAGE_SNAPSHOT_PATH,
    socket: { remoteAddress: "127.0.0.1" },
    headers: {},
    ...overrides,
  });
  await assertRejectsProxiedCallers(plugin, loopbackRequest);

  // A plain loopback GET still reaches the reader and is answered 200 (null:
  // the synthetic database does not exist).
  const middleware = captureGuardMiddleware(plugin, "configureServer");
  const served = await invokeGuard(middleware, loopbackRequest());
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers["Cache-Control"], "no-store");
  assert.equal(JSON.parse(served.body), null);
  assert.equal((await invokeGuard(middleware, loopbackRequest({ headers: undefined }))).statusCode, 200);
});
