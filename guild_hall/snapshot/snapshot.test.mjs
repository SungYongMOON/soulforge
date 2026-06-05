import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, compareSnapshotFreshness, validateSnapshot } from "./producer.mjs";

test("buildSnapshot summarizes private project surfaces without reading private content", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-"));

  try {
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-001", "bindings"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-001", "ontology"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-001", "reports", "knowledge_access"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-001", "reports", "onboarding"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-001", "reports", "procedure_capture"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "system", "reports", "knowledge_access"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "system", "reports", "procedure_capture"), { recursive: true });
    await mkdir(path.join(repoRoot, ".workflow", "knowledge_access_event_capture_v0", "templates"), { recursive: true });
    await mkdir(path.join(repoRoot, ".workflow", "sourcebound_knowledge_packet_operating_loop_v0", "templates"), { recursive: true });
    await mkdir(path.join(repoRoot, "docs", "architecture", "foundation"), { recursive: true });
    await mkdir(path.join(repoRoot, "docs", "architecture", "guild_hall"), { recursive: true });
    await mkdir(path.join(repoRoot, "docs", "architecture", "workspace", "examples", "notebooklm_bridge"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "knowledge_access"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "inbox_001"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity"), { recursive: true });
    await mkdir(path.join(repoRoot, "private-state", ".git"), { recursive: true });
    await mkdir(path.join(repoRoot, "private-state", "guild_hall", "state", "operations", "soulforge_activity"), { recursive: true });

    await writeFile(
      path.join(repoRoot, ".mission", "index.yaml"),
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_001",
        "    title: Mission One",
        "    status: blocked",
        "    readiness_status: blocked",
        "    project_code: PX-001",
        "    party_id: guild_master_cell",
      ].join("\n"),
      "utf8",
    );
    await writeFile(path.join(repoRoot, "_workmeta", "PX-001", "contract.yaml"), "display_name: DO_NOT_LEAK_PRIVATE_NAME\n", "utf8");
    await writeFile(path.join(repoRoot, "_workmeta", "PX-001", "bindings", "mailbox_binding.yaml"), "token: DO_NOT_LEAK_TOKEN\n", "utf8");
    await writeFile(
      path.join(repoRoot, "_workmeta", "PX-001", "reports", "knowledge_access", "DO_NOT_LEAK_PRIVATE_LEDGER_NAME.jsonl"),
      "{\"query\":\"DO_NOT_LEAK_NOTEBOOK_QUERY\",\"answer\":\"DO_NOT_LEAK_NOTEBOOK_ANSWER\",\"source\":\"DO_NOT_LEAK_SOURCE_PAYLOAD\"}\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "_workmeta", "PX-001", "reports", "procedure_capture", "private_report.md"),
      "DO_NOT_LEAK_PRIVATE_REPORT\nDO_NOT_LEAK_OWNER_DECISION\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "_workmeta", "PX-001", "ontology", "candidate.yaml"),
      "statement: DO_NOT_LEAK_ONTOLOGY_CANDIDATE\nmutation: DO_NOT_LEAK_GRAPH_MUTATION\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "_workmeta", "system", "reports", "knowledge_access", "notebooklm_session.json"),
      "DO_NOT_LEAK_NOTEBOOK_QUERY\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "_workmeta", "system", "reports", "knowledge_access", "notebooklm_auth.json"),
      "DO_NOT_LEAK_NOTEBOOK_ANSWER\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "_workmeta", "system", "reports", "knowledge_access", "knowledge_access_event.jsonl"),
      "{\"event\":\"metadata_only\"}\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, "_workmeta", "system", "reports", "procedure_capture", "node_smoke.md"), "node smoke\n", "utf8");
    await writeFile(path.join(repoRoot, "guild_hall", "knowledge_access", "README.md"), "helper\n", "utf8");
    await writeFile(path.join(repoRoot, "guild_hall", "knowledge_access", "cli.mjs"), "export {};\n", "utf8");
    await writeFile(path.join(repoRoot, "guild_hall", "knowledge_access", "ledger.mjs"), "export {};\n", "utf8");
    await writeFile(path.join(repoRoot, "guild_hall", "knowledge_access", "notebooklm_bridge.mjs"), "export {};\n", "utf8");
    await writeFile(path.join(repoRoot, "guild_hall", "knowledge_access", "knowledge_access.test.mjs"), "export {};\n", "utf8");
    await writeFile(path.join(repoRoot, ".workflow", "knowledge_access_event_capture_v0", "workflow.yaml"), "id: knowledge_access_event_capture_v0\n", "utf8");
    await writeFile(path.join(repoRoot, ".workflow", "knowledge_access_event_capture_v0", "templates", "event.template.yaml"), "kind: event\n", "utf8");
    await writeFile(
      path.join(repoRoot, ".workflow", "sourcebound_knowledge_packet_operating_loop_v0", "workflow.yaml"),
      "id: sourcebound_knowledge_packet_operating_loop_v0\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, ".workflow", "sourcebound_knowledge_packet_operating_loop_v0", "templates", "ontology_candidate_rule_register.template.yaml"),
      "kind: template\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, "docs", "architecture", "guild_hall", "KNOWLEDGE_OPERATING_MODEL_V0.md"), "knowledge model\n", "utf8");
    await writeFile(path.join(repoRoot, "docs", "architecture", "foundation", "ONTOLOGY_REVIEW_MANUAL_V0.md"), "ontology review\n", "utf8");
    await writeFile(path.join(repoRoot, "docs", "architecture", "foundation", "ONTOLOGY_MODEL_V0.md"), "ontology model\n", "utf8");
    await writeFile(
      path.join(repoRoot, "docs", "architecture", "workspace", "examples", "notebooklm_bridge", "synthetic_notebooklm_binding.yaml"),
      "claim_ceiling: advisory_signal_only\npayload: DO_NOT_LEAK_SOURCE_PAYLOAD\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "inbox_001", "monsters.json"),
      JSON.stringify(
        {
          monsters: [
            {
              monster_id: "monster_fixture_001",
              monster_family: "unknown_monster",
              monster_name: "fixture_monster",
              work_pattern: "mail_candidate_review",
              objective_ko: "Review mail candidate for work intake.",
              due_state: "no_due",
              known_status: "unknown",
              project_hints: ["PX-001"],
              stage_hints: ["PDR"],
              assignment_status: "pending_dungeon_assignment",
              mail_touch_count: 1,
              last_mail_role: "new_request",
              mission_ref: null,
              source_refs: ["guild_hall/state/gateway/mailbox/company/mail/raw/fixture.jsonl#provider_message_id=DO_NOT_LEAK_RAW_REF"],
              body_excerpt: "DO_NOT_LEAK_BODY_EXCERPT",
              source_quote: "DO_NOT_LEAK_SOURCE_QUOTE",
              attachment_refs: ["DO_NOT_LEAK_ATTACHMENT_REF"],
            },
            {
              monster_id: "monster_fixture_transferred",
              monster_family: "dragon",
              work_pattern: "done_work",
              objective: "Already assigned",
              assignment_status: "transferred",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:00:00.000Z" });
    const serialized = JSON.stringify(snapshot);

    assert.equal(validateSnapshot(snapshot).ok, true);
    assert.deepEqual(snapshot.projects.map((project) => project.project_code), ["PX-001"]);
    assert.equal(snapshot.projects[0].project_code, "PX-001");
    assert.equal(snapshot.projects[0].workmeta.contract_present, true);
    assert.equal(snapshot.projects[0].workmeta.bindings_count, 1);
    assert.equal(snapshot.missions.items[0].mission_id, "mission_001");
    assert.equal(snapshot.gateway.pending_monsters.count, 1);
    assert.equal(snapshot.gateway.pending_monsters.items.length, 1);
    assert.equal(snapshot.gateway.pending_monsters.items[0].monster_id, "monster_fixture_001");
    assert.equal(snapshot.gateway.pending_monsters.items[0].objective_summary, "Review mail candidate for work intake.");
    assert.equal(snapshot.gateway.pending_monsters.items[0].project_hint_count, 1);
    assert.equal(snapshot.operation_board.schema_version, "soulforge.operation_board_projection.v0");
    assert.equal(snapshot.operation_board.summary.project_count, 1);
    assert.equal(snapshot.operation_board.summary.blocked_mission_count, 1);
    assert.equal(snapshot.operation_board.summary.pending_monster_count, 1);
    assert.equal(snapshot.operation_board.summary.knowledge_lane_state, "owner_review_required");
    assert.equal(snapshot.operation_board.sections.dungeon_map.items[0].project_code, "PX-001");
    assert.equal(snapshot.operation_board.sections.dungeon_map.items[0].surface_status, "workspace_missing");
    assert.equal(snapshot.operation_board.sections.mission_board.items[0].display_group, "blocked");
    assert.equal(snapshot.operation_board.sections.knowledge_lane.claim_ceiling, "observed");
    assert.equal(snapshot.operation_board.sections.knowledge_lane.notebooklm_bridge_present, true);
    assert.equal(snapshot.operation_board.sections.knowledge_lane.evidence_present, true);
    assert.equal(snapshot.operation_board.sections.action_queue.items.length, snapshot.next_actions.length);
    assert.deepEqual(snapshot.operation_board.sections.action_queue.items[0], {
      id: snapshot.next_actions[0].id,
      status: snapshot.next_actions[0].status,
      summary: snapshot.next_actions[0].summary,
      rank: 1,
    });
    assert.equal(snapshot.operation_board.sections.action_queue.items[0].status, "started");
    assert.equal(snapshot.knowledge_lane.schema_version, "soulforge.knowledge_lane_status.v0");
    assert.equal(snapshot.knowledge_lane.owner_gated.state, "owner_review_required");
    assert.equal(snapshot.knowledge_lane.claim_ceiling, "observed");
    assert.equal(snapshot.knowledge_lane.helper.notebooklm_bridge_present, true);
    assert.equal(snapshot.knowledge_lane.workflows.present_count, 2);
    assert.equal(snapshot.knowledge_lane.fixtures.notebooklm_bridge_public_synthetic_present, true);
    assert.equal(snapshot.knowledge_lane.evidence.counts.project_knowledge_access_surface_count, 1);
    assert.equal(snapshot.knowledge_lane.evidence.counts.project_procedure_capture_surface_count, 1);
    assert.equal(snapshot.knowledge_lane.evidence.counts.project_ontology_surface_count, 1);
    assert.equal(snapshot.knowledge_lane.evidence.counts.system_knowledge_access_entry_count, 1);
    assert.equal(snapshot.knowledge_lane.evidence.total_surface_count, 7);
    assert.equal(snapshot.knowledge_lane.public_surface_count > snapshot.knowledge_lane.evidence.total_surface_count, true);
    assert.equal(snapshot.operation_board.summary.knowledge_evidence_surface_count, 7);
    assert.equal(serialized.includes("DO_NOT_LEAK_PRIVATE_NAME"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_TOKEN"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_BODY_EXCERPT"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_SOURCE_QUOTE"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_ATTACHMENT_REF"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_RAW_REF"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_PRIVATE_LEDGER_NAME"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_NOTEBOOK_QUERY"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_NOTEBOOK_ANSWER"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_SOURCE_PAYLOAD"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_PRIVATE_REPORT"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_ONTOLOGY_CANDIDATE"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_OWNER_DECISION"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_GRAPH_MUTATION"), false);
    assert.equal(serialized.includes("notebooklm_session.json"), false);
    assert.equal(serialized.includes("notebooklm_auth.json"), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("validateSnapshot rejects invalid next action statuses and action queue mirror drift", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-action-queue-"));

  try {
    await writeKnowledgeLanePublicSurface(repoRoot);
    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-05-04T00:00:00.000Z" });
    assert.equal(validateSnapshot(snapshot).ok, true);

    const invalidStatus = JSON.parse(JSON.stringify(snapshot));
    invalidStatus.next_actions[0].status = "done";
    invalidStatus.operation_board.sections.action_queue.items[0].status = "done";
    const invalidStatusValidation = validateSnapshot(invalidStatus);
    assert.equal(invalidStatusValidation.ok, false);
    assert.equal(invalidStatusValidation.errors.includes("next_actions[0].status must be one of started, next"), true);
    assert.equal(
      invalidStatusValidation.errors.includes("operation_board.sections.action_queue.items[0].status must be one of started, next"),
      true,
    );

    const nextActionExtraField = JSON.parse(JSON.stringify(snapshot));
    nextActionExtraField.next_actions[0].raw_payload_ref = "synthetic_raw_payload_ref";
    const nextActionExtraFieldValidation = validateSnapshot(nextActionExtraField);
    assert.equal(nextActionExtraFieldValidation.ok, false);
    assert.equal(nextActionExtraFieldValidation.errors.includes("next_actions[0].raw_payload_ref is not an allowed field"), true);

    const actionQueueExtraField = JSON.parse(JSON.stringify(snapshot));
    actionQueueExtraField.operation_board.sections.action_queue.items[0].source_ref = "synthetic_source_ref";
    const actionQueueExtraFieldValidation = validateSnapshot(actionQueueExtraField);
    assert.equal(actionQueueExtraFieldValidation.ok, false);
    assert.equal(
      actionQueueExtraFieldValidation.errors.includes("operation_board.sections.action_queue.items[0].source_ref is not an allowed field"),
      true,
    );

    const mismatchedQueue = JSON.parse(JSON.stringify(snapshot));
    mismatchedQueue.operation_board.sections.action_queue.items[0] = {
      ...mismatchedQueue.operation_board.sections.action_queue.items[0],
      id: "mismatched_action",
      status: "next",
      summary: "Mismatched summary",
      rank: 2,
    };
    const mismatchValidation = validateSnapshot(mismatchedQueue);
    assert.equal(mismatchValidation.ok, false);
    assert.equal(
      mismatchValidation.errors.includes("operation_board.sections.action_queue.items[0].id must mirror next_actions[0].id"),
      true,
    );
    assert.equal(
      mismatchValidation.errors.includes("operation_board.sections.action_queue.items[0].status must mirror next_actions[0].status"),
      true,
    );
    assert.equal(
      mismatchValidation.errors.includes("operation_board.sections.action_queue.items[0].summary must mirror next_actions[0].summary"),
      true,
    );
    assert.equal(mismatchValidation.errors.includes("operation_board.sections.action_queue.items[0].rank must be 1"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("buildSnapshot exposes battle log aggregate only and mirrors it to operation board", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-battle-log-"));

  try {
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-BATTLE", "log", "events", "2026", "06"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-SECOND", "log", "events", "2026", "06"), { recursive: true });
    await writeFile(path.join(repoRoot, ".mission", "index.yaml"), ["version: v1", "entries: []"].join("\n"), "utf8");
    await writeFile(
      path.join(repoRoot, "_workmeta", "PX-BATTLE", "log", "events", "2026", "06", "battle_events.jsonl"),
      [
        JSON.stringify(
          battleEvent({
            event_id: "DO_NOT_SERIALIZE_EVENT_ID",
            occurred_at: "2026-06-01T09:00:00+09:00",
            mission_id: "DO_NOT_SERIALIZE_MISSION_ID",
            project_code: "PX-BATTLE",
            stage: "DO_NOT_SERIALIZE_STAGE",
            source_ref: "DO_NOT_SERIALIZE_SOURCE_REF",
            party_id: "DO_NOT_SERIALIZE_PARTY_ID",
            unit_id: "DO_NOT_SERIALIZE_UNIT_ID",
            automation_possibility: "manual_assist_needed",
            battle_mode: "manual_assist",
            result: "blocked",
            intervention_count: 2,
            bottleneck_reason: "quality_review_needed",
            loop_id: "DO_NOT_SERIALIZE_LOOP_ID",
            next_action_note: "DO_NOT_SERIALIZE_NEXT_ACTION_NOTE",
          }),
        ),
        "not-json",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "_workmeta", "PX-SECOND", "log", "events", "2026", "06", "battle_events.jsonl"),
      `${JSON.stringify(
        battleEvent({
          event_id: "battle-2026-06-02-0001",
          occurred_at: "2026-06-02T10:00:00+09:00",
          mission_id: "mission_second",
          project_code: "PX-SECOND",
          stage: "review",
          source_ref: "manual_log",
          party_id: "party_second",
          unit_id: "unit_second",
          automation_possibility: "low_intervention_candidate",
          battle_mode: "limited_auto",
          result: "completed",
          intervention_count: 0,
          bottleneck_reason: "none",
        }),
      )}\n`,
      "utf8",
    );

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-06-02T00:00:00.000Z" });
    const serialized = JSON.stringify(snapshot);

    assert.equal(validateSnapshot(snapshot).ok, true);
    assert.deepEqual(snapshot.battle_log, {
      source_ref: "_workmeta/*/log/events/**/battle_events.jsonl",
      event_count: 2,
      project_count_with_events: 2,
      by_result: { blocked: 1, completed: 1 },
      by_bottleneck_reason: { quality_review_needed: 1, none: 1 },
      by_battle_mode: { manual_assist: 1, limited_auto: 1 },
      by_automation_possibility: { manual_assist_needed: 1, low_intervention_candidate: 1 },
      total_intervention_count: 2,
      latest_occurred_at: "2026-06-02T10:00:00+09:00",
      projects: [
        {
          project_code: "PX-BATTLE",
          event_count: 1,
          latest_occurred_at: "2026-06-01T09:00:00+09:00",
          latest_result: "blocked",
          latest_bottleneck_reason: "quality_review_needed",
          intervention_total: 2,
        },
        {
          project_code: "PX-SECOND",
          event_count: 1,
          latest_occurred_at: "2026-06-02T10:00:00+09:00",
          latest_result: "completed",
          latest_bottleneck_reason: "none",
          intervention_total: 0,
        },
      ],
      skipped_row_count: 1,
      skipped_file_count: 0,
    });
    assert.deepEqual(snapshot.operation_board.sections.battle_log, snapshot.battle_log);
    assert.equal(snapshot.operation_board.summary.battle_log_event_count, 2);
    assert.equal(snapshot.operation_board.summary.battle_log_project_count_with_events, 2);
    assert.equal(snapshot.source_observations.items.some((item) => item.id === "battle_log_events"), true);
    for (const forbidden of [
      "DO_NOT_SERIALIZE_EVENT_ID",
      "DO_NOT_SERIALIZE_MISSION_ID",
      "DO_NOT_SERIALIZE_SOURCE_REF",
      "DO_NOT_SERIALIZE_NEXT_ACTION_NOTE",
      "DO_NOT_SERIALIZE_PARTY_ID",
      "DO_NOT_SERIALIZE_UNIT_ID",
      "DO_NOT_SERIALIZE_LOOP_ID",
      "DO_NOT_SERIALIZE_STAGE",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }

    const drifted = JSON.parse(JSON.stringify(snapshot));
    drifted.operation_board.sections.battle_log.event_count = 99;
    drifted.operation_board.summary.battle_log_event_count = 99;
    const driftValidation = validateSnapshot(drifted);
    assert.equal(driftValidation.ok, false);
    assert.equal(driftValidation.errors.includes("operation_board.sections.battle_log must mirror battle_log"), true);
    assert.equal(
      driftValidation.errors.includes("operation_board.summary.battle_log_event_count must equal battle_log.event_count (2)"),
      true,
    );

    const forbiddenFieldDrift = JSON.parse(JSON.stringify(snapshot));
    forbiddenFieldDrift.battle_log.event_id = "DO_NOT_SERIALIZE_EVENT_ID";
    forbiddenFieldDrift.battle_log.projects[0].source_ref = "DO_NOT_SERIALIZE_SOURCE_REF";
    const forbiddenFieldValidation = validateSnapshot(forbiddenFieldDrift);
    assert.equal(forbiddenFieldValidation.ok, false);
    assert.equal(forbiddenFieldValidation.errors.includes("battle_log.event_id is not an allowed field"), true);
    assert.equal(forbiddenFieldValidation.errors.includes("battle_log.projects[0].source_ref is not an allowed field"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("validateSnapshot rejects operation board projection count drift", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-operation-board-counts-"));

  try {
    await writeKnowledgeLanePublicSurface(repoRoot);
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workspaces", "PX-SYNTHETIC"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-SYNTHETIC"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "synthetic_inbox"), { recursive: true });
    await writeFile(
      path.join(repoRoot, ".mission", "index.yaml"),
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_blocked_synthetic",
        "    title: Blocked synthetic mission",
        "    status: blocked",
        "    readiness_status: blocked",
        "    project_code: PX-SYNTHETIC",
        "  - mission_id: mission_ready_synthetic",
        "    title: Ready synthetic mission",
        "    status: held",
        "    readiness_status: ready",
        "    project_code: PX-SYNTHETIC",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "synthetic_inbox", "monsters.json"),
      JSON.stringify(
        {
          monsters: [
            {
              monster_id: "monster_blocked_synthetic",
              monster_family: "dragon",
              objective: "Synthetic blocked monster",
              due_state: "no_due",
              known_status: "known",
              assignment_status: "blocked",
            },
            {
              monster_id: "monster_due_synthetic",
              monster_family: "dragon",
              objective: "Synthetic due-watch monster",
              due_state: "scheduled",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-05-05T00:00:00.000Z" });
    assert.equal(validateSnapshot(snapshot).ok, true);

    const drifted = JSON.parse(JSON.stringify(snapshot));
    drifted.operation_board.summary.project_count = 99;
    drifted.operation_board.summary.workspace_project_count = 99;
    drifted.operation_board.summary.workmeta_project_count = 99;
    drifted.operation_board.summary.mission_count = 99;
    drifted.operation_board.summary.blocked_mission_count = 99;
    drifted.operation_board.summary.ready_mission_count = 99;
    drifted.operation_board.summary.pending_monster_count = 99;
    drifted.operation_board.summary.blocked_monster_count = 99;
    drifted.operation_board.summary.due_watch_monster_count = 99;
    drifted.operation_board.summary.next_action_count = 99;
    drifted.operation_board.sections.mission_board.counts_by_display_group.blocked = 99;
    drifted.operation_board.sections.monster_gate.count = 99;
    drifted.operation_board.sections.monster_gate.groups[0].total = 99;

    const validation = validateSnapshot(drifted);
    assert.equal(validation.ok, false);
    assert.equal(validation.errors.includes("operation_board.summary.project_count must equal projects.length (1)"), true);
    assert.equal(
      validation.errors.includes("operation_board.summary.workspace_project_count must equal projects with workspace.present count (1)"),
      true,
    );
    assert.equal(
      validation.errors.includes("operation_board.summary.workmeta_project_count must equal projects with workmeta.present count (1)"),
      true,
    );
    assert.equal(validation.errors.includes("operation_board.summary.mission_count must equal missions.items.length (2)"), true);
    assert.equal(
      validation.errors.includes(
        "operation_board.summary.blocked_mission_count must equal mission_board.items blocked display_group count (1)",
      ),
      true,
    );
    assert.equal(
      validation.errors.includes(
        "operation_board.summary.ready_mission_count must equal mission_board.items ready display_group count (1)",
      ),
      true,
    );
    assert.equal(
      validation.errors.includes("operation_board.summary.pending_monster_count must equal gateway.pending_monsters.count (2)"),
      true,
    );
    assert.equal(
      validation.errors.includes(
        "operation_board.summary.blocked_monster_count must equal gateway.pending_monsters.by_display_group.blocked (1)",
      ),
      true,
    );
    assert.equal(
      validation.errors.includes(
        "operation_board.summary.due_watch_monster_count must equal gateway.pending_monsters.by_display_group.due_watch (1)",
      ),
      true,
    );
    assert.equal(validation.errors.includes("operation_board.summary.next_action_count must equal next_actions.length (4)"), true);
    assert.equal(
      validation.errors.includes(
        "operation_board.sections.mission_board.counts_by_display_group.blocked must equal mission_board.items display_group count (1)",
      ),
      true,
    );
    assert.equal(
      validation.errors.includes("operation_board.sections.monster_gate.count must equal gateway.pending_monsters.count (2)"),
      true,
    );
    assert.equal(
      validation.errors.includes(
        "operation_board.sections.monster_gate.groups[0].total must equal gateway.pending_monsters.by_display_group.blocked (1)",
      ),
      true,
    );
    assert.equal(
      validation.errors.includes(
        "operation_board.sections.monster_gate.groups[0].total must equal operation_board.sections.monster_gate.groups[0].items.length (1)",
      ),
      true,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("validateSnapshot rejects dungeon map row projection drift", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-dungeon-map-row-"));

  try {
    await writeKnowledgeLanePublicSurface(repoRoot);
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workspaces", "PX-ALPHA"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workspaces", "PX-BETA"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-ALPHA", "bindings"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-ALPHA", "reports", "onboarding"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-ALPHA", "reports", "procedure_capture"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-BETA"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "dungeon_map_inbox"), { recursive: true });
    await writeFile(
      path.join(repoRoot, ".mission", "index.yaml"),
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_alpha_blocked",
        "    title: Alpha blocked mission",
        "    status: blocked",
        "    readiness_status: blocked",
        "    project_code: PX-ALPHA",
        "  - mission_id: mission_alpha_ready",
        "    title: Alpha ready mission",
        "    status: held",
        "    readiness_status: ready",
        "    project_code: PX-ALPHA",
        "  - mission_id: mission_beta_blocked",
        "    title: Beta blocked mission",
        "    status: blocked",
        "    readiness_status: blocked",
        "    project_code: PX-BETA",
      ].join("\n"),
      "utf8",
    );
    await writeFile(path.join(repoRoot, "_workmeta", "PX-ALPHA", "contract.yaml"), "project_code: PX-ALPHA\n", "utf8");
    await writeFile(path.join(repoRoot, "_workmeta", "PX-ALPHA", "bindings", "mailbox.yaml"), "kind: synthetic\n", "utf8");
    await writeFile(path.join(repoRoot, "_workmeta", "PX-ALPHA", "bindings", "calendar.yaml"), "kind: synthetic\n", "utf8");
    await writeFile(
      path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "dungeon_map_inbox", "monsters.json"),
      JSON.stringify(
        {
          monsters: [
            {
              monster_id: "monster_alpha_blocked",
              monster_family: "dragon",
              objective: "Alpha blocked synthetic monster",
              due_state: "no_due",
              known_status: "known",
              assignment_status: "blocked",
              assigned_project_code: "PX-ALPHA",
            },
            {
              monster_id: "monster_alpha_pending",
              monster_family: "dragon",
              objective: "Alpha assigned synthetic monster",
              due_state: "no_due",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
              assigned_project_code: "PX-ALPHA",
            },
            {
              monster_id: "monster_beta_pending",
              monster_family: "dragon",
              objective: "Beta assigned synthetic monster",
              due_state: "no_due",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
              assigned_project_code: "PX-BETA",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-05-06T00:00:00.000Z" });
    assert.equal(validateSnapshot(snapshot).ok, true);
    assert.deepEqual(
      snapshot.operation_board.sections.dungeon_map.items.map((item) => item.project_code),
      ["PX-ALPHA", "PX-BETA"],
    );
    assert.deepEqual(snapshot.operation_board.sections.dungeon_map.items[0], {
      project_code: "PX-ALPHA",
      workspace_present: true,
      workmeta_present: true,
      contract_present: true,
      bindings_count: 2,
      report_surface_count: 2,
      mission_count: 2,
      blocked_mission_count: 1,
      pending_monster_count: 2,
      surface_status: "ready",
    });

    const extraFieldDrift = JSON.parse(JSON.stringify(snapshot));
    extraFieldDrift.operation_board.sections.dungeon_map.items[0].raw_payload_ref = "synthetic_raw_payload_ref";
    const extraFieldValidation = validateSnapshot(extraFieldDrift);
    assert.equal(extraFieldValidation.ok, false);
    assert.equal(
      extraFieldValidation.errors.includes("operation_board.sections.dungeon_map.items[0].raw_payload_ref is not an allowed field"),
      true,
    );

    const lengthDrift = JSON.parse(JSON.stringify(snapshot));
    lengthDrift.operation_board.sections.dungeon_map.items.pop();
    const lengthValidation = validateSnapshot(lengthDrift);
    assert.equal(lengthValidation.ok, false);
    assert.equal(
      lengthValidation.errors.includes("operation_board.sections.dungeon_map.items length must equal projects.length (2)"),
      true,
    );

    const rowDrift = JSON.parse(JSON.stringify(snapshot));
    rowDrift.operation_board.sections.dungeon_map.items[0] = {
      project_code: "PX-DRIFT",
      workspace_present: false,
      workmeta_present: false,
      contract_present: false,
      bindings_count: 99,
      report_surface_count: 99,
      mission_count: 99,
      blocked_mission_count: 99,
      pending_monster_count: 99,
      surface_status: "missing",
    };
    const rowValidation = validateSnapshot(rowDrift);
    assert.equal(rowValidation.ok, false);
    assert.equal(
      rowValidation.errors.includes("operation_board.sections.dungeon_map.items project_code set must match projects project_code set"),
      true,
    );
    assert.equal(
      rowValidation.errors.includes("operation_board.sections.dungeon_map.items[0].project_code must mirror projects[0].project_code (PX-ALPHA)"),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.dungeon_map.items[0].workspace_present must mirror Boolean(projects[0].workspace.present) (true)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.dungeon_map.items[0].workmeta_present must mirror Boolean(projects[0].workmeta.present) (true)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.dungeon_map.items[0].contract_present must mirror Boolean(projects[0].workmeta.contract_present) (true)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes("operation_board.sections.dungeon_map.items[0].bindings_count must mirror projects[0].workmeta.bindings_count (2)"),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.dungeon_map.items[0].report_surface_count must mirror projects[0].workmeta.report_surfaces length (2)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes("operation_board.sections.dungeon_map.items[0].mission_count must mirror missions.items project_code count (2)"),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.dungeon_map.items[0].blocked_mission_count must mirror missions.items project_code blocked display_group count (1)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.dungeon_map.items[0].pending_monster_count must mirror gateway.pending_monsters.items assigned_project_code count (2)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.dungeon_map.items[0].surface_status must mirror classifyProjectSurfaceStatus(projects[0]) (ready)",
      ),
      true,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("validateSnapshot rejects mission board row projection drift", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-mission-board-row-"));

  try {
    await writeKnowledgeLanePublicSurface(repoRoot);
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, ".mission", "mission_blocked_beta"), { recursive: true });
    await writeFile(
      path.join(repoRoot, ".mission", "index.yaml"),
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_ready_alpha",
        "    title: Ready alpha mission",
        "    status: held",
        "    readiness_status: ready",
        "    project_code: PX-ALPHA",
        "    workflow_id: workflow_ready_alpha",
        "    party_id: party_ready_alpha",
        "  - mission_id: mission_active_beta",
        "    title: Active beta mission",
        "    status: started",
        "    readiness_status: held",
        "    project_code: PX-BETA",
        "    party_id: party_active_beta",
        "  - mission_id: mission_blocked_beta",
        "    title: Blocked beta mission",
        "    status: blocked",
        "    readiness_status: blocked",
        "    project_code: PX-BETA",
        "    workflow_id: workflow_blocked_beta",
        "    party_id: party_blocked_beta",
        "  - mission_id: mission_completed_alpha",
        "    title: Completed alpha mission",
        "    status: completed",
        "    readiness_status: completed",
        "    project_code: PX-ALPHA",
        "  - mission_id: mission_other_gamma",
        "    title: Other gamma mission",
        "    status: candidate",
        "    readiness_status: waiting",
        "    project_code: PX-GAMMA",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, ".mission", "mission_blocked_beta", "readiness.yaml"),
      [
        "status: blocked",
        "terminal_provenance:",
        "  closed_via: mission_close",
        "  closed_at: 2026-05-07T09:00:00+09:00",
        "  terminal_result: blocked",
        "  run_id: DO_NOT_SERIALIZE_RUN_ID_001",
        "  battle_event_id: DO_NOT_SERIALIZE_BATTLE_EVENT_ID_001",
      ].join("\n"),
      "utf8",
    );

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-05-07T00:00:00.000Z" });
    const serialized = JSON.stringify(snapshot);
    assert.equal(validateSnapshot(snapshot).ok, true);
    assert.equal(serialized.includes("DO_NOT_SERIALIZE_RUN_ID_001"), false);
    assert.equal(serialized.includes("DO_NOT_SERIALIZE_BATTLE_EVENT_ID_001"), false);
    assert.equal(snapshot.missions.items[1].mission_id, "mission_blocked_beta");
    assert.equal(snapshot.missions.items[1].terminal_provenance_present, true);
    assert.equal(snapshot.missions.items[1].terminal_provenance_complete, true);
    assert.equal(snapshot.missions.items[1].terminal_provenance_closed_via_mission_close, true);
    assert.equal(snapshot.missions.items[1].terminal_result_matches_readiness, true);
    assert.equal(snapshot.missions.items[1].run_pointer_present, true);
    assert.equal(snapshot.missions.items[1].battle_event_pointer_present, true);
    assert.deepEqual(
      snapshot.operation_board.sections.mission_board.items.map((item) => item.mission_id),
      [
        "mission_blocked_beta",
        "mission_ready_alpha",
        "mission_active_beta",
        "mission_completed_alpha",
        "mission_other_gamma",
      ],
    );
    assert.deepEqual(snapshot.operation_board.sections.mission_board.items[0], {
      mission_id: "mission_blocked_beta",
      title: "Blocked beta mission",
      project_code: "PX-BETA",
      status: "blocked",
      readiness_status: "blocked",
      workflow_id_present: true,
      party_id: "party_blocked_beta",
      terminal_provenance_present: true,
      terminal_provenance_complete: true,
      terminal_provenance_closed_via_mission_close: true,
      terminal_result_matches_readiness: true,
      run_pointer_present: true,
      battle_event_pointer_present: true,
      display_group: "blocked",
      display_group_label: "Blocked",
      display_group_rank: 10,
    });
    assert.equal(
      snapshot.operation_board.sections.mission_board.items[0].terminal_provenance_present,
      snapshot.missions.items[1].terminal_provenance_present,
    );
    assert.equal(
      snapshot.operation_board.sections.mission_board.items[0].run_pointer_present,
      snapshot.missions.items[1].run_pointer_present,
    );

    const extraFieldDrift = JSON.parse(JSON.stringify(snapshot));
    extraFieldDrift.operation_board.sections.mission_board.items[0].source_ref = "synthetic_source_ref";
    const extraFieldValidation = validateSnapshot(extraFieldDrift);
    assert.equal(extraFieldValidation.ok, false);
    assert.equal(
      extraFieldValidation.errors.includes("operation_board.sections.mission_board.items[0].source_ref is not an allowed field"),
      true,
    );

    const lengthDrift = JSON.parse(JSON.stringify(snapshot));
    lengthDrift.operation_board.sections.mission_board.items.pop();
    const lengthValidation = validateSnapshot(lengthDrift);
    assert.equal(lengthValidation.ok, false);
    assert.equal(
      lengthValidation.errors.includes("operation_board.sections.mission_board.items length must equal missions.items.length (5)"),
      true,
    );

    const idSetDrift = JSON.parse(JSON.stringify(snapshot));
    idSetDrift.operation_board.sections.mission_board.items[0].mission_id = "mission_drift";
    const idSetValidation = validateSnapshot(idSetDrift);
    assert.equal(idSetValidation.ok, false);
    assert.equal(
      idSetValidation.errors.includes("operation_board.sections.mission_board.items mission_id set must match missions.items mission_id set"),
      true,
    );

    const rowDrift = JSON.parse(JSON.stringify(snapshot));
    rowDrift.operation_board.sections.mission_board.items[0] = {
      ...rowDrift.operation_board.sections.mission_board.items[0],
      title: "Drifted title",
      project_code: "PX-DRIFT",
      status: "held",
      readiness_status: "ready",
      workflow_id_present: false,
      party_id: "party_drift",
      terminal_provenance_present: false,
      terminal_provenance_complete: false,
      terminal_provenance_closed_via_mission_close: false,
      terminal_result_matches_readiness: false,
      run_pointer_present: false,
      battle_event_pointer_present: false,
      display_group: "ready",
      display_group_label: "Ready",
      display_group_rank: 20,
    };
    const rowValidation = validateSnapshot(rowDrift);
    assert.equal(rowValidation.ok, false);
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].title must mirror missions.items Mission Board projection[0].title (Blocked beta mission)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].project_code must mirror missions.items Mission Board projection[0].project_code (PX-BETA)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].status must mirror missions.items Mission Board projection[0].status (blocked)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].readiness_status must mirror missions.items Mission Board projection[0].readiness_status (blocked)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].workflow_id_present must mirror missions.items Mission Board projection[0].workflow_id_present (true)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].party_id must mirror missions.items Mission Board projection[0].party_id (party_blocked_beta)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].terminal_provenance_present must mirror missions.items Mission Board projection[0].terminal_provenance_present (true)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].run_pointer_present must mirror missions.items Mission Board projection[0].run_pointer_present (true)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].display_group must mirror missions.items Mission Board projection[0].display_group (blocked)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].display_group_label must mirror missions.items Mission Board projection[0].display_group_label (Blocked)",
      ),
      true,
    );
    assert.equal(
      rowValidation.errors.includes(
        "operation_board.sections.mission_board.items[0].display_group_rank must mirror missions.items Mission Board projection[0].display_group_rank (10)",
      ),
      true,
    );

    const statusCountDrift = JSON.parse(JSON.stringify(snapshot));
    statusCountDrift.operation_board.sections.mission_board.counts_by_status.blocked = 99;
    const statusCountValidation = validateSnapshot(statusCountDrift);
    assert.equal(statusCountValidation.ok, false);
    assert.equal(
      statusCountValidation.errors.includes(
        "operation_board.sections.mission_board.counts_by_status.blocked must equal missions.counts status count (1)",
      ),
      true,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("knowledge_lane keeps public surfaces separate from metadata evidence and rejects stronger claims", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-knowledge-claim-"));

  try {
    await writeKnowledgeLanePublicSurface(repoRoot);
    await mkdir(path.join(repoRoot, "_workmeta", "system", "reports", "knowledge_access"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "_workmeta", "system", "reports", "knowledge_access", "notebooklm_session.json"),
      "DO_NOT_LEAK_NOTEBOOK_QUERY\n",
      "utf8",
    );

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-05-03T00:00:00.000Z" });
    assert.equal(validateSnapshot(snapshot).ok, true);
    assert.equal(snapshot.knowledge_lane.owner_gated.state, "awaiting_metadata_evidence");
    assert.equal(snapshot.knowledge_lane.evidence.present, false);
    assert.equal(snapshot.knowledge_lane.evidence.total_surface_count, 0);
    assert.equal(snapshot.knowledge_lane.evidence.counts.system_knowledge_access_present, true);
    assert.equal(snapshot.knowledge_lane.evidence.counts.system_knowledge_access_entry_count, 0);
    assert.equal(snapshot.operation_board.summary.knowledge_evidence_surface_count, 0);

    const invalidClaim = JSON.parse(JSON.stringify(snapshot));
    invalidClaim.knowledge_lane.claim_ceiling = "canon_entry";
    invalidClaim.operation_board.sections.knowledge_lane.claim_ceiling = "canon_entry";
    const invalidClaimValidation = validateSnapshot(invalidClaim);
    assert.equal(invalidClaimValidation.ok, false);
    assert.equal(invalidClaimValidation.errors.includes("knowledge_lane.claim_ceiling must be observed"), true);

    const invalidState = JSON.parse(JSON.stringify(snapshot));
    invalidState.knowledge_lane.owner_gated.state = "owner_review_required";
    invalidState.operation_board.summary.knowledge_lane_state = "owner_review_required";
    invalidState.operation_board.sections.knowledge_lane.owner_gated_state = "owner_review_required";
    const invalidStateValidation = validateSnapshot(invalidState);
    assert.equal(invalidStateValidation.ok, false);
    assert.equal(
      invalidStateValidation.errors.includes(
        "knowledge_lane.owner_gated.state must be awaiting_metadata_evidence for current blockers/evidence",
      ),
      true,
    );

    const current = await buildSnapshot({ repoRoot, generatedAt: "2026-05-03T00:01:00.000Z" });
    const strengthenedStored = JSON.parse(JSON.stringify(snapshot));
    strengthenedStored.knowledge_lane.owner_gated.state = "owner_review_required";
    strengthenedStored.knowledge_lane.evidence.present = true;
    strengthenedStored.knowledge_lane.evidence.total_surface_count = 1;
    strengthenedStored.knowledge_lane.evidence.private_surface_count = 1;
    strengthenedStored.knowledge_lane.evidence.counts.system_knowledge_access_entry_count = 1;
    strengthenedStored.knowledge_lane.blockers = strengthenedStored.knowledge_lane.blockers.filter(
      (blocker) => blocker.id !== "metadata_evidence_surface_missing",
    );
    strengthenedStored.operation_board.summary.knowledge_lane_state = "owner_review_required";
    strengthenedStored.operation_board.summary.knowledge_evidence_surface_count = 1;
    strengthenedStored.operation_board.sections.knowledge_lane.owner_gated_state = "owner_review_required";
    strengthenedStored.operation_board.sections.knowledge_lane.evidence_present = true;
    strengthenedStored.operation_board.sections.knowledge_lane.evidence_surface_count = 1;
    strengthenedStored.operation_board.sections.knowledge_lane.evidence_counts = strengthenedStored.knowledge_lane.evidence.counts;
    strengthenedStored.operation_board.sections.knowledge_lane.blockers = strengthenedStored.knowledge_lane.blockers;
    assert.equal(strengthenedStored.source_observations.fingerprint, snapshot.source_observations.fingerprint);
    assert.equal(current.source_observations.fingerprint, snapshot.source_observations.fingerprint);
    assert.equal(validateSnapshot(strengthenedStored).ok, true);
    const strengthenedFreshness = compareSnapshotFreshness(strengthenedStored, current);
    assert.equal(strengthenedFreshness.ok, false);
    assert.equal(strengthenedFreshness.stored_fingerprint, strengthenedFreshness.current_fingerprint);
    assert.equal(
      strengthenedFreshness.errors.includes(
        "stored snapshot knowledge_lane owner_gated state/blockers/evidence do not match current metadata support; regenerate it",
      ),
      true,
    );

    const freshness = compareSnapshotFreshness(invalidClaim, current);
    assert.equal(freshness.ok, false);
    assert.equal(freshness.errors.includes("stored snapshot knowledge_lane.claim_ceiling must be observed"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("buildSnapshot classifies pending monsters for operation board display", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-classified-monsters-"));

  try {
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "inbox_001"), { recursive: true });
    await writeFile(path.join(repoRoot, ".mission", "index.yaml"), ["version: v1", "entries: []"].join("\n"), "utf8");

    const openIntakeMonsters = Array.from({ length: 12 }, (_, index) => ({
      monster_id: `monster_open_${String(index + 1).padStart(3, "0")}`,
      monster_family: "dragon",
      monster_name: "green_dragon",
      objective: `Open intake fixture ${index + 1}`,
      due_state: "no_due",
      known_status: "known",
      assignment_status: "pending_dungeon_assignment",
    }));
    await writeFile(
      path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "inbox_001", "monsters.json"),
      JSON.stringify(
        {
          monsters: [
            {
              monster_id: "monster_blocked_001",
              monster_family: "dragon",
              objective: "Blocked fixture",
              due_state: "no_due",
              known_status: "known",
              assignment_status: "blocked",
            },
            {
              monster_id: "monster_due_001",
              monster_family: "dragon",
              objective: "Due fixture",
              due_state: "scheduled",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
            },
            {
              monster_id: "monster_due_002",
              monster_family: "dragon",
              objective: "Overdue fixture",
              due_state: "overdue",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
            },
            {
              monster_id: "monster_assigned_001",
              monster_family: "dragon",
              objective: "Assigned route fixture",
              due_state: "no_due",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
              assigned_project_code: "PX-001",
            },
            {
              monster_id: "monster_hint_001",
              monster_family: "dragon",
              objective: "Hinted route fixture",
              due_state: "no_due",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
              project_hints: ["PX-002"],
            },
            {
              monster_id: "monster_unknown_001",
              monster_family: "unknown_monster",
              objective: "Identification fixture",
              due_state: "no_due",
              known_status: "unknown",
              assignment_status: "pending_dungeon_assignment",
            },
            ...openIntakeMonsters,
            {
              monster_id: "monster_done_001",
              monster_family: "dragon",
              objective: "Transferred fixture",
              assignment_status: "transferred",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-05-08T00:00:00.000Z" });
    const pendingMonsters = snapshot.gateway.pending_monsters;

    assert.equal(validateSnapshot(snapshot).ok, true);
    assert.equal(pendingMonsters.count, 18);
    assert.equal(pendingMonsters.display_limit, 24);
    assert.equal(pendingMonsters.truncated, false);
    assert.equal(pendingMonsters.items.length, 18);
    assert.deepEqual(pendingMonsters.by_display_group, {
      assigned_route: 1,
      blocked: 1,
      due_watch: 2,
      needs_identification: 1,
      open_intake: 12,
      routing_hints: 1,
    });
    assert.equal(pendingMonsters.items[0].display_group, "blocked");
    assert.equal(pendingMonsters.items[0].display_group_label, "Blocked");
    assert.equal(pendingMonsters.items.every((monster) => typeof monster.display_group_rank === "number"), true);
    const monsterGateGroups = Object.fromEntries(snapshot.operation_board.sections.monster_gate.groups.map((group) => [group.id, group]));
    assert.equal(snapshot.operation_board.summary.blocked_monster_count, 1);
    assert.equal(snapshot.operation_board.summary.due_watch_monster_count, 2);
    assert.equal(snapshot.operation_board.sections.monster_gate.count, 18);
    assert.equal(monsterGateGroups.blocked.total, 1);
    assert.equal(monsterGateGroups.due_watch.total, 2);
    assert.equal(monsterGateGroups.open_intake.total, 12);
    assert.equal(monsterGateGroups.blocked.items[0].monster_id, "monster_blocked_001");
    assert.equal(monsterGateGroups.open_intake.items.length, 12);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("validateSnapshot rejects monster gate row projection drift", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-monster-gate-row-"));
  const mirrorFields = [
    "monster_id",
    "inbox_id",
    "monster_family",
    "monster_name",
    "work_pattern",
    "objective_summary",
    "due_state",
    "d_day",
    "known_status",
    "assignment_status",
    "assigned_project_code",
    "assigned_stage",
    "project_hint_count",
    "stage_hint_count",
    "mail_touch_count",
    "last_mail_role",
    "mission_ref_present",
    "display_group",
    "display_group_label",
    "display_group_rank",
  ];

  try {
    await writeKnowledgeLanePublicSurface(repoRoot);
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "monster_gate_inbox"), { recursive: true });
    await writeFile(path.join(repoRoot, ".mission", "index.yaml"), ["version: v1", "entries: []"].join("\n"), "utf8");
    await writeFile(
      path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "monster_gate_inbox", "monsters.json"),
      JSON.stringify(
        {
          monsters: [
            {
              monster_id: "monster_blocked_gate_001",
              monster_family: "dragon",
              monster_name: "red_dragon",
              work_pattern: "mail_candidate_review",
              objective: "Blocked monster gate fixture one",
              due_state: "no_due",
              d_day: "D-2",
              known_status: "known",
              assignment_status: "blocked",
              assigned_project_code: "PX-ALPHA",
              assigned_stage: "intake",
              project_hints: ["PX-ALPHA", "PX-BETA"],
              stage_hints: ["intake"],
              mail_touch_count: 3,
              last_mail_role: "reply_needed",
              mission_ref: "mission_alpha",
            },
            {
              monster_id: "monster_blocked_gate_002",
              monster_family: "dragon",
              monster_name: "blue_dragon",
              work_pattern: "mail_candidate_review",
              objective: "Blocked monster gate fixture two",
              due_state: "no_due",
              d_day: "D-1",
              known_status: "known",
              assignment_status: "blocked",
              assigned_project_code: "PX-BETA",
              assigned_stage: "routing",
              project_hints: ["PX-BETA"],
              stage_hints: ["routing", "review"],
              mail_touch_count: 2,
              last_mail_role: "new_request",
              mission_ref: "mission_beta",
            },
            {
              monster_id: "monster_due_gate_001",
              monster_family: "dragon",
              monster_name: "yellow_dragon",
              work_pattern: "deadline_watch",
              objective: "Due watch monster gate fixture",
              due_state: "scheduled",
              d_day: "D-0",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
              project_hints: ["PX-GAMMA"],
              stage_hints: ["deadline"],
              mail_touch_count: 1,
              last_mail_role: "follow_up",
              mission_ref: "mission_gamma",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-05-09T00:00:00.000Z" });
    assert.equal(validateSnapshot(snapshot).ok, true);
    assert.deepEqual(
      snapshot.operation_board.sections.monster_gate.groups.map((group) => [group.id, group.label, group.rank]),
      [
        ["blocked", "Blocked", 10],
        ["due_watch", "Due watch", 20],
        ["assigned_route", "Assigned route", 30],
        ["routing_hints", "Routing hints", 40],
        ["needs_identification", "Needs identification", 50],
        ["open_intake", "Open intake", 60],
      ],
    );
    assert.deepEqual(
      snapshot.operation_board.sections.monster_gate.groups[0].items.map((item) => item.monster_id),
      ["monster_blocked_gate_001", "monster_blocked_gate_002"],
    );

    const groupExtraFieldDrift = JSON.parse(JSON.stringify(snapshot));
    groupExtraFieldDrift.operation_board.sections.monster_gate.groups[0].raw_payload_ref = "synthetic_raw_payload_ref";
    const groupExtraFieldValidation = validateSnapshot(groupExtraFieldDrift);
    assert.equal(groupExtraFieldValidation.ok, false);
    assert.equal(
      groupExtraFieldValidation.errors.includes("operation_board.sections.monster_gate.groups[0].raw_payload_ref is not an allowed field"),
      true,
    );

    const itemExtraFieldDrift = JSON.parse(JSON.stringify(snapshot));
    itemExtraFieldDrift.operation_board.sections.monster_gate.groups[0].items[0].attachment_ref = "synthetic_attachment_ref";
    const itemExtraFieldValidation = validateSnapshot(itemExtraFieldDrift);
    assert.equal(itemExtraFieldValidation.ok, false);
    assert.equal(
      itemExtraFieldValidation.errors.includes(
        "operation_board.sections.monster_gate.groups[0].items[0].attachment_ref is not an allowed field",
      ),
      true,
    );

    const groupLengthDrift = JSON.parse(JSON.stringify(snapshot));
    groupLengthDrift.operation_board.sections.monster_gate.groups.pop();
    const groupLengthValidation = validateSnapshot(groupLengthDrift);
    assert.equal(groupLengthValidation.ok, false);
    assert.equal(
      groupLengthValidation.errors.includes(
        "operation_board.sections.monster_gate.groups length must equal PENDING_MONSTER_DISPLAY_GROUPS.length (6)",
      ),
      true,
    );

    const groupShapeDrift = JSON.parse(JSON.stringify(snapshot));
    groupShapeDrift.operation_board.sections.monster_gate.groups[0] = {
      ...groupShapeDrift.operation_board.sections.monster_gate.groups[0],
      id: "due_watch",
      label: "Due watch",
      rank: 20,
    };
    const groupShapeValidation = validateSnapshot(groupShapeDrift);
    assert.equal(groupShapeValidation.ok, false);
    assert.equal(
      groupShapeValidation.errors.includes(
        "operation_board.sections.monster_gate.groups[0].id must mirror PENDING_MONSTER_DISPLAY_GROUPS[0].id (blocked)",
      ),
      true,
    );
    assert.equal(
      groupShapeValidation.errors.includes(
        "operation_board.sections.monster_gate.groups[0].label must mirror PENDING_MONSTER_DISPLAY_GROUPS[0].label (Blocked)",
      ),
      true,
    );
    assert.equal(
      groupShapeValidation.errors.includes(
        "operation_board.sections.monster_gate.groups[0].rank must mirror PENDING_MONSTER_DISPLAY_GROUPS[0].rank (10)",
      ),
      true,
    );

    const itemOrderDrift = JSON.parse(JSON.stringify(snapshot));
    itemOrderDrift.operation_board.sections.monster_gate.groups[0].items.reverse();
    const itemOrderValidation = validateSnapshot(itemOrderDrift);
    assert.equal(itemOrderValidation.ok, false);
    assert.equal(
      itemOrderValidation.errors.includes(
        "operation_board.sections.monster_gate.groups[0].items[0].monster_id must mirror gateway.pending_monsters.items filtered by display_group blocked[0].monster_id (monster_blocked_gate_001)",
      ),
      true,
    );

    const itemFieldDrift = JSON.parse(JSON.stringify(snapshot));
    const driftedItem = itemFieldDrift.operation_board.sections.monster_gate.groups[0].items[0];
    for (const field of mirrorFields) {
      if (["project_hint_count", "stage_hint_count", "mail_touch_count", "display_group_rank"].includes(field)) {
        driftedItem[field] = 99;
      } else if (field === "mission_ref_present") {
        driftedItem[field] = false;
      } else {
        driftedItem[field] = `drift_${field}`;
      }
    }
    const itemFieldValidation = validateSnapshot(itemFieldDrift);
    assert.equal(itemFieldValidation.ok, false);
    for (const field of mirrorFields) {
      assert.equal(
        itemFieldValidation.errors.some((error) =>
          error.startsWith(
            `operation_board.sections.monster_gate.groups[0].items[0].${field} must mirror gateway.pending_monsters.items filtered by display_group blocked[0].${field}`,
          ),
        ),
        true,
        field,
      );
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("compareSnapshotFreshness detects source observation changes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-freshness-"));
  const missionIndexPath = path.join(repoRoot, ".mission", "index.yaml");
  const readinessPath = path.join(repoRoot, ".mission", "mission_001", "readiness.yaml");

  try {
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, ".mission", "mission_001"), { recursive: true });
    await writeFile(
      missionIndexPath,
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_001",
        "    title: Mission One",
        "    status: held",
        "    readiness_status: ready",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      readinessPath,
      [
        "status: ready",
        "terminal_provenance:",
        "  closed_via: mission_close",
        "  closed_at: 2026-05-02T09:00:00+09:00",
        "  terminal_result: ready",
        "  run_id: freshness_run_initial",
        "  battle_event_id: freshness_battle_initial",
      ].join("\n"),
      "utf8",
    );

    const stored = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:00:00.000Z" });
    const sameSources = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:01:00.000Z" });
    assert.equal(compareSnapshotFreshness(stored, sameSources).ok, true);

    const legacyStored = JSON.parse(JSON.stringify(stored));
    delete legacyStored.operation_board;
    const legacyFreshness = compareSnapshotFreshness(legacyStored, sameSources);
    assert.equal(legacyFreshness.ok, false);
    assert.equal(legacyFreshness.errors.includes("stored snapshot operation_board projection is missing or stale; regenerate it"), true);

    await writeFile(
      readinessPath,
      [
        "status: ready",
        "terminal_provenance:",
        "  closed_via: mission_close",
        "  closed_at: 2026-05-02T10:00:00+09:00",
        "  terminal_result: blocked",
        "  run_id: freshness_run_changed_with_longer_size",
        "  battle_event_id: freshness_battle_changed_with_longer_size",
      ].join("\n"),
      "utf8",
    );
    const changedReadinessSources = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:01:30.000Z" });
    const readinessFreshness = compareSnapshotFreshness(stored, changedReadinessSources);
    assert.equal(readinessFreshness.ok, false);
    assert.equal(readinessFreshness.changed_sources.some((source) => source.id === "mission_readiness"), true);

    await writeFile(
      missionIndexPath,
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_001",
        "    title: Mission One Updated",
        "    status: held",
        "    readiness_status: ready",
      ].join("\n"),
      "utf8",
    );

    const changedSources = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:02:00.000Z" });
    const freshness = compareSnapshotFreshness(stored, changedSources);
    assert.equal(freshness.ok, false);
    assert.equal(freshness.changed_sources.some((source) => source.id === "mission_index"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("compareSnapshotFreshness marks gateway_state stale when synthetic monsters change", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-gateway-freshness-"));
  const missionIndexPath = path.join(repoRoot, ".mission", "index.yaml");
  const monstersPath = path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "synthetic_inbox", "monsters.json");

  try {
    await mkdir(path.dirname(missionIndexPath), { recursive: true });
    await mkdir(path.dirname(monstersPath), { recursive: true });
    await writeFile(missionIndexPath, ["version: v1", "entries: []"].join("\n"), "utf8");
    await writeFile(
      monstersPath,
      JSON.stringify(
        {
          monsters: [
            {
              monster_id: "monster_gateway_freshness_001",
              monster_family: "dragon",
              objective: "Gateway freshness fixture",
              due_state: "no_due",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const stored = await buildSnapshot({ repoRoot, generatedAt: "2026-06-03T00:00:00.000Z" });
    const sameSources = await buildSnapshot({ repoRoot, generatedAt: "2026-06-03T00:01:00.000Z" });
    assert.equal(compareSnapshotFreshness(stored, sameSources).ok, true);

    await writeFile(
      monstersPath,
      JSON.stringify(
        {
          monsters: [
            {
              monster_id: "monster_gateway_freshness_001",
              monster_family: "dragon",
              objective: "Gateway freshness fixture changed",
              due_state: "scheduled",
              known_status: "known",
              assignment_status: "pending_dungeon_assignment",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const changedSources = await buildSnapshot({ repoRoot, generatedAt: "2026-06-03T00:02:00.000Z" });
    const freshness = compareSnapshotFreshness(stored, changedSources);
    assert.equal(freshness.ok, false);
    assert.equal(freshness.changed_sources.some((source) => source.id === "gateway_state"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("compareSnapshotFreshness detects battle log event file metadata changes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-battle-freshness-"));
  const eventsPath = path.join(repoRoot, "_workmeta", "PX-BATTLE", "log", "events", "2026", "06", "battle_events.jsonl");

  try {
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.dirname(eventsPath), { recursive: true });
    await writeFile(path.join(repoRoot, ".mission", "index.yaml"), ["version: v1", "entries: []"].join("\n"), "utf8");
    await writeFile(
      eventsPath,
      `${JSON.stringify(
        battleEvent({
          event_id: "battle-2026-06-01-0001",
          occurred_at: "2026-06-01T09:00:00+09:00",
          project_code: "PX-BATTLE",
        }),
      )}\n`,
      "utf8",
    );

    const stored = await buildSnapshot({ repoRoot, generatedAt: "2026-06-01T00:00:00.000Z" });
    const sameSources = await buildSnapshot({ repoRoot, generatedAt: "2026-06-01T00:01:00.000Z" });
    assert.equal(compareSnapshotFreshness(stored, sameSources).ok, true);

    await writeFile(
      eventsPath,
      [
        JSON.stringify(
          battleEvent({
            event_id: "battle-2026-06-01-0001",
            occurred_at: "2026-06-01T09:00:00+09:00",
            project_code: "PX-BATTLE",
          }),
        ),
        JSON.stringify(
          battleEvent({
            event_id: "battle-2026-06-02-0001",
            occurred_at: "2026-06-02T09:00:00+09:00",
            project_code: "PX-BATTLE",
            result: "completed_with_follow_up",
          }),
        ),
      ].join("\n"),
      "utf8",
    );

    const changedSources = await buildSnapshot({ repoRoot, generatedAt: "2026-06-01T00:02:00.000Z" });
    const freshness = compareSnapshotFreshness(stored, changedSources);
    assert.equal(freshness.ok, false);
    assert.equal(freshness.changed_sources.some((source) => source.id === "battle_log_events"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function writeKnowledgeLanePublicSurface(repoRoot) {
  await mkdir(path.join(repoRoot, "guild_hall", "knowledge_access"), { recursive: true });
  await mkdir(path.join(repoRoot, ".workflow", "knowledge_access_event_capture_v0"), { recursive: true });
  await mkdir(path.join(repoRoot, ".workflow", "sourcebound_knowledge_packet_operating_loop_v0"), { recursive: true });
  await writeFile(path.join(repoRoot, "guild_hall", "knowledge_access", "README.md"), "helper\n", "utf8");
  await writeFile(path.join(repoRoot, "guild_hall", "knowledge_access", "cli.mjs"), "export {};\n", "utf8");
  await writeFile(path.join(repoRoot, "guild_hall", "knowledge_access", "ledger.mjs"), "export {};\n", "utf8");
  await writeFile(
    path.join(repoRoot, ".workflow", "knowledge_access_event_capture_v0", "workflow.yaml"),
    "id: knowledge_access_event_capture_v0\n",
    "utf8",
  );
  await writeFile(
    path.join(repoRoot, ".workflow", "sourcebound_knowledge_packet_operating_loop_v0", "workflow.yaml"),
    "id: sourcebound_knowledge_packet_operating_loop_v0\n",
    "utf8",
  );
}

function battleEvent(overrides = {}) {
  return {
    event_id: "battle-2026-06-01-0001",
    occurred_at: "2026-06-01T09:00:00+09:00",
    mission_id: "mission_battle",
    project_code: "PX-BATTLE",
    stage: "implementation",
    source_kind: "manual",
    source_ref: "manual_battle_log",
    party_id: "party_battle",
    unit_id: "unit_battle",
    automation_possibility: "manual_assist_needed",
    battle_mode: "manual_assist",
    result: "blocked",
    intervention_count: 1,
    bottleneck_reason: "quality_review_needed",
    ...overrides,
  };
}
