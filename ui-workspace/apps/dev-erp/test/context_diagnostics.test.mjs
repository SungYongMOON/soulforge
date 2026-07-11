import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildContextGraph } from "../src/context_graph.mjs";
import { openStore } from "../src/store.mjs";

// B9c 모양 진단 — docs/slices/B9-STEM-RIVER-VIEW.md §4.
// 원장 변경 없이 sources 실일시 + 사람 확정 item 이벤트 + completion 지식 역링크만 집계한다.
const BOM = "﻿";
const APP_SOURCE = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
const LEXICON_SOURCE = readFileSync(new URL("../src/lexicon.mjs", import.meta.url), "utf8");

function writeDiagnosticsFixture(root, project = "P99-502") {
  const dir = join(root, "_workmeta", project, "project_context");
  mkdirSync(join(dir, "summaries"), { recursive: true });
  writeFileSync(join(dir, "nodes.csv"), `${BOM}node_id,project_code,node_type,label,branch_key,status,source_id,metadata_hash,created_at,updated_at
project:${project},${project},project_trunk,${project},,active,,h,2026-07-01,2026-07-01
branch:${project}:skeleton-gate,${project},context_branch,CDR,skeleton-gate,active,,h,2026-07-01,2026-07-01
branch:${project}:closed-dead,${project},context_branch,죽은 가지,closed-dead,closed,,h,2026-07-01,2026-07-01
item:itm-dead,${project},task_candidate,죽은 가지 작업,closed-dead,done,,h,2026-07-01,2026-07-01
branch:${project}:closed-ref,${project},context_branch,참조된 가지,closed-ref,closed,,h,2026-07-01,2026-07-01
item:itm-ref,${project},task_candidate,참조된 작업,closed-ref,done,,h,2026-07-01,2026-07-01
branch:${project}:closed-kn,${project},context_branch,지식화 가지,closed-kn,closed,,h,2026-07-01,2026-07-01
item:itm-kn,${project},task_candidate,지식화 작업,closed-kn,done,,h,2026-07-01,2026-07-01
branch:${project}:open-live,${project},context_branch,진행 가지,open-live,active,,h,2026-07-01,2026-07-01
item:itm-live,${project},task_candidate,진행 작업,open-live,open,,h,2026-07-01,2026-07-01
`);
  writeFileSync(join(dir, "branches.csv"), `${BOM}branch_id,project_code,branch_key,label,branch_kind,anchor_ref,status,born_at,closed_at,updated_at
branch:${project}:skeleton-gate,${project},skeleton-gate,CDR,skeleton,gate:120_CDR,open,2026-05-01,,2026-07-01
branch:${project}:closed-dead,${project},closed-dead,죽은 가지,work,item:itm-dead,closed,2026-06-01,2026-06-07,2026-06-07
branch:${project}:closed-ref,${project},closed-ref,참조된 가지,work,item:itm-ref,closed,2026-06-08,2026-06-12,2026-06-12
branch:${project}:closed-kn,${project},closed-kn,지식화 가지,work,item:itm-kn,closed,2026-06-15,2026-06-20,2026-06-20
branch:${project}:open-live,${project},open-live,진행 가지,work,item:itm-live,open,2026-06-15,,2026-06-21
`);
  writeFileSync(join(dir, "sources.csv"), `${BOM}source_id,project_code,source_kind,external_ref,source_time,title,branch_key,branch_ref,suggested_branch_ref,summary_hint,pointer_ref,metadata_hash,body_access,created_at,updated_at
s-dead-in,${project},mail,mailcsv:key-dead-in,2026-06-02 09:00:00,첫 요청,closed-dead,branch:${project}:closed-dead,,,,h,metadata_only,2026-07-09,2026-07-09
s-dead-out,${project},mail,mailcsv:key-dead-out,2026-06-05 17:00:00,회신,closed-dead,branch:${project}:closed-dead,,,,h,metadata_only,2026-07-09,2026-07-09
s-ref-in,${project},mail,mailcsv:key-ref-in,2026-06-09 09:00:00,추가 요청,closed-ref,branch:${project}:closed-ref,,,,h,metadata_only,2026-07-09,2026-07-09
s-ref-origin,${project},document,doc:shared,2026-06-09 11:00:00,공유 자료 원사용,closed-ref,branch:${project}:closed-ref,,,,h,metadata_only,2026-07-09,2026-07-09
s-ref-reuse,${project},document,doc:shared,2026-06-18 11:00:00,공유 자료 후속사용,open-live,branch:${project}:open-live,,,,h,metadata_only,2026-07-09,2026-07-09
s-kn-in,${project},mail,mailcsv:key-kn-in,2026-06-16 09:00:00,지식 요청,closed-kn,branch:${project}:closed-kn,,,,h,metadata_only,2026-07-09,2026-07-09
s-old,${project},manual,manual:old,2024-01-03 09:00:00,오래된 기록,open-live,branch:${project}:open-live,,,,h,metadata_only,2026-07-09,2026-07-09
s-offset,${project},manual,manual:offset,2026-06-07T16:30:00Z,서울 월요일 기록,open-live,branch:${project}:open-live,,,,h,metadata_only,2026-07-09,2026-07-09
`);
  writeFileSync(join(dir, "edges.csv"), `${BOM}edge_id,project_code,from_node_id,to_node_id,edge_type,source_id,confidence,reason,created_at,updated_at
`);
  writeFileSync(join(dir, "occurrences.csv"), `${BOM}occurrence_id,project_code,series_key,occurrence_key,branch_ref,source_count,spawned_item_refs,created_at,updated_at
`);
  return dir;
}

