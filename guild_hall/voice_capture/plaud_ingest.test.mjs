import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acknowledgeDelivery, validateDeliveryReceipt } from "./delivery_receipt.mjs";
import { runContinuousVoiceLabelWorker } from "./continuous_label_worker.mjs";
import { buildDefaultLocalAsrProfile, drainLocalAsrQueue, enqueueLocalAsrSession } from "./local_asr.mjs";
import {
  assertPlaudSessionPublicationBudget,
  buildDefaultPlaudSyncProfile,
  buildPlaudLaunchdDefinition,
  buildPlaudSessionId,
  commandAvailability,
  drainPlaudMailQueue,
  parsePlaudAudioUrl,
  parsePlaudFileOutput,
  parsePlaudProviderTimestamp,
  parsePlaudRecentOutput,
  parsePlaudTranscript,
  parsePlaudVersion,
  plaudSessionCustodyBudget,
  renderPlaudLaunchdPlist,
  runPlaudCommand,
  materializePlaudRecording,
  runPlaudSync as runPlaudSyncImpl,
} from "./plaud_ingest.mjs";

const RECORDING_ID = "df8097c8505379f1702100f6fbd9cc16";
function filesOutput(rows, page, pageSize = 100) {
  const selected = rows.slice((page - 1) * pageSize, page * pageSize);
  return [`Files on this page: ${selected.length}`,
    `  ${"ID".padEnd(34)}  ${"NAME".padEnd(36)}  ${"DATE".padEnd(12)}  DURATION`, `  ${"─".repeat(98)}`,
    ...selected.map((row) => `  ${row.id.padEnd(34)}  ${"synthetic".padEnd(36)}  ${(row.date ?? "-").padEnd(12)}  1m00s`), `Page ${page}`].join("\n");
}

// Older importer fixtures provide a catalog snapshot; transport is exercised by
// plaud_catalog.test and the real-helper integration cases below/at ingress.
function runPlaudSync(options) {
  const commandRunner = options.commandRunner;
  return runPlaudSyncImpl({ clock: () => Date.parse("2026-07-20T00:00:00Z"), ...options,
    commandRunner: (command, args, context) => {
      const raw = commandRunner(command, args, context);
      return args[0] === "file" && !/^created_at:/mu.test(raw)
        ? `${raw}\ncreated_at: 2026-07-10T00:00:00Z\n` : raw;
    },
    catalogRunner: options.catalogRunner ?? (async () => ({ complete: true, page_count: 1,
      rows: parsePlaudRecentOutput(commandRunner(options.profile.plaud_command, ["recent", "--days", String(options.profile.poll_days)], { cwd: options.repoRoot })) })),
  });
}

test("complete files catalog exceeds recent 300 and bounded probes fairly reach the oldest ready row", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "plaud-catalog-fair-"));
  try {
    const rows = Array.from({ length: 407 }, (_, index) => ({ id: (index + 1).toString(16).padStart(32, "0"), date: "2026-07-02" }));
    const readyId = rows.at(-1).id;
    const profile = { ...buildDefaultPlaudSyncProfile(), poll_days: 90, max_new_per_run: 1 };
    let cursor;
    let found = false;
    for (let cycle = 0; cycle < Math.ceil(rows.length / 20); cycle += 1) {
      const result = await runPlaudSyncImpl({ repoRoot, profile, skipPreflight: true, apply: false,
        clock: () => Date.parse("2026-09-10T12:00:00Z"), probeCursor: cursor,
        commandRunner: (_command, args) => {
          if (args[0] === "files") return filesOutput(rows, Number(args[args.indexOf("--page") + 1]));
          assert.equal(args[0], "file");
          return `id: ${args[1]}\ncreated_at: 2026-07-02T00:00:00Z\nstart_at: 2026-07-02T00:00:00Z\naudio: available\ntranscript: ${args[1] === readyId ? "available" : "-"}\nsummary: -\n`;
        },
      });
      assert.equal(result.catalog_count, 407);
      assert.equal(result.recent_count, 407);
      assert.ok(result.metadata_probed_count <= 20);
      cursor = result.probe_cursor_sha256;
      if (result.recordings.some((row) => row.id === readyId && row.state === "ready_to_import")) { found = true; break; }
    }
    assert.equal(found, true);
    assert.deepEqual(await readdir(repoRoot), []);
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
});

test("files lookback preserves exact created_at cutoff and leaves unknown dates unclaimed", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "plaud-cutoff-"));
  try {
    const now = Date.parse("2026-09-10T12:00:00Z");
    const cutoff = now - 86400000;
    const stamps = [cutoff - 1, cutoff, cutoff + 1];
    const rows = stamps.map((stamp, index) => {
      const local = new Date(stamp);
      return { id: (index + 1).toString(16).padStart(32, "0"),
        date: `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}` };
    });
    let unknown = false;
    const options = { repoRoot, profile: { ...buildDefaultPlaudSyncProfile(), poll_days: 1, max_new_per_run: 10 },
      skipPreflight: true, apply: false, clock: () => now,
      commandRunner: (_command, args) => args[0] === "files" ? filesOutput(rows, Number(args[args.indexOf("--page") + 1]))
        : `id: ${args[1]}\ncreated_at: ${unknown ? "-" : new Date(stamps[rows.findIndex((row) => row.id === args[1])]).toISOString()}\naudio: available\ntranscript: available\n` };
    const exact = await runPlaudSyncImpl(options);
    assert.equal(exact.recent_count, 2);
    assert.equal(exact.new_candidate_count, 2);
    assert.equal(exact.recordings.length, 2);
    unknown = true;
    const uncertain = await runPlaudSyncImpl(options);
    assert.equal(uncertain.lookback_complete, false);
    assert.equal(uncertain.recent_count, null);
    assert.equal(uncertain.new_candidate_count, null);
    assert.equal(uncertain.recordings.some((row) => row.state === "ready_to_import"), false);
    assert.deepEqual(await readdir(repoRoot), []);
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
});

