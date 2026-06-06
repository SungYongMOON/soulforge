#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  appendActivityEvent,
  buildDateStamps,
  defaultActivityRoot,
  readRecentActivityEvents,
} from "../activity/activity_log.mjs";
import { listCandidatePackets } from "../dev_worker/candidate_queue.mjs";
import { selectTask } from "../dev_worker/claim_task.mjs";
import { pathExists, readJson } from "../shared/io.mjs";
import { buildSnapshot, defaultSnapshotPath, writeSnapshot } from "../snapshot/producer.mjs";

const __filename = fileURLToPath(import.meta.url);

export const DAILY_WORK_PACKET_VERSION = "soulforge.daily_work_packet.v0";

const ACTIVE_MISSION_STATUSES = new Set(["active", "held", "started", "in_progress"]);
const ATTENTION_CANDIDATE_STATUSES = new Set(["proposed", "open", "approved", "approval-only"]);
const CLOSED_CANDIDATE_STATUSES = new Set(["completed", "promoted", "rejected", "dropped", "cancelled", "closed"]);
const OWNER_APPROVAL_APPROVED_STATES = new Set(["approved", "approved-only", "approval-only"]);

export async function buildDailyWorkPacket(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date();
  const activityRoot = path.resolve(options.activityRoot ?? defaultActivityRoot(repoRoot));
  const workmetaRoot = options.workmetaRoot ? path.resolve(options.workmetaRoot) : path.join(repoRoot, "_workmeta");
  const snapshot = options.snapshot ?? (await buildSnapshot({ repoRoot, generatedAt: generatedAt.toISOString() }));
  const latestContext = options.latestContext ?? (await readLatestContext(activityRoot));
  const devWorkerClaim = options.devWorkerClaim ?? (await selectTask({ localRoot: repoRoot, workmetaRoot }));
  const devWorkerCandidates = options.devWorkerCandidates ?? (await listCandidatePackets({ localRoot: repoRoot, workmetaRoot }));
  const devWorkerCandidateItems = Array.isArray(devWorkerCandidates?.candidates) ? devWorkerCandidates.candidates : [];
  const missionItems = Array.isArray(snapshot?.operation_board?.sections?.mission_board?.items)
    ? snapshot.operation_board.sections.mission_board.items
    : [];
  const blockedOrActiveMissions = missionItems
    .filter((mission) => isMissionBlockedOrActive(mission))
    .map((mission) => normalizeMissionWorkItem(mission));
  const carryForwardThreads = Array.isArray(latestContext?.open_threads) ? latestContext.open_threads.slice(0, 8) : [];
  const boardActions = Array.isArray(snapshot?.operation_board?.sections?.action_queue?.items)
    ? snapshot.operation_board.sections.action_queue.items.slice(0, 8)
    : [];

  return {
    schema_version: DAILY_WORK_PACKET_VERSION,
    generated_at: generatedAt.toISOString(),
    repo_branch: snapshot?.repo?.branch ?? null,
    source_refs: {
      snapshot: "guild_hall/state/snapshot/soulforge_snapshot.json",
      latest_context: "guild_hall/state/operations/soulforge_activity/latest_context.json",
      mission_index: ".mission/index.yaml",
      dev_worker_task_sources: [
        ".mission/<mission_id>/dev_worker_request.yaml",
        "_workmeta/<project_code>/dev_worker_queue/*.yaml",
      ],
      dev_worker_candidate_sources: [
        "_workmeta/<project_code>/dev_worker_candidate_queue/*.yaml",
      ],
    },
    summary: {
      project_count: Array.isArray(snapshot?.projects) ? snapshot.projects.length : 0,
      mission_count: Array.isArray(snapshot?.missions?.items) ? snapshot.missions.items.length : 0,
      blocked_or_active_mission_count: blockedOrActiveMissions.length,
      pending_monster_count: snapshot?.gateway?.pending_monsters?.count ?? 0,
      carry_forward_thread_count: carryForwardThreads.length,
      dev_worker_status: devWorkerClaim?.selected ? "task_available" : "no_task",
      dev_worker_candidate_count: devWorkerCandidateItems.length,
      dev_worker_promotable_candidate_count: devWorkerCandidates?.promotable_count ?? 0,
      dev_worker_auto_approvable_candidate_count: devWorkerCandidates?.auto_approvable_count ?? 0,
      diagnostics_status: snapshot?.diagnostics?.summary?.highest_severity ?? "unknown",
    },
    mission_work_queue: blockedOrActiveMissions,
    carry_forward_threads: carryForwardThreads,
    board_actions: boardActions,
    dev_worker: {
      selected: devWorkerClaim?.selected ?? null,
      eligible_count: devWorkerClaim?.eligible_count ?? 0,
      scanned_count: devWorkerClaim?.scanned_count ?? 0,
      candidates: selectVisibleDevWorkerCandidates(devWorkerCandidateItems, 8),
      candidate_count: devWorkerCandidateItems.length,
      promotable_candidate_count: devWorkerCandidates?.promotable_count ?? 0,
      auto_approvable_candidate_count: devWorkerCandidates?.auto_approvable_count ?? 0,
    },
    owner_questions: blockedOrActiveMissions
      .map((mission) => mission.escalation_question)
      .filter(Boolean)
      .slice(0, 5),
    draft_only: true,
    notes: [
      "This packet is a local-only draft work planner. It does not mutate mission status, approve decisions, or execute work by itself.",
      "Use this packet to decide whether a mission should yield a dev_worker draft packet, a private project task packet, or an owner question.",
    ],
  };
}

