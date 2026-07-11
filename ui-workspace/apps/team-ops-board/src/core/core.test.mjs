import assert from "node:assert/strict";
import test from "node:test";

import { bucketForItem, requiredNoteField, validateItem } from "./model.mjs";
import {
  addComment,
  addItem,
  emptyState,
  makeBackup,
  parseState,
  restoreBackup,
  serializeState,
  updateItem,
  upsertPerson,
  upsertProject
} from "./store.mjs";
import { CSV_BOM, exportItemsCsv, importItemsCsv, parseCsv } from "./csv.mjs";
import { baselineSummaryKo, captureBaseline, diffSinceBaseline } from "./baseline.mjs";

const AT = "2026-06-12T09:00:00+09:00";
const ACTOR = "관리자";

function seededState() {
  let state = emptyState();
  ({ state } = upsertProject(state, { at: AT, actor: ACTOR, project: { name: "게이트웨이", code: "GTW" } }));
  ({ state } = upsertProject(state, { at: AT, actor: ACTOR, project: { name: "지식운영", code: "KOP" } }));
  ({ state } = upsertPerson(state, { at: AT, actor: ACTOR, person: { name: "김지나", role: "운영" } }));
  ({ state } = upsertPerson(state, { at: AT, actor: ACTOR, person: { name: "이마르코", role: "조율" } }));
  return state;
}

test("model: blocked/waiting 필수 사유 규칙", () => {
  assert.equal(requiredNoteField("blocked"), "blockerReason");
  assert.equal(requiredNoteField("waiting"), "waitingOn");
  assert.equal(requiredNoteField("doing"), null);

  const errors = validateItem({ title: "t", status: "blocked", priority: "normal" });
  assert.ok(errors.includes("blocker_reason_required"));
});

test("model: 보드 묶음 분류", () => {
  const today = "2026-06-12";
  const weekEnd = "2026-06-18";
  assert.equal(bucketForItem({ ownerId: null, status: "todo" }, today, weekEnd), "no_owner");
  assert.equal(bucketForItem({ ownerId: "a", status: "blocked", blockerReason: "x" }, today, weekEnd), "blocked");
  assert.equal(bucketForItem({ ownerId: "a", status: "todo", dueDate: "2026-06-11" }, today, weekEnd), "today");
  assert.equal(bucketForItem({ ownerId: "a", status: "todo", dueDate: "2026-06-15" }, today, weekEnd), "due_soon");
});

test("store: 항목 생성이 감사 이벤트를 남긴다", () => {
  let state = seededState();
  const projectId = state.projects[0].id;
  const ownerId = state.people[0].id;

  const result = addItem(state, {
    at: AT,
    actor: ACTOR,
    fields: { title: "인수 기준 정리", projectId, ownerId, dueDate: "2026-06-12", nextAction: "초안 검토" }
  });

  assert.equal(result.error, undefined);
  state = result.state;
  assert.equal(state.items.length, 1);
  assert.equal(state.audit[0].kind, "create");
  assert.equal(state.items[0].lastUpdate.by, ACTOR);
});

test("store: 차단 전환은 차단 사유 없이 거부된다", () => {
  let state = seededState();
  ({ state } = addItem(state, {
    at: AT,
    actor: ACTOR,
    fields: { title: "라벨 정리", projectId: state.projects[0].id, ownerId: state.people[0].id }
  }));
  const itemId = state.items[0].id;

  const denied = updateItem(state, { at: AT, actor: ACTOR, itemId, patch: { status: "blocked" } });
  assert.equal(denied.error, "blocker_reason_required");

  const allowed = updateItem(state, {
    at: AT,
    actor: ACTOR,
    itemId,
    patch: { status: "blocked", blockerReason: "owner 확인 대기" }
  });
  assert.equal(allowed.error, undefined);
  assert.ok(allowed.changedFields.includes("status"));
  const statusEvent = allowed.state.audit.find((event) => event.field === "status");
  assert.equal(statusEvent.from, "할 일");
  assert.equal(statusEvent.to, "차단");
});

test("store: 메모 추가와 빈 메모 거부", () => {
  let state = seededState();
  ({ state } = addItem(state, {
    at: AT,
    actor: ACTOR,
    fields: { title: "메모 시험", projectId: state.projects[0].id, ownerId: state.people[0].id }
  }));
  const itemId = state.items[0].id;

  assert.equal(addComment(state, { at: AT, actor: ACTOR, itemId, message: "  " }).error, "comment_empty");

  const ok = addComment(state, { at: AT, actor: ACTOR, itemId, message: "오전 회의에서 확인" });
  assert.equal(ok.error, undefined);
  assert.equal(ok.state.items[0].comments.length, 1);
  assert.equal(ok.state.audit[0].kind, "comment");
});

test("store: 직렬화/백업/복원 왕복", () => {
  let state = seededState();
  ({ state } = addItem(state, {
    at: AT,
    actor: ACTOR,
    fields: { title: "백업 시험", projectId: state.projects[0].id, ownerId: state.people[0].id }
  }));

  const roundtrip = parseState(serializeState(state));
  assert.equal(roundtrip.error, undefined);
  assert.equal(roundtrip.state.items.length, 1);

  assert.equal(parseState("{\"schemaVersion\":\"other.v9\"}").error, "backup_schema_mismatch");
  assert.equal(parseState("not json").error, "backup_not_json");

  const backupRaw = makeBackup(state, { at: AT, actor: ACTOR });
  const restored = restoreBackup(emptyState(), { at: AT, actor: ACTOR, raw: backupRaw });
  assert.equal(restored.error, undefined);
  assert.equal(restored.state.items.length, 1);
  assert.equal(restored.state.audit[0].kind, "restore");
});

