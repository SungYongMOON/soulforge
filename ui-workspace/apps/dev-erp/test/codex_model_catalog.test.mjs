import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  discoverCodexModels,
  fallbackCodexModelCatalog,
  preferredCodexModelSlug,
  resolveCodexModelSelection,
  runCodexTaskTurn,
} from "../src/codex_bridge.mjs";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, child, stderr) {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${stderr()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`server_timeout:${stderr()}`);
}

async function bootstrapAdminSession(base) {
  const response = await fetch(`${base}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "owner", password: "ownerpass123" }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

function writeFakeAppServer(dir) {
  const script = join(dir, "fake-codex-app-server.mjs");
  writeFileSync(script, `
import { createInterface } from "node:readline";

const mode = process.argv[2] || "catalog";
if (mode === "config-error") {
  process.stderr.write("config.toml:11:16: unknown variant 'default', expected 'fast' or 'flex' in service_tier\\n");
  process.exit(2);
}

let initialized = false;
const rl = createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize" && message.id != null) {
    if (mode === "timeout") return;
    send({ id: message.id, result: { userAgent: "fake" } });
    return;
  }
  if (message.method === "initialized" && message.id == null) {
    initialized = true;
    return;
  }
  if (message.method !== "model/list" || message.id == null) return;
  if (!initialized) {
    send({ id: message.id, error: { message: "initialized notification missing" } });
    return;
  }
  if (message.params?.limit !== 2 || message.params?.includeHidden !== true) {
    send({ id: message.id, error: { message: "unexpected model/list params" } });
    return;
  }
  if (!message.params?.cursor) {
    send({ id: message.id, result: {
      data: [
        {
          id: "gpt-5.6-sol",
          model: "gpt-5.6-sol",
          displayName: "GPT-5.6 Sol\\u0000 Preview",
          description: "preview",
          hidden: false,
          isDefault: true,
          defaultReasoningEffort: "max",
          supportedReasoningEfforts: [
            { reasoningEffort: "high", description: "Deep" },
            { reasoningEffort: "max", description: "Deepest" }
          ],
          defaultServiceTier: "fast",
          serviceTiers: [{ id: "fast", name: "Fast", description: "Lower latency" }]
        },
        {
          id: "unsafe id;rm",
          model: "unsafe id;rm",
          displayName: "must be dropped",
          hidden: false,
          isDefault: false,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: []
        }
      ],
      nextCursor: "page=2+opaque"
    } });
    return;
  }
  if (message.params.cursor !== "page=2+opaque") {
    send({ id: message.id, error: { message: "wrong cursor" } });
    return;
  }
  send({ id: message.id, result: {
    data: [
      {
        id: "gpt-5.5",
        model: "gpt-5.5",
        displayName: "GPT-5.5",
        description: "fallback",
        hidden: false,
        isDefault: false,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "Low" },
          { reasoningEffort: "medium", description: "Medium" },
          { reasoningEffort: "xhigh", description: "Very high" }
        ],
        serviceTiers: []
      },
      {
        id: "gpt-5.6-luna",
        model: "gpt-5.6-luna",
        displayName: "GPT-5.6 Luna",
        description: "hidden picker entry",
        hidden: true,
        isDefault: false,
        defaultReasoningEffort: "low",
        supportedReasoningEfforts: [{ reasoningEffort: "low", description: "Low" }],
        serviceTiers: []
      }
    ],
    nextCursor: null
  } });
});
`, "utf8");
  return script;
}

function writeHangingTurnAppServer(dir, pidFile) {
  const script = join(dir, "fake-codex-hanging-turn.mjs");
  writeFileSync(script, `
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id == null) return;
  if (message.method === "initialize") return send({ id: message.id, result: {} });
  if (message.method === "thread/start") return send({ id: message.id, result: {
    thread: { id: "thread_abort_test" },
    activePermissionProfile: { id: message.params.permissions, extends: null },
    runtimeWorkspaceRoots: message.params.runtimeWorkspaceRoots,
    instructionSources: [],
    sandbox: { type: "readOnly" },
  } });
  if (message.method === "thread/name/set") return send({ id: message.id, result: {} });
  if (message.method === "turn/start") return send({ id: message.id, result: { turn: { id: "turn_abort_test" } } });
  send({ id: message.id, result: {} });
});
`, "utf8");
  return script;
}

async function waitForFile(path) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (existsSync(path)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("file_wait_timeout");
}

async function waitForProcessExit(pid) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try { process.kill(pid, 0); }
    catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`process_still_alive:${pid}`);
}

async function removeTempDir(dir) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!new Set(["EPERM", "EBUSY", "ENOTEMPTY"]).has(error?.code) || attempt === 99) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

test("Codex app-server model/list discovery paginates and sanitizes the account catalog", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-erp-codex-models-"));
  try {
    const script = writeFakeAppServer(dir);
    const result = await discoverCodexModels({
      cwd: dir,
      timeoutMs: 2000,
      pageSize: 2,
      includeHidden: true,
      spawnSpec: { command: process.execPath, args: [script, "catalog"], direct: true },
    });

    assert.equal(result.source, "codex_app_server");
    assert.equal(result.pages, 2);
    assert.deepEqual(result.models.map((model) => model.slug), ["gpt-5.6-sol", "gpt-5.5", "gpt-5.6-luna"]);
    const sol = result.models[0];
    assert.equal(sol.display_name, "GPT-5.6 Sol Preview");
    assert.equal(sol.is_default, true);
    assert.deepEqual(sol.reasoning_efforts.map((option) => option.id), ["high", "max"]);
    assert.equal(sol.default_reasoning_effort, "max");
    assert.deepEqual(sol.service_tiers, [{ id: "fast", name: "Fast", description: "Lower latency" }]);
    assert.equal(sol.default_service_tier, "fast");
    assert.equal(result.models[2].hidden, true);

    assert.deepEqual(resolveCodexModelSelection(result.models, { model: "gpt-5.6-sol", effort: "max" }), {
      ok: true,
      model: "gpt-5.6-sol",
      effort: "max",
      catalog_entry: sol,
    });
    assert.equal(resolveCodexModelSelection(result.models, { model: "invented-preview" }).error, "unsupported_codex_model");
    assert.equal(resolveCodexModelSelection(result.models, { model: "gpt-5.6-luna" }).error, "unsupported_codex_model");
    assert.equal(resolveCodexModelSelection(result.models, { model: "gpt-5.6-sol", effort: "xhigh" }).error, "unsupported_codex_effort");
  } finally {
    await removeTempDir(dir);
  }
});

test("Codex model discovery is bounded and surfaces launch/config parse failures", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-erp-codex-model-errors-"));
  try {
    const script = writeFakeAppServer(dir);
    await assert.rejects(
      discoverCodexModels({
        cwd: dir,
        timeoutMs: 100,
        spawnSpec: { command: process.execPath, args: [script, "timeout"], direct: true },
      }),
      /codex_model_discovery_timeout:100/,
    );
    await assert.rejects(
      discoverCodexModels({
        cwd: dir,
        timeoutMs: 5000,
        spawnSpec: { command: process.execPath, args: [script, "config-error"], direct: true },
      }),
      /codex_model_discovery_failed:.*unknown variant 'default'.*service_tier/,
    );
  } finally {
    await removeTempDir(dir);
  }
});

test("an aborted Codex turn terminates its app-server process", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-erp-codex-abort-"));
  try {
    const pidFile = join(dir, "pid.txt");
    const script = writeHangingTurnAppServer(dir, pidFile);
    const controller = new AbortController();
    const pending = runCodexTaskTurn({
      mode: "app-server",
      cwd: dir,
      item: { id: "ITEM-ABORT", project_id: "P26-014", title: "Abort lease test" },
      initial: true,
      timeoutMs: 20_000,
      model: "gpt-5.5",
      effort: "medium",
      sandboxMode: "workspace-write",
      writableRoots: [dir],
      signal: controller.signal,
      appServerSpawnSpec: { command: process.execPath, args: [script], direct: true },
    });
    await waitForFile(pidFile);
    const pid = Number(readFileSync(pidFile, "utf8"));
    controller.abort();
    await assert.rejects(pending, /codex_app_server_aborted/);
    await waitForProcessExit(pid);
  } finally {
    await removeTempDir(dir);
  }
});

test("fallback is only GPT-5.5 and the UI does not hardcode GPT-5.6", () => {
  assert.deepEqual(fallbackCodexModelCatalog().map((model) => model.slug), ["gpt-5.5"]);
  assert.equal(preferredCodexModelSlug([
    { slug: "gpt-5.5", is_default: true },
    { slug: "gpt-5.6-sol", is_default: false },
  ]), "gpt-5.6-sol");
  assert.equal(preferredCodexModelSlug([
    { slug: "gpt-5.6-luna", is_default: false },
    { slug: "gpt-5.6-terra", is_default: true },
  ]), "gpt-5.6-terra");
  assert.equal(preferredCodexModelSlug([{ slug: "gpt-5.6-sol" }], "gpt-5.5"), "gpt-5.6-sol");
  assert.equal(preferredCodexModelSlug([
    { slug: "gpt-5.6-sol" },
    { slug: "gpt-5.6-terra" },
  ], "gpt-5.6-sol"), "gpt-5.6-sol");
  assert.equal(preferredCodexModelSlug([
    { slug: "gpt-5.5", is_default: false },
    { slug: "gpt-5.4", is_default: true },
  ]), "gpt-5.5");
  assert.equal(preferredCodexModelSlug([{ slug: "gpt-5.4", is_default: true }]), null);
  const app = readFileSync(join(APP_DIR, "static", "app.js"), "utf8");
  assert.doesNotMatch(app, /gpt-5\.6/i);
  assert.match(app, /taskCodexCatalogEntry/);
  assert.match(app, /taskCodexEffortOptions/);
});

test("ERP rejects client model slugs outside the discovered-or-fallback catalog", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-erp-codex-model-route-"));
  const codexHome = join(dir, "codex-home");
  const workspaceRoot = join(dir, "team", "approved", "model-route");
  const workspaceRegistry = join(dir, "codex-workspaces.runtime.json");
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  writeFileSync(workspaceRegistry, JSON.stringify({
    schema: "dev_erp.codex_workspace_registry.v1",
    machine_id: "model-route-test",
    trust_domain_id: "model-route-domain",
    workspaces: [{ workspace_id: "model_route", label: "Model route fixture", root_kind: "local", root: workspaceRoot, allowed_project_ids: ["P00-000_INBOX"], allowed_roles: ["admin"] }],
  }));
  const port = await freePort();
  const child = spawn(process.execPath, ["server.mjs", "--fixture", "--db", join(dir, "dev-erp.db"), "--port", String(port)], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      DEV_ERP_AUTOSYNC: "0",
      DEV_ERP_CODEX_TASK_BRIDGE: "mock",
      DEV_ERP_CODEX_WORKSPACE_REGISTRY: workspaceRegistry,
      DEV_ERP_CODEX_SERVICE_TIER: "",
      DEV_ERP_CODEX_HOME: codexHome,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stdout.resume();
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.stderr.resume();
  try {
    const base = `http://127.0.0.1:${port}`;
    await waitForHttp(`${base}/api/health`, child, () => stderr);
    const cookie = await bootstrapAdminSession(base);
    const items = await (await fetch(`${base}/api/items`, { headers: { cookie } })).json();
    const item = items.find((candidate) => candidate.status !== "archived");
    assert.ok(item?.id);
    writeFileSync(workspaceRegistry, JSON.stringify({
      schema: "dev_erp.codex_workspace_registry.v1",
      machine_id: "model-route-test",
      trust_domain_id: "model-route-domain",
      workspaces: [{ workspace_id: "model_route", label: "Model route fixture", root_kind: "local", root: workspaceRoot, allowed_project_ids: [item.project_id], allowed_roles: ["admin"] }],
    }));
    const capabilities = await (await fetch(`${base}/api/codex-task/capabilities?item_id=${encodeURIComponent(item.id)}`, { headers: { cookie } })).json();
    assert.deepEqual(capabilities.model_options, ["gpt-5.5"]);
    assert.equal(capabilities.model_catalog_source, "fallback");
    const post = (path, body) => fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });

    let response = await post("/api/codex-task/open", { item_id: item.id, model: "gpt-5.6-sol", effort: "max" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "unsupported_codex_model");
    response = await post("/api/codex-task/message", { item_id: item.id, message: "test", model: "invented-model", effort: "medium" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "unsupported_codex_model");
    response = await post("/api/codex-task/open", { item_id: item.id, workspace_id: "model_route", model: "gpt-5.5", effort: "medium" });
    assert.equal(response.status, 200);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await removeTempDir(dir);
  }
});
