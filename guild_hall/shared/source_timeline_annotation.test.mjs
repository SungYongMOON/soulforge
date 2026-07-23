import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SourceTimelineAnnotationError,
  createSourceArrivalAnnotation,
  createSourceTimelineAnnotation,
  reduceSourceTimelineAnnotations,
  validateSourceTimelineAnnotation,
  writeSourceTimelineJsonl,
} from "./source_timeline_annotation.mjs";

const HASH = "a".repeat(64);

function fixture(extra = {}) {
  return createSourceTimelineAnnotation({
    source_lane: "voice",
    item_id: "recording_001",
    source_revision_id: "transcript_001",
    body_sha256: HASH,
    source_unit_ref: "segment_12",
    source_span_ref: "span_12_0",
    source_sequence: 12,
    occurred_at: "2026-07-23T12:00:10.000Z",
    time_precision: "segment",
    relative_start_ms: 10000,
    relative_end_ms: 12000,
    label_kind: "person_mention",
    label_value: "김상윤",
    canonical_ref: "person:kim-sangyun",
    project_ref: null,
    project_resolution_state: "unassigned",
    project_basis_refs: [],
    speaker_ref: "speaker:unknown",
    actor_refs: [],
    producer_kind: "deterministic",
    producer_ref: "voice_timeline_adapter_v1",
    policy_ref: "policy:source_timeline_v1",
    confidence_score: 0.7,
    confidence_band: "medium",
    acoustic_score: 0.7,
    context_score: null,
    ...extra,
  });
}

test("creates a strict timestamped occurrence without copying raw text", () => {
  const annotation = fixture();
  assert.equal(validateSourceTimelineAnnotation(annotation).ok, true);
  assert.equal(annotation.occurrence.occurred_at, "2026-07-23T21:00:10.000+09:00");
  assert.equal(annotation.occurrence.relative_start_ms, 10000);
  assert.equal(annotation.label.kind, "person_mention");
  assert.equal(annotation.boundaries.raw_body_copied, false);
  assert.equal(Object.hasOwn(annotation.label, "value"), false);
});

test("the same person repeated in distinct spans remains distinct", () => {
  const first = fixture({ source_span_ref: "span_12_0" });
  const second = fixture({ source_span_ref: "span_12_1" });
  assert.notEqual(first.occurrence.occurrence_id, second.occurrence.occurrence_id);
  const reduced = reduceSourceTimelineAnnotations([first, first, second]);
  assert.equal(reduced.unique_revision_count, 2);
  assert.equal(reduced.lineage_count, 2);
});

test("corrections retain one occurrence lineage and every material change gets a new revision", () => {
  const first = fixture();
  const correctedLabel = fixture({
    source_revision_id: "transcript_002",
    body_sha256: "b".repeat(64),
    label_value: "corrected-person",
    label_value_sha256: undefined,
    supersedes_revision_id: first.revision_id,
  });
  const correctedTime = fixture({
    source_revision_id: "transcript_003",
    body_sha256: "c".repeat(64),
    occurred_at: "2026-07-23T12:00:11.000Z",
    actor_refs: ["person:reviewer"],
    supersedes_revision_id: correctedLabel.revision_id,
  });

  assert.equal(first.lineage_id, correctedLabel.lineage_id);
  assert.equal(first.occurrence.occurrence_id, correctedLabel.occurrence.occurrence_id);
  assert.notEqual(first.revision_id, correctedLabel.revision_id);
  assert.equal(correctedLabel.lineage_id, correctedTime.lineage_id);
  assert.notEqual(correctedLabel.revision_id, correctedTime.revision_id);

  const reduced = reduceSourceTimelineAnnotations([first, correctedLabel, correctedTime]);
  assert.equal(reduced.unique_revision_count, 3);
  assert.equal(reduced.lineage_count, 1);
});

test("correction replay is order-independent and rejects branches", () => {
  const first = fixture();
  const second = fixture({
    label_kind: "keyword_mention",
    relative_start_ms: 10500,
    relative_end_ms: 12500,
    supersedes_revision_id: first.revision_id,
  });
  const third = fixture({
    source_revision_id: "transcript_003",
    source_sequence: 13,
    supersedes_revision_id: second.revision_id,
  });
  assert.equal(first.lineage_id, second.lineage_id);
  assert.equal(second.lineage_id, third.lineage_id);
  assert.equal(reduceSourceTimelineAnnotations([third, first, second]).unique_revision_count, 3);
  assert.throws(
    () => reduceSourceTimelineAnnotations([
      first,
      second,
      fixture({
        source_revision_id: "transcript_branch",
        label_value: "branch",
        label_value_sha256: undefined,
        supersedes_revision_id: first.revision_id,
      }),
    ]),
    (error) => error instanceof SourceTimelineAnnotationError && error.code === "supersession_branch",
  );
});