export function renderDailyWorkPacketMarkdown(packet) {
  const lines = [
    "# Soulforge Daily Work Packet",
    "",
    `- Schema: \`${packet.schema_version}\``,
    `- Generated: \`${packet.generated_at}\``,
    packet.repo_branch ? `- Repo branch: \`${packet.repo_branch}\`` : null,
    "- Draft only: `true`",
    "",
    "## Summary",
    "",
    `- Projects: ${packet.summary.project_count}`,
    `- Missions: ${packet.summary.mission_count}`,
    `- Blocked or active missions: ${packet.summary.blocked_or_active_mission_count}`,
    `- Pending monsters: ${packet.summary.pending_monster_count}`,
    `- Carry-forward threads: ${packet.summary.carry_forward_thread_count}`,
    `- Dev worker status: ${packet.summary.dev_worker_status}`,
    `- Dev worker candidates: ${packet.summary.dev_worker_candidate_count}`,
    `- Promotable candidates: ${packet.summary.dev_worker_promotable_candidate_count}`,
    `- Auto-approvable candidates: ${packet.summary.dev_worker_auto_approvable_candidate_count}`,
    `- Diagnostics: ${packet.summary.diagnostics_status}`,
    "",
    "## Mission Work Queue",
    "",
  ];

  if (packet.mission_work_queue.length === 0) {
    lines.push("- No blocked or active missions were projected.");
  } else {
    for (const mission of packet.mission_work_queue) {
      lines.push(`### ${mission.title}`);
      lines.push("");
      lines.push(`- Mission: \`${mission.mission_id ?? "unknown"}\``);
      lines.push(`- Status: \`${mission.status}\` / readiness \`${mission.readiness_status}\``);
      lines.push(`- Display group: \`${mission.display_group}\``);
      lines.push(`- Bottleneck reason: \`${mission.bottleneck_reason}\``);
      lines.push(`- Intervention budget: \`${mission.intervention_budget}\``);
      lines.push(`- Suggested next action: ${mission.suggested_next_action}`);
      lines.push(`- Stop conditions: ${mission.stop_conditions.join("; ")}`);
      lines.push(`- Escalation question: ${mission.escalation_question}`);
      lines.push("");
    }
  }

  lines.push("## Carry-Forward Threads", "");
  if (packet.carry_forward_threads.length === 0) {
    lines.push("- No carry-forward activity threads were projected.");
  } else {
    for (const thread of packet.carry_forward_threads) {
      lines.push(`- \`${thread.scope}\` / \`${thread.action}\`: ${thread.summary}`);
      if (thread.next_action) {
        lines.push(`  next: ${thread.next_action}`);
      }
    }
  }

  lines.push("", "## Board Actions", "");
  if (packet.board_actions.length === 0) {
    lines.push("- No board actions were projected.");
  } else {
    for (const action of packet.board_actions) {
      lines.push(`- \`${action.status}\` ${action.summary}`);
    }
  }

  lines.push("", "## Dev Worker Claim State", "");
  if (packet.dev_worker.selected) {
    lines.push(`- Selected task: \`${packet.dev_worker.selected.task_id}\``);
    lines.push(`- Suggested branch: \`${packet.dev_worker.selected.suggested_branch}\``);
    lines.push(`- Packet: \`${packet.dev_worker.selected.packet_ref}\``);
  } else {
    lines.push("- No eligible task packet was available.");
  }

  lines.push("", "## Dev Worker Candidate Queue", "");
  if (!packet.dev_worker.candidates || packet.dev_worker.candidates.length === 0) {
    lines.push("- No dev worker candidate packets were found.");
  } else {
    for (const candidate of packet.dev_worker.candidates) {
      const state = candidate.promotable
        ? "promotable"
        : candidate.auto_approval?.eligible
          ? "auto-approvable"
          : candidate.ineligible_reason;
      const ownerApprovalState = candidate.owner_approval_state || formatOwnerApprovalState(candidate);
      lines.push(
        `- \`${candidate.status}\` / \`${state}\` / owner_approval_state \`${ownerApprovalState}\` ${candidate.task_id}: ${candidate.summary}`,
      );
    }
  }

  lines.push("", "## Owner Questions", "");
  if (packet.owner_questions.length === 0) {
    lines.push("- No owner questions were derived.");
  } else {
    for (const question of packet.owner_questions) {
      lines.push(`- ${question}`);
    }
  }

  lines.push("", "## Notes", "");
  for (const note of packet.notes) {
    lines.push(`- ${note}`);
  }

  return `${lines.filter(Boolean).join("\n")}\n`;
}

