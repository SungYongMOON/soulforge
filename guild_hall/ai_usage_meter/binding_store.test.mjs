import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadUsageBindingSet,
  mergeUsageBindings,
  upsertUsageBinding,
} from "./binding_store.mjs";
import { createUsageMeterMcpHandlers } from "./mcp_adapter.mjs";
import { renderUsageCsv, writeUsageCsv, writeUsageDashboard } from "./dashboard.mjs";
import {
  buildUsageEvents,
  loadRateCard,
  persistUsageEvents,
} from "./usage_meter.mjs";

const RATE_CARD = new URL("./rate_card.v1.json", import.meta.url);

test("local work bindings are idempotent, updateable, and take precedence", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-bind-"));
  const first = {
    thread_id: "binding-thread",
    turn_id: null,
    work_id: "work.one",
    project_id: "project-one",
    team_id: "team-one",
    role: "executor",
  };
  assert.equal((await upsertUsageBinding(state, first)).status, "created");
  assert.equal((await upsertUsageBinding(state, first)).status, "replayed");
  assert.equal((await upsertUsageBinding(state, { ...first, work_id: "work.two" })).status, "updated");
  const set = await loadUsageBindingSet(state);
  assert.equal(set.bindings.length, 1);
  assert.equal(set.bindings[0].work_id, "work.two");
  const merged = mergeUsageBindings({
    organization_id: "org-a",
    default_team_id: "default-team",
    default_project_id: "unassigned",
    work_bindings: [{ ...first, work_id: "static.work" }],
  }, set);
  assert.equal(merged.work_bindings[0].work_id, "work.two");
});

test("MCP handlers expose only metadata summaries and safe work detail", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-mcp-state-"));
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-mcp-session-"));
  const file = path.join(sessions, "rollout-mcp-thread.jsonl");
  const lines = [
    { timestamp: "2026-08-03T00:00:00.000Z", type: "session_meta", payload: {
      id: "mcp-thread", timestamp: "2026-08-03T00:00:00.000Z", cwd: "C:\\workspace\\mcp-project",
    } },
    { timestamp: "2026-08-03T00:00:01.000Z", type: "event_msg", payload: {
      type: "task_started", turn_id: "mcp-turn", started_at: "2026-08-03T00:00:01.000Z",
      model_context_window: 258400,
    } },
    { timestamp: "2026-08-03T00:00:01.100Z", type: "turn_context", payload: {
      turn_id: "mcp-turn", model: "gpt-5.6-sol", effort: "high",
    } },
    { timestamp: "2026-08-03T00:00:03.000Z", type: "event_msg", payload: {
      type: "token_count",
      info: { total_token_usage: {
        input_tokens: 1000,
        cached_input_tokens: 900,
        cache_write_input_tokens: 0,
        output_tokens: 100,
        reasoning_output_tokens: 70,
        total_tokens: 1100,
      } },
    } },
    { timestamp: "2026-08-03T00:00:05.000Z", type: "event_msg", payload: {
      type: "task_complete", turn_id: "mcp-turn", completed_at: "2026-08-03T00:00:05.000Z",
      duration_ms: 4000, last_agent_message: "must not be exposed",
    } },
  ];
  await writeFile(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
  const events = await buildUsageEvents({
    sessionFiles: [file],
    config: {
      organization_id: "org-a",
      default_team_id: "team-a",
      default_project_id: "project-a",
      work_bindings: [{ thread_id: "mcp-thread", turn_id: "mcp-turn", work_id: "mcp.work" }],
    },
    rateCard: await loadRateCard(RATE_CARD),
  });
  await persistUsageEvents(state, events);
  const handlers = createUsageMeterMcpHandlers({ stateRoot: state });
  const summary = await handlers.usage_meter_summary({ work_id: "mcp.work" });
  assert.equal(summary.totals.turns, 1);
  assert.equal(summary.totals.credits, 0.09875);
  const detail = await handlers.usage_meter_work_detail({ work_id: "mcp.work", limit: 10 });
  assert.equal(detail.event_count, 1);
  assert.equal(Object.hasOwn(detail.events[0], "source"), false);
  assert.doesNotMatch(JSON.stringify(detail), /last_agent_message|must not be exposed/u);
  const receipt = await handlers.usage_meter_bind_work({
    thread_id: "future-thread",
    turn_id: null,
    work_id: "future.work",
    project_id: "project-a",
    team_id: "team-a",
    role: "reviewer",
  });
  assert.equal(receipt.status, "created");
  const dashboardPath = path.join(state, "dashboard.html");
  await writeUsageDashboard(dashboardPath, events, {
    generatedAt: "2026-08-03T00:10:00.000Z",
    operational: { hook_status: "deferred", pending_event_count: 2 },
  });
  const dashboard = await readFile(dashboardPath, "utf8");
  assert.match(dashboard, /Soulforge AI 사용량 미터/u);
  assert.match(dashboard, /0\.099/u);
  assert.match(dashboard, /deferred/u);
  assert.match(dashboard, /병합 대기 이벤트/u);
  assert.doesNotMatch(dashboard, /last_agent_message|must not be exposed|source_ref/u);
  const csvPath = path.join(state, "usage.csv");
  await writeUsageCsv(csvPath, events, { groupBy: "work" });
  const csv = await readFile(csvPath, "utf8");
  assert.match(csv, /^key,turns,input_tokens/u);
  assert.match(csv, /mcp\.work,1,1000,900,100,0\.09875/u);

  const formulaSafeCsv = renderUsageCsv([{
    ...events[0],
    actor: { ...events[0].actor, role: "=1+1" },
  }], { groupBy: "role" });
  assert.match(formulaSafeCsv, /\n'=1\+1,1,/u);
  assert.doesNotMatch(formulaSafeCsv, /\n=1\+1,/u);
});
