import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCodexRetentionServerAdapter } from "./codex-retention-adapter.mjs";
import { CODEX_RETENTION_ENDPOINT_PATH, computeAutomationReportDigest } from "../core/codex-retention-projection.mjs";

const NOW_MS = 1787241600000;

test("createCodexRetentionServerAdapter configures middleware that handles GET /codex-retention.snapshot.json", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-ret-adapter-test-"));
  try {
    const reportPath = path.join(root, "current.json");

    const mockReport = {
      schema_version: "soulforge.codex_thread_manager.codex_retention_automation_report.v1",
      generated_at: new Date(NOW_MS - 300000).toISOString(),
      report_only: true,
      status: "PASS",
      summary: {
        retention_evidence_status: "HOLD",
        retention_action: "HOLD",
        inventory_status: "PASS",
        bound_candidate_count: 2,
        unbound_active_task_count: 0,
        inventory_gap_count: 0,
        task_classifications: {
          active: 2,
          input_waiting: 0,
          result_waiting: 0,
          completed: 0,
          interrupted: 0,
          duplicate: 0,
          unknown: 0
        },
        worktree_totals: {
          total: 2,
          dirty: 0,
          locked: 0,
          index_lock: 0,
          operation_marker: 0,
          unique_commit: 1,
          prunable: 0
        },
        destructive_action_count: 0,
        local_automation_install_count: 0
      }
    };
    mockReport.digest = computeAutomationReportDigest(mockReport);

    await writeFile(reportPath, JSON.stringify(mockReport), "utf8");

    const adapter = createCodexRetentionServerAdapter({
      reportPath,
      now: NOW_MS
    });

    let middleware;
    const mockServer = {
      middlewares: {
        use: (fn) => { middleware = fn; }
      }
    };
    adapter.configureServer(mockServer);
    assert.ok(typeof middleware === "function");

    // Test non-matching path calls next()
    let nextCalled = false;
    middleware({ url: "/other-path" }, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    // Test POST request returns 405 Method Not Allowed
    let responseStatusCode = 0;
    let responseHeaders = {};
    let responseBody = "";
    const mockPostResponse = {
      set statusCode(code) { responseStatusCode = code; },
      setHeader: (key, val) => { responseHeaders[key] = val; },
      end: (data) => { responseBody = data || ""; }
    };

    middleware(
      { url: CODEX_RETENTION_ENDPOINT_PATH, method: "POST", socket: { remoteAddress: "127.0.0.1" } },
      mockPostResponse,
      () => {}
    );
    assert.equal(responseStatusCode, 405);
    assert.equal(responseHeaders["Allow"], "GET");

    // Test Non-loopback request returns 403 Forbidden
    responseStatusCode = 0;
    const mockForbiddenResponse = {
      set statusCode(code) { responseStatusCode = code; },
      setHeader: () => {},
      end: () => {}
    };
    middleware(
      { url: CODEX_RETENTION_ENDPOINT_PATH, method: "GET", socket: { remoteAddress: "192.168.1.100" } },
      mockForbiddenResponse,
      () => {}
    );
    assert.equal(responseStatusCode, 403);

    // Test Valid GET loopback request returns 200 OK JSON projection
    responseStatusCode = 0;
    responseHeaders = {};
    responseBody = "";
    const mockGetResponse = {
      set statusCode(code) { responseStatusCode = code; },
      setHeader: (key, val) => { responseHeaders[key] = val; },
      end: (data) => { responseBody = data || ""; }
    };

    await new Promise((resolve) => {
      const originalEnd = mockGetResponse.end;
      mockGetResponse.end = (data) => {
        originalEnd(data);
        resolve();
      };
      middleware(
        { url: CODEX_RETENTION_ENDPOINT_PATH, method: "GET", socket: { remoteAddress: "127.0.0.1" } },
        mockGetResponse,
        () => {}
      );
    });

    assert.equal(responseStatusCode, 200);
    assert.equal(responseHeaders["Content-Type"], "application/json; charset=utf-8");

    const parsed = JSON.parse(responseBody);
    assert.equal(parsed.schema_version, "soulforge.team_ops_board.codex_retention_projection.v1");
    assert.equal(parsed.summary.bound_candidate_count, 2);
    assert.equal(parsed.authority_boundary.read_only, true);
    assert.equal(parsed.authority_boundary.destructive_authority, false);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});
