import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";

import { syncMonsterIndexInbox } from "../gateway/monster_index.mjs";
import {
  buildProjectMailHistoryEntry,
  projectMailHistoryRefs,
  upsertProjectMailHistory,
} from "../gateway/project_mail_history_writer.mjs";
import { appendJsonl, readJson, relativeToRepo, writeJson } from "../shared/io.mjs";

export const FILING_PACKET_SCHEMA_VERSION = "soulforge.dungeon_assignment.filing_packet.v1";
export const PROJECT_MONSTER_SCHEMA_VERSION = "soulforge.project_monster.private.v1";
export const PUBLIC_MISSION_DRAFT_SCHEMA_VERSION = "soulforge.dungeon_assignment.public_mission_draft.v1";
export const PRIVATE_MISSION_HANDOFF_SCHEMA_VERSION = "soulforge.dungeon_assignment.private_mission_handoff.v1";

const WORKSPACE_INBOX_DIR = path.join("020_MGMT", "022_INBOX_원본수집");
const WORKSPACE_HISTORY_DIR = path.join("020_MGMT", "027_수신이력_이동이력");
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "body",
  "body_html",
  "body_text",
  "html",
  "raw",
  "raw_body",
  "raw_html",
  "attachment",
  "attachments",
  "attachment_payload",
  "attachment_payloads",
  "attachment_url",
  "attachment_urls",
  "local_path",
  "downloaded_path",
]);

export async function materializeDungeonAssignment(options) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const now = normalizeNow(options.now);
  const source = await loadAssignmentSource({ ...options, repoRoot });
  const routing = resolveRouting(source, options);
  if (options.emitPrivateMissionHandoff && options.emitPublicMissionDraft) {
    throw new Error("choose either --emit-private-mission-handoff or --emit-public-mission-draft, not both");
  }
  const missionIndex = await readMissionIndexForPlan({
    repoRoot,
    requested: Boolean(
      options.emitPublicMissionDraft && routing.project_code && routing.stage && options.publicProjectCode,
    ),
  });
  const privateMissionIndex = await readPrivateMissionIndexForPlan({
    repoRoot,
    projectCode: routing.project_code,
    requested: Boolean(options.emitPrivateMissionHandoff && routing.project_code && routing.stage),
  });
  const blockedReasons = [];

  if (!routing.project_code) {
    blockedReasons.push("unresolved_project");
  }

  if (!routing.stage) {
    blockedReasons.push("unresolved_stage");
  }

  const plan = buildFilingPlan({
    repoRoot,
    source,
    routing,
    now,
    publicMission: {
      emit: Boolean(options.emitPublicMissionDraft),
      publicProjectCode: options.publicProjectCode ?? null,
      missionId: options.missionId ?? null,
      partyId: options.partyId ?? "guild_master_cell",
      workflowId: options.workflowId ?? null,
      missionIndex,
    },
    privateMission: {
      emit: Boolean(options.emitPrivateMissionHandoff),
      missionId: options.missionId ?? null,
      partyId: options.partyId ?? "guild_master_cell",
      workflowId: options.workflowId ?? null,
      missionIndex: privateMissionIndex,
    },
    blockedReasons,
  });
  const gatewaySyncPlan = await buildGatewayTransferSyncPlan({
    repoRoot,
    source,
    routing,
    now,
    projectMonsterRef: plan.summary.project_monster_ref ?? null,
    missionRef:
      plan.summary.mission_handoff?.status === "created_private_handoff"
        ? plan.summary.mission_handoff.mission_ref
        : null,
  });
  const writes = [...plan.writes, ...gatewaySyncPlan.writes];
  const summary = {
    ...plan.summary,
    gateway_sync_back: gatewaySyncPlan.summary,
  };
  const privateMailHistoryPlan = buildAssignmentMailHistoryPlan({
    repoRoot,
    source,
    routing,
    now,
    summary,
  });
  const plannedWriteRefs = [
    ...writes.map((write) => write.repo_path),
    ...privateMailHistoryPlan.planned_refs,
  ];

  if (options.dryRun) {
    return {
      ...summary,
      dry_run: true,
      planned_writes: plannedWriteRefs,
    };
  }

  for (const write of writes) {
    if (write.kind === "json") {
      await writeJson(write.file_path, write.value);
    } else if (write.kind === "yaml") {
      await writeYaml(write.file_path, write.value);
    } else if (write.kind === "jsonl") {
      await appendJsonl(write.file_path, write.value);
    } else {
      throw new Error(`unsupported write kind: ${write.kind}`);
    }
  }

  if (gatewaySyncPlan.indexSync) {
    await syncMonsterIndexInbox(
      gatewaySyncPlan.indexSync.intake_inbox_root,
      gatewaySyncPlan.indexSync.inbox_id,
      gatewaySyncPlan.indexSync.monsters,
    );
  }
  const privateMailHistory = privateMailHistoryPlan.entry
    ? await upsertProjectMailHistory({
        repoRoot,
        projectCode: routing.project_code,
        entry: privateMailHistoryPlan.entry,
      })
    : {
        status: "skipped",
        reason: "missing_project_code",
        written_refs: [],
      };

  return {
    ...summary,
    private_mail_history: privateMailHistory,
    dry_run: false,
    written_refs: [...writes.map((write) => write.repo_path), ...privateMailHistory.written_refs],
  };
}

