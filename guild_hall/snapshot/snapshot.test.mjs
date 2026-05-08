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
    await mkdir(path.join(repoRoot, "_workmeta", "PX-001", "reports", "onboarding"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "system", "reports", "procedure_capture"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "inbox_001"), { recursive: true });
    await mkdir(path.join(repoRoot, "private-state", ".git"), { recursive: true });

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
    await writeFile(path.join(repoRoot, "_workmeta", "system", "reports", "procedure_capture", "node_smoke.md"), "node smoke\n", "utf8");
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
    assert.equal(snapshot.operation_board.sections.dungeon_map.items[0].project_code, "PX-001");
    assert.equal(snapshot.operation_board.sections.dungeon_map.items[0].surface_status, "workspace_missing");
    assert.equal(snapshot.operation_board.sections.mission_board.items[0].display_group, "blocked");
    assert.equal(snapshot.operation_board.sections.action_queue.items.length, snapshot.next_actions.length);
    assert.equal(serialized.includes("DO_NOT_LEAK_PRIVATE_NAME"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_TOKEN"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_BODY_EXCERPT"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_SOURCE_QUOTE"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_ATTACHMENT_REF"), false);
    assert.equal(serialized.includes("DO_NOT_LEAK_RAW_REF"), false);
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
