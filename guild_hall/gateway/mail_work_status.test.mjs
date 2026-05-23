import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";

import {
  defaultMailWeeklyVisibilityRegisterFile,
  defaultMailWorkPriorityLatestFile,
  defaultMailWorkStatusLatestFile,
  listMailWorkPriority,
  listMailWorkStatus,
  refreshMailWeeklyVisibilityRegister,
  refreshMailWorkPriority,
  refreshMailWorkStatus,
} from "./mail_work_status.mjs";

test("refreshMailWorkStatus joins candidate, gateway, project, mission, and battle surfaces", async () => {
  const repoRoot = await createRepoRoot();

  await writeJson(
    path.join(
      repoRoot,
      "guild_hall",
      "state",
      "gateway",
      "mail_candidate",
      "queue",
      "pending",
      "mail_candidate_mail_evt_candidate_only.json",
    ),
    sampleCandidate({
      candidate_id: "mail_candidate_mail_evt_candidate_only",
      event_id: "mail_evt_candidate_only",
      status: "pending_review",
    }),
  );

  await writeJson(
    path.join(
      repoRoot,
      "guild_hall",
      "state",
      "gateway",
      "mail_candidate",
      "queue",
      "pending",
      "mail_candidate_mail_evt_completed.json",
    ),
    sampleCandidate({
      candidate_id: "mail_candidate_mail_evt_completed",
      event_id: "mail_evt_completed",
      status: "promoted_to_intake_request",
      subject: "[KVDS] Synthetic completed follow-up request",
    }),
  );

  await writeGatewayInbox(repoRoot, "mail_evt_pending", {
    source_ref: "mail_evt_pending",
    assignment_status: "pending_dungeon_assignment",
    monsters: [
      sampleGatewayMonster({
        monster_id: "mail_evt_pending_001",
        source_refs: ["mail_evt_pending"],
        assignment_status: "pending_dungeon_assignment",
      }),
    ],
  });

  await writeGatewayInbox(repoRoot, "mail_evt_completed", {
    source_ref: "mail_evt_completed",
    assignment_status: "assigned",
    monsters: [
      sampleGatewayMonster({
        monster_id: "mail_evt_completed_001",
        source_refs: ["mail_evt_completed"],
        assignment_status: "transferred",
        assigned_project_code: "P26-030",
        assigned_stage: "project_route_owner_review",
        project_monster_ref: "_workmeta/P26-030/monsters/mail_evt_completed_001.yaml",
        transferred_at: "2026-05-20T02:05:00.000Z",
        mission_ref: "_workmeta/P26-030/missions/mail_handoff_demo_001",
      }),
    ],
  });

  await writeYaml(path.join(repoRoot, "_workmeta", "P26-030", "monsters", "mail_evt_completed_001.yaml"), {
    schema_version: "soulforge.project_monster.private.v1",
    kind: "project_monster_declaration",
    monster_id: "mail_evt_completed_001",
    source_monster_id: "mail_evt_completed_001",
    source_owner: "gateway",
    status: "filed",
    project_code: "P26-030",
    stage: "project_route_owner_review",
    source_refs: ["mail_evt_completed"],
    mission_ref: "_workmeta/P26-030/missions/mail_handoff_demo_001",
    updated_at: "2026-05-20T02:05:00.000Z",
    filing_packet_ref: "_workmeta/P26-030/artifacts/mail_filing/mail_evt_completed_001/filing_packet.json",
  });

  await writeYaml(path.join(repoRoot, "_workmeta", "P26-030", "missions", "index.yaml"), {
    version: "v1",
    owner: "_workmeta/<project_code>/missions",
    kind: "private_mission_catalog",
    status: "active",
    entries: [
      {
        mission_id: "mail_handoff_demo_001",
        status: "completed",
        workflow_id: "owner_hub_mail_pipeline_v0",
        party_id: "guild_master_cell",
        project_code: "P26-030",
        stage: "project_route_owner_review",
        readiness_status: "completed",
        mission_ref: "_workmeta/P26-030/missions/mail_handoff_demo_001",
        latest_run_id: "mail_handoff_demo_run_001",
      },
    ],
  });

  await writeJsonl(path.join(repoRoot, "_workmeta", "P26-030", "log", "events", "2026", "05", "battle_events.jsonl"), {
    event_id: "battle-2026-05-20-0001",
    occurred_at: "2026-05-20T02:10:00.000Z",
    mission_id: "mail_handoff_demo_001",
    project_code: "P26-030",
    stage: "project_route_owner_review",
    source_kind: "mail",
    source_ref: "mail_candidate_mail_evt_completed",
    party_id: "guild_master_cell",
    unit_id: "guild_master",
    automation_possibility: "manual_assist_needed",
    battle_mode: "manual_assist",
    result: "completed_with_follow_up",
    intervention_count: 1,
    bottleneck_reason: "human_confirmation_required",
  });

  const refresh = await refreshMailWorkStatus({ repoRoot });
  const projection = JSON.parse(await readFile(defaultMailWorkStatusLatestFile(repoRoot), "utf8"));

  assert.equal(refresh.status, "refreshed");
  assert.equal(refresh.count, 3);
  assert.equal(projection.schema_version, "soulforge.gateway.mail_work_status.v1");
  assert.equal(projection.counts.candidate_pending, 1);
  assert.equal(projection.counts.monster_pending_assignment, 1);
  assert.equal(projection.counts.completed_with_follow_up, 1);

  const candidateOnly = projection.entries.find((entry) => entry.candidate_id === "mail_candidate_mail_evt_candidate_only");
  assert.equal(candidateOnly.work_status, "candidate_pending");
  assert.equal(candidateOnly.mail_source_ref, "mail_evt_candidate_only");
  assert.equal(candidateOnly.boundary.raw_payload_copied, false);

  const pendingMonster = projection.entries.find((entry) => entry.monster_id === "mail_evt_pending_001");
  assert.equal(pendingMonster.work_status, "monster_pending_assignment");
  assert.equal(pendingMonster.inbox_id, "mail_evt_pending");

  const completed = projection.entries.find((entry) => entry.monster_id === "mail_evt_completed_001");
  assert.equal(completed.candidate_id, "mail_candidate_mail_evt_completed");
  assert.equal(completed.project_code, "P26-030");
  assert.equal(completed.mission_id, "mail_handoff_demo_001");
  assert.equal(completed.battle_event_id, "battle-2026-05-20-0001");
  assert.equal(completed.terminal_result, "completed_with_follow_up");
  assert.equal(completed.work_status, "completed_with_follow_up");

  await refreshMailWorkPriority({ repoRoot });
  const priorityProjection = JSON.parse(await readFile(defaultMailWorkPriorityLatestFile(repoRoot), "utf8"));
  const completedPriority = priorityProjection.entries.find((entry) => entry.candidate_id === "mail_candidate_mail_evt_completed");
  const topPriority = priorityProjection.entries[0];
  assert.equal(completedPriority.work_status, "completed_with_follow_up");
  assert.equal(completedPriority.route_candidate, "P26-014");
  assert.deepEqual(completedPriority.priority_flags_ko, []);
  assert.notEqual(topPriority.candidate_id, "mail_candidate_mail_evt_completed");
});