export async function writeDailyWorkPacket(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const activityRoot = path.resolve(options.activityRoot ?? defaultActivityRoot(repoRoot));
  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date();
  const stamps = buildDateStamps(generatedAt);
  const packet = await buildDailyWorkPacket({ ...options, repoRoot, activityRoot, generatedAt });
  const outputPath = options.outputPath
    ? path.resolve(options.outputPath)
    : path.join(activityRoot, "log", stamps.year, stamps.date, `${stamps.time}-soulforge-daily-work-packet.md`);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, renderDailyWorkPacketMarkdown(packet), "utf8");

  return {
    packet,
    output_path: outputPath,
  };
}

async function readLatestContext(activityRoot) {
  const latestContextPath = path.join(activityRoot, "latest_context.json");
  if (await pathExists(latestContextPath)) {
    try {
      return await readJson(latestContextPath);
    } catch {
      return { open_threads: [] };
    }
  }

  const recentEntries = await readRecentActivityEvents({ activityRoot, limit: 12 });
  return { open_threads: recentEntries.filter((entry) => entry?.carry_forward === true) };
}

function isMissionBlockedOrActive(mission) {
  return mission?.status === "blocked" || mission?.readiness_status === "blocked" || ACTIVE_MISSION_STATUSES.has(mission?.status);
}

function normalizeMissionWorkItem(mission) {
  const blockedWithoutWorkflow = mission.workflow_id_present === false;
  const bottleneckReason = blockedWithoutWorkflow
    ? "missing_owner_boundary"
    : mission.readiness_status === "blocked"
      ? "human_confirmation_required"
      : "quality_review_needed";

  const stopConditions = blockedWithoutWorkflow
    ? ["stop_if_workflow_route_unresolved", "stop_if_owner_scope_is_unclear"]
    : mission.readiness_status === "blocked"
      ? ["stop_if_owner_approval_is_required", "stop_if_private_or_secret_input_is_needed"]
      : ["stop_if_acceptance_check_is_missing"];

  return {
    mission_id: mission.mission_id ?? null,
    title: mission.title ?? mission.mission_id ?? "untitled_mission",
    project_code: mission.project_code ?? "shared",
    status: mission.status ?? "unknown",
    readiness_status: mission.readiness_status ?? "unknown",
    display_group: mission.display_group ?? "other",
    bottleneck_reason: bottleneckReason,
    intervention_budget: 1,
    suggested_next_action: blockedWithoutWorkflow
      ? "Route this mission into a bounded workflow or owner lane decision before generating a worker task."
      : mission.readiness_status === "blocked"
        ? "Prepare one bounded unblock packet or private task packet instead of asking multiple open-ended questions."
        : "Convert the next bounded deliverable into a runner or dev-worker draft packet.",
    stop_conditions: stopConditions,
    escalation_question: blockedWithoutWorkflow
      ? `Which single workflow or owner lane should own the next bounded step for mission "${mission.title}"?`
      : `What is the smallest owner decision needed to unblock mission "${mission.title}"?`,
  };
}