function seededStore(project = "P99-502") {
  const store = openStore(":memory:");
  store.upsertProject({ id: project, title: "진단 검증", data_label: "synthetic" });
  for (const [id, title, assignee, status] of [
    ["itm-dead", "죽은 가지 작업", "김담당", "done"],
    ["itm-ref", "참조된 작업", "박담당", "done"],
    ["itm-kn", "지식화 작업", "김담당", "done"],
    ["itm-live", "진행 작업", "이담당", "open"],
  ]) store.upsertItem({ id, project_id: project, title, assignee_ref: assignee, status, data_label: "synthetic" });

  store.ingestMail({ id: `${project}:key-dead-in`, project_code: project, at: "2026-06-02 09:12:00", subject: "첫 요청", counterpart: "고객A", direction: "in", data_label: "synthetic" });
  store.ingestMail({ id: `${project}:key-dead-out`, project_code: project, at: "2026-06-05 17:20:00", subject: "회신", counterpart: "고객A", direction: "out", data_label: "synthetic" });
  store.ingestMail({ id: `${project}:key-ref-in`, project_code: project, at: "2026-06-09 09:10:00", subject: "추가 요청", counterpart: "고객A", direction: "in", data_label: "synthetic" });
  store.ingestMail({ id: `${project}:key-kn-in`, project_code: project, at: "2026-06-16 09:30:00", subject: "지식 요청", counterpart: "고객B", direction: "in", data_label: "synthetic" });

  for (const [at, actor, kind, item, to] of [
    ["2026-06-03T01:00:00.000Z", "김담당", "item_create", "itm-dead", "죽은 가지 작업"],
    ["2026-06-10T01:00:00.000Z", "박담당", "item_status", "itm-ref", "done"],
    ["2026-06-17T01:00:00.000Z", "김담당", "item_status", "itm-kn", "done"],
    ["2026-06-18T01:00:00.000Z", "이담당", "item_assign", "itm-live", "이담당"],
  ]) store.appendEvent({ at, actor_ref: actor, actor_kind: "human", kind, item_ref: item, to, project_ref: project, used_refs: [], data_label: "synthetic" });

  store.db.prepare("INSERT INTO completion_log(item_id,title,assignee_ref,project_id,done_at,completed_by,created_at) VALUES(?,?,?,?,?,?,?)")
    .run("itm-ref", "참조된 작업", "박담당", project, "2026-06-10T01:00:00.000Z", "박담당", "2026-06-10T01:00:00.000Z");
  store.db.prepare("INSERT INTO completion_log(item_id,title,assignee_ref,project_id,done_at,completed_by,created_at) VALUES(?,?,?,?,?,?,?)")
    .run("itm-kn", "지식화 작업", "김담당", project, "2026-06-17T01:00:00.000Z", "김담당", "2026-06-17T01:00:00.000Z");
  store.upsertKnowledge({ id: "kn-itm-kn", title: "완료 지식", source_ref: "completion:itm-kn", data_label: "synthetic" });
  store.upsertProject({ id: "P88-001", title: "다른 과제", data_label: "synthetic" });
  store.ingestMail({ id: "P88-001:key-dead-in", project_code: "P88-001", at: "2025-01-01 00:00:00", subject: "다른 과제 동명이력키", counterpart: "혼입금지", direction: "in", data_label: "synthetic" });
  return store;
}

