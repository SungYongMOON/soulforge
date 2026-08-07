import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createEmptyThreadEnrollmentRegistry,
  readThreadEnrollmentRegistry,
  registerExistingThread,
  writeThreadEnrollmentRegistryAtomic
} from "../core/live-thread-enrollment.mjs";
import {
  appendThreadResultGateEvent,
  createEmptyThreadResultGateRegistry
} from "../core/live-thread-projection.mjs";
import { writeThreadResultGateRegistryAtomic } from "../core/live-thread-result-gate.mjs";
import { createLiveThreadAdapter } from "./live-thread-adapter.mjs";
import {
  createLifecycleReceipt,
  createLifecycleSnapshot,
  persistLifecycleReceipt
} from "../../../../../guild_hall/ai_usage_meter/lifecycle_receipt.mjs";

const AT = "2026-08-04T01:02:03.000Z";
const ENV = { TEAM_OPS_BOARD_AUTO_LIFECYCLE_RECONCILE: "false" };

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

async function writeCatalog(path, groupId = "org-system", lifecycle = "active") {
  await writeFile(path, `${JSON.stringify({
    schema_version: "soulforge.organization_governance_overlay.v1",
    catalog_revision: 1,
    effective_at: AT,
    updated_at: AT,
    authority_state: "validated_private",
    disabled: false,
    root_display_label: "Synthetic organization",
    organizations: [{
      organization_id: groupId,
      parent_organization_id: null,
      organization_kind: "company",
      display_label: "Synthetic Company",
      display_order: 0,
      lifecycle,
      member_branch_ids: ["common"],
      owner_authority_ref: "owner-approved:organization-governance-v1",
      identity_state: "legacy_projection",
      mapping_authority: "owner_seeded",
      legacy_projection_ref: `owner-seeded:${groupId}`
    }],
    role_bindings: [{
      role_binding_id: `${groupId}:company_ceo`,
      organization_id: groupId,
      role_code: "company_ceo",
      position_code: null,
      rank: 0,
      display_order: 0,
      stable_route_id: null,
      display_label: "CEO",
      lifecycle: "active"
    }],
    metadata_only: true
  }, null, 2)}\n`, "utf8");
}

function createIsolatedLiveThreadAdapter(directory, options) {
  return createLiveThreadAdapter({
    ...options,
    resultGatePath: join(directory, "thread_result_gate.v1.json")
  });
}

async function writeOwnerResultGate(path, threadId) {
  let registry = createEmptyThreadResultGateRegistry({ now: AT });
  const append = (event, now) => {
    const result = appendThreadResultGateEvent(registry, event, { now, env: ENV });
    assert.equal(result.error, null);
    registry = result.registry;
  };
  const common = {
    thread_id: threadId,
    target_thread_id: null,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
  append({
    ...common,
    event_id: `${threadId}-started`,
    event_type: "started",
    target: "none",
    occurred_at: "2026-08-04T01:02:01.000Z"
  }, "2026-08-04T01:02:01.000Z");
  append({
    ...common,
    event_id: `${threadId}-owner-result`,
    event_type: "result_ready",
    target: "owner",
    occurred_at: "2026-08-04T01:02:03.000Z"
  }, AT);
  await writeThreadResultGateRegistryAtomic(path, registry, { env: ENV });
}

function lifecycleJsonlRow(timestamp, type, payload) {
  return JSON.stringify({ timestamp, type, payload });
}

async function writeLifecycleSession(root, threadId, lines) {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, `rollout-${threadId}.jsonl`), `${lines.join("\n")}\n`, "utf8");
}

function lifecycleSessionMeta(threadId, timestamp) {
  return lifecycleJsonlRow(timestamp, "session_meta", {
    id: threadId,
    session_id: threadId,
    timestamp,
    cwd: "RAW_LIFECYCLE_SESSION_CWD_MUST_NOT_PROJECT",
    transcript_path: "RAW_LIFECYCLE_SESSION_PATH_MUST_NOT_PROJECT"
  });
}

function lifecycleTaskStarted(turnId, timestamp) {
  return lifecycleJsonlRow(timestamp, "event_msg", {
    type: "task_started",
    turn_id: turnId,
    started_at: timestamp,
    prompt: "RAW_LIFECYCLE_SESSION_PROMPT_MUST_NOT_PROJECT"
  });
}

function lifecycleTaskComplete(turnId, timestamp) {
  return lifecycleJsonlRow(timestamp, "event_msg", {
    type: "task_complete",
    turn_id: turnId,
    completed_at: timestamp,
    last_agent_message: "RAW_LIFECYCLE_SESSION_RESULT_MUST_NOT_PROJECT"
  });
}