for (const interleaving of ["after", "completion", "resume", "busy-retry"]) test(`audio-first real helpers preserve provider and ASR across ${interleaving} backfill`, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "plaud-audio-first-"));
  try {
    const repoRoot = path.join(root, "data");
    const voiceRoot = path.join(repoRoot, "ingress/plaud");
    const runtimeRoot = path.join(root, "runtime");
    const stateRoot = path.join(root, "state");
    const binRoot = path.join(root, "bin");
    await Promise.all([mkdir(voiceRoot, { recursive: true }), mkdir(runtimeRoot), mkdir(stateRoot), mkdir(binRoot)]);
    const audioBytes = Buffer.from("synthetic actual download bytes");
    let downloads = 0;
    let badLength = false;
    t.mock.method(globalThis, "fetch", async () => {
      downloads += 1;
      const response = new Response(audioBytes, { headers: { "content-type": "audio/ogg", "content-length": String(audioBytes.length + Number(badLength)) } });
      Object.defineProperty(response, "url", { value: "https://example.test/source.ogg" });
      return response;
    });
    const profile = { ...buildDefaultPlaudSyncProfile(), output_root: "ingress/plaud", max_new_per_run: 1,
      register_library: true, write_workmeta_draft: false };
    let providerAvailable = false;
    const rows = [{ id: RECORDING_ID, date: "2026-09-08" }];
    const options = { repoRoot, profile, skipPreflight: true, apply: true, requireHppCustody: true,
      clock: () => Date.parse("2026-09-10T12:00:00Z"), audioProbe: async () => ({ duration_seconds: 5, format: "ogg", codec: "opus" }),
      commandRunner: (_command, args) => {
        if (args[0] === "files") return filesOutput(rows, Number(args[args.indexOf("--page") + 1]));
        if (args[0] === "file") return `id: ${RECORDING_ID}\ncreated_at: 2026-09-08T00:00:00Z\nstart_at: 2026-09-08T00:00:00Z\naudio: available\ntranscript: ${providerAvailable ? "available" : "-"}\nsummary: -\n`;
        if (args[0] === "audio") return "https://example.test/source.ogg?signature=never-store";
        assert.equal(args[0], "transcript");
        writeFileSync(args.at(-1), "[00:00 - 00:02] Speaker 1: PROVIDER ORIGINAL\n");
        return "saved";
      } };
    const strict = await runPlaudSyncImpl(options);
    assert.equal(strict.recordings[0].state, "provider_artifact_unavailable");
    assert.equal(downloads, 0);
    profile.readiness = { ...profile.readiness, require_transcript: false };
    badLength = true;
    assert.equal((await runPlaudSyncImpl(options)).recordings[0].state, "import_failed_retryable");
    assert.equal((await readdir(voiceRoot)).includes("sessions"), false);
    badLength = false;
    const captured = await runPlaudSyncImpl(options);
    assert.equal(captured.recordings[0].state, "imported");
    const sessionRef = captured.recordings[0].session_ref;
    const sessionDir = path.join(repoRoot, sessionRef);
    const manifestPath = path.join(sessionDir, "session_manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.source_sha256, createHash("sha256").update(audioBytes).digest("hex"));
    assert.equal(manifest.audio.size_bytes, audioBytes.length);
    assert.equal(manifest.transcript.status, "not_available");
    assert.equal(manifest.transcript.provider_original_ref, null);
    assert.equal((await readdir(path.join(sessionDir, "provider_export"))).length, 0);
    assert.equal((await readdir(sessionDir)).includes("transcript.txt"), false);
    assert.equal(JSON.stringify(manifest).includes("never-store"), false);
    const libraryPath = path.join(voiceRoot, "library/recordings/2026-09-08", manifest.session_id, "recording_manifest.json");
    const audioOnlyLibrary = JSON.parse(await readFile(libraryPath, "utf8"));
    assert.equal(audioOnlyLibrary.payload_refs.transcript_jsonl_ref, null);
    assert.equal(audioOnlyLibrary.payload_refs.transcript_txt_ref, null);
    const downloadCount = downloads;
    assert.equal((await runPlaudSyncImpl(options)).recordings.some((row) => row.state === "imported"), false);
    assert.equal(downloads, downloadCount);
    const localProfile = { ...buildDefaultLocalAsrProfile(), queue_root: "ingress/plaud/local_asr_queue",
      run_id: "synthetic-independent", model_path: "model.bin", chunk_seconds: 10, overlap_seconds: 0, vad: { enabled: false } };
    const profileBytes = JSON.stringify(localProfile);
    const profilePath = path.join(voiceRoot, "config/asr.json");
    const asrPath = path.join(binRoot, "whisper-cli.exe");
    await mkdir(path.dirname(profilePath), { recursive: true });
    await writeFile(profilePath, profileBytes);
    await writeFile(asrPath, "synthetic engine");
    await writeFile(path.join(repoRoot, "model.bin"), "synthetic model");
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    let backfilled;
    let injectBackfill = ["completion", "busy-retry"].includes(interleaving);
    const lockPath = `${manifestPath}.merge.lock`;
    const syntheticLock = JSON.stringify({ pid: process.pid, token: "synthetic-other-writer" });
    let engineCalls = 0;
    const runAsr = () => runContinuousVoiceLabelWorker({ repoRoot, voiceRoot,
      profileRef: profilePath, expectedProfileSha256: hash(profileBytes), expectedAsrSha256: hash("synthetic engine"),
      expectedAsrBinRoot: binRoot, stateRoot, expectedStateRoot: stateRoot, apply: true,
      preflightImpl: async () => ({ ok: true, checks: [{ id: "whisper-cli_available", resolved_path: asrPath }] }),
      loadProfileImpl: async () => ({ profile: localProfile }),
      drainImpl: (args) => drainLocalAsrQueue({ ...args, notificationEmitter: async () => {
        if (injectBackfill) {
          injectBackfill = false;
          providerAvailable = true;
          backfilled = await runPlaudSyncImpl({ ...options, schedulingEpoch: 2 });
          if (interleaving === "busy-retry") await writeFile(lockPath, syntheticLock, { flag: "wx" });
        }
        return { status: "disabled" };
      }, commandRunner: (command, args) => {
        if (command === "ffmpeg") writeFileSync(args.at(-1), "synthetic wav");
        else { engineCalls += 1; assert.equal(command, asrPath); writeFileSync(`${args[args.indexOf("-of") + 1]}.json`, JSON.stringify({ transcription: [{ offsets: { from: 0, to: 1000 }, text: "INDEPENDENT ASR" }] })); }
        return { status: 0 };
      } }),
      sweepImpl: async () => ({ processed_session_count: 0, failed_session_count: 0 }),
    });
    let asr = await runAsr();
    if (interleaving === "busy-retry") {
      assert.equal(asr.asr.failed_count, 1);
      assert.equal(await readFile(lockPath, "utf8"), syntheticLock);
      assert.equal(JSON.parse(await readFile(path.join(sessionDir, localProfile.output_subdir, localProfile.run_id, "analysis_manifest.json"), "utf8")).state, "completed");
      assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).transcript.status, "provider_transcript_present_unverified");
      await rm(lockPath); // The fixture owner releases its own lock; the worker must not steal it.
      asr = await runAsr();
    }
    assert.equal(asr.asr.processed_count, 1);
    const independentPath = path.join(sessionDir, localProfile.output_subdir, localProfile.run_id, "transcript.txt");
    const independentBytes = await readFile(independentPath);
    if (["after", "resume"].includes(interleaving)) {
      assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).transcript.status, "not_available");
      assert.equal((await readdir(sessionDir)).includes("transcript.txt"), false);
    }
    if (interleaving === "resume") {
      await enqueueLocalAsrSession({ repoRoot, profile: localProfile, sessionDir, apply: true });
      injectBackfill = true;
      assert.equal((await runAsr()).asr.processed_count, 1);
    }
    if (interleaving === "after") {
    providerAvailable = true;
    let interruptBackfill = true;
    options.schedulingEpoch = 2;
    options.beforeSharedWrite = async () => {
      if (interruptBackfill && (await readdir(path.join(sessionDir, "provider_export"))).includes("transcript.txt")) {
        interruptBackfill = false;
        throw new Error("synthetic post-publication fence interruption");
      }
    };
    await assert.rejects(runPlaudSyncImpl(options), /synthetic post-publication fence interruption/);
    assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).transcript.status, "not_available");
    assert.equal(downloads, downloadCount);
    delete options.beforeSharedWrite;
    backfilled = await runPlaudSyncImpl(options);
    }
    assert.equal(engineCalls, 1);
    assert.equal(backfilled.recordings[0].state, "provider_backfilled");
    assert.equal(downloads, downloadCount);
    assert.equal(backfilled.provider_backfill_pending_count, 0);
    assert.deepEqual(await readFile(independentPath), independentBytes);
    assert.match(await readFile(path.join(sessionDir, "provider_export/transcript.txt"), "utf8"), /PROVIDER ORIGINAL/);
    const updated = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(updated.transcript.evidence_role, "auxiliary_unverified");
    assert.equal(updated.independent_transcription.status, "completed");
    assert.equal(JSON.parse(await readFile(libraryPath, "utf8")).payload_refs.transcript_txt_ref, `${sessionRef}/transcript.txt`);
    const receipt = JSON.parse(await readFile(path.join(voiceRoot, "delivery/producer_receipts", `${updated.session_id}.json`), "utf8"));
    validateDeliveryReceipt(receipt, { voiceRootRef: "ingress/plaud" });
    assert.equal(receipt.stage, "local_asr_ready");
    assert.ok(receipt.files.some((file) => file.role === "provider_original_transcript"));
    assert.equal((await acknowledgeDelivery({ repoRoot, voiceRootRef: "ingress/plaud", sessionId: updated.session_id, consumerNode: "synthetic-consumer", apply: false })).status, "delivered");
    assert.equal((await readdir(repoRoot)).includes("guild_hall"), false);
    assert.equal((await readdir(repoRoot)).includes("_workspaces"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("audio-first preserves verified audio when an available provider transcript fetch fails", async (t) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "plaud-audio-provider-failure-"));
  try {
    await mkdir(path.join(repoRoot, "ingress/plaud"), { recursive: true });
    const bytes = Buffer.from("synthetic-audio");
    t.mock.method(globalThis, "fetch", async () => {
      const response = new Response(bytes, { headers: { "content-type": "audio/ogg", "content-length": String(bytes.length) } });
      Object.defineProperty(response, "url", { value: "https://example.test/source.ogg" });
      return response;
    });
    const profile = { ...buildDefaultPlaudSyncProfile(), output_root: "ingress/plaud", register_library: true,
      write_workmeta_draft: false, readiness: { require_audio: true, require_transcript: false } };
    const result = await materializePlaudRecording({ repoRoot, profile, requireHppCustody: true,
      metadata: { id: RECORDING_ID, name: "synthetic", start_at: "2026-09-08T00:00:00Z", audio_available: true, transcript_available: true, summary_available: false },
      audioProbe: async () => ({ duration_seconds: 1, format: "ogg", codec: "opus" }),
      commandRunner: (_command, args) => {
        if (args[0] === "audio") return "https://example.test/source.ogg";
        throw Object.assign(new Error("PRIVATE PROVIDER DETAIL"), { code: "plaud_command_timeout" });
      },
    });
    assert.equal(result.audio_present, true);
    assert.equal(result.provider_transcript_state, "provider_output_failed_retryable");
    assert.equal(result.provider_failure_kind, "plaud_command_timeout");
    assert.equal(result.delivery.state, "ready");
    assert.equal(JSON.stringify(result).includes("PRIVATE PROVIDER DETAIL"), false);
    assert.deepEqual(await readdir(path.join(repoRoot, result.session_ref, "provider_export")), []);
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
});

