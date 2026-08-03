import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { upsertUsageBinding } from "./binding_store.mjs";
import { loadPersistedUsageEvents } from "./usage_meter.mjs";

function row(timestamp, type, payload) {
  return JSON.stringify({ timestamp, type, payload });
}

async function writeActiveSession(root, {
  threadId,
  parentThreadId = null,
  turnId,
  startedAt,
  depth,
}) {
  const file = path.join(root, `rollout-${threadId}.jsonl`);
  await writeFile(file, `${[
    row(startedAt, "session_meta", {
      id: threadId,
      parent_thread_id: parentThreadId,
      timestamp: startedAt,
      cwd: "C:\\workspace\\project-a",
      source: parentThreadId ? { subagent: { thread_spawn: { depth } } } : {},
    }),
    row(startedAt, "event_msg", {
      type: "task_started",
      turn_id: turnId,
      started_at: startedAt,
      model_context_window: 258400,
    }),
    row(startedAt, "turn_context", {
      turn_id: turnId,
      model: "gpt-5.6-sol",
      effort: "high",
    }),
    row(startedAt, "event_msg", {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 50,
          cache_write_input_tokens: 0,
          output_tokens: 10,
          reasoning_output_tokens: 5,
          total_tokens: 110,
        },
      },
    }),
  ].join("\n")}\n`, "utf8");
  return file;
}