export function buildFilingPlan({
  repoRoot,
  source,
  routing,
  now,
  publicMission = {},
  privateMission = {},
  blockedReasons = [],
}) {
  const projectCode = routing.project_code ? safePathToken(routing.project_code, "project_code") : null;
  const monsterId = source.gateway_monster.monster_id;
  const writes = [];

  if (!projectCode) {
    return {
      summary: {
        request_id: `dungeon_assignment_${monsterId}`,
        status: "blocked",
        monster_id: monsterId,
        project_code: null,
        stage: routing.stage ?? null,
        blocked_reasons: blockedReasons,
        mission_handoff: { status: "not_created", reason: "unresolved_project" },
      },
      writes,
    };
  }

  const filingRoot = path.join(repoRoot, "_workmeta", projectCode, "artifacts", "mail_filing", safePathPart(monsterId));
  const filingPacketPath = path.join(filingRoot, "filing_packet.json");
  const projectMonsterPath = path.join(repoRoot, "_workmeta", projectCode, "monsters", `${safePathPart(monsterId)}.yaml`);
  const workspaceInboxRoot = path.join(repoRoot, "_workspaces", projectCode, WORKSPACE_INBOX_DIR, safePathPart(monsterId));
  const workspacePacketPath = path.join(workspaceInboxRoot, "filing_packet.json");
  const workspaceHistoryRoot = path.join(repoRoot, "_workspaces", projectCode, WORKSPACE_HISTORY_DIR);
  const mailReceiveHistoryPath = path.join(workspaceHistoryRoot, "mail_receive_history.jsonl");
  const filingMoveHistoryPath = path.join(workspaceHistoryRoot, "filing_move_history.jsonl");
  const filingPacketRef = relativeToRepo(repoRoot, filingPacketPath);
  const projectMonsterRef = relativeToRepo(repoRoot, projectMonsterPath);
  const workspacePacketRef = relativeToRepo(repoRoot, workspacePacketPath);
  const stage = routing.stage ?? null;

  const filingPacket = buildFilingPacket({
    source,
    routing,
    now,
    filingPacketRef,
    projectMonsterRef,
    workspacePacketRef,
  });
  assertNoForbiddenPayload(filingPacket, "filing packet");

  const missionPlan = buildMissionHandoffPlan({
    repoRoot,
    source,
    routing,
    now,
    filingPacketRef,
    projectMonsterRef,
    workspacePacketRef,
    publicMission,
    privateMission,
    blockedReasons,
  });

  const projectMonster = buildProjectMonsterDeclaration({
    source,
    routing,
    now,
    filingPacketRef,
    workspacePacketRef,
    missionRef: missionPlan.summary.status === "created_private_handoff" ? missionPlan.summary.mission_ref : null,
  });
  assertNoForbiddenPayload(projectMonster, "project monster declaration");

  writes.push({ kind: "json", file_path: filingPacketPath, repo_path: filingPacketRef, value: filingPacket });
  writes.push({ kind: "yaml", file_path: projectMonsterPath, repo_path: projectMonsterRef, value: projectMonster });
  writes.push({ kind: "json", file_path: workspacePacketPath, repo_path: workspacePacketRef, value: buildWorkspaceFilingBridge(filingPacket) });
  writes.push({
    kind: "jsonl",
    file_path: mailReceiveHistoryPath,
    repo_path: relativeToRepo(repoRoot, mailReceiveHistoryPath),
    value: buildWorkspaceHistoryEvent({
      eventType: "mail_filing_received",
      source,
      projectCode,
      stage,
      now,
      filingPacketRef,
      projectMonsterRef,
      workspacePacketRef,
    }),
  });
  writes.push({
    kind: "jsonl",
    file_path: filingMoveHistoryPath,
    repo_path: relativeToRepo(repoRoot, filingMoveHistoryPath),
    value: buildWorkspaceHistoryEvent({
      eventType: "mail_filing_bridged_to_workspace",
      source,
      projectCode,
      stage,
      now,
      filingPacketRef,
      projectMonsterRef,
      workspacePacketRef,
    }),
  });

  writes.push(...missionPlan.writes);

  return {
    summary: {
      request_id: `dungeon_assignment_${monsterId}`,
      status: blockedReasons.length > 0 ? "partially_filed" : "filed",
      monster_id: monsterId,
      project_code: projectCode,
      stage,
      filing_packet_ref: filingPacketRef,
      project_monster_ref: projectMonsterRef,
      workspace_filing_ref: workspacePacketRef,
      workspace_history_refs: [
        relativeToRepo(repoRoot, mailReceiveHistoryPath),
        relativeToRepo(repoRoot, filingMoveHistoryPath),
      ],
      blocked_reasons: blockedReasons,
      mission_handoff: missionPlan.summary,
    },
    writes,
  };
}

async function buildGatewayTransferSyncPlan({ repoRoot, source, routing, now, projectMonsterRef, missionRef }) {
  if (source.source_kind !== "gateway_monster" || !source.gateway_inbox_ref || !projectMonsterRef) {
    return {
      summary: { status: "not_applicable" },
      writes: [],
      indexSync: null,
    };
  }

  const inboxDir = resolveRepoOrAbsolute(repoRoot, source.gateway_inbox_ref);
  const inboxFile = path.join(inboxDir, "inbox.json");
  const monstersFile = path.join(inboxDir, "monsters.json");
  const historyFile = path.join(inboxDir, "history.jsonl");
  const inboxDocument = await readJson(inboxFile);
  const monsterDocument = await readJson(monstersFile);
  const index = normalizeMonsterArray(monsterDocument.monsters).findIndex(
    (entry) => entry.monster_id === source.gateway_monster.monster_id,
  );

  if (index === -1) {
    throw new Error(`gateway monster not found for sync-back: ${source.gateway_monster.monster_id}`);
  }

  const before = monsterDocument.monsters[index];
  const nextState = {
    ...before,
    assignment_status: "transferred",
    assigned_project_code: routing.project_code,
    assigned_stage: routing.stage ?? before.assigned_stage ?? null,
    project_monster_ref: projectMonsterRef,
    transferred_at: now,
    assignment_block_reason: null,
    assignment_updated_at: now,
    mission_ref: missionRef ?? before.mission_ref ?? null,
  };
  const stateChanges = collectChangedKeys(before, nextState).filter((change) => change !== "updated_at");

  if (stateChanges.length === 0) {
    return {
      summary: {
        status: "already_synced",
        inbox_ref: relativeToRepo(repoRoot, inboxDir),
        monster_id: before.monster_id,
      },
      writes: [],
      indexSync: null,
    };
  }

  const after = {
    ...nextState,
    updated_at: now,
  };
  const changes = collectChangedKeys(before, after);
  monsterDocument.monsters[index] = after;
  inboxDocument.assignment_status = computeGatewayInboxAssignmentStatus(monsterDocument.monsters);
  inboxDocument.updated_at = now;

  const updatedEvent = {
    event_type: "monster_updated",
    at: now,
    inbox_id: inboxDocument.workspace_intake_inbox_id ?? path.basename(inboxDir),
    source_ref: inboxDocument.source_ref ?? null,
    monster_id: after.monster_id,
    changes,
    before: pickRecordFields(before, changes),
    after: pickRecordFields(after, changes),
  };
  const transferEvent = {
    event_type: "transferred_to_project",
    at: now,
    inbox_id: inboxDocument.workspace_intake_inbox_id ?? path.basename(inboxDir),
    source_ref: inboxDocument.source_ref ?? null,
    monster_id: after.monster_id,
    assigned_project_code: after.assigned_project_code,
    assigned_stage: after.assigned_stage,
    assigned_target_inbox_ref: after.assigned_target_inbox_ref ?? null,
    project_monster_ref: after.project_monster_ref,
    transferred_at: after.transferred_at,
  };
  const globalEventFile = buildGatewayMonsterEventFile(repoRoot, now);

  return {
    summary: {
      status: "updated",
      inbox_ref: relativeToRepo(repoRoot, inboxDir),
      monster_id: after.monster_id,
      assignment_status: after.assignment_status,
    },
    writes: [
      {
        kind: "json",
        file_path: monstersFile,
        repo_path: relativeToRepo(repoRoot, monstersFile),
        value: monsterDocument,
      },
      {
        kind: "json",
        file_path: inboxFile,
        repo_path: relativeToRepo(repoRoot, inboxFile),
        value: inboxDocument,
      },
      {
        kind: "jsonl",
        file_path: historyFile,
        repo_path: relativeToRepo(repoRoot, historyFile),
        value: updatedEvent,
      },
      {
        kind: "jsonl",
        file_path: historyFile,
        repo_path: relativeToRepo(repoRoot, historyFile),
        value: transferEvent,
      },
      {
        kind: "jsonl",
        file_path: globalEventFile,
        repo_path: relativeToRepo(repoRoot, globalEventFile),
        value: updatedEvent,
      },
      {
        kind: "jsonl",
        file_path: globalEventFile,
        repo_path: relativeToRepo(repoRoot, globalEventFile),
        value: transferEvent,
      },
    ],
    indexSync: {
      intake_inbox_root: path.dirname(inboxDir),
      inbox_id: path.basename(inboxDir),
      monsters: monsterDocument.monsters,
    },
  };
}