for (const kind of ["native", "cli-exit-4", "signal-only"]) test(`command timeout classification preserves ${kind} semantics`, async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "plaud-timeout-kind-"));
  try {
    let calls = 0;
    await assert.rejects(runPlaudSyncImpl({ repoRoot, profile: buildDefaultPlaudSyncProfile(), skipPreflight: true,
      clock: () => Date.parse("2026-09-10T12:00:00Z"), commandTimeoutMs: 100,
      commandRunner: (command, args, options) => runPlaudCommand(command, args, { ...options, platform: "linux",
        spawnImpl: () => {
          calls += 1;
          return kind === "cli-exit-4" ? { status: 4, stderr: "PRIVATE" }
            : { status: null, signal: "SIGTERM", error: kind === "native" ? { code: "ETIMEDOUT" } : undefined, stderr: "PRIVATE" };
        },
      }),
    }), (error) => {
      assert.equal(error.code, kind === "signal-only" ? "plaud_catalog_command_failed" : "plaud_command_timeout");
      assert.equal(error.stderr, undefined);
      return true;
    });
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(repoRoot), []);
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
});

test("catalog deadline and rate failures stop before any source publication and expose only fixed codes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "plaud-budget-"));
  try {
    const clock = () => Date.parse("2026-09-10T12:00:00Z");
    let commands = 0;
    const options = { repoRoot, profile: buildDefaultPlaudSyncProfile(), skipPreflight: true, apply: true,
      clock, commandTimeoutMs: 120000,
      deadlineAtMs: clock() + 120000 * (process.platform === "win32" ? 2 : 1) - 1,
      commandRunner: () => { commands += 1; throw Object.assign(new Error("PRIVATE provider detail"), { stderr: "Error: API error: 429 PRIVATE URL", exitCode: 1 }); } };
    await assert.rejects(runPlaudSyncImpl(options), { code: "plaud_catalog_deadline_exceeded" });
    assert.equal(commands, 0);
    options.deadlineAtMs = clock() + 1800000;
    await assert.rejects(runPlaudSyncImpl(options), (error) => {
      assert.equal(error.code, "plaud_rate_limited");
      assert.equal(error.message, "plaud_rate_limited");
      assert.equal(error.stderr, undefined);
      return true;
    });
    assert.equal(commands, 1);
    assert.deepEqual(await readdir(repoRoot), []);
  } finally { await rm(repoRoot, { recursive: true, force: true }); }
});