function selectVisibleDevWorkerCandidates(candidates, limit) {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const priorityDelta = getCandidateVisibilityPriority(left.candidate) - getCandidateVisibilityPriority(right.candidate);
      return priorityDelta === 0 ? left.index - right.index : priorityDelta;
    })
    .slice(0, limit)
    .map((entry) => withCandidateDisplayFields(entry.candidate));
}

function getCandidateVisibilityPriority(candidate) {
  if (candidate?.promotable === true) {
    return 0;
  }

  if (candidate?.auto_approval?.eligible === true) {
    return 1;
  }

  const status = String(candidate?.status ?? "").trim().toLowerCase();
  if (ATTENTION_CANDIDATE_STATUSES.has(status)) {
    return 2;
  }

  if (!CLOSED_CANDIDATE_STATUSES.has(status)) {
    return 3;
  }

  return 4;
}

function withCandidateDisplayFields(candidate) {
  return {
    ...candidate,
    owner_approval_state: formatOwnerApprovalState(candidate),
  };
}

function formatOwnerApprovalState(candidate) {
  const status = String(candidate?.status ?? "").trim().toLowerCase() || "missing";
  const approval = candidate?.owner_approval && typeof candidate.owner_approval === "object" ? candidate.owner_approval : {};
  const explicitState = String(approval.state ?? approval.status ?? "").trim().toLowerCase();
  const existingDisplay = String(candidate?.owner_approval_state ?? candidate?.approval_display ?? "").trim();
  const existingDisplayState = existingDisplay.toLowerCase();

  if (existingDisplay && !OWNER_APPROVAL_APPROVED_STATES.has(existingDisplayState)) {
    return existingDisplay;
  }

  const approved = parseDisplayBoolean(approval.approved, false)
    || OWNER_APPROVAL_APPROVED_STATES.has(explicitState)
    || OWNER_APPROVAL_APPROVED_STATES.has(existingDisplayState);
  const required = parseDisplayBoolean(approval.required, true);

  if (approved) {
    if (candidate?.promotable === true) {
      return "approved (promotable)";
    }
    if (CLOSED_CANDIDATE_STATUSES.has(status)) {
      return `approved (closed ${status}; not promotable)`;
    }
    return `approved (status ${status}; not promotable)`;
  }

  return required ? "not-approved (needs owner approval; not promotable)" : "not-approved (not required; not promotable)";
}

function parseDisplayBoolean(value, fallback) {
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

async function maybeRecordActivity({ repoRoot, activityRoot, result }) {
  await appendActivityEvent({
    repoRoot,
    activityRoot,
    input: {
      scope: "night_watch",
      project_code: "shared",
      action: "daily_work_packet",
      result: "draft_written",
      summary: `night_watch wrote a draft-only daily work packet with ${result.packet.summary.blocked_or_active_mission_count} blocked or active missions and dev_worker status ${result.packet.summary.dev_worker_status}.`,
      refs: [path.relative(repoRoot, result.output_path).split(path.sep).join("/")],
      detail_owner: "guild_hall/night_watch plus guild_hall/state/operations/soulforge_activity",
      next_action: "Review the draft-only packet before creating any dev_worker or private task packets.",
      carry_forward: true,
    },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());
  const activityRoot = path.resolve(args["activity-root"] ?? defaultActivityRoot(repoRoot));
  const snapshotPath = path.resolve(args.snapshot ?? args["snapshot-path"] ?? defaultSnapshotPath(repoRoot));

  let snapshot;
  if (args["use-stored-snapshot"] === true || args["use-stored-snapshot"] === "true") {
    snapshot = await readJson(snapshotPath);
  } else {
    snapshot = await buildSnapshot({ repoRoot });
    if (args["write-snapshot"] === true || args["write-snapshot"] === "true") {
      await writeSnapshot(snapshot, snapshotPath);
    }
  }

  const result = await writeDailyWorkPacket({
    repoRoot,
    activityRoot,
    workmetaRoot: args["workmeta-root"],
    outputPath: args.out,
    snapshot,
  });

  if (args.record === true || args.record === "true") {
    await maybeRecordActivity({ repoRoot, activityRoot, result });
  }

  if (args.json === true || args.json === "true") {
    process.stdout.write(`${JSON.stringify({ status: "written", ...result }, null, 2)}\n`);
    return;
  }

  process.stdout.write([
    "daily work packet written",
    `output: ${result.output_path}`,
    `missions: ${result.packet.summary.blocked_or_active_mission_count}`,
    `dev_worker: ${result.packet.summary.dev_worker_status}`,
  ].join("\n"));
  process.stdout.write("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