test("listMailWorkStatus filters from latest projection", async () => {
  const repoRoot = await createRepoRoot();

  await writeJson(
    path.join(
      repoRoot,
      "guild_hall",
      "state",
      "gateway",
      "mail_candidate",
      "queue",
      "pending",
      "mail_candidate_mail_evt_filter.json",
    ),
    sampleCandidate({
      candidate_id: "mail_candidate_mail_evt_filter",
      event_id: "mail_evt_filter",
      status: "pending_review",
    }),
  );

  await refreshMailWorkStatus({ repoRoot });
  const result = await listMailWorkStatus({
    repoRoot,
    workStatus: "candidate_pending",
  });

  assert.equal(result.projection_source, "latest");
  assert.equal(result.count, 1);
  assert.equal(result.entries[0].candidate_id, "mail_candidate_mail_evt_filter");
});

test("refreshMailWorkPriority routes exact P26-014, thread duplicates, admin holds, and promo non-work", async () => {
  const repoRoot = await createRepoRoot();
  const candidates = [
    sampleCandidate({
      candidate_id: "mail_candidate_kvds",
      event_id: "mail_evt_kvds",
      status: "pending_review",
      subject: "[KVDS] Synthetic BOM and STEP source packet request",
      received_at: "2026-05-20T01:00:00.000Z",
      attachment_count: 2,
      attachment_types: ["binary_attachment"],
    }),
    sampleCandidate({
      candidate_id: "mail_candidate_mine_exact",
      event_id: "mail_evt_mine_exact",
      status: "pending_review",
      subject: "[기뢰탐색음탐기] Synthetic source review request",
      received_at: "2026-05-20T01:05:00.000Z",
    }),
    sampleCandidate({
      candidate_id: "mail_candidate_project_code_only",
      event_id: "mail_evt_project_code_only",
      status: "pending_review",
      subject: "P26-030 synthetic status note",
      received_at: "2026-05-20T01:06:00.000Z",
    }),
    sampleCandidate({
      candidate_id: "mail_candidate_sensor_1",
      event_id: "mail_evt_sensor_1",
      status: "pending_review",
      subject: "Synthetic sensor production schedule status follow-up",
      received_at: "2026-05-20T01:10:00.000Z",
      attachment_count: 1,
      attachment_types: ["body_link"],
    }),
    sampleCandidate({
      candidate_id: "mail_candidate_sensor_2",
      event_id: "mail_evt_sensor_2",
      status: "pending_review",
      subject: "Synthetic sensor production schedule status follow-up URGENT",
      received_at: "2026-05-20T01:20:00.000Z",
      attachment_count: 1,
      attachment_types: ["body_link"],
    }),
    sampleCandidate({
      candidate_id: "mail_candidate_login",
      event_id: "mail_evt_login",
      status: "pending_review",
      subject: "Synthetic 새로운 환경 로그인 알림",
      received_at: "2026-05-20T01:30:00.000Z",
      from: [{ name: null, address: "noreply@hiworks.com" }],
    }),
    sampleCandidate({
      candidate_id: "mail_candidate_promo",
      event_id: "mail_evt_promo",
      status: "pending_review",
      subject: "Synthetic 무료 주얼 만료 알림",
      received_at: "2026-05-20T01:40:00.000Z",
      source: "gmail",
      workspace: "personal",
      from: [{ name: null, address: "no-reply@youtube.com" }],
    }),
  ];

  for (const candidate of candidates) {
    await writeJson(
      path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "queue", "pending", `${candidate.candidate_id}.json`),
      candidate,
    );
  }

  const refresh = await refreshMailWorkPriority({ repoRoot });
  const projection = JSON.parse(await readFile(defaultMailWorkPriorityLatestFile(repoRoot), "utf8"));

  assert.equal(refresh.status, "refreshed");
  assert.equal(projection.schema_version, "soulforge.gateway.mail_work_priority.v1");
  assert.equal(projection.boundary.raw_payload_copied, false);

  const exact = projection.entries.find((entry) => entry.candidate_id === "mail_candidate_kvds");
  assert.equal(exact.route_candidate, "P26-014");
  assert.equal(exact.route_confidence, "exact");
  assert.equal(exact.operating_state_ko, "새 일");
  assert.equal(exact.boundary.raw_payload_copied, false);
  assert.equal(exact.attachment_count, 2);
  assert.deepEqual(exact.attachment_types, ["binary_attachment"]);
  assert.ok(exact.priority_flags_ko.includes("오늘 처리"));
  assert.ok(exact.priority_flags_ko.includes("자료 확인"));

  const mineExact = projection.entries.find((entry) => entry.candidate_id === "mail_candidate_mine_exact");
  assert.equal(mineExact.route_candidate, "P26-014");
  assert.equal(mineExact.route_confidence, "exact");

  const projectCodeOnly = projection.entries.find((entry) => entry.candidate_id === "mail_candidate_project_code_only");
  assert.equal(projectCodeOnly.route_candidate, "P00-000_INBOX");
  assert.equal(projectCodeOnly.route_confidence, "review");

  const sensorRows = projection.entries.filter((entry) => entry.thread_group === "센서 일정/status");
  assert.equal(sensorRows.length, 2);
  assert.deepEqual(
    sensorRows.map((entry) => entry.operating_state_ko).sort(),
    ["기존 일에 붙이기", "기존 일에 붙이기"],
  );
  assert.ok(sensorRows.every((entry) => entry.priority_flags_ko.includes("스레드 묶기")));
  assert.ok(sensorRows.every((entry) => entry.route_candidate === "P00-000_INBOX"));
  assert.ok(sensorRows.every((entry) => entry.route_confidence === "review"));

  const admin = projection.entries.find((entry) => entry.candidate_id === "mail_candidate_login");
  assert.equal(admin.operating_state_ko, "개인/관리 보류");
  assert.equal(admin.route_candidate, "none/personal");
  assert.equal(admin.route_confidence, "none");

  const promo = projection.entries.find((entry) => entry.candidate_id === "mail_candidate_promo");
  assert.equal(promo.operating_state_ko, "일 아님");
  assert.equal(promo.route_candidate, "none/promo");
  assert.equal(promo.route_confidence, "none");
});

