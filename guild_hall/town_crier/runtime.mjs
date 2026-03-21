import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export const GATEWAY_NOTIFY_EVENTS = ["monster_created"];
export const MISSION_NOTIFY_EVENTS = ["mission_blocked", "mission_ready", "mission_closed", "mission_failed"];

export function gatewayNotifyPolicyPath(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "gateway", "bindings", "notify_policy.yaml");
}

export function townCrierTelegramEnvPath(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "town_crier", "telegram_notify.env");
}

export function missionPathFromId(repoRoot, missionId) {
  return path.join(repoRoot, ".mission", missionId, "mission.yaml");
}

export function gatewayNotifyPolicyRepoPath() {
  return normalizeRepoPath(path.join("guild_hall", "state", "gateway", "bindings", "notify_policy.yaml"));
}

export function isGatewayNotifyPolicyRepoPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return normalized === gatewayNotifyPolicyRepoPath();
}

export function isMissionYamlRepoPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return normalized.startsWith(".mission/") && normalized.endsWith("/mission.yaml");
}

export function resolveMissionIdFromRepoPath(repoPath) {
  if (!isMissionYamlRepoPath(repoPath)) {
    return null;
  }

  const normalized = normalizeRepoPath(repoPath);
  return normalized.split("/")[1] ?? null;
}

export function defaultMissionNotifications() {
  return {
    telegram: Object.fromEntries(MISSION_NOTIFY_EVENTS.map((event) => [event, false])),
  };
}

export async function ensureGatewayNotifyPolicy(repoRoot) {
  const filePath = gatewayNotifyPolicyPath(repoRoot);

  if (!(await pathExists(filePath))) {
    const normalized = normalizeGatewayNotifyPolicy(repoRoot, null);
    await writeYaml(filePath, normalized);
    return normalized;
  }

  const loaded = await loadYaml(filePath);
  const normalized = normalizeGatewayNotifyPolicy(repoRoot, loaded);
  if (JSON.stringify(loaded) !== JSON.stringify(normalized)) {
    await writeYaml(filePath, normalized);
  }
  return normalized;
}

export async function setGatewayEventEnabled(repoRoot, event, enabled) {
  assertGatewayEvent(event);
  const policy = await ensureGatewayNotifyPolicy(repoRoot);
  policy.events[event].telegram = Boolean(enabled);
  policy.updated_at = new Date().toISOString();
  await writeYaml(gatewayNotifyPolicyPath(repoRoot), policy);
  return {
    scope: "gateway",
    event,
    enabled: policy.events[event].telegram,
    policy_file: relativeToRepo(repoRoot, gatewayNotifyPolicyPath(repoRoot)),
  };
}

export async function setMissionEventEnabled(repoRoot, missionFilePath, event, enabled) {
  assertMissionEvent(event);
  const resolvedMissionPath = resolveMissionPath(repoRoot, missionFilePath);
  const document = await loadYaml(resolvedMissionPath);
  document.notifications = normalizeMissionNotifications(document.notifications);
  document.notifications.telegram[event] = Boolean(enabled);
  await writeYaml(resolvedMissionPath, document);
  return {
    scope: "mission",
    mission_file: relativeToRepo(repoRoot, resolvedMissionPath),
    event,
    enabled: document.notifications.telegram[event],
  };
}

export async function gatewayNotifyStatus(repoRoot, event) {
  assertGatewayEvent(event);
  const policy = await ensureGatewayNotifyPolicy(repoRoot);
  const channelEnabled = Boolean(policy.channels?.telegram?.enabled);
  const envFile = await resolveTownCrierEnvPath(repoRoot, policy.channels?.telegram?.env_file);

  return {
    scope: "gateway",
    event,
    enabled: channelEnabled && Boolean(policy.events?.[event]?.telegram),
    channel_enabled: channelEnabled,
    env_file: envFile,
    policy_file: relativeToRepo(repoRoot, gatewayNotifyPolicyPath(repoRoot)),
  };
}