export async function loadAssignmentSource(options) {
  if (options.candidateFile) {
    return loadCandidateAssignmentSource(options);
  }

  if (options.inboxDir && options.monsterId) {
    return loadGatewayMonsterAssignmentSource(options);
  }

  throw new Error("missing source: provide --candidate-file with --gateway-monster-id, or --inbox-dir with --monster-id");
}

export function assertNoForbiddenPayload(value, label = "value") {
  const violations = [];
  visit(value, [], (entry, keyPath) => {
    const key = keyPath.at(-1);
    if (typeof key === "string" && FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
      violations.push(keyPath.join("."));
    }
    if (typeof entry === "string" && looksLikeRawAttachmentPayload(entry)) {
      violations.push(keyPath.join("."));
    }
  });

  if (violations.length > 0) {
    throw new Error(`${label} contains forbidden raw payload fields: ${violations.join(", ")}`);
  }
}

export function assertPublicMissionRedaction(value) {
  assertNoForbiddenPayload(value, "public mission draft");
  const rendered = JSON.stringify(value);
  const forbiddenPatterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
    /https?:\/\//iu,
    /(?:^|["\s])\/(?:Users|Volumes|private|tmp)\//u,
    /\b[\w.-]+\.(?:pdf|xlsx|xls|docx|pptx|zip|dwg|step|stp)\b/iu,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(rendered)) {
      throw new Error("public mission draft failed redaction pattern check");
    }
  }
}

async function loadGatewayMonsterAssignmentSource({ repoRoot, inboxDir, monsterId }) {
  const resolvedInboxDir = resolveRepoOrAbsolute(repoRoot, inboxDir);
  const inbox = await readJson(path.join(resolvedInboxDir, "inbox.json"));
  const monstersDocument = await readJson(path.join(resolvedInboxDir, "monsters.json"));
  const monster = (monstersDocument.monsters ?? []).find((entry) => entry.monster_id === monsterId);
  if (!monster) {
    throw new Error(`monster not found: ${monsterId}`);
  }

  return {
    source_kind: "gateway_monster",
    candidate_ref: null,
    gateway_inbox_ref: relativeToRepo(repoRoot, resolvedInboxDir),
    gateway_monster_ref: `${relativeToRepo(repoRoot, path.join(resolvedInboxDir, "monsters.json"))}#monster_id=${monsterId}`,
    gateway_monster: clonePublicMonsterFields(monster),
    mail_summary: summarizeInbox(inbox),
    routing_suggestion: null,
    gateway_refs: {
      source_ref: inbox.source_ref ?? null,
      event_ref: inbox.event_ref ?? null,
      raw_ref: inbox.raw_ref ?? null,
      mailbox_id: inbox.mailbox_id ?? null,
      received_at: inbox.received_at ?? null,
      attachment_ref_count: Array.isArray(inbox.attachment_refs) ? inbox.attachment_refs.length : 0,
    },
  };
}

