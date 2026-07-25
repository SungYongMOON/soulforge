import assert from "node:assert/strict";
import test from "node:test";

import {
  ProjectTimelineProjectionError,
  buildProjectTimelineProjection,
  createScopeTimelineBinding,
  validateProjectTimelineProjection,
  validateScopeTimelineBinding,
} from "./project_timeline_projection.mjs";
import {
  createSourceTimelineAnnotation,
  validateSourceTimelineAnnotation,
} from "./source_timeline_annotation.mjs";

const GENERATED_AT = "2026-07-25T03:00:00.000Z";
const KNOWN_AT = "2026-07-25T02:00:00.000Z";
const RECORDED_AT = "2026-07-25T02:00:01.000Z";

function bodyDigest(seed) {
  return seed.repeat(64).slice(0, 64);
}

function annotation({
  lane,
  item,
  occurredAt,
  sequence = 0,
  labelKind = "source_arrival",
  labelValue = lane,
  span = `span:${item}`,
  sourceRevision = `revision:${item}:1`,
  producerKind = "deterministic",
  supersedesRevisionId = null,
}) {
  return createSourceTimelineAnnotation({
    source_lane: lane,
    item_id: item,
    source_revision_id: sourceRevision,
    body_sha256: bodyDigest(String(sequence + 1)),
    source_unit_ref: `unit:${item}`,
    source_span_ref: span,
    source_sequence: sequence,
    occurred_at: occurredAt,
    time_precision: lane === "voice" ? "segment" : "event",
    relative_start_ms: lane === "voice" ? sequence * 1_000 : null,
    relative_end_ms: lane === "voice" ? sequence * 1_000 + 900 : null,
    label_kind: labelKind,
    label_value: labelValue,
    canonical_ref: null,
    project_ref: null,
    project_resolution_state: "unassigned",
    project_basis_refs: [],
    speaker_ref: null,
    actor_refs: [`actor:${item}`],
    producer_kind: producerKind,
    producer_ref: `${producerKind}:timeline-test`,
    policy_ref: "policy:source_timeline_v1",
    confidence_score: 1,
    confidence_band: "high",
    acoustic_score: lane === "voice" ? 0.9 : null,
    context_score: null,
    supersedes_revision_id: supersedesRevisionId,
  });
}

function binding(sourceAnnotation, {
  scopeKind,
  projectRef = null,
  candidateProjectRefs = [],
  resolutionState,
  basisRefs = [],
  knownAt = KNOWN_AT,
  recordedAt = RECORDED_AT,
  producerKind = "deterministic",
  supersedesBindingId = null,
}) {
  return createScopeTimelineBinding({
    annotation: sourceAnnotation,
    scope_kind: scopeKind,
    project_ref: projectRef,
    candidate_project_refs: candidateProjectRefs,
    resolution_state: resolutionState,
    basis_refs: basisRefs,
    known_at: knownAt,
    recorded_at: recordedAt,
    producer_kind: producerKind,
    producer_ref: `${producerKind}:scope-test`,
    policy_ref: "policy:scope_binding_v1",
    supersedes_binding_id: supersedesBindingId,
  });
}

function sixLaneFixture() {
  return [
    annotation({
      lane: "mail",
      item: "mail:001",
      occurredAt: "2026-07-25T09:00:00+09:00",
    }),
    annotation({
      lane: "slack",
      item: "slack:001",
      occurredAt: "2026-07-25T09:00:00+09:00",
    }),
    annotation({
      lane: "voice",
      item: "voice:001",
      occurredAt: "2026-07-25T09:03:00+09:00",
      labelKind: "request",
      labelValue: "request",
    }),
    annotation({
      lane: "structured_pc_work",
      item: "work:001",
      occurredAt: "2026-07-25T09:04:00+09:00",
    }),
    annotation({
      lane: "team_files",
      item: "file:001",
      occurredAt: "2026-07-25T09:05:00+09:00",
    }),
    annotation({
      lane: "run_logs",
      item: "run:001",
      occurredAt: "2026-07-25T09:06:00+09:00",
    }),
  ];
}

