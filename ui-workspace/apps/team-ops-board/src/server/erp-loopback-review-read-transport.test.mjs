import assert from "node:assert/strict";
import test from "node:test";

import {
  ERP_REVIEWS_PENDING_PATH,
  ERP_REVIEW_DEFAULT_URL,
  buildErpReviewLink,
  createErpLoopbackReviewReadTransport,
  validateErpReviewEnvelope,
} from "./erp-loopback-review-read-transport.mjs";

const SYNTHETIC_TOKEN = "sfmcp_v1_SYNTHETIC-TOKEN-NOT-A-SECRET_0123456789abcdef";
const RAW_SUMMARY = "RAW-SUMMARY-MUST-NOT-REACH-BOARD";
const RAW_TITLE = "RAW-TITLE-MUST-NOT-REACH-BOARD";

function proposal(overrides = {}) {
  return {
    id: "prop_synthetic_1",
    kind: "completion_digest",
    status: "pending",
    at: "2026-09-05T01:00:00.000Z",
    source: "erp_mcp_work_session",
    item_ref: "itm_synthetic_1",
    project_ref: "P26-SYN",
    ...overrides,
  };
}

function workSession(overrides = {}) {
  return {
    work_session_id: "mcp_ws_synthetic1",
    item_id: "itm_synthetic_1",
    project_id: "P26-SYN",
    username: "pilot-member",
    created_at: "2026-09-05T01:05:00.000Z",
    summary: RAW_SUMMARY,
    artifact_count: 2,
    item_status: "open",
    item_title: RAW_TITLE,
    ...overrides,
  };
}

function envelope(overrides = {}) {
  return { days: 14, limit: 50, proposals: [proposal()], work_sessions: [workSession()], ...overrides };
}

function response(body, overrides = {}) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8"),
    ...overrides,
  };
}

test("only an exact canonical loopback HTTP URL at the pending-reviews path is accepted", () => {
  const hostile = [
    "",
    " ",
    `https://127.0.0.1:4300${ERP_REVIEWS_PENDING_PATH}`,
    `http://localhost:4300${ERP_REVIEWS_PENDING_PATH}`,
    `http://127.0.0.2:4300${ERP_REVIEWS_PENDING_PATH}`,
    `http://user:secret@127.0.0.1:4300${ERP_REVIEWS_PENDING_PATH}`,
    `http://127.0.0.1:4300${ERP_REVIEWS_PENDING_PATH}?days=1`,
    `http://127.0.0.1:4300${ERP_REVIEWS_PENDING_PATH}#x`,
    `http://127.0.0.1${ERP_REVIEWS_PENDING_PATH}`,
    `http://127.0.0.1:80${ERP_REVIEWS_PENDING_PATH}`,
    "http://127.0.0.1:4300/api/mcp/work-sessions",
    "http://127.0.0.1:4300/",
    `http://100.64.0.1:4300${ERP_REVIEWS_PENDING_PATH}`,
  ];
  for (const url of hostile) {
    assert.throws(
      () => createErpLoopbackReviewReadTransport({ url }),
      (error) => error.code === "ERP_REVIEW_URL_INVALID",
      url,
    );
  }
  assert.doesNotThrow(() => createErpLoopbackReviewReadTransport({ url: ERP_REVIEW_DEFAULT_URL }));
  assert.doesNotThrow(() => createErpLoopbackReviewReadTransport({ url: `http://[::1]:4300${ERP_REVIEWS_PENDING_PATH}` }));
  assert.equal(buildErpReviewLink(ERP_REVIEW_DEFAULT_URL), "http://127.0.0.1:4300/?view=mod:reviews");
  assert.equal(buildErpReviewLink(`http://127.0.0.1:43100${ERP_REVIEWS_PENDING_PATH}`), "http://127.0.0.1:43100/?view=mod:reviews");
});

test("one bearer GET to the fixed path returns sanitized aggregate rows without summary or title", async () => {
  const requests = [];
  const transport = createErpLoopbackReviewReadTransport({
    url: ERP_REVIEW_DEFAULT_URL,
    httpGet: async (options) => {
      requests.push(options);
      return response(envelope());
    },
  });

  const result = await transport.read(SYNTHETIC_TOKEN);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].hostname, "127.0.0.1");
  assert.equal(requests[0].port, 4300);
  assert.equal(requests[0].path, `${ERP_REVIEWS_PENDING_PATH}?days=14&limit=50`);
  assert.equal(requests[0].headers.Authorization, `Bearer ${SYNTHETIC_TOKEN}`);
  assert.equal(requests[0].headers.Accept, "application/json");

  assert.deepEqual(result, {
    days: 14,
    limit: 50,
    proposals: [{
      proposal_id: "prop_synthetic_1",
      kind: "completion_digest",
      at: "2026-09-05T01:00:00.000Z",
      source: "erp_mcp_work_session",
      item_ref: "itm_synthetic_1",
      project_ref: "P26-SYN",
    }],
    work_sessions: [{
      work_session_id: "mcp_ws_synthetic1",
      item_id: "itm_synthetic_1",
      project_id: "P26-SYN",
      username: "pilot-member",
      created_at: "2026-09-05T01:05:00.000Z",
      artifact_count: 2,
      item_status: "open",
    }],
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(RAW_SUMMARY), false);
  assert.equal(serialized.includes(RAW_TITLE), false);
  assert.equal(serialized.includes(SYNTHETIC_TOKEN), false);
  assert.equal(transport.link, "http://127.0.0.1:4300/?view=mod:reviews");
});

