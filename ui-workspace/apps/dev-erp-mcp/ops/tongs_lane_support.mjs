#!/usr/bin/env node
// tongs_lane_support.mjs — pure heartbeat/preflight/supervisor-decision helpers
// for the Tongs(MCP 문) loopback lane launcher (run-tongs-loopback.ps1).
//
// This module owns no server, socket, credential, or schedule. It is the
// pure/testable half of the launcher: heartbeat record shape, a supervisor
// restart-or-reuse decision, and a preflight check aggregator. The impure half
// (spawning node, polling /health, calling Windows Task Scheduler) stays in
// run-tongs-loopback.ps1 and register-tongs-task.ps1, which shell out to the
// thin CLI at the bottom of this file for every decision that must be
// testable without a live socket.
//
// Tongs is up to two independent Node processes, not one: the personal ERP
// MCP (`server.mjs`, default 127.0.0.1:4311) and the feature-gated HPP
// evidence ingress MCP (`ingress_server.mjs`, loopback-only port chosen by a
// private binding file, feature OFF by default). Each gets its own heartbeat
// file at "<state-root>/operations/tongs/<service>.heartbeat.v1.json" where
// <service> is "erp_mcp" or "ingress_mcp". Every file is the exact
// {status, observed_at, pid, listen} shape Vigil's future probe reads, plus a
// schema_version field every other state file in this repository carries.
//
// See ui-workspace/apps/dev-erp-mcp/docs/TONGS_LANE_RUNBOOK_V0.md for the full
// contract this module implements a slice of.

import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TONGS_HEARTBEAT_SCHEMA = "soulforge.tongs_lane.heartbeat.v1";
export const TONGS_SERVICES = Object.freeze(["erp_mcp", "ingress_mcp"]);
export const TONGS_HEARTBEAT_STATUSES = Object.freeze([
  "starting",
  "ready",
  "degraded",
  "stopped",
  "error",
]);
export const TONGS_STATE_DIRNAME = "operations/tongs";
export const TONGS_LOCK_SCHEMA = "soulforge.tongs_lane.run_lock.v1";
// The registered task's own trigger repeats every PT5M (300000ms). A max-age
// equal to that interval leaves a reuse decision with essentially zero
// margin against ordinary Task Scheduler lateness (sleep/resume, load, a
// slow previous tick): the very first late trigger flips reuse -> start and
// races the still-live incumbent for its own port (see run-tongs-loopback.ps1
// Sync-TongsService's adopt path, added for exactly that race). The single
// constant below is the one place this repository's three tongs-lane files
// (this module, run-tongs-loopback.ps1, register-tongs-task.ps1) agree on;
// it must stay at least 2x the registrar's repetition interval.
export const TONGS_REGISTERED_TRIGGER_INTERVAL_MS = 5 * 60 * 1000;
export const TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS = 720000; // 2.4x TONGS_REGISTERED_TRIGGER_INTERVAL_MS

const HEARTBEAT_FIELDS = Object.freeze(["schema_version", "status", "observed_at", "pid", "listen"]);
const LISTEN_RE = /^127\.0\.0\.1:([0-9]{1,5})$/;

export class TongsLaneError extends Error {
  constructor(code) {
    super(code);
    this.name = "TongsLaneError";
    this.code = code;
  }
}

function fail(code) {
  throw new TongsLaneError(code);
}

function isPositiveInt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isValidListenTarget(value) {
  if (typeof value !== "string") return false;
  const match = LISTEN_RE.exec(value);
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isSafeInteger(port) && port >= 1024 && port <= 65535;
}

// Exact-keys, fail-closed record validator, matching the convention every
// other lane's state schema in this repository uses.
export function isValidTongsHeartbeatRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...HEARTBEAT_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  if (value.schema_version !== TONGS_HEARTBEAT_SCHEMA) return false;
  if (!TONGS_HEARTBEAT_STATUSES.includes(value.status)) return false;
  if (typeof value.observed_at !== "string" || !Number.isFinite(Date.parse(value.observed_at))) return false;
  if (value.pid !== null && !isPositiveInt(value.pid)) return false;
  if (value.listen !== null && !isValidListenTarget(value.listen)) return false;
  // A "ready" service without a pid and a listen address is a contradiction;
  // every other status may leave either or both null.
  if (value.status === "ready" && (value.pid === null || value.listen === null)) return false;
  return true;
}

