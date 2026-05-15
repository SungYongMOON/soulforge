#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  appendActivityEvent,
  defaultActivityRoot,
  loadNodeIdentity,
} from "../activity/activity_log.mjs";
import { normalizeRepoPath, pathExists } from "../shared/io.mjs";

const ELIGIBLE_STATUSES = new Set(["ready", "queued", "open"]);
const REQUEST_FILENAMES = new Set(["dev_worker_request.yaml", "dev_worker_request.yml"]);

export async function discoverTaskPackets(options = {}) {
  const localRoot = path.resolve(options.localRoot ?? process.cwd());
  const workmetaRoot = options.workmetaRoot ? path.resolve(options.workmetaRoot) : path.join(localRoot, "_workmeta");
  const packets = [];

  packets.push(...(await discoverMissionPackets(localRoot)));
  packets.push(...(await discoverWorkmetaPackets({ localRoot, workmetaRoot })));

  return packets.sort((left, right) => {
    if (left.source_order !== right.source_order) {
      return left.source_order - right.source_order;
    }
    return left.packet_ref.localeCompare(right.packet_ref);
  });
}

export function normalizeTaskPacket(raw, source) {
  const status = String(raw?.status ?? "").trim().toLowerCase();
  const taskId = sanitizeSlug(raw?.task_id ?? raw?.id ?? path.basename(source.packet_path, path.extname(source.packet_path)));
  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  const allowedWritePaths = normalizeStringArray(raw?.allowed_write_paths);
  const acceptanceChecks = normalizeStringArray(raw?.acceptance_checks);
  const branchSlug = sanitizeSlug(raw?.branch_slug ?? taskId);
  const missing = [];

  if (!raw?.schema_version) {
    missing.push("schema_version");
  }
  if (!taskId) {
    missing.push("task_id");
  }
  if (!status) {
    missing.push("status");
  }
  if (!summary) {
    missing.push("summary");
  }
  if (allowedWritePaths.length === 0) {
    missing.push("allowed_write_paths");
  }
  if (acceptanceChecks.length === 0) {
    missing.push("acceptance_checks");
  }

  const eligible = missing.length === 0 && ELIGIBLE_STATUSES.has(status);
  const ineligibleReason = eligible
    ? null
    : missing.length > 0
      ? `missing_required_fields:${missing.join(",")}`
      : `status_not_eligible:${status || "missing"}`;

  return {
    ...source,
    schema_version: String(raw?.schema_version ?? ""),
    task_id: taskId,
    status,
    lane: String(raw?.lane ?? "dev_worker"),
    requested_by: String(raw?.requested_by ?? ""),
    project_code: sanitizeSlug(raw?.project_code ?? "shared"),
    summary,
    branch_slug: branchSlug,
    allowed_write_paths: allowedWritePaths,
    acceptance_checks: acceptanceChecks,
    stop_conditions: normalizeStringArray(raw?.stop_conditions),
    draft_branch_allowed: parseBoolean(raw?.draft_branch_allowed, false),
    eligible,
    ineligible_reason: ineligibleReason,
  };
}

export async function selectTask(options = {}) {
  const localRoot = path.resolve(options.localRoot ?? process.cwd());
  const identity = options.identity ?? (await loadNodeIdentity(localRoot));
  const packets = await discoverTaskPackets(options);
  const tasks = [];
  const skipped = [];

  for (const packet of packets) {
    try {
      const raw = parseYaml(await fs.readFile(packet.packet_path, "utf8"));
      const task = normalizeTaskPacket(raw, packet);
      if (task.eligible) {
        tasks.push(task);
      } else {
        skipped.push({
          packet_ref: packet.packet_ref,
          reason: task.ineligible_reason,
        });
      }
    } catch (error) {
      skipped.push({
        packet_ref: packet.packet_ref,
        reason: `parse_error:${error.message}`,
      });
    }
  }

  const selected = tasks[0] ?? null;
  return {
    selected: selected ? withSuggestedBranch(selected, identity) : null,
    eligible_count: tasks.length,
    scanned_count: packets.length,
    skipped,
  };
}

async function discoverMissionPackets(localRoot) {
  const missionRoot = path.join(localRoot, ".mission");
  if (!(await pathExists(missionRoot))) {
    return [];
  }

  const entries = await fs.readdir(missionRoot, { withFileTypes: true });
  const packets = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    for (const fileName of REQUEST_FILENAMES) {
      const packetPath = path.join(missionRoot, entry.name, fileName);
      if (await pathExists(packetPath)) {
        packets.push(buildSource({
          localRoot,
          packetPath,
          sourceKind: "mission",
          sourceOrder: 10,
        }));
      }
    }
  }

  return packets;
}