test("PLAUD session budget reserves bounded post-publication metadata growth", () => {
  const manifest = {
    schema_version: "soulforge.voice.session_manifest.v0",
    post_import_contract: {
      library_required: true,
      delivery_required: true,
    },
  };
  const postImportState = {
    schema_version: "soulforge.voice.plaud_post_import_state.v1",
    library_state: "pending",
    delivery_state: "pending",
  };
  const accepted = assertPlaudSessionPublicationBudget({
    fileCount: plaudSessionCustodyBudget.max_files,
    totalBytes: plaudSessionCustodyBudget.max_bytes
      - plaudSessionCustodyBudget.post_publication_reserve_bytes,
    manifest,
    postImportState,
  });
  assert.equal(
    accepted.projected_max_total_bytes <= plaudSessionCustodyBudget.max_bytes,
    true,
  );
  assert.throws(() => assertPlaudSessionPublicationBudget({
    fileCount: plaudSessionCustodyBudget.max_files,
    totalBytes: plaudSessionCustodyBudget.max_bytes
      - plaudSessionCustodyBudget.post_publication_reserve_bytes
      + 1,
    manifest,
    postImportState,
  }), /exceeds custody budget/);
});

test("PLAUD executable discovery uses where.exe on Windows and command -v on POSIX", () => {
  const calls = [];
  const windowsExecutable = ["C:", "Tools", "plaud.cmd"].join("\\");
  const windowsExtensionlessShim = windowsExecutable.slice(0, -4);
  const spawnImpl = (command, args, options) => {
    calls.push([command, args, options]);
    return { status: 0, stdout: command === "where.exe" ? `${windowsExtensionlessShim}\r\n${windowsExecutable}\r\n` : "/usr/local/bin/plaud\n" };
  };
  const windows = commandAvailability("plaud", { platform: "win32", spawnImpl });
  const posix = commandAvailability("plaud", { platform: "darwin", spawnImpl });
  assert.equal(windows.ok, true);
  assert.equal(windows.resolved_path, windowsExecutable);
  assert.equal(posix.ok, true);
  assert.equal(posix.resolved_path, "/usr/local/bin/plaud");
  assert.deepEqual(calls[0].slice(0, 2), ["where.exe", ["plaud"]]);
  assert.equal(calls[0][2].timeout, 120000);
  assert.equal(calls[1][0], "/bin/sh");
  assert.deepEqual(commandAvailability("plaud", {
    platform: "win32",
    spawnImpl: () => ({ status: 1, stdout: "" }),
  }), { ok: false, resolved_path: null });
});

test("PLAUD Windows runner executes a discovered npm cmd shim through the system cmd safely", () => {
  const systemRoot = ["C:", "Windows"].join("\\");
  const shimPath = ["C:", "Users", "fixture", "AppData", "Roaming", "npm", "plaud.cmd"].join("\\");
  const calls = [];
  let availabilityOptions = null;
  const stdout = runPlaudCommand("plaud", ["version"], {
    platform: "win32",
    systemRoot,
    timeoutMs: 15000,
    availabilityChecker: (_command, options) => {
      availabilityOptions = options;
      return { ok: true, resolved_path: shimPath };
    },
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: "plaud 0.3.4\n", stderr: "" };
    },
  });
  assert.equal(stdout, "plaud 0.3.4\n");
  assert.equal(calls[0].command, [systemRoot, "System32", "cmd.exe"].join("\\"));
  assert.deepEqual(calls[0].args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.match(calls[0].args[3], /plaud\.cmd/u);
  assert.equal(calls[0].options.windowsVerbatimArguments, true);
  assert.equal(calls[0].options.timeout, 15000);
  assert.equal(availabilityOptions.timeoutMs, 15000);
  assert.throws(() => runPlaudCommand("plaud", ["file", "unsafe%PATH%"], {
    platform: "win32",
    systemRoot,
    availabilityChecker: () => ({ ok: true, resolved_path: shimPath }),
    spawnImpl: () => assert.fail("unsafe command must not spawn"),
  }), { code: "plaud_windows_command_argument_unsafe" });
});

