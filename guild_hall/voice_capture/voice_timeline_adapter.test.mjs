import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  buildVoiceSemanticLabelRun,
  buildVoiceSemanticSignalOccurrences,
} from "./semantic_labeling.mjs";
import { buildVoiceTimelineAnnotations } from "./voice_timeline_adapter.mjs";

const HASH = "b".repeat(64);

function cryptoHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("preserves repeated person mentions as separate time occurrences", () => {
  const sourceSegments = [
    {
      schema_version: "soulforge.voice_transcript_segment.v0",
      segment_id: 1,
      start_seconds: 5,
      end_seconds: 8,
      speaker: "SPEAKER_00",
      content: "김상윤 수석에게 확인하고 김상윤 수석에게 다시 보내 주세요.",
    },
  ];
  const run = buildVoiceSemanticLabelRun({
    recordingId: "recording_001",
    transcriptRef: "_workspaces/system/voice_capture/sessions/recording_001/transcript.jsonl",
    transcriptSha256: HASH,
    sourceSegments,
    recordedAt: "2026-07-23T20:00:00+09:00",
    evidenceRole: "independent_machine_transcript_stronger_unverified",
    transcriptQuality: "machine_transcript_unverified",
    projectContextCards: [],
  });
  const annotations = buildVoiceTimelineAnnotations({ run, source_segments: sourceSegments });
  const people = annotations.filter((entry) => entry.label.kind === "person_mention");
  assert.equal(people.length, 2);
  assert.notEqual(people[0].occurrence.occurrence_id, people[1].occurrence.occurrence_id);
  assert.equal(people.every((entry) => entry.occurrence.relative_start_ms === 5000), true);
  assert.equal(people.every((entry) => entry.occurrence.time_precision === "segment"), true);
  assert.equal(annotations.some((entry) => entry.label.kind === "request"), true);
  assert.equal(annotations.some((entry) => entry.label.kind === "action"), true);
  assert.equal(annotations.every((entry) => entry.boundaries.official_task_mutated === false), true);
});

test("preserves repeated request and action signals as separate time occurrences", () => {
  const sourceSegments = [{
    schema_version: "soulforge.voice_transcript_segment.v0",
    segment_id: 8,
    start_seconds: 30,
    end_seconds: 36,
    speaker: "SPEAKER_00",
    content: "\uc790\ub8cc\ub97c \ubcf4\ub0b4 \uc8fc\uc138\uc694. \uacb0\uacfc\ub3c4 \ubcf4\ub0b4 \uc8fc\uc138\uc694. \ud655\uc778\ud558\uace0 \ub2e4\uc2dc \ud655\uc778\ud574 \uc8fc\uc138\uc694.",
  }];
  const run = buildVoiceSemanticLabelRun({
    recordingId: "recording_repeated_signals",
    transcriptRef: "_workspaces/system/voice_capture/sessions/repeated/transcript.jsonl",
    transcriptSha256: HASH,
    sourceSegments,
    recordedAt: "2026-07-23T20:00:00+09:00",
    evidenceRole: "independent_machine_transcript_stronger_unverified",
    transcriptQuality: "machine_transcript_unverified",
    projectContextCards: [],
  });
  const annotations = buildVoiceTimelineAnnotations({
    run,
    source_segments: sourceSegments,
    signal_occurrences: buildVoiceSemanticSignalOccurrences(run, sourceSegments),
  });
  const requests = annotations.filter((entry) => entry.label.kind === "request");
  const sends = annotations.filter(
    (entry) => entry.label.kind === "action"
      && entry.label.value_sha256 === cryptoHash("send_or_share"),
  );
  const confirms = annotations.filter(
    (entry) => entry.label.kind === "action"
      && entry.label.value_sha256 === cryptoHash("check_or_confirm"),
  );
  assert.equal(requests.length, 3);
  assert.equal(sends.length, 2);
  assert.equal(confirms.length, 2);
  assert.equal(new Set(sends.map((entry) => entry.occurrence.occurrence_id)).size, 2);
  assert.equal(annotations.every((entry) => entry.occurrence.time_precision === "segment"), true);
});

test("does not overclaim project assignment without context evidence", () => {
  const sourceSegments = [{
    schema_version: "soulforge.voice_transcript_segment.v0",
    segment_id: 4,
    start_seconds: 20,
    end_seconds: 22,
    speaker: "SPEAKER_01",
    content: "P26-014 결과를 확인해 주세요.",
  }];
  const run = buildVoiceSemanticLabelRun({
    recordingId: "recording_002",
    transcriptRef: "_workspaces/system/voice_capture/sessions/recording_002/transcript.jsonl",
    transcriptSha256: HASH,
    sourceSegments,
    recordedAt: "2026-07-23T20:00:00+09:00",
    evidenceRole: "provider_transcript_auxiliary_unverified",
    transcriptQuality: "provider_transcript_unverified",
    projectContextCards: [],
  });
  const annotations = buildVoiceTimelineAnnotations({ run, source_segments: sourceSegments });
  assert.equal(annotations.length > 0, true);
  assert.equal(annotations.every((entry) => entry.project.resolution_state === "unassigned"), true);
  assert.equal(annotations.every((entry) => entry.project.project_ref === null), true);
});
