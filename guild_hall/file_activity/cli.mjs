#!/usr/bin/env node

import { constants as fsConstants, promises as fs } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";

import {
  FILE_OBSERVATION_PACKET_SCHEMA,
  FILE_REVISION_STATE_SCHEMA,
  reconcileObservationPackets,
  scanWorkspace,
} from "./file_activity.mjs";

const FILE_ACTIVITY_JSON_BYTE_LIMITS = Object.freeze({
  scan_cache: 64 * 1024 * 1024,
  observation_packet: 64 * 1024 * 1024,
  revision_state: 256 * 1024 * 1024,
});

const BOOLEAN_FLAGS = new Set(["binding-valid", "operational-primary", "write-outbox", "apply", "full", "json"]);
const FLAGS_BY_COMMAND = {
  scan: new Set([
    "repo-root",
    "project",
    "binding",
    "node",
    "node-role",
    "root",
    "binding-valid",
    "operational-primary",
    "write-outbox",
    "full",
    "observed-at",
    "ingested-at",
    "scan-id",
    "max-immediate-bytes",
    "byte-budget",
    "max-entries",
    "json",
  ]),
  reconcile: new Set([
    "repo-root",
    "project",
    "binding",
    "node",
    "node-role",
    "binding-valid",
    "operational-primary",
    "apply",
    "packet",
    "state-ref",
    "absence-threshold",
    "deletion-grace-ms",
    "json",
  ]),
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "--help" || command === "help") {
    printUsage(0);
    return;
  }
  if (!FLAGS_BY_COMMAND[command]) {
    printUsage(1);
    return;
  }
  const args = parseArgs(rest, FLAGS_BY_COMMAND[command]);
  const repoRoot = path.resolve(String(args["repo-root"] ?? process.cwd()));
  const projectCode = requireArg(args, "project");
  const workspaceBindingId = requireArg(args, "binding");
  const nodeId = requireArg(args, "node");
  const nodeRole = requireArg(args, "node-role");
  assertSafeIdentifier(projectCode, "project");
  assertSafeIdentifier(workspaceBindingId, "binding");
  assertSafeIdentifier(nodeId, "node");
  if (!["work_pc", "tool_pc", "portable_dev_pc", "always_on_node"].includes(nodeRole)) {
    throw new Error("file_activity_node_role_invalid");
  }

  await assertProjectWorkmetaExists(repoRoot, projectCode);

  if (command === "scan") {
    await runScan({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args });
    return;
  }
  await runReconcile({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args });
}

async function runScan({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args }) {
  const rootPath = path.resolve(repoRoot, requireArg(args, "root"));
  const stateDirectory = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "local",
    "file_activity",
    projectCode,
    workspaceBindingId,
    nodeId,
  );
  const cachePath = path.join(stateDirectory, "scan_cache.json");
  const lockPath = path.join(stateDirectory, "scan.lock");

  const writeOutbox = args["write-outbox"] === true;
  const executeScan = async () => {
    const previousCache = await readJsonIfPresent(
      cachePath,
      "file_activity_scan_cache_read_failed",
      FILE_ACTIVITY_JSON_BYTE_LIMITS.scan_cache,
    );
    const scanned = await scanWorkspace({
      projectCode,
      workspaceBindingId,
      nodeId,
      nodeRole,
      rootPath,
      bindingValid: args["binding-valid"] === true,
      operationalPrimary: args["operational-primary"] === true,
      observedAt: args["observed-at"],
      ingestedAt: args["ingested-at"],
      scanId: args["scan-id"],
      immediateHashBytes: optionalNumber(args["max-immediate-bytes"]),
      byteBudget: optionalNumber(args["byte-budget"]),
      maxEntries: optionalNumber(args["max-entries"]),
      forceRehash: args.full === true,
      previousCache,
    });
    const packetRef = packetOutputRef(scanned.packet);
    const packetPath = resolveRepoRef(repoRoot, packetRef);
    const packet = { ...scanned.packet, packet_ref: packetRef };
    if (writeOutbox) {
      await writeJsonImmutable(
        packetPath,
        packet,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.observation_packet,
        "file_activity_packet_write_size_limit_exceeded",
      );
      await writeJsonAtomic(
        cachePath,
        scanned.next_cache,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.scan_cache,
        "file_activity_scan_cache_write_size_limit_exceeded",
      );
    }
    return { packet, packetRef };
  };
  const result = writeOutbox
    ? await withNodeLock(lockPath, executeScan)
    : await executeScan();

  printJson({
    schema_version: FILE_OBSERVATION_PACKET_SCHEMA,
    status: writeOutbox ? "written" : "dry_run_no_write",
    activation_state: "candidate_not_scheduled",
    write_outbox: writeOutbox,
    full_rehash: args.full === true,
    scan_id: result.packet.scan_id,
    packet_ref: result.packetRef,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    node_id: nodeId,
    node_role: nodeRole,
    coverage: result.packet.coverage,
    counts: result.packet.counts,
    boundary: result.packet.boundary,
    side_effects: {
      packet_written: writeOutbox,
      cache_written: writeOutbox,
      live_scheduler_enabled: false,
      transport_enabled: false,
    },
  });
}