test("PLAUD CLI parsers keep ids, availability, timestamps, and speaker labels", () => {
  const recent = parsePlaudRecentOutput(`
Recordings in the last 14 days: 1

  ${RECORDING_ID}  07-10 meeting  2026-07-10  1h16m
`);
  assert.deepEqual(recent, [{ id: RECORDING_ID, name: "07-10 meeting", date: "2026-07-10", duration_display: "1h16m" }]);

  const file = parsePlaudFileOutput(`
File Details:

  id:           ${RECORDING_ID}
  name:         07-10 meeting
  created_at:   2026-07-10T04:04:32.000Z
  start_at:     2026-07-10T04:04:32.000Z
  duration:     1h16m
  serial_number: private-device-value
  audio:        available
  transcript:   available
  summary:      available
`);
  assert.equal(file.id, RECORDING_ID);
  assert.equal(file.audio_available, true);
  assert.equal(file.transcript_available, true);
  assert.equal(file.summary_available, true);
  assert.equal(Object.hasOwn(file, "serial_number"), false);

  const segments = parsePlaudTranscript("[00:10 - 00:15] Speaker 1: 첫 문장\n[61:02 - 61:08] 두 번째 문장\n");
  assert.equal(segments.length, 2);
  assert.equal(segments[0].speaker, "Speaker 1");
  assert.equal(segments[1].speaker, "UNKNOWN");
  assert.equal(segments[1].start_seconds, 3662);
  assert.equal(parsePlaudAudioUrl("Audio Download URL:\nhttps://example.test/source.ogg?signature=secret\n"), "https://example.test/source.ogg?signature=secret");
  assert.equal(parsePlaudVersion("plaud 0.3.4\ncommit abc123\n"), "0.3.4");
});

test("PLAUD timezone-less timestamps are UTC and normalize to KST", () => {
  const providerTimestamp = parsePlaudProviderTimestamp("2026-07-15T02:16:22");
  assert.equal(providerTimestamp.date.toISOString(), "2026-07-15T02:16:22.000Z");
  assert.equal(providerTimestamp.basis, "plaud_cli_utc_without_offset");
  assert.equal(parsePlaudProviderTimestamp("2026-07-15T11:16:22+0900").date.toISOString(), "2026-07-15T02:16:22.000Z");
  assert.throws(() => parsePlaudProviderTimestamp(""), /timestamp is missing/u);
});

