import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  LINEAR_LB1_V2_DIMENSIONS,
  buildImmutableLinearLb1BackupRunV2,
  checkLinearLb1RestoreV2,
  collectActualLinearLb1V2Snapshot,
  deserializeBackupRunV2,
  serializeBackupRunV2,
} from "./linear_lb1_v2.mjs";
import {
  HELD_LINEAR_LB1_ACTUAL_READER,
  LINEAR_LB1_ACTUAL_DIMENSION_MATRIX,
  LinearLb1ActualReaderError,
  createLinearLb1ActualReader,
  linearLb1AttachmentAllowlistContentId,
} from "./linear_lb1_actual_reader.mjs";

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function ref(seed) {
  const h = sha256(seed);
  return {
    entity_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
    revision_id: `${h.slice(32, 40)}-${h.slice(40, 44)}-4${h.slice(45, 48)}-9${h.slice(49, 52)}-${h.slice(52, 64)}`,
    content_id: `sha256:${h}`,
    content_hash_alg: "sha256",
  };
}

const WORKSPACE_REF = ref("actual-linear-workspace");
const CREDENTIAL_REF = ref("actual-linear-readonly-credential");
const ADAPTER_REF = ref("actual-linear-reader-adapter");
const DEFAULT_APPROVED_ATTACHMENT_IDS = Object.freeze(["attachment-issue-1", "attachment-issue-2"]);
const ATTACHMENT_POLICY_REF = Object.freeze({
  ...ref("actual-linear-attachment-policy"),
  content_id: linearLb1AttachmentAllowlistContentId(DEFAULT_APPROVED_ATTACHMENT_IDS),
});
const NOW = "2026-08-30T12:00:00.000Z";
const CUTOFF = "2026-08-30T11:59:59.000Z";

function sourceScope() {
  return {
    provider: "linear",
    scope_mode: "entire_workspace",
    workspace_ref: WORKSPACE_REF,
    team_ids: [],
    project_ids: [],
    credential_ref: CREDENTIAL_REF,
    credential_scope: "read_only",
    dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
  };
}

function coverage(overrides = {}) {
  return {
    deletion_tombstones: "partial",
    description_revisions: "current_only",
    comment_revisions: "current_only",
    state_history: "complete",
    assignee_history: "complete",
    project_history: "complete",
    due_history: "complete",
    waiting_info: "missing",
    completion_record: "missing",
    approved_attachments: "metadata_only",
    ...overrides,
  };
}

function catalog() {
  return {
    teams: [{ id: "team-1", name: "Engineering", key: "ENG", updated_at: CUTOFF }],
    projects: [{ id: "project-1", name: "Platform", team_id: "team-1", updated_at: CUTOFF }],
    users: [
      { id: "user-1", name: "Alice", email: "alice@example.com", updated_at: CUTOFF },
      { id: "user-2", name: "Bob", email: "bob@example.com", updated_at: CUTOFF },
    ],
    statuses: [
      { id: "status-open", name: "Open", type: "unstarted", team_id: "team-1" },
      { id: "status-done", name: "Done", type: "completed", team_id: "team-1" },
    ],
    labels: [{ id: "label-backup", name: "backup", updated_at: CUTOFF }],
  };
}

function rawIssue(id = "issue-1", identifier = "ENG-1") {
  const description = `Description for ${identifier}`;
  const comment = `Comment for ${identifier}`;
  return {
    id,
    identifier,
    title: `Issue ${identifier}`,
    priority: 1,
    team_id: "team-1",
    project_id: "project-1",
    assignee_id: "user-1",
    status_id: "status-open",
    parent_id: null,
    label_ids: ["label-backup"],
    created_at: "2026-08-29T00:00:00.000Z",
    updated_at: CUTOFF,
    started_at: null,
    completed_at: null,
    canceled_at: null,
    archived_at: null,
    due_at: null,
    deletion: null,
    relations: [],
    description: {
      revision_id: `desc-${id}`,
      body: description,
      content_sha256: sha256(description),
      updated_at: CUTOFF,
      author_id: "user-1",
      deletion: null,
    },
    comments: [{
      id: `comment-${id}`,
      revision_id: `comment-revision-${id}`,
      body: comment,
      content_sha256: sha256(comment),
      author_id: "user-2",
      parent_id: null,
      created_at: CUTOFF,
      edited_at: null,
      updated_at: CUTOFF,
      archived_at: null,
      resolved_at: null,
      deletion: null,
    }],
    state_history: [{ id: `state-${id}`, from_status_id: "status-open", to_status_id: "status-done", actor_id: "user-1", occurred_at: CUTOFF }],
    assignee_history: [],
    project_history: [],
    due_history: [],
    waiting_info: [],
    completion_records: [],
    evidence_refs: [],
    attachments: [{
      id: `attachment-${id}`,
      title: "approved.txt",
      source_url: `https://uploads.linear.app/${id}/approved.txt`,
      mime_type: "text/plain",
      size: 8,
      content_sha256: sha256("approved"),
      created_at: CUTOFF,
      updated_at: CUTOFF,
      availability: "available",
    }],
  };
}

