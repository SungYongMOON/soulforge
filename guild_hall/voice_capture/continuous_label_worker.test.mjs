import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import crypto from "node:crypto";

import {
  continuousVoiceLabelHealthSchemaVersion,
  continuousVoiceLabelWorkerSchemaVersion,
  runContinuousVoiceLabelWorker,
} from "./continuous_label_worker.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-label-worker-"));
  const repoRoot = path.join(root, "repo");
  const voiceRoot = path.join(repoRoot, "voice");
  const expectedStateRoot = path.join(root, "private-state");
  const stateRoot = path.join(expectedStateRoot, "worker");
  const profilePath = path.join(voiceRoot, "config", "profile.json");
  const asrPath = path.join(repoRoot, "bin", "whisper-cli.exe");
  const profileBytes = Buffer.from('{"schema_version":"soulforge.local_asr_profile.v0"}\n');
  const asrBytes = Buffer.from("synthetic-asr");
  await mkdir(path.dirname(profilePath), { recursive: true });
  await mkdir(path.dirname(asrPath), { recursive: true });
  await mkdir(expectedStateRoot, { recursive: true });
  await writeFile(profilePath, profileBytes);
  await writeFile(asrPath, asrBytes);
  return {
    root,
    repoRoot,
    voiceRoot,
    expectedStateRoot,
    stateRoot,
    profilePath,
    asrPath,
    profileSha256: sha256(profileBytes),
    asrSha256: sha256(asrBytes),
  };
}