test("PLAUD sync materializes one isolated session and skips the same provider id next time", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-sync-"));
  try {
    await mkdir(path.join(repoRoot, "_workspaces", "system", "voice_capture"), { recursive: true });
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: true,
      write_workmeta_draft: false,
    };
    const deliveryCalls = [];
    const commandRunner = (command, args) => {
      assert.equal(command, "plaud");
      if (args[0] === "recent") return `  ${RECORDING_ID}  07-10 meeting  2026-07-10  1h16m\n`;
      if (args[0] === "file") return [
        `id: ${RECORDING_ID}`,
        "name: 07-10 meeting",
        "created_at: 2026-07-10T04:04:32.000",
        "start_at: 2026-07-10T04:04:32.000",
        "duration: 1h16m",
        "serial_number: do-not-store",
        "audio: available",
        "transcript: available",
        "summary: available",
        "",
      ].join("\n");
      if (args[0] === "audio") return "Audio Download URL:\nhttps://example.test/source.ogg?signature=do-not-store\n";
      if (args[0] === "transcript") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "[00:10 - 00:15] Speaker 1: 첫 문장\n[00:16 - 00:20] Speaker 2: 두 번째 문장\n", "utf8");
        return `Transcript saved to ${args.at(-1)}\n`;
      }
      if (args[0] === "summary") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "provider summary", "utf8");
        return `Summary saved to ${args.at(-1)}\n`;
      }
      throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    const audioDownloader = async (url, outputDir) => {
      assert.match(url, /^https:\/\/example\.test/u);
      const audioPath = path.join(outputDir, "source.ogg");
      await writeFile(audioPath, "fixture-audio", "utf8");
      return { path: audioPath, size_bytes: 13, sha256: "fixture-sha256" };
    };
    const audioProbe = async () => ({
      duration_seconds: 4568.42,
      format: "ogg",
      codec: "opus",
      sample_rate_hz: 48000,
      channels: 1,
    });

    const first = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
      audioDownloader,
      audioProbe,
      deliveryReceiptEmitter: async (options) => {
        deliveryCalls.push(options);
        return { status: "ready", receipt_ref: `_workspaces/system/voice_capture/delivery/producer_receipts/${options.recordingId}.json` };
      },
      requireHppCustody: true,
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(first.recordings[0].state, "imported");
    assert.equal(first.recordings[0].transcript_segments, 2);
    assert.equal(first.recordings[0].delivery.state, "ready");
    assert.equal(deliveryCalls.length, 1);
    assert.equal(deliveryCalls[0].stage, "plaud_import_ready");
    assert.equal(deliveryCalls[0].apply, true);

    const sessionId = buildPlaudSessionId(new Date("2026-07-10T04:04:32.000Z"), RECORDING_ID);
    const sessionDir = path.join(repoRoot, "_workspaces", "system", "voice_capture", "sessions", "2026-07-10", sessionId);
    const manifest = JSON.parse(await readFile(path.join(sessionDir, "session_manifest.json"), "utf8"));
    assert.equal(manifest.provider_recording_id, RECORDING_ID);
    assert.equal(manifest.recorded_at_local, "2026-07-10T13:04:32+09:00");
    assert.equal(manifest.provider_timestamp.start_at_raw, "2026-07-10T04:04:32.000");
    assert.equal(manifest.provider_timestamp.basis, "plaud_cli_utc_without_offset");
    assert.equal(manifest.audio.evidence_role, "canonical_source_candidate");
    assert.equal(manifest.transcript.evidence_role, "auxiliary_unverified");
    assert.equal(manifest.provider_summary.direct_task_promotion_allowed, false);
    assert.equal(manifest.post_import_contract.hpp_custody_required, true);
    assert.equal(JSON.stringify(manifest).includes("signature=do-not-store"), false);
    assert.equal(JSON.stringify(manifest).includes("do-not-store"), false);

    const second = await runPlaudSync({ repoRoot, profile, skipPreflight: true, commandRunner });
    assert.equal(second.candidate_count, 0);
    assert.deepEqual(second.custody_required_session_refs, [first.recordings[0].session_ref]);
    assert.equal(deliveryCalls.length, 1);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD sync does not block canonical artifacts when optional summary download fails", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-summary-optional-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: true,
      write_workmeta_draft: false,
    };
    const commandRunner = (command, args) => {
      assert.equal(command, "plaud");
      if (args[0] === "recent") return `  ${RECORDING_ID}  Meeting  2026-07-10  10m\n`;
      if (args[0] === "file") return [
        `id: ${RECORDING_ID}`,
        "name: Meeting",
        "start_at: 2026-07-10T04:04:32.000Z",
        "audio: available",
        "transcript: available",
        "summary: available",
        "",
      ].join("\n");
      if (args[0] === "transcript") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "[00:01 - 00:05] Speaker 1: test\n", "utf8");
        return "saved\n";
      }
      if (args[0] === "summary") throw new Error("optional provider summary unavailable");
      if (args[0] === "audio") return "https://example.test/source.ogg?signature=private\n";
      throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    const result = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
      audioDownloader: async (url, outputDir) => {
        assert.match(url, /^https:\/\/example\.test/u);
        const audioPath = path.join(outputDir, "source.ogg");
        await writeFile(audioPath, "audio", "utf8");
        return { path: audioPath, size_bytes: 5, sha256: "fixture-sha256" };
      },
      audioProbe: async () => ({ duration_seconds: 10, format: "ogg", codec: "opus", sample_rate_hz: 48000, channels: 1 }),
      deliveryReceiptEmitter: async () => {
        throw new Error("synthetic delivery failure");
      },
    });
    assert.equal(result.recordings[0].state, "imported");
    assert.equal(result.recordings[0].provider_summary_fetch_failed, true);
    assert.equal(result.recordings[0].delivery.state, "prepare_failed_retryable");
    const manifest = JSON.parse(await readFile(path.join(repoRoot, result.recordings[0].session_ref, "session_manifest.json"), "utf8"));
    assert.equal(manifest.provider_summary.status, "provider_output_failed_optional");
    assert.equal(manifest.delivery_warning, "delivery_receipt_prepare_failed_retryable");

    const repaired = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
      deliveryReceiptEmitter: async () => ({ status: "ready", receipt_ref: "synthetic-only" }),
    });
    assert.equal(repaired.recordings[0].state, "reconciled");
    assert.equal(repaired.reconciled_count, 1);
    const repairedManifest = JSON.parse(await readFile(
      path.join(repoRoot, result.recordings[0].session_ref, "session_manifest.json"),
      "utf8",
    ));
    assert.equal(repairedManifest.delivery_warning, "delivery_receipt_prepare_failed_retryable");
    const postImportState = JSON.parse(await readFile(
      path.join(repoRoot, result.recordings[0].session_ref, "post_import_state.json"),
      "utf8",
    ));
    assert.equal(postImportState.delivery_state, "ready");

    const replay = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
      deliveryReceiptEmitter: async () => assert.fail("resolved repair must not repeat"),
    });
    assert.equal(replay.recordings.length, 0);
    assert.equal(replay.existing_post_import_warning_count, 0);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD atomic session carries a pending repair sidecar across post-publish fence loss", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-post-publish-fence-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: true,
      write_workmeta_draft: false,
    };
    const commandRunner = (_command, args) => {
      if (args[0] === "recent") return `  ${RECORDING_ID}  Meeting  2026-07-10  10m\n`;
      if (args[0] === "file") return [
        `id: ${RECORDING_ID}`,
        "name: Meeting",
        "start_at: 2026-07-10T04:04:32.000Z",
        "audio: available",
        "transcript: available",
        "summary: -",
        "",
      ].join("\n");
      if (args[0] === "transcript") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "[00:01 - 00:05] Speaker 1: test\n", "utf8");
        return "saved\n";
      }
      if (args[0] === "audio") return "https://example.test/source.ogg";
      throw new Error(`unexpected command: ${args[0]}`);
    };
    const audioDownloader = async (_url, outputDir) => {
      const audioPath = path.join(outputDir, "source.ogg");
      await writeFile(audioPath, "audio", "utf8");
      return { path: audioPath, size_bytes: 5, sha256: "fixture-sha256" };
    };
    const audioProbe = async () => ({
      duration_seconds: 10,
      format: "ogg",
      codec: "opus",
      sample_rate_hz: 48000,
      channels: 1,
    });
    const fenceError = new Error("continuous_lease_lost");
    fenceError.code = "continuous_lease_lost";
    fenceError.plaudSharedWriteGuardFailure = true;
    await assert.rejects(runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
      audioDownloader,
      audioProbe,
      deliveryReceiptEmitter: async () => { throw fenceError; },
    }), { code: "continuous_lease_lost" });

    const sessionId = buildPlaudSessionId(new Date("2026-07-10T04:04:32.000Z"), RECORDING_ID);
    const sessionDir = path.join(repoRoot, profile.output_root, "sessions", "2026-07-10", sessionId);
    const pendingState = JSON.parse(await readFile(path.join(sessionDir, "post_import_state.json"), "utf8"));
    assert.equal(pendingState.library_state, "pending");
    assert.equal(pendingState.delivery_state, "pending");

    const repaired = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
      deliveryReceiptEmitter: async () => ({ status: "ready", receipt_ref: "synthetic-only" }),
    });
    assert.equal(repaired.recordings[0].state, "reconciled");
    const readyState = JSON.parse(await readFile(path.join(sessionDir, "post_import_state.json"), "utf8"));
    assert.equal(readyState.library_state, "registered");
    assert.equal(readyState.delivery_state, "ready");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD rejects an audio downloader whose declared size does not match the downloaded file", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-audio-size-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    const commandRunner = (_command, args) => {
      if (args[0] === "recent") return `  ${RECORDING_ID}  Meeting  2026-07-10  10m\n`;
      if (args[0] === "file") return [
        `id: ${RECORDING_ID}`,
        "name: Meeting",
        "start_at: 2026-07-10T04:04:32.000Z",
        "audio: available",
        "transcript: available",
        "summary: -",
        "",
      ].join("\n");
      if (args[0] === "transcript") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "[00:01 - 00:05] Speaker 1: test\n", "utf8");
        return "saved\n";
      }
      if (args[0] === "audio") return "https://example.test/source.ogg";
      throw new Error(`unexpected command: ${args[0]}`);
    };
    const result = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
      audioDownloader: async (_url, outputDir) => {
        const audioPath = path.join(outputDir, "source.ogg");
        await writeFile(audioPath, "audio", "utf8");
        return { path: audioPath, size_bytes: 4, sha256: "fixture-sha256" };
      },
      audioProbe: async () => assert.fail("size mismatch must fail before probing"),
    });
    assert.equal(result.recordings[0].state, "import_failed_retryable");
    assert.equal(result.recordings[0].failure_kind, "materialization_failed");
    assert.equal(result.recordings.some((item) => item.state === "imported"), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD launchd definition persistently polls local queues and keeps generated files node-local", () => {
  const repoRoot = path.join(os.tmpdir(), "soulforge-fixture");
  const definition = buildPlaudLaunchdDefinition({ repoRoot, nodeId: "home_always_on_01" });
  assert.equal(definition.trigger, "persistent_local_queue_poll");
  assert.match(definition.output_dir, /_workspaces[/\\]_local[/\\]home_always_on_01[/\\]launchd$/u);
  const plist = renderPlaudLaunchdPlist(definition);
  assert.equal(plist.includes("WatchPaths"), false);
  assert.equal(plist.includes("StartInterval"), false);
  assert.match(plist, /<key>KeepAlive<\/key><true\/>/u);
  assert.match(plist, /while true; do/u);
  assert.match(plist, /cd .* \|\| exit 1/u);
  assert.match(plist, /&gt;\/dev\/null 2&gt;&amp;1/u);
  assert.match(plist, /soulforge_plaud_queue_drain_failed/u);
  assert.match(plist, /sleep 300/u);
  assert.match(plist, /<key>ThrottleInterval<\/key><integer>30<\/integer>/u);
});

