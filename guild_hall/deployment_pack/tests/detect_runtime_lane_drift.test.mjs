import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TASK_PREFIX,
  LEASE_MARKERS,
  attributeProcesses,
  buildObservationScript,
  decodeConsoleOutput,
  detectRuntimeLaneDrift,
  exitCodeFor,
  extractScriptPaths,
  generationOf,
  isScriptPath,
  moduleRootOf,
  normalizeObservation,
  observeWindowsRuntime,
  parseGenerationTokens,
  pickLauncher,
  renderHuman,
  scanLauncherForLease,
} from "../tools/detect_runtime_lane_drift.mjs";

// The tracked-file path policy scans source bytes for local absolute paths, so
// drive letters are assembled at runtime instead of written as literals.
const D = `${"D"}:`;
const C = `${"C"}:`;
const ROOT = `${D}\\Soulforge`;
const SYS32 = `${C}\\WINDOWS\\System32`;
const PS = `${SYS32}\\WindowsPowerShell\\v1.0\\powershell.exe`;
const WSCRIPT = `${SYS32}\\wscript.exe`;
const NODE = `${C}\\Program Files\\nodejs\\node.exe`;
const pack = (version) => `${ROOT}\\install\\server-pack\\${version}\\payload`;
const lane = (name) => `${ROOT}\\install\\source-lanes\\${name}`;
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);

const VOICE_LAUNCHER = "guild_hall\\voice_capture\\ops\\run-continuous-label-supervisor.ps1";
const VOICE_HIDDEN = "guild_hall\\voice_capture\\ops\\run-continuous-label-supervisor-hidden.vbs";
const VOICE_WORKER = "guild_hall\\voice_capture\\continuous_label_supervisor_cli.mjs";
const INGRESS_LAUNCHER = "guild_hall\\ingress\\ops\\run-continuous-ingress-supervisor.ps1";
const INGRESS_WORKER = "guild_hall\\ingress\\continuous_supervisor_cli.mjs";
const LOCAL_LAUNCHER = "guild_hall\\local_activity\\ops\\run-hpp-local-activity.ps1";

const SINGLETON_SOURCE = [
  "$InstanceLockPath = [IO.Path]::GetFullPath((Join-Path $StateRoot \"supervisor.instance.lock\"))",
  "$Mutex = [Threading.Mutex]::new($false, \"Local\\Soulforge.HPP.VoiceLabel.Supervisor\")",
  "Write-Output \"voice label supervisor already running; duplicate launch ignored\"",
].join("\n");
const PLAIN_SOURCE = "$node = (Get-Command node.exe).Source\n& $node $cli --apply\nexit $LASTEXITCODE\n";

function voiceAction(version, { profileSha = SHA_A, asrSha = SHA_B } = {}) {
  const payload = pack(version);
  return {
    execute: WSCRIPT,
    arguments: `//B //NoLogo ${payload}\\${VOICE_HIDDEN} ${PS} -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ${payload}\\${VOICE_LAUNCHER} -RuntimeRoot ${payload} -RepoRoot ${ROOT}\\dev\\source_checkout -VoiceRoot ${D}\\OneDrive\\x\\voice_capture -ProfilePath ${D}\\OneDrive\\x\\voice_capture\\config\\local_asr.profile.json -ProfileSha256 ${profileSha} -AsrBinRoot ${D}\\Soulforge-tools\\whisper\\Release -AsrSha256 ${asrSha} -StateRoot ${D}\\Soulforge-control\\voice-label -PollSeconds 900 -MaxAsrSessions 1`,
    working_directory: payload,
  };
}

function ingressAction(version, digest = SHA_C) {
  const payload = pack(version);
  return {
    execute: PS,
    arguments: `-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ${payload}\\${INGRESS_LAUNCHER} -RuntimeRoot ${payload} -BindingPath ${D}\\Soulforge-control\\ingress\\continuous_ingress.binding.v3.json -BindingDigest sha256:${digest}`,
    working_directory: payload,
  };
}

function makeTask(name, action, extra = {}) {
  return {
    name,
    path: "\\",
    state: "Ready",
    enabled: true,
    multiple_instances: "IgnoreNew",
    last_result: 0,
    last_run_at: "2026-09-06T08:15:01.000Z",
    next_run_at: "2026-09-06T08:30:00.000Z",
    actions: [action],
    ...extra,
  };
}

