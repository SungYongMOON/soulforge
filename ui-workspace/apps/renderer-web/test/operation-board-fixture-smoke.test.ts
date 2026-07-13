import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { mapSnapshotResponse } from "../controlCenterPlugin.ts";

const fixtureUrl = new URL("../../../fixtures/operation-board/public-safe.sample.json", import.meta.url);
const snapshotPath = "guild_hall/state/snapshot/soulforge_snapshot.json";

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  assert.equal(Array.isArray(value), true);
  return value as unknown[];
}

function normalizeActionQueueItem(item: unknown) {
  const action = asRecord(item);
  return {
    id: action.id,
    status: action.status,
    summary: action.summary
  };
}

function normalizeMappedMonsterItem(item: unknown) {
  const monster = asRecord(item);
  return {
    monster_id: monster.monster_id,
    inbox_id: monster.inbox_id,
    monster_family: monster.monster_family,
    monster_name: monster.monster_name,
    work_pattern: monster.work_pattern,
    objective_summary: monster.objective_summary,
    due_state: monster.due_state,
    d_day: typeof monster.d_day === "string" && monster.d_day.trim() ? monster.d_day : null,
    known_status: monster.known_status,
    assignment_status: monster.assignment_status,
    assigned_project_code: monster.assigned_project_code,
    assigned_stage: monster.assigned_stage,
    project_hint_count: monster.project_hint_count,
    stage_hint_count: monster.stage_hint_count,
    mail_touch_count: monster.mail_touch_count,
    last_mail_role: monster.last_mail_role,
    mission_ref_present: monster.mission_ref_present,
    display_group: monster.display_group,
    display_group_label: monster.display_group_label,
    display_group_rank: monster.display_group_rank
  };
}

const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as Record<string, unknown>;
const seededOperationBoard = asRecord(fixture.operation_board);
const seededSections = asRecord(seededOperationBoard.sections);
const seededKnowledgeLane = asRecord(seededSections.knowledge_lane);
seededKnowledgeLane.latest_access_timestamp_utc = "2026-07-13T01:02:03Z";
seededKnowledgeLane.evidence_counts = {
  project_knowledge_access_entry_count: 4,
  system_knowledge_access_entry_count: 3,
  knowledge_access_retrieve_count: 2,
  knowledge_access_apply_count: 1,
  knowledge_access_substantive_use_count: 3,
  knowledge_access_useful_access_count: 5,
  knowledge_access_ledger_file_count: 2,
  knowledge_access_jsonl_row_count: 8,
  knowledge_access_invalid_event_count: 0,
  knowledge_access_duplicate_event_count: 1,
  knowledge_access_unreadable_file_count: 0
};
const response = mapSnapshotResponse(fixture, "fresh");

assert.equal(response.status, "fresh");
assert.equal(response.snapshot_path, snapshotPath);

const operationBoard = asRecord(response.operation_board);
const fixtureOperationBoard = asRecord(fixture.operation_board);
assert.equal(operationBoard.schema_version, fixtureOperationBoard.schema_version);

const sections = asRecord(operationBoard.sections);
const fixtureSections = asRecord(fixtureOperationBoard.sections);

const dungeonMap = asRecord(sections.dungeon_map);
const fixtureDungeonMap = asRecord(fixtureSections.dungeon_map);
assert.deepEqual(
  asArray(dungeonMap.items).map((item) => asRecord(item).project_code),
  asArray(fixtureDungeonMap.items).map((item) => asRecord(item).project_code)
);