export function buildTongsHeartbeatRecord({
  status,
  pid = null,
  listen = null,
  observedAt = new Date().toISOString(),
} = {}) {
  const record = {
    schema_version: TONGS_HEARTBEAT_SCHEMA,
    status,
    observed_at: observedAt,
    pid,
    listen,
  };
  if (!isValidTongsHeartbeatRecord(record)) fail("tongs_heartbeat_invalid");
  return record;
}

export function tongsHeartbeatPath(stateRoot, service) {
  if (typeof stateRoot !== "string" || !path.isAbsolute(stateRoot)) fail("tongs_state_root_invalid");
  if (!TONGS_SERVICES.includes(service)) fail("tongs_service_invalid");
  return path.join(stateRoot, ...TONGS_STATE_DIRNAME.split("/"), `${service}.heartbeat.v1.json`);
}

export function tongsHeartbeatIsFresh(record, { now = Date.now(), maxAgeMs } = {}) {
  if (!isValidTongsHeartbeatRecord(record)) return false;
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) fail("tongs_max_age_invalid");
  const observed = Date.parse(record.observed_at);
  return Number.isFinite(now) && now >= observed && now - observed <= maxAgeMs;
}

// The supervisor's whole decision, decided only from evidence the caller
// already gathered (a parsed heartbeat record and a real process-alive
// probe). This function never reads a clock or touches a filesystem itself,
// so every branch is reachable from a synthetic node:test case.
export function decideTongsSupervisorAction({
  heartbeat,
  processAlive,
  now = Date.now(),
  maxHeartbeatAgeMs = TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS,
}) {
  if (!heartbeat) return { action: "start", reason: "no_heartbeat" };
  if (!isValidTongsHeartbeatRecord(heartbeat)) return { action: "start", reason: "heartbeat_invalid" };
  if (heartbeat.status === "stopped" || heartbeat.status === "error") {
    return { action: "start", reason: `heartbeat_status_${heartbeat.status}` };
  }
  if (processAlive !== true) return { action: "start", reason: "process_not_alive" };
  if (!tongsHeartbeatIsFresh(heartbeat, { now, maxAgeMs: maxHeartbeatAgeMs })) {
    return { action: "start", reason: "heartbeat_stale" };
  }
  return { action: "reuse", reason: "heartbeat_fresh_and_process_alive" };
}

// Pure aggregator: every input is a boolean (or null, for "not applicable")
// the caller already observed with a real lstat/import/containment check. It
// decides pass/fail and which checks applied, so it never opens a port and
// never has to be exercised against a real filesystem to be tested.
export function evaluateTongsPreflight({
  nodePathPresent,
  entryPathPresent,
  entryInsideLaneRoot,
  moduleResolves,
  ingressRequested,
  ingressConfigPresent = null,
  ingressConfigValid = null,
}) {
  const checks = {
    node_path_present: nodePathPresent === true,
    entry_path_present: entryPathPresent === true,
    entry_inside_lane_root: entryInsideLaneRoot === true,
    // Presence alone ("the file exists") cannot see a missing third-party
    // package: a lane assembled with the wrong --previous-lane carries the
    // entry file but not its node_modules closure and dies at spawn with
    // ERR_MODULE_NOT_FOUND. The caller proves this the only safe way without
    // opening a socket: a real dynamic import() of the entry file itself
    // (see cmdPreflight), which resolves every static import the module
    // graph needs and never runs the module's own guarded main-block.
    module_resolves: moduleResolves === true,
  };
  if (ingressRequested) {
    checks.ingress_config_present = ingressConfigPresent === true;
    checks.ingress_config_valid = ingressConfigPresent === true && ingressConfigValid === true;
  }
  const failedChecks = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return { ok: failedChecks.length === 0, checks, failed_checks: failedChecks };
}