test("mail work priority exposes planning due fields and week window filtering", async () => {
  const repoRoot = await createRepoRoot();
  const candidates = [
    sampleCandidate({
      candidate_id: "mail_candidate_auv_due",
      event_id: "mail_evt_auv_due",
      status: "pending_review",
      subject: "[LIG D&A] AUV 사업 조달 LT 점검 자료 작성 요청(~5/27)",
      received_at: "2026-05-20T01:00:00.000Z",
    }),
    sampleCandidate({
      candidate_id: "mail_candidate_future_due",
      event_id: "mail_evt_future_due",
      status: "pending_review",
      subject: "Synthetic later review request(~6/3)",
      received_at: "2026-05-20T01:05:00.000Z",
    }),
    sampleCandidate({
      candidate_id: "mail_candidate_urgent_text",
      event_id: "mail_evt_urgent_text",
      status: "pending_review",
      subject: "긴급 Synthetic owner confirmation request",
      received_at: "2026-05-20T01:10:00.000Z",
    }),
  ];

  for (const candidate of candidates) {
    await writeJson(
      path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "queue", "pending", `${candidate.candidate_id}.json`),
      candidate,
    );
  }

  await refreshMailWorkPriority({
    repoRoot,
    weekStart: "2026-05-25",
    weekEnd: "2026-05-31",
  });
  const projection = JSON.parse(await readFile(defaultMailWorkPriorityLatestFile(repoRoot), "utf8"));
  const auvDue = projection.entries.find((entry) => entry.candidate_id === "mail_candidate_auv_due");
  const futureDue = projection.entries.find((entry) => entry.candidate_id === "mail_candidate_future_due");
  const urgentText = projection.entries.find((entry) => entry.candidate_id === "mail_candidate_urgent_text");

  assert.equal(auvDue.due_date, "2026-05-27");
  assert.equal(auvDue.due_source, "subject");
  assert.equal(auvDue.deadline_confidence, "subject_month_day");
  assert.equal(auvDue.week_window_match, true);
  assert.deepEqual(auvDue.route_hint_candidates, ["P25-057", "P26-016"]);
  assert.equal(futureDue.week_window_match, false);
  assert.equal(urgentText.due_date, null);
  assert.equal(urgentText.due_source, "subject_text");
  assert.equal(urgentText.deadline_confidence, "text_only");

  const filtered = await listMailWorkPriority({
    repoRoot,
    weekStart: "2026-05-25",
    weekEnd: "2026-05-31",
    weekWindowOnly: true,
  });

  assert.deepEqual(filtered.entries.map((entry) => entry.candidate_id), ["mail_candidate_auv_due"]);
  await assert.rejects(
    listMailWorkPriority({
      repoRoot,
      weekStart: "2026-06-01",
      weekEnd: "2026-05-31",
    }),
    /week-start must be on or before week-end/,
  );
});

