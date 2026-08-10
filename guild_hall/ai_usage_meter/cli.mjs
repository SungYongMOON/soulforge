#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildUsageEvents,
  collectUsageEvents,
  findCodexSessionFiles,
  findSessionFileById,
  findSessionFilesById,
  loadConfig,
  loadPersistedUsageEvents,
  loadRateCard,
  normalizeConfig,
  parseCodexSessionFile,
  persistUsageEvents,
  sessionFileLooksUsable,
  sha256,
  summarizeUsageEvents,
} from "./usage_meter.mjs";
import {
  loadUsageBindingSet,
  mergeUsageBindings,
  upsertUsageBinding,
} from "./binding_store.mjs";
import { writeUsageCsv, writeUsageDashboard } from "./dashboard.mjs";
import {
  buildInstructionManifest,
  persistInstructionManifest,
  runCodexPromptInput,
} from "./instruction_manifest.mjs";
import {
  evidenceDigest,
  persistAiQualityResult,
  persistAiToolEvent,
  persistAiUsageReplayReceipt,
  persistAiWorkRun,
  validateAiQualityResult,
  validateAiToolEvent,
  validateAiUsageReplayReceipt,
  validateAiWorkRun,
} from "./evidence_ledger.mjs";
import {
  loadBoardUsageSnapshot,
  writeBoardUsageSnapshot,
} from "./board_snapshot.mjs";
import {
  loadBoardUsageHistorySnapshot,
  writeBoardUsageHistorySnapshot,
} from "./board_history_snapshot.mjs";
import {
  createLifecycleReceipt,
  createLifecycleSnapshot,
  loadLifecycleReceipts,
  persistLifecycleReceipt,
  persistLifecycleReceipts,
  writeLifecycleSnapshot,
} from "./lifecycle_receipt.mjs";
import {
  JSONL_LIFECYCLE_SOURCE,
  jsonlLifecycleReceiptInputs,
  persistJsonlLifecycleSnapshot,
  reconcileJsonlLifecycle,
} from "./jsonl_lifecycle.mjs";

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RATE_CARD = path.join(MODULE_ROOT, "rate_card.v1.json");
const EMERGENCY_DISABLE_FILE = path.join("control", "emergency-disable.v1.json");
const HOOK_STATE_ROOT_SEGMENTS = ["guild_hall", "state", "operations", "ai_usage_meter"];
const execFileAsync = promisify(execFile);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) fail(`argument_unexpected:${token}`);
    const name = token.slice(2);
    const next = rest[index + 1];
    const value = next && !next.startsWith("--") ? (index += 1, next) : true;
    const existing = options.get(name);
    if (existing === undefined) options.set(name, value);
    else if (Array.isArray(existing)) existing.push(value);
    else options.set(name, [existing, value]);
  }
  return { command, options };
}

function values(options, name) {
  const value = options.get(name);
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function value(options, name, fallback = null) {
  const list = values(options, name);
  return list.length ? list.at(-1) : fallback;
}

function flag(options, name) {
  return options.get(name) === true;
}

function defaultCodexRoot() {
  return path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

async function findRepoRoot(start) {
  let current = path.resolve(start);
  while (true) {
    try {
      const info = await fs.stat(path.join(current, ".git"));
      if (info.isDirectory() || info.isFile()) return current;
    } catch {
      // Continue toward the filesystem root.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function defaultHookStateRoot() {
  return path.join(defaultCodexRoot(), "usage-meter");
}

async function gitOutput(args, cwd) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    timeout: 2000,
    maxBuffer: 4096,
  });
  return String(stdout).replace(/\r?\n$/u, "");
}

async function resolveCanonicalHookStateRoot(cwd = process.cwd()) {
  const fallback = path.resolve(defaultHookStateRoot());
  try {
    const bare = await gitOutput(["rev-parse", "--is-bare-repository"], cwd);
    if (bare !== "false") return { stateRoot: fallback, fallbackReason: "hook_common_repo_not_nonbare" };
    const declaredCommonDir = await gitOutput(["rev-parse", "--git-common-dir"], cwd);
    if (!declaredCommonDir || declaredCommonDir.includes("\u0000") || /[\r\n]/u.test(declaredCommonDir)) {
      return { stateRoot: fallback, fallbackReason: "hook_common_dir_invalid" };
    }
    const commonDir = await fs.realpath(path.resolve(cwd, declaredCommonDir));
    const commonInfo = await fs.stat(commonDir);
    if (!commonInfo.isDirectory() || path.basename(commonDir).toLowerCase() !== ".git") {
      return { stateRoot: fallback, fallbackReason: "hook_common_dir_unsafe" };
    }
    const canonicalRoot = path.dirname(commonDir);
    const canonicalMarker = await fs.realpath(path.join(canonicalRoot, ".git"));
    if (path.resolve(canonicalMarker) !== path.resolve(commonDir)) {
      return { stateRoot: fallback, fallbackReason: "hook_common_root_mismatch" };
    }
    const canonicalBare = await gitOutput(["-C", canonicalRoot, "rev-parse", "--is-bare-repository"], canonicalRoot);
    if (canonicalBare !== "false") return { stateRoot: fallback, fallbackReason: "hook_common_root_not_nonbare" };
    return {
      stateRoot: path.join(canonicalRoot, ...HOOK_STATE_ROOT_SEGMENTS),
      fallbackReason: null,
    };
  } catch {
    return { stateRoot: fallback, fallbackReason: "hook_common_root_unavailable" };
  }
}

async function resolveHookStateRoot(options, cwd = process.cwd()) {
  const explicitStateRoot = value(options, "state-root", null);
  if (typeof explicitStateRoot === "string") {
    return { stateRoot: path.resolve(explicitStateRoot), fallbackReason: null };
  }
  if (process.env.SOULFORGE_AI_USAGE_METER_STATE_ROOT) {
    return { stateRoot: path.resolve(process.env.SOULFORGE_AI_USAGE_METER_STATE_ROOT), fallbackReason: null };
  }
  return resolveCanonicalHookStateRoot(cwd);
}

async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  raw = raw.replace(/^\uFEFF/u, "");
  if (!raw.trim()) fail("hook_input_missing");
  try {
    return JSON.parse(raw);
  } catch {
    fail("hook_input_invalid");
  }
}