async function workspaceAliasFixture({ wrongTarget = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "voice-label-worker-alias-"));
  const repoRoot = path.join(root, "repo");
  const voiceRoot = path.join(root, "company", "system", "voice_capture");
  const expectedStateRoot = path.join(root, "private-state");
  const stateRoot = path.join(expectedStateRoot, "worker");
  const profilePath = path.join(voiceRoot, "config", "profile.json");
  const asrPath = path.join(repoRoot, "bin", "whisper-cli.exe");
  const workspaceRoot = path.join(repoRoot, "_workspaces");
  const aliasTarget = wrongTarget
    ? path.join(root, "wrong-system")
    : path.dirname(voiceRoot);
  const profileBytes = Buffer.from('{"schema_version":"soulforge.local_asr_profile.v0"}\n');
  const asrBytes = Buffer.from("synthetic-asr");
  await mkdir(path.dirname(profilePath), { recursive: true });
  await mkdir(path.dirname(asrPath), { recursive: true });
  await mkdir(path.join(aliasTarget, "voice_capture"), { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await mkdir(expectedStateRoot, { recursive: true });
  await symlink(
    aliasTarget,
    path.join(workspaceRoot, "system"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(profilePath, profileBytes);
  await writeFile(asrPath, asrBytes);
  return {
    root,
    repoRoot,
    voiceRoot,
    expectedStateRoot,
    stateRoot,
    profilePath,
    asrPath,
    profileSha256: sha256(profileBytes),
    asrSha256: sha256(asrBytes),
  };
}

function implementations(f, calls) {
  return {
    preflightImpl: async () => ({
      ok: true,
      checks: [{ id: "whisper-cli_available", ok: true, resolved_path: f.asrPath }],
    }),
    loadProfileImpl: async () => ({
      profile: {
        queue_root: "voice/local_asr_queue",
        output_subdir: "analysis/local_asr",
        run_id: "synthetic-run",
      },
    }),
    enqueueImpl: async () => {
      calls.push("enqueue");
      return { pending_count: 3, queued_count: 3 };
    },
    drainImpl: async (options) => {
      calls.push("drain");
      assert.equal(options.profile.asr_binary, f.asrPath);
      return {
        pending_count: 3,
        processed_count: 1,
        failed_count: 0,
        remaining_pending_count: 2,
        retry_required: true,
      };
    },
    sweepImpl: async () => {
      calls.push("labels");
      return {
        eligible_session_count: 5,
        pending_session_count: 1,
        processed_session_count: 1,
        duplicate_session_count: 0,
        failed_session_count: 0,
        timeline_annotation_count: 12,
      };
    },
  };
}

test("apply processes bounded ASR then labels and writes metadata-only state", async () => {
  const f = await fixture();
  try {
    const calls = [];
    const result = await runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: f.stateRoot,
      expectedStateRoot: f.expectedStateRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      now: new Date("2026-07-24T10:00:00.000Z"),
      ...implementations(f, calls),
    });
    assert.equal(result.schema_version, continuousVoiceLabelWorkerSchemaVersion);
    assert.equal(result.status, "ok");
    assert.deepEqual(calls, ["enqueue", "drain", "labels"]);
    assert.equal(result.asr.processed_count, 1);
    assert.equal(result.asr.remaining_pending_count, 2);
    assert.equal(result.labels.timeline_annotation_count, 12);
    assert.equal(result.raw_payload_copied, false);
    assert.equal(result.official_task_mutation_count, 0);
    const health = JSON.parse(await readFile(path.join(f.stateRoot, "health.json"), "utf8"));
    assert.equal(health.schema_version, continuousVoiceLabelHealthSchemaVersion);
    assert.equal(health.status, "ok");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("dry run performs no state writes", async () => {
  const f = await fixture();
  try {
    const calls = [];
    const result = await runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: false,
      ...implementations(f, calls),
    });
    assert.equal(result.mode, "dry_run");
    assert.deepEqual(calls, ["enqueue", "drain", "labels"]);
    await assert.rejects(readFile(path.join(f.stateRoot, "health.json")), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("profile drift fails before processing", async () => {
  const f = await fixture();
  try {
    await mkdir(f.stateRoot, { recursive: true });
    await writeFile(path.join(f.stateRoot, "health.json"), '{"status":"ok"}\n');
    await assert.rejects(
      runContinuousVoiceLabelWorker({
        repoRoot: f.repoRoot,
        voiceRoot: f.voiceRoot,
        profileRef: f.profilePath,
        stateRoot: f.stateRoot,
        expectedStateRoot: f.expectedStateRoot,
        expectedAsrBinRoot: path.dirname(f.asrPath),
        expectedProfileSha256: "0".repeat(64),
        expectedAsrSha256: f.asrSha256,
        apply: true,
      }),
      { code: "voice_label_profile_digest_mismatch" },
    );
    const health = JSON.parse(await readFile(path.join(f.stateRoot, "health.json"), "utf8"));
    assert.equal(health.status, "failed");
    assert.equal(health.error_code, "voice_label_profile_digest_mismatch");
    const receipts = await readdir(path.join(f.stateRoot, "receipts"));
    assert.equal(receipts.length, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a live process lock prevents a second worker", async () => {
  const f = await fixture();
  try {
    await mkdir(f.stateRoot, { recursive: true });
    await writeFile(path.join(f.stateRoot, "worker.lock"), `${JSON.stringify({
      pid: process.pid,
      started_at: new Date().toISOString(),
    })}\n`);
    const result = await runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: f.stateRoot,
      expectedStateRoot: f.expectedStateRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      ...implementations(f, []),
    });
    assert.equal(result.status, "already_running");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("apply rejects state custody inside the repository before any state write", async () => {
  const f = await fixture();
  try {
    await assert.rejects(runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: f.repoRoot,
      expectedStateRoot: f.repoRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      ...implementations(f, []),
    }), { code: "voice_label_state_root_unsafe" });
    await assert.rejects(readFile(path.join(f.repoRoot, "health.json")), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("apply rejects a reparse-backed expected state root before any state write", async () => {
  const f = await fixture();
  try {
    const actualStateRoot = path.join(f.root, "actual-state");
    const linkedStateRoot = path.join(f.root, "linked-state");
    await mkdir(actualStateRoot, { recursive: true });
    await symlink(actualStateRoot, linkedStateRoot, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: path.join(linkedStateRoot, "worker"),
      expectedStateRoot: linkedStateRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      ...implementations(f, []),
    }), { code: "voice_label_state_root_unsafe" });
    await assert.rejects(readFile(path.join(actualStateRoot, "worker", "health.json")), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("apply rejects a pre-existing receipts junction before any external write", async () => {
  const f = await fixture();
  try {
    const outside = path.join(f.root, "outside-receipts");
    await mkdir(f.stateRoot, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(
      outside,
      path.join(f.stateRoot, "receipts"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: f.stateRoot,
      expectedStateRoot: f.expectedStateRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      ...implementations(f, []),
    }), { code: "voice_label_state_descendant_unsafe" });
    assert.deepEqual(await readdir(outside), []);
    await assert.rejects(readFile(path.join(f.stateRoot, "health.json")), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("worker rejects same-or-overlapping runtime and repository roots", async () => {
  const f = await fixture();
  try {
    await assert.rejects(runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      expectedRuntimeRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: f.stateRoot,
      expectedStateRoot: f.expectedStateRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      ...implementations(f, []),
    }), { code: "voice_label_runtime_repo_overlap" });
    await assert.rejects(readFile(path.join(f.stateRoot, "health.json")), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("apply allows only the exact repo workspace alias to the approved queue root", async () => {
  const f = await workspaceAliasFixture();
  try {
    const calls = [];
    const impl = implementations(f, calls);
    impl.loadProfileImpl = async () => ({
      profile: {
        queue_root: "_workspaces/system/voice_capture/local_asr_queue",
        output_subdir: "analysis/local_asr",
        run_id: "synthetic-run",
      },
    });
    const result = await runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: f.stateRoot,
      expectedStateRoot: f.expectedStateRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      ...impl,
    });
    assert.equal(result.status, "ok");
    assert.deepEqual(calls, ["enqueue", "drain", "labels"]);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("apply rejects the repo workspace alias when it targets a different queue root", async () => {
  const f = await workspaceAliasFixture({ wrongTarget: true });
  try {
    const calls = [];
    const impl = implementations(f, calls);
    impl.loadProfileImpl = async () => ({
      profile: {
        queue_root: "_workspaces/system/voice_capture/local_asr_queue",
        output_subdir: "analysis/local_asr",
        run_id: "synthetic-run",
      },
    });
    await assert.rejects(runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: f.stateRoot,
      expectedStateRoot: f.expectedStateRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      ...impl,
    }), { code: "voice_label_queue_root_unsafe" });
    assert.deepEqual(calls, []);
    const health = JSON.parse(await readFile(path.join(f.stateRoot, "health.json"), "utf8"));
    assert.equal(health.status, "failed");
    assert.equal(health.error_code, "voice_label_queue_root_unsafe");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

for (const [field, value, code] of [
  ["queue_root", "../escape", "voice_label_queue_root_unsafe"],
  ["output_subdir", "analysis/../../escape", "voice_label_output_subdir_unsafe"],
]) {
  test(`apply rejects traversal in ${field} before processing`, async () => {
    const f = await fixture();
    try {
      const calls = [];
      const impl = implementations(f, calls);
      impl.loadProfileImpl = async () => ({
        profile: {
          queue_root: "voice/local_asr_queue",
          output_subdir: "analysis/local_asr",
          run_id: "synthetic-run",
          [field]: value,
        },
      });
      await assert.rejects(runContinuousVoiceLabelWorker({
        repoRoot: f.repoRoot,
        voiceRoot: f.voiceRoot,
        profileRef: f.profilePath,
        stateRoot: f.stateRoot,
        expectedStateRoot: f.expectedStateRoot,
        expectedAsrBinRoot: path.dirname(f.asrPath),
        expectedProfileSha256: f.profileSha256,
        expectedAsrSha256: f.asrSha256,
        apply: true,
        ...impl,
      }), { code });
      assert.deepEqual(calls, []);
      const health = JSON.parse(await readFile(path.join(f.stateRoot, "health.json"), "utf8"));
      assert.equal(health.status, "failed");
      assert.equal(health.error_code, code);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
}

test("a fresh malformed lock fails closed as busy", async () => {
  const f = await fixture();
  try {
    await mkdir(f.stateRoot, { recursive: true });
    const lockPath = path.join(f.stateRoot, "worker.lock");
    await writeFile(lockPath, "{");
    const result = await runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: f.stateRoot,
      expectedStateRoot: f.expectedStateRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      ...implementations(f, []),
    });
    assert.equal(result.status, "already_running");
    assert.equal(await readFile(lockPath, "utf8"), "{");
    assert.deepEqual((await readdir(f.stateRoot)).filter((name) => name.includes(".stale-")), []);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("an old malformed lock is recovered before processing", async () => {
  const f = await fixture();
  try {
    await mkdir(f.stateRoot, { recursive: true });
    const lockPath = path.join(f.stateRoot, "worker.lock");
    await writeFile(lockPath, "{");
    const old = new Date("2026-07-24T09:00:00.000Z");
    await utimes(lockPath, old, old);
    const calls = [];
    const result = await runContinuousVoiceLabelWorker({
      repoRoot: f.repoRoot,
      voiceRoot: f.voiceRoot,
      profileRef: f.profilePath,
      stateRoot: f.stateRoot,
      expectedStateRoot: f.expectedStateRoot,
      expectedAsrBinRoot: path.dirname(f.asrPath),
      expectedProfileSha256: f.profileSha256,
      expectedAsrSha256: f.asrSha256,
      apply: true,
      now: new Date("2026-07-24T10:00:00.000Z"),
      ...implementations(f, calls),
    });
    assert.equal(result.status, "ok");
    assert.deepEqual(calls, ["enqueue", "drain", "labels"]);
    assert.equal((await readdir(f.stateRoot)).filter((name) => name.includes(".stale-")).length, 1);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