test("weekly visibility register includes unresolved priority and quarantine event-only metadata safely", async () => {
  const repoRoot = await createRepoRoot();

  await writeJson(
    path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "queue", "pending", "mail_candidate_o_ring.json"),
    sampleCandidate({
      candidate_id: "mail_candidate_o_ring",
      event_id: "mail_evt_o_ring",
      status: "pending_review",
      subject: "[LIG DNA][AXV][중요] 오링 홈 치수 및 대체 오링 선정 관련 업무 요청 건. (~'26.05.27)",
      received_at: "2026-05-20T04:50:14.000Z",
      attachment_count: 1,
      attachment_types: ["do-not-copy.xlsx"],
    }),
  );

  await writeGatewayInbox(repoRoot, "mail_evt_gateway_known", {
    source_ref: "mail_evt_gateway_known",
    assignment_status: "pending_dungeon_assignment",
    monsters: [
      sampleGatewayMonster({
        monster_id: "mail_evt_gateway_known_001",
        source_refs: ["mail_evt_gateway_known"],
        assignment_status: "pending_dungeon_assignment",
      }),
    ],
  });

  await writeJsonl(
    path.join(
      repoRoot,
      "guild_hall",
      "state",
      "gateway",
      "mailbox",
      "company",
      "quarantine",
      "events",
      "hiworks",
      "2026",
      "2026-05.jsonl",
    ),
    {
      schema_version: "email.fetch.event.v1",
      event_id: "mail_evt_quarantine_p24049",
      source: "hiworks",
      subject: "[P24-049 LIG SAS] 프로젝트 공유 건",
      received_at: "2026-05-21T05:34:07.000Z",
      body_text: "DO NOT COPY BODY",
      body_html: "<p>DO NOT COPY HTML</p>",
      raw: { provider_payload: "DO NOT COPY RAW" },
      attachments: [
        {
          type: "do-not-copy.xlsx",
          name: "do-not-copy.xlsx",
          url: "https://example.invalid/secret-download",
          local_path: "quarantine/do-not-copy.xlsx",
          provider_attachment_id: "do-not-copy-provider-id",
        },
      ],
      metadata: {
        classification: {
          bucket: "quarantine",
          blocked_attachment_count: 1,
        },
      },
    },
  );
  await writeJsonl(
    path.join(
      repoRoot,
      "guild_hall",
      "state",
      "gateway",
      "mailbox",
      "company",
      "mail",
      "events",
      "hiworks",
      "2026",
      "2026-05.jsonl",
    ),
    {
      schema_version: "email.fetch.event.v1",
      event_id: "mail_evt_gateway_known",
      source: "hiworks",
      subject: "[LIG AUV] already materialized event should not reappear",
      received_at: "2026-05-21T05:34:07.000Z",
      attachments: [
        {
          type: "binary_attachment",
        },
      ],
      metadata: {
        classification: {
          bucket: "mail",
          blocked_attachment_count: 0,
        },
      },
    },
  );

  const result = await refreshMailWeeklyVisibilityRegister({
    repoRoot,
    weekStart: "2026-05-25",
    weekEnd: "2026-05-31",
  });
  const registerText = await readFile(defaultMailWeeklyVisibilityRegisterFile(repoRoot), "utf8");

  assert.equal(result.status, "refreshed");
  assert.equal(result.count, 2);
  assert.ok(result.rows.some((row) => row.candidate_id === "mail_candidate_o_ring"));
  const oRingRow = result.rows.find((row) => row.candidate_id === "mail_candidate_o_ring");
  assert.equal(oRingRow.due_date_or_window, "2026-05-27");
  assert.equal(oRingRow.attachment_count, 1);
  assert.deepEqual(oRingRow.attachment_types, ["attachment_metadata"]);
  assert.ok(!result.rows.some((row) => String(row.source_ref).includes("mail_evt_gateway_known")));
  const quarantineRow = result.rows.find((row) => row.source_kind === "mailbox_event_only");
  assert.equal(quarantineRow.candidate_id, null);
  assert.equal(quarantineRow.bucket, "quarantine");
  assert.equal(quarantineRow.work_status, "event_only_review_needed");
  assert.equal(quarantineRow.promotion_allowed, false);
  assert.equal(quarantineRow.blocked_attachment_count, 1);
  assert.deepEqual(quarantineRow.attachment_types, ["attachment_metadata"]);
  assert.match(registerText, /P00 Unresolved Weekly Visibility Register/);
  assert.match(registerText, /Candidate ID/);
  assert.match(registerText, /Promotion allowed/);
  assert.match(registerText, /mail_candidate_o_ring/);
  assert.doesNotMatch(registerText, /body_text|body_html|provider_payload|do-not-copy|secret-download|local_path|provider_attachment_id|token|password|cookie/);
  await assert.rejects(
    refreshMailWeeklyVisibilityRegister({
      repoRoot,
      weekStart: "2026-05-25",
      weekEnd: "2026-05-31",
      outputFile: path.join(repoRoot, "guild_hall", "state", "gateway", "weekly_visibility.md"),
    }),
    /weekly visibility register output-file must stay under _workmeta\/P00-000_INBOX\/reports\/triage/,
  );
});