const missionBoard = asRecord(sections.mission_board);
const fixtureMissionBoard = asRecord(fixtureSections.mission_board);
assert.deepEqual(missionBoard.counts_by_status, fixtureMissionBoard.counts_by_status);
assert.deepEqual(missionBoard.counts_by_display_group, fixtureMissionBoard.counts_by_display_group);
assert.deepEqual(
  asArray(missionBoard.items).map((item) => {
    const mission = asRecord(item);
    return {
      mission_id: mission.mission_id,
      readiness: mission.readiness,
      display_group: mission.display_group,
      display_group_label: mission.display_group_label,
      display_group_rank: mission.display_group_rank
    };
  }),
  asArray(fixtureMissionBoard.items).map((item) => {
    const mission = asRecord(item);
    return {
      mission_id: mission.mission_id,
      readiness: mission.readiness_status,
      display_group: mission.display_group,
      display_group_label: mission.display_group_label,
      display_group_rank: mission.display_group_rank
    };
  })
);

const monsterGate = asRecord(sections.monster_gate);
const fixtureMonsterGate = asRecord(fixtureSections.monster_gate);
assert.deepEqual(monsterGate.count, fixtureMonsterGate.count);
assert.deepEqual(monsterGate.display_limit, fixtureMonsterGate.display_limit);
assert.deepEqual(monsterGate.truncated, fixtureMonsterGate.truncated);
assert.deepEqual(
  asArray(monsterGate.groups).map((item) => {
    const group = asRecord(item);
    return {
      id: group.id,
      label: group.label,
      rank: group.rank,
      total: group.total,
      items: asArray(group.items).map(normalizeMappedMonsterItem)
    };
  }),
  asArray(fixtureMonsterGate.groups).map((item) => {
    const group = asRecord(item);
    return {
      id: group.id,
      label: group.label,
      rank: group.rank,
      total: group.total,
      items: asArray(group.items).map(normalizeMappedMonsterItem)
    };
  })
);

const knowledgeLane = asRecord(sections.knowledge_lane);
const fixtureKnowledgeLane = asRecord(fixtureSections.knowledge_lane);
assert.equal(knowledgeLane.owner_gated_state, fixtureKnowledgeLane.owner_gated_state);
assert.equal(knowledgeLane.claim_ceiling, fixtureKnowledgeLane.claim_ceiling);
assert.equal(knowledgeLane.latest_access_timestamp_utc, "2026-07-13T01:02:03Z");
assert.deepEqual(asRecord(knowledgeLane.evidence_counts), {
  project_knowledge_access_surface_count: 0,
  project_knowledge_access_entry_count: 4,
  project_procedure_capture_surface_count: 0,
  project_ontology_surface_count: 0,
  system_knowledge_access_entry_count: 3,
  knowledge_access_retrieve_count: 2,
  knowledge_access_apply_count: 1,
  knowledge_access_substantive_use_count: 3,
  knowledge_access_useful_access_count: 5,
  knowledge_access_ledger_file_count: 2,
  knowledge_access_jsonl_row_count: 8,
  knowledge_access_invalid_event_count: 0,
  knowledge_access_duplicate_event_count: 1,
  knowledge_access_unreadable_file_count: 0,
  system_procedure_capture_entry_count: 0,
  local_activity_surface_present: false,
  private_activity_mirror_present: false
});
assert.deepEqual(
  asArray(knowledgeLane.blockers).map((item) => asRecord(item).summary),
  asArray(fixtureKnowledgeLane.blockers).map((item) => asRecord(item).summary)
);

const actionQueue = asRecord(sections.action_queue);
const fixtureActionQueue = asRecord(fixtureSections.action_queue);
assert.deepEqual(asArray(actionQueue.items), asArray(fixtureActionQueue.items));
assert.deepEqual(asArray(actionQueue.items).map(normalizeActionQueueItem), asArray(response.next_actions).map(normalizeActionQueueItem));

const responseWithoutMetadataPath = { ...response, snapshot_path: "[metadata-path-checked-separately]" };
const responseJson = JSON.stringify(responseWithoutMetadataPath);
const forbiddenMarkers = ["guild_hall/state/", "_workmeta/", "_workspaces/", "private-state/"];

for (const marker of forbiddenMarkers) {
  assert.equal(responseJson.includes(marker), false, `response should not include ${marker}`);
}