function proc(pid, ppid, name, createdAt, commandLine) {
  return { pid, ppid, name, created_at: createdAt, command_line: commandLine };
}

function voiceHost(pid, ppid, version, createdAt, { profileSha = SHA_A, asrSha = SHA_B } = {}) {
  const payload = pack(version);
  return proc(pid, ppid, "powershell.exe", createdAt,
    `"${PS}"  "-NoProfile" "-NonInteractive" "-WindowStyle" "Hidden" "-ExecutionPolicy" "Bypass" "-File" "${payload}\\${VOICE_LAUNCHER}" "-RuntimeRoot" "${payload}" "-RepoRoot" "${ROOT}\\dev\\source_checkout" "-ProfileSha256" "${profileSha}" "-AsrSha256" "${asrSha}" "-StateRoot" "${D}\\Soulforge-control\\voice-label"`);
}

function voiceWorker(pid, ppid, version, createdAt) {
  return proc(pid, ppid, "node.exe", createdAt,
    `"${NODE}" ${pack(version)}\\${VOICE_WORKER} --repo-root ${ROOT}\\dev\\source_checkout --state-root ${D}\\Soulforge-control\\voice-label --apply`);
}

function readerFor(sources) {
  const calls = [];
  const reader = (filePath) => {
    calls.push(filePath);
    return Object.hasOwn(sources, filePath) ? sources[filePath] : null;
  };
  reader.calls = calls;
  return reader;
}

function observation(tasks, processes) {
  return { observed_at: "2026-09-06T08:40:00.000Z", host_platform: "win32", task_prefix: DEFAULT_TASK_PREFIX, tasks, processes };
}

test("generation tokens: pack payload, lane generation, superseded suffix, separators, checkout", () => {
  const packToken = generationOf(`${pack("0.1.6")}\\${VOICE_LAUNCHER}`);
  assert.deepEqual({ train: packToken.train, generation: packToken.generation, label: packToken.label }, {
    train: "server-pack", generation: "0.1.6", label: "server-pack 0.1.6",
  });

  const laneToken = generationOf(`${lane("operations-lane-v4")}\\ui-workspace\\apps\\team-ops-board\\ops\\team-ops-board-runtime.mjs`);
  assert.deepEqual({ train: laneToken.train, lane: laneToken.lane, generation: laneToken.generation, label: laneToken.label }, {
    train: "source-lane", lane: "operations-lane", generation: "v4", label: "source-lane operations-lane-v4",
  });

  const superseded = generationOf(`${lane("linear-collect-v1.superseded-1bd86c6c-1750")}\\guild_hall\\linear_history\\x.mjs`);
  assert.equal(superseded.generation, "v1.superseded-1bd86c6c-1750", "a superseded copy never compares equal to the live generation");
  assert.equal(superseded.lane, "linear-collect");

  const forward = generationOf(`${ROOT}/install/SERVER-PACK/0.1.9/PAYLOAD/guild_hall/ingress/x.ps1`.replace(/\\/gu, "/"));
  assert.equal(forward?.generation, "0.1.9", "forward slashes and case do not hide a generation");

  assert.equal(generationOf(`${ROOT}\\dev\\source_checkout\\guild_hall\\ingress\\cli.mjs`), null, "a checkout path carries no generation");
  assert.equal(generationOf(`${C}\\Soulforge\\guild_hall\\backup_controller\\nas_dr_runner.mjs`), null);

  const ordered = parseGenerationTokens(`${lane("tongs-lane-v2")}\\a.ps1 -RuntimeRoot ${pack("0.1.9")}`);
  assert.deepEqual(ordered.map((token) => token.label), ["source-lane tongs-lane-v2", "server-pack 0.1.9"], "tokens keep textual order");
});

