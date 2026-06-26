import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChunkPlan,
  buildPlanPreview,
  buildSessionPlan,
  extractTextFromAsrJson,
  renderCommandTemplate,
  renderSourceEventDraft,
  runCaptureSession,
  validateSessionDir,
} from "./voice_capture.mjs";

test("renderCommandTemplate shell-quotes file paths and rejects unknown placeholders", () => {
  const rendered = renderCommandTemplate("printf hi > {transcript_txt}", {
    transcript_txt: "/tmp/voice capture/chunk 'one'.txt",
  });
  assert.equal(rendered, "printf hi > '/tmp/voice capture/chunk '\"'\"'one'\"'\"'.txt'");
  assert.throws(() => renderCommandTemplate("echo {missing}", {}), /unknown voice capture template placeholder/);
});

test("buildSessionPlan keeps raw capture artifacts under _workspaces by default", () => {
  const repoRoot = "/repo";
  const now = new Date("2026-06-26T04:04:05.000Z");
  const plan = buildSessionPlan({
    repoRoot,
    label: "daily mic",
    now,
    chunkSeconds: 60,
    maxChunks: 2,
    recordCmd: "record {audio}",
    asrCmd: "asr {audio} {output_base}",
  });
  assert.equal(plan.session_id, "20260626_130405_daily_mic");
  assert.equal(plan.session_dir, "/repo/_workspaces/system/voice_capture/sessions/2026-06-26/20260626_130405_daily_mic");
  assert.equal(plan.raw_payload_boundary.workmeta_raw_audio_copy_allowed, false);
  assert.equal(plan.max_chunks, 2);

  const chunk = buildChunkPlan(plan, 1);
  assert.equal(chunk.audio_ref.endsWith("/audio/chunk_000001.wav"), true);
  assert.equal(chunk.transcript_json_ref.endsWith("/transcripts/chunk_000001.json"), true);

  const preview = buildPlanPreview(plan);
  assert.equal(preview.first_chunk.chunk_index, 1);
});

test("renderSourceEventDraft points to artifacts without embedding transcript text", () => {
  const plan = buildSessionPlan({
    repoRoot: "/repo",
    sessionId: "fixture_session",
    label: "secret meeting",
    now: new Date("2026-06-26T04:04:05.000Z"),
    recordCmd: "record {audio}",
  });
  const draft = renderSourceEventDraft(plan);
  assert.match(draft, /raw_payload_copied: false/);
  assert.match(draft, /project_code_candidate: P00-000_INBOX/);
  assert.match(draft, /_workspaces\/system\/voice_capture\/sessions/);
  assert.equal(draft.includes("DO_NOT_EMBED_TRANSCRIPT_TEXT"), false);
});

test("runCaptureSession can execute one fixture chunk and write transcript jsonl", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-voice-capture-"));
  try {
    const result = await runCaptureSession({
      repoRoot,
      label: "fixture",
      now: new Date("2026-06-26T04:04:05.000Z"),
      chunkSeconds: 1,
      maxChunks: 1,
      recordCmd: "printf audio > {audio}",
      asrCmd: "printf transcript > {transcript_txt}",
    });
    assert.equal(result.chunks_completed, 1);

    const validation = await validateSessionDir(result.session.session_dir);
    assert.equal(validation.ok, true);

    const transcriptJsonl = await readFile(result.session.output_refs.transcript_jsonl, "utf8");
    const segment = JSON.parse(transcriptJsonl.trim());
    assert.equal(segment.text, "transcript");
    assert.equal(segment.start_seconds, 0);
    assert.equal(segment.end_seconds, 1);

    const sourceDraft = await readFile(result.session.output_refs.source_event_draft, "utf8");
    assert.match(sourceDraft, /workmeta_write_ready: false/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("extractTextFromAsrJson supports common ASR shapes", () => {
  assert.equal(extractTextFromAsrJson({ text: "hello" }), "hello");
  assert.equal(extractTextFromAsrJson({ segments: [{ text: "hello" }, { text: "world" }] }), "hello world");
  assert.equal(extractTextFromAsrJson({ transcription: [{ text: "one" }, { text: "two" }] }), "one two");
});