test("listMailWorkPriority filters from latest priority projection", async () => {
  const repoRoot = await createRepoRoot();

  await writeJson(
    path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "queue", "pending", "mail_candidate_kvds.json"),
    sampleCandidate({
      candidate_id: "mail_candidate_kvds",
      event_id: "mail_evt_kvds",
      status: "pending_review",
      subject: "[기0탐] Synthetic attendance reply request",
    }),
  );
  await writeJson(
    path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "queue", "pending", "mail_candidate_receipt.json"),
    sampleCandidate({
      candidate_id: "mail_candidate_receipt",
      event_id: "mail_evt_receipt",
      status: "pending_review",
      subject: "Synthetic Apple receipt notice",
      source: "gmail",
      workspace: "personal",
    }),
  );
  await writeJson(
    path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "queue", "pending", "mail_candidate_masked_kvds.json"),
    sampleCandidate({
      candidate_id: "mail_candidate_masked_kvds",
      event_id: "mail_evt_masked_kvds",
      status: "pending_review",
      subject: "[기ㅇ탐ㅇㅇㅇㅇ] 예인몸체 자료 송부의 건",
    }),
  );

  await refreshMailWorkPriority({ repoRoot });
  const result = await listMailWorkPriority({
    repoRoot,
    routeCandidate: "P26-014",
  });

  assert.equal(result.projection_source, "latest");
  assert.equal(result.count, 2);
  assert.deepEqual(
    result.entries.map((entry) => entry.candidate_id).sort(),
    ["mail_candidate_kvds", "mail_candidate_masked_kvds"],
  );
});