function lifecycleReceipt({
  event,
  sessionId,
  turnId = null,
  agentId = null,
  observedAt,
  extra = {}
}) {
  return createLifecycleReceipt({
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
}

async function persistLifecycleEvent(stateRoot, options) {
  return persistLifecycleReceipt(stateRoot, lifecycleReceipt(options));
}

async function writeLifecycleSnapshot(stateRoot, receipts, generatedAt) {
  const target = join(stateRoot, "lifecycle", "current.json");
  await mkdir(join(stateRoot, "lifecycle"), { recursive: true });
  await writeFile(target, `${JSON.stringify(createLifecycleSnapshot(receipts, { generatedAt, includeIdentities: true }))}\n`, "utf8");
}

async function setLifecycleSnapshotGeneratedAt(stateRoot, generatedAt) {
  const target = join(stateRoot, "lifecycle", "current.json");
  const snapshot = JSON.parse(await readFile(target, "utf8"));
  await writeFile(target, `${JSON.stringify({ ...snapshot, generated_at: generatedAt })}\n`, "utf8");
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
  if (${JSON.stringify(mode)} === "error") {
    return send({ id: message.id, result: { data: [{
      id: "thread-enrolled-one",
      status: { type: "error" },
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
    const rawDescription = "RAW_CAP_SENTINEL_" + "x".repeat(page === 0 ? 150_000 : 80_000);
    return send({ id: message.id, result: { data: [{
      id: page === 0 ? "thread-cap-enrolled" : "thread-cap-unregistered-" + page,
      status: { type: page === 0 ? "idle" : "active" },
      updatedAt: "2026-08-04T01:05:03.000Z",
      name: "RAW_CAP_TITLE",
      cwd: "RAW_CAP_CWD",
      description: rawDescription
    }], nextCursor: page < 6 ? "large-" + (page + 1) : null } });
  }
  if (${JSON.stringify(mode)} === "three-active") {
    return send({ id: message.id, result: { data: [
      { id: "thread-lifecycle-a", status: { type: "active" }, updatedAt: "2026-08-04T01:02:03.000Z" },
      { id: "thread-lifecycle-b", status: { type: "active" }, updatedAt: "2026-08-04T01:02:03.000Z" },
      { id: "thread-lifecycle-c", status: { type: "active" }, updatedAt: "2026-08-04T01:02:03.000Z" }
    ], nextCursor: null } });
  }
  if (${JSON.stringify(mode)} === "auto-child") {
    return send({ id: message.id, result: { data: [
      { id: "thread-enrolled-one", status: { type: "active" }, updatedAt: "2026-08-04T01:02:03.000Z", name: "RAW_AUTO_PARENT_TITLE" },
      { id: "thread-auto-child", parentThreadId: "thread-enrolled-one", status: { type: "active" }, updatedAt: "2026-08-04T01:02:03.000Z", name: "RAW_AUTO_CHILD_TITLE", cwd: "RAW_AUTO_CHILD_CWD", messages: ["RAW_AUTO_CHILD_MESSAGE"] }
    ], nextCursor: null } });
  }
  if (["auto-child-merged-root", "auto-child-merged-idle", "auto-child-merged-malformed", "auto-child-merged-parent"].includes(${JSON.stringify(mode)})) {
    const selectedMode = ${JSON.stringify(mode)};
    const stateDb = message.params?.useStateDbOnly === true;
    const child = {
      id: "thread-auto-ambiguous",
      parentThreadId: "thread-enrolled-one",
      status: { type: "active" },
      updatedAt: "2026-08-04T01:02:03.000Z"
    };
    if (!stateDb && selectedMode === "auto-child-merged-root") child.parentThreadId = null;
    if (!stateDb && selectedMode === "auto-child-merged-idle") child.status = { type: "idle" };
    if (!stateDb && selectedMode === "auto-child-merged-malformed") child.status = { type: "malformed status" };
    if (!stateDb && selectedMode === "auto-child-merged-parent") child.parentThreadId = "thread-other-parent";
    return send({ id: message.id, result: { data: [
      { id: "thread-enrolled-one", status: { type: stateDb ? "notLoaded" : "idle" }, updatedAt: "2026-08-04T01:02:03.000Z" },
      child
    ], nextCursor: null } });
  }
  if (!message.params?.cursor) {
    return send({ id: message.id, result: { data: [
      { id: "thread-enrolled-one", status: { type: "active", activeFlags: [] }, updatedAt: "2026-08-04T01:03:03.000Z", name: "RAW_SECRET_TITLE", cwd: "C:\\\\RAW_SECRET_CWD", preview: "RAW_SECRET_PREVIEW", turns: ["RAW_SECRET_TURNS"], gitInfo: { branch: "RAW_SECRET_GIT" }, messages: ["RAW_SECRET_MESSAGES"] },
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

test("app-server adapter handshakes, paginates, requires lifecycle evidence for positives, and redacts before projection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-live-adapter-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-enrolled-one", "thread-enrolled-two"]);
    const script = await writeFakeAppServer(directory, "normal");
    const adapter = createIsolatedLiveThreadAdapter(directory, {
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
    assert.equal(projection.scope.lifecycle_source_health, "missing");
    assert.equal(projection.threads.find((thread) => thread.thread_id === "thread-enrolled-one").status, "not_loaded_unknown");
    assert.equal(projection.threads.find((thread) => thread.thread_id === "thread-enrolled-two").status, "not_loaded_unknown");
    const serialized = JSON.stringify(projection);
    for (const rawToken of ["RAW_SECRET_TITLE", "RAW_SECRET_CWD", "RAW_SECRET_PREVIEW", "RAW_SECRET_TURNS", "RAW_SECRET_GIT", "RAW_SECRET_MESSAGES", "RAW_SECRET_PROMPT", "RAW_SECRET_REASONING", "RAW_SECRET_TOOL", "RAW_SECRET_DESCRIPTION"]) {
      assert.equal(serialized.includes(rawToken), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adapter auto-enrolls only an exact active child into the local registry without projecting raw app-server fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-child-adapter-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const catalogPath = join(directory, "organization_governance_overlay.v1.json");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    await writeCatalog(catalogPath);
    const script = await writeFakeAppServer(directory, "auto-child");
    const adapter = createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      organizationCatalogPath: catalogPath,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT)
    });
    const projection = await adapter.readProjection({ force: true });
    const enrolled = await readThreadEnrollmentRegistry(registryPath);
    const child = enrolled.registry.entries.find((entry) => entry.thread_id === "thread-auto-child");
    assert.deepEqual({
      organization_group_id: child.organization_group_id,
      route_id: child.route_id,
      work_id: child.work_id,
      thread_kind: child.thread_kind,
      display_label: child.display_label,
      relationship: child.relationship,
      lifecycle: child.lifecycle,
      parent_thread_id: child.parent_thread_id,
      metadata_only: child.metadata_only,
      raw_preview: child.raw_preview,
      raw_turns: child.raw_turns,
      raw_messages: child.raw_messages,
      raw_reasoning: child.raw_reasoning,
      raw_tool_io: child.raw_tool_io,
      raw_cwd: child.raw_cwd
    }, {
      organization_group_id: "org-system",
      route_id: null,
      work_id: null,
      thread_kind: "task",
      display_label: "자동 발견 TASK · thread-auto-",
      relationship: "child",
      lifecycle: "current",
      parent_thread_id: "thread-enrolled-one",
      metadata_only: true,
      raw_preview: false,
      raw_turns: false,
      raw_messages: false,
      raw_reasoning: false,
      raw_tool_io: false,
      raw_cwd: false
    });
    assert.equal(projection.threads.some((thread) => thread.thread_id === "thread-auto-child"), true);
    const serialized = JSON.stringify({ projection, enrollment: enrolled.registry });
    for (const rawToken of ["RAW_AUTO_PARENT_TITLE", "RAW_AUTO_CHILD_TITLE", "RAW_AUTO_CHILD_CWD", "RAW_AUTO_CHILD_MESSAGE"]) {
      assert.equal(serialized.includes(rawToken), false);
    }
    const revision = enrolled.registry.registry_revision;
    await adapter.readProjection({ force: true });
    assert.equal((await readThreadEnrollmentRegistry(registryPath)).registry.registry_revision, revision);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adapter bridges a persisted exact SubagentStart receipt through its single registry writer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-subagent-receipt-bridge-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const catalogPath = join(directory, "organization_governance_overlay.v1.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    await writeCatalog(catalogPath);
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SubagentStart",
      sessionId: "thread-enrolled-one",
      turnId: "turn-receipt-child",
      agentId: "thread-receipt-child",
      observedAt: AT,
      extra: {
        prompt: "RAW_RECEIPT_PROMPT_MUST_NOT_PROJECT",
        cwd: "RAW_RECEIPT_CWD_MUST_NOT_PROJECT",
        last_assistant_message: "RAW_RECEIPT_MESSAGE_MUST_NOT_PROJECT"
      }
    });
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SubagentStart",
      sessionId: "thread-enrolled-one",
      turnId: "turn-receipt-child",
      agentId: "thread-receipt-child",
      observedAt: AT
    });
    await setLifecycleSnapshotGeneratedAt(lifecycleStateRoot, AT);
    const script = await writeFakeAppServer(directory, "malformed");
    let clock = Date.parse(AT);
    const adapter = createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      organizationCatalogPath: catalogPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now: () => clock,
      limits: { autoEnrollmentDebounceMs: 0 }
    });

    const projection = await adapter.readProjection({ force: true });
    const enrolled = await readThreadEnrollmentRegistry(registryPath);
    const child = enrolled.registry.entries.find((entry) => entry.thread_id === "thread-receipt-child");
    assert.deepEqual({
      organization_group_id: child.organization_group_id,
      route_id: child.route_id,
      work_id: child.work_id,
      thread_kind: child.thread_kind,
      relationship: child.relationship,
      lifecycle: child.lifecycle,
      parent_thread_id: child.parent_thread_id,
      metadata_only: child.metadata_only,
      raw_preview: child.raw_preview,
      raw_turns: child.raw_turns,
      raw_messages: child.raw_messages,
      raw_reasoning: child.raw_reasoning,
      raw_tool_io: child.raw_tool_io,
      raw_cwd: child.raw_cwd
    }, {
      organization_group_id: "org-system",
      route_id: null,
      work_id: null,
      thread_kind: "task",
      relationship: "child",
      lifecycle: "current",
      parent_thread_id: "thread-enrolled-one",
      metadata_only: true,
      raw_preview: false,
      raw_turns: false,
      raw_messages: false,
      raw_reasoning: false,
      raw_tool_io: false,
      raw_cwd: false
    });
    assert.equal(projection.threads.find((thread) => thread.thread_id === "thread-receipt-child")?.status, "active");
    const serialized = JSON.stringify({ projection, enrollment: enrolled.registry });
    for (const raw of ["RAW_SECRET_PROTOCOL_LINE", "RAW_RECEIPT_PROMPT_MUST_NOT_PROJECT", "RAW_RECEIPT_CWD_MUST_NOT_PROJECT", "RAW_RECEIPT_MESSAGE_MUST_NOT_PROJECT"]) {
      assert.equal(serialized.includes(raw), false);
    }

    const revision = enrolled.registry.registry_revision;
    clock += 1_000;
    await adapter.readProjection({ force: true });
    assert.equal((await readThreadEnrollmentRegistry(registryPath)).registry.registry_revision, revision);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("latest persisted SubagentStop poisons a simultaneous app-server active child", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-subagent-receipt-terminal-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const catalogPath = join(directory, "organization_governance_overlay.v1.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    await writeCatalog(catalogPath);
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SubagentStart",
      sessionId: "thread-enrolled-one",
      turnId: "turn-auto-child",
      agentId: "thread-auto-child",
      observedAt: "2026-08-04T01:02:02.000Z"
    });
    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SubagentStop",
      sessionId: "thread-enrolled-one",
      turnId: "turn-auto-child",
      agentId: "thread-auto-child",
      observedAt: AT
    });
    await setLifecycleSnapshotGeneratedAt(lifecycleStateRoot, AT);
    const before = await readThreadEnrollmentRegistry(registryPath);
    const script = await writeFakeAppServer(directory, "auto-child");
    const projection = await createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      organizationCatalogPath: catalogPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT),
      limits: { autoEnrollmentDebounceMs: 0 }
    }).readProjection({ force: true });
    const after = await readThreadEnrollmentRegistry(registryPath);

    assert.equal(after.registry.registry_revision, before.registry.registry_revision);
    assert.deepEqual(after.registry.entries, before.registry.entries);
    assert.equal(after.registry.entries.some((entry) => entry.thread_id === "thread-auto-child"), false);
    assert.equal(projection.threads.some((thread) => thread.thread_id === "thread-auto-child"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("receipt bridge holds an inactive parent organization and respects its emergency disable", async () => {
  for (const scenario of ["inactive", "disabled"]) {
    const directory = await mkdtemp(join(tmpdir(), `team-ops-subagent-receipt-${scenario}-`));
    try {
      const registryPath = join(directory, "visibility.json");
      const catalogPath = join(directory, "organization_governance_overlay.v1.json");
      const lifecycleStateRoot = join(directory, "usage-meter");
      await writeRegistry(registryPath, ["thread-enrolled-one"]);
      await writeCatalog(catalogPath, "org-system", scenario === "inactive" ? "retired" : "active");
      await persistLifecycleEvent(lifecycleStateRoot, {
        event: "SubagentStart",
        sessionId: "thread-enrolled-one",
        turnId: "turn-receipt-hold",
        agentId: "thread-receipt-hold",
        observedAt: AT
      });
      await setLifecycleSnapshotGeneratedAt(lifecycleStateRoot, AT);
      const script = await writeFakeAppServer(directory, "malformed");
      const before = await readThreadEnrollmentRegistry(registryPath);
      const projection = await createIsolatedLiveThreadAdapter(directory, {
        registryPath,
        organizationCatalogPath: catalogPath,
        usageMeterStateRoot: lifecycleStateRoot,
        lifecycleStateRoot,
        spawnSpec: { command: process.execPath, args: [script] },
        cwd: directory,
        env: scenario === "disabled"
          ? { ...ENV, TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED: "true" }
          : ENV,
        now: () => Date.parse(AT),
        limits: { autoEnrollmentDebounceMs: 0 }
      }).readProjection({ force: true });
      const after = await readThreadEnrollmentRegistry(registryPath);
      assert.equal(after.registry.registry_revision, before.registry.registry_revision, scenario);
      assert.equal(after.registry.entries.some((entry) => entry.thread_id === "thread-receipt-hold"), false, scenario);
      assert.equal(projection.threads.some((thread) => thread.thread_id === "thread-receipt-hold"), false, scenario);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("merged stateDB/current conflicts hold while an exact same-parent idle child is enrolled", async () => {
  for (const ambiguity of ["root", "idle", "malformed", "parent"]) {
    const directory = await mkdtemp(join(tmpdir(), `team-ops-auto-child-merged-${ambiguity}-`));
    try {
      const registryPath = join(directory, "visibility.json");
      const catalogPath = join(directory, "organization_governance_overlay.v1.json");
      await writeRegistry(registryPath, ["thread-enrolled-one"]);
      await writeCatalog(catalogPath);
      const before = await readThreadEnrollmentRegistry(registryPath);
      const script = await writeFakeAppServer(directory, `auto-child-merged-${ambiguity}`);
      const projection = await createIsolatedLiveThreadAdapter(directory, {
        registryPath,
        organizationCatalogPath: catalogPath,
        spawnSpec: { command: process.execPath, args: [script] },
        cwd: directory,
        env: ENV,
        now: () => Date.parse(AT)
      }).readProjection({ force: true });
      const after = await readThreadEnrollmentRegistry(registryPath);
      if (ambiguity === "idle") {
        const enrolled = after.registry.entries.find((entry) => entry.thread_id === "thread-auto-ambiguous");
        const projected = projection.threads.find((thread) => thread.thread_id === "thread-auto-ambiguous");
        assert.equal(after.registry.registry_revision, before.registry.registry_revision + 1, ambiguity);
        assert.equal(enrolled?.thread_kind, "task", ambiguity);
        assert.equal(enrolled?.parent_thread_id, "thread-enrolled-one", ambiguity);
        assert.equal(projected?.status, "not_loaded_unknown", ambiguity);
        assert.equal(projected?.result_state, "none", ambiguity);
        assert.equal(projected?.attention_target, "none", ambiguity);
        continue;
      }
      assert.equal(after.registry.registry_revision, before.registry.registry_revision, ambiguity);
      assert.deepEqual(after.registry.entries, before.registry.entries, ambiguity);
      assert.equal(after.registry.entries.some((entry) => entry.thread_id === "thread-auto-ambiguous"), false, ambiguity);
      assert.equal(projection.threads.some((thread) => thread.thread_id === "thread-auto-ambiguous"), false, ambiguity);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("adapter projects a valid local governance source and holds an unknown enrolled group", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-organization-adapter-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const catalogPath = join(directory, "organization_governance_overlay.v1.json");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    await writeCatalog(catalogPath);
    const script = await writeFakeAppServer(directory, "normal");
    const projection = await createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      organizationCatalogPath: catalogPath,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT)
    }).readProjection({ force: true });
    assert.equal(projection.organization.health, "available");
    assert.equal(projection.organization.companies[0]?.display_label, "Synthetic Company");
    assert.equal(projection.organization.groups[0]?.display_label, "CEO");

    const unknownRegistry = createEmptyThreadEnrollmentRegistry({ now: AT });
    const unknown = registerExistingThread(unknownRegistry, {
      ...registration("thread-unknown"),
      organizationGroupId: "unassigned-future-group"
    }, { now: AT, env: ENV });
    await writeThreadEnrollmentRegistryAtomic(registryPath, unknown.registry, { env: ENV });
    const held = await createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      organizationCatalogPath: catalogPath,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT)
    }).readProjection({ force: true });
    assert.equal(held.organization.health, "hold");
    assert.deepEqual(held.organization.unknown_enrolled_group_ids, ["unassigned-future-group"]);
    assert.equal(held.organization.companies.some((company) => company.company_id === "unassigned-future-group"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("app-server active fails closed when lifecycle source evidence is stale", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-lifecycle-stale-active-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    await writeLifecycleSnapshot(lifecycleStateRoot, [lifecycleReceipt({
      event: "SessionStart",
      sessionId: "thread-enrolled-one",
      turnId: "turn-stale",
      observedAt: "2026-08-04T01:00:00.000Z"
    })], "2026-08-04T01:00:00.000Z");

    const script = await writeFakeAppServer(directory, "normal");
    const projection = await createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse("2026-08-04T01:10:00.000Z")
    }).readProjection({ force: true });

    assert.equal(projection.scope.lifecycle_source_health, "stale");
    assert.equal(projection.adapter.health, "partial");
    assert.equal(projection.threads[0]?.status, "not_loaded_unknown");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fresh lifecycle active and waiting evidence override app-server active safely", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-lifecycle-fresh-active-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const script = await writeFakeAppServer(directory, "normal");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);

    for (const { event, turnId, expectedStatus } of [
      { event: "SessionStart", turnId: "turn-active", expectedStatus: "active" },
      { event: "PermissionRequest", turnId: "turn-waiting", expectedStatus: "waiting" }
    ]) {
      const lifecycleStateRoot = join(directory, expectedStatus);
      await writeLifecycleSnapshot(lifecycleStateRoot, [lifecycleReceipt({
        event,
        sessionId: "thread-enrolled-one",
        turnId,
        observedAt: "2026-08-04T01:02:02.000Z"
      })], AT);
      const projection = await createIsolatedLiveThreadAdapter(directory, {
        registryPath,
        usageMeterStateRoot: lifecycleStateRoot,
        lifecycleStateRoot,
        spawnSpec: { command: process.execPath, args: [script] },
        cwd: directory,
        env: ENV,
        now: () => Date.parse(AT)
      }).readProjection({ force: true });

      assert.equal(projection.scope.lifecycle_source_health, "available");
      assert.equal(projection.threads[0]?.status, expectedStatus);
      assert.equal(JSON.stringify(projection).includes("turn_id"), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("current app-server active supersedes a prior terminal turn while usage-only stop fails closed and app errors remain errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-lifecycle-terminal-active-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "lifecycle-terminal");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    await writeLifecycleSnapshot(lifecycleStateRoot, [lifecycleReceipt({
      event: "Stop",
      sessionId: "thread-enrolled-one",
      turnId: "turn-stopped",
      observedAt: "2026-08-04T01:02:02.000Z"
    })], AT);

    const activeScript = await writeFakeAppServer(directory, "normal");
    const terminal = await createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      spawnSpec: { command: process.execPath, args: [activeScript] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT)
    }).readProjection({ force: true });
    assert.equal(terminal.threads[0]?.status, "active");
    assert.equal(terminal.threads[0]?.result_state, "none");
    assert.equal(terminal.threads[0]?.attention_target, "none");
    assert.equal(terminal.threads[0]?.stop_observed_at, "2026-08-04T01:02:02.000Z");

    const newerStopStateRoot = join(directory, "lifecycle-newer-terminal");
    await writeLifecycleSnapshot(newerStopStateRoot, [lifecycleReceipt({
      event: "Stop",
      sessionId: "thread-enrolled-one",
      turnId: "turn-newer-stopped",
      observedAt: "2026-08-04T01:04:02.000Z"
    })], AT);
    const newerTerminal = await createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: newerStopStateRoot,
      lifecycleStateRoot: newerStopStateRoot,
      spawnSpec: { command: process.execPath, args: [activeScript] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT)
    }).readProjection({ force: true });
    assert.equal(newerTerminal.threads[0]?.status, "stopped");
    assert.equal(newerTerminal.threads[0]?.stop_observed_at, "2026-08-04T01:04:02.000Z");

    const usageStop = await createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: join(directory, "usage-stop"),
      lifecycleStateRoot: join(directory, "usage-stop"),
      loadUsageEvents: async () => [{
        thread_id: "thread-enrolled-one",
        measurement: { status: "observed_at_stop" },
        time: { started_at: "2026-08-04T01:02:02.000Z", completed_at: null },
        privacy: {
          metadata_only: true,
          prompt_captured: false,
          reasoning_captured: false,
          tool_payload_captured: false
        },
        source: { source_ref: "RAW_USAGE_STOP_MUST_NOT_PROJECT" }
      }],
      spawnSpec: { command: process.execPath, args: [activeScript] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT)
    }).readProjection({ force: true });
    assert.equal(usageStop.threads[0]?.status, "not_loaded_unknown");
    assert.equal(usageStop.threads[0]?.stop_observed_at, "2026-08-04T01:02:02.000Z");
    assert.equal(JSON.stringify(usageStop).includes("RAW_USAGE_STOP"), false);

    const errorScript = await writeFakeAppServer(directory, "error");
    const appError = await createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      spawnSpec: { command: process.execPath, args: [errorScript] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse(AT)
    }).readProjection({ force: true });
    assert.equal(appError.threads[0]?.status, "error");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("unrelated Owner result and terminal evidence never demote fresh A/B lifecycle activity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-lifecycle-isolated-result-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    const ownerResultThreadId = "thread-lifecycle-c";
    await writeRegistry(registryPath, ["thread-lifecycle-a", "thread-lifecycle-b", ownerResultThreadId]);
    await writeOwnerResultGate(join(directory, "thread_result_gate.v1.json"), ownerResultThreadId);
    await writeLifecycleSnapshot(lifecycleStateRoot, [
      lifecycleReceipt({
        event: "SessionStart",
        sessionId: "thread-lifecycle-a",
        turnId: "turn-a",
        observedAt: "2026-08-04T01:02:02.000Z"
      }),
      lifecycleReceipt({
        event: "SessionStart",
        sessionId: "thread-lifecycle-b",
        turnId: "turn-b",
        observedAt: "2026-08-04T01:02:02.000Z"
      }),
      lifecycleReceipt({
        event: "SubagentStart",
        sessionId: "thread-unenrolled-parent",
        turnId: "turn-c",
        agentId: ownerResultThreadId,
        observedAt: "2026-08-04T01:02:02.000Z"
      }),
      lifecycleReceipt({
        event: "SubagentStop",
        sessionId: "thread-unenrolled-parent",
        turnId: "turn-c",
        agentId: ownerResultThreadId,
        observedAt: AT
      })
    ], AT);

    const script = await writeFakeAppServer(directory, "three-active");
    const adapterOptions = (now) => ({
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now
    });
    const fresh = await createIsolatedLiveThreadAdapter(directory, adapterOptions(() => Date.parse(AT))).readProjection({ force: true });
    const freshById = new Map(fresh.threads.map((thread) => [thread.thread_id, thread]));

    assert.equal(fresh.scope.lifecycle_source_health, "available");
    assert.equal(freshById.get("thread-lifecycle-a")?.status, "active");
    assert.equal(freshById.get("thread-lifecycle-b")?.status, "active");
    assert.equal(freshById.get(ownerResultThreadId)?.status, "owner_attention");
    assert.equal(freshById.get(ownerResultThreadId)?.result_state, "owner_attention");
    assert.equal(freshById.get(ownerResultThreadId)?.stop_observed_at, AT);

    const stale = await createIsolatedLiveThreadAdapter(directory, adapterOptions(
      () => Date.parse("2026-08-04T01:08:04.000Z")
    )).readProjection({ force: true });
    const staleById = new Map(stale.threads.map((thread) => [thread.thread_id, thread]));

    assert.equal(stale.scope.lifecycle_source_health, "stale");
    assert.equal(stale.adapter.health, "partial");
    assert.equal(staleById.get("thread-lifecycle-a")?.status, "not_loaded_unknown");
    assert.equal(staleById.get("thread-lifecycle-b")?.status, "not_loaded_unknown");
    assert.equal(staleById.get(ownerResultThreadId)?.status, "owner_attention");
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
    const projection = await createIsolatedLiveThreadAdapter(directory, {
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
    const projection = await createIsolatedLiveThreadAdapter(directory, {
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
    const projection = await createIsolatedLiveThreadAdapter(directory, {
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
    await setLifecycleSnapshotGeneratedAt(lifecycleStateRoot, "2026-08-04T01:06:06.000Z");

    const script = await writeFakeAppServer(directory, "always-not-loaded");
    const projection = await createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      env: ENV,
      now: () => Date.parse("2026-08-04T01:06:06.000Z")
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
    const serialized = JSON.stringify(projection);
    assert.equal(serialized.includes("RAW_LIFECYCLE_"), false);
    assert.equal(serialized.includes("turn_id"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adapter automatically reconciles a new exact JSONL session without a manual CLI run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-lifecycle-"));
  try {
    const threadId = "thread-auto-jsonl";
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    const sessionsRoot = join(directory, "configured-codex", "sessions");
    const currentPath = join(lifecycleStateRoot, "lifecycle", "current.json");
    const jsonlPath = join(lifecycleStateRoot, "lifecycle", "jsonl", "current.json");
    await writeRegistry(registryPath, [threadId]);
    await writeLifecycleSession(sessionsRoot, threadId, [
      lifecycleSessionMeta(threadId, "2026-08-04T01:10:00.000Z"),
      lifecycleTaskStarted("turn-auto-jsonl", "2026-08-04T01:10:01.000Z"),
      lifecycleTaskComplete("turn-auto-jsonl", "2026-08-04T01:10:02.000Z")
    ]);
    await assert.rejects(readFile(currentPath, "utf8"));

    const script = await writeFakeAppServer(directory, "always-not-loaded");
    const adapter = createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      lifecycleSessionsRoot: sessionsRoot,
      autoLifecycleReconcile: true,
      loadUsageEvents: async () => [],
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      limits: { lifecycleReconcileDebounceMs: 0, lifecycleReconcileTimeoutMs: 5_000 },
      env: ENV
    });
    const first = await adapter.readProjection({ force: true });
    const second = await adapter.readProjection({ force: true });
    const thread = first.threads.find((item) => item.thread_id === threadId);
    const fallback = JSON.parse(await readFile(jsonlPath, "utf8"));
    const mirrored = JSON.parse(await readFile(currentPath, "utf8"));

    assert.equal(first.scope.lifecycle_source_health, "available");
    assert.equal(second.scope.lifecycle_source_health, "available");
    assert.equal(thread?.status, "stopped");
    assert.equal(thread?.result_state, "none");
    assert.equal(thread?.attention_target, "none");
    assert.equal(first.threads.some((item) => item.status === "owner_attention" || item.attention_target !== "none" || item.result_state !== "none"), false);
    assert.equal(fallback.coverage.duplicate_projection_count, 0);
    assert.equal(fallback.raw_content_fields_stored, 0);
    assert.equal(fallback.raw_flag_fields_stored, 0);
    assert.equal(mirrored.raw_content_fields_stored, 0);
    assert.equal(mirrored.raw_flag_fields_stored, 0);
    assert.equal(JSON.stringify(first).includes("RAW_LIFECYCLE_SESSION_"), false);
    assert.equal(JSON.stringify(fallback).includes("RAW_LIFECYCLE_SESSION_"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("automatic exact lifecycle reconciliation recovers on the next refresh after a timeout hold", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-lifecycle-timeout-"));
  try {
    const threadId = "thread-enrolled-one";
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    await writeRegistry(registryPath, [threadId]);
    const script = await writeFakeAppServer(directory, "normal");
    let releaseFirstReconcile;
    let resolveFirstStarted;
    let resolveFirstCompleted;
    let reconcileCalls = 0;
    const firstStarted = new Promise((resolve) => { resolveFirstStarted = resolve; });
    const firstCompleted = new Promise((resolve) => { resolveFirstCompleted = resolve; });
    const allowFirstReconcile = new Promise((resolve) => { releaseFirstReconcile = resolve; });
    const adapter = createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      lifecycleSessionsRoot: join(directory, "configured-codex", "sessions"),
      autoLifecycleReconcile: true,
      lifecycleReconcileAndPersist: async ({ stateRoot }) => {
        reconcileCalls += 1;
        if (reconcileCalls === 1) {
          resolveFirstStarted();
          await allowFirstReconcile;
          await writeLifecycleSnapshot(stateRoot, [lifecycleReceipt({
            event: "SessionStart",
            sessionId: threadId,
            turnId: "turn-recovered",
            observedAt: AT
          })], AT);
          resolveFirstCompleted();
        }
        return { status: "available" };
      },
      loadUsageEvents: async () => [],
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      limits: { lifecycleReconcileDebounceMs: 0, lifecycleReconcileTimeoutMs: 10 },
      env: ENV,
      now: () => Date.parse(AT)
    });

    const firstRead = adapter.readProjection({ force: true });
    await firstStarted;
    const timedOut = await firstRead;
    assert.equal(timedOut.scope.lifecycle_source_health, "hold");
    assert.equal(timedOut.adapter.health, "partial");
    assert.equal(timedOut.threads.find((thread) => thread.thread_id === threadId)?.status, "not_loaded_unknown");

    releaseFirstReconcile();
    await firstCompleted;
    await new Promise((resolve) => setImmediate(resolve));
    const recovered = await adapter.readProjection({ force: true });

    assert.equal(reconcileCalls, 2);
    assert.equal(recovered.scope.lifecycle_source_health, "available");
    assert.equal(recovered.adapter.health, "ready");
    assert.equal(recovered.threads.find((thread) => thread.thread_id === threadId)?.status, "active");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a fresh validated lifecycle snapshot survives a transient reconcile timeout without falling to 0/0", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-lifecycle-last-good-"));
  try {
    const threadId = "thread-enrolled-one";
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    await writeRegistry(registryPath, [threadId]);
    await writeLifecycleSnapshot(lifecycleStateRoot, [lifecycleReceipt({
      event: "SessionStart",
      sessionId: threadId,
      turnId: "turn-last-good",
      observedAt: AT
    })], AT);
    const script = await writeFakeAppServer(directory, "normal");
    const adapter = createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      lifecycleSessionsRoot: join(directory, "configured-codex", "sessions"),
      autoLifecycleReconcile: true,
      lifecycleReconcileAndPersist: async () => await new Promise(() => {}),
      loadUsageEvents: async () => [],
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      limits: { lifecycleReconcileDebounceMs: 0, lifecycleReconcileTimeoutMs: 10 },
      env: ENV,
      now: () => Date.parse(AT)
    });

    const projection = await adapter.readProjection({ force: true });

    assert.equal(projection.scope.lifecycle_source_health, "available");
    assert.equal(projection.scope.lifecycle_exact_identity_count, 1);
    assert.equal(projection.scope.lifecycle_matched_enrolled_count, 1);
    assert.notEqual(projection.adapter.health, "partial");
    assert.equal(projection.threads.find((thread) => thread.thread_id === threadId)?.status, "active");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a post-reconcile emergency disable overrides a pre-reconcile available snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-lifecycle-disable-race-"));
  try {
    const threadId = "thread-enrolled-one";
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    await writeRegistry(registryPath, [threadId]);
    await writeLifecycleSnapshot(lifecycleStateRoot, [lifecycleReceipt({
      event: "SessionStart",
      sessionId: threadId,
      turnId: "turn-before-disable",
      observedAt: AT
    })], AT);
    const script = await writeFakeAppServer(directory, "normal");
    const adapter = createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      lifecycleSessionsRoot: join(directory, "configured-codex", "sessions"),
      autoLifecycleReconcile: true,
      lifecycleReconcileAndPersist: async () => {
        const controlDirectory = join(lifecycleStateRoot, "control");
        await mkdir(controlDirectory, { recursive: true });
        await writeFile(join(controlDirectory, "emergency-disable.v1.json"), JSON.stringify({
          schema_version: "soulforge.ai_usage_meter_emergency_disable.v1",
          disabled: true,
          updated_at: AT
        }), "utf8");
        return { status: "available" };
      },
      loadUsageEvents: async () => [],
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      limits: { lifecycleReconcileDebounceMs: 0, lifecycleReconcileTimeoutMs: 5_000 },
      env: ENV,
      now: () => Date.parse(AT)
    });

    const projection = await adapter.readProjection({ force: true });

    assert.equal(projection.scope.lifecycle_source_health, "disabled");
    assert.equal(projection.adapter.health, "partial");
    assert.equal(projection.threads.find((thread) => thread.thread_id === threadId)?.status, "not_loaded_unknown");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an emergency disable created during a reconcile timeout overrides the last-good snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-lifecycle-timeout-disable-race-"));
  try {
    const threadId = "thread-enrolled-one";
    const registryPath = join(directory, "visibility.json");
    const lifecycleStateRoot = join(directory, "usage-meter");
    await writeRegistry(registryPath, [threadId]);
    await writeLifecycleSnapshot(lifecycleStateRoot, [lifecycleReceipt({
      event: "SessionStart",
      sessionId: threadId,
      turnId: "turn-before-timeout-disable",
      observedAt: AT
    })], AT);
    const script = await writeFakeAppServer(directory, "normal");
    const adapter = createIsolatedLiveThreadAdapter(directory, {
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      lifecycleSessionsRoot: join(directory, "configured-codex", "sessions"),
      autoLifecycleReconcile: true,
      lifecycleReconcileAndPersist: async () => {
        const controlDirectory = join(lifecycleStateRoot, "control");
        await mkdir(controlDirectory, { recursive: true });
        await writeFile(join(controlDirectory, "emergency-disable.v1.json"), JSON.stringify({
          schema_version: "soulforge.ai_usage_meter_emergency_disable.v1",
          disabled: true,
          updated_at: AT
        }), "utf8");
        return await new Promise(() => {});
      },
      loadUsageEvents: async () => [],
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      limits: { lifecycleReconcileDebounceMs: 0, lifecycleReconcileTimeoutMs: 10 },
      env: ENV,
      now: () => Date.parse(AT)
    });

    const projection = await adapter.readProjection({ force: true });

    assert.equal(projection.scope.lifecycle_source_health, "disabled");
    assert.equal(projection.adapter.health, "partial");
    assert.equal(projection.threads.find((thread) => thread.thread_id === threadId)?.status, "not_loaded_unknown");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("automatic lifecycle reconciliation is disabled or fails without blocking Board projection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-auto-lifecycle-hold-"));
  try {
    const registryPath = join(directory, "visibility.json");
    const script = await writeFakeAppServer(directory, "always-not-loaded");
    await writeRegistry(registryPath, ["thread-enrolled-one"]);
    const adapterOptions = (lifecycleStateRoot, overrides = {}) => ({
      registryPath,
      usageMeterStateRoot: lifecycleStateRoot,
      lifecycleStateRoot,
      lifecycleSessionsRoot: join(directory, "missing-codex", "sessions"),
      autoLifecycleReconcile: true,
      loadUsageEvents: async () => [],
      spawnSpec: { command: process.execPath, args: [script] },
      cwd: directory,
      limits: { lifecycleReconcileTimeoutMs: 100 },
      env: ENV,
      ...overrides
    });

    const disabledRoot = join(directory, "disabled-meter");
    await mkdir(join(disabledRoot, "control"), { recursive: true });
    await writeFile(join(disabledRoot, "control", "emergency-disable.v1.json"), JSON.stringify({
      schema_version: "soulforge.ai_usage_meter_emergency_disable.v1",
      disabled: true,
      updated_at: "2026-08-04T01:11:00.000Z"
    }), "utf8");
    const disabled = await createIsolatedLiveThreadAdapter(directory, adapterOptions(disabledRoot)).readProjection({ force: true });
    assert.equal(disabled.scope.lifecycle_source_health, "disabled");
    assert.equal(disabled.threads[0].status, "not_loaded_unknown");

    const errorRoot = join(directory, "error-meter");
    const errored = await createIsolatedLiveThreadAdapter(directory, adapterOptions(errorRoot)).readProjection({ force: true });
    assert.equal(errored.scope.lifecycle_source_health, "hold");
    assert.equal(errored.adapter.health, "partial");
    assert.equal(errored.threads[0].status, "not_loaded_unknown");
    assert.equal(JSON.stringify(errored).includes("missing-codex"), false);
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

    const missing = await createIsolatedLiveThreadAdapter(directory, adapterOptions()).readProjection({ force: true });
    assert.equal(missing.scope.lifecycle_source_health, "missing");
    assert.equal(missing.threads[0].status, "not_loaded_unknown");

    await persistLifecycleEvent(lifecycleStateRoot, {
      event: "SessionStart",
      sessionId: "thread-enrolled-one",
      observedAt: "2026-08-04T01:07:00.000Z"
    });
    await writeFile(currentPath, JSON.stringify({ raw_preview: "RAW_INVALID_LIFECYCLE_MUST_NOT_PROJECT" }), "utf8");
    const invalid = await createIsolatedLiveThreadAdapter(directory, adapterOptions()).readProjection({ force: true });
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
    const stale = await createIsolatedLiveThreadAdapter(directory, adapterOptions({
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
    const disabled = await createIsolatedLiveThreadAdapter(directory, adapterOptions()).readProjection({ force: true });
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
    const adapter = createIsolatedLiveThreadAdapter(directory, {
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
    const projection = await createIsolatedLiveThreadAdapter(directory, {
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
    const projection = await createIsolatedLiveThreadAdapter(directory, {
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