async function runReconcile({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args }) {
  const packetArgs = asArray(args.packet);
  if (packetArgs.length === 0) throw new Error("file_activity_packet_required");
  const allowedPacketRoot = path.resolve(
    repoRoot,
    "_workmeta",
    projectCode,
    "reports",
    "file_activity",
    "observations",
  );
  const packets = [];
  for (const packetArg of packetArgs) {
    const packetPath = path.resolve(repoRoot, String(packetArg));
    assertContained(packetPath, allowedPacketRoot, "file_activity_packet_ref_outside_observation_root");
    packets.push(await readJsonRequired(
      packetPath,
      "file_activity_packet_read_failed",
      FILE_ACTIVITY_JSON_BYTE_LIMITS.observation_packet,
    ));
  }

  const stateRef = String(args["state-ref"] ?? `_workmeta/${projectCode}/reports/file_activity/revision_state.json`)
    .split(path.sep)
    .join("/");
  if (!stateRef.startsWith(`_workmeta/${projectCode}/reports/file_activity/`) || !stateRef.endsWith(".json")) {
    throw new Error("file_activity_state_ref_invalid");
  }
  const statePath = resolveRepoRef(repoRoot, stateRef);
  const allowedStateRoot = path.resolve(repoRoot, "_workmeta", projectCode, "reports", "file_activity");
  assertContained(statePath, allowedStateRoot, "file_activity_state_ref_outside_project_root");
  const lockPath = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "local",
    "file_activity",
    projectCode,
    workspaceBindingId,
    nodeId,
    "reconcile.lock",
  );

  const apply = args.apply === true;
  const executeReconcile = async () => {
    const previousState = await readJsonIfPresent(
      statePath,
      "file_activity_revision_state_read_failed",
      FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_state,
    );
    const reconciled = reconcileObservationPackets({
      projectCode,
      workspaceBindingId,
      reconcilerNodeId: nodeId,
      reconcilerNodeRole: nodeRole,
      bindingValid: args["binding-valid"] === true,
      operationalPrimary: args["operational-primary"] === true,
      receivedAt: new Date().toISOString(),
      previousState,
      packets,
      absenceThreshold: optionalNumber(args["absence-threshold"]),
      deletionGraceMs: optionalNumber(args["deletion-grace-ms"]),
    });
    if (apply) {
      await writeJsonAtomic(
        statePath,
        reconciled,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_state,
        "file_activity_revision_state_write_size_limit_exceeded",
      );
    }
    return reconciled;
  };
  const state = apply
    ? await withNodeLock(lockPath, executeReconcile)
    : await executeReconcile();

  printJson({
    schema_version: FILE_REVISION_STATE_SCHEMA,
    status: apply ? "written" : "dry_run_no_write",
    activation_state: "candidate_not_scheduled",
    apply,
    state_ref: stateRef,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    reconciler: state.reconciler,
    counts: state.counts,
    boundary: state.boundary,
    side_effects: {
      state_written: apply,
      live_scheduler_enabled: false,
      transport_enabled: false,
    },
  });
}

