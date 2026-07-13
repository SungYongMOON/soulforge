import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildContextLifeTree,
  CONTEXT_LIFE_TREE_CHANGE_INTERVAL_BASES,
  CONTEXT_LIFE_TREE_MAX_DAYS,
  CONTEXT_LIFE_TREE_PER_LANE_MAX,
  CONTEXT_LIFE_TREE_TOTAL_MAX,
  normalizeContextLifeTreeChangeInterval,
  parseContextLifeTreeQuery,
  projectContextLifeTreeTemporalEnvelope,
} from "../src/context_life_tree.mjs";
import {
  FILE_ACTIVITY_LIFE_TREE_PROJECTION_MAX_BYTES,
  FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA,
  readFileActivityLifeTreeProjection,
} from "../src/file_activity_life_tree_projection.mjs";
import { openStore } from "../src/store.mjs";

const BOM = "﻿";
const PROJECT = "P99-600";
const RAW_SENTINEL = "RAW_SENTINEL_SHOULD_NOT_ESCAPE";
const LOCAL_PATH_SENTINEL = ["", "synthetic-local-root", "ABSOLUTE_PATH_SHOULD_NOT_ESCAPE"].join("/");

function writeContextFixture(root, project = PROJECT) {
  const dir = join(root, "_workmeta", project, "project_context");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "branches.csv"), `${BOM}branch_id,project_code,branch_key,label,branch_kind,anchor_ref,status,born_at,closed_at,updated_at
branch:${project}:work-exact,${project},work-exact,정확 작업,work,item:itm-exact,open,2026-07-11,,2026-07-12
branch:${project}:work-mail,${project},work-mail,정확 메일,work,item:itm-mail,open,2026-07-11,,2026-07-12
branch:${project}:work-voice,${project},work-voice,음성 검토,work,item:voice-accepted,open,2026-07-11,,2026-07-12
branch:${project}:wrong-id,${project},work-corrupt,손상된 가지,work,item:itm-corrupt,open,2026-07-11,,2026-07-12
`);
  writeFileSync(join(dir, "sources.csv"), `${BOM}source_id,project_code,source_kind,external_ref,source_time,title,branch_key,branch_ref,suggested_branch_ref,summary_hint,pointer_ref,metadata_hash,body_access,created_at,updated_at
s-mail,${project},mail,mailcsv:mail-exact,2026-07-11T15:30:00Z,정확 메일,work-mail,branch:${project}:work-mail,,,,h,metadata_only,2026-07-12,2026-07-12
s-review,${project},mail,mailcsv:mail-review,2026-07-12T00:00:00+09:00,검토 메일,,,suggested:${project}:candidate,,,h,metadata_only,2026-07-12,2026-07-12
s-corrupt,${project},mail,mailcsv:mail-corrupt,2026-07-11T21:00:00Z,손상 가지 메일,work-corrupt,branch:${project}:work-corrupt,,,,h,metadata_only,2026-07-12,2026-07-12
`);
  return dir;
}

function digestId(index) {
  return Number(index).toString(16).padStart(64, "0");
}

function fileActivityProjectionEvent(index, overrides = {}) {
  const sourceKind = overrides.source_kind ?? "scanner_observation";
  const eventKind = overrides.event_kind ?? "observed";
  const sourceEventId = overrides.source_event_id
    ?? `${sourceKind === "scanner_observation" ? "obs" : "file-event"}:${digestId(index)}`;
  const observationId = sourceKind === "scanner_observation" ? sourceEventId : null;
  const transitionBasis = {
    missing_candidate: "bounded_by_node_observations",
    delete: "confirmed_absence_receipt_threshold",
    restore: "bounded_by_delete_receipt_and_primary_receipt",
  }[eventKind];
  const defaultInterval = sourceKind === "reconciler_transition"
    ? { after: "2026-07-11T23:50:00.000Z", before: "2026-07-12T00:02:00.000Z", basis: transitionBasis }
    : { after: "2026-07-11T23:50:00.000Z", before: "2026-07-12T00:00:00.000Z", basis: "bounded_by_node_observations" };
  const identityByKind = {
    file_first_observed: ["assigned", "first_exact_content_observation"],
    observed: ["observed", "same_node_path_and_exact_content"],
    touch: ["observed", "same_exact_content_with_changed_stat_hint"],
    content_revision: ["observed", "same_node_path_with_changed_exact_content"],
    rename: ["inferred", "unique_same_node_same_content_move_in_complete_listing"],
    copy: ["inferred", "same_node_source_path_retained_with_same_exact_content"],
    joined_shared_path: ["inferred", "cross_node_exact_path_with_existing_logical_file"],
    cross_node_revision_unordered: ["uncertain", "new_node_content_without_known_parent_revision"],
    ambiguous_same_content_identity: ["uncertain", "multiple_same_content_identity_candidates"],
    stale_observation: ["observed", "known_historical_revision_seen_on_node"],
    hash_pending: ["unavailable", null],
    held_packet_evidence: ["unavailable", "late_or_stale_node_sequence"],
  };
  const [identityClaim, identityBasis] = identityByKind[eventKind] ?? ["unavailable", null];
  const hasExactContent = !["hash_pending", "held_packet_evidence"].includes(eventKind)
    && sourceKind === "scanner_observation";
  const base = {
    source_event_id: sourceEventId,
    source_kind: sourceKind,
    event_kind: eventKind,
    logical_file_id: `lf:${digestId(index + 1000)}`,
    revision_id: sourceKind === "scanner_observation" ? `rev:${digestId(index + 2000)}` : null,
    node_id: "work-01",
    node_role: "work_pc",
    scan_id: `scan:${digestId(index + 3000)}`,
    packet_digest: `sha256:${digestId(index + 4000)}`,
    observation_id: observationId,
    observed_at: sourceKind === "scanner_observation" ? "2026-07-12T00:00:00.000Z" : null,
    ingested_at: sourceKind === "scanner_observation" ? "2026-07-12T00:01:00.000Z" : null,
    received_at: "2026-07-12T00:02:00.000Z",
    change_interval: defaultInterval,
    identity_claim: identityClaim,
    identity_basis: identityBasis,
    uncertainty: ["cross_node_revision_unordered", "ambiguous_same_content_identity"].includes(eventKind)
      ? "review_needed"
      : ["hash_pending", "held_packet_evidence", "missing_candidate"].includes(eventKind) ? "partial" : "confirmed",
    content_id: hasExactContent ? `sha256:${digestId(index + 5000)}` : null,
    size_bytes: sourceKind === "scanner_observation" ? 100 + index : null,
    erp_upload_event_ref: null,
    evidence_refs: [sourceEventId, `scan:${digestId(index + 3000)}`, `sha256:${digestId(index + 4000)}`].sort(),
    access: { visibility: "admins", account_refs: [] },
  };
  return { ...base, ...overrides };
}

function fileActivityProjection(project, events, overrides = {}) {
  const gapReasons = overrides.gap_reasons ?? ["erp_upload_adapter_unavailable", "live_collector_not_activated"];
  return {
    schema_version: FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA,
    project_code: project,
    workspace_binding_id: "shared-worksite",
    generated_at: "2026-07-12T00:03:00.000Z",
    source_checkpoint: {
      checkpoint_id: `checkpoint:${digestId(9000)}`,
      checkpoint_digest: `sha256:${digestId(9001)}`,
      through_received_at: "2026-07-12T00:02:00.000Z",
      partition_refs: [`_workmeta/${project}/reports/file_activity/events/2026-07/${digestId(9002)}.json`],
    },
    coverage: {
      state: "partial",
      from_received_at: "2026-07-12T00:00:00.000Z",
      through_received_at: "2026-07-12T00:02:00.000Z",
      source_months: ["2026-07"],
      source_event_count: events.length,
      event_count: events.length,
      truncated: false,
      gap_reasons: [...gapReasons].sort(),
    },
    boundary: {
      metadata_only: true,
      derived_rebuildable: true,
      absolute_paths_present: false,
      raw_payload_present: false,
      live_activation: false,
    },
    events,
    ...overrides.top_level,
  };
}

