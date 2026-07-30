import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CARD_LIMIT,
  acknowledgeFixtureTask,
  buildOwnerInboxFixture,
  selectInboxTasks
} from "./owner-inbox.mjs";

test("owner inbox: 기본 보드는 정확한 네 active 상태만 표시한다", () => {
  const fixture = buildOwnerInboxFixture();
  const selected = selectInboxTasks(fixture);
  const statuses = new Set(selected.eligible.map((task) => task.status));

  assert.deepEqual(
    [...statuses].sort(),
    ["blocked", "completed_unread", "in_progress", "review_needed"].sort()
  );
  assert.ok(selected.eligible.some((task) => task.status === "in_progress"));
  assert.ok(selected.eligible.every((task) => task.targetActive));
  assert.ok(!selected.eligible.some((task) => ["todo", "waiting", "owner_acknowledged", "archived"].includes(task.status)));
});

test("owner inbox: 완료·미확인은 초록 상태이며 확인 뒤 active에서 제외되고 이력을 보존한다", () => {
  const fixture = buildOwnerInboxFixture();
  const completed = selectInboxTasks(fixture).eligible.find((task) => task.status === "completed_unread");
  assert.ok(completed);

  const result = acknowledgeFixtureTask(fixture, {
    taskId: completed.id,
    atKst: "2026-07-31 16:11 KST",
    actor: "Owner"
  });

  assert.equal(result.error, undefined);
  assert.equal(selectInboxTasks(result.fixture).eligible.some((task) => task.id === completed.id), false);
  assert.equal(result.event.originalPointer, completed.pointer);

  const history = selectInboxTasks(result.fixture, { view: "history", query: completed.pointer });
  assert.equal(history.eligible.length, 1);
  assert.equal(history.eligible[0].status, "owner_acknowledged");
  assert.equal(history.eligible[0].events[0].originalPointer, completed.pointer);
});

test("owner inbox: 막힘은 reason/next decision과 함께 잔류한다", () => {
  const fixture = buildOwnerInboxFixture();
  const blocked = selectInboxTasks(fixture).eligible.filter((task) => task.status === "blocked");

  assert.ok(blocked.length > 0);
  assert.ok(blocked.every((task) => task.blockerReason));
  assert.ok(blocked.every((task) => task.nextDecision));
  assert.ok(selectInboxTasks(fixture).eligible.some((task) => task.id === "fixture-aurora-supply"));
});

test("owner inbox: search/project/responsibility 필터와 history recovery가 결정적이다", () => {
  const fixture = buildOwnerInboxFixture();
  const filtered = selectInboxTasks(fixture, {
    query: "인증자료",
    project: "P02",
    responsibility: "설계검토"
  });
  assert.equal(filtered.eligible.length, 1);
  assert.equal(filtered.eligible[0].id, "fixture-nebula-review");

  const history = selectInboxTasks(fixture, { view: "history", query: "archived" });
  assert.ok(history.eligible.length > 0);
  assert.ok(history.eligible.every((task) => !task.targetActive));
});

test("owner inbox scale: 10×15 responsibility와 multi TASK가 기본 표시를 폭증시키지 않는다", () => {
  const fixture = buildOwnerInboxFixture();
  assert.equal(fixture.projects.length, 10);
  assert.equal(fixture.responsibilities.length, 150);

  for (const responsibility of fixture.responsibilities) {
    const matching = fixture.tasks.filter(
      (task) =>
        task.projectCode === responsibility.projectCode &&
        task.responsibility === responsibility.responsibility &&
        task.id.includes("-R")
    );
    assert.equal(matching.length, 2);
  }

  const selected = selectInboxTasks(fixture);
  assert.ok(selected.eligible.length < fixture.tasks.length / 5);
  for (const statusGroup of Object.values(selected.grouped)) {
    assert.ok(statusGroup.visible.length <= DEFAULT_CARD_LIMIT);
    assert.equal(statusGroup.hasMore, statusGroup.total > DEFAULT_CARD_LIMIT);
  }

  const narrowed = selectInboxTasks(fixture, { project: "P03", responsibility: "시험평가" });
  assert.ok(narrowed.eligible.length <= selected.eligible.length);
});

test("owner inbox: UNKNOWN과 multi-agent fixture는 관찰 의미를 보존한다", () => {
  const fixture = buildOwnerInboxFixture();
  const unknown = fixture.tasks.find((task) => task.id === "fixture-lumen-unknown");
  const multi = fixture.tasks.find((task) => task.id === "fixture-atlas-multi-agent");

  assert.equal(unknown.agentState, "unknown");
  assert.deepEqual(unknown.providers, []);
  assert.equal(multi.agentState, "observed");
  assert.equal(multi.providers.length, 2);
  assert.ok(multi.providers.every((provider) => provider.observed));
});