async function loadCandidateAssignmentSource({ repoRoot, candidateFile, gatewayMonsterId }) {
  if (!gatewayMonsterId) {
    throw new Error("missing required gatewayMonsterId for candidate assignment source");
  }
  const resolvedCandidateFile = resolveRepoOrAbsolute(repoRoot, candidateFile);
  const candidate = await readJson(resolvedCandidateFile);
  const sourceEvent = candidate.source_event ?? {};
  const mailSummary = candidate.mail_summary ?? {};
  const routingSuggestion = candidate.business_review?.project_routing_suggestion ?? null;

  return {
    source_kind: "mail_candidate",
    candidate_ref: relativeToRepo(repoRoot, resolvedCandidateFile),
    gateway_inbox_ref: null,
    gateway_monster_ref: `gateway_monster_id:${gatewayMonsterId}`,
    gateway_monster: {
      monster_id: gatewayMonsterId,
      monster_family: "unknown_monster",
      monster_name: null,
      work_pattern: "mail_candidate_review",
      objective: objectiveForSubject(mailSummary.subject),
      objective_ko: null,
      due_state: "no_due",
      known_status: "unknown",
      source_refs: sourceEvent.event_id ? [sourceEvent.event_id] : [],
      last_mail_at: sourceEvent.received_at ?? null,
      mail_touch_count: sourceEvent.event_id ? 1 : 0,
      last_mail_role: "new_request",
      project_hints: [],
      stage_hints: [],
      dedupe_key: sourceEvent.event_id ? `mail:${sourceEvent.source}:${sourceEvent.event_id}` : null,
    },
    mail_summary: {
      subject: mailSummary.subject ?? null,
      from: normalizeAddressEntries(mailSummary.from),
      to_count: mailSummary.to_count ?? null,
      cc_count: mailSummary.cc_count ?? null,
      attachment_count: Number(mailSummary.attachment_count ?? 0),
      attachment_types: normalizeArray(mailSummary.attachment_types),
      classification: mailSummary.classification ?? null,
    },
    routing_suggestion: routingSuggestion,
    gateway_refs: {
      source_ref: sourceEvent.event_id ?? null,
      event_ref: sourceEvent.event_file && sourceEvent.event_id ? `${sourceEvent.event_file}#event_id=${sourceEvent.event_id}` : null,
      raw_ref: null,
      mailbox_id: sourceEvent.workspace ? `${sourceEvent.workspace}_mailbox` : null,
      received_at: sourceEvent.received_at ?? null,
      attachment_ref_count: Number(mailSummary.attachment_count ?? 0),
    },
  };
}

function buildFilingPacket({ source, routing, now, filingPacketRef, projectMonsterRef, workspacePacketRef }) {
  return {
    schema_version: FILING_PACKET_SCHEMA_VERSION,
    filing_id: `mail_filing_${source.gateway_monster.monster_id}`,
    created_at: now,
    source_owner: "gateway",
    project_code: routing.project_code,
    stage: routing.stage ?? null,
    assignment_status: routing.stage ? "filed" : "blocked_unresolved_stage",
    gateway_monster_id: source.gateway_monster.monster_id,
    gateway_monster_ref: source.gateway_monster_ref,
    candidate_ref: source.candidate_ref,
    gateway_refs: {
      source_ref: source.gateway_refs.source_ref,
      event_ref: source.gateway_refs.event_ref,
      raw_ref: source.gateway_refs.raw_ref,
      mailbox_id: source.gateway_refs.mailbox_id,
      received_at: source.gateway_refs.received_at,
      attachment_ref_count: source.gateway_refs.attachment_ref_count,
    },
    review_summary: {
      subject: source.mail_summary.subject ?? null,
      from: normalizeAddressEntries(source.mail_summary.from),
      objective: source.gateway_monster.objective ?? "",
      objective_ko: source.gateway_monster.objective_ko ?? null,
      monster_family: source.gateway_monster.monster_family ?? "unknown_monster",
      work_pattern: source.gateway_monster.work_pattern ?? null,
      due_state: source.gateway_monster.due_state ?? "no_due",
      known_status: source.gateway_monster.known_status ?? "unknown",
      attachment_summary: {
        count: Number(source.mail_summary.attachment_count ?? 0),
        types: normalizeArray(source.mail_summary.attachment_types),
      },
    },
    routing: {
      source: routing.source,
      project_code: routing.project_code,
      stage: routing.stage ?? null,
      route_id: routing.route_id ?? null,
      confidence: routing.confidence ?? null,
      next_action: routing.next_action ?? "review_filing_packet",
    },
    output_refs: {
      filing_packet_ref: filingPacketRef,
      project_monster_ref: projectMonsterRef,
      workspace_filing_ref: workspacePacketRef,
    },
    boundary: {
      raw_provider_truth_owner: "gateway",
      raw_payload_copied: false,
      public_safe: false,
    },
  };
}

function buildProjectMonsterDeclaration({ source, routing, now, filingPacketRef, workspacePacketRef, missionRef = null }) {
  const monster = source.gateway_monster;
  return {
    schema_version: PROJECT_MONSTER_SCHEMA_VERSION,
    kind: "project_monster_declaration",
    monster_id: monster.monster_id,
    source_monster_id: monster.monster_id,
    source_owner: "gateway",
    status: routing.stage ? "filed" : "blocked",
    project_code: routing.project_code,
    stage: routing.stage ?? null,
    monster_family: monster.monster_family ?? "unknown_monster",
    monster_name: monster.monster_name ?? null,
    work_pattern: monster.work_pattern ?? null,
    objective: monster.objective ?? "",
    objective_ko: monster.objective_ko ?? null,
    due_state: monster.due_state ?? "no_due",
    known_status: monster.known_status ?? "unknown",
    source_refs: normalizeArray(monster.source_refs),
    gateway_monster_ref: source.gateway_monster_ref,
    filing_packet_ref: filingPacketRef,
    workspace_filing_ref: workspacePacketRef,
    mission_ref: missionRef,
    created_at: now,
    updated_at: now,
    boundary:
      "Private project-side metadata only. Gateway remains the raw provider truth owner; raw body/html/attachment payload is not copied here.",
  };
}

function buildWorkspaceFilingBridge(filingPacket) {
  return {
    schema_version: "soulforge.workspace_management_filing_bridge.v1",
    created_at: filingPacket.created_at,
    project_code: filingPacket.project_code,
    stage: filingPacket.stage,
    monster_id: filingPacket.gateway_monster_id,
    filing_packet_ref: filingPacket.output_refs.filing_packet_ref,
    project_monster_ref: filingPacket.output_refs.project_monster_ref,
    source_owner: "gateway",
    gateway_monster_ref: filingPacket.gateway_monster_ref,
    gateway_source_ref: filingPacket.gateway_refs.source_ref,
    attachment_summary: filingPacket.review_summary.attachment_summary,
    boundary: {
      raw_provider_truth_owner: "gateway",
      workspace_copy_contains_payload: false,
    },
  };
}

function buildWorkspaceHistoryEvent({
  eventType,
  source,
  projectCode,
  stage,
  now,
  filingPacketRef,
  projectMonsterRef,
  workspacePacketRef,
}) {
  return {
    schema_version: "soulforge.workspace_management_history_event.v1",
    event_type: eventType,
    at: now,
    project_code: projectCode,
    stage,
    monster_id: source.gateway_monster.monster_id,
    source_owner: "gateway",
    gateway_monster_ref: source.gateway_monster_ref,
    gateway_source_ref: source.gateway_refs.source_ref,
    filing_packet_ref: filingPacketRef,
    project_monster_ref: projectMonsterRef,
    workspace_filing_ref: workspacePacketRef,
    raw_payload_copied: false,
  };
}