async function runHook(args, input) {
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: path.dirname(cliPath),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

test("SubagentStop recursively loads ancestors and inherits the depth-two root binding", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-hook-lineage-"));
  const sessions = path.join(root, "sessions");
  const state = path.join(root, "state");
  await mkdir(sessions, { recursive: true });
  try {
    const rootFile = await writeActiveSession(sessions, {
      threadId: "root-thread",
      turnId: "root-turn",
      startedAt: "2026-08-03T00:00:00.000Z",
      depth: 0,
    });
    const childFile = await writeActiveSession(sessions, {
      threadId: "child-thread",
      parentThreadId: "root-thread",
      turnId: "child-turn",
      startedAt: "2026-08-03T00:01:00.000Z",
      depth: 1,
    });
    const grandchildFile = await writeActiveSession(sessions, {
      threadId: "grandchild-thread",
      parentThreadId: "child-thread",
      turnId: "grandchild-turn",
      startedAt: "2026-08-03T00:02:00.000Z",
      depth: 2,
    });
    await upsertUsageBinding(state, {
      thread_id: "root-thread",
      turn_id: "root-turn",
      work_id: "root.work",
      project_id: "project-a",
      team_id: "team-a",
      role: "manager",
    });
    const configPath = path.join(root, "config.json");
    await writeFile(configPath, `${JSON.stringify({
      organization_id: "org-a",
      default_team_id: "team-default",
      default_project_id: "unassigned",
    })}\n`, "utf8");

    const result = await runHook([
      "hook",
      "--sessions-root", sessions,
      "--state-root", state,
      "--config", configPath,
    ], {
      hook_event_name: "SubagentStop",
      session_id: "root-thread",
      transcript_path: rootFile,
      agent_id: "grandchild-thread",
      agent_transcript_path: grandchildFile,
      cwd: "C:\\workspace\\project-a",
    });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});

    const events = await loadPersistedUsageEvents(state);
    assert.equal(events.length, 1);
    assert.equal(events[0].thread_id, "grandchild-thread");
    assert.equal(events[0].root_thread_id, "root-thread");
    assert.equal(events[0].root_turn_id, "root-turn");
    assert.equal(events[0].work_id, "root.work");
    assert.equal(events[0].measurement.status, "observed_at_stop");
    assert.equal(path.basename(rootFile), "rollout-root-thread.jsonl");

    const failed = await runHook([
      "hook",
      "--sessions-root", sessions,
      "--state-root", state,
      "--config", configPath,
    ], {
      hook_event_name: "Stop",
      session_id: "missing-thread",
      turn_id: "missing-turn",
      cwd: "C:\\workspace\\project-a",
    });
    assert.equal(failed.code, 0, failed.stderr);
    assert.deepEqual(JSON.parse(failed.stdout), {});
    const historyRoot = path.join(state, "health", "history");
    const historyFiles = (await readdir(historyRoot, { recursive: true }))
      .filter((item) => item.endsWith(".json"));
    assert.equal(historyFiles.length, 2);
    const history = await Promise.all(historyFiles.map(async (item) => (
      JSON.parse(await readFile(path.join(historyRoot, item), "utf8"))
    )));
    assert.deepEqual(history.map((item) => item.status).sort(), ["hold", "ok"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SubagentStop composes parent continuation observations before assigning lineage", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-hook-parent-continuation-"));
  const sessions = path.join(root, "sessions");
  const state = path.join(root, "state");
  await mkdir(sessions, { recursive: true });
  try {
    const parentId = "continued-parent";
    const parentTurnId = "continued-parent-turn";
    const earliestParent = path.join(sessions, `rollout-000-${parentId}.jsonl`);
    await writeFile(earliestParent, `${row("2026-08-03T00:00:00.000Z", "session_meta", {
      id: parentId,
      timestamp: "2026-08-03T00:00:00.000Z",
      cwd: "C:\\workspace\\project-a",
      source: {},
    })}\n`, "utf8");
    const currentParent = path.join(sessions, `rollout-999-${parentId}.jsonl`);
    await writeFile(currentParent, `${[
      row("2026-08-03T00:00:00.000Z", "session_meta", {
        id: parentId,
        timestamp: "2026-08-03T00:00:00.000Z",
        cwd: "C:\\workspace\\project-a",
        source: {},
      }),
      row("2026-08-03T00:00:00.000Z", "event_msg", {
        type: "task_started",
        turn_id: parentTurnId,
        started_at: "2026-08-03T00:00:00.000Z",
        model_context_window: 258400,
      }),
      row("2026-08-03T00:00:00.000Z", "turn_context", {
        turn_id: parentTurnId,
        model: "gpt-5.6-sol",
        effort: "high",
      }),
      row("2026-08-03T00:00:01.000Z", "event_msg", {
        type: "token_count",
        info: { total_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 50,
          cache_write_input_tokens: 0,
          output_tokens: 10,
          reasoning_output_tokens: 5,
          total_tokens: 110,
        } },
      }),
    ].join("\n")}\n`, "utf8");
    const childFile = await writeActiveSession(sessions, {
      threadId: "continued-child",
      parentThreadId: parentId,
      turnId: "continued-child-turn",
      startedAt: "2026-08-03T00:01:00.000Z",
      depth: 1,
    });
    await upsertUsageBinding(state, {
      thread_id: parentId,
      turn_id: parentTurnId,
      work_id: "continued-parent.work",
      project_id: "project-a",
      team_id: "team-a",
      role: "manager",
    });
    const configPath = path.join(root, "config.json");
    await writeFile(configPath, `${JSON.stringify({
      organization_id: "org-a",
      default_team_id: "team-default",
      default_project_id: "unassigned",
    })}\n`, "utf8");

    const result = await runHook([
      "hook",
      "--sessions-root", sessions,
      "--state-root", state,
      "--config", configPath,
    ], {
      hook_event_name: "SubagentStop",
      session_id: parentId,
      transcript_path: currentParent,
      agent_id: "continued-child",
      agent_transcript_path: childFile,
      cwd: "C:\\workspace\\project-a",
    });
    assert.equal(result.code, 0, result.stderr);
    const [event] = await loadPersistedUsageEvents(state);
    assert.equal(event.thread_id, "continued-child");
    assert.equal(event.root_thread_id, parentId);
    assert.equal(event.root_turn_id, parentTurnId);
    assert.equal(event.work_id, "continued-parent.work");
    assert.equal(event.measurement.attribution_confidence, "explicit_binding");
    assert.equal(path.basename(earliestParent), `rollout-000-${parentId}.jsonl`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Stop combines the canonical session metadata with a continuation transcript", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-hook-continuation-"));
  const sessions = path.join(root, "sessions");
  const state = path.join(root, "state");
  await mkdir(sessions, { recursive: true });
  try {
    const canonical = await writeActiveSession(sessions, {
      threadId: "continuation-root",
      turnId: "continuation-turn",
      startedAt: "2026-08-03T00:00:00.000Z",
      depth: 0,
    });
    const continuation = path.join(sessions, "rollout-continuation-copy.jsonl");
    await writeFile(continuation, `${[
      row("2026-08-03T00:00:00.000Z", "session_meta", {
        id: "continuation-root",
        timestamp: "2026-08-03T00:00:00.000Z",
        cwd: "C:\\workspace\\project-a",
        source: {},
      }),
      row("2026-08-03T00:00:00.000Z", "event_msg", {
        type: "task_started",
        turn_id: "continuation-turn",
        started_at: "2026-08-03T00:00:00.000Z",
        model_context_window: 258400,
      }),
      row("2026-08-03T00:00:03.000Z", "event_msg", {
        type: "token_count",
        info: { total_token_usage: {
          input_tokens: 90,
          cached_input_tokens: 40,
          cache_write_input_tokens: 0,
          output_tokens: 9,
          reasoning_output_tokens: 4,
          total_tokens: 99,
        } },
      }),
    ].join("\n")}\n`, "utf8");
    const configPath = path.join(root, "config.json");
    await writeFile(configPath, `${JSON.stringify({
      organization_id: "org-a",
      default_team_id: "team-a",
      default_project_id: "project-a",
    })}\n`, "utf8");
    const result = await runHook([
      "hook",
      "--sessions-root", sessions,
      "--state-root", state,
      "--config", configPath,
    ], {
      hook_event_name: "Stop",
      session_id: "continuation-root",
      turn_id: "continuation-turn",
      transcript_path: continuation,
      cwd: "C:\\workspace\\project-a",
    });
    assert.equal(result.code, 0, result.stderr);
    const [event] = await loadPersistedUsageEvents(state);
    assert.equal(event.model.id, "gpt-5.6-sol");
    assert.equal(event.usage.input_tokens, 100);
    assert.equal(event.measurement.status, "observed_at_stop");
    assert.equal(path.basename(canonical), "rollout-continuation-root.jsonl");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a scoped collect cannot overwrite the authoritative full coverage snapshot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-scoped-coverage-"));
  const sessions = path.join(root, "sessions");
  const state = path.join(root, "state");
  await mkdir(sessions, { recursive: true });
  try {
    const first = await writeActiveSession(sessions, {
      threadId: "coverage-first",
      turnId: "coverage-first-turn",
      startedAt: "2026-08-03T00:00:00.000Z",
      depth: 0,
    });
    await writeActiveSession(sessions, {
      threadId: "coverage-second",
      turnId: "coverage-second-turn",
      startedAt: "2026-08-03T00:01:00.000Z",
      depth: 0,
    });
    const full = await runHook([
      "collect",
      "--sessions-root", sessions,
      "--state-root", state,
      "--include-active",
      "--apply",
    ], {});
    assert.equal(full.code, 0, full.stderr);
    assert.equal(JSON.parse(full.stdout).coverage.scope, "full_sessions_root");
    const coveragePath = path.join(state, "coverage", "latest.json");
    const authoritative = JSON.parse(await readFile(coveragePath, "utf8"));
    assert.equal(authoritative.session_file_count, 2);

    const scoped = await runHook([
      "collect",
      "--sessions-root", sessions,
      "--session-file", first,
      "--state-root", state,
      "--include-active",
      "--apply",
    ], {});
    assert.equal(scoped.code, 0, scoped.stderr);
    const scopedReceipt = JSON.parse(scoped.stdout);
    assert.equal(scopedReceipt.coverage.scope, "scoped_request");
    assert.equal(scopedReceipt.coverage.authoritative_latest_updated, false);
    assert.deepEqual(JSON.parse(await readFile(coveragePath, "utf8")), authoritative);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
