import assert from "node:assert/strict";
import test from "node:test";

import {
  ERP_PENDING_REVIEW_DEFAULT_LINK,
  ERP_REVIEW_HOLD_LABELS,
  buildErpPendingReviewViewModel,
  safeErpLink,
} from "./erp-pending-review-view.mjs";

function snapshot(overrides = {}) {
  return {
    schema_version: "soulforge.erp_pending_review_read_projection.v1",
    read_only: 1,
    refresh_state: "ready",
    observed_at: "2026-09-05T02:00:00.000Z",
    erp_link: { url: "http://127.0.0.1:4300/?view=mod:reviews", mode: "read_and_link" },
    counts: { proposals_pending: 1, work_sessions_recent: 3, work_sessions_unaccepted: 1, work_sessions_status_unknown: 1, pending_total: 2 },
    hold_code: null,
    ...overrides,
  };
}

test("a ready projection becomes a Korean-labelled counts-only model (Board sees counts and status only, M1)", () => {
  const model = buildErpPendingReviewViewModel(snapshot());
  assert.equal(model.state, "ready");
  assert.equal(model.holdCode, null);
  assert.equal(model.linkUrl, "http://127.0.0.1:4300/?view=mod:reviews");
  assert.equal(model.linkMode, "read_and_link");
  assert.equal(model.observedAt, "2026-09-05T02:00:00.000Z");
  assert.deepEqual(model.counts, { pending: 2, proposals: 1, sessionsRecent: 3, sessionsUnaccepted: 1, sessionsUnknown: 1 });
  // The Board's entire view: no per-row field (username/item id/project id/...)
  // can survive into the model because the projection never carries one (M1).
  assert.deepEqual(Object.keys(model).sort(), ["counts", "holdCode", "holdLabel", "linkMode", "linkUrl", "observedAt", "state"]);
});

test("a hold projection keeps the safe link, zero counts, and maps every code to a Korean reason", () => {
  for (const code of Object.keys(ERP_REVIEW_HOLD_LABELS)) {
    const model = buildErpPendingReviewViewModel(snapshot({
      refresh_state: "hold",
      observed_at: null,
      erp_link: { url: "http://127.0.0.1:4300/?view=mod:reviews", mode: "link_only" },
      counts: { proposals_pending: 0, work_sessions_recent: 0, work_sessions_unaccepted: 0, work_sessions_status_unknown: 0, pending_total: 0 },
      hold_code: code,
    }));
    assert.equal(model.state, "hold", code);
    assert.equal(model.holdCode, code);
    assert.equal(model.holdLabel, ERP_REVIEW_HOLD_LABELS[code]);
    assert.equal(model.linkUrl, "http://127.0.0.1:4300/?view=mod:reviews");
    assert.equal(model.linkMode, "link_only");
    assert.deepEqual(model.counts, { pending: 0, proposals: 0, sessionsRecent: 0, sessionsUnaccepted: 0, sessionsUnknown: 0 });
  }
  assert.equal(ERP_REVIEW_HOLD_LABELS.ERP_REVIEW_UNCONFIGURED.includes("링크만"), true);
  assert.equal(ERP_REVIEW_HOLD_LABELS.ERP_REVIEW_ROUTE_DISABLED.includes("DEV_ERP_MCP_REVIEW_READ"), true);
});

test("null, malformed, extra-keyed, or non-integer-count snapshots fail closed to hold on the default link", () => {
  const hostile = [
    null,
    undefined,
    {},
    snapshot({ schema_version: "other" }),
    snapshot({ read_only: 0 }),
    snapshot({ extra: 1 }),
    snapshot({ refresh_state: "loading" }),
    snapshot({ erp_link: { url: "http://127.0.0.1:4300/?view=mod:reviews" } }),
    snapshot({ erp_link: { url: "http://127.0.0.1:4300/?view=mod:reviews", mode: "read_and_link", extra: 1 } }),
    snapshot({ erp_link: { url: "http://127.0.0.1:4300/?view=mod:reviews", mode: "writer" } }),
    snapshot({ counts: { proposals_pending: 1, work_sessions_recent: 3, work_sessions_unaccepted: 1, work_sessions_status_unknown: 1 } }),
    snapshot({ counts: { proposals_pending: 1, work_sessions_recent: 3, work_sessions_unaccepted: 1, work_sessions_status_unknown: 1, pending_total: 2, extra: 1 } }),
    snapshot({ counts: { proposals_pending: -1, work_sessions_recent: 3, work_sessions_unaccepted: 1, work_sessions_status_unknown: 1, pending_total: 2 } }),
    snapshot({ counts: { proposals_pending: "1", work_sessions_recent: 3, work_sessions_unaccepted: 1, work_sessions_status_unknown: 1, pending_total: 2 } }),
    // Per-row arrays are not part of this schema; carrying one is a malformed
    // envelope to reject, not extra data to silently ignore.
    snapshot({ proposals: [] }),
    snapshot({ work_sessions: [] }),
  ];
  for (const value of hostile) {
    const model = buildErpPendingReviewViewModel(value);
    assert.equal(model.state, "hold", JSON.stringify(value)?.slice(0, 80));
    assert.equal(model.holdCode, "ERP_REVIEW_RESPONSE_MALFORMED");
    assert.equal(model.linkUrl, ERP_PENDING_REVIEW_DEFAULT_LINK);
  }
});

test("a ready snapshot whose own erp_link fails validation holds instead of silently falling back to the default link (M6)", () => {
  const model = buildErpPendingReviewViewModel(snapshot({ erp_link: { url: "http://100.64.0.1:4300/?view=mod:reviews", mode: "read_and_link" } }));
  assert.equal(model.state, "hold", "a bad link on an otherwise-ready snapshot must not present as healthy");
  assert.equal(model.holdCode, "ERP_REVIEW_RESPONSE_MALFORMED");
  assert.equal(model.linkUrl, ERP_PENDING_REVIEW_DEFAULT_LINK);
  assert.deepEqual(model.counts, { pending: 0, proposals: 0, sessionsRecent: 0, sessionsUnaccepted: 0, sessionsUnknown: 0 });
});

test("only a loopback http root link with the fixed view query may be rendered", () => {
  assert.equal(safeErpLink("http://127.0.0.1:4300/?view=mod:reviews"), "http://127.0.0.1:4300/?view=mod:reviews");
  assert.equal(safeErpLink("http://127.0.0.1:4300/"), "http://127.0.0.1:4300/");
  assert.equal(safeErpLink("http://[::1]:4300/?view=mod:reviews"), "http://[::1]:4300/?view=mod:reviews");
  for (const value of [
    "https://127.0.0.1:4300/",
    "http://localhost:4300/",
    "http://100.64.0.1:4300/?view=mod:reviews",
    "http://127.0.0.1:4300/?view=mod:proposals",
    "http://127.0.0.1:4300/?token=x",
    "http://127.0.0.1:4300/api/mcp/reviews/pending",
    "http://user:pw@127.0.0.1:4300/",
    "javascript:alert(1)",
    "",
    null,
  ]) {
    assert.equal(safeErpLink(value), null, String(value));
  }
});