test("an older ERP envelope without item_status/item_title is accepted with item_status null", () => {
  const legacyRow = workSession();
  delete legacyRow.item_status;
  delete legacyRow.item_title;
  const result = validateErpReviewEnvelope(envelope({ work_sessions: [legacyRow] }));
  assert.equal(result.work_sessions[0].item_status, null);
  assert.equal("summary" in result.work_sessions[0], false);
});

test("every non-exact envelope, extra field, or raw-bearing key fails closed as MALFORMED", () => {
  const control = String.fromCharCode(1);
  const hostile = [
    envelope({ extra: true }),
    envelope({ days: 0 }),
    envelope({ limit: 51 }),
    envelope({ proposals: [proposal({ status: "approved" })] }),
    envelope({ proposals: [proposal({ payload_json: "{}" })] }),
    envelope({ proposals: [proposal({ at: "not-a-date" })] }),
    envelope({ proposals: [proposal({ id: `x${control}` })] }),
    envelope({ work_sessions: [workSession({ item_status: "" })] }),
    envelope({ work_sessions: [workSession({ artifact_count: -1 })] }),
    envelope({ work_sessions: [workSession({ artifact_count: "2" })] }),
    envelope({ work_sessions: [workSession({ summary: "x".repeat(501) })] }),
    envelope({ work_sessions: [workSession({ payload_json: "{}" })] }),
    envelope({ work_sessions: [workSession({ absolute_path: "irrelevant" })] }),
    envelope({ work_sessions: [workSession({ item_id: null })] }),
    envelope({ work_sessions: new Array(51).fill(workSession()) }),
    { days: 14, limit: 50, proposals: [], work_sessions: [] , ...{ error: "admin_only" } },
    [],
    null,
    "{}",
  ];
  for (const value of hostile) {
    assert.throws(() => validateErpReviewEnvelope(value), (error) => error.code === "ERP_REVIEW_RESPONSE_MALFORMED");
  }
  assert.deepEqual(validateErpReviewEnvelope({ days: 14, limit: 50, proposals: [], work_sessions: [] }), {
    days: 14, limit: 50, proposals: [], work_sessions: [],
  });
});

test("HTTP status, header, size, timeout and connection failures map to fixed codes", async () => {
  const cases = [
    [() => response(envelope(), { statusCode: 401 }), "ERP_REVIEW_UNAUTHORIZED"],
    [() => response(envelope(), { statusCode: 403 }), "ERP_REVIEW_UNAUTHORIZED"],
    [() => response(envelope(), { statusCode: 404 }), "ERP_REVIEW_ROUTE_DISABLED"],
    [() => response(envelope(), { statusCode: 429 }), "ERP_REVIEW_RATE_LIMITED"],
    [() => response(envelope(), { statusCode: 500 }), "ERP_REVIEW_RESPONSE_MALFORMED"],
    [() => response(envelope(), { headers: { "content-type": "text/html", "cache-control": "no-store" } }), "ERP_REVIEW_RESPONSE_MALFORMED"],
    [() => response(envelope(), { headers: { "content-type": "application/json; charset=utf-8" } }), "ERP_REVIEW_RESPONSE_MALFORMED"],
    [() => response("{not json"), "ERP_REVIEW_RESPONSE_MALFORMED"],
    [() => response(JSON.stringify(envelope()).padEnd(300_000, " ")), "ERP_REVIEW_RESPONSE_OVERSIZE"],
    [() => { throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" }); }, "ERP_REVIEW_DISCONNECTED"],
    [() => new Promise(() => {}), "ERP_REVIEW_TIMEOUT"],
  ];
  for (const [httpGet, expected] of cases) {
    const transport = createErpLoopbackReviewReadTransport({ url: ERP_REVIEW_DEFAULT_URL, httpGet: async (options) => httpGet(options), timeoutMs: 20 });
    await assert.rejects(transport.read(SYNTHETIC_TOKEN), (error) => error.code === expected, expected);
  }
  const transport = createErpLoopbackReviewReadTransport({ url: ERP_REVIEW_DEFAULT_URL, httpGet: async () => response(envelope()) });
  await assert.rejects(transport.read(""), (error) => error.code === "ERP_REVIEW_UNAUTHORIZED");
  await assert.rejects(transport.read(null), (error) => error.code === "ERP_REVIEW_UNAUTHORIZED");
});

test("a streamed response that exceeds the bound is rejected and the upstream stream is destroyed", async () => {
  let destroyCalls = 0;
  const streamBody = {
    destroyed: false,
    destroy() {
      destroyCalls += 1;
      this.destroyed = true;
    },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from("x".repeat(300_000), "utf8");
    },
  };
  const transport = createErpLoopbackReviewReadTransport({
    url: ERP_REVIEW_DEFAULT_URL,
    httpGet: async () => ({
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      body: streamBody,
    }),
  });
  await assert.rejects(transport.read(SYNTHETIC_TOKEN), (error) => error.code === "ERP_REVIEW_RESPONSE_OVERSIZE");
  assert.equal(destroyCalls, 1, "the oversized upstream stream must be destroyed exactly once");
  assert.equal(streamBody.destroyed, true);
});

test("the transport source performs no write verbs and no other ERP paths", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./erp-loopback-review-read-transport.mjs", import.meta.url), "utf8");
  for (const forbidden of ["method: \"POST\"", "method: \"PUT\"", "method: \"DELETE\"", "/api/proposals", "/api/items", "/api/mcp/work-sessions", "/api/mcp/uploads"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  const codeLines = source.split("\n").filter((line) => !line.trimStart().startsWith("//"));
  assert.equal(codeLines.filter((line) => line.includes("/api/mcp/reviews/pending")).length, 1, "the path literal lives only in ERP_REVIEWS_PENDING_PATH");
});