test("PLAUD persistent queue definition rejects unsafe retry intervals before rendering a tight loop", () => {
  const base = buildDefaultPlaudSyncProfile();
  for (const retry_interval_seconds of [0, 29, 86_401, 1.5, "not-a-number"]) {
    assert.throws(
      () => buildPlaudLaunchdDefinition({
        repoRoot: path.join(os.tmpdir(), "soulforge-fixture"),
        profile: { ...base, launchd: { ...base.launchd, retry_interval_seconds } },
      }),
      /plaud_launchd_retry_interval_seconds_invalid/u,
    );
  }
});

test("PLAUD persistent queue definition retains mail and local-ASR queue refs for setup and diagnostics", () => {
  const repoRoot = path.join(os.tmpdir(), "soulforge-fixture");
  const profile = {
    ...buildDefaultPlaudSyncProfile(),
    independent_asr: {
      ...buildDefaultPlaudSyncProfile().independent_asr,
      enabled: true,
    },
  };
  const definition = buildPlaudLaunchdDefinition({ repoRoot, profile });
  assert.equal(definition.watch_paths.length, 2);
  assert.match(definition.watch_paths[0], /plaud_mail_triggers[/\\]pending/u);
  assert.match(definition.watch_paths[1], /local_asr_queue[/\\]pending/u);
});

