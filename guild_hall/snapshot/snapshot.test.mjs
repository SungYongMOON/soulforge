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