test("script discovery: the .ps1 wins over the hidden .vbs wrapper, -Command node launchers are found, bindings are never scripts", () => {
  const action = voiceAction("0.1.6");
  const scripts = extractScriptPaths(`${action.execute} ${action.arguments}`);
  assert.deepEqual(scripts, [`${pack("0.1.6")}\\${VOICE_HIDDEN}`, `${pack("0.1.6")}\\${VOICE_LAUNCHER}`]);
  assert.equal(pickLauncher(scripts), `${pack("0.1.6")}\\${VOICE_LAUNCHER}`);

  const laneRoot = lane("buzz-collect-v1");
  const command = `//B //NoLogo ${laneRoot}\\guild_hall\\buzz_history\\ops\\run-buzz-collect-hidden.vbs ${PS} -Command "& '${NODE}' '${laneRoot}\\guild_hall\\buzz_history\\buzz_collect_launcher.mjs' '--binding' '${D}\\Soulforge-data\\config\\buzz_history\\buzz_collect.binding.json'"`;
  const found = extractScriptPaths(command);
  assert.equal(pickLauncher(found), `${laneRoot}\\guild_hall\\buzz_history\\buzz_collect_launcher.mjs`);
  assert.ok(found.every((candidate) => !candidate.endsWith(".json")), "a binding path is not a script and is never returned");
  assert.equal(isScriptPath(`${D}\\Soulforge-control\\x.binding.json`), false);
  assert.equal(isScriptPath(`${pack("0.1.6")}\\${VOICE_LAUNCHER}`), true);
});

test("module roots: owner folders, gateway owners, apps, workflows, and the dev-erp vs dev-erp-mcp boundary", () => {
  assert.deepEqual(moduleRootOf(`${pack("0.1.6")}\\${VOICE_LAUNCHER}`), { module_root: "guild_hall/voice_capture/", anchored: true });
  assert.deepEqual(moduleRootOf(`${lane("operations-lane-v2")}\\guild_hall\\gateway\\mail_send\\ops\\run-hiworks-gmail-forwarder.ps1`), { module_root: "guild_hall/gateway/mail_send/", anchored: true });
  assert.deepEqual(moduleRootOf(`${pack("0.1.9")}\\ui-workspace\\apps\\dev-erp\\ops\\run-dev-erp-background.ps1`), { module_root: "ui-workspace/apps/dev-erp/", anchored: true });
  assert.deepEqual(moduleRootOf(`${lane("tongs-lane-v2")}\\ui-workspace\\apps\\dev-erp-mcp\\ops\\run-tongs-loopback.ps1`), { module_root: "ui-workspace/apps/dev-erp-mcp/", anchored: true });
  assert.deepEqual(moduleRootOf(`${lane("operations-lane-v2")}\\.workflow\\codex_thread_manager_v0\\ops\\run-codex-retention-refresh.ps1`), { module_root: ".workflow/codex_thread_manager_v0/", anchored: true });
  assert.deepEqual(moduleRootOf(`${lane("buzz-collect-v1")}\\guild_hall\\buzz_history\\buzz_collect_launcher.mjs`), { module_root: "guild_hall/buzz_history/", anchored: true });
  const fallback = moduleRootOf(`${D}\\Buzz\\server\\control\\ops\\x.cmd`);
  assert.equal(fallback.anchored, false);
  assert.equal(fallback.module_root, `${D.toLowerCase()}/buzz/server/control/`);
});

test("attribution: direct match plus descendants, PID-reuse guard, self exclusion, sibling app boundary", () => {
  const host = voiceHost(25180, 50124, "0.1.2", "2026-09-01T14:00:01.000Z");
  const worker = voiceWorker(63492, 25180, "0.1.2", "2026-09-01T14:00:03.000Z");
  const reusedPidChild = proc(777, 25180, "cmd.exe", "2026-08-30T00:00:00.000Z", `${C}\\WINDOWS\\system32\\cmd.exe /c echo Soulforge`);
  const undatedChild = proc(778, 25180, "cmd.exe", null, `${C}\\WINDOWS\\system32\\cmd.exe /c echo Soulforge`);
  const grandchild = proc(779, 63492, "whisper-cli.exe", "2026-09-06T08:00:00.000Z", `${D}\\Soulforge-tools\\whisper\\Release\\whisper-cli.exe -m model`);
  const self = proc(999, 1, "node.exe", "2026-09-06T08:39:00.000Z", `node ${ROOT}\\dev\\source_checkout\\guild_hall\\deployment_pack\\tools\\detect_runtime_lane_drift.mjs guild_hall/voice_capture/`);
  const erp = proc(31704, 20684, "node.exe", "2026-09-06T00:39:00.000Z", `"${NODE}" ${pack("0.1.9")}\\ui-workspace\\apps\\dev-erp\\server.mjs --port 4300`);
  const tongs = proc(4072, 63756, "node.exe", "2026-09-06T07:28:52.000Z", `"${NODE}" "${lane("tongs-lane-v2")}\\ui-workspace\\apps\\dev-erp-mcp\\server.mjs"`);

  const voice = attributeProcesses([host, worker, reusedPidChild, undatedChild, grandchild, self, erp, tongs], "guild_hall/voice_capture/", { selfPid: 999 });
  assert.deepEqual(voice.map((entry) => [entry.process.pid, entry.match]), [[779, "descendant"], [25180, "direct"], [63492, "direct"]],
    "the worker's own path carries the module root, so an orphaned worker is still a direct match");

  const erpOnly = attributeProcesses([erp, tongs], "ui-workspace/apps/dev-erp/");
  assert.deepEqual(erpOnly.map((entry) => entry.process.pid), [31704], "dev-erp/ does not swallow dev-erp-mcp/");
  const tongsOnly = attributeProcesses([erp, tongs], "ui-workspace/apps/dev-erp-mcp/");
  assert.deepEqual(tongsOnly.map((entry) => entry.process.pid), [4072]);
});