test("PLAUD watcher drains a pending local-ASR queue even when no mail trigger is waiting", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-asr-only-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      independent_asr: {
        ...buildDefaultPlaudSyncProfile().independent_asr,
        enabled: true,
      },
    };
    const invoked = [];
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      localAsrProfile: { max_sessions_per_queue_run: 1 },
      localAsrBacklogEnqueuer: async (options) => {
        invoked.push("recover");
        assert.equal(options.apply, true);
        return { applied: true, pending_count: 1, queued_count: 1 };
      },
      localAsrQueueDrainer: async (options) => {
        invoked.push("drain");
        assert.equal(options.apply, true);
        return { applied: true, remaining_pending_count: 1, retry_required: true };
      },
    });
    assert.deepEqual(invoked, ["recover", "drain"]);
    assert.equal(result.pending_count, 0);
    assert.equal(result.retry_required, true);
    assert.deepEqual(result.local_asr.backlog_recovery, {
      applied: true,
      pending_count: 1,
      queued_count: 1,
    });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue drain moves a trigger only after a new recording imports", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "trigger.json"), JSON.stringify({ trigger_id: "fixture", enqueued_at: "2026-07-10T09:59:00Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({
        ok: true,
        recent_count: 1,
        new_candidate_count: 1,
        candidate_count: 1,
        truncated_new_candidate_count: 0,
        recordings: [{ id: RECORDING_ID, state: "imported" }],
      }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.processed_count, 1);
    await assert.rejects(readFile(path.join(pendingDir, "trigger.json"), "utf8"));
    assert.equal(
      await readFile(path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "processed", "2026-07-10", "trigger.json"), "utf8"),
      JSON.stringify({ trigger_id: "fixture", enqueued_at: "2026-07-10T09:59:00Z" }),
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue drain keeps a trigger when only unrelated existing recordings are visible", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-unmatched-"));
  try {
    const profile = { ...buildDefaultPlaudSyncProfile(), shared_workspace_required: false };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "trigger.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({
        ok: true,
        recent_count: 3,
        new_candidate_count: 0,
        candidate_count: 0,
        truncated_new_candidate_count: 0,
        recordings: [],
      }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.retry_required, true);
    assert.equal(result.resolution, "waiting_for_matching_import");
    assert.equal(await readFile(path.join(pendingDir, "trigger.json"), "utf8"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue resolves at most one oldest trigger per imported recording", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-batch-"));
  try {
    const profile = { ...buildDefaultPlaudSyncProfile(), shared_workspace_required: false };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "newer.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }), "utf8");
    await writeFile(path.join(pendingDir, "older.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({
        ok: true,
        recent_count: 1,
        truncated_new_candidate_count: 0,
        recordings: [{ id: RECORDING_ID, state: "imported" }],
      }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.processed_count, 1);
    assert.equal(result.remaining_pending_count, 1);
    assert.equal(result.retry_required, true);
    assert.equal(await readFile(path.join(pendingDir, "newer.json"), "utf8"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }));
    assert.equal(
      await readFile(path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "processed", "2026-07-10", "older.json"), "utf8"),
      JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }),
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue reserves trigger slots for retryable recordings in a mixed sync", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-mixed-sync-"));
  try {
    const profile = { ...buildDefaultPlaudSyncProfile(), shared_workspace_required: false };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "first.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:00Z" }), "utf8");
    await writeFile(path.join(pendingDir, "second.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({
        ok: true,
        recent_count: 2,
        truncated_new_candidate_count: 0,
        recordings: [
          { id: RECORDING_ID, state: "imported" },
          { id: "a".repeat(32), state: "pending_provider_processing" },
        ],
      }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.processed_count, 1);
    assert.equal(result.remaining_pending_count, 1);
    assert.equal(result.retry_required, true);
    assert.equal(await readFile(path.join(pendingDir, "second.json"), "utf8"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue expires only old triggers and keeps newer triggers pending", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-mixed-age-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      launchd: { ...buildDefaultPlaudSyncProfile().launchd, unresolved_after_seconds: 60 },
    };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "old.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:55:00Z" }), "utf8");
    await writeFile(path.join(pendingDir, "new.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({ ok: true, recent_count: 2, truncated_new_candidate_count: 0, recordings: [] }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.unresolved_count, 1);
    assert.equal(result.remaining_pending_count, 1);
    assert.equal(result.retry_required, true);
    assert.equal(await readFile(path.join(pendingDir, "new.json"), "utf8"), JSON.stringify({ enqueued_at: "2026-07-10T09:59:30Z" }));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue moves an unmatched old trigger to unresolved review", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-unresolved-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      launchd: { ...buildDefaultPlaudSyncProfile().launchd, unresolved_after_seconds: 60 },
    };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "trigger.json"), JSON.stringify({ enqueued_at: "2026-07-10T09:55:00Z" }), "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      syncRunner: async () => ({ ok: true, recent_count: 2, truncated_new_candidate_count: 0, recordings: [] }),
      now: new Date("2026-07-10T10:00:00.000Z"),
    });
    assert.equal(result.retry_required, false);
    assert.equal(result.unresolved_count, 1);
    assert.equal(result.resolution, "unresolved_requires_review");
    assert.equal(
      await readFile(path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "unresolved", "2026-07-10", "trigger.json"), "utf8"),
      JSON.stringify({ enqueued_at: "2026-07-10T09:55:00Z" }),
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD mail queue drain retains the trigger when no recent recording is visible yet", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-trigger-retry-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    const pendingDir = path.join(repoRoot, profile.output_root, "plaud_mail_triggers", "pending");
    await mkdir(pendingDir, { recursive: true });
    await writeFile(path.join(pendingDir, "trigger.json"), "{}", "utf8");
    const result = await drainPlaudMailQueue({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner: (_command, args) => filesOutput([], Number(args[args.indexOf("--page") + 1])),
    });
    assert.equal(result.retry_required, true);
    assert.equal(result.processed_count, 0);
    assert.equal(await readFile(path.join(pendingDir, "trigger.json"), "utf8"), "{}");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD sync keeps a recording retryable when the required transcript cannot be parsed", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-transcript-empty-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    const commandRunner = (command, args) => {
      assert.equal(command, "plaud");
      if (args[0] === "recent") return `  ${RECORDING_ID}  Meeting  2026-07-10  10m\n`;
      if (args[0] === "file") return [
        `id: ${RECORDING_ID}`,
        "name: Meeting",
        "start_at: 2026-07-10T04:04:32.000Z",
        "audio: available",
        "transcript: available",
        "summary: -",
        "",
      ].join("\n");
      if (args[0] === "transcript") {
        mkdirSync(path.dirname(args.at(-1)), { recursive: true });
        writeFileSync(args.at(-1), "timestamp 형식이 없는 전사", "utf8");
        return "saved\n";
      }
      throw new Error(`unexpected command: ${args.join(" ")}`);
    };
    const result = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner,
    });
    assert.equal(result.recordings[0].state, "import_failed_retryable");
    assert.equal(result.recordings[0].failure_kind, "transcript_parse_empty");
    await assert.rejects(
      readdir(path.join(repoRoot, profile.output_root, "sessions")),
      { code: "ENOENT" },
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD sync always runs the after-recording fence for pending provider work", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-pending-fence-"));
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
    };
    let before = 0;
    let after = 0;
    const result = await runPlaudSync({
      repoRoot,
      profile,
      apply: true,
      skipPreflight: true,
      commandRunner: (_command, args) => {
        if (args[0] === "recent") return `  ${RECORDING_ID}  Pending  2026-07-10  10m\n`;
        if (args[0] === "file") return [
          `id: ${RECORDING_ID}`,
          "name: Pending",
          "start_at: 2026-07-10T04:04:32.000Z",
          "audio: processing",
          "transcript: processing",
          "summary: -",
          "",
        ].join("\n");
        throw new Error(`unexpected command: ${args[0]}`);
      },
      beforeRecording: async () => { before += 1; },
      afterRecording: async () => { after += 1; },
    });
    assert.equal(result.recordings[0].state, "provider_artifact_unavailable");
    assert.equal(before, 1);
    assert.equal(after, 1);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("PLAUD sync probes past pending work to use the bounded ready-import slot", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-plaud-ready-behind-pending-"));
  const readyId = "a".repeat(32);
  try {
    const profile = {
      ...buildDefaultPlaudSyncProfile(),
      shared_workspace_required: false,
      register_library: false,
      write_workmeta_draft: false,
      max_new_per_run: 1,
    };
    const result = await runPlaudSync({
      repoRoot,
      profile,
      apply: false,
      skipPreflight: true,
      probeCursor: createHash("sha256").update(readyId).digest("hex"),
      commandRunner: (_command, args) => {
        if (args[0] === "recent") {
          return [
            `  ${RECORDING_ID}  Pending  2026-07-10  10m`,
            `  ${readyId}  Ready  2026-07-09  10m`,
            "",
          ].join("\n");
        }
        if (args[0] === "file" && args[1] === RECORDING_ID) {
          return [
            `id: ${RECORDING_ID}`,
            "name: Pending",
            "start_at: 2026-07-10T04:04:32.000Z",
            "audio: processing",
            "transcript: processing",
            "summary: -",
            "",
          ].join("\n");
        }
        if (args[0] === "file" && args[1] === readyId) {
          return [
            `id: ${readyId}`,
            "name: Ready",
            "start_at: 2026-07-09T04:04:32.000Z",
            "audio: available",
            "transcript: available",
            "summary: -",
            "",
          ].join("\n");
        }
        throw new Error(`unexpected command: ${args.join(" ")}`);
      },
    });

    assert.equal(result.candidate_count, 2);
    assert.equal(result.truncated_new_candidate_count, 0);
    assert.deepEqual(
      result.recordings.map((recording) => recording.state),
      ["provider_artifact_unavailable", "ready_to_import"],
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