async function readJsonFile(filePath, code = "json_input_invalid") {
  let raw;
  try {
    raw = await fs.readFile(path.resolve(String(filePath)), "utf8");
  } catch {
    fail(`${code}_unreadable`);
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/u, ""));
  } catch {
    fail(code);
  }
}

async function loadEffectiveConfig(options, { repoRoot = null } = {}) {
  const configPath = value(options, "config", process.env.SOULFORGE_AI_USAGE_METER_CONFIG || null);
  if (configPath) return loadConfig(configPath);
  return normalizeConfig({
    organization_id: process.env.SOULFORGE_AI_USAGE_ORGANIZATION || "soulforge",
    default_team_id: process.env.SOULFORGE_AI_USAGE_TEAM || "unassigned",
    default_project_id: process.env.SOULFORGE_AI_USAGE_PROJECT || "unassigned",
    node_id: process.env.SOULFORGE_AI_USAGE_NODE || "local-node",
    service_tier: process.env.SOULFORGE_AI_USAGE_SERVICE_TIER
      || value(options, "service-tier", "standard"),
    project_bindings: repoRoot ? [{ cwd_prefix: repoRoot, project_id: "soulforge" }] : [],
  });
}

function filterEvents(events, options) {
  const filters = [
    ["organization-id", (event) => event.organization_id],
    ["team-id", (event) => event.team_id],
    ["project-id", (event) => event.project_id],
    ["work-id", (event) => event.work_id],
    ["thread-id", (event) => event.thread_id],
    ["turn-id", (event) => event.turn_id],
    ["model-id", (event) => event.model.id],
    ["agent-id", (event) => event.actor.agent_id],
  ].map(([name, read]) => ({ read, accepted: new Set(values(options, name).map(String)) }));
  const from = value(options, "from");
  const to = value(options, "to");
  if (from && !Number.isFinite(Date.parse(String(from)))) fail("from_timestamp_invalid");
  if (to && !Number.isFinite(Date.parse(String(to)))) fail("to_timestamp_invalid");
  return events.filter((event) => {
    const started = event.time.started_at;
    return filters.every(({ read, accepted }) => !accepted.size || accepted.has(read(event)))
      && (!from || started >= new Date(String(from)).toISOString())
      && (!to || started < new Date(String(to)).toISOString());
  });
}

async function dynamicConfig(config, stateRoot) {
  if (!stateRoot) return config;
  return mergeUsageBindings(config, await loadUsageBindingSet(path.resolve(String(stateRoot))));
}

async function readEmergencyDisable(stateRoot) {
  const file = path.join(stateRoot, EMERGENCY_DISABLE_FILE);
  let control;
  try {
    control = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    fail("emergency_disable_state_invalid");
  }
  if (!control || typeof control !== "object" || Array.isArray(control)
    || Object.keys(control).sort().join("\u0000") !== ["disabled", "schema_version", "updated_at"].join("\u0000")
    || control.schema_version !== "soulforge.ai_usage_meter_emergency_disable.v1"
    || control.disabled !== true
    || typeof control.updated_at !== "string"
    || !Number.isFinite(Date.parse(control.updated_at))) {
    fail("emergency_disable_state_invalid");
  }
  return true;
}