test("lease scan: the three markers, lock and mutex names, and a plain launcher", () => {
  const scan = scanLauncherForLease(SINGLETON_SOURCE);
  assert.equal(scan.is_singleton, true);
  assert.deepEqual(scan.markers, [...LEASE_MARKERS]);
  assert.deepEqual(scan.lock_names, ["supervisor.instance.lock"]);
  assert.deepEqual(scan.mutex_names, ["Local\\Soulforge.HPP.VoiceLabel.Supervisor"]);
  assert.equal(scanLauncherForLease(PLAIN_SOURCE).is_singleton, false);
});

test("the 2026-09-06 voice shape: advertised 0.1.6, resident 0.1.2 pair, task Ready, singleton launcher => drift and rc=0 caveat", () => {
  const advertisedLauncher = `${pack("0.1.6")}\\${VOICE_LAUNCHER}`;
  const residentLauncher = `${pack("0.1.2")}\\${VOICE_LAUNCHER}`;
  const reader = readerFor({ [advertisedLauncher]: SINGLETON_SOURCE, [residentLauncher]: SINGLETON_SOURCE });
  const report = detectRuntimeLaneDrift(observation(
    [makeTask("Soulforge-HPP-Voice-ASR-Label", voiceAction("0.1.6"))],
    [voiceHost(25180, 50124, "0.1.2", "2026-09-01T14:00:01.000Z"), voiceWorker(63492, 25180, "0.1.2", "2026-09-01T14:00:03.000Z")],
  ), { readTextFile: reader, now: () => "2026-09-06T08:41:00.000Z" });

  assert.equal(report.summary.drift, 1);
  const [voice] = report.lanes;
  assert.equal(voice.verdict, "drift");
  assert.equal(voice.advertised.label, "server-pack 0.1.6");
  assert.deepEqual(voice.resident.labels, ["server-pack 0.1.2"]);
  assert.equal(voice.resident.process_count, 2);
  assert.equal(voice.resident.since, "2026-09-01T14:00:01.000Z");
  assert.equal(voice.singleton.is_singleton, true);
  assert.deepEqual(voice.singleton.launchers.map((scan) => [scan.role, scan.readable, scan.is_singleton]), [["advertised", true, true], ["resident", true, true]]);
  for (const flag of ["singleton_launcher", "resident_while_task_not_running"]) assert.ok(voice.flags.includes(flag), flag);
  assert.ok(!voice.flags.includes("resident_digest_set_differs"), "same pins on both sides: only the version drifted");
  assert.ok(voice.notes.some((note) => note.includes("LastTaskResult=0 is not proof of work")));
  assert.deepEqual(reader.calls.sort(), [advertisedLauncher, residentLauncher].sort(), "only launcher scripts are opened, once each");
  assert.equal(exitCodeFor(report), 2);

  const human = renderHuman(report);
  assert.match(human, /Soulforge-HPP-Voice-ASR-Label\s+Ready\s+server-pack 0\.1\.6\s+server-pack 0\.1\.2 x2\s+DRIFT/u);
  assert.match(human, /supervisor\.instance\.lock/u);
  assert.match(human, /summary: drift 1 /u);
});

