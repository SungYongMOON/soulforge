import test from "node:test";
import assert from "node:assert/strict";

import {
  PANEL_COLLAPSE_STORAGE_KEY,
  isPanelCollapseId,
  readCollapsedPanelIds,
  setPanelCollapsed,
} from "./panel-collapse.mjs";

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      assert.equal(key, PANEL_COLLAPSE_STORAGE_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, PANEL_COLLAPSE_STORAGE_KEY);
      value = next;
    },
    value: () => value,
  };
}

test("panel collapse: 첫 방문과 손상된 저장값은 모두 펼친 상태로 복구한다", () => {
  assert.deepEqual([...readCollapsedPanelIds(memoryStorage())], []);
  assert.deepEqual([...readCollapsedPanelIds(memoryStorage("not-json"))], []);
  assert.deepEqual([...readCollapsedPanelIds(memoryStorage(JSON.stringify({ schema_version: 2, collapsed: ["owner.limits"] })))], []);
  assert.deepEqual([...readCollapsedPanelIds(memoryStorage(JSON.stringify({ schema_version: 1, collapsed: ["unknown.panel"] })))], []);
});

test("panel collapse: 고정 패널과 안전한 업무 그룹만 저장할 수 있다", () => {
  assert.equal(isPanelCollapseId("owner.limits"), true);
  assert.equal(isPanelCollapseId("system.engineering"), true);
  assert.equal(isPanelCollapseId("work.group.ax_platform"), true);
  assert.equal(isPanelCollapseId("work.group.AX"), true);
  assert.equal(isPanelCollapseId("work.group.private/path"), false);
  assert.equal(isPanelCollapseId("owner.unknown"), false);
});

test("panel collapse: 접기와 펼치기는 다른 패널 선택을 보존한다", () => {
  const storage = memoryStorage();
  assert.equal(setPanelCollapsed(storage, "owner.limits", true), true);
  assert.equal(setPanelCollapsed(storage, "work.activity", true), true);
  assert.deepEqual([...readCollapsedPanelIds(storage)], ["owner.limits", "work.activity"]);

  assert.equal(setPanelCollapsed(storage, "owner.limits", false), true);
  assert.deepEqual([...readCollapsedPanelIds(storage)], ["work.activity"]);
});

test("panel collapse: 저장소 실패와 허용되지 않은 ID는 화면 기능을 막지 않는다", () => {
  const failingStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.deepEqual([...readCollapsedPanelIds(failingStorage)], []);
  assert.equal(setPanelCollapsed(failingStorage, "owner.models", true), false);
  assert.equal(setPanelCollapsed(memoryStorage(), "private/path", true), false);
});