export async function missionNotifyStatus(repoRoot, missionFilePath, event) {
  assertMissionEvent(event);
  const resolvedMissionPath = resolveMissionPath(repoRoot, missionFilePath);
  const document = await loadYaml(resolvedMissionPath);
  const notifications = normalizeMissionNotifications(document.notifications);
  const gatewayStatus = await gatewayNotifyStatus(repoRoot, GATEWAY_NOTIFY_EVENTS[0]);
  const channelEnabled = gatewayStatus.channel_enabled;

  return {
    scope: "mission",
    mission_file: relativeToRepo(repoRoot, resolvedMissionPath),
    event,
    enabled: channelEnabled && Boolean(notifications.telegram[event]),
    channel_enabled: channelEnabled,
    policy_file: gatewayStatus.policy_file,
    env_file: gatewayStatus.env_file,
  };
}

export async function emitNotification(repoRoot, payload) {
  const scope = payload.scope;
  const text = String(payload.text ?? "").trim();
  if (!text) {
    return { ok: false, status: "missing_text", scope, event: payload.event ?? null };
  }

  if (scope === "gateway") {
    const status = await gatewayNotifyStatus(repoRoot, payload.event);
    if (!status.enabled) {
      return { ok: true, status: "disabled", ...status };
    }
    return enqueueNotification(repoRoot, {
      owner_scope: "gateway",
      event: payload.event,
      text,
      source_ref: payload.sourceRef ?? null,
      mission_ref: null,
      env_file: relativeToRepo(repoRoot, status.env_file),
    });
  }

  if (scope === "mission") {
    const status = await missionNotifyStatus(repoRoot, payload.missionFilePath ?? payload.missionId, payload.event);
    if (!status.enabled) {
      return { ok: true, status: "disabled", ...status };
    }
    return enqueueNotification(repoRoot, {
      owner_scope: "mission",
      event: payload.event,
      text,
      source_ref: payload.sourceRef ?? null,
      mission_ref: payload.missionId ?? status.mission_file,
      env_file: relativeToRepo(repoRoot, status.env_file),
    });
  }

  return { ok: false, status: "unsupported_scope", scope, event: payload.event ?? null };
}

export async function enqueueNotification(repoRoot, payload) {
  const request = {
    request_id: payload.request_id ?? `notify_${Date.now()}_${randomUUID()}`,
    owner_scope: payload.owner_scope,
    event: payload.event,
    text: payload.text,
    created_at: new Date().toISOString(),
    source_ref: payload.source_ref ?? null,
    mission_ref: payload.mission_ref ?? null,
    channel: "telegram",
    env_file: payload.env_file ?? relativeToRepo(repoRoot, await resolveTownCrierEnvPath(repoRoot)),
    attempt_count: 0,
  };

  const filePath = path.join(townCrierPendingRoot(repoRoot), `${request.request_id}.json`);
  await writeJson(filePath, request);

  return {
    ok: true,
    status: "queued",
    scope: request.owner_scope,
    event: request.event,
    request_id: request.request_id,
    queue_file: relativeToRepo(repoRoot, filePath),
  };
}

export async function townCrierStatus(repoRoot) {
  const pendingFiles = await listJsonFiles(townCrierPendingRoot(repoRoot));
  const processingFiles = await listJsonFiles(townCrierProcessingRoot(repoRoot));
  const envFile = await resolveTownCrierEnvPath(repoRoot);

  return {
    state_root: relativeToRepo(repoRoot, townCrierRoot(repoRoot)),
    env_file: relativeToRepo(repoRoot, envFile),
    env_exists: await pathExists(envFile),
    pending_count: pendingFiles.length,
    processing_count: processingFiles.length,
  };
}

export async function runTownCrier(repoRoot, options = {}) {
  const loop = Boolean(options.loop);
  const intervalSec = Math.max(Number(options.intervalSec ?? 60), 5);
  const limit = Math.max(Number(options.limit ?? 0), 0);

  if (!loop) {
    return processTownCrierOnce(repoRoot, { limit });
  }

  while (true) {
    await processTownCrierOnce(repoRoot, { limit });
    await sleep(intervalSec * 1000);
  }
}

export async function processTownCrierOnce(repoRoot, options = {}) {
  const pendingFiles = await listJsonFiles(townCrierPendingRoot(repoRoot));
  const limit = Math.max(Number(options.limit ?? 0), 0);
  const targets = limit > 0 ? pendingFiles.slice(0, limit) : pendingFiles;
  const results = [];

  for (const pendingFile of targets) {
    results.push(await processTownCrierFile(repoRoot, pendingFile));
  }

  const sent = results.filter((entry) => entry.status === "sent").length;
  const failed = results.filter((entry) => entry.status === "send_failed").length;
  return {
    ok: failed === 0,
    processed: results.length,
    sent,
    failed,
    results,
  };
}