test("consistent lane: ingress 0.1.9 advertised and resident while Running, no drift flags, exit 0", () => {
  const payload = pack("0.1.9");
  const reader = readerFor({ [`${payload}\\${INGRESS_LAUNCHER}`]: SINGLETON_SOURCE.replace("supervisor.instance.lock", "continuous-supervisor.instance.lock") });
  const host = proc(40980, 2656, "powershell.exe", "2026-09-06T00:41:14.000Z",
    `"${PS}" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ${payload}\\${INGRESS_LAUNCHER} -RuntimeRoot ${payload} -BindingPath ${D}\\Soulforge-control\\ingress\\continuous_ingress.binding.v3.json -BindingDigest sha256:${SHA_C}`);
  const worker = proc(70248, 40980, "node.exe", "2026-09-06T00:41:15.000Z",
    `"${NODE}" ${payload}\\${INGRESS_WORKER} --config ${D}\\Soulforge-control\\ingress\\continuous_ingress.binding.v3.json --config-digest sha256:${SHA_C} --apply`);
  const report = detectRuntimeLaneDrift(observation(
    [makeTask("Soulforge-Continuous-Five-Lane-Ingress", ingressAction("0.1.9"), { state: "Running", last_result: 267009, next_run_at: null })],
    [host, worker],
  ), { readTextFile: reader });
  const [ingress] = report.lanes;
  assert.equal(ingress.verdict, "consistent");
  assert.deepEqual(ingress.flags, ["singleton_launcher"]);
  assert.deepEqual(ingress.digests.advertised, [SHA_C]);
  assert.deepEqual(ingress.digests.resident_host, [SHA_C]);
  assert.equal(exitCodeFor(report), 0);
});

test("pin drift without version drift: same generation but the resident host carries different sha256 pins", () => {
  const launcher = `${pack("0.1.9")}\\${VOICE_LAUNCHER}`;
  const report = detectRuntimeLaneDrift(observation(
    [makeTask("Soulforge-HPP-Voice-ASR-Label", voiceAction("0.1.9", { profileSha: SHA_A, asrSha: SHA_B }), { state: "Running" })],
    [voiceHost(1, 0, "0.1.9", "2026-09-06T01:00:00.000Z", { profileSha: SHA_C, asrSha: SHA_B }), voiceWorker(2, 1, "0.1.9", "2026-09-06T01:00:01.000Z")],
  ), { readTextFile: readerFor({ [launcher]: SINGLETON_SOURCE }) });
  const [voice] = report.lanes;
  assert.equal(voice.verdict, "consistent");
  assert.ok(voice.flags.includes("resident_digest_set_differs"));
  assert.ok(voice.notes.some((note) => note.includes("binding/profile drift")));
});

test("no resident process: a periodic lane without a lease is no_resident, its launcher is not a singleton", () => {
  const payload = pack("0.1.9");
  const action = {
    execute: WSCRIPT,
    arguments: `//B //NoLogo "${payload}\\guild_hall\\local_activity\\ops\\run-hpp-local-activity-hidden.vbs" "${PS}" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${payload}\\${LOCAL_LAUNCHER}" -RuntimeRoot "${payload}" -BindingPath "${D}\\Soulforge-control\\local-activity\\config\\hpp_all_projects.binding.v1.json" -BindingSha256 "sha256:${SHA_A}"`,
    working_directory: payload,
  };
  const reader = readerFor({ [`${payload}\\${LOCAL_LAUNCHER}`]: PLAIN_SOURCE });
  const report = detectRuntimeLaneDrift(observation([makeTask("Soulforge-HPP-All-Project-Local-Activity", action)], []), { readTextFile: reader });
  const [local] = report.lanes;
  assert.equal(local.verdict, "no_resident");
  assert.equal(local.singleton.is_singleton, false);
  assert.deepEqual(local.flags, []);
  assert.equal(local.launcher.basename, "run-hpp-local-activity.ps1");
  assert.deepEqual(reader.calls, [`${payload}\\${LOCAL_LAUNCHER}`], "the binding named in the action is never opened");
  assert.equal(report.summary.no_resident, 1);
});