function page({ issues, cursor = null, nextCursor = null, hasMore = false, pageCatalog = null, pageCoverage = coverage() }) {
  return {
    schema_version: "soulforge.backup_controller.linear_lb1.actual_provider_page.v0",
    workspace_id: WORKSPACE_REF.entity_id,
    cutoff_at: CUTOFF,
    cursor,
    next_cursor: nextCursor,
    has_more: hasMore,
    catalog: pageCatalog,
    coverage: pageCoverage,
    issues,
  };
}

function readerConfig(readPage, overrides = {}) {
  const approvedAttachmentIds = overrides.approved_attachment_ids ?? DEFAULT_APPROVED_ATTACHMENT_IDS;
  const attachmentPolicyRef = overrides.attachment_policy_ref ?? {
    ...ATTACHMENT_POLICY_REF,
    content_id: linearLb1AttachmentAllowlistContentId(approvedAttachmentIds),
  };
  return {
    feature_state: "actual_read_only",
    adapter_ref: ADAPTER_REF,
    workspace_ref: WORKSPACE_REF,
    credential_ref: CREDENTIAL_REF,
    attachment_policy_ref: attachmentPolicyRef,
    approved_attachment_ids: [...approvedAttachmentIds],
    clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) },
    resource_limits: { max_pages: 10, max_issues: 100, max_total_bytes: 1_000_000, max_runtime_ms: 60_000 },
    readPage,
    ...overrides,
  };
}

test("default OFF reader has zero effects and cannot read", async () => {
  assert.equal(HELD_LINEAR_LB1_ACTUAL_READER.feature_state, "off");
  assert.deepEqual(HELD_LINEAR_LB1_ACTUAL_READER.getEffects(), {
    provider_calls: 0,
    network_calls: 0,
    network_calls_evidence: "ATTESTED_FEATURE_OFF",
    network_calls_evidence_ref: null,
    linear_mutations: 0,
    mutation_evidence: "attested_feature_off",
  });
  assert.throws(() => HELD_LINEAR_LB1_ACTUAL_READER.collectSnapshot(sourceScope()), LinearLb1ActualReaderError);
});

test("whole-workspace reader paginates and normalizes labels plus approved attachments without false completeness", async () => {
  const calls = [];
  const pages = [
    page({ issues: [rawIssue()], nextCursor: "cursor-2", hasMore: true, pageCatalog: catalog() }),
    page({ issues: [rawIssue("issue-2", "ENG-2")], cursor: "cursor-2" }),
  ];
  const reader = createLinearLb1ActualReader(readerConfig(async (request) => {
    calls.push(request);
    return pages[calls.length - 1];
  }));
  const collection = await reader.collectSnapshot(sourceScope());
  assert.equal(collection.collection_status, "partial");
  assert.deepEqual(calls.map((call) => call.cursor), [null, "cursor-2"]);
  assert.equal(calls.every((call) => call.scope.scope_mode === "entire_workspace"), true);
  assert.equal(collection.snapshot.source_scope.kind, "linear_read_only_provider");
  assert.equal(collection.snapshot.cutoff.pagination_complete, true);
  assert.equal(collection.snapshot.cutoff.page_count, 2);
  assert.equal(collection.snapshot.issues.length, 2);
  assert.deepEqual(collection.snapshot.issues[0].label_ids, ["label-backup"]);
  assert.equal(collection.snapshot.labels[0].label_id, "label-backup");
  assert.equal(collection.snapshot.issues[0].attachments[0].bytes_captured, false);
  assert.equal(collection.snapshot.issues[0].attachments[0].approval_ref, ATTACHMENT_POLICY_REF.entity_id);
  assert.equal(collection.collector.cursor_ledger_sha256.length, 64);
  assert.equal(collection.collector.page_count, 2);
  assert.equal(collection.collector.terminal_page_observed, true);
  assert.deepEqual(collection.declared_missing_dimensions, [
    "issue", "description", "comments", "waiting_info", "completion_record", "evidence_refs", "cutoff_completeness",
  ]);
  assert.deepEqual(reader.getEffects(), {
    provider_calls: 2,
    network_calls: null,
    network_calls_evidence: "UNKNOWN",
    network_calls_evidence_ref: null,
    linear_mutations: null,
    mutation_evidence: "unknown_injected_provider",
  });
});