test("B9c diagnostics: 죽은 가지·주간 밀도·사람별 분포·수신 요청 패턴을 읽기전용 파생", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-diag-"));
  try {
    writeDiagnosticsFixture(root);
    const store = seededStore();
    const before = store.counts().events;
    const calls = {};
    for (const name of ["mailByHistoryKeys", "eventsForItems", "completionsForItems", "itemAssigneesForItems", "knowledgePromotionsForItems"]) {
      const original = store[name].bind(store);
      store[name] = (...args) => { calls[name] = (calls[name] ?? 0) + 1; return original(...args); };
    }
    const g = buildContextGraph(root, "P99-502", { store });
    const d = g.diagnostics;

    assert.equal(d.schema, "dev_erp.context_diagnostics.v1");
    assert.equal(d.content_policy, "metadata_only");
    assert.equal(d.read_only, true);
    assert.equal(d.basis.timezone, "Asia/Seoul");
    assert.equal(d.coverage.store_join, true);
    assert.deepEqual({ shown: d.coverage.graph_nodes_shown, total: d.coverage.graph_nodes_total }, { shown: 10, total: 10 });
    assert.deepEqual({ shown: d.coverage.branch_inputs_shown, total: d.coverage.branch_inputs_total }, { shown: 4, total: 4 });
    assert.deepEqual({ shown: d.coverage.source_inputs_shown, total: d.coverage.source_inputs_total }, { shown: 8, total: 8 });
    assert.equal(d.shape.branch_count, 4, "골격은 진단 가지 수에서 제외");
    assert.equal(d.shape.closed_count, 3);
    assert.equal(d.shape.open_count, 1);
    assert.deepEqual(d.dead_branches.map((b) => b.branch_key), ["closed-dead"]);
    assert.equal(d.branch_signals.find((b) => b.branch_key === "closed-ref").reference_count, 1, "종결 뒤 같은 source ref 후속 사용");
    assert.equal(d.branch_signals.find((b) => b.branch_key === "closed-dead").followup_state, "no_followup_observed");
    assert.equal(d.branch_signals.find((b) => b.branch_key === "closed-kn").knowledge_count, 1);

    assert.equal(d.shape.point_count, 12, "source 8점 + 사람 확정 이벤트 4점(완료 로그 중복 제외)");
    assert.equal(d.heatmap.total_points, 12);
    assert.equal(d.heatmap.shown_points, 11, "최근 52주 밖 1점은 합계에는 남고 셀에서는 생략");
    assert.equal(d.heatmap.truncated, true);
    assert.deepEqual(d.heatmap.weeks.filter((w) => w.count).map((w) => [w.week, w.count]), [
      ["2026-06-01", 3], ["2026-06-08", 4], ["2026-06-15", 4],
    ]);
    assert.deepEqual({ mail_sources: d.coverage.mail_sources, mail_joined: d.coverage.mail_joined, mail_unresolved: d.coverage.mail_unresolved },
      { mail_sources: 4, mail_joined: 4, mail_unresolved: 0 });

    const kim = d.people.find((p) => p.person_ref === "김담당");
    assert.deepEqual(kim, { person_ref: "김담당", branch_count: 2, point_count: 2, resolved_count: 1 });
    assert.deepEqual(d.people.find((p) => p.person_ref === "박담당"), { person_ref: "박담당", branch_count: 1, point_count: 1, resolved_count: 1 });
    assert.equal(d.requests.received_count, 3);
    assert.equal(d.requests.dated_count, 3);
    assert.deepEqual(d.requests.counterparts, [
      { counterpart: "고객A", count: 2 }, { counterpart: "고객B", count: 1 },
    ]);
    assert.equal(store.counts().events, before, "진단 집계는 이벤트를 추가하지 않는다");
    assert.deepEqual(calls, { mailByHistoryKeys: 1, eventsForItems: 1, completionsForItems: 1, itemAssigneesForItems: 1, knowledgePromotionsForItems: 1 }, "branch별 N+1 없음");
    assert.equal(JSON.stringify(d).includes("body_text"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9c diagnostics: invalid core_mail.at 은 유효 source_time 으로 폴백", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-diag-bad-mail-at-"));
  try {
    writeDiagnosticsFixture(root);
    const store = seededStore();
    store.db.prepare("UPDATE core_mail SET at='not-a-date' WHERE id=?").run("P99-502:key-kn-in");
    let d = buildContextGraph(root, "P99-502", { store }).diagnostics;
    assert.equal(d.heatmap.total_points, 12);
    assert.equal(d.requests.dated_count, 3, "수신 방향은 exact mail, 날짜는 source_time 폴백");
    assert.equal(d.heatmap.weeks.find((w) => w.week === "2026-06-15").count, 4);

    store.db.prepare("UPDATE core_mail SET at='2026-02-30 09:00:00' WHERE id=?").run("P99-502:key-kn-in");
    d = buildContextGraph(root, "P99-502", { store }).diagnostics;
    assert.equal(d.heatmap.weeks.find((w) => w.week === "2026-03-02")?.count ?? 0, 0, "불가능한 달력일을 rollover 하지 않음");
    assert.equal(d.heatmap.weeks.find((w) => w.week === "2026-06-15").count, 4, "source_time 으로 폴백");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9c diagnostics: closed_at 결손·시각 없는 교차 관계는 no-followup 이 아니라 unknown", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-diag-unknown-"));
  try {
    const dir = writeDiagnosticsFixture(root);
    const branchPath = join(dir, "branches.csv");
    const withoutClosedAt = readFileSync(branchPath, "utf8").replace(
      "closed-dead,죽은 가지,work,item:itm-dead,closed,2026-06-01,2026-06-07,",
      "closed-dead,죽은 가지,work,item:itm-dead,closed,2026-06-01,,"
    );
    writeFileSync(branchPath, withoutClosedAt);
    let d = buildContextGraph(root, "P99-502", { store: seededStore() }).diagnostics;
    assert.equal(d.branch_signals.find((b) => b.branch_key === "closed-dead").followup_state, "unknown");

    writeDiagnosticsFixture(root);
    appendFileSync(join(dir, "edges.csv"), "e-unknown,P99-502,item:itm-dead,item:itm-live,related_to,s-dead-in,1,시각 없는 관계,2026-07-01,2026-07-01\n");
    d = buildContextGraph(root, "P99-502", { store: seededStore() }).diagnostics;
    const signal = d.branch_signals.find((b) => b.branch_key === "closed-dead");
    assert.equal(signal.reference_count, 0, "generator stamp를 post-close 시각으로 쓰지 않음");
    assert.equal(signal.relation_unknown_time_count, 1);
    assert.equal(signal.followup_state, "unknown");

    writeDiagnosticsFixture(root);
    const impossibleClosedAt = readFileSync(branchPath, "utf8").replace(
      "closed-dead,죽은 가지,work,item:itm-dead,closed,2026-06-01,2026-06-07,",
      "closed-dead,죽은 가지,work,item:itm-dead,closed,2026-06-01,2026-02-30,"
    );
    writeFileSync(branchPath, impossibleClosedAt);
    d = buildContextGraph(root, "P99-502", { store: seededStore() }).diagnostics;
    assert.equal(d.branch_signals.find((b) => b.branch_key === "closed-dead").followup_state, "unknown", "불가능한 종결일은 eligibility를 만들지 않음");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9c diagnostics: system item 이벤트는 사람 확정 기록 밀도에 포함하지 않음", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-diag-system-event-"));
  try {
    writeDiagnosticsFixture(root);
    const store = seededStore();
    store.appendEvent({ at: "2026-06-19T01:00:00.000Z", actor_ref: "automation", actor_kind: "system", kind: "item_assign", item_ref: "itm-live", to: "이담당", project_ref: "P99-502", used_refs: [], data_label: "synthetic" });
    const d = buildContextGraph(root, "P99-502", { store }).diagnostics;
    assert.equal(d.shape.point_count, 12);
    assert.equal(d.heatmap.weeks.find((w) => w.week === "2026-06-15").count, 4);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9c diagnostics: store 조인이 없으면 지식 0으로 단정하지 않고 죽음 판정을 유보", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-diag-nostore-"));
  try {
    writeDiagnosticsFixture(root);
    const d = buildContextGraph(root, "P99-502").diagnostics;
    assert.equal(d.coverage.store_join, false);
    assert.deepEqual(d.dead_branches, []);
    assert.equal(d.heatmap.total_points, 8, "CSV source 점은 store 없이도 집계");
    assert.equal(d.requests.received_count, 0, "방향을 추측하지 않음");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9c diagnostics: 존재하지 않는 item 참조는 exact 연결로 보지 않고 판정을 유보", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-diag-missing-item-"));
  try {
    const dir = writeDiagnosticsFixture(root);
    for (const name of ["branches.csv", "nodes.csv"]) {
      const path = join(dir, name);
      writeFileSync(path, readFileSync(path, "utf8").replaceAll("item:itm-dead", "item:missing"));
    }
    const d = buildContextGraph(root, "P99-502", { store: seededStore() }).diagnostics;
    const signal = d.branch_signals.find((b) => b.branch_key === "closed-dead");
    assert.equal(signal.dead_eligible, false);
    assert.equal(signal.followup_state, "unknown");
    assert.equal(d.coverage.item_refs_resolved, 3);
    assert.equal(d.coverage.item_refs_unresolved, 1);
    assert.deepEqual(d.dead_branches, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9c diagnostics: MAX_NODES 잘림이면 누락 연결 가능성 때문에 죽음 판정을 유보", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-diag-cap-"));
  try {
    const dir = writeDiagnosticsFixture(root);
    appendFileSync(join(dir, "nodes.csv"), Array.from({ length: 3001 }, (_, i) =>
      `actor:filler-${i},P99-502,actor,채움${i},,suggested,,h,2026-07-01,2026-07-01\n`).join(""));
    const d = buildContextGraph(root, "P99-502", { store: seededStore() });
    assert.equal(d.counts.truncated, true);
    assert.equal(d.diagnostics.coverage.dead_classification, "withheld_input_truncated");
    assert.deepEqual({ shown: d.diagnostics.coverage.graph_nodes_shown, total: d.diagnostics.coverage.graph_nodes_total }, { shown: 3000, total: 3011 });
    assert.deepEqual(d.diagnostics.dead_branches, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9c store helpers: 담당·지식 승격 조인은 item exact + 읽기전용", () => {
  const store = seededStore();
  const before = store.counts().events;
  assert.deepEqual(store.itemAssigneesForItems(["itm-dead", "itm-kn", "missing"]), [
    { id: "itm-dead", assignee_ref: "김담당" }, { id: "itm-kn", assignee_ref: "김담당" },
  ]);
  assert.deepEqual(store.knowledgePromotionsForItems(["itm-dead", "itm-kn"]), [
    { item_id: "itm-kn", knowledge_id: "kn-itm-kn" },
  ]);
  assert.equal(store.counts().events, before);
});