async function setEmergencyDisable(stateRoot, disabled) {
  const file = path.join(stateRoot, EMERGENCY_DISABLE_FILE);
  if (!disabled) {
    await fs.rm(file, { force: true });
    return { enabled: true };
  }
  await writeRuntimeJson(file, {
    schema_version: "soulforge.ai_usage_meter_emergency_disable.v1",
    disabled: true,
    updated_at: new Date().toISOString(),
  });
  return { enabled: false };
}

async function emergencyControlCommand(options, disabled) {
  const rootResolution = await resolveHookStateRoot(options);
  const root = rootResolution.stateRoot;
  const wasDisabled = await readEmergencyDisable(root);
  const result = wasDisabled === disabled
    ? { enabled: !disabled }
    : await setEmergencyDisable(root, disabled);
  await writeHookHealth(
    root,
    disabled ? "disabled" : "ok",
    rootResolution.fallbackReason ?? (disabled ? "emergency_disable_active" : "emergency_disable_cleared"),
  );
  return {
    schema_version: "soulforge.ai_usage_meter_emergency_control_result.v1",
    enabled: result.enabled,
    changed: disabled ? !wasDisabled : wasDisabled,
  };
}

async function instructionManifestCommand(options) {
  const cwd = path.resolve(String(value(options, "cwd", process.cwd())));
  const repoRootOption = value(options, "repo-root", null);
  const repoRoot = repoRootOption ? path.resolve(String(repoRootOption)) : await findRepoRoot(cwd);
  const approvedRoots = values(options, "approved-root").map((item) => path.resolve(String(item)));
  if (!approvedRoots.length) approvedRoots.push(repoRoot || cwd);
  const modelId = value(options, "model-id", null);
  const reasoningEffort = value(options, "reasoning-effort", null);
  const disabledFeatures = values(options, "disable-feature").map(String);
  const manifest = await buildInstructionManifest({
    cwd,
    repoRoot,
    approvedPublicRoots: approvedRoots,
    runner: ({ cwd: probeCwd }) => runCodexPromptInput({
      cwd: probeCwd,
      modelId: modelId === null ? null : String(modelId),
      reasoningEffort: reasoningEffort === null ? null : String(reasoningEffort),
      disabledFeatures,
    }),
  });
  let persistence = null;
  if (flag(options, "apply")) {
    const stateRoot = value(options, "state-root", null);
    if (!stateRoot) fail("state_root_required_for_apply");
    persistence = await persistInstructionManifest(path.resolve(String(stateRoot)), manifest);
  }
  return {
    schema_version: "soulforge.ai_instruction_manifest_result.v1",
    mode: flag(options, "apply") ? "apply" : "dry_run",
    manifest,
    persistence,
  };
}

const EVIDENCE_KINDS = Object.freeze({
  work_run: { validate: validateAiWorkRun, persist: persistAiWorkRun, identity: "event_id" },
  quality_result: { validate: validateAiQualityResult, persist: persistAiQualityResult, identity: "event_id" },
  tool_event: { validate: validateAiToolEvent, persist: persistAiToolEvent, identity: "event_id" },
  replay_receipt: { validate: validateAiUsageReplayReceipt, persist: persistAiUsageReplayReceipt, identity: "receipt_id" },
});

async function evidenceRecordCommand(options) {
  const kind = String(value(options, "kind", ""));
  const input = value(options, "input", null);
  const selected = EVIDENCE_KINDS[kind];
  if (!selected) fail("evidence_kind_invalid");
  if (!input) fail("evidence_input_required");
  const record = selected.validate(await readJsonFile(input, "evidence_input_invalid"));
  let persistence = null;
  if (flag(options, "apply")) {
    const stateRoot = value(options, "state-root", null);
    if (!stateRoot) fail("state_root_required_for_apply");
    persistence = await selected.persist(path.resolve(String(stateRoot)), record);
  }
  return {
    schema_version: "soulforge.ai_evidence_record_result.v1",
    mode: flag(options, "apply") ? "apply" : "dry_run",
    kind,
    record_id: record[selected.identity],
    record_digest: evidenceDigest(record),
    valid: true,
    persistence,
  };
}

