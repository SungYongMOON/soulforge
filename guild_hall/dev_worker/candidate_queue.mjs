#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { normalizeRepoPath, pathExists } from "../shared/io.mjs";

const __filename = fileURLToPath(import.meta.url);

const CANDIDATE_QUEUE_DIR = "dev_worker_candidate_queue";
const READY_QUEUE_DIR = "dev_worker_queue";
const AUTO_APPROVAL_POLICY_ID = "dev_worker_auto_approval_policy_v0";
const AUTO_APPROVAL_RISK_LEVELS = new Set(["low", "routine"]);
const CLOSED_CANDIDATE_STATUSES = new Set(["completed", "promoted", "rejected", "dropped", "cancelled"]);
const PROMOTABLE_CANDIDATE_STATUSES = new Set(["approved", "proposed", "open", "approval-only"]);
const AUTO_APPROVAL_SAFE_PATH_PREFIXES = [
  "docs/architecture/guild_hall/",
  "guild_hall/dev_worker/",
  "guild_hall/night_watch/",
];
const AUTO_APPROVAL_SAFE_FILE_PATHS = new Set([
  "CHANGELOG.md",
]);
const AUTO_APPROVAL_ACCEPTANCE_PREFIXES = [
  "git diff --check",
  "npm run validate",
  "npm run done:check",
  "node --test guild_hall/dev_worker/",
  "node --test guild_hall/night_watch/",
];
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/u;
const CONTROL_CHARACTER_ESCAPE_PATTERN = /[\u0000-\u001F\u007F]/gu;

export async function discoverCandidatePackets(options = {}) {
  const localRoot = path.resolve(options.localRoot ?? process.cwd());
  const workmetaRoot = options.workmetaRoot ? path.resolve(options.workmetaRoot) : path.join(localRoot, "_workmeta");
  const packets = [];

  if (!(await pathExists(workmetaRoot))) {
    return packets;
  }

  const projectEntries = await fs.readdir(workmetaRoot, { withFileTypes: true });
  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) {
      continue;
    }
    const queueRoot = path.join(workmetaRoot, projectEntry.name, CANDIDATE_QUEUE_DIR);
    if (!(await pathExists(queueRoot))) {
      continue;
    }
    const queueEntries = await fs.readdir(queueRoot, { withFileTypes: true });
    for (const queueEntry of queueEntries) {
      if (!queueEntry.isFile() || !/\.ya?ml$/u.test(queueEntry.name)) {
        continue;
      }
      const packetPath = path.join(queueRoot, queueEntry.name);
      packets.push({
        project_code: projectEntry.name,
        packet_path: packetPath,
        packet_ref: normalizePacketRef(localRoot, packetPath),
      });
    }
  }

  return packets.sort((left, right) => left.packet_ref.localeCompare(right.packet_ref));
}

export async function listCandidatePackets(options = {}) {
  const packets = await discoverCandidatePackets(options);
  const candidates = [];
  const skipped = [];

  for (const packet of packets) {
    try {
      const raw = parseYaml(await fs.readFile(packet.packet_path, "utf8"));
      candidates.push(normalizeCandidate(raw, packet));
    } catch (error) {
      skipped.push({
        packet_ref: packet.packet_ref,
        reason: `parse_error:${error.message}`,
      });
    }
  }

  return {
    candidates,
    skipped,
    scanned_count: packets.length,
    promotable_count: candidates.filter((candidate) => candidate.promotable).length,
    auto_approvable_count: candidates.filter((candidate) => candidate.auto_approval.eligible).length,
    active_candidate_count: candidates.filter((candidate) => !isClosedCandidateStatus(candidate.status)).length,
    closed_candidate_count: candidates.filter((candidate) => isClosedCandidateStatus(candidate.status)).length,
    status_counts: countCandidateStatuses(candidates),
  };
}