test("injected readPage calls remain network UNKNOWN unless an exact independent binding is supplied", async () => {
  const reader = createLinearLb1ActualReader(readerConfig(async () => page({
    issues: [rawIssue()], pageCatalog: catalog(),
  })));
  const collection = await reader.collectSnapshot(sourceScope());

  assert.equal(collection.collector.provider_calls, 1);
  assert.equal(collection.collector.network_calls, null);
  assert.equal(collection.collector.network_calls_evidence, "UNKNOWN");
  assert.equal(collection.collector.network_calls_evidence_ref, null);

  const unsupportedCount = {
    ...collection.collector,
    network_calls: collection.collector.provider_calls,
  };
  assert.throws(() => collectActualLinearLb1V2Snapshot(collection.snapshot, {
    status: collection.collection_status,
    missing_dimensions: collection.declared_missing_dimensions,
    errors: collection.errors,
    collector: unsupportedCount,
  }), /linear_lb1_v2_actual_collector_invalid/);

  const independentBindingRef = ref("network-effect-binding-01");
  const independentlyBound = collectActualLinearLb1V2Snapshot(collection.snapshot, {
    status: collection.collection_status,
    missing_dimensions: collection.declared_missing_dimensions,
    errors: collection.errors,
    collector: {
      ...collection.collector,
      network_calls: 3,
      network_calls_evidence: "EXACT_INDEPENDENT_BINDING",
      network_calls_evidence_ref: independentBindingRef,
    },
  });
  assert.deepEqual(independentlyBound.effects, {
    provider_calls: 1,
    storage_writes: 0,
    network_calls: 3,
    network_calls_evidence: "EXACT_INDEPENDENT_BINDING",
    network_calls_evidence_ref: independentBindingRef,
    filesystem_writes: 0,
    scheduler_changes: 0,
  });
});

test("provider coverage cannot self-promote beyond the independently declared adapter ceiling", async () => {
  const full = coverage({
    deletion_tombstones: "complete",
    description_revisions: "complete",
    comment_revisions: "complete",
    waiting_info: "complete",
    completion_record: "complete",
    approved_attachments: "bytes_complete",
  });
  const reader = createLinearLb1ActualReader(readerConfig(async () => page({
    issues: [rawIssue()], pageCatalog: catalog(), pageCoverage: full,
  })));
  const collection = await reader.collectSnapshot(sourceScope());
  assert.equal(collection.collection_status, "partial");
  assert.deepEqual(collection.declared_missing_dimensions, [
    "issue", "description", "comments", "waiting_info", "completion_record", "evidence_refs", "cutoff_completeness",
  ]);
});

test("scope drift, cursor loops, and provider payload drift fail closed", async () => {
  let calls = 0;
  const reader = createLinearLb1ActualReader(readerConfig(async (request) => {
    calls += 1;
    return page({ issues: [rawIssue()], cursor: request.cursor, nextCursor: "loop", hasMore: true, pageCatalog: catalog() });
  }));
  const loop = await reader.collectSnapshot(sourceScope());
  assert.equal(loop.collection_status, "failed");
  assert.deepEqual(loop.errors, [{ code: "provider_page_invalid" }]);
  const foreign = sourceScope();
  foreign.workspace_ref = ref("foreign-workspace");
  const before = calls;
  const denied = await reader.collectSnapshot(foreign);
  assert.equal(denied.collection_status, "failed");
  assert.equal(calls, before);
  assert.equal(denied.collector.provider_calls, 0);

  const extraField = createLinearLb1ActualReader(readerConfig(async () => ({ ...page({ issues: [rawIssue()], pageCatalog: catalog() }), raw_body: "do not trust me" })));
  assert.equal((await extraField.collectSnapshot(sourceScope())).collection_status, "failed");
});

test("unapproved attachment is excluded and makes evidence coverage partial", async () => {
  const issue = rawIssue();
  const reader = createLinearLb1ActualReader(readerConfig(async () => page({
    issues: [issue], pageCatalog: catalog(), pageCoverage: coverage({ approved_attachments: "missing" }),
  }), { approved_attachment_ids: [] }));
  const collection = await reader.collectSnapshot(sourceScope());
  assert.equal(collection.snapshot.issues[0].attachments.length, 0);
  assert.equal(collection.declared_missing_dimensions.includes("evidence_refs"), true);
});

