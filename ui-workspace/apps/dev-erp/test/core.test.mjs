import assert from "node:assert/strict";
import test from "node:test";

import { openStore } from "../src/store.mjs";
import { loadFixture } from "../src/fixture.mjs";
import { ingestNormalized, mapSoulforgeSnapshot } from "../src/adapter.mjs";
import { getLexicon, LEXICON } from "../src/lexicon.mjs";
import { crossSearch } from "../src/search.mjs";

function freshStore() {
  return openStore(":memory:");
}

test("store: 스키마 3구역 생성과 fixture 적재 (TEST-001)", () => {
  const store = freshStore();
  const counts = loadFixture(store);
  assert.equal(counts.projects, 3);
  assert.equal(counts.items, 30);
  assert.equal(counts.mail, 50);
  assert.equal(counts.artifacts, 30);
  assert.ok(counts.events >= 1, "ingest 이벤트가 남아야 함");
});

test("store: summary 가 프로젝트별 카운트를 만든다 (UI-001)", () => {
  const store = freshStore();
  loadFixture(store);
  const today = new Date().toISOString().slice(0, 10);
  const summary = store.summary(today);
  assert.equal(summary.length, 3);
  const prjA = summary.find((p) => p.id === "PRJ-A");
  assert.ok(prjA.open > 0);
  assert.ok(prjA.boss_open >= 1, "보스(단계 종료) 항목이 카운트되어야 함");
});

test("event_log: 라벨링 우선 원칙 — used_refs/data_label/actor_kind (INFRA-003)", () => {
  const store = freshStore();
  store.appendEvent({
    actor_ref: "p-kim", actor_kind: "human", item_ref: "IT-001", kind: "status",
    from: "open", to: "done", intervention_count: 0,
    used_refs: [".registry/skills/evidence_sift", "knowledge:cable_label_rule"],
    data_label: "real", note: "test"
  });
  const [event] = store.recentEvents(1);
  assert.equal(event.actor_kind, "human");
  assert.deepEqual(event.used_refs, [".registry/skills/evidence_sift", "knowledge:cable_label_rule"]);
  assert.equal(event.data_label, "real");
});

test("adapter: 정규화 ingest 와 불량 행 보고 (INFRA-002)", () => {
  const store = freshStore();
  const report = ingestNormalized(store, {
    projects: [{ id: "P1", title: "테스트" }, { title: "id 없음" }],
    items: [{ id: "I1", project_id: "P1", title: "할 일" }, { id: "I2" }],
    mail: [{ id: "M1", at: "2026-06-12T00:00:00Z", subject: "제목" }]
  }, { label: "real", source: "unit_test" });
  assert.equal(report.projects, 1);
  assert.equal(report.items, 1);
  assert.equal(report.mail, 1);
  assert.equal(report.skipped.length, 2);
  const [event] = store.recentEvents(1);
  assert.equal(event.kind, "ingest");
  assert.equal(event.data_label, "real");
});

test("adapter: soulforge snapshot 보수적 매핑 (INFRA-002)", () => {
  const mapped = mapSoulforgeSnapshot({
    operation_board: {
      sections: {
        dungeon_map: { rows: [{ project_code: "P26-014", title: "샘플 던전", health: "watch" }] },
        mission_board: { rows: [{ mission_id: "m1", project_code: "P26-014", title: "샘플 미션", readiness_status: "blocked" }] }
      }
    }
  });
  assert.equal(mapped.projects.length, 1);
  assert.equal(mapped.items.length, 1);
  assert.equal(mapped.items[0].status, "blocked");
});

test("lexicon: business/fantasy 키 완전 일치 (INFRA-004, TEST-003)", () => {
  const bKeys = Object.keys(LEXICON.business).sort();
  const fKeys = Object.keys(LEXICON.fantasy).sort();
  assert.deepEqual(bKeys, fKeys, "두 모드의 라벨 키가 1:1 이어야 화면이 안 깨진다");
  assert.equal(getLexicon("unknown_mode").app_title, LEXICON.business.app_title);
});

test("search: 검색 1회로 3종 묶기 (UI-005)", () => {
  const store = freshStore();
  loadFixture(store);
  const result = crossSearch(store, "PRJ-A");
  assert.ok(result.items.length > 0);
  assert.ok(result.mail.length > 0);
  assert.ok(result.artifacts.length > 0);
  const empty = crossSearch(store, "");
  assert.equal(empty.items.length, 0);
});

test("mail: 기본 90일 범위와 원문 미저장 (UI-003)", () => {
  const store = freshStore();
  loadFixture(store);
  const mail = store.mail({ days: 90 });
  assert.ok(mail.length > 0);
  for (const m of mail.slice(0, 5)) {
    assert.ok(m.subject && m.pointer_ref, "제목/포인터만 있고");
    assert.equal(m.body, undefined, "본문 컬럼 자체가 없어야 함");
  }
});