function buildAssignmentMailHistoryPlan({ repoRoot, source, routing, now, summary }) {
  if (!routing.project_code) {
    return {
      entry: null,
      planned_refs: [],
    };
  }

  const missionRef =
    summary.mission_handoff?.status === "created_private_handoff"
      ? summary.mission_handoff.mission_ref
      : null;
  const entry = buildProjectMailHistoryEntry({
    eventType: "mail_filing_received",
    at: now,
    projectCode: routing.project_code,
    stage: routing.stage,
    monster: {
      ...source.gateway_monster,
      assigned_stage: routing.stage,
      assignment_status: summary.status,
      project_monster_ref: summary.project_monster_ref ?? null,
      filing_packet_ref: summary.filing_packet_ref ?? null,
      mission_ref: missionRef,
    },
    mail: {
      source_ref: source.gateway_refs.source_ref,
      received_at: source.gateway_refs.received_at,
      mailbox_id: source.gateway_refs.mailbox_id,
      thread_ref: null,
      subject: source.mail_summary.subject,
      from: source.mail_summary.from,
      attachment_count:
        source.gateway_refs.attachment_ref_count ?? Number(source.mail_summary.attachment_count ?? 0),
    },
    refs: {
      gateway_monster_ref: source.gateway_monster_ref,
      project_monster_ref: summary.project_monster_ref ?? null,
      filing_packet_ref: summary.filing_packet_ref ?? null,
      mission_ref: missionRef,
    },
    workStatus: summary.status,
  });

  return {
    entry,
    planned_refs: projectMailHistoryRefs(repoRoot, routing.project_code),
  };
}

function buildMissionHandoffPlan({
  repoRoot,
  source,
  routing,
  now,
  filingPacketRef,
  projectMonsterRef,
  workspacePacketRef,
  publicMission,
  privateMission,
  blockedReasons,
}) {
  if (privateMission.emit) {
    return buildPrivateMissionHandoffPlan({
      repoRoot,
      source,
      routing,
      now,
      filingPacketRef,
      projectMonsterRef,
      workspacePacketRef,
      privateMission,
      blockedReasons,
    });
  }

  return buildPublicMissionDraftPlan({
    repoRoot,
    source,
    routing,
    now,
    publicMission,
    blockedReasons,
  });
}

function buildPublicMissionDraftPlan({ repoRoot, source, routing, now, publicMission, blockedReasons }) {
  if (!publicMission.emit) {
    return {
      summary: { status: "not_requested" },
      writes: [],
    };
  }

  if (!routing.project_code) {
    return {
      summary: { status: "not_created", reason: "unresolved_project" },
      writes: [],
    };
  }

  if (!routing.stage) {
    return {
      summary: { status: "not_created", reason: "unresolved_stage" },
      writes: [],
    };
  }

  if (!publicMission.publicProjectCode) {
    return {
      summary: { status: "not_created", reason: "public_project_code_required" },
      writes: [],
    };
  }

  const publicProjectCode = safePublicToken(publicMission.publicProjectCode, "public project code");
  const monsterHash = shortHash(source.gateway_monster.monster_id);
  const missionId = safePublicToken(
    publicMission.missionId ?? `mail_handoff_${publicProjectCode}_${monsterHash}`,
    "mission id",
  );
  const missionRoot = path.join(repoRoot, ".mission", missionId);
  const missionIndexPath = path.join(repoRoot, ".mission", "index.yaml");
  const workflowId = publicMission.workflowId ? safePublicToken(publicMission.workflowId, "workflow id") : null;
  const partyId = safePublicToken(publicMission.partyId, "party id");
  const mission = {
    schema_version: PUBLIC_MISSION_DRAFT_SCHEMA_VERSION,
    mission_id: missionId,
    kind: "mission",
    status: "blocked",
    title: "Redacted Mail-Derived Mission Draft",
    summary:
      "Blocked public-safe draft generated after private dungeon assignment. Live mail details remain in private filing metadata.",
    project_code: publicProjectCode,
    workflow_id: workflowId,
    party_id: partyId,
    request_mode: "mail_intake",
    monster_type: "mail_intake_request",
    target_skill_id: null,
    unit_assignments: {
      intake_owner: "guild_master",
      reviewer: "guild_master",
    },
    input_refs: {
      source_mail: "redacted_gateway_mail_ref",
      private_filing_packet: "redacted_private_packet_ref",
      gateway_monster_key_hash: `sha256:${hashText(source.gateway_monster.monster_id)}`,
      stage_hint: "redacted_assigned_stage",
    },
    run_refs: {
      latest_run_id: null,
      runtime_truth_root: "_workmeta/<project_code>/runs/",
    },
    notifications: {
      telegram: {
        mission_blocked: false,
        mission_ready: false,
        mission_closed: false,
        mission_failed: false,
      },
    },
    redaction: {
      source_project_code_redacted: true,
      source_stage_redacted: true,
      source_subject_redacted: true,
      source_sender_redacted: true,
      raw_payload_copied: false,
      redaction_checked_at: now,
    },
    notes: [
      "This public-safe artifact is blocked by default.",
      "Private filing metadata remains under the project-local _workmeta owner.",
    ],
  };
  const readiness = {
    schema_version: PUBLIC_MISSION_DRAFT_SCHEMA_VERSION,
    mission_id: missionId,
    kind: "mission_readiness",
    status: "blocked",
    summary: "Mission execution is blocked until private workflow selection and owner review are complete.",
    checks: {
      project_code_assigned_private: "pass",
      stage_assigned_private: "pass",
      public_redaction_check: "pass",
      workflow_present: workflowId ? "pass" : "missing",
      owner_review_complete: "missing",
    },
    blockers: [
      "Public draft is redacted and cannot be executed directly.",
      ...(workflowId ? [] : ["workflow_id is not resolved in this public-safe draft."]),
      ...blockedReasons.map((reason) => `private assignment blocker: ${reason}`),
    ],
    latest_run_id: null,
  };
  const dispatch = {
    schema_version: PUBLIC_MISSION_DRAFT_SCHEMA_VERSION,
    mission_id: missionId,
    kind: "mission_dispatch_request",
    status: "blocked",
    request: {
      source: "redacted mail intake",
      request_mode: "mail_intake",
      monster_type: "mail_intake_request",
      workflow_id: workflowId,
      party_id: partyId,
      project_code: publicProjectCode,
      source_ref: "redacted_gateway_mail_ref",
      automation_possibility: "manual_assist_needed",
      stage: "redacted_assigned_stage",
      summary: "Review the private filing packet and resolve execution readiness before running this mission.",
    },
    notes: ["This file records a redacted blocked handoff, not raw mailbox payload."],
  };
  const resolvedPlan = {
    schema_version: PUBLIC_MISSION_DRAFT_SCHEMA_VERSION,
    mission_id: missionId,
    kind: "resolved_mission_plan",
    status: "blocked",
    workflow: {
      workflow_id: workflowId,
      selection_status: workflowId ? "selected_private" : "pending",
    },
    party: {
      party_id: partyId,
    },
    unit_assignments: {
      intake_owner: {
        unit_id: "guild_master",
        class_ids: ["administrator"],
        execution_profile_ref: "intake_review",
      },
      reviewer: {
        unit_id: "guild_master",
        class_ids: ["administrator"],
        execution_profile_ref: "analysis_heavy",
      },
    },
    run_refs: {
      latest_run_id: null,
      raw_truth_root: "_workmeta/<project_code>/runs/",
    },
  };

  for (const artifact of [mission, readiness, dispatch, resolvedPlan]) {
    assertPublicMissionRedaction(artifact);
  }
  const missionIndex = buildMissionIndexUpdate(publicMission.missionIndex, {
    missionId,
    title: mission.title,
    status: mission.status,
    workflowId,
    partyId,
    projectCode: publicProjectCode,
    readinessStatus: readiness.status,
  });

  return {
    summary: {
      status: "created_blocked_public_safe_draft",
      mission_id: missionId,
      mission_ref: relativeToRepo(repoRoot, missionRoot),
    },
    writes: [
      {
        kind: "yaml",
        file_path: path.join(missionRoot, "mission.yaml"),
        repo_path: relativeToRepo(repoRoot, path.join(missionRoot, "mission.yaml")),
        value: mission,
      },
      {
        kind: "yaml",
        file_path: path.join(missionRoot, "readiness.yaml"),
        repo_path: relativeToRepo(repoRoot, path.join(missionRoot, "readiness.yaml")),
        value: readiness,
      },
      {
        kind: "yaml",
        file_path: path.join(missionRoot, "dispatch_request.yaml"),
        repo_path: relativeToRepo(repoRoot, path.join(missionRoot, "dispatch_request.yaml")),
        value: dispatch,
      },
      {
        kind: "yaml",
        file_path: path.join(missionRoot, "resolved_plan.yaml"),
        repo_path: relativeToRepo(repoRoot, path.join(missionRoot, "resolved_plan.yaml")),
        value: resolvedPlan,
      },
      {
        kind: "yaml",
        file_path: missionIndexPath,
        repo_path: relativeToRepo(repoRoot, missionIndexPath),
        value: missionIndex,
      },
    ],
  };
}

