import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runVoiceSemanticSweep } from "./voice_semantic_sweep.mjs";

test("sweep selects the stronger completed transcript, writes once, and replays idempotently", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-sweep-"));
  try {
    const voiceRoot = path.join(root, "voice");
    const sessionDir = path.join(voiceRoot, "sessions", "2026-07-23", "session_001");
    const runDir = path.join(sessionDir, "analysis", "local_asr", "large-v3-q5_0");
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify({
      session_id: "session_001",
      source_provider: "PLAUD",
      recorded_at_local: "2026-07-23T20:00:00+09:00",
    })}\n`, "utf8");
    const row = {
      schema_version: "soulforge.voice_transcript_segment.v0",
      segment_id: 1,
      start_seconds: 1,
      end_seconds: 3,
      speaker: "SPEAKER_00",
      content: "김상윤 수석에게 자료를 보내 주세요.",
    };
    const transcript = `${JSON.stringify(row)}\n`;
    const transcriptPath = path.join(runDir, "transcript.jsonl");
    await writeFile(transcriptPath, transcript, "utf8");
    const digest = crypto.createHash("sha256").update(transcript).digest("hex");
    await writeFile(path.join(runDir, "analysis_manifest.json"), `${JSON.stringify({
      state: "completed",
      session_id: "session_001",
      model_id: "large-v3-q5_0",
      segment_count: 1,
      transcript_jsonl_ref: "_workspaces/system/voice_capture/sessions/2026-07-23/session_001/analysis/local_asr/large-v3-q5_0/transcript.jsonl",
      transcript_sha256: digest,
      evidence_role: "independent_machine_transcript_unverified",
      quality: "machine_transcript_unverified",
      completed_at: "2026-07-23T12:00:00.000Z",
    }, null, 2)}\n`, "utf8");

    const dryRun = await runVoiceSemanticSweep({
      repo_root: root,
      voice_root: voiceRoot,
      apply: false,
      max_sessions: 10,
    });
    assert.equal(dryRun.processed_session_count, 1);
    assert.equal(dryRun.timeline_annotation_count > 0, true);

    const first = await runVoiceSemanticSweep({
      repo_root: root,
      voice_root: voiceRoot,
      apply: true,
      max_sessions: 10,
    });
    assert.equal(first.processed_session_count, 1);
    assert.equal(first.duplicate_session_count, 0);
    const labelRoot = path.join(sessionDir, "analysis", "semantic_labels");
    const runIds = await import("node:fs/promises").then(({ readdir }) => readdir(labelRoot));
    assert.equal(runIds.length, 1);
    const timeline = await readFile(
      path.join(labelRoot, runIds[0], "source_timeline_annotations.jsonl"),
      "utf8",
    );
    assert.match(timeline, /person_mention/u);

    const second = await runVoiceSemanticSweep({
      repo_root: root,
      voice_root: voiceRoot,
      apply: true,
      max_sessions: 10,
    });
    assert.equal(second.duplicate_session_count, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bounded sweep prioritizes an unprocessed later session over an older duplicate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-sweep-progress-"));
  try {
    const voiceRoot = path.join(root, "voice");
    const makeSession = async (date, sessionId, completedAt) => {
      const sessionDir = path.join(voiceRoot, "sessions", date, sessionId);
      const runDir = path.join(sessionDir, "analysis", "local_asr", "large-v3-turbo-q5_0");
      await mkdir(runDir, { recursive: true });
      await writeFile(path.join(sessionDir, "session_manifest.json"), `${JSON.stringify({
        session_id: sessionId,
        source_provider: "PLAUD",
        recorded_at_local: `${date}T09:00:00+09:00`,
      })}\n`, "utf8");
      const row = {
        schema_version: "soulforge.voice_transcript_segment.v0",
        segment_id: 1,
        start_seconds: 1,
        end_seconds: 2,
        speaker: "SPEAKER_00",
        content: "\uc790\ub8cc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694",
      };
      const transcript = `${JSON.stringify(row)}\n`;
      const transcriptPath = path.join(runDir, "transcript.jsonl");
      await writeFile(transcriptPath, transcript, "utf8");
      await writeFile(path.join(runDir, "analysis_manifest.json"), `${JSON.stringify({
        state: "completed",
        session_id: sessionId,
        model_id: "large-v3-turbo-q5_0",
        segment_count: 1,
        transcript_jsonl_ref: `_workspaces/system/voice_capture/sessions/${date}/${sessionId}/analysis/local_asr/large-v3-turbo-q5_0/transcript.jsonl`,
        transcript_sha256: crypto.createHash("sha256").update(transcript).digest("hex"),
        evidence_role: "independent_machine_transcript_unverified",
        quality: "machine_transcript_unverified",
        completed_at: completedAt,
      })}\n`, "utf8");
      return sessionDir;
    };

    const oldSession = await makeSession("2026-07-22", "session_old", "2026-07-22T12:00:00.000Z");
    const newSession = await makeSession("2026-07-23", "session_new", "2026-07-23T12:00:00.000Z");
    const first = await runVoiceSemanticSweep({
      repo_root: root,
      voice_root: voiceRoot,
      apply: true,
      max_sessions: 1,
    });
    assert.equal(first.processed_session_count, 1);
    assert.equal(await lstat(path.join(oldSession, "analysis", "semantic_labels")).then(() => true), true);

    const second = await runVoiceSemanticSweep({
      repo_root: root,
      voice_root: voiceRoot,
      apply: true,
      max_sessions: 1,
    });
    assert.equal(second.processed_session_count, 1);
    assert.equal(second.duplicate_session_count, 0);
    assert.equal(await lstat(path.join(newSession, "analysis", "semantic_labels")).then(() => true), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("malformed and persistently failing older manifests do not starve a later valid session", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-semantic-sweep-poison-"));
  try {
    const voiceRoot = path.join(root, "voice");
    const malformedDir = path.join(
      voiceRoot,
      "sessions",
      "2026-07-01",
      "session_malformed",
      "analysis",
      "local_asr",
      "large-v3-q5_0",
    );
    await mkdir(malformedDir, { recursive: true });
    await writeFile(path.join(malformedDir, "analysis_manifest.json"), "{invalid-json", "utf8");

    const poisonDir = path.join(
      voiceRoot,
      "sessions",
      "2026-07-02",
      "session_poison",
      "analysis",
      "local_asr",
      "large-v3-q5_0",
    );
    await mkdir(poisonDir, { recursive: true });
    await writeFile(path.join(poisonDir, "analysis_manifest.json"), `${JSON.stringify({
      state: "completed",
      session_id: "session_poison",
      model_id: "large-v3-q5_0",
      segment_count: 1,
      transcript_jsonl_ref: "_workspaces/system/voice_capture/sessions/2026-07-02/session_poison/analysis/local_asr/large-v3-q5_0/transcript.jsonl",
      transcript_sha256: "a".repeat(64),
      evidence_role: "independent_machine_transcript_unverified",
      quality: "machine_transcript_unverified",
      completed_at: "2026-07-02T12:00:00.000Z",
    })}\n`, "utf8");

    const validSessionDir = path.join(voiceRoot, "sessions", "2026-07-03", "session_valid");
    const validRunDir = path.join(validSessionDir, "analysis", "local_asr", "large-v3-q5_0");
    await mkdir(validRunDir, { recursive: true });
    await writeFile(path.join(validSessionDir, "session_manifest.json"), `${JSON.stringify({
      session_id: "session_valid",
      source_provider: "PLAUD",
      recorded_at_local: "2026-07-03T09:00:00+09:00",
    })}\n`, "utf8");
    const transcript = `${JSON.stringify({
      schema_version: "soulforge.voice_transcript_segment.v0",
      segment_id: 1,
      start_seconds: 1,
      end_seconds: 2,
      speaker: "SPEAKER_00",
      content: "\uc790\ub8cc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694",
    })}\n`;
    const transcriptPath = path.join(validRunDir, "transcript.jsonl");
    await writeFile(transcriptPath, transcript, "utf8");
    await writeFile(path.join(validRunDir, "analysis_manifest.json"), `${JSON.stringify({
      state: "completed",
      session_id: "session_valid",
      model_id: "large-v3-q5_0",
      segment_count: 1,
      transcript_jsonl_ref: "_workspaces/system/voice_capture/sessions/2026-07-03/session_valid/analysis/local_asr/large-v3-q5_0/transcript.jsonl",
      transcript_sha256: crypto.createHash("sha256").update(transcript).digest("hex"),
      evidence_role: "independent_machine_transcript_unverified",
      quality: "machine_transcript_unverified",
      completed_at: "2026-07-03T12:00:00.000Z",
    })}\n`, "utf8");

    const result = await runVoiceSemanticSweep({
      repo_root: root,
      voice_root: voiceRoot,
      apply: true,
      max_sessions: 1,
    });
    assert.equal(result.processed_session_count, 1);
    assert.equal(result.failed_session_count, 2);
    assert.equal(result.selected_session_count, 2);
    assert.deepEqual(
      new Set(result.failures.map((failure) => failure.error_code)),
      new Set(["voice_semantic_manifest_invalid", "voice_semantic_processing_failed"]),
    );
    assert.equal(
      await lstat(path.join(validSessionDir, "analysis", "semantic_labels")).then(() => true),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
