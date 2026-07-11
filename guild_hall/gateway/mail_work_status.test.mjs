import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
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
import {
  defaultDeadlineRegisterFile,
  importDueObservationsFromMailPriority,
  validateDeadlineWatchLedgers,
} from "./deadline_watch_import.mjs";
import {
  defaultOpenActionRegisterFile,
  registerMailTasksFromPriorityProjection,
} from "./mail_task_register.mjs";
import {
  buildDeadlineWatchdogReminderPreview,
} from "./deadline_watchdog_reminder.mjs";

const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const execFile = promisify(execFileCallback);

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

test("mail work projections preserve safe candidate route and assignment metadata", async () => {
  const repoRoot = await createRepoRoot();
  const baseCandidate = sampleCandidate({
    candidate_id: "mail_candidate_structured_route",
    event_id: "mail_evt_structured_route",
    status: "pending_review",
    subject: "Synthetic metadata-routed ERP task",
    attachment_count: 2,
    attachment_types: ["binary_attachment", "private-spec.xlsx"],
  });
  const candidate = {
    ...baseCandidate,
    mail_summary: {
      ...baseCandidate.mail_summary,
      classification: {
        bucket: "mail",
        label: "erp_task",
        reasons: ["business_review_ready"],
        blocked_attachment_count: 1,
      },
      route_hint_candidates: ["P25-057"],
    },
    business_review: {
      ...baseCandidate.business_review,
      status: "triaged",
      reason: "owner_triage",
      project_routing_suggestion: {
        schema_version: "mail_project_routing_suggestion.v1",
        status: "suggested",
        project_code: "P26-030",
        stage: "erp_entry",
        route_id: "p26030_owner",
        routing_rule_ref: "_workmeta/system/bindings/rules/p26030.yaml",
        confidence: 0.82,
        route_source: "metadata_triage",
        matched_on: ["classification_bucket", "subject"],
        reason_codes: ["owner_route"],
        route_hint_candidates: ["P26-030", "P25-057"],
        body_safe: true,
      },
      owner_assignment_override: {
        assignee_id: "owner-a",
        assignee_label: "Owner A",
        reason_codes: ["owner_override"],
        source: "manual_triage",
        raw_body: "DO_NOT_COPY_BODY",
        attachment_name: "secret.xlsx",
      },
      suggested_assignee: {
        assignee_id: "erp-ops",
        assignee_label: "ERP Ops",
        source: "router",
      },
    },
  };

  await writeJson(
    path.join(repoRoot, "guild_hall", "state", "gateway", "mail_candidate", "queue", "pending", `${candidate.candidate_id}.json`),
    candidate,
  );

  await refreshMailWorkStatus({ repoRoot });
  const statusProjection = JSON.parse(await readFile(defaultMailWorkStatusLatestFile(repoRoot), "utf8"));
  const statusRow = statusProjection.entries.find((entry) => entry.candidate_id === "mail_candidate_structured_route");

  assert.equal(statusRow.route_candidate, "P26-030");
  assert.equal(statusRow.route_confidence, "review");
  assert.equal(statusRow.route_suggestion_confidence, 0.82);
  assert.equal(statusRow.route_source, "metadata_triage");
  assert.equal(statusRow.route_stage, "erp_entry");
  assert.deepEqual(statusRow.route_reason_codes, ["owner_route"]);
  assert.deepEqual(statusRow.route_matched_on, ["classification_bucket", "subject"]);
  assert.deepEqual(statusRow.route_hint_candidates, ["P25-057", "P26-030"]);
  assert.equal(statusRow.review_status, "triaged");
  assert.equal(statusRow.review_reason, "owner_triage");
  assert.equal(statusRow.classification_label, "erp_task");
  assert.deepEqual(statusRow.classification_reasons, ["business_review_ready"]);
  assert.equal(statusRow.blocked_attachment_count, 1);
  assert.deepEqual(statusRow.attachment_types, ["attachment_metadata", "binary_attachment"]);
  assert.deepEqual(statusRow.owner_assignment_override, {
    assignee_id: "owner-a",
    assignee_label: "Owner A",
    reason_codes: ["owner_override"],
    source: "manual_triage",
  });

  await refreshMailWorkPriority({ repoRoot });
  const priorityProjection = JSON.parse(await readFile(defaultMailWorkPriorityLatestFile(repoRoot), "utf8"));
  const priorityRow = priorityProjection.entries.find((entry) => entry.candidate_id === "mail_candidate_structured_route");
  const rendered = JSON.stringify(priorityProjection);

  assert.equal(priorityRow.route_candidate, "P26-030");
  assert.equal(priorityRow.route_confidence, "review");
  assert.equal(priorityRow.route_suggestion_confidence, 0.82);
  assert.equal(priorityRow.route_source, "metadata_triage");
  assert.deepEqual(priorityRow.route_hint_candidates, ["P25-057", "P26-030"]);
  assert.equal(priorityRow.blocked_attachment_count, 1);
  assert.deepEqual(priorityRow.owner_assignment_override, statusRow.owner_assignment_override);
  assert(!rendered.includes("DO_NOT_COPY_BODY"));
  assert(!rendered.includes("secret.xlsx"));
  assert(!rendered.includes("private-spec.xlsx"));
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

test("deadline watch import dry-runs deterministic due observations only", async () => {
  const repoRoot = await createRepoRoot();
  const latestFile = defaultMailWorkPriorityLatestFile(repoRoot);

  await writePriorityProjection(latestFile, [
    samplePriorityRow({
      candidate_id: "mail_candidate_p26_due",
      subject: "[KVDS] 회신 요청(~5/27)",
      due_date: "2026-05-27",
      due_text: "~5/27",
      route_candidate: "P26-014",
      route_confidence: "exact",
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_review_due",
      subject: "[AUV] 자료 확인 요청(~6/3)",
      due_date: "2026-06-03",
      due_text: "~6/3",
      route_candidate: "P00-000_INBOX",
      route_confidence: "review",
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_urgent_text",
      subject: "긴급 확인 요청",
      due_date: null,
      due_text: "긴급",
      due_source: "subject_text",
      deadline_confidence: "text_only",
      route_candidate: "P00-000_INBOX",
      route_confidence: "review",
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_promo_due",
      subject: "Synthetic subscription expires by 6/3",
      due_date: "2026-06-03",
      route_candidate: "none/promo",
      route_confidence: "none",
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_body_due",
      subject: "Synthetic body-derived due should stay blocked",
      due_date: "2026-06-03",
      due_source: "body",
      deadline_confidence: "body_derived_needs_review",
      route_candidate: "P26-014",
      route_confidence: "exact",
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_done_due",
      subject: "[KVDS] completed item(~5/27)",
      due_date: "2026-05-27",
      route_candidate: "P26-014",
      route_confidence: "exact",
      work_status: "completed",
    }),
  ]);

  const result = await importDueObservationsFromMailPriority({
    repoRoot,
    latestFile,
    now: "2026-05-31T01:00:00.000Z",
  });

  assert.equal(result.status, "dry_run");
  assert.equal(result.source_count, 6);
  assert.equal(result.importable_count, 2);
  assert.equal(result.project_counts["P26-014"], 1);
  assert.equal(result.project_counts["P00-000_INBOX"], 1);
  assert.ok(result.skipped.some((row) => row.reason === "no_deterministic_due_date"));
  assert.ok(result.skipped.some((row) => row.reason === "non_project_route:none/promo"));
  assert.ok(result.skipped.some((row) => row.reason === "unsupported_due_source:body"));
  assert.ok(result.skipped.some((row) => row.reason === "terminal_work_status"));
  assert.equal(result.boundary.raw_payload_copied, false);
  assert.equal(result.boundary.raw_mail_body_read, false);
  assert.equal(await fileExists(defaultDeadlineRegisterFile(repoRoot, "P26-014")), false);
});

test("deadline watch import rejects invalid projections and non-canonical apply roots", async () => {
  const repoRoot = await createRepoRoot();
  const latestFile = defaultMailWorkPriorityLatestFile(repoRoot);

  await writePriorityProjection(latestFile, [], {
    schema_version: "not-mail-work-priority",
  });

  await assert.rejects(
    importDueObservationsFromMailPriority({
      repoRoot,
      latestFile,
    }),
    /schema_version mismatch/,
  );

  await writePriorityProjection(latestFile, [
    samplePriorityRow({
      candidate_id: "mail_candidate_p26_due",
      subject: "[KVDS] 회신 요청(~5/27)",
    }),
  ]);

  await assert.rejects(
    importDueObservationsFromMailPriority({
      repoRoot,
      latestFile,
      workmetaRoot: path.join(os.tmpdir(), "not-soulforge-workmeta"),
      apply: true,
    }),
    /canonical repo _workmeta root/,
  );
});

test("deadline watch import applies rows idempotently under project-local ledgers", async () => {
  const repoRoot = await createRepoRoot();
  const latestFile = defaultMailWorkPriorityLatestFile(repoRoot);

  await writePriorityProjection(latestFile, [
    samplePriorityRow({
      candidate_id: "mail_candidate_p26_due",
      subject: "[기뢰탐색음탐기] 검토 요청(~5/27)",
      due_date: "2026-05-27",
      due_text: "~5/27",
      route_candidate: "P26-014",
      route_confidence: "exact",
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_review_due",
      subject: "[AXV] 자료 확인 요청(~6/3)",
      due_date: "2026-06-03",
      due_text: "~6/3",
      route_candidate: "P00-000_INBOX",
      route_confidence: "review",
    }),
  ]);

  const first = await importDueObservationsFromMailPriority({
    repoRoot,
    latestFile,
    apply: true,
    now: "2026-05-31T01:00:00.000Z",
  });
  const second = await importDueObservationsFromMailPriority({
    repoRoot,
    latestFile,
    apply: true,
    now: "2026-05-31T01:30:00.000Z",
  });

  const p26Csv = await readFile(defaultDeadlineRegisterFile(repoRoot, "P26-014"), "utf8");
  const p00Csv = await readFile(defaultDeadlineRegisterFile(repoRoot, "P00-000_INBOX"), "utf8");
  const validation = await validateDeadlineWatchLedgers({ repoRoot });

  assert.equal(first.status, "applied");
  assert.equal(first.written_count, 2);
  assert.equal(first.duplicate_count, 0);
  assert.equal(second.written_count, 0);
  assert.equal(second.duplicate_count, 2);
  assert.match(p26Csv.split(/\r?\n/u)[0], /deadline_id,project_code,source_kind/);
  assert.match(p26Csv, /P26-014/);
  assert.match(p26Csv, /review_due/);
  assert.match(p00Csv, /P00-000_INBOX/);
  assert.equal(validation.status, "pass");
  assert.equal(validation.checked_register_count, 2);
  assert.equal(validation.checked_row_count, 2);
  assert.doesNotMatch(`${p26Csv}\n${p00Csv}`, /body_text|body_html|provider_payload|local_path|provider_attachment_id|token|password|cookie/);
  // 원자적 쓰기 회귀(#S3-6): 장부 디렉터리에 tmp 잔재 없음
  const registerDirEntries = await readdir(path.dirname(defaultDeadlineRegisterFile(repoRoot, "P26-014")));
  assert.deepEqual(registerDirEntries.filter((name) => name.includes(".tmp-")), []);
});

test("mail task register writes exact-route open actions idempotently and holds review routes", async () => {
  const repoRoot = await createRepoRoot();
  const latestFile = defaultMailWorkPriorityLatestFile(repoRoot);

  await writePriorityProjection(latestFile, [
    samplePriorityRow({
      candidate_id: "mail_candidate_actionable",
      subject: "[KVDS] Synthetic source packet request",
      route_candidate: "P26-014",
      route_confidence: "exact",
      due_date: null,
      priority_flags_ko: [],
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_review",
      subject: "Synthetic ambiguous project request",
      route_candidate: "P00-000_INBOX",
      route_confidence: "review",
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_personal",
      subject: "Synthetic personal notice",
      route_candidate: "none/personal",
      route_confidence: "none",
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_terminal",
      subject: "Synthetic completed notice",
      route_candidate: "P26-014",
      route_confidence: "exact",
      work_status: "completed",
    }),
    samplePriorityRow({
      candidate_id: "mail_candidate_raw_boundary",
      subject: "Synthetic unsafe boundary",
      route_candidate: "P26-014",
      route_confidence: "exact",
      boundary: {
        raw_payload_copied: true,
      },
    }),
  ]);

  const first = await registerMailTasksFromPriorityProjection({
    repoRoot,
    latestFile,
    apply: true,
    now: "2026-06-06T00:00:00.000Z",
  });
  const second = await registerMailTasksFromPriorityProjection({
    repoRoot,
    latestFile,
    apply: true,
    now: "2026-06-06T00:30:00.000Z",
  });

  const register = await readFile(defaultOpenActionRegisterFile(repoRoot, "P26-014"), "utf8");
  const privateSyncText = JSON.stringify(first.private_metadata_sync);

  assert.equal(first.status, "applied");
  assert.equal(first.source_count, 5);
  assert.equal(first.writable_count, 1);
  assert.equal(first.written_count, 1);
  assert.equal(first.duplicate_count, 0);
  assert.equal(first.owner_review_count, 1);
  assert.equal(first.skipped_count, 3);
  assert.equal(second.written_count, 0);
  assert.equal(second.duplicate_count, 1);
  assert.match(register, /\| OA-P26-014-MAIL-[0-9a-f]{16} \| 2026-05-20 \| Medium \| Mail follow-up: \[KVDS\] Synthetic source packet request \| open \|/);
  assert.match(register, /guild_hall\/state\/gateway\/mail_candidate\/queue\/pending\/mail_candidate_actionable[.]json/);
  assert.equal(register.split(/\r?\n/u).filter((line) => line.startsWith("| OA-P26-014-MAIL-")).length, 1);
  assert.equal(await fileExists(defaultOpenActionRegisterFile(repoRoot, "P00-000_INBOX")), false);
  assert.equal(first.private_metadata_sync.status, "manual_sync_required");
  assert.equal(first.private_metadata_sync.commit_intent, "prepare_private_metadata_commit");
  assert.equal(first.private_metadata_sync.push_intent, "prepare_private_metadata_push");
  assert.equal(first.private_metadata_sync.recommended_command, "npm run guild-hall:workmeta:sync -- --json");
  assert.doesNotMatch(`${register}\n${privateSyncText}`, /body_text|body_html|provider_payload|attachment_filename|attachment_url|download_url|local_path|provider_attachment_id|token|password|cookie|secret/);
  assert.equal(first.boundary.raw_payload_copied, false);
  assert.equal(first.boundary.telegram_sent, false);
  // 원자적 쓰기 회귀(#S3-6): 장부 디렉터리에 tmp 잔재 없음
  const openActionDirEntries = await readdir(path.dirname(defaultOpenActionRegisterFile(repoRoot, "P26-014")));
  assert.deepEqual(openActionDirEntries.filter((name) => name.includes(".tmp-")), []);
});

test("mail task register queues notification only when gateway mail_received policy is enabled", async () => {
  const enabledRoot = await createRepoRoot();
  const enabledLatestFile = defaultMailWorkPriorityLatestFile(enabledRoot);
  await writePriorityProjection(enabledLatestFile, [
    samplePriorityRow({
      candidate_id: "mail_candidate_notify_enabled",
      subject: "Synthetic notify enabled request",
      route_candidate: "P26-014",
      route_confidence: "exact",
    }),
  ]);
  await writeGatewayNotifyPolicy(enabledRoot, { mailReceivedTelegram: true });

  const enabled = await registerMailTasksFromPriorityProjection({
    repoRoot: enabledRoot,
    latestFile: enabledLatestFile,
    apply: true,
    notify: true,
    now: "2026-06-06T01:00:00.000Z",
  });
  const queued = JSON.parse(await readFile(path.join(enabledRoot, enabled.notification.queue_refs[0]), "utf8"));

  assert.equal(enabled.notification.status, "queued");
  assert.equal(enabled.notification.attempted_count, 1);
  assert.equal(enabled.notification.queued_count, 1);
  assert.equal(queued.owner_scope, "gateway");
  assert.equal(queued.event, "mail_received");
  assert.match(queued.source_ref, /_workmeta\/P26-014\/reports\/open_actions\/open_action_register[.]md#action=/);
  assert.doesNotMatch(JSON.stringify(queued), /body_text|body_html|provider_payload|attachment_filename|attachment_url|download_url|local_path|provider_attachment_id|token|password|cookie|secret/);

  const disabledRoot = await createRepoRoot();
  const disabledLatestFile = defaultMailWorkPriorityLatestFile(disabledRoot);
  await writePriorityProjection(disabledLatestFile, [
    samplePriorityRow({
      candidate_id: "mail_candidate_notify_disabled",
      subject: "Synthetic notify disabled request",
      route_candidate: "P26-014",
      route_confidence: "exact",
    }),
  ]);
  await writeGatewayNotifyPolicy(disabledRoot, { mailReceivedTelegram: false });

  const disabled = await registerMailTasksFromPriorityProjection({
    repoRoot: disabledRoot,
    latestFile: disabledLatestFile,
    apply: true,
    notify: true,
    now: "2026-06-06T01:30:00.000Z",
  });

  assert.equal(disabled.notification.status, "disabled");
  assert.equal(disabled.notification.queued_count, 0);
  assert.equal(disabled.notification.disabled_count, 1);
  assert.equal(await fileExists(path.join(disabledRoot, "guild_hall", "state", "town_crier", "queue", "pending", "missing.json")), false);
  assert.equal(await fileExists(path.join(disabledRoot, "guild_hall", "state", "town_crier", "queue", "pending")), false);
});

test("mail task register rejects latest-file paths outside the projection boundary", async () => {
  const repoRoot = await createRepoRoot();

  await assert.rejects(
    registerMailTasksFromPriorityProjection({
      repoRoot,
      latestFile: path.join(os.tmpdir(), "mail_work_priority.json"),
    }),
    /latest-file must stay under the active repo root/,
  );

  await assert.rejects(
    registerMailTasksFromPriorityProjection({
      repoRoot,
      latestFile: path.join(repoRoot, "private-state", "guild_hall", "state", "gateway", "mail_work_status", "priority_latest.json"),
    }),
    /must not read private-state projection copies/,
  );

  await assert.rejects(
    registerMailTasksFromPriorityProjection({
      repoRoot,
      latestFile: path.join(repoRoot, "guild_hall", "state", "gateway", "mailbox", "company", "mail", "events", "priority_latest.json"),
    }),
    /must not read gateway mailbox raw\/event roots/,
  );

  await assert.rejects(
    registerMailTasksFromPriorityProjection({
      repoRoot,
      latestFile: path.join(repoRoot, "_workspaces", "P26-014", "priority_latest.json"),
    }),
    /must not read _workspaces payload roots/,
  );
});

test("mail task register rejects symlinked latest-file paths into denied roots", async (t) => {
  const repoRoot = await createRepoRoot();

  const privateStateProjection = path.join(repoRoot, "private-state", "priority_latest.json");
  const allowedLookingLink = path.join(repoRoot, "guild_hall", "state", "gateway", "mail_work_status", "linked_priority_latest.json");
  await writePriorityProjection(privateStateProjection, []);
  await mkdir(path.dirname(allowedLookingLink), { recursive: true });
  try {
    await symlink(privateStateProjection, allowedLookingLink);
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) {
      t.skip(`symlink creation unavailable on this platform: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    registerMailTasksFromPriorityProjection({
      repoRoot,
      latestFile: allowedLookingLink,
    }),
    /must not read private-state projection copies/,
  );
});

test("deadline watch validator flags project mismatch and raw markers", async () => {
  const repoRoot = await createRepoRoot();
  const registerFile = defaultDeadlineRegisterFile(repoRoot, "P26-014");
  await writeText(
    registerFile,
    [
      "deadline_id,project_code,source_kind,source_ref,subject_hint,action_type,due_at,due_text,confidence,status,owner_or_contact,completion_ref,next_nudge_at,last_nudged_at,nudge_count,snooze_until,claim_ceiling,raw_payload_copied,created_at,updated_at",
      "DWL-bad,P00-000_INBOX,mail,body_text,secret token marker,reply_due,2026-05-27,~5/27,subject_date,open,,,,,0,,observed,true,2026-05-31T01:00:00.000Z,2026-05-31T01:00:00.000Z",
      "",
    ].join("\n"),
  );

  const result = await validateDeadlineWatchLedgers({ repoRoot });

  assert.equal(result.status, "fail");
  assert.ok(result.errors.some((error) => error.reason === "project_code_must_match_folder"));
  assert.ok(result.errors.some((error) => error.reason === "must_be_false"));
  assert.ok(result.errors.some((error) => error.reason === "banned_payload_or_secret_marker"));
});

test("deadline watch validator enforces terminal and snooze completion evidence", async () => {
  const repoRoot = await createRepoRoot();
  const registerFile = defaultDeadlineRegisterFile(repoRoot, "P26-014");
  await writeText(
    registerFile,
    [
      "deadline_id,project_code,source_kind,source_ref,subject_hint,action_type,due_at,due_text,confidence,status,owner_or_contact,completion_ref,next_nudge_at,last_nudged_at,nudge_count,snooze_until,claim_ceiling,raw_payload_copied,created_at,updated_at",
      "DWL-done,P26-014,mail,mail_candidate:done,Done row,reply_due,2026-05-27,~5/27,subject_date,done,,,,,0,,observed,false,2026-05-31T01:00:00.000Z,2026-05-31T01:00:00.000Z",
      "DWL-snooze,P26-014,mail,mail_candidate:snooze,Snoozed row,reply_due,2026-05-27,~5/27,subject_date,snoozed,,,,,0,,observed,false,2026-05-31T01:00:00.000Z,2026-05-31T01:00:00.000Z",
      "DWL-invalid-date,P26-014,mail,mail_candidate:invalid,Invalid date row,reply_due,not-a-date,~5/27,subject_date,open,,,,,0,,observed,false,2026-05-31T01:00:00.000Z,2026-05-31T01:00:00.000Z",
      "",
    ].join("\n"),
  );

  const result = await validateDeadlineWatchLedgers({ repoRoot });

  assert.equal(result.status, "fail");
  assert.ok(result.errors.some((error) => error.reason === "terminal_status_requires_completion_ref"));
  assert.ok(result.errors.some((error) => error.reason === "snoozed_status_requires_snooze_until"));
  assert.ok(result.errors.some((error) => error.reason === "invalid_due_at"));
});

test("deadline watchdog reminder preview creates manual-confirm candidates without leaking secret markers", async () => {
  const repoRoot = await createRepoRoot();
  const registerFile = defaultDeadlineRegisterFile(repoRoot, "P26-014");
  await writeText(
    registerFile,
    [
      "deadline_id,project_code,source_kind,source_ref,subject_hint,action_type,due_at,due_text,confidence,status,owner_or_contact,completion_ref,next_nudge_at,last_nudged_at,nudge_count,snooze_until,claim_ceiling,raw_payload_copied,created_at,updated_at",
      "DWL-open,P26-014,mail,mail_candidate:open,secret token marker,reply_due,2026-06-04T12:00:00.000Z,오늘 12시,subject_date,open,,,,,0,,observed,false,2026-06-04T00:00:00.000Z,2026-06-04T00:00:00.000Z",
      "DWL-future,P26-014,mail,mail_candidate:future,Future row,reply_due,2026-06-10T12:00:00.000Z,6/10,subject_date,open,,,,,0,,observed,false,2026-06-04T00:00:00.000Z,2026-06-04T00:00:00.000Z",
      "DWL-cooldown,P26-014,mail,mail_candidate:cooldown,Cooldown row,reply_due,2026-06-04T12:00:00.000Z,오늘 12시,subject_date,open,,,,2026-06-04T08:30:00.000Z,1,,observed,false,2026-06-04T00:00:00.000Z,2026-06-04T08:30:00.000Z",
      "DWL-max,P26-014,mail,mail_candidate:max,Max row,reply_due,2026-06-04T12:00:00.000Z,오늘 12시,subject_date,open,,,,,3,,observed,false,2026-06-04T00:00:00.000Z,2026-06-04T00:00:00.000Z",
      "DWL-snooze,P26-014,mail,mail_candidate:snooze,Snoozed row,reply_due,2026-06-04T12:00:00.000Z,오늘 12시,subject_date,snoozed,,,,,1,2026-06-05T00:00:00.000Z,observed,false,2026-06-04T00:00:00.000Z,2026-06-04T00:00:00.000Z",
      "DWL-done,P26-014,mail,mail_candidate:done,Done row,reply_due,2026-06-04T12:00:00.000Z,오늘 12시,subject_date,done,,battle:event:done,,,1,,observed,false,2026-06-04T00:00:00.000Z,2026-06-04T00:00:00.000Z",
      "DWL-raw,P26-014,mail,mail_candidate:raw,Raw row,reply_due,2026-06-04T12:00:00.000Z,오늘 12시,subject_date,open,,,,,0,,observed,true,2026-06-04T00:00:00.000Z,2026-06-04T00:00:00.000Z",
      "",
    ].join("\n"),
  );

  const result = await buildDeadlineWatchdogReminderPreview({
    repoRoot,
    now: new Date("2026-06-04T09:00:00.000Z"),
    dueWindowHours: 72,
    cooldownHours: 24,
    maxNudgeCount: 3,
  });
  const rendered = JSON.stringify(result);

  assert.equal(result.status, "dry_run");
  assert.equal(result.reminder_candidate_count, 1);
  assert.equal(result.suppressed_reason_counts.outside_due_window, 1);
  assert.equal(result.suppressed_reason_counts.cooldown_active, 1);
  assert.equal(result.suppressed_reason_counts.max_nudge_count_reached, 1);
  assert.equal(result.suppressed_reason_counts.snoozed_until_future, 1);
  assert.equal(result.suppressed_reason_counts["inactive_status:done"], 1);
  assert.equal(result.suppressed_reason_counts.raw_payload_boundary_failed, 1);
  assert.equal(result.reminder_candidates[0].manual_confirm_required, true);
  assert.equal(result.reminder_candidates[0].auto_send_allowed, false);
  assert.match(result.reminder_candidates[0].text, /마감 확인이 필요합니다/);
  assert.equal(rendered.includes("secret token"), false);
  assert.equal(result.boundary.town_crier_queue_written, false);
  assert.equal(result.boundary.telegram_sent, false);
});

test("deadline-watchdog-reminders CLI prints dry-run manual-confirm preview", async () => {
  const repoRoot = await createRepoRoot();
  const registerFile = defaultDeadlineRegisterFile(repoRoot, "P00-000_INBOX");
  await writeText(
    registerFile,
    [
      "deadline_id,project_code,source_kind,source_ref,subject_hint,action_type,due_at,due_text,confidence,status,owner_or_contact,completion_ref,next_nudge_at,last_nudged_at,nudge_count,snooze_until,claim_ceiling,raw_payload_copied,created_at,updated_at",
      "DWL-p00,P00-000_INBOX,mail,mail_candidate:p00,Owner review row,review_due,2026-06-04T12:00:00.000Z,오늘 12시,subject_date,waiting,,,,,0,,observed,false,2026-06-04T00:00:00.000Z,2026-06-04T00:00:00.000Z",
      "",
    ].join("\n"),
  );

  const { stdout } = await execFile(process.execPath, [
    cliPath,
    "deadline-watchdog-reminders",
    "--workmeta-root",
    path.join(repoRoot, "_workmeta"),
    "--due-window-hours",
    "72",
  ]);
  const result = JSON.parse(stdout);

  assert.equal(result.request_id, "deadline_watchdog_reminders");
  assert.equal(result.status, "dry_run");
  assert.equal(result.reminder_candidate_count, 1);
  assert.equal(result.reminder_candidates[0].project_code, "P00-000_INBOX");
  assert.equal(result.boundary.telegram_sent, false);
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

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function writePriorityProjection(filePath, entries, overrides = {}) {
  await writeJson(filePath, {
    schema_version: "soulforge.gateway.mail_work_priority.v1",
    kind: "mail_work_priority_projection",
    generated_at: "2026-05-31T01:00:00.000Z",
    source_schema_version: "soulforge.gateway.mail_work_status.v1",
    count: entries.length,
    counts: {},
    route_counts: {},
    entries,
    boundary: {
      raw_payload_copied: false,
    },
    ...overrides,
  });
}

function samplePriorityRow(overrides = {}) {
  const candidateId = overrides.candidate_id ?? "mail_candidate_due";
  return {
    candidate_id: candidateId,
    mail_source_ref: candidateId.replace(/^mail_candidate_/u, "mail_evt_"),
    subject: "Synthetic due request(~5/27)",
    received_at: "2026-05-20T01:00:00.000Z",
    operating_state_ko: "새 일",
    route_candidate: "P26-014",
    route_confidence: "exact",
    thread_group: "synthetic",
    due_date: "2026-05-27",
    due_text: "~5/27",
    due_source: "subject",
    deadline_confidence: "subject_month_day",
    week_window_match: null,
    route_hint_candidates: [],
    attachment_count: 0,
    attachment_types: [],
    classification_bucket: "mail",
    priority_flags_ko: ["오늘 처리"],
    next_action_ko: "검토한다.",
    owner_question_ko: null,
    work_status: "candidate_pending",
    refs: {
      candidate_ref: `guild_hall/state/gateway/mail_candidate/queue/pending/${candidateId}.json`,
    },
    boundary: {
      raw_payload_copied: false,
    },
    ...overrides,
  };
}

async function writeGatewayNotifyPolicy(repoRoot, { mailReceivedTelegram }) {
  await writeText(
    path.join(repoRoot, "guild_hall", "state", "gateway", "bindings", "notify_policy.yaml"),
    [
      "kind: gateway_notify_policy",
      "scope: gateway",
      "channels:",
      "  telegram:",
      "    enabled: true",
      "    env_file: guild_hall/state/town_crier/telegram_notify.env",
      "events:",
      "  monster_created:",
      "    telegram: false",
      "  mail_received:",
      `    telegram: ${mailReceivedTelegram ? "true" : "false"}`,
      "updated_at: '2026-06-06T00:00:00.000Z'",
      "",
    ].join("\n"),
  );
}

async function fileExists(filePath) {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function writeJsonl(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function writeYaml(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${YAML.stringify(value)}\n`, "utf8");
}