function buildPrivateMissionHandoffPlan({
  repoRoot,
  source,
  routing,
  now,
  filingPacketRef,
  projectMonsterRef,
  workspacePacketRef,
  privateMission,
  blockedReasons,
}) {
  if (!privateMission.emit) {
    return {
      summary: { status: "not_requested" },
      writes: [],
    };
  }

  if (!routing.project_code) {
    return {
      summary: { status: "not_created", reason: "unresolved_project" },
      writes: [],
    };
  }

  if (!routing.stage) {
    return {
      summary: { status: "not_created", reason: "unresolved_stage" },
      writes: [],
    };
  }

  const projectCode = safePathToken(routing.project_code, "project_code");
  const monsterHash = shortHash(source.gateway_monster.monster_id);
  const missionId = safePathToken(
    privateMission.missionId ?? `mail_handoff_${projectCode}_${monsterHash}`,
    "mission id",
  );
  const workflowId = privateMission.workflowId ? safePathToken(privateMission.workflowId, "workflow id") : null;
  const partyId = safePathToken(privateMission.partyId, "party id");
  const missionRoot = path.join(repoRoot, "_workmeta", projectCode, "missions", missionId);
  const missionIndexPath = path.join(repoRoot, "_workmeta", projectCode, "missions", "index.yaml");
  const missionRef = relativeToRepo(repoRoot, missionRoot);
  const status = workflowId ? "ready" : "blocked";
  const blockers = [
    ...(workflowId ? [] : ["workflow_id is not resolved for this private mission handoff."]),
    ...blockedReasons.map((reason) => `private assignment blocker: ${reason}`),
  ];
  const inputRefs = {
    private_filing_packet: filingPacketRef,
    project_monster: projectMonsterRef,
    workspace_filing: workspacePacketRef,
    gateway_monster: source.gateway_monster_ref,
  };
  const boundary = {
    owner: "_workmeta/<project_code>/missions",
    public_safe: false,
    pointer_only: true,
    raw_payload_copied: false,
    raw_provider_truth_owner: "gateway",
  };
  const mission = {
    schema_version: PRIVATE_MISSION_HANDOFF_SCHEMA_VERSION,
    mission_id: missionId,
    kind: "mission",
    status,
    title: "Private Mail-Derived Mission Handoff",
    summary: "Project-local handoff generated from dungeon assignment metadata. Mail body and attachment payloads are not copied.",
    project_code: projectCode,
    stage: routing.stage,
    workflow_id: workflowId,
    party_id: partyId,
    request_mode: "mail_intake",
    monster_type: "mail_intake_request",
    target_skill_id: null,
    unit_assignments: {
      intake_owner: "guild_master",
      reviewer: "guild_master",
    },
    input_refs: inputRefs,
    run_refs: {
      latest_run_id: null,
      runtime_truth_root: `_workmeta/${projectCode}/runs/`,
    },
    notifications: {
      telegram: {
        mission_blocked: false,
        mission_ready: false,
        mission_closed: false,
        mission_failed: false,
      },
    },
    boundary,
    created_at: now,
    updated_at: now,
  };
  const readiness = {
    schema_version: PRIVATE_MISSION_HANDOFF_SCHEMA_VERSION,
    mission_id: missionId,
    kind: "mission_readiness",
    status,
    summary: workflowId
      ? "Private mission handoff has project, stage, and workflow pointers."
      : "Private mission handoff is blocked until workflow selection is resolved.",
    checks: {
      project_code_assigned: "pass",
      stage_assigned: "pass",
      project_local_refs_present: "pass",
      raw_payload_absent: "pass",
      workflow_present: workflowId ? "pass" : "missing",
    },
    blockers,
    latest_run_id: null,
    boundary,
  };
  const dispatch = {
    schema_version: PRIVATE_MISSION_HANDOFF_SCHEMA_VERSION,
    mission_id: missionId,
    kind: "mission_dispatch_request",
    status,
    request: {
      source: "private mail intake pointer",
      request_mode: "mail_intake",
      monster_type: "mail_intake_request",
      workflow_id: workflowId,
      party_id: partyId,
      project_code: projectCode,
      stage: routing.stage,
      source_ref: filingPacketRef,
      automation_possibility: workflowId ? "workflow_ready_for_owner_review" : "manual_assist_needed",
      summary: "Use the project-local filing packet and monster declaration to continue mission planning.",
    },
    input_refs: inputRefs,
    boundary,
  };
  const resolvedPlan = {
    schema_version: PRIVATE_MISSION_HANDOFF_SCHEMA_VERSION,
    mission_id: missionId,
    kind: "resolved_mission_plan",
    status,
    workflow: {
      workflow_id: workflowId,
      selection_status: workflowId ? "selected" : "pending",
    },
    party: {
      party_id: partyId,
    },
    unit_assignments: {
      intake_owner: {
        unit_id: "guild_master",
        class_ids: ["administrator"],
        execution_profile_ref: "intake_review",
      },
      reviewer: {
        unit_id: "guild_master",
        class_ids: ["administrator"],
        execution_profile_ref: "analysis_heavy",
      },
    },
    input_refs: inputRefs,
    step_outputs: [],
    run_refs: {
      latest_run_id: null,
      raw_truth_root: `_workmeta/${projectCode}/runs/`,
    },
    boundary,
  };

  for (const artifact of [mission, readiness, dispatch, resolvedPlan]) {
    assertNoForbiddenPayload(artifact, "private mission handoff");
  }

  const missionIndex = buildPrivateMissionIndexUpdate(privateMission.missionIndex, {
    missionId,
    status,
    workflowId,
    partyId,
    projectCode,
    stage: routing.stage,
    readinessStatus: readiness.status,
    missionRef,
  });
  assertNoForbiddenPayload(missionIndex, "private mission index");

  return {
    summary: {
      status: "created_private_handoff",
      mission_id: missionId,
      mission_ref: missionRef,
    },
    writes: [
      {
        kind: "yaml",
        file_path: path.join(missionRoot, "mission.yaml"),
        repo_path: relativeToRepo(repoRoot, path.join(missionRoot, "mission.yaml")),
        value: mission,
      },
      {
        kind: "yaml",
        file_path: path.join(missionRoot, "readiness.yaml"),
        repo_path: relativeToRepo(repoRoot, path.join(missionRoot, "readiness.yaml")),
        value: readiness,
      },
      {
        kind: "yaml",
        file_path: path.join(missionRoot, "dispatch_request.yaml"),
        repo_path: relativeToRepo(repoRoot, path.join(missionRoot, "dispatch_request.yaml")),
        value: dispatch,
      },
      {
        kind: "yaml",
        file_path: path.join(missionRoot, "resolved_plan.yaml"),
        repo_path: relativeToRepo(repoRoot, path.join(missionRoot, "resolved_plan.yaml")),
        value: resolvedPlan,
      },
      {
        kind: "yaml",
        file_path: missionIndexPath,
        repo_path: relativeToRepo(repoRoot, missionIndexPath),
        value: missionIndex,
      },
    ],
  };
}