test("normalized actual collection seals, byte-round-trips, and restores without promoting partial coverage", async () => {
  const reader = createLinearLb1ActualReader(readerConfig(async () => page({ issues: [rawIssue()], pageCatalog: catalog() })));
  const collection = await reader.collectSnapshot(sourceScope());
  const run = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-whole-workspace-synthetic-integration",
    collected_at: NOW,
    collection,
    target_ref: "private-redacted-target-ref",
  });
  const bytes = serializeBackupRunV2(run);
  const readback = deserializeBackupRunV2(bytes);
  assert.deepEqual(readback, run);
  assert.equal(run.feature_state, "actual_read_only");
  assert.equal(run.manifest.source_kind, "linear_read_only_provider");
  assert.equal(run.manifest.collection_evidence.cursor_ledger_sha256, collection.collector.cursor_ledger_sha256);
  assert.equal(run.manifest.collection_evidence.attachment_allowlist_sha256, ATTACHMENT_POLICY_REF.content_id);
  assert.deepEqual(run.effects, {
    provider_calls: 1,
    storage_writes: 0,
    network_calls: null,
    network_calls_evidence: "UNKNOWN",
    network_calls_evidence_ref: null,
    filesystem_writes: 0,
    scheduler_changes: 0,
  });
  const restore = checkLinearLb1RestoreV2(run, readback.revision.snapshot, { artifact_kinds: ["immutable_revision"] });
  assert.equal(restore.complete, false);
  assert.deepEqual(restore.missing_dimensions, run.manifest.coverage.missing_dimensions);
  assert.equal(run.run_status, "partial");
});

test("attachment allowlist content must match the Owner-bound policy ref digest", () => {
  assert.throws(() => createLinearLb1ActualReader(readerConfig(async () => page({ issues: [], pageCatalog: catalog() }), {
    approved_attachment_ids: [],
    attachment_policy_ref: ATTACHMENT_POLICY_REF,
  })), (error) => error instanceof LinearLb1ActualReaderError
    && error.code === "linear_lb1_actual_reader_attachment_policy_invalid");
});

test("actual collector refuses a synthetic snapshot even with otherwise valid evidence", async () => {
  const reader = createLinearLb1ActualReader(readerConfig(async () => page({ issues: [rawIssue()], pageCatalog: catalog() })));
  const actual = await reader.collectSnapshot(sourceScope());
  const syntheticKindSnapshot = JSON.parse(JSON.stringify(actual.snapshot));
  syntheticKindSnapshot.source_scope.kind = "public_synthetic_fixture";
  assert.throws(() => collectActualLinearLb1V2Snapshot(syntheticKindSnapshot, {
    status: actual.collection_status,
    missing_dimensions: actual.declared_missing_dimensions,
    errors: [],
    collector: actual.collector,
  }), /collection_provenance_mismatch/);
});

test("dimension matrix names all 18 dimensions and never marks native waiting/completion as supported", () => {
  assert.deepEqual(Object.keys(LINEAR_LB1_ACTUAL_DIMENSION_MATRIX), [...LINEAR_LB1_V2_DIMENSIONS]);
  assert.equal(LINEAR_LB1_ACTUAL_DIMENSION_MATRIX.waiting_info, "missing");
  assert.equal(LINEAR_LB1_ACTUAL_DIMENSION_MATRIX.completion_record, "missing");
  assert.equal(LINEAR_LB1_ACTUAL_DIMENSION_MATRIX.cutoff_completeness, "partial");
});

test("whole-workspace normalization accepts more than 500 issues within explicit resource limits", async () => {
  const issues = Array.from({ length: 501 }, (_, index) => rawIssue(`issue-${index + 1}`, `ENG-${index + 1}`));
  const reader = createLinearLb1ActualReader(readerConfig(async () => page({ issues, pageCatalog: catalog() }), {
    approved_attachment_ids: [],
    resource_limits: { max_pages: 2, max_issues: 1_000, max_total_bytes: 10_000_000, max_runtime_ms: 60_000 },
  }));
  const collection = await reader.collectSnapshot(sourceScope());
  assert.equal(collection.collection_status, "partial");
  assert.equal(collection.snapshot.issues.length, 501);
});

test("unknown nested provider keys fail closed instead of being silently projected", async () => {
  const issue = rawIssue();
  issue.comments[0].raw_payload = "unexpected";
  const reader = createLinearLb1ActualReader(readerConfig(async () => page({ issues: [issue], pageCatalog: catalog() })));
  const collection = await reader.collectSnapshot(sourceScope());
  assert.equal(collection.collection_status, "failed");
  assert.deepEqual(collection.errors, [{ code: "provider_error" }]);
  assert.equal(collection.collector.kind, "linear_read_only_provider");
});

test("page bytes are budgeted before raw page retention or normalization", async () => {
  const reader = createLinearLb1ActualReader(readerConfig(async () => page({
    issues: [rawIssue()], pageCatalog: catalog(),
  }), {
    resource_limits: { max_pages: 2, max_issues: 10, max_total_bytes: 1, max_runtime_ms: 60_000 },
  }));
  const collection = await reader.collectSnapshot(sourceScope());
  assert.equal(collection.collection_status, "failed");
  assert.deepEqual(collection.errors, [{ code: "resource_limit_exceeded" }]);
  assert.equal(collection.collector.provider_calls, 1);
  assert.equal(collection.collector.page_count, 0);
});