export function formatCandidateQueueText(result, options = {}) {
  const lines = [
    `candidates: ${result.candidates.length}`,
    `promotable: ${result.promotable_count}`,
    `auto-approvable: ${result.auto_approvable_count}`,
    `active-candidates: ${result.active_candidate_count}`,
    `closed-candidates: ${result.closed_candidate_count}`,
  ];

  if (result.status_counts && Object.keys(result.status_counts).length > 0) {
    lines.push("status:");
    for (const [status, count] of Object.entries(result.status_counts)) {
      lines.push(`- ${status}: ${count}`);
    }
  }

  const showDetails = options.details === true;
  if (showDetails && result.candidates.length > 0) {
    lines.push("details:");
    for (const candidate of result.candidates) {
      const promotableState = candidate.promotable ? "yes" : `no (${candidate.ineligible_reason})`;
      const autoApprovalState = candidate.auto_approval.eligible
        ? "eligible"
        : `no (${candidate.auto_approval.reason})`;
      lines.push(`- ${candidate.task_id} [${candidate.status || "missing"}] ${candidate.packet_ref}`);
      lines.push(`  project: ${candidate.project_code}`);
      lines.push(`  promotable: ${promotableState}`);
      lines.push(`  owner-approval: ${formatOwnerApprovalState(candidate)}`);
      lines.push(`  auto-approval: ${autoApprovalState}`);
    }
  }

  if (showDetails && result.skipped.length > 0) {
    lines.push("skipped:");
    for (const skipped of result.skipped) {
      lines.push(`- ${skipped.packet_ref}: ${skipped.reason}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function autoApproveCandidates(options = {}) {
  const localRoot = path.resolve(options.localRoot ?? process.cwd());
  const workmetaRoot = options.workmetaRoot ? path.resolve(options.workmetaRoot) : path.join(localRoot, "_workmeta");
  const listed = await listCandidatePackets({ localRoot, workmetaRoot });
  const autoApproved = [];
  const skipped = [...listed.skipped];

  for (const candidate of listed.candidates) {
    if (!candidate.auto_approval.eligible) {
      skipped.push({
        packet_ref: candidate.packet_ref,
        reason: candidate.auto_approval.reason,
      });
      continue;
    }

    const raw = parseYaml(await fs.readFile(candidate.packet_path, "utf8"));
    const approvedAt = new Date().toISOString();
    const updatedCandidate = {
      ...raw,
      status: "approved",
      owner_approval: {
        ...(raw.owner_approval && typeof raw.owner_approval === "object" ? raw.owner_approval : {}),
        required: true,
        approved: true,
        approved_by: `auto_policy:${AUTO_APPROVAL_POLICY_ID}`,
        approved_at: approvedAt,
      },
      auto_approval: {
        ...(raw.auto_approval && typeof raw.auto_approval === "object" ? raw.auto_approval : {}),
        requested: true,
        approved: true,
        policy_id: AUTO_APPROVAL_POLICY_ID,
        approved_at: approvedAt,
      },
    };

    await fs.writeFile(candidate.packet_path, stringifyYaml(updatedCandidate), "utf8");
    autoApproved.push({
      task_id: candidate.task_id,
      packet_ref: candidate.packet_ref,
      policy_id: AUTO_APPROVAL_POLICY_ID,
    });
  }

  return {
    auto_approved: autoApproved,
    skipped,
    auto_approved_count: autoApproved.length,
    scanned_count: listed.scanned_count,
  };
}

export async function promoteApprovedCandidates(options = {}) {
  const localRoot = path.resolve(options.localRoot ?? process.cwd());
  const workmetaRoot = options.workmetaRoot ? path.resolve(options.workmetaRoot) : path.join(localRoot, "_workmeta");
  const listed = await listCandidatePackets({ localRoot, workmetaRoot });
  const promoted = [];
  const skipped = [...listed.skipped];

  for (const candidate of listed.candidates) {
    if (!candidate.promotable) {
      skipped.push({
        packet_ref: candidate.packet_ref,
        reason: candidate.ineligible_reason,
      });
      continue;
    }

    const targetProject = sanitizeSlug(candidate.project_code || "system");
    const targetRoot = path.join(workmetaRoot, targetProject, READY_QUEUE_DIR);
    const targetPath = path.join(targetRoot, `${sanitizeSlug(candidate.task_id)}.yaml`);
    if (await pathExists(targetPath)) {
      skipped.push({
        packet_ref: candidate.packet_ref,
        reason: `target_exists:${normalizePacketRef(localRoot, targetPath)}`,
      });
      continue;
    }

    const raw = parseYaml(await fs.readFile(candidate.packet_path, "utf8"));
    const readyPacket = buildReadyPacket(raw, candidate);
    const updatedCandidate = {
      ...raw,
      status: "promoted",
      promoted_to: normalizePacketRef(localRoot, targetPath),
      promoted_at: new Date().toISOString(),
    };

    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(targetPath, stringifyYaml(readyPacket), "utf8");
    await fs.writeFile(candidate.packet_path, stringifyYaml(updatedCandidate), "utf8");

    promoted.push({
      task_id: candidate.task_id,
      from: candidate.packet_ref,
      to: normalizePacketRef(localRoot, targetPath),
    });
  }

  return {
    promoted,
    skipped,
    promoted_count: promoted.length,
    scanned_count: listed.scanned_count,
  };
}

function normalizeCandidate(raw, source) {
  const taskId = sanitizeSlug(raw?.task_id ?? raw?.id ?? path.basename(source.packet_path, path.extname(source.packet_path)));
  const status = String(raw?.status ?? "").trim().toLowerCase();
  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  const approvalRequired = parseBoolean(raw?.owner_approval?.required, true);
  const approvalApproved = parseBoolean(raw?.owner_approval?.approved, false);
  const allowedWritePaths = normalizeStringArray(raw?.allowed_write_paths);
  const acceptanceChecks = normalizeStringArray(raw?.acceptance_checks);
  const missing = [];

  if (!raw?.schema_version) {
    missing.push("schema_version");
  }
  if (!taskId) {
    missing.push("task_id");
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

  const candidateBase = {
    ...source,
    schema_version: String(raw?.schema_version ?? ""),
    task_id: taskId,
    status,
    summary,
    project_code: sanitizeSlug(raw?.project_code ?? source.project_code ?? "system"),
    branch_slug: sanitizeSlug(raw?.branch_slug ?? taskId),
    allowed_write_paths: allowedWritePaths,
    acceptance_checks: acceptanceChecks,
    origin: raw?.origin && typeof raw.origin === "object" ? raw.origin : null,
    owner_approval: {
      required: approvalRequired,
      approved: approvalApproved,
      approved_by: String(raw?.owner_approval?.approved_by ?? ""),
      approved_at: String(raw?.owner_approval?.approved_at ?? ""),
    },
  };
  const autoApproval = evaluateAutoApproval(raw, candidateBase, missing);
  const promotable = missing.length === 0 && PROMOTABLE_CANDIDATE_STATUSES.has(status) && approvalApproved;
  const ineligibleReason = promotable
    ? null
    : missing.length > 0
      ? `missing_required_fields:${missing.join(",")}`
      : isClosedCandidateStatus(status)
        ? `status_closed:${status}`
        : !PROMOTABLE_CANDIDATE_STATUSES.has(status)
        ? `status_not_promotable:${status || "missing"}`
        : "owner_approval_not_approved";

  return {
    ...candidateBase,
    promotable,
    ineligible_reason: ineligibleReason,
    auto_approval: autoApproval,
  };
}

function formatOwnerApprovalState(candidate) {
  const status = candidate.status || "missing";
  const approval = candidate.owner_approval ?? {};
  const requirementState = approval.required ? "required" : "not required";

  if (approval.approved) {
    if (candidate.promotable) {
      return "approved (promotable)";
    }
    if (isClosedCandidateStatus(status)) {
      return `approved (closed ${status}; not promotable)`;
    }
    return `approved (status ${status}; not promotable)`;
  }

  return `not-approved (${requirementState}; not promotable)`;
}

function countCandidateStatuses(candidates) {
  const counts = {};
  for (const candidate of candidates) {
    const status = candidate.status || "missing";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function isClosedCandidateStatus(status) {
  return CLOSED_CANDIDATE_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

function buildReadyPacket(raw, candidate) {
  return {
    schema_version: raw.schema_version,
    task_id: candidate.task_id,
    status: "ready",
    lane: raw.lane ?? "dev_worker",
    requested_by: raw.requested_by ?? "agent_candidate_promotion",
    project_code: candidate.project_code,
    summary: candidate.summary,
    branch_slug: candidate.branch_slug,
    allowed_write_paths: candidate.allowed_write_paths,
    acceptance_checks: candidate.acceptance_checks,
    stop_conditions: normalizeStringArray(raw.stop_conditions),
    draft_branch_allowed: parseBoolean(raw.draft_branch_allowed, false),
    origin: raw.origin ?? {
      kind: "agent_generated",
    },
    owner_approval: {
      required: true,
      approved: true,
      approved_by: candidate.owner_approval.approved_by,
      approved_at: candidate.owner_approval.approved_at,
    },
    promotion_source: candidate.packet_ref,
    notes: normalizeStringArray(raw.notes),
  };
}

function normalizePacketRef(localRoot, packetPath) {
  const relative = path.relative(localRoot, packetPath);
  return relative && !relative.startsWith("..") ? normalizeRepoPath(relative) : packetPath;
}

function evaluateAutoApproval(raw, candidate, missing) {
  const request = raw?.auto_approval && typeof raw.auto_approval === "object" ? raw.auto_approval : {};
  const requested = parseBoolean(request.requested, false);
  const riskLevel = String(request.risk_level ?? raw?.risk_level ?? "").trim().toLowerCase();
  const status = candidate.status;
  const originKind = String(candidate.origin?.kind ?? "").trim().toLowerCase();

  if (!requested) {
    return autoApprovalResult(false, "auto_approval_not_requested", riskLevel);
  }
  if (missing.length > 0) {
    return autoApprovalResult(false, `missing_required_fields:${missing.join(",")}`, riskLevel);
  }
  if (!["proposed", "open"].includes(status)) {
    return autoApprovalResult(false, `status_not_auto_approvable:${status || "missing"}`, riskLevel);
  }
  if (originKind !== "agent_generated") {
    return autoApprovalResult(false, `origin_not_agent_generated:${originKind || "missing"}`, riskLevel);
  }
  if (!AUTO_APPROVAL_RISK_LEVELS.has(riskLevel)) {
    return autoApprovalResult(false, `risk_level_not_allowed:${riskLevel || "missing"}`, riskLevel);
  }

  const unsafePath = findUnsafeAutoApprovalPath(raw?.allowed_write_paths, candidate.allowed_write_paths);
  if (unsafePath) {
    return autoApprovalResult(false, `write_path_not_allowed:${unsafePath}`, riskLevel);
  }

  const unsafeCheck = findUnsafeAutoApprovalCheck(raw?.acceptance_checks, candidate.acceptance_checks);
  if (unsafeCheck) {
    return autoApprovalResult(false, `acceptance_check_not_allowed:${unsafeCheck}`, riskLevel);
  }

  return autoApprovalResult(true, "eligible", riskLevel);
}

function autoApprovalResult(eligible, reason, riskLevel) {
  return {
    requested: reason !== "auto_approval_not_requested" || eligible,
    eligible,
    reason: escapeControlCharacters(reason),
    risk_level: riskLevel,
    policy_id: AUTO_APPROVAL_POLICY_ID,
  };
}

function isAutoApprovalSafePath(value) {
  const raw = String(value ?? "");
  if (CONTROL_CHARACTER_PATTERN.test(raw)) {
    return false;
  }
  const normalized = normalizeCandidatePath(raw);
  if (!normalized || normalized.startsWith("/") || hasParentPathSegment(normalized)) {
    return false;
  }
  const basePath = normalized.replace(/\/?\*\*$/u, "");
  const normalizedBasePath = path.posix.normalize(basePath);
  if (
    !normalizedBasePath
    || normalizedBasePath === "."
    || normalizedBasePath.startsWith("/")
    || hasParentPathSegment(normalizedBasePath)
  ) {
    return false;
  }
  if (AUTO_APPROVAL_SAFE_FILE_PATHS.has(normalized) || AUTO_APPROVAL_SAFE_FILE_PATHS.has(normalizedBasePath)) {
    return true;
  }
  return AUTO_APPROVAL_SAFE_PATH_PREFIXES.some((prefix) => {
    const safeBase = prefix.replace(/\/+$/u, "");
    return normalizedBasePath === safeBase || normalizedBasePath.startsWith(`${safeBase}/`);
  });
}

function hasParentPathSegment(value) {
  return String(value).split("/").includes("..");
}

function findFirstControlCharacterItem(rawItems) {
  if (!Array.isArray(rawItems)) {
    return null;
  }
  for (const item of rawItems) {
    const rawItem = String(item ?? "");
    if (CONTROL_CHARACTER_PATTERN.test(rawItem)) {
      return rawItem;
    }
  }
  return null;
}

function findUnsafeAutoApprovalPath(rawAllowedWritePaths, normalizedAllowedWritePaths) {
  const controlPath = findFirstControlCharacterItem(rawAllowedWritePaths);
  if (controlPath !== null) {
    return controlPath;
  }

  const sourcePaths = Array.isArray(rawAllowedWritePaths)
    ? rawAllowedWritePaths
        .map((item) => String(item ?? ""))
        .filter((item) => item.trim())
        .slice(0, 40)
    : normalizedAllowedWritePaths;

  for (const allowedPath of sourcePaths) {
    const rawPath = String(allowedPath ?? "");
    if (!isAutoApprovalSafePath(rawPath)) {
      return CONTROL_CHARACTER_PATTERN.test(rawPath) ? rawPath : rawPath.trim();
    }
  }

  return null;
}

function findUnsafeAutoApprovalCheck(rawAcceptanceChecks, normalizedAcceptanceChecks) {
  const controlCheck = findFirstControlCharacterItem(rawAcceptanceChecks);
  if (controlCheck !== null) {
    return controlCheck;
  }

  const sourceChecks = Array.isArray(rawAcceptanceChecks)
    ? rawAcceptanceChecks
        .map((item) => String(item ?? ""))
        .filter((item) => item.trim())
        .slice(0, 40)
    : normalizedAcceptanceChecks;

  for (const check of sourceChecks) {
    const rawCheck = String(check ?? "");
    if (!isAutoApprovalSafeCheck(rawCheck)) {
      return CONTROL_CHARACTER_PATTERN.test(rawCheck) ? rawCheck : rawCheck.trim();
    }
  }

  return null;
}

function isAutoApprovalSafeCheck(value) {
  const raw = String(value ?? "");
  if (CONTROL_CHARACTER_PATTERN.test(raw)) {
    return false;
  }
  const normalized = raw.trim();
  if (!normalized || /[;&|`$<>]/u.test(normalized)) {
    return false;
  }
  return AUTO_APPROVAL_ACCEPTANCE_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) {
      return normalized.startsWith(prefix);
    }
    return normalized === prefix || normalized.startsWith(`${prefix} `) || normalized.startsWith(`${prefix}:`);
  });
}