export async function withNodeLock(lockPath, callback) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await fs.open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("file_activity_node_lock_busy");
    throw new Error("file_activity_node_lock_failed");
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`, "utf8");
    return await callback();
  } finally {
    await handle.close().catch(() => {});
    await fs.rm(lockPath, { force: true }).catch(() => {});
  }
}

async function writeJsonAtomic(filePath, value, maxBytes, sizeErrorCode) {
  const serialized = serializeJsonWithinLimit(value, maxBytes, sizeErrorCode);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    await fs.writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporaryPath, filePath);
  } catch {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw new Error("file_activity_atomic_state_write_failed");
  }
}

async function writeJsonImmutable(filePath, value, maxBytes, sizeErrorCode) {
  const serialized = serializeJsonWithinLimit(value, maxBytes, sizeErrorCode);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    await fs.writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    await fs.link(temporaryPath, filePath);
    await fs.rm(temporaryPath, { force: true });
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    if (error?.code === "EEXIST") throw new Error("file_activity_immutable_packet_exists");
    throw new Error("file_activity_atomic_packet_write_failed");
  }
}

async function readJsonIfPresent(filePath, errorCode, maxBytes) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
  } catch {
    return null;
  }
  return readJsonRequired(filePath, errorCode, maxBytes);
}

async function readJsonRequired(filePath, errorCode, maxBytes) {
  let fileStat;
  try {
    fileStat = await fs.stat(filePath);
  } catch {
    throw new Error(errorCode);
  }
  if (!fileStat.isFile() || fileStat.size > maxBytes) {
    throw new Error(`${errorCode}_size_limit_exceeded`);
  }
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      throw new Error(`${errorCode}_size_limit_exceeded`);
    }
    return JSON.parse(raw.replace(/^\uFEFF/u, ""));
  } catch (error) {
    if (error?.message === `${errorCode}_size_limit_exceeded`) throw error;
    throw new Error(errorCode);
  }
}

function serializeJsonWithinLimit(value, maxBytes, errorCode) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) throw new Error(errorCode);
  return serialized;
}

async function assertProjectWorkmetaExists(repoRoot, projectCode) {
  const projectRoot = path.resolve(repoRoot, "_workmeta", projectCode);
  try {
    const stat = await fs.stat(projectRoot);
    if (!stat.isDirectory()) throw new Error();
  } catch {
    throw new Error("file_activity_project_workmeta_missing");
  }
}

function packetOutputRef(packet) {
  const ingested = new Date(packet.ingested_at);
  const year = String(ingested.getUTCFullYear());
  const month = String(ingested.getUTCMonth() + 1).padStart(2, "0");
  const stamp = packet.ingested_at.replace(/[-:.TZ]/gu, "").slice(0, 14);
  const scanSuffix = createHash("sha256").update(packet.scan_id, "utf8").digest("hex").slice(0, 24);
  return `_workmeta/${packet.project_code}/reports/file_activity/observations/${packet.node_id}/${year}/${month}/${stamp}_${scanSuffix}.json`;
}

function resolveRepoRef(repoRoot, ref) {
  const resolved = path.resolve(repoRoot, ref);
  assertContained(resolved, repoRoot, "file_activity_ref_outside_repo");
  return resolved;
}

function assertContained(candidatePath, rootPath, errorCode) {
  const relative = path.relative(rootPath, candidatePath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new Error(errorCode);
}

function parseArgs(argv, allowedFlags) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error("file_activity_unexpected_argument");
    const equalsAt = token.indexOf("=");
    const key = token.slice(2, equalsAt === -1 ? undefined : equalsAt);
    if (!allowedFlags.has(key)) throw new Error(`file_activity_unknown_flag_${key}`);
    let value;
    if (equalsAt !== -1) {
      value = token.slice(equalsAt + 1);
    } else if (BOOLEAN_FLAGS.has(key)) {
      value = true;
    } else {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`file_activity_flag_value_required_${key}`);
      value = next;
      index += 1;
    }
    if (args[key] === undefined) args[key] = value;
    else if (Array.isArray(args[key])) args[key].push(value);
    else args[key] = [args[key], value];
  }
  return args;
}

function requireArg(args, key) {
  const value = args[key];
  if (value === undefined || value === true || Array.isArray(value)) {
    throw new Error(`file_activity_required_${key}`);
  }
  return String(value);
}

function assertSafeIdentifier(value, field) {
  const normalized = String(value).normalize("NFC");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(normalized)) {
    throw new Error(`file_activity_${field}_invalid`);
  }
}

function optionalNumber(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value) || value === true || value === "") throw new Error("file_activity_numeric_flag_invalid");
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("file_activity_numeric_flag_invalid");
  return number;
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printUsage(exitCode) {
  const lines = [
    "Usage:",
    "  node guild_hall/file_activity/cli.mjs scan --project <code> --binding <id> --node <id> --node-role <role> --root <dir> --binding-valid [--operational-primary] [--write-outbox] [--full] [limits/times]",
    "  node guild_hall/file_activity/cli.mjs reconcile --project <code> --binding <id> --node <id> --node-role always_on_node --binding-valid --operational-primary --packet <_workmeta/...json>... [--apply] [--state-ref <_workmeta/...json>]",
    "",
    "Roles: work_pc | tool_pc | portable_dev_pc | always_on_node",
    "Dry-run is the default. --write-outbox writes an immutable packet/cache; --apply writes revision state.",
    "Durable metadata stays below _workmeta/<project>/reports/file_activity/**; local locks/cache stay below guild_hall/state/local/file_activity/**.",
    "The always-on operational primary is the sole revision-state reconciler.",
    "ERP input_upload events are a separate authoritative adapter and are not scanner observations.",
    "This CLI is an activation candidate only; it does not install a scheduler, watcher, or transport.",
  ];
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${lines.join("\n")}\n`);
  process.exitCode = exitCode;
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "file_activity_failed"}\n`);
  process.exitCode = 1;
});