async function createRepoRoot() {
  return mkdtemp(path.join(os.tmpdir(), "soulforge-mail-work-status-"));
}

async function writeGatewayInbox(repoRoot, inboxId, { source_ref, assignment_status, monsters }) {
  const inboxDir = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", inboxId);
  await writeJson(path.join(inboxDir, "inbox.json"), {
    workspace_intake_inbox_id: inboxId,
    source_kind: "mail",
    source_ref,
    event_ref: `guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-05.jsonl#event_id=${source_ref}`,
    raw_ref: `guild_hall/state/gateway/mailbox/company/mail/raw/hiworks/2026/2026-05.jsonl#provider_message_id=${source_ref}`,
    received_at: "2026-05-20T02:00:00.000Z",
    mailbox_id: "company_mailbox",
    assignment_status,
    updated_at: "2026-05-20T02:00:00.000Z",
  });
  await writeJson(path.join(inboxDir, "monsters.json"), { monsters });
}

function sampleGatewayMonster(overrides = {}) {
  return {
    monster_id: "mail_evt_001_001",
    monster_family: "unknown_monster",
    monster_name: null,
    work_pattern: "mail_candidate_review",
    objective: "Review mail-derived work item",
    due_state: "no_due",
    known_status: "unknown",
    source_refs: [],
    last_mail_at: "2026-05-20T02:00:00.000Z",
    mail_touch_count: 1,
    last_mail_role: "new_request",
    assignment_status: "pending_dungeon_assignment",
    assigned_project_code: null,
    assigned_stage: null,
    project_monster_ref: null,
    transferred_at: null,
    mission_ref: null,
    updated_at: "2026-05-20T02:00:00.000Z",
    ...overrides,
  };
}

function sampleCandidate({
  candidate_id,
  event_id,
  status,
  subject = "Mail candidate",
  received_at = "2026-05-20T01:54:00.000Z",
  source = "hiworks",
  workspace = "company",
  from = [{ name: "Sender", address: "sender@example.test" }],
  attachment_count = 0,
  attachment_types = [],
}) {
  return {
    schema_version: "mail_candidate.queue_item.v1",
    candidate_id,
    status,
    created_at: "2026-05-20T01:55:00.000Z",
    updated_at: "2026-05-20T02:00:00.000Z",
    source_event: {
      event_id,
      source,
      workspace,
      event_file: "guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-05.jsonl",
      received_at,
    },
    mail_summary: {
      subject,
      from,
      to_count: 1,
      cc_count: 0,
      attachment_count,
      attachment_types,
      classification: "mail",
    },
    business_review: {
      required: true,
      status: status === "pending_review" ? "not_started" : "completed",
      next_action: "review_for_mail_intake_request",
      intake_request_status: status === "pending_review" ? "not_created" : "created",
    },
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function writeYaml(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${YAML.stringify(value)}\n`, "utf8");
}