test("six source lanes split into isolated project, unassigned, common, and restricted timelines", () => {
  const annotations = sixLaneFixture();
  const bindings = [
    binding(annotations[0], {
      scopeKind: "project",
      projectRef: "project:P26-014",
      resolutionState: "confirmed",
      basisRefs: ["mail_folder:P26-014"],
    }),
    binding(annotations[1], {
      scopeKind: "project",
      projectRef: "project:P26-014",
      resolutionState: "confirmed",
      basisRefs: ["slack_channel:P26-014"],
    }),
    binding(annotations[3], {
      scopeKind: "project",
      projectRef: "project:P25-000",
      resolutionState: "confirmed",
      basisRefs: ["work_session:P25-000"],
    }),
    binding(annotations[4], {
      scopeKind: "restricted",
      resolutionState: "confirmed",
      basisRefs: ["policy:restricted_file"],
    }),
    binding(annotations[5], {
      scopeKind: "common",
      resolutionState: "confirmed",
      basisRefs: ["policy:common_run"],
    }),
  ];

  const projection = buildProjectTimelineProjection({
    annotations,
    bindings,
    generation_id: "generation:timeline:001",
    generated_at: GENERATED_AT,
  });

  assert.equal(projection.system_receipts.length, 6);
  assert.deepEqual(
    projection.project_timelines.map((timeline) => [
      timeline.project_ref,
      timeline.entries.length,
    ]),
    [
      ["project:P25-000", 1],
      ["project:P26-014", 2],
    ],
  );
  assert.deepEqual(
    projection.project_timelines[1].entries.map((entry) => entry.source_lane),
    ["mail", "slack"],
  );
  assert.equal(projection.routing.unassigned.length, 1);
  assert.equal(projection.routing.unassigned[0].source_lane, "voice");
  assert.equal(projection.routing.common.length, 1);
  assert.equal(projection.routing.restricted.length, 1);
  assert.equal(projection.routing.candidate.length, 0);
  assert.equal(projection.routing.conflict.length, 0);
  assert.equal(validateProjectTimelineProjection(projection).ok, true);
});

test("candidate and conflicting project routes stay outside confirmed project timelines", () => {
  const candidateSource = annotation({
    lane: "voice",
    item: "voice:candidate",
    occurredAt: "2026-07-25T10:00:00+09:00",
    labelKind: "project_mention",
    labelValue: "candidate",
  });
  const conflictSource = annotation({
    lane: "mail",
    item: "mail:conflict",
    occurredAt: "2026-07-25T10:01:00+09:00",
  });
  const projection = buildProjectTimelineProjection({
    annotations: [candidateSource, conflictSource],
    bindings: [
      binding(candidateSource, {
        scopeKind: "project",
        projectRef: "project:P26-014",
        resolutionState: "candidate",
        basisRefs: ["entity:equipment-a"],
        producerKind: "remote_llm",
      }),
      binding(conflictSource, {
        scopeKind: "conflict",
        candidateProjectRefs: ["project:P25-000", "project:P26-014"],
        resolutionState: "exception_review_required",
        basisRefs: ["mail_thread:shared"],
        producerKind: "codex",
      }),
    ],
    generation_id: "generation:timeline:002",
    generated_at: GENERATED_AT,
  });

  assert.equal(projection.project_timelines.length, 0);
  assert.equal(projection.routing.candidate.length, 1);
  assert.equal(projection.routing.candidate[0].project_ref, "project:P26-014");
  assert.equal(projection.routing.conflict.length, 1);
  assert.deepEqual(
    projection.routing.conflict[0].candidate_project_refs,
    ["project:P25-000", "project:P26-014"],
  );
});

test("append-only reclassification moves only the rebuildable project projection", () => {
  const source = annotation({
    lane: "mail",
    item: "mail:reclassified",
    occurredAt: "2026-07-25T11:00:00+09:00",
  });
  const first = binding(source, {
    scopeKind: "project",
    projectRef: "project:P26-014",
    resolutionState: "confirmed",
    basisRefs: ["mail_folder:P26-014"],
  });
  const corrected = binding(source, {
    scopeKind: "project",
    projectRef: "project:P25-000",
    resolutionState: "confirmed",
    basisRefs: ["owner_correction:001"],
    knownAt: "2026-07-25T02:10:00.000Z",
    recordedAt: "2026-07-25T02:10:01.000Z",
    producerKind: "human",
    supersedesBindingId: first.binding_id,
  });

  const projection = buildProjectTimelineProjection({
    annotations: [source],
    bindings: [first, corrected],
    generation_id: "generation:timeline:003",
    generated_at: GENERATED_AT,
  });

  assert.equal(projection.project_timelines.length, 1);
  assert.equal(projection.project_timelines[0].project_ref, "project:P25-000");
  assert.equal(
    projection.project_timelines[0].entries[0].binding_id,
    corrected.binding_id,
  );
});

test("input order and exact duplicates do not change the projection digest", () => {
  const annotations = sixLaneFixture();
  const mailBinding = binding(annotations[0], {
    scopeKind: "project",
    projectRef: "project:P26-014",
    resolutionState: "confirmed",
    basisRefs: ["mail_folder:P26-014"],
  });
  const first = buildProjectTimelineProjection({
    annotations,
    bindings: [mailBinding],
    generation_id: "generation:timeline:004",
    generated_at: GENERATED_AT,
  });
  const second = buildProjectTimelineProjection({
    annotations: [...annotations].reverse().concat(annotations[0]),
    bindings: [mailBinding, mailBinding],
    generation_id: "generation:timeline:004",
    generated_at: GENERATED_AT,
  });

  assert.equal(first.projection_digest, second.projection_digest);
  assert.deepEqual(first, second);
});