export async function sendTelegramNow(repoRoot, payload) {
  const envFile = await resolveTownCrierEnvPath(repoRoot, payload.envFile);
  return sendTelegram(repoRoot, envFile, payload.event ?? "manual_send", payload.scope ?? "town_crier", payload.text, payload.extra ?? {});
}

export function normalizeGatewayNotifyPolicy(repoRoot, payload) {
  const base = buildDefaultGatewayNotifyPolicy(repoRoot);
  const normalized = structuredClone(base);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return normalized;
  }

  if (typeof payload.kind === "string" && payload.kind.trim()) {
    normalized.kind = payload.kind.trim();
  }

  if (typeof payload.scope === "string" && payload.scope.trim()) {
    normalized.scope = payload.scope.trim();
  }

  if (payload.channels && typeof payload.channels === "object" && !Array.isArray(payload.channels)) {
    const telegram = payload.channels.telegram;
    if (telegram && typeof telegram === "object" && !Array.isArray(telegram)) {
      if (typeof telegram.enabled === "boolean") {
        normalized.channels.telegram.enabled = telegram.enabled;
      }
      if (typeof telegram.env_file === "string" && telegram.env_file.trim()) {
        normalized.channels.telegram.env_file = telegram.env_file.trim();
      }
    }
  }

  if (payload.events && typeof payload.events === "object" && !Array.isArray(payload.events)) {
    for (const event of GATEWAY_NOTIFY_EVENTS) {
      const candidate = payload.events[event];
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof candidate.telegram === "boolean") {
        normalized.events[event].telegram = candidate.telegram;
      }
    }
  }

  if (typeof payload.updated_at === "string" && payload.updated_at.trim()) {
    normalized.updated_at = payload.updated_at.trim();
  }

  return normalized;
}

export function normalizeMissionNotifications(payload) {
  const base = defaultMissionNotifications();
  const normalized = structuredClone(base);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return normalized;
  }

  const telegram = payload.telegram;
  if (!telegram || typeof telegram !== "object" || Array.isArray(telegram)) {
    return normalized;
  }

  for (const event of MISSION_NOTIFY_EVENTS) {
    if (typeof telegram[event] === "boolean") {
      normalized.telegram[event] = telegram[event];
    }
  }

  return normalized;
}

