import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createEmptyThreadEnrollmentRegistry,
  registerExistingThread,
  writeThreadEnrollmentRegistryAtomic
} from "../core/live-thread-enrollment.mjs";
import { createLiveThreadAdapter } from "./live-thread-adapter.mjs";
import {
  createLifecycleReceipt,
  persistLifecycleReceipt
} from "../../../../../guild_hall/ai_usage_meter/lifecycle_receipt.mjs";

const AT = "2026-08-04T01:02:03.000Z";
const ENV = {};

function registration(threadId) {
  return {
    threadId,
    organizationGroupId: "org-system",
    routeId: null,
    workId: null,
    threadKind: "task",
    displayLabel: "Board TASK",
    relationship: "primary",
    lifecycle: "current"
  };
}

async function writeRegistry(path, ids) {
  let registry = createEmptyThreadEnrollmentRegistry({ now: AT });
  for (const id of ids) {
    registry = registerExistingThread(registry, registration(id), { now: AT, env: ENV }).registry;
  }
  await writeThreadEnrollmentRegistryAtomic(path, registry, { env: ENV });
  return registry;
}

async function persistLifecycleEvent(stateRoot, {
  event,
  sessionId,
  turnId = null,
  agentId = null,
  observedAt,
  extra = {}
}) {
  const receipt = createLifecycleReceipt({
    hook_event_name: event,
    session_id: sessionId,
    turn_id: turnId,
    agent_id: agentId,
    agent_type: agentId ? "worker" : null,
    reason: null,
    permission_mode: null,
    stop_hook_active: null,
    ...extra
  }, { observedAt });
  return persistLifecycleReceipt(stateRoot, receipt);
}

async function writeFakeAppServer(directory, mode = "normal") {
  const script = join(directory, `fake-app-server-${mode}.mjs`);
  await writeFile(script, `
import { createInterface } from "node:readline";
let initialized = false;
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") return send({ id: message.id, result: {} });
  if (message.method === "initialized") { initialized = true; return; }
  if (message.method !== "thread/list") return;
  if (!initialized) return send({ id: message.id, error: { message: "initialized missing" } });
  if (${JSON.stringify(mode)} === "malformed") {
    process.stdout.write("RAW_SECRET_PROTOCOL_LINE\\n");
    return;
  }
  if (${JSON.stringify(mode)} === "fallback" && message.params?.useStateDbOnly === true) {
    return send({ id: message.id, error: { message: "unknown field useStateDbOnly" } });
  }
  if (${JSON.stringify(mode)} === "state-stale") {
    return send({ id: message.id, result: { data: [{
      id: "thread-enrolled-one",
      status: { type: message.params?.useStateDbOnly === true ? "notLoaded" : "idle" },
      updatedAt: message.params?.useStateDbOnly === true ? "2026-08-04T01:03:03.000Z" : "2026-08-04T01:05:03.000Z",
      name: "RAW_STATE_STALE_TITLE",
      cwd: "RAW_STATE_STALE_CWD"
    }], nextCursor: null } });
  }
  if (${JSON.stringify(mode)} === "always-not-loaded") {
    return send({ id: message.id, result: { data: [{
      id: "thread-enrolled-one",
      status: { type: "notLoaded" },
      updatedAt: "2026-08-04T01:03:03.000Z"
    }], nextCursor: null } });
  }
  if (${JSON.stringify(mode)} === "large-pages") {
    if (message.params?.limit !== 20) {
      return send({ id: message.id, error: { message: "expected safe page limit" } });
    }
    const page = message.params?.cursor ? Number(String(message.params.cursor).replace("large-", "")) : 0;
    if (!Number.isSafeInteger(page) || page < 0 || page > 6) {
      return send({ id: message.id, error: { message: "unexpected cursor" } });
    }
    const rawDescription = "RAW_CAP_SENTINEL_" + "x".repeat(80_000);
    return send({ id: message.id, result: { data: [{
      id: page === 0 ? "thread-cap-enrolled" : "thread-cap-unregistered-" + page,
      status: { type: page === 0 ? "idle" : "active" },
      updatedAt: "2026-08-04T01:05:03.000Z",
      name: "RAW_CAP_TITLE",
      cwd: "RAW_CAP_CWD",
      description: rawDescription
    }], nextCursor: page < 6 ? "large-" + (page + 1) : null } });
  }
  if (!message.params?.cursor) {
    return send({ id: message.id, result: { data: [
      { id: "thread-enrolled-one", status: { type: "active", activeFlags: [] }, updatedAt: "2026-08-04T01:03:03.000Z", name: "RAW_SECRET_TITLE", cwd: "<RAW_SECRET_CWD>", preview: "RAW_SECRET_PREVIEW", turns: ["RAW_SECRET_TURNS"], gitInfo: { branch: "RAW_SECRET_GIT" }, messages: ["RAW_SECRET_MESSAGES"] },
      { id: "thread-unregistered", status: { type: "idle" }, updatedAt: "2026-08-04T01:03:04.000Z", name: "RAW_SECRET_SAME_TITLE", description: "RAW_SECRET_DESCRIPTION" }
    ], nextCursor: "next-page" } });
  }
  if (message.params.cursor === "next-page") {
    return send({ id: message.id, result: { data: [
      { id: "thread-enrolled-two", status: { type: "idle" }, updatedAt: "2026-08-04T01:04:03.000Z", prompt: "RAW_SECRET_PROMPT", reasoning: "RAW_SECRET_REASONING", toolIo: "RAW_SECRET_TOOL" }
    ], nextCursor: null } });
  }
  send({ id: message.id, error: { message: "unexpected cursor" } });
});
`, "utf8");
  return script;
}