// Concurrency-lock decision: pure, so the reclaim-a-dead-holder's-lock branch
// is reachable from a synthetic node:test case without ever touching a real
// pid or the filesystem. The caller (cmdAcquireLock) is the only impure half:
// it reads the lock file, probes the recorded pid with a real liveness check,
// and writes the new lock file when this function says to.
export function evaluateLockClaim({ existingLock, holderAlive }) {
  if (!existingLock) return { acquired: true };
  if (holderAlive) return { acquired: false, holder_pid: existingLock.pid };
  return { acquired: true, reclaimed_from_pid: existingLock.pid };
}

const SUMMARY_PRIORITY = Object.freeze(["error", "starting", "degraded", "stopped", "ready"]);

// Small convenience for a future Vigil probe (or this launcher's own log
// line): fold the one or two per-service heartbeat records into one overall
// status using a fixed worst-first priority order.
export function summarizeTongsLane({ erpHeartbeat = null, ingressHeartbeat = null } = {}) {
  const services = { erp_mcp: erpHeartbeat, ingress_mcp: ingressHeartbeat };
  const statuses = new Set(
    Object.values(services)
      .filter((record) => record !== null)
      .map((record) => (isValidTongsHeartbeatRecord(record) ? record.status : "error")),
  );
  const overallStatus = statuses.size === 0
    ? "unknown"
    : SUMMARY_PRIORITY.find((status) => statuses.has(status)) ?? "unknown";
  return { schema_version: TONGS_HEARTBEAT_SCHEMA, overall_status: overallStatus, services };
}

// ---------------------------------------------------------------------------
// Thin CLI: the impure shell run-tongs-loopback.ps1 calls into for every
// decision or write that must go through the tested pure functions above.
// Nothing below opens a listening socket or reads a secret/credential file.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function requireAbsolute(value, name) {
  if (typeof value !== "string" || !path.isAbsolute(value)) fail(`tongs_${name.replace(/-/g, "_")}_invalid`);
  return path.resolve(value);
}

function requireOneOf(value, options, name) {
  if (!options.includes(value)) fail(`tongs_${name.replace(/-/g, "_")}_invalid`);
  return value;
}

async function ensureNormalDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("tongs_state_dir_unsafe");
}