async function collectCommand(options) {
  const sessionsRoot = path.resolve(value(options, "sessions-root", path.join(defaultCodexRoot(), "sessions")));
  const explicitFiles = values(options, "session-file").map((item) => path.resolve(String(item)));
  const scopedThreadIds = values(options, "thread-id").map(String);
  const sessionFiles = explicitFiles.length
    ? explicitFiles
    : scopedThreadIds.length
      ? [...new Set((await Promise.all(scopedThreadIds.map((threadId) => (
        findSessionFilesById(sessionsRoot, threadId)
      )))).flat())].sort((left, right) => left.localeCompare(right, "en"))
      : await findCodexSessionFiles(sessionsRoot);
  const scopedFilterNames = [
    "organization-id", "team-id", "project-id", "work-id", "thread-id", "turn-id",
    "model-id", "agent-id",
  ];
  const authoritativeCoverage = explicitFiles.length === 0
    && scopedFilterNames.every((name) => values(options, name).length === 0)
    && !value(options, "from")
    && !value(options, "to");
  const repoRoot = await findRepoRoot(process.cwd());
  let config = await loadEffectiveConfig(options, { repoRoot });
  config = await dynamicConfig(config, value(options, "state-root"));
  if (value(options, "service-tier")) config.service_tier = String(value(options, "service-tier"));
  const rateCard = await loadRateCard(path.resolve(value(options, "rate-card", DEFAULT_RATE_CARD)));
  const collected = await collectUsageEvents({
    sessionFiles,
    config,
    rateCard,
    includeActive: flag(options, "include-active"),
    sourceRoot: sessionsRoot,
    continueOnError: true,
  });
  const events = filterEvents(collected.events, options);
  let persistence = null;
  let coverage = null;
  if (flag(options, "apply")) {
    const stateRoot = value(options, "state-root");
    if (!stateRoot) fail("state_root_required_for_apply");
    const resolvedStateRoot = path.resolve(String(stateRoot));
    persistence = await persistUsageEvents(resolvedStateRoot, events);
    coverage = {
      schema_version: "soulforge.ai_usage_meter_coverage.v1",
      observed_at: new Date().toISOString(),
      scope: authoritativeCoverage ? "full_sessions_root" : "scoped_request",
      authoritative_latest_updated: authoritativeCoverage,
      session_file_count: sessionFiles.length,
      parsed_session_count: collected.parsed_session_count,
      issue_count: collected.issues.length,
      issues: collected.issues,
      observed_event_count: collected.observed_event_count,
      duplicate_event_observation_count: collected.duplicate_event_observation_count,
      unique_event_count: events.length,
    };
    if (authoritativeCoverage) {
      coverage = await writeRuntimeJson(path.join(resolvedStateRoot, "coverage", "latest.json"), coverage);
    }
  }
  return {
    schema_version: "soulforge.ai_usage_meter_collect_result.v1",
    mode: flag(options, "apply") ? "apply" : "dry_run",
    session_file_count: sessionFiles.length,
    parsed_session_count: collected.parsed_session_count,
    issue_count: collected.issues.length,
    issues: collected.issues,
    observed_event_count: collected.observed_event_count,
    duplicate_event_observation_count: collected.duplicate_event_observation_count,
    event_count: events.length,
    summary: summarizeUsageEvents(events),
    persistence,
    coverage,
  };
}

async function reportCommand(options) {
  const stateRoot = value(options, "state-root");
  if (!stateRoot) fail("state_root_required");
  const events = filterEvents(await loadPersistedUsageEvents(path.resolve(String(stateRoot))), options);
  return summarizeUsageEvents(events);
}

async function bindCommand(options) {
  const stateRoot = value(options, "state-root");
  if (!stateRoot) fail("state_root_required");
  const threadId = value(options, "thread-id");
  const workId = value(options, "work-id");
  if (!threadId) fail("thread_id_required");
  if (!workId) fail("work_id_required");
  return upsertUsageBinding(path.resolve(String(stateRoot)), {
    thread_id: String(threadId),
    turn_id: value(options, "turn-id") === null ? null : String(value(options, "turn-id")),
    work_id: String(workId),
    project_id: value(options, "project-id") === null ? null : String(value(options, "project-id")),
    team_id: value(options, "team-id") === null ? null : String(value(options, "team-id")),
    role: value(options, "role") === null ? null : String(value(options, "role")),
  });
}

