import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ERP_PENDING_REVIEWS_SNAPSHOT_PATH,
  ERP_REVIEW_DEFAULT_LINK,
  ERP_REVIEW_PROXIED_REQUEST_REJECTED,
  ERP_REVIEW_TOKEN_FILE_ENV,
  ERP_REVIEW_URL_ENV,
  createErpPendingReviewAdapterPlugin,
  createErpPendingReviewAdapterPluginFromEnvironment,
  holdProjection,
} from "./erp-pending-review-adapter.mjs";

const SYNTHETIC_TOKEN = "sfmcp_v1_SYNTHETIC-TOKEN-NOT-A-SECRET_0123456789abcdef";
const PROXY_MARKER_HEADER_NAMES = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "forwarded", "tailscale-user-login"];

function captureMiddleware(plugin, surface = "configureServer") {
  let middleware;
  plugin[surface]({ middlewares: { use(handler) { middleware = handler; } } });
  return middleware;
}

function invoke(middleware, request) {
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

function loopbackRequest(overrides = {}) {
  return {
    method: "GET",
    url: `${ERP_PENDING_REVIEWS_SNAPSHOT_PATH}?read_only=1`,
    socket: { remoteAddress: "127.0.0.1" },
    headers: {},
    ...overrides,
  };
}

// The shape the loopback transport hands the adapter internally (per-row,
// identifying). None of this may survive into what the adapter writes to the
// HTTP response; see the "honest counts" test below.
function pendingResult() {
  return {
    days: 14,
    limit: 50,
    proposals: [{ proposal_id: "prop_1", kind: "completion_digest", at: "2026-09-05T01:00:00.000Z", source: "erp_mcp_work_session", item_ref: "itm_1", project_ref: "P26-SYN" }],
    work_sessions: [
      { work_session_id: "ws_1", item_id: "itm_1", project_id: "P26-SYN", username: "pilot-member", created_at: "2026-09-05T01:05:00.000Z", artifact_count: 1, item_status: "open" },
      { work_session_id: "ws_2", item_id: "itm_2", project_id: "P26-SYN", username: "owner", created_at: "2026-09-04T01:05:00.000Z", artifact_count: 0, item_status: "done" },
      { work_session_id: "ws_3", item_id: "itm_3", project_id: null, username: null, created_at: "2026-09-03T01:05:00.000Z", artifact_count: 0, item_status: null },
    ],
  };
}

test("the unconfigured endpoint is link-only: a fixed HOLD with the safe ERP link and no data", async () => {
  const middleware = captureMiddleware(createErpPendingReviewAdapterPlugin());
  const result = await invoke(middleware, loopbackRequest());
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.headers, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  assert.deepEqual(JSON.parse(result.body), {
    schema_version: "soulforge.erp_pending_review_read_projection.v1",
    read_only: 1,
    refresh_state: "hold",
    observed_at: null,
    erp_link: { url: "http://127.0.0.1:4300/?view=mod:reviews", mode: "link_only" },
    counts: { proposals_pending: 0, work_sessions_recent: 0, work_sessions_unaccepted: 0, work_sessions_status_unknown: 0, pending_total: 0 },
    hold_code: "ERP_REVIEW_UNCONFIGURED",
  });
  assert.equal(ERP_REVIEW_DEFAULT_LINK, "http://127.0.0.1:4300/?view=mod:reviews");
  assert.equal(holdProjection("NOT_A_KNOWN_CODE").hold_code, "ERP_REVIEW_RESPONSE_MALFORMED");
});

test("the endpoint allows only loopback GET with the exact read_only query on dev and preview", async () => {
  const plugin = createErpPendingReviewAdapterPlugin();
  for (const surface of ["configureServer", "configurePreviewServer"]) {
    const middleware = captureMiddleware(plugin, surface);
    const method = await invoke(middleware, loopbackRequest({ method: "POST" }));
    assert.equal(method.statusCode, 405, surface);
    assert.equal(method.headers.Allow, "GET", surface);
    const remote = await invoke(middleware, loopbackRequest({ socket: { remoteAddress: "100.64.0.9" } }));
    assert.equal(remote.statusCode, 403, surface);
    for (const url of [
      ERP_PENDING_REVIEWS_SNAPSHOT_PATH,
      `${ERP_PENDING_REVIEWS_SNAPSHOT_PATH}?read_only=0`,
      `${ERP_PENDING_REVIEWS_SNAPSHOT_PATH}?read_only=1&refresh=1`,
    ]) {
      assert.equal((await invoke(middleware, loopbackRequest({ url }))).statusCode, 400, `${surface}: ${url}`);
    }
    assert.equal((await invoke(middleware, loopbackRequest({ socket: { remoteAddress: "::1" } }))).statusCode, 200, surface);
    assert.deepEqual(await invoke(middleware, loopbackRequest({ url: "/other.json" })), { next: true }, surface);
  }
});

test("a request carrying a proxy-passage header is rejected 403 even from a loopback socket, before the method check (M1/M8)", async () => {
  const plugin = createErpPendingReviewAdapterPlugin();
  for (const surface of ["configureServer", "configurePreviewServer"]) {
    const middleware = captureMiddleware(plugin, surface);
    for (const header of PROXY_MARKER_HEADER_NAMES) {
      const proxied = await invoke(middleware, loopbackRequest({ headers: { [header]: "anything" } }));
      assert.equal(proxied.statusCode, 403, `${surface}: ${header}`);
      assert.equal(proxied.body, "", `${surface}: ${header} carries no body`);
      // Same header plus a non-GET verb still reports 403, not 405: loopback/proxy
      // trust is checked before the method (M8).
      const proxiedPost = await invoke(middleware, loopbackRequest({ method: "POST", headers: { [header]: "anything" } }));
      assert.equal(proxiedPost.statusCode, 403, `${surface}: ${header} + POST`);
    }
    // A plain loopback GET with no proxy marker header still works.
    assert.equal((await invoke(middleware, loopbackRequest({ headers: {} }))).statusCode, 200, surface);
  }
  assert.equal(ERP_REVIEW_PROXIED_REQUEST_REJECTED, "ERP_REVIEW_PROXIED_REQUEST_REJECTED");
});

test("a configured reader produces the ready projection with honest counts, and only counts, and caches within the window", async () => {
  let clock = 1_000_000;
  let reads = 0;
  let credentialLoads = 0;
  const middleware = captureMiddleware(createErpPendingReviewAdapterPlugin({
    readPending: async (token) => {
      reads += 1;
      assert.equal(token, SYNTHETIC_TOKEN);
      return pendingResult();
    },
    loadCredential: async () => {
      credentialLoads += 1;
      return { state: "ready", hold_code: null, token: SYNTHETIC_TOKEN };
    },
    link: "http://127.0.0.1:43100/?view=mod:reviews",
    minRefreshMs: 60_000,
    now: () => clock,
  }));

  const first = JSON.parse((await invoke(middleware, loopbackRequest())).body);
  assert.equal(first.refresh_state, "ready");
  assert.equal(first.observed_at, new Date(1_000_000).toISOString());
  assert.deepEqual(first.erp_link, { url: "http://127.0.0.1:43100/?view=mod:reviews", mode: "read_and_link" });
  assert.deepEqual(first.counts, {
    proposals_pending: 1,
    work_sessions_recent: 3,
    work_sessions_unaccepted: 1,
    work_sessions_status_unknown: 1,
    pending_total: 2,
  });
  assert.equal(first.hold_code, null);
  // Board projection (M1): counts and status distribution only. No per-row
  // array, no username, no item/project/proposal/work-session id.
  assert.deepEqual(Object.keys(first).sort(), ["counts", "erp_link", "hold_code", "observed_at", "read_only", "refresh_state", "schema_version"]);
  const serialized = JSON.stringify(first);
  for (const forbidden of ["prop_1", "ws_1", "ws_2", "ws_3", "itm_1", "itm_2", "itm_3", "P26-SYN", "pilot-member", "owner", "username", "item_id", "project_id", "proposal_id", "work_session_id", SYNTHETIC_TOKEN]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }

  clock += 30_000;
  await invoke(middleware, loopbackRequest());
  assert.equal(reads, 1, "second request inside the window is served from cache");
  assert.equal(credentialLoads, 1);

  clock += 31_000;
  await invoke(middleware, loopbackRequest());
  assert.equal(reads, 2, "the credential file and ERP are re-read after the window");
  assert.equal(credentialLoads, 2);
});

test("credential holds and transport errors become fixed HOLD codes that keep the link and hide the reason text", async () => {
  const marker = "PRIVATE-DETAIL-MARKER";
  let clock = 0;
  const credential = { value: { state: "hold", hold_code: "ERP_REVIEW_CREDENTIAL_MISSING", token: null } };
  const upstream = { fail: null };
  const middleware = captureMiddleware(createErpPendingReviewAdapterPlugin({
    readPending: async () => {
      if (upstream.fail) throw Object.assign(new Error(marker), { code: upstream.fail });
      return pendingResult();
    },
    loadCredential: async () => credential.value,
    minRefreshMs: 0,
    now: () => { clock += 1; return clock; },
  }));

  const missing = JSON.parse((await invoke(middleware, loopbackRequest())).body);
  assert.equal(missing.refresh_state, "hold");
  assert.equal(missing.hold_code, "ERP_REVIEW_CREDENTIAL_MISSING");
  assert.equal(missing.erp_link.url, ERP_REVIEW_DEFAULT_LINK);

  credential.value = { state: "ready", hold_code: null, token: SYNTHETIC_TOKEN };
  for (const code of ["ERP_REVIEW_UNAUTHORIZED", "ERP_REVIEW_ROUTE_DISABLED", "ERP_REVIEW_DISCONNECTED", "ERP_REVIEW_TIMEOUT", "ERP_REVIEW_RESPONSE_OVERSIZE"]) {
    upstream.fail = code;
    const held = await invoke(middleware, loopbackRequest());
    const body = JSON.parse(held.body);
    assert.equal(body.hold_code, code);
    assert.equal(body.refresh_state, "hold");
    assert.equal(held.body.includes(marker), false);
  }
  upstream.fail = "SOMETHING_ELSE";
  assert.equal(JSON.parse((await invoke(middleware, loopbackRequest())).body).hold_code, "ERP_REVIEW_RESPONSE_MALFORMED");
  upstream.fail = null;
  assert.equal(JSON.parse((await invoke(middleware, loopbackRequest())).body).refresh_state, "ready");
});

test("environment wiring: absent token file is link-only, invalid URL or path is named, valid pair reads through the transport", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "erp-review-adapter-"));
  try {
    const tokenFile = path.join(root, "erp_review_token.txt");
    const unconfigured = JSON.parse((await invoke(captureMiddleware(
      await createErpPendingReviewAdapterPluginFromEnvironment({ env: {} }),
    ), loopbackRequest())).body);
    assert.equal(unconfigured.hold_code, "ERP_REVIEW_UNCONFIGURED");
    assert.equal(unconfigured.erp_link.url, ERP_REVIEW_DEFAULT_LINK);

    const badUrl = JSON.parse((await invoke(captureMiddleware(
      await createErpPendingReviewAdapterPluginFromEnvironment({ env: { [ERP_REVIEW_URL_ENV]: "http://100.64.0.1:4300/api/mcp/reviews/pending", [ERP_REVIEW_TOKEN_FILE_ENV]: tokenFile } }),
    ), loopbackRequest())).body);
    assert.equal(badUrl.hold_code, "ERP_REVIEW_URL_INVALID");
    assert.equal(badUrl.erp_link.url, ERP_REVIEW_DEFAULT_LINK);

    const badPath = JSON.parse((await invoke(captureMiddleware(
      await createErpPendingReviewAdapterPluginFromEnvironment({ env: { [ERP_REVIEW_TOKEN_FILE_ENV]: "relative/token.txt" } }),
    ), loopbackRequest())).body);
    assert.equal(badPath.hold_code, "ERP_REVIEW_CREDENTIAL_PATH_INVALID");

    const requests = [];
    const plugin = await createErpPendingReviewAdapterPluginFromEnvironment({
      env: { [ERP_REVIEW_URL_ENV]: "http://127.0.0.1:43100/api/mcp/reviews/pending", [ERP_REVIEW_TOKEN_FILE_ENV]: tokenFile },
      httpGet: async (options) => {
        requests.push(options);
        return {
          statusCode: 200,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          body: Buffer.from(JSON.stringify({ days: 14, limit: 50, proposals: [], work_sessions: [] }), "utf8"),
        };
      },
      minRefreshMs: 0,
    });
    const middleware = captureMiddleware(plugin);
    const beforeFile = JSON.parse((await invoke(middleware, loopbackRequest())).body);
    assert.equal(beforeFile.hold_code, "ERP_REVIEW_CREDENTIAL_MISSING");
    assert.equal(beforeFile.erp_link.url, "http://127.0.0.1:43100/?view=mod:reviews");
    assert.equal(requests.length, 0, "no upstream request without a credential");

    await writeFile(tokenFile, `${SYNTHETIC_TOKEN}\n`, "utf8");
    const ready = JSON.parse((await invoke(middleware, loopbackRequest())).body);
    assert.equal(ready.refresh_state, "ready");
    assert.equal(ready.erp_link.mode, "read_and_link");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers.Authorization, `Bearer ${SYNTHETIC_TOKEN}`);
    assert.equal(requests[0].port, 43100);
    assert.equal(JSON.stringify(ready).includes(SYNTHETIC_TOKEN), false);
    assert.equal(JSON.stringify(ready).includes(tokenFile), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