test("revision identity binds time, body, actors, project evidence, producer, and confidence", () => {
  const base = fixture();
  const variants = [
    fixture({ occurred_at: "2026-07-23T12:00:11.000Z" }),
    fixture({ body_sha256: "b".repeat(64) }),
    fixture({ actor_refs: ["person:reviewer"] }),
    fixture({ project_basis_refs: ["evidence:mail:1"] }),
    fixture({ producer_ref: "voice_timeline_adapter_v2" }),
    fixture({ confidence_score: 0.6 }),
  ];
  for (const variant of variants) {
    assert.equal(variant.lineage_id, base.lineage_id);
    assert.notEqual(variant.revision_id, base.revision_id);
  }
});

test("forged identities and secret-like references fail closed", () => {
  const forged = structuredClone(fixture());
  forged.actors.actor_refs = ["person:other"];
  assert.equal(validateSourceTimelineAnnotation(forged).ok, false);
  const forgedSecretRef = structuredClone(fixture());
  forgedSecretRef.label.canonical_ref = ["xapp", "1234567890", "abcdefghij"].join("-");
  assert.equal(validateSourceTimelineAnnotation(forgedSecretRef).ok, false);
  assert.throws(
    () => fixture({ canonical_ref: ["xoxb", "1234567890", "abcdefghij"].join("-") }),
    (error) => error instanceof SourceTimelineAnnotationError
      && error.code === "secret_like_ref_rejected",
  );
  assert.throws(
    () => fixture({ actor_refs: ["credential:password"] }),
    (error) => error instanceof SourceTimelineAnnotationError
      && error.code === "secret_like_ref_rejected",
  );
  assert.throws(
    () => fixture({ canonical_ref: ["xapp", "1234567890", "abcdefghij"].join("-") }),
    (error) => error instanceof SourceTimelineAnnotationError
      && error.code === "secret_like_ref_rejected",
  );
  assert.throws(
    () => fixture({ occurred_at: "2026-07-23T12:00:00" }),
    (error) => error instanceof SourceTimelineAnnotationError
      && error.code === "date_time_required",
  );
  const utcPersisted = structuredClone(fixture());
  utcPersisted.occurrence.occurred_at = "2026-07-23T12:00:10.000Z";
  assert.equal(validateSourceTimelineAnnotation(utcPersisted).ok, false);
});

test("normalizes every stored occurrence to KST across the UTC date boundary", () => {
  const annotation = fixture({ occurred_at: "2026-07-23T15:30:00.000Z" });
  assert.equal(annotation.occurrence.occurred_at, "2026-07-24T00:30:00.000+09:00");
  assert.equal(validateSourceTimelineAnnotation(annotation).ok, true);
});

test("rejects partial offsets, secret-like labels, and conflicting deterministic output", async () => {
  assert.throws(
    () => fixture({ relative_end_ms: null }),
    (error) => error instanceof SourceTimelineAnnotationError && error.code === "offset_pair_required",
  );
  assert.throws(
    () => fixture({ label_value: ["access_token=xoxb", "secret"].join("-") }),
    (error) => error instanceof SourceTimelineAnnotationError && error.code === "secret_like_label_rejected",
  );

  const root = await mkdtemp(path.join(os.tmpdir(), "source-timeline-"));
  try {
    const target = path.join(root, "timeline.jsonl");
    const first = fixture();
    assert.deepEqual(await writeSourceTimelineJsonl({ target_path: target, annotations: [first] }), {
      duplicate: false,
      count: 1,
    });
    assert.equal((await readFile(target, "utf8")).trim().length > 0, true);
    assert.deepEqual(await writeSourceTimelineJsonl({ target_path: target, annotations: [first] }), {
      duplicate: true,
      count: 1,
    });
    await assert.rejects(
      writeSourceTimelineJsonl({
        target_path: target,
        annotations: [fixture({ source_span_ref: "span_12_other" })],
      }),
      (error) => error instanceof SourceTimelineAnnotationError
        && error.code === "deterministic_output_conflict",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("all six ingress lanes share the same arrival contract", () => {
  const lanes = [
    "mail",
    "slack",
    "voice",
    "structured_pc_work",
    "team_files",
    "run_logs",
  ];
  const annotations = lanes.map((lane, index) => createSourceArrivalAnnotation({
    source_lane: lane,
    item_id: `item_${index}`,
    source_revision_id: `revision_${index}`,
    body_sha256: String(index + 1).repeat(64).slice(0, 64),
    occurred_at: "2026-07-23T03:00:00.000Z",
  }));
  assert.deepEqual(annotations.map((entry) => entry.source.lane), lanes);
  assert.equal(annotations.every((entry) => entry.label.kind === "source_arrival"), true);
  assert.equal(annotations.every((entry) => entry.occurrence.time_precision === "event"), true);
  assert.equal(
    annotations.every((entry) => entry.occurrence.occurred_at === "2026-07-23T12:00:00.000+09:00"),
    true,
  );
});
