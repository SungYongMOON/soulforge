import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
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
  runPlaudSync,
} from "./plaud_ingest.mjs";

const RECORDING_ID = "df8097c8505379f1702100f6fbd9cc16";

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
      commandRunner: () => "No recordings in the last 14 days.\n",
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
    assert.equal(result.recordings[0].state, "pending_provider_processing");
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
      ["pending_provider_processing", "ready_to_import"],
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