function buildMissionIndexUpdate(existingIndex, entryFields) {
  const nextIndex = existingIndex
    ? clonePlain(existingIndex)
    : {
        version: "v1",
        owner: ".mission",
        kind: "mission_catalog",
        status: "active",
        entries: [],
        notes: [
          "`.mission/` owns held mission plans and readiness metadata.",
          "Raw execution truth remains under `_workmeta/<project_code>/runs/<run_id>/`.",
        ],
      };

  if (!Array.isArray(nextIndex.entries)) {
    throw new Error("invalid mission index: entries must be an array");
  }

  const nextEntry = {
    mission_id: entryFields.missionId,
    title: entryFields.title,
    status: entryFields.status,
    workflow_id: entryFields.workflowId,
    party_id: entryFields.partyId,
    project_code: entryFields.projectCode,
    readiness_status: entryFields.readinessStatus,
  };
  assertPublicMissionRedaction(nextEntry);

  const existingEntry = nextIndex.entries.findIndex((entry) => entry?.mission_id === entryFields.missionId);
  if (existingEntry === -1) {
    nextIndex.entries.push(nextEntry);
  } else {
    nextIndex.entries[existingEntry] = {
      ...nextIndex.entries[existingEntry],
      ...nextEntry,
    };
  }

  return nextIndex;
}

function buildPrivateMissionIndexUpdate(existingIndex, entryFields) {
  const nextIndex = existingIndex
    ? clonePlain(existingIndex)
    : {
        version: "v1",
        owner: "_workmeta/<project_code>/missions",
        kind: "private_mission_catalog",
        status: "active",
        entries: [],
        notes: [
          "Project-local private mission handoffs point to filing metadata only.",
          "Raw mail body, HTML, and attachment payloads remain with the gateway raw truth owner.",
        ],
      };

  if (!Array.isArray(nextIndex.entries)) {
    throw new Error("invalid private mission index: entries must be an array");
  }

  const nextEntry = {
    mission_id: entryFields.missionId,
    status: entryFields.status,
    workflow_id: entryFields.workflowId,
    party_id: entryFields.partyId,
    project_code: entryFields.projectCode,
    stage: entryFields.stage,
    readiness_status: entryFields.readinessStatus,
    mission_ref: entryFields.missionRef,
  };

  const existingEntry = nextIndex.entries.findIndex((entry) => entry?.mission_id === entryFields.missionId);
  if (existingEntry === -1) {
    nextIndex.entries.push(nextEntry);
  } else {
    nextIndex.entries[existingEntry] = {
      ...nextIndex.entries[existingEntry],
      ...nextEntry,
    };
  }

  return nextIndex;
}