test("B9c scope: skeleton만 있고 operational v2(work/history)가 없으면 legacy 가지를 숨기지 않음", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-diag-legacy-"));
  try {
    const dir = join(root, "_workmeta", "P99-503", "project_context");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "nodes.csv"), `${BOM}node_id,project_code,node_type,label,branch_key,status,source_id,metadata_hash,created_at,updated_at
branch:P99-503:skeleton,P99-503,context_branch,기둥,skeleton,open,,h,2026-01-01,2026-01-01
branch:P99-503:legacy-one,P99-503,context_branch,옛 가지,legacy-one,active,,h,2026-01-01,2026-01-01
`);
    writeFileSync(join(dir, "branches.csv"), `${BOM}branch_id,project_code,branch_key,label,branch_kind,anchor_ref,status,born_at,closed_at,updated_at
branch:P99-503:skeleton,P99-503,skeleton,기둥,skeleton,gate:CDR,open,2026-01-01,,2026-01-01
branch:P99-503:legacy-one,P99-503,legacy-one,옛 가지,legacy,,active,2026-01-01,,2026-01-01
`);
    writeFileSync(join(dir, "edges.csv"), "edge_id,project_code,from_node_id,to_node_id,edge_type,source_id,confidence,reason,created_at,updated_at\n");
    writeFileSync(join(dir, "sources.csv"), "source_id,project_code,source_kind,external_ref,source_time,title,branch_key,branch_ref,suggested_branch_ref,summary_hint,pointer_ref,metadata_hash,body_access,created_at,updated_at\n");
    const d = buildContextGraph(root, "P99-503").diagnostics;
    assert.equal(d.scope.mode, "legacy_non_skeleton");
    assert.equal(d.shape.branch_count, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("B9c UI: 판정 보류는 0·없음으로 축약하지 않고 양쪽 어휘로 명시", () => {
  assert.ok(APP_SOURCE.includes("deadWithheld ? L.trunk_diag_dead_withheld : `${L.trunk_diag_dead} ${s.dead_count ?? 0}`"));
  assert.ok(APP_SOURCE.includes("deadWithheld ? `<div class=\"empty small\">${esc(L.trunk_diag_dead_withheld)}</div>` : deadRows"));
  assert.ok(APP_SOURCE.includes("capDetails.push(`${L.trunk_diag_nodes} ${cv.graph_nodes_shown}/${cv.graph_nodes_total}`)"));
  assert.ok(APP_SOURCE.includes("esc(L.trunk_diag_human_events)"));
  assert.equal(LEXICON_SOURCE.match(/trunk_diag_dead_withheld:/g)?.length, 2, "business/fantasy lexicon parity");
  assert.equal(LEXICON_SOURCE.match(/trunk_diag_nodes:/g)?.length, 2);
  assert.equal(LEXICON_SOURCE.match(/trunk_diag_sources:/g)?.length, 2);
  assert.equal(LEXICON_SOURCE.match(/trunk_diag_human_events:/g)?.length, 2);
});
