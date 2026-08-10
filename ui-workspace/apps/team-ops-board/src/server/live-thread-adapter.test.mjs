import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createEmptyThreadEnrollmentRegistry,
  registerExistingThread,
  writeThreadEnrollmentRegistryAtomic
} from "../core/live-thread-enrollment.mjs";
import { createLiveThreadAdapter } from "./live-thread-adapter.mjs";

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
    assert.equal(projection.threads.find((thread) => thread.thread_id === "thread-enrolled-two").status, "idle_result_check");
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
    assert.equal(projection.threads[0].status, "idle_result_check");
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