async function discoverWorkmetaPackets({ localRoot, workmetaRoot }) {
  if (!(await pathExists(workmetaRoot))) {
    return [];
  }

  const projectEntries = await fs.readdir(workmetaRoot, { withFileTypes: true });
  const packets = [];

  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) {
      continue;
    }
    const queueRoot = path.join(workmetaRoot, projectEntry.name, "dev_worker_queue");
    if (!(await pathExists(queueRoot))) {
      continue;
    }
    const queueEntries = await fs.readdir(queueRoot, { withFileTypes: true });
    for (const queueEntry of queueEntries) {
      if (!queueEntry.isFile() || !/\.ya?ml$/u.test(queueEntry.name)) {
        continue;
      }
      const packetPath = path.join(queueRoot, queueEntry.name);
      packets.push(buildSource({
        localRoot,
        packetPath,
        sourceKind: "workmeta",
        sourceOrder: 20,
      }));
    }
  }

  return packets;
}

function buildSource({ localRoot, packetPath, sourceKind, sourceOrder }) {
  const relative = path.relative(localRoot, packetPath);
  const packetRef = relative && !relative.startsWith("..")
    ? normalizeRepoPath(relative)
    : packetPath;
  return {
    source_kind: sourceKind,
    source_order: sourceOrder,
    packet_path: packetPath,
    packet_ref: packetRef,
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

function sanitizeSlug(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseBoolean(value, fallback) {
  if (value === true || value === false) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function withSuggestedBranch(task, identity) {
  const nodeId = sanitizeSlug(identity?.node_id ?? "dev_worker");
  const branchSlug = sanitizeSlug(task.branch_slug || task.task_id);
  return {
    ...task,
    suggested_branch: `codex/${nodeId}-${branchSlug}`,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const raw = token.slice(2);
    const separatorIndex = raw.indexOf("=");
    const key = separatorIndex === -1 ? raw : raw.slice(0, separatorIndex);
    const inlineValue = separatorIndex === -1 ? undefined : raw.slice(separatorIndex + 1);
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith("--") ? next : true);
    if (inlineValue === undefined && value === next) {
      index += 1;
    }
    args[key] = value;
  }
  return args;
}

async function maybeRecord(result, { localRoot, activityRoot }) {
  if (result.selected) {
    await appendActivityEvent({
      repoRoot: localRoot,
      activityRoot,
      input: {
        scope: "dev_worker",
        project_code: result.selected.project_code,
        action: "claim_task",
        result: "selected",
        summary: `dev_worker selected ${result.selected.task_id}: ${result.selected.summary}`,
        refs: [result.selected.packet_ref],
        detail_owner: "guild_hall/dev_worker + task packet",
        next_action: `Create branch ${result.selected.suggested_branch} and run the packet acceptance checks.`,
        carry_forward: true,
      },
    });
    return;
  }

  await appendActivityEvent({
    repoRoot: localRoot,
    activityRoot,
    input: {
      scope: "dev_worker",
      project_code: "shared",
      action: "claim_task",
      result: "no_task",
      summary: "dev_worker found no eligible task packet.",
      detail_owner: "guild_hall/dev_worker",
      next_action: "Supervisor should add a ready dev_worker_request.yaml or private dev_worker_queue packet.",
      carry_forward: false,
    },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localRoot = path.resolve(args["local-root"] ?? process.cwd());
  const workmetaRoot = args["workmeta-root"] ? path.resolve(args["workmeta-root"]) : path.join(localRoot, "_workmeta");
  const activityRoot = args["activity-root"]
    ? path.resolve(args["activity-root"])
    : defaultActivityRoot(localRoot);
  const result = await selectTask({ localRoot, workmetaRoot });

  const payload = {
    status: result.selected ? "selected" : "no_task",
    ...result,
  };

  if (args.record === true || args.record === "true") {
    await maybeRecord(payload, { localRoot, activityRoot });
  }

  if (args.json === true || args.json === "true") {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (payload.selected) {
    process.stdout.write([
      "dev_worker task selected",
      `task_id: ${payload.selected.task_id}`,
      `branch: ${payload.selected.suggested_branch}`,
      `packet: ${payload.selected.packet_ref}`,
    ].join("\n"));
    process.stdout.write("\n");
    return;
  }

  process.stdout.write(`dev_worker no eligible task\nscanned: ${payload.scanned_count}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