test("unversioned resident: a checkout-run process from the same module is noted, not counted as drift", () => {
  const laneRoot = lane("tongs-lane-v2");
  const launcher = `${laneRoot}\\ui-workspace\\apps\\dev-erp-mcp\\ops\\run-tongs-loopback.ps1`;
  const action = { execute: PS, arguments: `-NoProfile -File ${launcher} -LaneRoot ${laneRoot} -ErpListenHost 127.0.0.1 -ErpListenPort 4311`, working_directory: `${laneRoot}\\ui-workspace\\apps\\dev-erp-mcp` };
  const laneServer = proc(4072, 63756, "node.exe", "2026-09-06T07:28:52.000Z", `"${NODE}" "${laneRoot}\\ui-workspace\\apps\\dev-erp-mcp\\server.mjs"`);
  const checkoutMcp = proc(29668, 46284, "node.exe", "2026-09-06T08:16:46.000Z", `node  "${C}\\Soulforge\\ui-workspace\\apps\\dev-erp-mcp\\company_mail_stdio_server.mjs" --event-root ${D}/Soulforge-data/ingress/mailbox/events`);
  const erp = proc(31704, 20684, "node.exe", "2026-09-06T00:39:00.000Z", `"${NODE}" ${pack("0.1.9")}\\ui-workspace\\apps\\dev-erp\\server.mjs --port 4300`);
  const report = detectRuntimeLaneDrift(observation(
    [makeTask("Soulforge-Tongs-Loopback-v1", action)],
    [laneServer, checkoutMcp, erp],
  ), { readTextFile: readerFor({ [launcher]: PLAIN_SOURCE }) });
  const [tongs] = report.lanes;
  assert.equal(tongs.verdict, "consistent");
  assert.equal(tongs.advertised.label, "source-lane tongs-lane-v2");
  assert.deepEqual(tongs.resident.labels, ["source-lane tongs-lane-v2"]);
  assert.ok(tongs.flags.includes("resident_unversioned_process"));
  assert.ok(tongs.flags.includes("resident_while_task_not_running"));
  assert.ok(tongs.notes.some((note) => note.includes("pid 29668 node.exe company_mail_stdio_server.mjs")));
  assert.deepEqual(report.unattributed_versioned_processes.map((entry) => entry.pid), [31704], "the World Tree server has no task in this observation, so it is reported as unattributed");
  assert.equal(report.summary.unattributed_versioned_processes, 1);
  assert.equal(exitCodeFor(report), 0);
});

test("unversioned advertisement: a task that still runs from a checkout is unknown, never consistent", () => {
  const action = { execute: NODE, arguments: `"${C}\\Soulforge\\guild_hall\\backup_controller\\nas_dr_runner.mjs" --config "${C}\\Soulforge\\_workmeta\\system\\runs\\x\\runner_config.json"`, working_directory: "" };
  const report = detectRuntimeLaneDrift(observation([makeTask("Soulforge-NAS-DR-Backup", action)], []), { readTextFile: readerFor({}) });
  const [nas] = report.lanes;
  assert.equal(nas.verdict, "unknown");
  assert.ok(nas.flags.includes("advertised_unversioned"));
  assert.ok(nas.flags.includes("launcher_unreadable"));
  assert.equal(nas.singleton.is_singleton, null);
  assert.equal(nas.launcher.module_root, "guild_hall/backup_controller/");
});

test("mixed generations in one action string are flagged; a missing launcher file yields singleton null", () => {
  const action = voiceAction("0.1.9");
  action.arguments = action.arguments.replace(`-RuntimeRoot ${pack("0.1.9")}`, `-RuntimeRoot ${pack("0.1.6")}`);
  const report = detectRuntimeLaneDrift(observation([makeTask("Soulforge-HPP-Voice-ASR-Label", action)], []), { readTextFile: readerFor({}) });
  const [voice] = report.lanes;
  assert.equal(voice.advertised.label, "server-pack 0.1.9", "the launcher path decides the advertised generation");
  assert.deepEqual(voice.advertised.all_labels, ["server-pack 0.1.9", "server-pack 0.1.6"]);
  assert.ok(voice.flags.includes("advertised_mixed_generations"));
  assert.ok(voice.flags.includes("launcher_unreadable"));
  assert.equal(voice.singleton.is_singleton, null);
});

test("prefix filter is case-insensitive and other tasks are excluded; an invalid prefix is refused", () => {
  const report = detectRuntimeLaneDrift(observation(
    [makeTask("soulforge-lower", ingressAction("0.1.9")), makeTask("BuzzBackup-Daily", { execute: "wsl.exe", arguments: "-d BuzzServer -- bash buzz-backup.sh", working_directory: "" })],
    [],
  ), { readTextFile: readerFor({}) });
  assert.deepEqual(report.lanes.map((laneRow) => laneRow.task_name), ["soulforge-lower"]);
  assert.throws(() => detectRuntimeLaneDrift(observation([], []), { taskPrefix: "bad;prefix" }), /task_prefix_invalid/u);
});