function escapeControlCharacters(value) {
  return String(value ?? "").replace(CONTROL_CHARACTER_ESCAPE_PATTERN, (character) => {
    switch (character) {
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\t":
        return "\\t";
      default:
        return `\\u${character.codePointAt(0).toString(16).padStart(4, "0").toUpperCase()}`;
    }
  });
}

function normalizeCandidatePath(value) {
  return normalizeRepoPath(String(value ?? "").trim())
    .replace(/^\.\//u, "")
    .replace(/\/+$/u, "");
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localRoot = path.resolve(args["local-root"] ?? process.cwd());
  const workmetaRoot = args["workmeta-root"] ? path.resolve(args["workmeta-root"]) : path.join(localRoot, "_workmeta");
  const autoPromote = args["auto-promote"] === true || args["auto-promote"] === "true";
  const autoApprove = autoPromote || args["auto-approve"] === true || args["auto-approve"] === "true";
  let result;

  if (autoApprove) {
    const approvalResult = await autoApproveCandidates({ localRoot, workmetaRoot });
    if (autoPromote) {
      const promotionResult = await promoteApprovedCandidates({ localRoot, workmetaRoot });
      result = {
        ...promotionResult,
        auto_approval: approvalResult,
      };
    } else {
      result = approvalResult;
    }
  } else if (args["promote-approved"] === true || args["promote-approved"] === "true") {
    result = await promoteApprovedCandidates({ localRoot, workmetaRoot });
  } else {
    result = await listCandidatePackets({ localRoot, workmetaRoot });
  }

  if (args.json === true || args.json === "true") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if ("auto_approved_count" in result) {
    process.stdout.write(`auto-approved: ${result.auto_approved_count}\nscanned: ${result.scanned_count}\n`);
    return;
  }

  if ("promoted_count" in result) {
    process.stdout.write(`promoted: ${result.promoted_count}\nscanned: ${result.scanned_count}\n`);
    return;
  }

  process.stdout.write(formatCandidateQueueText(result, {
    details: args.details === true || args.details === "true",
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