async function isNormalFile(target) {
  try {
    const info = await lstat(target);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

async function writeJsonAtomic(target, value) {
  const temporary = `${target}.partial-${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readHeartbeatFile(stateRoot, service) {
  const target = tongsHeartbeatPath(stateRoot, service);
  let raw;
  try {
    raw = await readFile(target, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("tongs_heartbeat_unreadable");
  }
  if (!isValidTongsHeartbeatRecord(parsed)) fail("tongs_heartbeat_unreadable");
  return parsed;
}

async function cmdWriteHeartbeat(args) {
  const stateRoot = requireAbsolute(args["state-root"], "state-root");
  const service = requireOneOf(args.service, TONGS_SERVICES, "service");
  const status = requireOneOf(args.status, TONGS_HEARTBEAT_STATUSES, "status");
  const pid = args.pid === undefined ? null : Number(args.pid);
  const listen = args.listen === undefined ? null : String(args.listen);
  const observedAt = args["observed-at"] === undefined ? new Date().toISOString() : String(args["observed-at"]);
  const record = buildTongsHeartbeatRecord({ status, pid, listen, observedAt });
  await ensureNormalDirectory(path.join(stateRoot, ...TONGS_STATE_DIRNAME.split("/")));
  const target = tongsHeartbeatPath(stateRoot, service);
  await writeJsonAtomic(target, record);
  const readBack = await readHeartbeatFile(stateRoot, service);
  if (!readBack || readBack.observed_at !== record.observed_at || readBack.status !== record.status) {
    fail("tongs_heartbeat_readback_mismatch");
  }
  process.stdout.write(`${JSON.stringify({ ok: true, path: target, record: readBack }, null, 2)}\n`);
}

async function cmdReadHeartbeat(args) {
  const stateRoot = requireAbsolute(args["state-root"], "state-root");
  const service = requireOneOf(args.service, TONGS_SERVICES, "service");
  const record = await readHeartbeatFile(stateRoot, service);
  process.stdout.write(`${JSON.stringify({ present: record !== null, record }, null, 2)}\n`);
}

async function cmdDecide(args) {
  const stateRoot = requireAbsolute(args["state-root"], "state-root");
  const service = requireOneOf(args.service, TONGS_SERVICES, "service");
  const processAlive = args["process-alive"] === "true";
  const heartbeat = await readHeartbeatFile(stateRoot, service);
  const decisionArgs = { heartbeat, processAlive };
  if (args["max-heartbeat-age-ms"] !== undefined) {
    decisionArgs.maxHeartbeatAgeMs = Number(args["max-heartbeat-age-ms"]);
  }
  const decision = decideTongsSupervisorAction(decisionArgs);
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
}

async function cmdPreflight(args) {
  const nodePath = requireAbsolute(args["node-path"], "node-path");
  const entryPath = requireAbsolute(args["entry-path"], "entry-path");
  const laneRoot = requireAbsolute(args["lane-root"], "lane-root");
  const ingressConfigArgument = args["ingress-config"];
  const ingressRequested = ingressConfigArgument !== undefined;

  const nodePathPresent = await isNormalFile(nodePath);
  const entryPathPresent = await isNormalFile(entryPath);
  const relative = path.relative(laneRoot, entryPath);
  const entryInsideLaneRoot = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);

  // A real dynamic import of the entry file, never the guarded top-level
  // "start the server" block: every entry this repository ships guards that
  // block with `if (import.meta.url === pathToFileURL(process.argv[1] ...))`,
  // and process.argv[1] here is this CLI's own path, not entryPath, so the
  // guard is always false and no socket ever opens. What this DOES exercise
  // is every static `import` the module graph needs — the only way to catch
  // a lane whose --previous-lane did not actually carry
  // @modelcontextprotocol/sdk or zod before it dies at real spawn time with
  // ERR_MODULE_NOT_FOUND (see docs/TONGS_LANE_RUNBOOK_V0.md §4).
  let moduleResolves = false;
  let moduleResolutionErrorCode = null;
  if (entryPathPresent) {
    try {
      await import(pathToFileURL(entryPath).href);
      moduleResolves = true;
    } catch (error) {
      moduleResolutionErrorCode = error?.code ?? "module_resolution_failed";
    }
  } else {
    moduleResolutionErrorCode = "entry_path_absent";
  }

  let ingressConfigPresent = null;
  let ingressConfigValid = null;
  let ingressConfigErrorCode = null;
  let resolvedListen = null;
  let ingressEnabled = null;
  if (ingressRequested) {
    const ingressConfigPath = requireAbsolute(ingressConfigArgument, "ingress-config");
    ingressConfigPresent = await isNormalFile(ingressConfigPath);
    if (ingressConfigPresent) {
      try {
        const servicePath = path.join(laneRoot, "src", "ingress_mcp_service.mjs");
        const { loadIngressMcpConfig } = await import(pathToFileURL(servicePath).href);
        const config = await loadIngressMcpConfig(ingressConfigPath);
        resolvedListen = `${config.listenHost}:${config.listenPort}`;
        ingressEnabled = config.enabled === true;
        ingressConfigValid = true;
      } catch (error) {
        ingressConfigValid = false;
        ingressConfigErrorCode = error?.code ?? "ingress_config_check_failed";
      }
    } else {
      ingressConfigValid = false;
    }
  }

  const result = evaluateTongsPreflight({
    nodePathPresent,
    entryPathPresent,
    entryInsideLaneRoot,
    moduleResolves,
    ingressRequested,
    ingressConfigPresent,
    ingressConfigValid,
  });
  process.stdout.write(`${JSON.stringify(
    {
      ...result,
      network_used: false,
      resolved_listen: resolvedListen,
      // null when ingress was never requested; true/false once a
      // structurally valid binding was actually loaded. A caller that sees
      // `ok:true, ingress_enabled:false` knows a real run will not start
      // that service at all (see run-tongs-loopback.ps1's skip branch)
      // rather than reading a green preflight as "ingress will come up".
      ingress_enabled: ingressEnabled,
      ingress_config_error_code: ingressConfigErrorCode,
      module_resolution_error_code: moduleResolutionErrorCode,
    },
    null,
    2,
  )}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

// Concurrency lock: defense-in-depth against a manual run overlapping the
// registered task's own tick, or two manual runs (the registered task itself
// is already covered by MultipleInstances=IgnoreNew, which this lock does not
// replace). Deliberately best-effort, not a distributed lock: the read of the
// existing holder and the write of a new lock are two separate filesystem
// operations, so a race between two launches started in the same instant can
// still both win. What it does reliably prevent is the far more likely case:
// a stale lock left by a launch that crashed or was killed without cleaning up.
async function cmdAcquireLock(args) {
  const stateRoot = requireAbsolute(args["state-root"], "state-root");
  const pid = Number(args.pid);
  if (!isPositiveInt(pid)) fail("tongs_lock_pid_invalid");
  const lockDirectory = path.join(stateRoot, ...TONGS_STATE_DIRNAME.split("/"));
  await ensureNormalDirectory(lockDirectory);
  const lockPath = path.join(lockDirectory, "run.lock.v1.json");

  // Fail closed on anything other than "the file genuinely does not exist
  // yet" — matching readHeartbeatFile's own convention below. An earlier
  // version treated any read/parse error as "no lock", which silently
  // granted acquisition over a lock file that merely could not be parsed
  // (observed for real against a BOM-prefixed file while writing this test's
  // own fixture) — exactly the failure mode this lock exists to prevent.
  let existingLock = null;
  try {
    existingLock = JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      existingLock = null;
    } else {
      fail("tongs_lock_unreadable");
    }
  }

  let holderAlive = false;
  if (existingLock && isPositiveInt(existingLock.pid)) {
    try {
      process.kill(existingLock.pid, 0);
      holderAlive = true;
    } catch (error) {
      // ESRCH: no such process; the holder is gone and the lock is stale.
      // EPERM: it exists but this account cannot signal it — treat that as
      // alive rather than risk two supervisors running at once.
      holderAlive = error?.code === "EPERM";
    }
  }

  const decision = evaluateLockClaim({ existingLock, holderAlive });
  if (decision.acquired) {
    const record = { schema_version: TONGS_LOCK_SCHEMA, pid, acquired_at: new Date().toISOString() };
    await writeJsonAtomic(lockPath, record);
  }
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  process.exitCode = decision.acquired ? 0 : 1;
}

async function cmdReleaseLock(args) {
  const stateRoot = requireAbsolute(args["state-root"], "state-root");
  const pid = Number(args.pid);
  if (!isPositiveInt(pid)) fail("tongs_lock_pid_invalid");
  const lockPath = path.join(stateRoot, ...TONGS_STATE_DIRNAME.split("/"), "run.lock.v1.json");
  let released = false;
  try {
    const existing = JSON.parse(await readFile(lockPath, "utf8"));
    if (existing?.pid === pid) {
      await rm(lockPath, { force: true });
      released = true;
    }
  } catch {
    // Nothing to release, or the file is unreadable: either way this run
    // never held a lock worth reporting a failure over.
  }
  process.stdout.write(`${JSON.stringify({ released }, null, 2)}\n`);
}

async function main(argv) {
  const [subcommand, ...rest] = argv;
  const args = parseArgs(rest);
  const handlers = {
    preflight: cmdPreflight,
    "write-heartbeat": cmdWriteHeartbeat,
    "read-heartbeat": cmdReadHeartbeat,
    decide: cmdDecide,
    "acquire-lock": cmdAcquireLock,
    "release-lock": cmdReleaseLock,
  };
  const handler = handlers[subcommand];
  if (!handler) {
    process.stdout.write(
      "usage: tongs_lane_support.mjs <preflight|write-heartbeat|read-heartbeat|decide|acquire-lock|release-lock> [--flags]\n",
    );
    process.exitCode = 1;
    return;
  }
  await handler(args);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error?.code ?? error?.message ?? "tongs_lane_support_failed" })}\n`);
    process.exitCode = 1;
  });
}