test("app-server adapter handshakes, paginates, prefers state DB, and redacts before projection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-live-adapter-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-enrolled-one", "thread-enrolled-two"]);
    const script = await writeFakeAppServer(directory, "normal");
    const adapter = createLiveThreadAdapter({
      registryPath,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT)
    });
    const projection = await adapter.readProjection({ force: true });
    assert.equal(projection.adapter.health, "ready");
    assert.equal(projection.threads.length, 2);
    assert.equal(projection.scope.excluded_unregistered_count, 1);
    assert.equal(projection.threads.find((thread) => thread.thread_id === "thread-enrolled-one").status, "active");
    assert.equal(projection.threads.find((thread) => thread.thread_id === "thread-enrolled-two").status, "not_loaded_unknown");
    const serialized = JSON.stringify(projection);
    for (const rawToken of ["RAW_SECRET_TITLE", "RAW_SECRET_CWD", "RAW_SECRET_PREVIEW", "RAW_SECRET_TURNS", "RAW_SECRET_GIT", "RAW_SECRET_MESSAGES", "RAW_SECRET_PROMPT", "RAW_SECRET_REASONING", "RAW_SECRET_TOOL", "RAW_SECRET_DESCRIPTION"]) {
      assert.equal(serialized.includes(rawToken), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adapter retries thread/list without state DB only when the official server rejects that parameter", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-live-adapter-fallback-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    const script = await writeFakeAppServer(directory, "fallback");
    const projection = await createLiveThreadAdapter({
      registryPath,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV
    }).readProjection({ force: true });
    assert.equal(projection.adapter.health, "ready");
    assert.equal(projection.threads[0].observed, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adapter merges current official runtime status over a stale state DB notLoaded row", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-live-adapter-current-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    const script = await writeFakeAppServer(directory, "state-stale");
    const projection = await createLiveThreadAdapter({
      registryPath,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV
    }).readProjection({ force: true });
    assert.equal(projection.adapter.health, "ready");
    assert.equal(projection.threads[0].status, "not_loaded_unknown");
    assert.equal(projection.threads[0].updated_at, "2026-08-04T01:05:03.000Z");
    assert.equal(JSON.stringify(projection).includes("RAW_STATE_STALE"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("metadata-only Stop evidence stays non-attention without reading transcript content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-live-adapter-stop-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    const script = await writeFakeAppServer(directory, "always-not-loaded");
    const projection = await createLiveThreadAdapter({
      registryPath,
      usageMeterStateRoot: join(directory, "usage-meter"),
      loadUsageEvents: async () => [{
        thread_id: "thread-enrolled-one",
        measurement: { status: "observed_at_stop" },
        time: { started_at: "2026-08-04T01:06:03.000Z", completed_at: null },
        privacy: {
          metadata_only: true,
          prompt_captured: false,
          reasoning_captured: false,
          tool_payload_captured: false
        },
        source: { source_ref: "RAW_SOURCE_PATH_MUST_NOT_PROJECT" }
      }],
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV
    }).readProjection({ force: true });
    assert.equal(projection.threads[0].status, "not_loaded_unknown");
    assert.equal(projection.threads[0].updated_at, "2026-08-04T01:06:03.000Z");
    assert.equal(projection.threads[0].stop_observed_at, "2026-08-04T01:06:03.000Z");
    assert.equal(JSON.stringify(projection).includes("RAW_SOURCE_PATH"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("disposable lifecycle receipt canary maps exact session or agent IDs without creating Owner attention", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-lifecycle-canary-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    await writeRegistry(registryPath, [
      "thread-enrolled-one",
      "thread-lifecycle-waiting",
      "thread-lifecycle-stopped",
      "thread-lifecycle-ended",
      "thread-lifecycle-input"
    ]);
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SubagentStart",
      sessionId: "unregistered-parent-session",
      turnId: "turn-active",
      agentId: "thread-enrolled-one",
      observedAt: "2026-08-04T01:06:01.000Z",
      extra: { prompt: "RAW_LIFECYCLE_PROMPT_MUST_NOT_PROJECT", cwd: "RAW_LIFECYCLE_CWD_MUST_NOT_PROJECT" }
    });
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "PermissionRequest",
      sessionId: "thread-lifecycle-waiting",
      turnId: "turn-waiting",
      observedAt: "2026-08-04T01:06:02.000Z"
    });
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "Stop",
      sessionId: "thread-lifecycle-stopped",
      turnId: "turn-stopped",
      observedAt: "2026-08-04T01:06:03.000Z"
    });
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SessionEnd",
      sessionId: "thread-lifecycle-ended",
      observedAt: "2026-08-04T01:06:04.000Z"
    });
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "UserPromptSubmit",
      sessionId: "thread-lifecycle-input",
      turnId: "turn-input",
      observedAt: "2026-08-04T01:06:05.000Z"
    });
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SessionStart",
      sessionId: "thread-unregistered-lifecycle",
      observedAt: "2026-08-04T01:06:06.000Z"
    });

    const script = await writeFakeAppServer(directory, "always-not-loaded");
    const projection = await createLiveThreadAdapter({
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV
    }).readProjection({ force: true });

    const byId = new Map(projection.threads.map((thread) => [thread.thread_id, thread]));
    assert.equal(projection.adapter.health, "ready");
    assert.equal(projection.scope.lifecycle_source_health, "available");
    assert.equal(projection.scope.lifecycle_exact_identity_count, 6);
    assert.equal(projection.scope.lifecycle_matched_enrolled_count, 5);
    assert.equal(byId.get("thread-enrolled-one").status, "active");
    assert.equal(byId.get("thread-lifecycle-waiting").status, "waiting");
    assert.equal(byId.get("thread-lifecycle-stopped").status, "stopped");
    assert.equal(byId.get("thread-lifecycle-stopped").stop_observed_at, "2026-08-04T01:06:03.000Z");
    assert.equal(byId.get("thread-lifecycle-ended").status, "stopped");
    assert.equal(byId.get("thread-lifecycle-ended").stop_observed_at, null);
    assert.equal(byId.get("thread-lifecycle-input").status, "not_loaded_unknown");
    assert.equal(projection.threads.some((thread) => thread.status === "owner_attention" || thread.attention_target !== "none" || thread.result_state !== "none"), false);
    assert.equal(JSON.stringify(projection).includes("RAW_LIFECYCLE_"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing, invalid, stale, and disabled lifecycle sources leave an app-server notLoaded row unknown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-lifecycle-failsafe-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    const currentPath = join(lifecycleStateRoot, "lifecycle", "current.json");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    const script = await writeFakeAppServer(directory, "always-not-loaded");
    const adapterOptions = (overrides = {}) => ({
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      ...overrides
    });

    const missing = await createLiveThreadAdapter(adapterOptions()).readProjection({ force: true });
    assert.equal(missing.scope.lifecycle_source_health, "missing");
    assert.equal(missing.threads[0].status, "not_loaded_unknown");

    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SessionStart",
      sessionId: "thread-enrolled-one",
      observedAt: "2026-08-04T01:07:00.000Z"
    });
    await writeFile(currentPath, JSON.stringify({ raw_preview: "RAW_INVALID_LIFECYCLE_MUST_NOT_PROJECT" }), "utf8");
    const invalid = await createLiveThreadAdapter(adapterOptions()).readProjection({ force: true });
    assert.equal(invalid.adapter.health, "partial");
    assert.equal(invalid.scope.lifecycle_source_health, "invalid");
    assert.equal(invalid.threads[0].status, "not_loaded_unknown");
    assert.equal(JSON.stringify(invalid).includes("RAW_INVALID_LIFECYCLE"), false);

    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SessionStart",
      sessionId: "thread-enrolled-one",
      observedAt: "2026-08-04T01:07:00.000Z"
    });
    const generatedAt = JSON.parse(await readFile(currentPath, "utf8")).generated_at;
    const stale = await createLiveThreadAdapter(adapterOptions({
      now: () => Date.parse(generatedAt) + 2,
      limits: { lifecycleSnapshotMaxAgeMs: 0 }
    })).readProjection({ force: true });
    assert.equal(stale.adapter.health, "partial");
    assert.equal(stale.scope.lifecycle_source_health, "stale");
    assert.equal(stale.threads[0].status, "not_loaded_unknown");

    const controlPath = join(lifecycleStateRoot, "control", "emergency-disable.v1.json");
    await mkdir(join(lifecycleStateRoot, "control"), { recursive: true });
    await writeFile(controlPath, JSON.stringify({
      schema_version: "soulforge.ai_usage_meter_emergency_disable.v1",
      disabled: true,
      updated_at: "2026-08-04T01:08:00.000Z"
    }), "utf8");
    const disabled = await createLiveThreadAdapter(adapterOptions()).readProjection({ force: true });
    assert.equal(disabled.adapter.health, "partial");
    assert.equal(disabled.scope.lifecycle_source_health, "disabled");
    assert.equal(disabled.threads[0].status, "not_loaded_unknown");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adapter has bounded page coverage and shares one in-flight observation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-live-adapter-cache-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-enrolled-one", "thread-enrolled-two"]);
    const script = await writeFakeAppServer(directory, "normal");
    let spawns = 0;
    const adapter = createLiveThreadAdapter({
      registryPath,
      spawnSpec: { command: process.execPath, args: [script] },
      spawnImpl(...args) {
        spawns += 1;
        return spawn(...args);
      },
      cwd: directory,
      env: ENV,
      limits: { maxPages: 1, cacheMs: 30_000 }
    });
    const [first, second] = await Promise.all([adapter.readProjection(), adapter.readProjection()]);
    assert.equal(spawns, 1);
    assert.equal(first.adapter.health, "partial");
    assert.equal(second.adapter.health, "partial");
    assert.equal(first.threads.find((thread) => thread.thread_id === "thread-enrolled-two").status, "not_loaded_unknown");
    await adapter.readProjection();
    assert.equal(spawns, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adapter defaults safely handle multi-page official responses above the old protocol caps without raw leakage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-live-adapter-large-pages-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-cap-enrolled"]);
    const script = await writeFakeAppServer(directory, "large-pages");
    const projection = await createLiveThreadAdapter({
      registryPath,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT)
    }).readProjection({ force: true });
    assert.equal(projection.adapter.health, "ready");
    assert.equal(projection.threads.length, 1);
    assert.equal(projection.threads[0].thread_id, "thread-cap-enrolled");
    assert.equal(projection.threads[0].status, "not_loaded_unknown");
    assert.equal(projection.scope.excluded_unregistered_count, 6);
    const serialized = JSON.stringify(projection);
    for (const rawToken of ["RAW_CAP_SENTINEL", "RAW_CAP_TITLE", "RAW_CAP_CWD"]) {
      assert.equal(serialized.includes(rawToken), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("protocol failure is generic and still projects enrolled rows as unknown rather than completed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-live-adapter-failure-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    const script = await writeFakeAppServer(directory, "malformed");
    const projection = await createLiveThreadAdapter({
      registryPath,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV
    }).readProjection({ force: true });
    assert.equal(projection.adapter.health, "error");
    assert.equal(projection.threads[0].status, "not_loaded_unknown");
    assert.equal(JSON.stringify(projection).includes("RAW_SECRET_PROTOCOL_LINE"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