async function dashboardCommand(options) {
  const stateRoot = value(options, "state-root");
  if (!stateRoot) fail("state_root_required");
  const root = path.resolve(String(stateRoot));
  const events = filterEvents(await loadPersistedUsageEvents(root), options);
  const output = path.resolve(String(value(options, "output", path.join(root, "dashboard.html"))));
  let coverage = null;
  try {
    coverage = JSON.parse(await fs.readFile(path.join(root, "coverage", "latest.json"), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  let hookHealth = null;
  try {
    hookHealth = JSON.parse(await fs.readFile(path.join(root, "health", "latest.json"), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  let pendingEventCount = 0;
  try {
    const entries = await fs.readdir(path.join(root, "pending"), { recursive: true });
    pendingEventCount = entries.filter((entry) => String(entry).endsWith(".json")).length;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return writeUsageDashboard(output, events, {
    title: String(value(options, "title", "Soulforge AI 사용량 미터")),
    coverage,
    operational: {
      hook_status: hookHealth?.status ?? "unknown",
      hook_observed_at: hookHealth?.observed_at ?? null,
      pending_event_count: pendingEventCount,
    },
  });
}

async function boardSnapshotCommand(options) {
  const stateRoot = value(options, "state-root", null);
  const output = value(options, "output", null);
  if (!stateRoot) fail("state_root_required");
  if (!output) fail("board_snapshot_output_required");
  const threadIds = values(options, "thread-id").map(String);
  const snapshot = await loadBoardUsageSnapshot(path.resolve(String(stateRoot)), {
    threadIds: threadIds.length ? threadIds : null,
  });
  await writeBoardUsageSnapshot(path.resolve(String(output)), snapshot);
  return snapshot;
}

async function boardHistorySnapshotCommand(options) {
  const stateRoot = value(options, "state-root", null);
  const output = value(options, "output", null);
  if (!stateRoot) fail("state_root_required");
  if (!output) fail("board_history_snapshot_output_required");
  const topN = value(options, "top-n", null);
  const referenceAt = value(options, "reference-at", null);
  const snapshot = await loadBoardUsageHistorySnapshot(path.resolve(String(stateRoot)), {
    threadIds: values(options, "thread-id").map(String),
    topN: topN === null ? undefined : Number(topN),
    referenceAt: referenceAt === null ? undefined : String(referenceAt),
  });
  await writeBoardUsageHistorySnapshot(path.resolve(String(output)), snapshot);
  return snapshot;
}

async function lifecycleSnapshotCommand(options) {
  const stateRoot = value(options, "state-root", null);
  if (!stateRoot) fail("state_root_required");
  const snapshot = createLifecycleSnapshot(
    await loadLifecycleReceipts(path.resolve(String(stateRoot))),
    { includeIdentities: flag(options, "include-identities") },
  );
  const output = value(options, "output", null);
  if (output) await writeLifecycleSnapshot(path.resolve(String(output)), snapshot);
  return snapshot;
}

function positiveIntegerOption(options, name, fallback) {
  const raw = value(options, name, null);
  if (raw === null) return fallback;
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/u.test(raw)) fail(`${name.replaceAll("-", "_")}_invalid`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) fail(`${name.replaceAll("-", "_")}_invalid`);
  return parsed;
}

async function lifecycleReconcileCommand(options) {
  const rootResolution = await resolveHookStateRoot(options);
  const stateRoot = rootResolution.stateRoot;
  const apply = flag(options, "apply");
  if (apply && await readEmergencyDisable(stateRoot)) {
    await writeHookHealth(stateRoot, "disabled", rootResolution.fallbackReason ?? "emergency_disable_active");
    return {
      schema_version: "soulforge.ai_usage_jsonl_lifecycle_reconcile_result.v1",
      mode: "apply",
      source: JSONL_LIFECYCLE_SOURCE,
      producer_status: "disabled",
      snapshot: null,
      persistence: null,
    };
  }
  try {
    const sessionsRoot = path.resolve(value(options, "sessions-root", path.join(defaultCodexRoot(), "sessions")));
    const snapshot = await reconcileJsonlLifecycle({
      sessionsRoot,
      threadIds: values(options, "thread-id").map(String),
      maxSessionCount: positiveIntegerOption(options, "max-sessions", undefined),
      afterThreadId: value(options, "after-thread-id", null),
    });
    let persistence = null;
    if (apply) {
      const receiptInputs = jsonlLifecycleReceiptInputs(snapshot);
      const receipts = receiptInputs.map((input) => createLifecycleReceipt(input, { observedAt: input.observed_at }));
      persistence = {
        jsonl_snapshot: await persistJsonlLifecycleSnapshot(stateRoot, snapshot),
        lifecycle_receipts: await persistLifecycleReceipts(stateRoot, receipts),
      };
      const healthStatus = snapshot.health.status === "available"
        ? "ok"
        : (snapshot.health.status === "partial" ? "deferred" : "hold");
      await writeHookHealth(
        stateRoot,
        healthStatus,
        rootResolution.fallbackReason ?? snapshot.health.reason_code ?? "jsonl_lifecycle_reconcile_ok",
      );
    }
    return {
      schema_version: "soulforge.ai_usage_jsonl_lifecycle_reconcile_result.v1",
      mode: apply ? "apply" : "dry_run",
      source: JSONL_LIFECYCLE_SOURCE,
      producer_status: "enabled",
      snapshot,
      persistence,
    };
  } catch (error) {
    if (apply) await writeHookHealth(stateRoot, "hold", "jsonl_lifecycle_reconcile_failed");
    throw error;
  }
}

async function csvCommand(options) {
  const stateRoot = value(options, "state-root");
  const output = value(options, "output");
  if (!stateRoot) fail("state_root_required");
  if (!output) fail("output_required");
  const events = filterEvents(await loadPersistedUsageEvents(path.resolve(String(stateRoot))), options);
  return writeUsageCsv(path.resolve(String(output)), events, {
    groupBy: String(value(options, "group-by", "work")),
  });
}

async function doctorCommand(options) {
  const codexRoot = defaultCodexRoot();
  const sessionsRoot = path.resolve(value(options, "sessions-root", path.join(codexRoot, "sessions")));
  const stateRoot = value(options, "state-root");
  const sessionFiles = await findCodexSessionFiles(sessionsRoot);
  const latest = sessionFiles.at(-1) ?? null;
  const checks = {
    node_supported: Number(process.versions.node.split(".")[0]) >= 22,
    sessions_root_readable: sessionFiles.length > 0,
    latest_session_usable: latest ? await sessionFileLooksUsable(latest) : false,
    rate_card_readable: false,
    state_root_configured: Boolean(stateRoot),
  };
  try {
    await loadRateCard(path.resolve(value(options, "rate-card", DEFAULT_RATE_CARD)));
    checks.rate_card_readable = true;
  } catch {
    checks.rate_card_readable = false;
  }
  return {
    schema_version: "soulforge.ai_usage_meter_doctor.v1",
    ok: Object.entries(checks)
      .filter(([key]) => key !== "state_root_configured")
      .every(([, passed]) => passed),
    checks,
    session_file_count: sessionFiles.length,
    latest_session_ref: latest ? path.basename(latest) : null,
  };
}

async function writeRuntimeJson(target, payload) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return payload;
}

async function writeHookHealth(stateRoot, status, detail = null) {
  const safeDetail = typeof detail === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(detail)
    ? detail
    : "hook_failed";
  const payload = {
    schema_version: "soulforge.ai_usage_meter_hook_health.v1",
    observed_at: new Date().toISOString(),
    status,
    detail: detail === null ? null : safeDetail,
  };
  try {
    const observedMonth = payload.observed_at.slice(0, 7);
    const historyName = `${payload.observed_at.replaceAll(/[:.]/gu, "-")}-${process.pid}-${randomBytes(6).toString("hex")}.json`;
    await writeRuntimeJson(path.join(stateRoot, "health", "history", observedMonth, historyName), payload);
  } catch {
    // Hook health history must never interfere with Codex completion.
  }
  try {
    await writeRuntimeJson(path.join(stateRoot, "health", "latest.json"), payload);
  } catch {
    // The convenience snapshot is best effort; history remains authoritative.
  }
}

async function hookCommand(options) {
  let stateRoot = defaultHookStateRoot();
  try {
    const repoRoot = await findRepoRoot(process.cwd());
    const rootResolution = await resolveHookStateRoot(options);
    stateRoot = rootResolution.stateRoot;
    if (await readEmergencyDisable(stateRoot)) {
      await writeHookHealth(stateRoot, "disabled", rootResolution.fallbackReason ?? "emergency_disable_active");
      return {};
    }
    const receipt = createLifecycleReceipt(await readStdinJson());
    await persistLifecycleReceipt(stateRoot, receipt);
    if (receipt.source_event !== "Stop" && receipt.source_event !== "SubagentStop") {
      await writeHookHealth(stateRoot, "ok", rootResolution.fallbackReason);
      return {};
    }
    const sessionsRoot = path.resolve(value(options, "sessions-root", path.join(defaultCodexRoot(), "sessions")));
    const isSubagentStop = receipt.source_event === "SubagentStop";
    const lookupId = isSubagentStop ? receipt.identity.agent_id : receipt.identity.session_id;
    const sessionFile = lookupId ? await findSessionFileById(sessionsRoot, lookupId) : null;
    if (!sessionFile) fail("hook_session_file_not_found");
    let config = await loadEffectiveConfig(options, { repoRoot });
    config = await dynamicConfig(config, stateRoot);
    const rateCard = await loadRateCard(path.resolve(value(options, "rate-card", DEFAULT_RATE_CARD)));
    const forcedComplete = { sourceRoot: sessionsRoot };
    const sessionFiles = [sessionFile];
    if (!isSubagentStop && receipt.identity.session_id) {
      const canonicalSessionFiles = await findSessionFilesById(sessionsRoot, receipt.identity.session_id);
      for (const canonicalSessionFile of canonicalSessionFiles) {
        if (path.resolve(canonicalSessionFile) !== path.resolve(sessionFile)) {
          sessionFiles.push(path.resolve(canonicalSessionFile));
        }
      }
    }
    let targetThreadId = null;
    if (isSubagentStop) {
      const childPreview = await parseCodexSessionFile(sessionFile, {
        includeActive: true,
        sourceRoot: sessionsRoot,
      });
      targetThreadId = childPreview.thread_id;
      const incompleteTurnIds = childPreview.turns
        .filter((turn) => turn.status === "active")
        .map((turn) => turn.turn_id);
      if (incompleteTurnIds.length) forcedComplete[path.resolve(sessionFile)] = incompleteTurnIds;
      const parentPreferred = childPreview.parent_thread_id
        ? await findSessionFileById(sessionsRoot, childPreview.parent_thread_id)
        : null;
      const includedSessionFiles = new Set(sessionFiles.map((item) => path.resolve(item)));
      const previewByFile = new Map([[path.resolve(sessionFile), childPreview]]);
      const addSessionObservation = async (file) => {
        if (!file) return null;
        const resolved = path.resolve(file);
        if (previewByFile.has(resolved)) return previewByFile.get(resolved);
        includedSessionFiles.add(resolved);
        sessionFiles.push(resolved);
        const preview = await parseCodexSessionFile(resolved, {
          includeActive: true,
          sourceRoot: sessionsRoot,
        });
        previewByFile.set(resolved, preview);
        if (preview.thread_id === targetThreadId) {
          const activeTurnIds = preview.turns
            .filter((turn) => turn.status === "active")
            .map((turn) => turn.turn_id);
          if (activeTurnIds.length) forcedComplete[resolved] = activeTurnIds;
        }
        return preview;
      };
      for (const childCopy of await findSessionFilesById(sessionsRoot, targetThreadId)) {
        await addSessionObservation(childCopy);
      }
      await addSessionObservation(parentPreferred);
      const pendingAncestorIds = childPreview.parent_thread_id ? [childPreview.parent_thread_id] : [];
      const visitedAncestorIds = new Set();
      while (pendingAncestorIds.length) {
        const ancestorId = pendingAncestorIds.shift();
        if (!ancestorId || visitedAncestorIds.has(ancestorId)) continue;
        visitedAncestorIds.add(ancestorId);
        const ancestorFiles = await findSessionFilesById(sessionsRoot, ancestorId);
        for (const ancestorFile of ancestorFiles) {
          const ancestorPreview = await addSessionObservation(ancestorFile);
          if (ancestorPreview?.parent_thread_id) pendingAncestorIds.push(ancestorPreview.parent_thread_id);
        }
      }
    }
    if (!isSubagentStop) {
      for (const file of sessionFiles) {
        const preview = await parseCodexSessionFile(file, {
          includeActive: true,
          sourceRoot: sessionsRoot,
        });
        const observedTurnIds = receipt.identity.turn_id
          ? [receipt.identity.turn_id]
          : preview.turns.filter((turn) => turn.status === "active").map((turn) => turn.turn_id);
        if (observedTurnIds.length) forcedComplete[path.resolve(file)] = observedTurnIds;
      }
    }
    let events = await buildUsageEvents({
      sessionFiles,
      config,
      rateCard,
      includeActive: true,
      forcedComplete,
    });
    if (isSubagentStop) {
      events = events.filter((event) => event.thread_id === targetThreadId);
    } else if (receipt.identity.turn_id) {
      events = events.filter((event) => event.turn_id === receipt.identity.turn_id);
    }
    if (!events.length) fail("hook_turn_usage_not_observed");
    const persistence = await persistUsageEvents(stateRoot, events);
    if (persistence.pending) {
      await writeHookHealth(
        stateRoot,
        "deferred",
        rootResolution.fallbackReason ?? `usage_ledger_busy_pending:${persistence.pending}`,
      );
    } else {
      await writeHookHealth(stateRoot, "ok", rootResolution.fallbackReason);
    }
  } catch (error) {
    await writeHookHealth(stateRoot, "hold", typeof error?.code === "string" ? error.code : "hook_failed");
  }
  return {};
}

function help() {
  return {
    name: "Soulforge AI Usage Meter",
    commands: {
      collect: "Parse Codex session JSONL. Dry-run by default; add --apply --state-root <path> to persist metadata-only events.",
      report: "Summarize a persisted local ledger: --state-root <path>.",
      bind: "Bind a Codex thread or turn to a work ID in the local metadata-only store.",
      dashboard: "Write a local, self-contained HTML dashboard from the filtered ledger.",
      csv: "Write a filtered CSV grouped by organization, team, project, work, model, agent, node, role, or reasoning_effort.",
      "board-snapshot": "Write a redacted local snapshot for the existing read-only Workspace Board.",
      "board-history-snapshot": "Write an exact-thread-scoped usage-history sidecar for the read-only Workspace Board.",
      "lifecycle-snapshot": "Emit a local lifecycle aggregate; add --include-identities only for an ignored local exact-ID projection.",
      "lifecycle-reconcile": "Read bounded Codex JSONL metadata and optionally persist the JSONL lifecycle fallback plus compatible Board projection.",
      disable: "Disable local lifecycle collection for one state root until enable is called.",
      enable: "Re-enable local lifecycle collection for one state root.",
      doctor: "Check Node, Codex session, and rate-card readiness.",
      "instruction-manifest": "Probe the effective Codex instruction chain and emit hashes/bytes only; add --apply to persist.",
      "evidence-record": "Validate a metadata-only work_run, quality_result, tool_event, or replay_receipt JSON; add --apply to persist.",
      hook: "Non-blocking Codex lifecycle hook. Reads hook JSON on stdin.",
    },
    common_options: [
      "--config <private config JSON>",
      "--sessions-root <Codex sessions directory>",
      "--session-file <rollout JSONL> (repeatable)",
      "--thread-id <id> / --turn-id <id> (repeatable filters)",
      "--work-id / --project-id / --team-id / --model-id / --agent-id (filters; bind uses work/project/team)",
      "--from <ISO timestamp> / --to <ISO timestamp> (inclusive/exclusive time window)",
      "--rate-card <rate card JSON>",
      "--service-tier standard|fast",
      "--state-root <local state directory>",
      "instruction-manifest: [--cwd <path>] [--repo-root <path>] [--approved-root <path> (repeatable)] [--model-id <id>] [--reasoning-effort <effort>] [--disable-feature <feature>] [--apply]",
      "evidence-record: --kind work_run|quality_result|tool_event|replay_receipt --input <JSON path> [--state-root <path> --apply]",
      "dashboard: --output <HTML path> (defaults to <state-root>/dashboard.html)",
      "csv: --output <CSV path> [--group-by work]",
      "board-snapshot: --state-root <local state directory> --output <local JSON path> [--thread-id <exact ID> (repeatable)]",
      "board-history-snapshot: --state-root <local state directory> --thread-id <exact ID> (repeatable) --output <local JSON path> [--top-n 1-50] [--reference-at <ISO timestamp>]",
      "lifecycle-snapshot: --state-root <local state directory> [--output <local JSON path>] [--include-identities]",
      "lifecycle-reconcile: [--thread-id <exact ID> (repeatable)] [--max-sessions <1-10000>] [--after-thread-id <exact ID>] [--sessions-root <Codex sessions>] [--state-root <local state>] [--apply]",
      "disable / enable: [--state-root <local state directory>] (defaults to the safe git common-checkout state root)",
    ],
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === "collect") return collectCommand(options);
  if (command === "report") return reportCommand(options);
  if (command === "bind") return bindCommand(options);
  if (command === "dashboard") return dashboardCommand(options);
  if (command === "csv") return csvCommand(options);
  if (command === "board-snapshot") return boardSnapshotCommand(options);
  if (command === "board-history-snapshot") return boardHistorySnapshotCommand(options);
  if (command === "lifecycle-snapshot") return lifecycleSnapshotCommand(options);
  if (command === "lifecycle-reconcile") return lifecycleReconcileCommand(options);
  if (command === "disable") return emergencyControlCommand(options, true);
  if (command === "enable") return emergencyControlCommand(options, false);
  if (command === "doctor") return doctorCommand(options);
  if (command === "instruction-manifest") return instructionManifestCommand(options);
  if (command === "evidence-record") return evidenceRecordCommand(options);
  if (command === "hook") return hookCommand(options);
  if (command === "help" || command === "--help" || command === "-h") return help();
  fail(`command_unknown:${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const result = await runCli();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: error?.code || error?.message || "ai_usage_meter_failed",
      error_digest: sha256(String(error?.stack || error?.message || error)),
    })}\n`);
    process.exitCode = 1;
  }
}