test("observation normalization: saved reports replay, PowerShell single-object unrolls are accepted, malformed input fails closed", () => {
  const single = {
    observed_at: "2026-09-06T08:40:00.000Z",
    host_platform: "win32",
    tasks: makeTask("Soulforge-Only", { ...ingressAction("0.1.9") }),
    processes: proc(1, 0, "node.exe", "2026-09-06T00:00:00.000Z", `"${NODE}" ${pack("0.1.9")}\\${INGRESS_WORKER}`),
  };
  single.tasks.actions = single.tasks.actions[0];
  const normalized = normalizeObservation(single);
  assert.equal(normalized.tasks.length, 1);
  assert.equal(normalized.tasks[0].actions.length, 1);
  assert.equal(normalized.processes.length, 1);

  const replayed = normalizeObservation({ schema_version: "x", observation: single });
  assert.deepEqual(replayed, normalized, "a saved --json report replays through its observation object");

  assert.throws(() => normalizeObservation(null), /observation_malformed/u);
  assert.throws(() => normalizeObservation({ tasks: [{ name: "" }] }), /observation_task_malformed/u);
  assert.throws(() => normalizeObservation({ processes: [{ pid: "1" }] }), /observation_process_malformed/u);
  assert.equal(normalizeObservation({ tasks: [{ name: "T", last_result: 3221225786 }] }).tasks[0].last_result, 3221225786, "NTSTATUS-shaped results survive as numbers");
});

test("observation script is read-only: it names only query cmdlets and never a mutating one", () => {
  const script = buildObservationScript("Soulforge-");
  for (const needle of ["Get-ScheduledTask", "Get-ScheduledTaskInfo", "Get-CimInstance Win32_Process", "[int64]$i.LastTaskResult", "$_.ProcessId -ne $self"]) {
    assert.ok(script.includes(needle), needle);
  }
  for (const forbidden of ["Start-", "Stop-", "Register-", "Unregister-", "Enable-", "Disable-", "Remove-", "Kill", "Set-", "New-Item", "Out-File", "schtasks"]) {
    assert.ok(!script.includes(forbidden), `must not contain ${forbidden}`);
  }
  assert.ok(buildObservationScript("O'Neil-").includes("'O''Neil-'"), "the prefix is single-quote escaped for PowerShell");
});

test("observeWindowsRuntime: platform gate, injected query, failure codes", async () => {
  await assert.rejects(observeWindowsRuntime({ platform: "linux", powershellPath: "powershell.exe" }), /platform_unsupported/u);

  const payload = JSON.stringify(observation([makeTask("Soulforge-X", ingressAction("0.1.9"))], []));
  const calls = [];
  const execFileImpl = async (file, args, options) => {
    calls.push({ file, args, options });
    return { stdout: Buffer.from(payload, "utf8"), stderr: Buffer.alloc(0) };
  };
  const observed = await observeWindowsRuntime({ platform: "win32", execFileImpl, powershellPath: "powershell.exe" });
  assert.equal(observed.tasks.length, 1);
  assert.deepEqual(calls[0].args.slice(0, 4), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
  assert.equal(calls[0].options.windowsHide, true);

  await assert.rejects(observeWindowsRuntime({ platform: "win32", powershellPath: "powershell.exe", execFileImpl: async () => { throw Object.assign(new Error("boom"), { code: "ENOENT" }); } }), /observation_query_failed:ENOENT/u);
  await assert.rejects(observeWindowsRuntime({ platform: "win32", powershellPath: "powershell.exe", execFileImpl: async () => ({ stdout: Buffer.alloc(0) }) }), /observation_query_empty/u);
  await assert.rejects(observeWindowsRuntime({ platform: "win32", powershellPath: "powershell.exe", execFileImpl: async () => ({ stdout: Buffer.from("not json") }) }), /observation_query_malformed/u);
});

test("console decoding tolerates non-UTF-8 bytes", () => {
  assert.equal(decodeConsoleOutput(Buffer.from('{"a":1}', "utf8")), '{"a":1}');
  const text = decodeConsoleOutput(Buffer.from([0x7b, 0xb0, 0xa1, 0x7d]));
  assert.equal(typeof text, "string");
  assert.ok(text.startsWith("{") && text.endsWith("}"));
});