test("stale bindings cannot classify a corrected source annotation", () => {
  const original = annotation({
    lane: "voice",
    item: "voice:corrected",
    occurredAt: "2026-07-25T12:00:00+09:00",
    labelKind: "unknown",
    labelValue: "unknown",
    span: "span:voice:corrected",
  });
  const corrected = annotation({
    lane: "voice",
    item: "voice:corrected",
    occurredAt: "2026-07-25T12:00:00+09:00",
    labelKind: "request",
    labelValue: "request",
    span: "span:voice:corrected",
    sourceRevision: "revision:voice:corrected:2",
    supersedesRevisionId: original.revision_id,
  });
  const staleBinding = binding(original, {
    scopeKind: "project",
    projectRef: "project:P26-014",
    resolutionState: "confirmed",
    basisRefs: ["voice_rule:old"],
  });

  assert.throws(
    () => buildProjectTimelineProjection({
      annotations: [original, corrected],
      bindings: [staleBinding],
      generation_id: "generation:timeline:005",
      generated_at: GENERATED_AT,
    }),
    (error) => error instanceof ProjectTimelineProjectionError
      && error.code === "stale_binding",
  );
});

test("binding branches and forged binding identities are rejected", () => {
  const source = annotation({
    lane: "slack",
    item: "slack:branch",
    occurredAt: "2026-07-25T13:00:00+09:00",
  });
  const root = binding(source, {
    scopeKind: "project",
    projectRef: "project:P26-014",
    resolutionState: "confirmed",
    basisRefs: ["slack_channel:P26-014"],
  });
  const left = binding(source, {
    scopeKind: "project",
    projectRef: "project:P25-000",
    resolutionState: "confirmed",
    basisRefs: ["owner_correction:left"],
    knownAt: "2026-07-25T04:00:00.000Z",
    recordedAt: "2026-07-25T04:00:01.000Z",
    supersedesBindingId: root.binding_id,
  });
  const right = binding(source, {
    scopeKind: "project",
    projectRef: "project:P26-016",
    resolutionState: "confirmed",
    basisRefs: ["owner_correction:right"],
    knownAt: "2026-07-25T04:01:00.000Z",
    recordedAt: "2026-07-25T04:01:01.000Z",
    supersedesBindingId: root.binding_id,
  });

  assert.throws(
    () => buildProjectTimelineProjection({
      annotations: [source],
      bindings: [root, left, right],
      generation_id: "generation:timeline:006",
      generated_at: GENERATED_AT,
    }),
    (error) => error instanceof ProjectTimelineProjectionError
      && error.code === "binding_supersession_branch",
  );

  const forged = structuredClone(root);
  forged.binding_id = "stb_forged";
  assert.equal(validateScopeTimelineBinding(forged).ok, false);
});

test("provider-neutral remote_llm annotations are accepted without granting authority", () => {
  const remote = annotation({
    lane: "mail",
    item: "mail:remote-llm",
    occurredAt: "2026-07-25T14:00:00+09:00",
    labelKind: "request",
    labelValue: "request",
    producerKind: "remote_llm",
  });
  assert.equal(validateSourceTimelineAnnotation(remote).ok, true);

  const projection = buildProjectTimelineProjection({
    annotations: [remote],
    bindings: [],
    generation_id: "generation:timeline:007",
    generated_at: GENERATED_AT,
  });
  assert.equal(projection.routing.unassigned.length, 1);
  assert.equal(projection.project_timelines.length, 0);
});

test("projection validation rejects cross-project leakage", () => {
  const source = annotation({
    lane: "mail",
    item: "mail:leak",
    occurredAt: "2026-07-25T15:00:00+09:00",
  });
  const projection = buildProjectTimelineProjection({
    annotations: [source],
    bindings: [
      binding(source, {
        scopeKind: "project",
        projectRef: "project:P26-014",
        resolutionState: "confirmed",
        basisRefs: ["mail_folder:P26-014"],
      }),
    ],
    generation_id: "generation:timeline:008",
    generated_at: GENERATED_AT,
  });
  const tampered = structuredClone(projection);
  tampered.project_timelines[0].entries[0].project_ref = "project:P25-000";
  assert.equal(validateProjectTimelineProjection(tampered).ok, false);
});

test("projection validation rejects forged receipts, entry identities, and order", () => {
  const annotations = sixLaneFixture();
  const projection = buildProjectTimelineProjection({
    annotations,
    bindings: [],
    generation_id: "generation:timeline:009",
    generated_at: GENERATED_AT,
  });

  const forgedReceipt = structuredClone(projection);
  forgedReceipt.system_receipts[0].route_bucket = "common";
  assert.equal(validateProjectTimelineProjection(forgedReceipt).ok, false);

  const forgedEntry = structuredClone(projection);
  forgedEntry.routing.unassigned[0].entry_id = "pte_forged";
  assert.equal(validateProjectTimelineProjection(forgedEntry).ok, false);

  const reversed = structuredClone(projection);
  reversed.routing.unassigned.reverse();
  assert.equal(validateProjectTimelineProjection(reversed).ok, false);
});