function resolveRouting(source, options) {
  const suggestion = source.routing_suggestion ?? {};
  const monster = source.gateway_monster;
  return {
    source: source.routing_suggestion ? "candidate_project_routing_suggestion" : "gateway_monster_assignment",
    project_code: requireNonEmpty(options.projectCode ?? monster.assigned_project_code ?? suggestion.project_code),
    stage: requireNonEmpty(options.stage ?? monster.assigned_stage ?? suggestion.stage),
    route_id: suggestion.route_id ?? null,
    confidence: suggestion.confidence ?? null,
    next_action: suggestion.next_action ?? null,
  };
}

function computeGatewayInboxAssignmentStatus(monsters) {
  if (monsters.length === 0) {
    return "not_required";
  }

  const statuses = monsters.map((monster) => monster.assignment_status ?? "pending_dungeon_assignment");

  if (statuses.every((status) => status === "transferred")) {
    return "assigned";
  }

  if (statuses.every((status) => status === "assigned" || status === "transferred")) {
    return "assigned";
  }

  if (statuses.some((status) => status === "assigned" || status === "transferred")) {
    return "partially_assigned";
  }

  if (statuses.every((status) => status === "blocked")) {
    return "blocked";
  }

  return "pending_dungeon_assignment";
}

function collectChangedKeys(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes = [];

  for (const key of keys) {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) {
      changes.push(key);
    }
  }

  return changes.sort();
}

function pickRecordFields(record, keys) {
  const selected = {};
  for (const key of keys) {
    selected[key] = record?.[key] ?? null;
  }
  return selected;
}

function buildGatewayMonsterEventFile(repoRoot, at) {
  const stamp = new Date(at);
  const year = String(stamp.getUTCFullYear());
  const month = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  return path.join(repoRoot, "guild_hall", "state", "gateway", "log", "monster_events", year, `${year}-${month}.jsonl`);
}

function clonePublicMonsterFields(monster) {
  return {
    monster_id: monster.monster_id,
    monster_family: monster.monster_family ?? "unknown_monster",
    monster_name: monster.monster_name ?? null,
    work_pattern: monster.work_pattern ?? null,
    objective: monster.objective ?? "",
    objective_ko: monster.objective_ko ?? null,
    due_state: monster.due_state ?? "no_due",
    known_status: monster.known_status ?? "unknown",
    source_refs: normalizeArray(monster.source_refs),
    last_mail_at: monster.last_mail_at ?? null,
    mail_touch_count: monster.mail_touch_count ?? normalizeArray(monster.source_refs).length,
    last_mail_role: monster.last_mail_role ?? null,
    project_hints: normalizeArray(monster.project_hints),
    stage_hints: normalizeArray(monster.stage_hints),
    dedupe_key: monster.dedupe_key ?? null,
    assigned_project_code: monster.assigned_project_code ?? null,
    assigned_stage: monster.assigned_stage ?? null,
  };
}

function summarizeInbox(inbox) {
  return {
    subject: inbox.subject ?? null,
    from: normalizeAddressEntries(inbox.from),
    to_count: normalizeArray(inbox.to).length,
    cc_count: normalizeArray(inbox.cc).length,
    attachment_count: normalizeArray(inbox.attachment_refs).length,
    attachment_types: [],
    classification: null,
  };
}

async function writeYaml(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${YAML.stringify(value)}\n`, "utf8");
}

async function readMissionIndexForPlan({ repoRoot, requested }) {
  if (!requested) {
    return null;
  }

  const indexPath = path.join(repoRoot, ".mission", "index.yaml");
  let raw;
  try {
    raw = await fs.readFile(indexPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const parsed = YAML.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid mission index: expected YAML object");
  }
  return parsed;
}

async function readPrivateMissionIndexForPlan({ repoRoot, projectCode, requested }) {
  if (!requested) {
    return null;
  }

  const safeProjectCode = safePathToken(projectCode, "project_code");
  const indexPath = path.join(repoRoot, "_workmeta", safeProjectCode, "missions", "index.yaml");
  let raw;
  try {
    raw = await fs.readFile(indexPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const parsed = YAML.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid private mission index: expected YAML object");
  }
  return parsed;
}

function resolveRepoOrAbsolute(repoRoot, value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error("missing path value");
  }
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

function safePathPart(value) {
  const safe = String(value ?? "").trim().replace(/[^A-Za-z0-9._-]+/gu, "_");
  if (!safe) {
    throw new Error("empty path component");
  }
  return safe;
}

function safePathToken(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error(`missing ${label}`);
  }
  if (!/^[A-Za-z0-9._-]+$/u.test(raw)) {
    throw new Error(`${label} contains unsupported path characters`);
  }
  return raw;
}

function safePublicToken(value, label) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error(`missing ${label}`);
  }
  if (!/^[A-Za-z0-9._-]+$/u.test(raw)) {
    throw new Error(`${label} must contain only public-safe token characters`);
  }
  return raw;
}

function normalizeMonsterArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeNow(value) {
  if (!value) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeAddressEntries(value) {
  return normalizeArray(value)
    .map((entry) => {
      if (!entry) {
        return null;
      }
      if (typeof entry === "string") {
        return { name: null, address: entry };
      }
      return {
        name: entry.name ?? null,
        address: entry.address ?? entry.email ?? null,
      };
    })
    .filter((entry) => entry && entry.address);
}

function requireNonEmpty(value) {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function objectiveForSubject(subject) {
  if (!subject) {
    return "Review and process the mail candidate.";
  }
  return `Review and process the mail candidate: ${subject}`;
}

function visit(value, keyPath, callback) {
  callback(value, keyPath);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, [...keyPath, String(index)], callback));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      visit(entry, [...keyPath, key], callback);
    }
  }
}

function looksLikeRawAttachmentPayload(value) {
  return /^data:[^;]+;base64,/iu.test(value) || value.length > 1_000_000;
}

function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function shortHash(value) {
  return hashText(value).slice(0, 12);
}