test("store: comments 없는 백업 복원 시 comments 를 빈 배열로 정규화한다", () => {
  const raw = JSON.stringify({
    schemaVersion: "team_ops_board.v1",
    items: [{ id: "it-legacy", title: "구버전 항목", status: "todo", priority: "normal" }]
  });
  const parsed = parseState(raw);
  assert.equal(parsed.error, undefined);
  assert.deepEqual(parsed.state.items[0].comments, []);

  const restored = restoreBackup(emptyState(), { at: AT, actor: ACTOR, raw });
  assert.equal(restored.error, undefined);
  const commented = addComment(restored.state, { at: AT, actor: ACTOR, itemId: "it-legacy", message: "복원 후 메모" });
  assert.equal(commented.error, undefined);
  assert.equal(commented.state.items[0].comments.length, 1);

  const badItems = parseState(JSON.stringify({ schemaVersion: "team_ops_board.v1", items: ["문자열"] }));
  assert.equal(badItems.error, "backup_items_invalid");

  const kept = parseState(JSON.stringify({
    schemaVersion: "team_ops_board.v1",
    items: [{ id: "it-keep", title: "보존", status: "todo", priority: "normal", comments: [{ at: AT, actor: ACTOR, message: "기존 메모" }] }]
  }));
  assert.equal(kept.state.items[0].comments.length, 1);
});

test("csv: 내보내기 BOM/이스케이프와 파서 왕복", () => {
  let state = seededState();
  ({ state } = addItem(state, {
    at: AT,
    actor: ACTOR,
    fields: {
      title: '쉼표, 그리고 "따옴표"\n줄바꿈',
      projectId: state.projects[0].id,
      ownerId: state.people[0].id,
      dueDate: "2026-06-13"
    }
  }));

  const csv = exportItemsCsv(state);
  assert.ok(csv.startsWith(CSV_BOM));

  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], "title");
  assert.equal(rows[1][1], '쉼표, 그리고 "따옴표"\n줄바꿈');
  assert.equal(rows[1][2], "게이트웨이");
});

test("csv: 가져오기 - id 갱신, 신규 추가, 오류 보고", () => {
  let state = seededState();
  ({ state } = addItem(state, {
    at: AT,
    actor: ACTOR,
    fields: { title: "기존 항목", projectId: state.projects[0].id, ownerId: state.people[0].id }
  }));
  const existingId = state.items[0].id;

  const raw = [
    "id,title,project,owner,status,priority,due_date,next_action,blocker_reason,waiting_on",
    `${existingId},기존 항목 갱신,게이트웨이,김지나,doing,high,2026-06-13,후속 확인,,`,
    ",새 항목,지식운영,이마르코,차단,normal,,,승인 대기,",
    ",고아 항목,없는프로젝트,김지나,todo,normal,,,,",
    ",사유 없는 차단,게이트웨이,김지나,blocked,normal,,,,"
  ].join("\r\n");

  const result = importItemsCsv(state, { raw, at: AT, actor: ACTOR });
  assert.equal(result.updated, 1);
  assert.equal(result.imported, 1);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(
    result.errors.map((entry) => entry.error).sort(),
    ["blocker_reason_required", "project_unknown"]
  );

  const updatedItem = result.state.items.find((item) => item.id === existingId);
  assert.equal(updatedItem.title, "기존 항목 갱신");
  assert.equal(updatedItem.status, "doing");

  const added = result.state.items.find((item) => item.title === "새 항목");
  assert.equal(added.status, "blocked");
  assert.equal(added.blockerReason, "승인 대기");
});

test("baseline: 기준선 고정과 이후 변경 비교", () => {
  let state = seededState();
  ({ state } = addItem(state, {
    at: AT,
    actor: ACTOR,
    fields: { title: "기준선 항목", projectId: state.projects[0].id, ownerId: state.people[0].id, dueDate: "2026-06-12" }
  }));

  state = { ...state, baseline: captureBaseline(state, { at: AT, actor: ACTOR }) };
  assert.equal(diffSinceBaseline(state).count, 0);
  assert.equal(baselineSummaryKo(diffSinceBaseline(state)), "기준선 이후 변경 없음");

  const itemId = state.items[0].id;
  ({ state } = updateItem(state, { at: AT, actor: ACTOR, itemId, patch: { status: "doing" } }));
  ({ state } = addItem(state, {
    at: AT,
    actor: ACTOR,
    fields: { title: "기준선 이후 추가", projectId: state.projects[1].id, ownerId: state.people[1].id }
  }));

  const diff = diffSinceBaseline(state);
  assert.equal(diff.count, 2);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].fields[0].field, "status");
  assert.equal(diff.changed[0].fields[0].to, "진행 중");
  assert.equal(diff.added.length, 1);
  assert.ok(baselineSummaryKo(diff).includes("변경 1"));
  assert.ok(baselineSummaryKo(diff).includes("추가 1"));
});