function writeFileActivityProjection(root, project, projection) {
  const dir = join(root, "_workmeta", project, "reports", "file_activity", "projections");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "life_tree_events.json");
  writeFileSync(file, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
  return file;
}

function tableCounts(store) {
  const tables = [
    "core_mail", "core_item", "event_log", "core_meeting", "codex_thread_message",
    "core_artifact", "core_attachment", "core_deliverable", "deliverable_input",
  ];
  return Object.fromEntries(tables.map((table) => [table, store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
}

function seedRichStore(project = PROJECT) {
  const store = openStore(":memory:");
  store.upsertProject({ id: project, title: "생명수 검증", class: "active", data_label: "synthetic" });
  for (const [id, title] of [
    ["itm-exact", "정확 작업"],
    ["itm-mail", "메일에서 온 작업"],
    ["voice-accepted", "승인 음성 검토"],
    ["voice-rejected", "거절 음성"],
  ]) store.upsertItem({ id, project_id: project, title, status: "open", data_label: "synthetic" });
  store.db.prepare(
    `UPDATE core_item SET origin='schedule', due='2026-07-13', created_at='2026-07-11T01:00:00Z',
      anchor_stage_code='120_CDR', work_type='author' WHERE id='itm-exact'`
  ).run();
  store.db.prepare("UPDATE core_item SET origin='mail', origin_mail_id=? WHERE id='itm-mail'")
    .run(`${project}:mail-exact`);
  store.db.prepare(
    `UPDATE core_item SET origin='voice', review_status='needs_review', status='unclassified',
      created_at='2026-07-11T03:00:00Z', source_lineage_ref=? WHERE id='voice-accepted'`
  ).run(RAW_SENTINEL);
  store.db.prepare(
    `UPDATE core_item SET origin='voice', review_status='rejected', status='unclassified',
      created_at='2026-07-11T04:00:00Z', source_lineage_ref=? WHERE id='voice-rejected'`
  ).run(RAW_SENTINEL);

  store.upsertMail({
    id: `${project}:mail-exact`, project_id: project, at: "2026-07-11T15:30:00Z",
    direction: "in", subject: "정확 메일", counterpart: "고객A", pointer_ref: RAW_SENTINEL,
    body_preview: RAW_SENTINEL, body_text: RAW_SENTINEL, data_label: "synthetic",
  });
  store.upsertMail({
    id: `${project}:mail-review`, project_id: project, at: "2026-07-12T00:00:00+09:00",
    direction: "out", subject: "검토 메일", counterpart: "고객B", pointer_ref: RAW_SENTINEL,
    body_preview: RAW_SENTINEL, body_text: RAW_SENTINEL, data_label: "synthetic",
  });
  store.upsertMail({
    id: `${project}:mail-undated`, project_id: project, at: "not-a-timestamp",
    direction: "in", subject: "시각 오류 메일", counterpart: "고객C", pointer_ref: RAW_SENTINEL,
    body_preview: RAW_SENTINEL, body_text: RAW_SENTINEL, data_label: "synthetic",
  });
  store.upsertMail({
    id: `${project}:mail-corrupt`, project_id: project, at: "2026-07-11T21:00:00Z",
    direction: "in", subject: "손상 가지 메일", counterpart: "고객D", data_label: "synthetic",
  });

  store.appendEvent({
    at: "2026-07-11T16:00:00Z", actor_ref: "owner", actor_kind: "human", kind: "item_status",
    item_ref: "itm-exact", project_ref: project, from: "open", to: "doing",
    note: RAW_SENTINEL, used_refs: [RAW_SENTINEL], data_label: "synthetic",
  });
  store.createMeeting({
    id: "meeting-planned", project_id: project, title: "설계 회의", at: "2026-07-14T10:00:00+09:00",
    summary_pointer: RAW_SENTINEL, data_label: "synthetic",
  });
  store.db.prepare(
    `INSERT INTO core_deliverable(id,project_id,stage_code,deliverable_no,name,due,due_source,
      out_pointer,in_pointer,produced,review_stage,data_label) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run("deliv-1", project, "120_CDR", "D1", "설계 산출물", "2026-07-13", "owner", RAW_SENTINEL, RAW_SENTINEL, 0, 0, "synthetic");
  store.upsertArtifact({
    id: "artifact-1", project_id: project, kind: "report", title: "등록 보고서",
    pointer: RAW_SENTINEL, sha256: "a".repeat(64), updated_at: "2026-07-11T17:00:00Z", data_label: "synthetic",
  });
  store.addAttachment({
    id: "attachment-1", entity_type: "item", entity_id: "itm-exact", name: "검토표.pdf",
    pointer: RAW_SENTINEL, kind: "doc", artifact_type: "report", data_label: "synthetic",
  });
  store.db.prepare("UPDATE core_attachment SET created_at='2026-07-11T18:00:00Z' WHERE id='attachment-1'").run();
  store.db.prepare(
    `INSERT INTO deliverable_input(id,deliverable_id,project_id,stage_code,file_name,pointer,source,status,note,created_at,data_label)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`
  ).run("input-1", "deliv-1", project, "120_CDR", "입력표.csv", RAW_SENTINEL, "erp", "received", RAW_SENTINEL, "2026-07-11T19:00:00Z", "synthetic");
  store.appendEvent({
    at: "2026-07-11T19:01:00Z", actor_ref: "owner", actor_kind: "human", kind: "input_upload",
    to: "input-1", project_ref: project, note: RAW_SENTINEL, used_refs: [RAW_SENTINEL], data_label: "synthetic",
  });
  store.db.prepare(
    `INSERT INTO codex_thread_message(at,item_id,thread_id,role,text,payload_ref,payload_byte_length,payload_sha256,actor_ref,mode,data_label)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`
  ).run("2026-07-11T20:00:00Z", "itm-exact", "thread-1", "user", RAW_SENTINEL, RAW_SENTINEL, 99, "b".repeat(64), "owner", "mock", "meta");
  return store;
}

test("life-tree query validation is fail-closed and defaults to actual/observed/state history", () => {
  assert.equal(CONTEXT_LIFE_TREE_MAX_DAYS, 90);
  assert.equal(CONTEXT_LIFE_TREE_PER_LANE_MAX, 500);
  assert.equal(CONTEXT_LIFE_TREE_TOTAL_MAX, 2000);
  const ok = parseContextLifeTreeQuery({ project: PROJECT });
  assert.equal(ok.days, 30);
  assert.deepEqual(ok.temporal_roles, ["occurred", "observed", "state_change"]);
  assert.equal(parseContextLifeTreeQuery({ project: "../escape" }).error, "project_invalid");
  for (const days of ["", "0", "1.5", "91", "-1"]) {
    assert.equal(parseContextLifeTreeQuery({ project: PROJECT, days }).error, "days_invalid");
  }
  assert.equal(parseContextLifeTreeQuery({ project: PROJECT, lanes: "mail_received,unknown" }).error, "lanes_invalid");
  assert.deepEqual(parseContextLifeTreeQuery({ project: PROJECT, temporal_roles: "observed" }).temporal_roles, ["observed"]);
  assert.equal(parseContextLifeTreeQuery({ project: PROJECT, temporal_roles: "seen" }).error, "temporal_roles_invalid");
  assert.deepEqual(
    parseContextLifeTreeQuery({ project: PROJECT, temporal_roles: "planned" }).temporal_roles,
    ["planned"],
  );
});

test("observed temporal envelope preserves a strict metadata-only change interval and rejects unsafe clocks", () => {
  assert.ok(CONTEXT_LIFE_TREE_CHANGE_INTERVAL_BASES.includes("bounded_by_node_observations"));
  const interval = {
    after: "2026-07-12T00:00:00+09:00",
    before: "2026-07-12T00:05:00+09:00",
    basis: "bounded_by_node_observations",
  };
  const projected = projectContextLifeTreeTemporalEnvelope({
    temporal_role: "observed",
    primary_clock: "observed_at",
    observed_at: "2026-07-12T00:05:00+09:00",
    ingested_at: "2026-07-12T00:05:05+09:00",
    change_interval: interval,
  });
  assert.equal(projected.error, undefined);
  assert.equal(projected.envelope.temporal_role, "observed");
  assert.equal(projected.envelope.observed_at, "2026-07-11T15:05:00.000Z");
  assert.equal(projected.envelope.time_basis, "observed_at");
  assert.deepEqual(projected.envelope.change_interval, {
    after: "2026-07-11T15:00:00.000Z",
    before: "2026-07-11T15:05:00.000Z",
    basis: "bounded_by_node_observations",
  });
  assert.deepEqual(Object.keys(projected.envelope.change_interval).sort(), ["after", "basis", "before"]);
  assert.equal(normalizeContextLifeTreeChangeInterval({ ...interval, pointer: RAW_SENTINEL }).error, "change_interval_invalid");
  assert.equal(normalizeContextLifeTreeChangeInterval({ ...interval, basis: "fs_modified_at_untrusted_hint" }).error, "change_interval_basis_invalid");
  assert.equal(projectContextLifeTreeTemporalEnvelope({
    temporal_role: "observed", primary_clock: "observed_at", observed_at: "2026-07-12T00:00:00+14:00",
  }).envelope.observed_at, "2026-07-11T10:00:00.000Z");
  for (const invalidOffset of ["+14:01", "+15:00", "-14:30", "+09:60"]) {
    const invalid = projectContextLifeTreeTemporalEnvelope({
      temporal_role: "observed", primary_clock: "observed_at", observed_at: `2026-07-12T00:00:00${invalidOffset}`,
    });
    assert.equal(invalid.envelope.observed_at, null, invalidOffset);
    assert.equal(invalid.envelope.time_state, "unknown", invalidOffset);
  }
});

test("life-tree projection preserves Seoul day/undated, exact-only context, gaps, and excludes raw payload sentinels", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-tree-"));
  const store = seedRichStore();
  try {
    writeContextFixture(root);
    const before = tableCounts(store);
    const snapshot = store.contextLifeTreeSources(PROJECT);
    assert.equal(JSON.stringify(snapshot).includes(RAW_SENTINEL), false, "Store adapter SELECT excludes raw/text/note/pointer fields");
    const tree = buildContextLifeTree(root, PROJECT, { store, days: 2, now: "2026-07-12T03:00:00Z" });
    assert.equal(tree.schema, "dev_erp.context_life_tree.v1");
    assert.equal(tree.content_policy, "metadata_only");
    assert.equal(tree.read_only, true);
    assert.equal(tree.projection_state, "derived_not_source_truth");
    assert.deepEqual(tree.query.temporal_roles, ["occurred", "observed", "state_change"]);
    assert.equal(tree.events.some((event) => event.temporal_role === "planned"), false, "planned is off by default");
    assert.equal(JSON.stringify(tree).includes(RAW_SENTINEL), false, "response contains no body/text/note/pointer payload sentinel");

    const mail = tree.events.find((event) => event.source_record_ref === `core_mail:${PROJECT}:mail-exact`);
    assert.equal(mail.day_key, "2026-07-12", "15:30Z crosses into the next Asia/Seoul business day");
    assert.equal(mail.time_basis, "occurred_at");
    assert.deepEqual(mail.task_links, [{ ref: "item:itm-mail", item_id: "itm-mail", link_state: "confirmed_exact" }]);
    assert.equal(mail.context_links[0].ref, `branch:${PROJECT}:work-mail`);
    assert.equal(mail.context_links[0].link_state, "confirmed_exact");
    assert.equal(mail.uncertainty.context, "confirmed_exact");

    const review = tree.events.find((event) => event.source_record_ref === `core_mail:${PROJECT}:mail-review`);
    assert.equal(review.context_links.length, 0, "suggested branch is never promoted to an exact link");
    assert.equal(review.uncertainty.context, "review_needed");
    assert.ok(review.uncertainty.reasons.includes("suggested_context_not_confirmed"));

    const corrupt = tree.events.find((event) => event.source_record_ref === `core_mail:${PROJECT}:mail-corrupt`);
    assert.equal(corrupt.context_links.length, 0, "mismatched branch_id is not canonicalized into an exact context");
    assert.equal(corrupt.uncertainty.context, "unassigned");

    const undated = tree.events.find((event) => event.source_record_ref === `core_mail:${PROJECT}:mail-undated`);
    assert.equal(undated.day_key, null);
    assert.equal(undated.occurred_at, null);
    assert.equal(undated.time_state, "unknown");
    assert.equal(tree.days.at(-1).day_key, "undated", "invalid/missing timestamps are preserved last, not dropped");

    assert.equal(tree.events.filter((event) => event.lane_id === "voice_intake").length, 1, "only accepted voice intake is exposed");
    const codex = tree.events.find((event) => event.lane_id === "codex_instruction");
    assert.equal(codex.kind, "codex_user_instruction");
    assert.equal(Object.hasOwn(codex.metadata, "text"), false);
    assert.equal(codex.recorded_at, "2026-07-11T20:00:00.000Z");
    const workState = tree.events.find((event) => event.lane_id === "erp_work" && event.kind === "item_status");
    assert.equal(workState.state, "doing", "historical event state comes from event_log.to_val, not current item status");
    assert.equal(tree.gaps.some((gap) => gap.lane === "general_activity"), true);
    assert.equal(tree.gaps.some((gap) => gap.lane === "file_activity"), true);
    assert.deepEqual(tree.coverage.gap_lane_ids, ["general_activity", "file_activity"]);
    const fileActivity = tree.events.find((event) => event.lane_id === "file_activity");
    assert.equal(fileActivity.kind, "erp_input_uploaded");
    assert.equal(fileActivity.source_record_ref.startsWith("event_log:"), true);
    assert.equal(tree.lanes.find((lane) => lane.lane_id === "file_activity").status, "partial");
    assert.equal(tree.lanes.find((lane) => lane.lane_id === "file_activity").gap_reason, "general_filesystem_activity_unobserved");
    assert.equal(tree.days.flatMap((day) => day.contexts).some((context) => context.binding_state === "review_needed"), true);
    const nestedMail = tree.days.flatMap((day) => day.contexts).flatMap((context) => context.events)
      .find((event) => event.event_id === mail.event_id);
    assert.equal(nestedMail, mail, "flat and nested projections share the same canonical event object");
    assert.deepEqual(tableCounts(store), before, "projection and Store adapter are read-only");
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("deliverable-input adapters redact legacy path-shaped fields and expose only validated metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-tree-input-boundary-"));
  const store = openStore(":memory:");
  const project = "P99-601";
  const unsafeInputId = `${LOCAL_PATH_SENTINEL}/input-row`;
  try {
    store.upsertProject({ id: project, title: "입력 경계 검증", class: "active", data_label: "synthetic" });
    store.db.prepare(
      `INSERT INTO core_deliverable(id,project_id,stage_code,deliverable_no,name,produced,review_stage,data_label)
       VALUES(?,?,?,?,?,0,0,'synthetic')`
    ).run("deliverable-safe", project, "120_CDR", "D1", "안전 산출물");
    const insertInput = store.db.prepare(
      `INSERT INTO deliverable_input(
        id,deliverable_id,project_id,stage_code,subfolder,file_name,pointer,source,sha256,size,
        status,mail_ref,note,created_at,data_label
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    insertInput.run(
      unsafeInputId, LOCAL_PATH_SENTINEL, project, LOCAL_PATH_SENTINEL,
      LOCAL_PATH_SENTINEL, LOCAL_PATH_SENTINEL, LOCAL_PATH_SENTINEL, LOCAL_PATH_SENTINEL,
      LOCAL_PATH_SENTINEL, -1, LOCAL_PATH_SENTINEL, LOCAL_PATH_SENTINEL,
      LOCAL_PATH_SENTINEL, "2026-07-11T19:00:00Z", "synthetic",
    );
    insertInput.run(
      "input-safe", "deliverable-safe", project, "120_CDR", "참고규격", "safe.pdf", "relative/safe.pdf",
      "mail", "A".repeat(64), 12, "received", null, null, "2026-07-11T19:02:00Z", "synthetic",
    );
    store.appendEvent({
      at: "2026-07-11T19:01:00Z", actor_ref: "owner", actor_kind: "human", kind: "input_upload",
      to: unsafeInputId, project_ref: project, data_label: "synthetic",
    });

    const snapshot = store.contextLifeTreeSources(project);
    const snapshotJson = JSON.stringify(snapshot);
    assert.equal(snapshotJson.includes(LOCAL_PATH_SENTINEL), false);
    const unsafe = snapshot.rows.deliverable_inputs.find((row) => row.source === null && row.status === null);
    const safe = snapshot.rows.deliverable_inputs.find((row) => row.status === "received");
    assert.match(unsafe.id, /^di:[a-f0-9]{64}$/u);
    assert.deepEqual(Object.keys(unsafe).sort(), [
      "created_at", "deliverable_id", "id", "sha256", "size", "source", "stage_code", "status",
    ]);
    assert.equal(unsafe.deliverable_id, null);
    assert.equal(unsafe.stage_code, null);
    assert.equal(unsafe.source, null);
    assert.equal(unsafe.sha256, null);
    assert.equal(unsafe.size, null);
    assert.equal(safe.source, "mail");
    assert.equal(safe.sha256, "a".repeat(64));
    assert.equal(safe.size, 12);
    const upload = snapshot.rows.file_activity_events[0];
    assert.equal(upload.input_id, unsafe.id);
    assert.equal(upload.deliverable_id, null);
    assert.equal(Object.hasOwn(upload, "file_name"), false);
    assert.equal(Object.hasOwn(upload, "subfolder"), false);

    const tree = buildContextLifeTree(root, project, { store, days: 2, now: "2026-07-12T03:00:00Z" });
    const treeJson = JSON.stringify(tree);
    assert.equal(treeJson.includes(LOCAL_PATH_SENTINEL), false, "absolute legacy path is absent from every API field");
    const inputEvent = tree.events.find((event) => event.kind === "deliverable_input_registered" && event.state === "registered");
    assert.equal(inputEvent.title, "산출물 입력 등록");
    assert.match(inputEvent.source_record_ref, /^deliverable_input:di:[a-f0-9]{64}$/u);
    const fileEvent = tree.events.find((event) => event.kind === "erp_input_uploaded");
    assert.equal(fileEvent.title, "입력 파일 업로드");
    assert.equal(fileEvent.metadata.input_id, unsafe.id);
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("precomputed file-activity projection exposes canonical event kinds, receipt clocks, and stable metadata-only IDs", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-file-projection-"));
  const store = openStore(":memory:");
  const project = "P99-602";
  const observationKinds = [
    "file_first_observed", "observed", "touch", "content_revision", "rename", "copy", "joined_shared_path",
    "cross_node_revision_unordered", "ambiguous_same_content_identity", "stale_observation", "hash_pending",
    "held_packet_evidence",
  ];
  const transitionKinds = ["missing_candidate", "delete", "restore"];
  try {
    store.upsertProject({ id: project, title: "파일 투영 검증", class: "active", data_label: "synthetic" });
    const events = [
      ...observationKinds.map((eventKind, index) => fileActivityProjectionEvent(index + 1, { event_kind: eventKind })),
      ...transitionKinds.map((eventKind, index) => fileActivityProjectionEvent(index + 100, {
        source_kind: "reconciler_transition", event_kind: eventKind,
      })),
    ];
    const skewed = events.find((event) => event.event_kind === "observed");
    skewed.ingested_at = "2026-07-12T00:10:00.000Z";
    skewed.change_interval = {
      after: "2026-07-11T23:50:00.000Z", before: "2026-07-12T00:02:00.000Z",
      basis: "receipt_order_only_clock_skew",
    };
    const blockedOrder = events.find((event) => event.event_kind === "touch");
    blockedOrder.ingested_at = "2026-07-12T00:20:00.000Z";
    blockedOrder.change_interval = {
      after: "2026-07-11T23:50:00.000Z", before: "2026-07-12T00:02:00.000Z",
      basis: "exact_order_blocked_clock_skew",
    };
    writeFileActivityProjection(root, project, fileActivityProjection(project, events));

    const tree = buildContextLifeTree(root, project, {
      store, days: 2, lanes: ["file_activity"], temporalRoles: ["observed", "state_change"],
      now: "2026-07-12T03:00:00Z",
    });
    assert.equal(tree.events.length, events.length);
    assert.equal(tree.lanes[0].coverage.projection.state, "loaded");
    assert.equal(tree.lanes[0].coverage.projection.read_mode, "exact_precomputed_file_only");
    assert.equal(tree.lanes[0].coverage.projection.live_activation, false);
    for (const kind of [
      "file_first_observed", "file_seen", "file_touched", "file_modified", "file_renamed", "file_copied",
      "file_conflict", "file_hash_pending", "file_evidence_held", "file_missing_candidate", "file_deleted", "file_restored",
    ]) assert.ok(tree.events.some((event) => event.kind === kind), kind);
    const skewedLeaf = tree.events.find((event) => event.source_record_ref === `file_activity:${skewed.source_event_id}`);
    assert.equal(skewedLeaf.time_basis, "received_at");
    assert.equal(skewedLeaf.time_state, "fallback");
    assert.equal(skewedLeaf.received_at, "2026-07-12T00:02:00.000Z");
    assert.equal(skewedLeaf.change_interval.basis, "receipt_order_only_clock_skew");
    assert.ok(skewedLeaf.uncertainty.reasons.includes("receipt_order_used_clock_skew"));
    const blockedLeaf = tree.events.find((event) => event.source_record_ref === `file_activity:${blockedOrder.source_event_id}`);
    assert.equal(blockedLeaf.time_basis, "received_at");
    assert.equal(blockedLeaf.time_state, "fallback");
    assert.equal(blockedLeaf.change_interval.basis, "exact_order_blocked_clock_skew");
    assert.ok(blockedLeaf.uncertainty.reasons.includes("exact_temporal_order_blocked_clock_skew"));
    const deleted = tree.events.find((event) => event.kind === "file_deleted");
    const restored = tree.events.find((event) => event.kind === "file_restored");
    assert.equal(deleted.change_interval.basis, "confirmed_absence_receipt_threshold");
    assert.equal(restored.change_interval.basis, "bounded_by_delete_receipt_and_primary_receipt");
    const conflict = tree.events.find((event) => event.kind === "file_conflict");
    assert.equal(conflict.uncertainty.state, "review_needed");
    for (const event of tree.events) {
      assert.equal(event.recorded_at, null, "receipt clock is not relabeled as a recorded clock");
      for (const field of ["node_id", "node_role", "scan_id", "packet_digest", "content_id", "size_bytes", "erp_upload_event_ref"]) {
        assert.equal(Object.hasOwn(event.metadata, field), false, field);
      }
      assert.match(event.source_record_ref, /^file_activity:(?:obs|file-event):[a-f0-9]{64}$/u);
      assert.deepEqual(event.evidence_refs, [event.source_record_ref]);
    }
    const repeated = buildContextLifeTree(root, project, {
      store, days: 2, lanes: ["file_activity"], temporalRoles: ["observed", "state_change"],
      now: "2026-07-12T03:00:00Z",
    });
    assert.deepEqual(repeated.events.map((event) => event.event_id), tree.events.map((event) => event.event_id));
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("ERP upload merges scanner evidence only with explicit exact event/project/hash/size correlation", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-file-dedupe-"));
  const store = openStore(":memory:");
  const project = "P99-603";
  const digest = "a".repeat(64);
  try {
    store.upsertProject({ id: project, title: "ERP 파일 중복 제거", class: "active", data_label: "synthetic" });
    store.db.prepare(
      `INSERT INTO core_deliverable(id,project_id,stage_code,deliverable_no,name,produced,review_stage,data_label)
       VALUES(?,?,?,?,?,0,0,'synthetic')`
    ).run("deliverable-dedupe", project, "120_CDR", "D1", "중복 검증 산출물");
    store.db.prepare(
      `INSERT INTO deliverable_input(id,deliverable_id,project_id,stage_code,source,sha256,size,status,created_at,data_label)
       VALUES(?,?,?,?,?,?,?,?,?,'synthetic')`
    ).run("input-dedupe", "deliverable-dedupe", project, "120_CDR", "erp", digest, 120, "received", "2026-07-12T00:00:00Z");
    store.appendEvent({
      at: "2026-07-12T00:01:00Z", actor_ref: "owner", actor_kind: "human", kind: "input_upload",
      to: "input-dedupe", project_ref: project, data_label: "synthetic",
    });
    const eventId = store.db.prepare("SELECT MAX(id) AS id FROM event_log").get().id;
    const matching = fileActivityProjectionEvent(201, {
      content_id: `sha256:${digest}`, size_bytes: 120, erp_upload_event_ref: `event_log:${eventId}`,
    });
    const sameHashWithoutCorrelation = fileActivityProjectionEvent(202, {
      content_id: `sha256:${digest}`, size_bytes: 120, erp_upload_event_ref: null,
    });
    const mismatchedHash = fileActivityProjectionEvent(203, {
      content_id: `sha256:${"b".repeat(64)}`, size_bytes: 120, erp_upload_event_ref: `event_log:${eventId}`,
    });
    const mismatchedSize = fileActivityProjectionEvent(204, {
      content_id: `sha256:${digest}`, size_bytes: 121, erp_upload_event_ref: `event_log:${eventId}`,
    });
    writeFileActivityProjection(root, project, fileActivityProjection(project, [
      matching, sameHashWithoutCorrelation, mismatchedHash, mismatchedSize,
    ], { gap_reasons: ["live_collector_not_activated"] }));
    const before = tableCounts(store);
    const tree = buildContextLifeTree(root, project, {
      store, days: 2, lanes: ["file_activity"], temporalRoles: ["occurred", "observed"],
      now: "2026-07-12T03:00:00Z",
    });
    assert.equal(tree.events.length, 4, "one exact scanner occurrence is folded into the ERP leaf");
    const erp = tree.events.find((event) => event.kind === "erp_input_uploaded");
    assert.deepEqual(erp.evidence_refs, [`event_log:${eventId}`, `file_activity:${matching.source_event_id}`].sort());
    assert.equal(erp.metadata.scanner_evidence_merged, true);
    assert.equal(erp.uncertainty.reasons.includes("file_activity_projection_partial"), false);
    assert.equal(tree.lanes[0].coverage.projection.deduplicated_with_erp, 1);
    const uncorrelated = tree.events.find((event) => event.source_record_ref === `file_activity:${sameHashWithoutCorrelation.source_event_id}`);
    assert.ok(uncorrelated, "same content without authoritative correlation remains separate");
    for (const mismatchRow of [mismatchedHash, mismatchedSize]) {
      const mismatch = tree.events.find((event) => event.source_record_ref === `file_activity:${mismatchRow.source_event_id}`);
      assert.ok(mismatch.uncertainty.reasons.includes("erp_exact_correlation_unmatched"));
    }
    for (const event of tree.events) {
      for (const field of ["sha256", "size", "content_id", "size_bytes", "erp_upload_event_ref", "node_id", "node_role"]) {
        assert.equal(Object.hasOwn(event.metadata, field), false, field);
      }
    }
    assert.deepEqual(tableCounts(store), before, "projection read and dedupe mutate no DB rows");

    store.db.prepare("UPDATE deliverable_input SET size=NULL WHERE id=?").run("input-dedupe");
    writeFileActivityProjection(root, project, fileActivityProjection(project, [matching], {
      gap_reasons: ["live_collector_not_activated"],
    }));
    const oneUnknownSize = buildContextLifeTree(root, project, {
      store, days: 2, lanes: ["file_activity"], temporalRoles: ["occurred", "observed"],
      now: "2026-07-12T03:00:00Z",
    });
    assert.equal(oneUnknownSize.events.length, 1, "unknown ERP size does not override the exact ref/project/hash match");
    assert.equal(oneUnknownSize.lanes[0].coverage.projection.deduplicated_with_erp, 1);
    store.db.prepare("UPDATE deliverable_input SET size=120 WHERE id=?").run("input-dedupe");

    const secondExact = fileActivityProjectionEvent(205, {
      content_id: `sha256:${digest}`, size_bytes: 120, erp_upload_event_ref: `event_log:${eventId}`,
    });
    writeFileActivityProjection(root, project, fileActivityProjection(project, [matching, secondExact], {
      gap_reasons: ["live_collector_not_activated"],
    }));
    const ambiguous = buildContextLifeTree(root, project, {
      store, days: 2, lanes: ["file_activity"], temporalRoles: ["occurred", "observed"],
      now: "2026-07-12T03:00:00Z",
    });
    assert.equal(ambiguous.events.length, 3, "ambiguous exact correlations keep ERP and both scanner leaves separate");
    assert.equal(ambiguous.lanes[0].coverage.projection.deduplicated_with_erp, 0);
    assert.equal(ambiguous.events.filter((event) => event.uncertainty.reasons.includes("erp_exact_correlation_ambiguous")).length, 2);
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("file-activity account scope is applied before lane cap and admin-only rows stay withheld", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-file-scope-"));
  const store = openStore(":memory:");
  const project = "P99-604";
  try {
    store.upsertProject({ id: project, title: "파일 범위 검증", class: "active", data_label: "synthetic" });
    const events = Array.from({ length: 501 }, (_, index) => fileActivityProjectionEvent(index + 300));
    const visible = fileActivityProjectionEvent(900, { access: { visibility: "accounts", account_refs: ["alice"] } });
    events.push(visible);
    const projection = fileActivityProjection(project, events);
    projection.coverage.source_event_count = events.length + 100;
    projection.coverage.truncated = true;
    projection.coverage.gap_reasons = [...projection.coverage.gap_reasons, "event_window_truncated"].sort();
    writeFileActivityProjection(root, project, projection);

    const direct = readFileActivityLifeTreeProjection(root, project, {
      scope: { actor: "alice", assignee_any: ["alice"] },
    });
    assert.equal(direct.events.length, 1);
    assert.equal(direct.projection_event_count, 1, "inaccessible total count is not exposed");
    assert.equal(direct.source_event_count, 1);
    assert.equal(direct.scope_withheld, true);
    assert.equal(direct.truncated, false, "global truncation does not reveal hidden-row volume");
    assert.equal(direct.gap_reasons.includes("event_window_truncated"), false);

    const tree = buildContextLifeTree(root, project, {
      store, days: 2, lanes: ["file_activity"], temporalRoles: ["observed"],
      now: "2026-07-12T03:00:00Z", perLaneMax: 1,
      scope: { actor: "alice", assignee_any: ["alice"] },
    });
    assert.equal(tree.events.length, 1);
    assert.equal(tree.events[0].source_record_ref, `file_activity:${visible.source_event_id}`);
    assert.equal(tree.counts.scanned, 1);
    assert.equal(tree.lanes[0].coverage.projection.accessible_events, 1);
    assert.equal(tree.lanes[0].coverage.projection.scope_withheld, true);
    assert.equal(tree.lanes[0].coverage.projection.truncated, false);
    assert.ok(tree.lanes[0].coverage.scope_withheld_reasons.includes("file_activity_projection_account_scope_withheld"));
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("file-activity projection rejects unsafe, foreign, conflicting, and oversized artifacts without echoing payload", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-file-reject-"));
  const project = "P99-605";
  try {
    assert.equal(readFileActivityLifeTreeProjection(root, "../escape").rejection_reason, "projection_project_invalid");
    const event = fileActivityProjectionEvent(1001);
    const unsafe = fileActivityProjection(project, [{ ...event, raw_path: LOCAL_PATH_SENTINEL }]);
    writeFileActivityProjection(root, project, unsafe);
    const unsafeResult = readFileActivityLifeTreeProjection(root, project);
    assert.equal(unsafeResult.state, "rejected");
    assert.equal(unsafeResult.rejection_reason, "projection_event_shape_invalid");
    assert.equal(JSON.stringify(unsafeResult).includes(LOCAL_PATH_SENTINEL), false);

    const foreign = fileActivityProjection("P99-FOREIGN", [event]);
    writeFileActivityProjection(root, project, foreign);
    assert.equal(readFileActivityLifeTreeProjection(root, project).rejection_reason, "projection_project_mismatch");

    const badPartition = fileActivityProjection(project, [event]);
    badPartition.source_checkpoint.partition_refs = [LOCAL_PATH_SENTINEL];
    writeFileActivityProjection(root, project, badPartition);
    assert.equal(readFileActivityLifeTreeProjection(root, project).rejection_reason, "projection_partition_ref_invalid");

    const hiddenCountWithoutTruncation = fileActivityProjection(project, [event]);
    hiddenCountWithoutTruncation.coverage.source_event_count = 2;
    writeFileActivityProjection(root, project, hiddenCountWithoutTruncation);
    assert.equal(readFileActivityLifeTreeProjection(root, project).rejection_reason, "projection_truncation_invalid");

    const conflict = { ...event, event_kind: "touch", identity_basis: "same_exact_content_with_changed_stat_hint" };
    writeFileActivityProjection(root, project, fileActivityProjection(project, [event, conflict]));
    assert.equal(readFileActivityLifeTreeProjection(root, project).rejection_reason, "projection_duplicate_source_event_conflict");

    writeFileActivityProjection(root, project, fileActivityProjection(project, [event, structuredClone(event)]));
    const idempotent = readFileActivityLifeTreeProjection(root, project);
    assert.equal(idempotent.state, "loaded");
    assert.equal(idempotent.events.length, 1);
    assert.equal(idempotent.duplicate_count, 1);

    const file = writeFileActivityProjection(root, project, fileActivityProjection(project, [event]));
    const symlinkTarget = join(root, "projection-symlink-target.json");
    writeFileSync(symlinkTarget, JSON.stringify(fileActivityProjection(project, [event])), "utf8");
    rmSync(file);
    try {
      symlinkSync(symlinkTarget, file);
      assert.equal(readFileActivityLifeTreeProjection(root, project).rejection_reason, "projection_not_regular_file");
    } catch (error) {
      if (error?.code !== "EPERM") throw error;
    }
    rmSync(file, { force: true });
    writeFileSync(file, "x".repeat(FILE_ACTIVITY_LIFE_TREE_PROJECTION_MAX_BYTES + 1), "utf8");
    assert.equal(readFileActivityLifeTreeProjection(root, project).rejection_reason, "projection_oversize");

    const projectionDir = join(root, "_workmeta", project, "reports", "file_activity", "projections");
    const redirectedProjectionDir = join(root, "redirected-projections");
    rmSync(projectionDir, { recursive: true, force: true });
    mkdirSync(redirectedProjectionDir, { recursive: true });
    writeFileSync(
      join(redirectedProjectionDir, "life_tree_events.json"),
      JSON.stringify(fileActivityProjection(project, [event])),
      "utf8",
    );
    try {
      symlinkSync(redirectedProjectionDir, projectionDir, "dir");
      assert.equal(
        readFileActivityLifeTreeProjection(root, project).rejection_reason,
        "projection_symlink_component_blocked",
      );
    } catch (error) {
      if (error?.code !== "EPERM") throw error;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("planned filter is separate and date-only plans are not presented as midnight occurrences", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-plan-"));
  const store = seedRichStore();
  try {
    writeContextFixture(root);
    const tree = buildContextLifeTree(root, PROJECT, {
      store,
      days: 3,
      lanes: ["se_planned"],
      temporalRoles: ["planned"],
      now: "2026-07-12T03:00:00Z",
    });
    assert.ok(tree.events.length >= 3);
    assert.equal(tree.events.every((event) => event.temporal_role === "planned"), true);
    const item = tree.events.find((event) => event.source_record_ref === "core_item:itm-exact");
    assert.equal(item.planned_for, "2026-07-13");
    assert.equal(item.time_state, "date_only");
    assert.equal(item.day_key, "2026-07-13");
    assert.equal(item.occurred_at, null);
    assert.equal(tree.events.some((event) => event.lane_id.startsWith("mail_")), false);
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("per-lane and total caps report truncation deterministically", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-cap-"));
  const store = openStore(":memory:");
  try {
    store.upsertProject({ id: PROJECT, title: "cap", data_label: "synthetic" });
    const insert = store.db.prepare(
      "INSERT INTO core_mail(id,project_id,at,direction,subject,data_label) VALUES(?,?,?,?,?,'synthetic')"
    );
    for (let i = 0; i < 505; i++) insert.run(`${PROJECT}:cap-${String(i).padStart(3, "0")}`, PROJECT, "2026-07-12T01:00:00Z", "in", `메일 ${i}`);
    for (let i = 0; i < 500; i++) insert.run(`${PROJECT}:sent-${String(i).padStart(3, "0")}`, PROJECT, "2026-07-12T00:30:00Z", "out", `발신 ${i}`);
    const capped = buildContextLifeTree(root, PROJECT, {
      store, days: 2, lanes: ["mail_received"], temporalRoles: ["occurred"], now: "2026-07-12T03:00:00Z",
    });
    assert.equal(capped.events.length, 500);
    assert.equal(capped.lanes[0].coverage.cap, 500);
    assert.equal(capped.lanes[0].coverage.truncated, true);
    assert.equal(capped.coverage.truncated, true);

    const bothDirections = buildContextLifeTree(root, PROJECT, {
      store, days: 2, lanes: ["mail_received", "mail_sent"], temporalRoles: ["occurred"], now: "2026-07-12T03:00:00Z",
    });
    assert.equal(bothDirections.events.length, 1000, "inbound and outbound retain independent per-lane caps");
    assert.equal(bothDirections.lanes.find((lane) => lane.lane_id === "mail_received").coverage.truncated, true);
    assert.equal(bothDirections.lanes.find((lane) => lane.lane_id === "mail_sent").coverage.truncated, false);

    const tinyTotal = buildContextLifeTree(root, PROJECT, {
      store, days: 2, lanes: ["mail_received"], temporalRoles: ["occurred"],
      now: "2026-07-12T03:00:00Z", perLaneMax: 3, totalMax: 2,
    });
    assert.equal(tinyTotal.events.length, 2);
    assert.equal(tinyTotal.counts.per_lane_max, 3);
    assert.equal(tinyTotal.counts.total_max, 2);
    assert.equal(tinyTotal.counts.truncated, true);
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("source windows filter far-future planned and actual rows before LIMIT while preserving near and undated rows", () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-window-cap-"));
  const store = openStore(":memory:");
  try {
    store.upsertProject({ id: PROJECT, title: "window cap", data_label: "synthetic" });
    const insertItem = store.db.prepare(
      "INSERT INTO core_item(id,project_id,title,origin,status,due,data_label) VALUES(?,?,?,'schedule','open',?,'synthetic')"
    );
    const insertMail = store.db.prepare(
      "INSERT INTO core_mail(id,project_id,at,direction,subject,data_label) VALUES(?,?,?,'in',?,'synthetic')"
    );
    for (let i = 0; i < 501; i++) {
      insertItem.run(`far-plan-${i}`, PROJECT, `먼 미래 계획 ${i}`, "2027-01-01");
      insertMail.run(`far-mail-${i}`, PROJECT, "2027-01-01T00:00:00Z", `먼 미래 메일 ${i}`);
      insertItem.run(`adjacent-plan-${i}`, PROJECT, `범위 직후 계획 ${i}`, "2026-07-15");
      insertMail.run(`adjacent-mail-${i}`, PROJECT, "2026-07-13T00:00:00+09:00", `범위 직후 메일 ${i}`);
    }
    insertItem.run("near-plan", PROJECT, "가까운 계획", "2026-07-13");
    insertItem.run("undated-plan", PROJECT, "날짜 오류 계획", "not-a-date");
    insertItem.run("invalid-offset-plan", PROJECT, "오프셋 오류 계획", "2027-01-01T00:00:00+15:00");
    insertMail.run("near-mail", PROJECT, "2026-07-12T01:00:00Z", "가까운 메일");
    insertMail.run("undated-mail", PROJECT, "not-a-date", "날짜 오류 메일");
    insertMail.run("invalid-offset-mail", PROJECT, "2027-01-01T00:00:00+15:00", "오프셋 오류 메일");

    const planned = buildContextLifeTree(root, PROJECT, {
      store, days: 3, lanes: ["se_planned"], temporalRoles: ["planned"], now: "2026-07-12T03:00:00Z",
    });
    assert.deepEqual(planned.events.map((event) => event.source_record_ref).sort(), ["core_item:invalid-offset-plan", "core_item:near-plan", "core_item:undated-plan"]);
    assert.equal(planned.lanes[0].coverage.scanned, 3);
    assert.equal(planned.lanes[0].coverage.truncated, false, "out-of-window rows do not create false truncation");

    const actual = buildContextLifeTree(root, PROJECT, {
      store, days: 3, lanes: ["mail_received"], temporalRoles: ["occurred"], now: "2026-07-12T03:00:00Z",
    });
    assert.deepEqual(actual.events.map((event) => event.source_record_ref).sort(), ["core_mail:invalid-offset-mail", "core_mail:near-mail", "core_mail:undated-mail"]);
    assert.equal(actual.lanes[0].coverage.scanned, 3);
    assert.equal(actual.lanes[0].coverage.truncated, false);
    assert.equal(actual.days.at(-1).day_key, "undated");
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function startServer(args) {
  const child = spawn(process.execPath, ["server.mjs", ...args], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      DEV_ERP_NO_TLS: "1",
      DEV_ERP_NO_FIXTURE: "1",
      DEV_ERP_AUTO_REAL_META: "0",
      DEV_ERP_AUTOSYNC: "0",
      DEV_ERP_MAIL_COLLECT_SEC: "0",
      DEV_ERP_MORNING_BRIEF: "0",
      DEV_ERP_CODEX_TASK_BRIDGE: "mock",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  return {
    child,
    stderr: () => stderr,
    stop: () => new Promise((resolveStop) => {
      if (child.exitCode != null) return resolveStop();
      child.once("exit", () => resolveStop());
      child.kill("SIGTERM");
    }),
  };
}

async function waitForHttp(url, server) {
  for (let i = 0; i < 100; i++) {
    if (server.child.exitCode != null) throw new Error(`server exited: ${server.stderr()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 30));
  }
  throw new Error(`server not ready: ${server.stderr()}`);
}

test("authenticated life-tree endpoint validates filters and leaves source counts unchanged", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-http-"));
  const dbPath = join(root, "life.db");
  const seed = openStore(dbPath);
  try {
    writeContextFixture(root);
    seed.upsertProject({ id: PROJECT, title: "HTTP 생명수", class: "active", data_label: "synthetic" });
    seed.upsertMail({ id: `${PROJECT}:mail-exact`, project_id: PROJECT, at: "2026-07-12T01:00:00Z", direction: "in", subject: "HTTP 메일", data_label: "synthetic" });
    assert.equal(seed.createAccount({ username: "owner", password: "ownerpass123", roles: ["admin"] }).ok, true);
  } finally {
    seed.db.close();
  }

  const port = await freePort();
  const server = await startServer(["--db", dbPath, "--port", String(port), "--knowledge_shell_root", root]);
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${base}/api/health`, server);
    assert.equal((await fetch(`${base}/api/context/life_tree?project=${PROJECT}`)).status, 401);
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "ownerpass123" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const auth = { headers: { cookie } };
    const before = (await (await fetch(`${base}/api/health`, auth)).json()).counts;

    for (const query of [
      "", `?project=${PROJECT}&days=91`, `?project=${PROJECT}&lanes=mail_received,unknown`,
      `?project=${PROJECT}&temporal_roles=seen`,
    ]) assert.equal((await fetch(`${base}/api/context/life_tree${query}`, auth)).status, 400);
    assert.equal((await fetch(`${base}/api/context/life_tree?project=P99-999`, auth)).status, 403);

    const actualResponse = await fetch(`${base}/api/context/life_tree?project=${PROJECT}&days=30`, auth);
    assert.equal(actualResponse.status, 200);
    const actual = await actualResponse.json();
    assert.equal(actual.schema, "dev_erp.context_life_tree.v1");
    assert.deepEqual(actual.query.temporal_roles, ["occurred", "observed", "state_change"]);
    assert.equal(actual.events.some((event) => event.temporal_role === "planned"), false);

    const plannedResponse = await fetch(`${base}/api/context/life_tree?project=${PROJECT}&days=30&lanes=se_planned&temporal_roles=planned`, auth);
    assert.equal(plannedResponse.status, 200);
    assert.deepEqual((await plannedResponse.json()).query.temporal_roles, ["planned"]);
    const after = (await (await fetch(`${base}/api/health`, auth)).json()).counts;
    assert.deepEqual(after, before, "GET endpoint appends no event and mutates no source row");
  } finally {
    await server.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-admin life-tree scope filters mailbox, item, event, Codex, artifact, and upload rows before caps", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-life-auth-scope-"));
  const dbPath = join(root, "life.db");
  const project = "P99-AUTH";
  const otherProject = "P99-OTHER";
  const seed = openStore(dbPath);
  let crossEventId;
  try {
    seed.upsertProject({ id: project, title: "권한 검증", class: "active", data_label: "synthetic" });
    seed.upsertProject({ id: otherProject, title: "다른 과제", class: "active", data_label: "synthetic" });
    assert.equal(seed.createAccount({ username: "alice", password: "alicepass123", email: "alice@example.com" }).ok, true);
    assert.equal(seed.createAccount({ username: "bob", password: "bobpass123", email: "bob@example.com" }).ok, true);
    assert.equal(seed.createAccount({ username: "admin", password: "adminpass123", roles: ["admin"] }).ok, true);
    seed.upsertItem({ id: "alice-item", project_id: project, title: "ALICE_VISIBLE_ITEM", status: "open", assignee_ref: "alice", data_label: "synthetic" });
    seed.upsertItem({ id: "bob-item", project_id: project, title: "BOB_SECRET_ITEM", status: "open", assignee_ref: "bob", data_label: "synthetic" });
    seed.upsertItem({ id: "cross-item", project_id: otherProject, title: "CROSS_PROJECT_SECRET", status: "open", assignee_ref: "alice", data_label: "synthetic" });

    const insertMail = seed.db.prepare(
      "INSERT INTO core_mail(id,project_id,at,direction,subject,counterpart,mailbox,data_label) VALUES(?,?,?,?,?,?,?,'synthetic')"
    );
    for (let i = 0; i < 505; i++) {
      insertMail.run(`${project}:bob-${i}`, project, "2026-07-12T02:00:00Z", "in", `BOB_SECRET_MAIL_${i}`, "BOB_SECRET_COUNTERPART", "bob@example.com");
    }
    insertMail.run(`${project}:alice`, project, "2026-07-12T01:00:00Z", "in", "ALICE_VISIBLE_MAIL", "ALICE_COUNTERPART", "alice@example.com");
    insertMail.run(`${project}:shared`, project, "2026-07-12T00:30:00Z", "in", "SHARED_BLANK_MAILBOX", "SHARED", null);

    seed.appendEvent({ at: "2026-07-12T01:10:00Z", actor_ref: "alice", actor_kind: "human", kind: "item_status", item_ref: "alice-item", project_ref: project, data_label: "synthetic" });
    seed.appendEvent({ at: "2026-07-12T01:20:00Z", actor_ref: "bob", actor_kind: "human", kind: "item_status", item_ref: "bob-item", project_ref: project, data_label: "synthetic" });
    seed.appendEvent({ at: "2026-07-12T01:30:00Z", actor_ref: "alice", actor_kind: "human", kind: "item_status", item_ref: "cross-item", project_ref: project, data_label: "synthetic" });
    crossEventId = seed.db.prepare("SELECT MAX(id) AS id FROM event_log").get().id;

    const insertCodex = seed.db.prepare(
      `INSERT INTO codex_thread_message(at,item_id,thread_id,role,text,payload_ref,payload_byte_length,actor_ref,mode,data_label)
       VALUES(?,?,?,?,?,?,?,?,?,?)`
    );
    insertCodex.run("2026-07-12T01:40:00Z", "alice-item", "alice-thread", "user", "ALICE_TEXT_WITHHELD", null, 10, "alice", "mock", "meta");
    insertCodex.run("2026-07-12T01:41:00Z", "bob-item", "bob-thread", "user", "BOB_SECRET_CODEX_TEXT", null, 20, "bob", "mock", "meta");
    seed.upsertArtifact({ id: "bob-artifact", project_id: project, kind: "report", title: "BOB_SECRET_ARTIFACT", pointer: "metadata/bob-artifact", sha256: "b".repeat(64), updated_at: "2026-07-12T01:50:00Z", data_label: "synthetic" });
    seed.addAttachment({ id: "bob-attachment", entity_type: "item", entity_id: "bob-item", name: "BOB_SECRET_ATTACHMENT", created_by: "bob", data_label: "synthetic" });
    seed.db.prepare(
      `INSERT INTO core_deliverable(id,project_id,stage_code,deliverable_no,name,due,produced,review_stage,data_label)
       VALUES(?,?,?,?,?,?,0,0,'synthetic')`
    ).run("bob-deliverable", project, "120_CDR", "D-BOB", "BOB_SECRET_DELIVERABLE", "2026-07-13");
    seed.db.prepare(
      `INSERT INTO deliverable_input(id,deliverable_id,project_id,stage_code,file_name,source,status,created_at,data_label)
       VALUES(?,?,?,?,?,'erp','received',?,'synthetic')`
    ).run("bob-input", "bob-deliverable", project, "120_CDR", "BOB_SECRET_FILE", "2026-07-12T01:55:00Z");
    seed.appendEvent({ at: "2026-07-12T01:56:00Z", actor_ref: "bob", actor_kind: "human", kind: "input_upload", to: "bob-input", project_ref: project, data_label: "synthetic" });
  } finally {
    seed.db.close();
  }

  const port = await freePort();
  const server = await startServer(["--db", dbPath, "--port", String(port), "--knowledge_shell_root", root]);
  const base = `http://127.0.0.1:${port}`;
  const loginAs = async (username, password) => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }),
    });
    assert.equal(response.status, 200);
    return { headers: { cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" } };
  };
  try {
    await waitForHttp(`${base}/api/health`, server);
    const aliceAuth = await loginAs("alice", "alicepass123");
    const response = await fetch(`${base}/api/context/life_tree?project=${project}&days=30`, aliceAuth);
    assert.equal(response.status, 200);
    const tree = await response.json();
    const serialized = JSON.stringify(tree);
    assert.equal(serialized.includes("BOB_SECRET"), false);
    assert.equal(serialized.includes("CROSS_PROJECT_SECRET"), false);
    assert.equal(tree.events.some((event) => event.title === "ALICE_VISIBLE_MAIL"), true, "own mailbox row survives >500 newer Bob rows");
    assert.equal(tree.events.some((event) => event.title === "SHARED_BLANK_MAILBOX"), true, "blank mailbox remains a shared queue");
    assert.equal(tree.events.some((event) => event.title.includes("ALICE_VISIBLE_ITEM")), true);
    assert.equal(tree.events.some((event) => event.source_record_ref === "codex_thread_message:1"), true);
    assert.equal(tree.coverage.scope_limited, true);
    assert.ok(tree.coverage.scope_withheld_lane_ids.includes("artifact_metadata"));
    const cross = tree.events.find((event) => event.source_record_ref === `event_log:${crossEventId}`);
    assert.ok(cross, "the actor-owned event remains visible");
    assert.equal(cross.task_links.length, 0, "cross-project item_ref is never projected as a task link");
    assert.ok(cross.uncertainty.reasons.includes("item_link_withheld_or_project_mismatch"));

    const adminAuth = await loginAs("admin", "adminpass123");
    const adminTree = await (await fetch(`${base}/api/context/life_tree?project=${project}&days=30`, adminAuth)).json();
    assert.equal(JSON.stringify(adminTree).includes("BOB_SECRET"), true, "admin/team-wide behavior remains unscoped");
    assert.equal(adminTree.coverage.scope_limited, false);
  } finally {
    await server.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