async function processTownCrierFile(repoRoot, pendingFile) {
  const processingFile = path.join(townCrierProcessingRoot(repoRoot), path.basename(pendingFile));
  await fs.mkdir(path.dirname(processingFile), { recursive: true });
  await fs.rename(pendingFile, processingFile);

  const now = new Date().toISOString();

  try {
    const request = await readJson(processingFile);
    request.attempt_count = Math.max(Number(request.attempt_count ?? 0), 0) + 1;
    request.last_attempt_at = now;
    await writeJson(processingFile, request);

    const envFile = await resolveTownCrierEnvPath(repoRoot, request.env_file);
    const result = sendTelegram(repoRoot, envFile, request.event, request.owner_scope, request.text, {
      request_id: request.request_id,
      mission_ref: request.mission_ref ?? null,
      source_ref: request.source_ref ?? null,
    });

    await appendTownCrierLog(repoRoot, {
      at: now,
      event_type: "notify_delivery_attempt",
      request_id: request.request_id,
      owner_scope: request.owner_scope,
      notify_event: request.event,
      mission_ref: request.mission_ref ?? null,
      source_ref: request.source_ref ?? null,
      queue_file: relativeToRepo(repoRoot, processingFile),
      result_status: result.status,
      ok: result.ok,
      env_file: relativeToRepo(repoRoot, envFile),
      attempt_count: request.attempt_count,
      stderr: result.stderr ?? null,
      payload: result.payload ?? null,
    });

    if (result.ok) {
      await fs.rm(processingFile, { force: true });
      await writeTownCrierState(repoRoot, {
        last_run_at: now,
        last_status: "sent",
        last_request_id: request.request_id,
      });
      return { request_id: request.request_id, status: "sent" };
    }

    request.last_error = result.error ?? result.stderr ?? result.status;
    await writeJson(processingFile, request);
    await fs.rename(processingFile, pendingFile);
    await writeTownCrierState(repoRoot, {
      last_run_at: now,
      last_status: "send_failed",
      last_request_id: request.request_id,
    });
    return { request_id: request.request_id, status: "send_failed" };
  } catch (error) {
    await appendTownCrierLog(repoRoot, {
      at: now,
      event_type: "notify_runner_error",
      queue_file: relativeToRepo(repoRoot, processingFile),
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      await fs.rename(processingFile, pendingFile);
    } catch {
      // Best-effort rollback only.
    }
    return { request_id: path.basename(pendingFile, ".json"), status: "runner_error" };
  }
}

async function appendTownCrierLog(repoRoot, entry) {
  const stamp = new Date(entry.at ?? Date.now());
  const year = String(stamp.getUTCFullYear());
  const month = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  const filePath = path.join(townCrierLogRoot(repoRoot), year, `${year}-${month}.jsonl`);
  await appendJsonl(filePath, entry);
}

async function writeTownCrierState(repoRoot, value) {
  const filePath = path.join(townCrierStateRoot(repoRoot), "runner.json");
  await writeJson(filePath, value);
}

async function resolveTownCrierEnvPath(repoRoot, envFile = null) {
  if (envFile) {
    return path.isAbsolute(envFile) ? envFile : path.join(repoRoot, envFile);
  }

  return townCrierTelegramEnvPath(repoRoot);
}

function townCrierRoot(repoRoot) {
  return path.join(repoRoot, "guild_hall", "state", "town_crier");
}

function townCrierPendingRoot(repoRoot) {
  return path.join(townCrierRoot(repoRoot), "queue", "pending");
}

function townCrierProcessingRoot(repoRoot) {
  return path.join(townCrierRoot(repoRoot), "queue", "processing");
}

function townCrierLogRoot(repoRoot) {
  return path.join(townCrierRoot(repoRoot), "log");
}

async function listJsonFiles(rootPath) {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(rootPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function loadYaml(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return YAML.parse(raw) ?? {};
}

async function writeYaml(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, YAML.stringify(value), "utf8");
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function appendJsonl(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function buildDefaultGatewayNotifyPolicy(repoRoot) {
  return {
    kind: "gateway_notify_policy",
    scope: "gateway",
    channels: {
      telegram: {
        enabled: true,
        env_file: relativeToRepo(repoRoot, townCrierTelegramEnvPath(repoRoot)),
      },
    },
    events: Object.fromEntries(GATEWAY_NOTIFY_EVENTS.map((event) => [event, { telegram: false }])),
    updated_at: null,
  };
}

function resolveMissionPath(repoRoot, missionIdOrPath) {
  if (!missionIdOrPath) {
    throw new Error("mission id or mission file path is required");
  }

  const asString = String(missionIdOrPath).trim();
  if (asString.endsWith(".yaml")) {
    return path.isAbsolute(asString) ? asString : path.join(repoRoot, asString);
  }

  return missionPathFromId(repoRoot, asString);
}

function sendTelegram(repoRoot, envFile, event, scope, text, extra = {}) {
  const scriptPath = path.join(repoRoot, "guild_hall", "town_crier", "telegram_send.py");
  const result = spawnSync("python3", [scriptPath, "--env-file", envFile, "--text", text, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    return {
      ok: false,
      status: "send_failed",
      scope,
      event,
      error: result.error.message,
      env_file: relativeToRepo(repoRoot, envFile),
      ...extra,
    };
  }

  let payload = {};
  if (result.stdout.trim()) {
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      payload = { stdout: result.stdout.trim() };
    }
  }

  return {
    ok: result.status === 0,
    status: result.status === 0 ? "sent" : "send_failed",
    scope,
    event,
    env_file: relativeToRepo(repoRoot, envFile),
    command_status: result.status ?? 1,
    stderr: result.stderr.trim() || null,
    payload,
    ...extra,
  };
}

function assertGatewayEvent(event) {
  if (!GATEWAY_NOTIFY_EVENTS.includes(event)) {
    throw new Error(`unsupported gateway notify event: ${event}`);
  }
}

function assertMissionEvent(event) {
  if (!MISSION_NOTIFY_EVENTS.includes(event)) {
    throw new Error(`unsupported mission notify event: ${event}`);
  }
}

function normalizeRepoPath(value) {
  return value.split(path.sep).join("/");
}

function relativeToRepo(repoRoot, absolutePath) {
  return normalizeRepoPath(path.relative(repoRoot, absolutePath) || ".");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
