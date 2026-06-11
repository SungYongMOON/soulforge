// Loop e2e test draft (2026-06-12, claude_fable-5)
//
// 목적: playable loop `monster -> mission -> battle log` 가 하나의 synthetic
// fixture repo 에서 operation board projection 까지 끊기지 않고 보이는지
// 한 테스트로 고정한다.
//
// 상태: 초안. package.json validate 스크립트에는 아직 연결하지 않았다.
// 연결(예: validate:snapshot 의 node --test 목록 추가)은 Codex 가 루프
// 슬라이스 구현과 함께 수행한다. 단독 실행:
//
//   node --test guild_hall/snapshot/loop_e2e.test.mjs
//
// triage_board / promotion projection 테스트는 계약만 있고 구현 전이므로
// test.todo 로 둔다. 계약: docs/architecture/guild_hall/TRIAGE_BOARD_V0.md

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, validateSnapshot } from "./producer.mjs";

function loopBattleEvent(overrides = {}) {
  return {
    event_id: "battle-2026-06-11-loop-0001",
    occurred_at: "2026-06-11T09:00:00+09:00",
    mission_id: "mission_loop_001",
    project_code: "PX-LOOP",
    stage: "implementation",
    source_kind: "manual",
    source_ref: "DO_NOT_LEAK_LOOP_SOURCE_REF",
    party_id: "DO_NOT_LEAK_LOOP_PARTY_ID",
    unit_id: "DO_NOT_LEAK_LOOP_UNIT_ID",
    automation_possibility: "manual_assist_needed",
    battle_mode: "manual_assist",
    result: "completed",
    intervention_count: 0,
    bottleneck_reason: "none",
    ...overrides,
  };
}

test("loop e2e draft: monster, mission, battle log stay visible on one operation board", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-loop-e2e-"));

  try {
    await mkdir(path.join(repoRoot, ".mission"), { recursive: true });
    await mkdir(path.join(repoRoot, "_workmeta", "PX-LOOP", "log", "events", "2026", "06"), { recursive: true });
    await mkdir(path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "inbox_loop"), { recursive: true });

    await writeFile(
      path.join(repoRoot, ".mission", "index.yaml"),
      [
        "version: v1",
        "entries:",
        "  - mission_id: mission_loop_001",
        "    title: Loop Mission One",
        "    status: blocked",
        "    readiness_status: blocked",
        "    project_code: PX-LOOP",
        "    party_id: guild_master_cell",
      ].join("\n"),
      "utf8",
    );
    await writeFile(path.join(repoRoot, "_workmeta", "PX-LOOP", "contract.yaml"), "display_name: DO_NOT_LEAK_LOOP_PRIVATE_NAME\n", "utf8");
    await writeFile(
      path.join(repoRoot, "_workmeta", "PX-LOOP", "log", "events", "2026", "06", "battle_events.jsonl"),
      `${JSON.stringify(loopBattleEvent())}\n`,
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, "guild_hall", "state", "gateway", "intake_inbox", "inbox_loop", "monsters.json"),
      JSON.stringify(
        {
          monsters: [
            {
              monster_id: "monster_loop_001",
              monster_family: "unknown_monster",
              monster_name: "loop_fixture_monster",
              work_pattern: "mail_candidate_review",
              objective_ko: "Loop fixture intake item.",
              due_state: "no_due",
              known_status: "unknown",
              project_hints: ["PX-LOOP"],
              stage_hints: [],
              assignment_status: "pending_dungeon_assignment",
              mail_touch_count: 1,
              last_mail_role: "new_request",
              mission_ref: null,
              source_refs: ["guild_hall/state/gateway/mailbox/company/mail/raw/fixture.jsonl#provider_message_id=DO_NOT_LEAK_LOOP_RAW_REF"],
              body_excerpt: "DO_NOT_LEAK_LOOP_BODY_EXCERPT",
              source_quote: "DO_NOT_LEAK_LOOP_SOURCE_QUOTE",
              attachment_refs: ["DO_NOT_LEAK_LOOP_ATTACHMENT_REF"],
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const snapshot = await buildSnapshot({ repoRoot, generatedAt: "2026-06-12T00:00:00.000Z" });
    const serialized = JSON.stringify(snapshot);

    // 0. snapshot 자체가 계약을 통과한다.
    assert.equal(validateSnapshot(snapshot).ok, true);

    // 1. Dungeon Map: project surface 가 보인다.
    const dungeonRow = snapshot.operation_board.sections.dungeon_map.items.find(
      (item) => item.project_code === "PX-LOOP",
    );
    assert.ok(dungeonRow, "dungeon map must show the loop project");
    assert.equal(dungeonRow.mission_count, 1);

    // 2. Mission Board: mission 이 보인다.
    const missionRow = snapshot.operation_board.sections.mission_board.items.find(
      (item) => item.mission_id === "mission_loop_001",
    );
    assert.ok(missionRow, "mission board must show the loop mission");
    assert.equal(missionRow.project_code, "PX-LOOP");

    // 3. Monster Gate: pending monster 가 group display sample 로 보인다.
    assert.equal(snapshot.gateway.pending_monsters.count, 1);
    const monsterGroups = snapshot.operation_board.sections.monster_gate.groups;
    const groupTotalSum = monsterGroups.reduce((sum, group) => sum + group.total, 0);
    assert.equal(groupTotalSum, snapshot.gateway.pending_monsters.count);
    const monsterRow = monsterGroups
      .flatMap((group) => group.items)
      .find((item) => item.monster_id === "monster_loop_001");
    assert.ok(monsterRow, "monster gate must show the pending loop monster");
    assert.equal(monsterRow.project_hint_count, 1);

    // 4. Battle Log: aggregate 가 남고 operation board 가 그대로 mirror 한다.
    assert.equal(snapshot.battle_log.event_count, 1);
    assert.equal(snapshot.battle_log.projects[0].project_code, "PX-LOOP");
    assert.equal(snapshot.battle_log.projects[0].latest_result, "completed");
    assert.deepEqual(snapshot.operation_board.sections.battle_log, snapshot.battle_log);

    // 5. Action Queue: next_actions 를 같은 순서/내용으로 mirror 한다.
    assert.equal(
      snapshot.operation_board.sections.action_queue.items.length,
      snapshot.next_actions.length,
    );
    snapshot.operation_board.sections.action_queue.items.forEach((item, index) => {
      assert.equal(item.id, snapshot.next_actions[index].id);
      assert.equal(item.status, snapshot.next_actions[index].status);
      assert.equal(item.summary, snapshot.next_actions[index].summary);
      assert.equal(item.rank, index + 1);
    });

    // 6. 경계: raw/private sentinel 이 snapshot 으로 새지 않는다.
    for (const forbidden of [
      "DO_NOT_LEAK_LOOP_PRIVATE_NAME",
      "DO_NOT_LEAK_LOOP_BODY_EXCERPT",
      "DO_NOT_LEAK_LOOP_SOURCE_QUOTE",
      "DO_NOT_LEAK_LOOP_ATTACHMENT_REF",
      "DO_NOT_LEAK_LOOP_RAW_REF",
      "DO_NOT_LEAK_LOOP_SOURCE_REF",
      "DO_NOT_LEAK_LOOP_PARTY_ID",
      "DO_NOT_LEAK_LOOP_UNIT_ID",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `${forbidden} must not leak into the snapshot`);
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test.todo("triage_board section projects INBOX register metadata only (TRIAGE_BOARD_V0 구현 후 활성화)");

test.todo("promotion candidate projection consumes battle log aggregates (roadmap 다음 후보 3 구현 후 활성화)");
