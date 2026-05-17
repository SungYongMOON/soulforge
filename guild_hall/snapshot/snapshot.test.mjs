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

test("compareSnapshotFreshness detects source observation changes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-snapshot-freshness-"));
  const missionIndexPath = path.join(repoRoot, ".mission", "index.yaml");

  try {
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
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

    const stored = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:00:00.000Z" });
    const sameSources = await buildSnapshot({ repoRoot, generatedAt: "2026-05-02T00:01:00.000Z" });
    assert.equal(compareSnapshotFreshness(stored, sameSources).ok, true);

    const legacyStored = JSON.parse(JSON.stringify(stored));
    delete legacyStored.operation_board;
    const legacyFreshness = compareSnapshotFreshness(legacyStored, sameSources);
    assert.equal(legacyFreshness.ok, false);
    assert.equal(legacyFreshness.errors.includes("stored snapshot operation_board projection is missing or stale; regenerate it"), true);

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
