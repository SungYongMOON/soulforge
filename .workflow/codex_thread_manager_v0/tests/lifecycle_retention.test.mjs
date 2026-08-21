import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";

import {
  DEFAULT_BINDING_MAX_AGE_MS,
  LIFECYCLE_RETENTION_REPORT_SCHEMA,
  TASK_WORKTREE_BINDING_SCHEMA,
  buildLifecycleRetentionReport,
  canonicalizeJson,
  classifyLifecycleRetentionThread,
  computeReportDigest,
  defaultRepoRoot,
  deriveCandidateId,
  deriveResultGateStates,
  deriveWorktreeId,
  inspectWorktreePreflight,
  isLifecycleRetentionReportDisabled,
  normalizeBindingRegistry,
  normalizeEnrollmentRegistry,
  normalizeLifecycleSnapshot,
  normalizeResultGateRegistry,
  parseGitWorktreePorcelain,
  parseLifecycleRetentionReportArgs,
  runLifecycleRetentionReport,
  sanitizeWorktreePreflight,
  summarizeWorktreePreflight
} from "../lifecycle_retention.mjs";

import { main as cliMain } from "../lifecycle_retention_cli.mjs";
import { buildLifecycleRetentionReport as buildLegacyReport, main as legacyMain } from "../lifecycle_retention_report.mjs";

const execFile = promisify(execFileCallback);
const NOW = Date.now();
const ISO = new Date(NOW).toISOString();
const PAST = new Date(NOW - 1_000).toISOString();

function makeWinPath(subPath) {
  return win32.join("C:", "wt", subPath.replace(/^\/+/u, ""));
}

function makeNonce(suffix = "0123456789abcdef") {
  return suffix.padEnd(32, "0").slice(0, 32);
}

function makeEntry(threadId, { lifecycle = "current", parentThreadId = null } = {}) {
  return {
    thread_id: threadId,
    organization_group_id: "system",
    route_id: null,
    work_id: null,
    thread_kind: "task",
    display_label: "PRIVATE_LABEL_MUST_NOT_LEAK",
    relationship: "child",
    lifecycle,
    parent_thread_id: parentThreadId,
    prior_thread_history_pointer: null,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false,
    enrolled_at: ISO,
    updated_at: ISO
  };
}

function makeEnrollment(entries, { disabled = false } = {}) {
  return {
    schema_version: "soulforge.team_ops_board.thread_enrollment.v1",
    registry_revision: 1,
    updated_at: ISO,
    disabled,
    entries
  };
}

function makeIdentity(threadId, lifecycleState, sourceEvent, observedAt = PAST) {
  return {
    session_id: threadId,
    turn_id: `${threadId}-turn`,
    agent_id: null,
    agent_type: null,
    lifecycle_state: lifecycleState,
    result_state: "result_pending",
    observed_at: observedAt,
    source_event: sourceEvent
  };
}

function makeLifecycle(identities, generatedAt = ISO) {
  return {
    schema_version: "soulforge.ai_usage_lifecycle_snapshot.v1",
    generated_at: generatedAt,
    receipt_count: identities.length,
    latest_identity_count: identities.length,
    states: {
      started: identities.filter((i) => i.lifecycle_state === "started").length,
      input_received: identities.filter((i) => i.lifecycle_state === "input_received").length,
      waiting_on_approval: identities.filter((i) => i.lifecycle_state === "waiting_on_approval").length,
      observed_at_stop: identities.filter((i) => i.lifecycle_state === "observed_at_stop").length,
      ended: identities.filter((i) => i.lifecycle_state === "ended").length
    },
    result_pending_count: identities.length,
    raw_content_fields_stored: 0,
    raw_flag_fields_stored: 0,
    identities
  };
}

function makeGateEvent(eventId, threadId, eventType, { target = "owner", targetThreadId = null, occurredAt = ISO } = {}) {
  return {
    event_id: eventId,
    thread_id: threadId,
    event_type: eventType,
    target,
    target_thread_id: targetThreadId,
    occurred_at: occurredAt,
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

function makeResultGate(events) {
  return {
    schema_version: "soulforge.team_ops_board.thread_result_gate.v1",
    registry_revision: 1,
    updated_at: ISO,
    disabled: false,
    events
  };
}

function makeBinding(bindings, { worktreeNonce = makeNonce("ffffffffffffffff"), disabled = false, updatedAt = ISO } = {}) {
  return {
    schema_version: TASK_WORKTREE_BINDING_SCHEMA,
    registry_revision: 1,
    updated_at: updatedAt,
    disabled,
    worktree_nonce: worktreeNonce,
    bindings
  };
}

test("P1: disabled enrollment fails closed with disabled source health and empty candidates", () => {
  const disabledVal = makeEnrollment([makeEntry("t-1")], { disabled: true });

  const coreRep = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: disabledVal },
    now: NOW
  });
  assert.equal(coreRep.source_health.enrollment, "disabled");
  assert.equal(coreRep.candidates.length, 0);
  assert.equal(coreRep.threads, undefined);
  assert.equal(coreRep.thread_scope.binding_coverage, "unavailable");
  assert.equal(coreRep.thread_scope.orphan_binding_count, null);
  assert.equal(coreRep.classifications.active, 0);
  assert.equal(coreRep.classifications.unknown, 0);

  const legacyRep = buildLegacyReport({
    enrollment: { status: "available", value: disabledVal },
    now: NOW
  });
  assert.equal(legacyRep.source_health.enrollment, "disabled");
  assert.equal(legacyRep.candidates.length, 0);
  assert.ok(Array.isArray(legacyRep.threads));
  assert.equal(legacyRep.threads.length, 0);
  assert.equal(legacyRep.classifications.active, 0);
});

test("P1: legacy normalizers return exact inner contract shapes and compose directly", () => {
  const rawEnrollment = makeEnrollment([
    makeEntry("parent-1"),
    makeEntry("child-1", { parentThreadId: "parent-1" })
  ]);
  const normEnrollment = normalizeEnrollmentRegistry(rawEnrollment);
  assert.ok(normEnrollment);
  assert.equal(normEnrollment.status, undefined);
  assert.equal(typeof normEnrollment.disabled, "boolean");
  assert.ok(Array.isArray(normEnrollment.entries));

  const rawGate = makeResultGate([
    makeGateEvent("g-1", "child-1", "started", { target: "none" }),
    makeGateEvent("g-2", "child-1", "result_ready", { target: "parent", targetThreadId: "parent-1" })
  ]);
  const normGate = normalizeResultGateRegistry(rawGate);
  assert.ok(normGate);
  assert.equal(normGate.status, undefined);
  assert.equal(typeof normGate.disabled, "boolean");
  assert.ok(Array.isArray(normGate.events));

  const rawLifecycle = makeLifecycle([makeIdentity("child-1", "started", "SessionStart")]);
  const normLifecycle = normalizeLifecycleSnapshot(rawLifecycle);
  assert.ok(normLifecycle);
  assert.equal(normLifecycle.status, "available");
  assert.ok(Array.isArray(normLifecycle.identities));

  const gateState = deriveResultGateStates({ enrollmentRegistry: normEnrollment, resultGateRegistry: normGate });
  assert.equal(gateState.status, "available");
  assert.equal(gateState.by_thread_id.get("child-1").stage, "result_ready");
});

test("P2: every destructive option flag and flag=value form throws forbidden error", () => {
  const flags = ["--apply", "--delete", "--archive", "--remove", "--prune", "--branch-delete"];
  for (const flag of flags) {
    assert.throws(() => parseLifecycleRetentionReportArgs(["report", "--json", flag]), /report_only_destructive_option_forbidden/u);
  }
  assert.throws(() => parseLifecycleRetentionReportArgs(["report", "--json", "--apply=true"]), /report_only_destructive_option_forbidden/u);
  assert.throws(() => parseLifecycleRetentionReportArgs(["report", "--json", "--prune=1"]), /report_only_destructive_option_forbidden/u);
});

test("P2: every forbidden subcommand throws forbidden error", () => {
  const subcommands = ["approve", "apply", "verify", "delete", "archive", "remove", "prune"];
  for (const sub of subcommands) {
    assert.throws(() => parseLifecycleRetentionReportArgs([sub]), /report_only_destructive_option_forbidden/u);
  }
});

test("P2: invalid binding registry variations return null normalizer or invalid source health", () => {
  const nonce1 = makeNonce("1111111111111111");
  const nonce2 = makeNonce("2222222222222222");
  const path1 = makeWinPath("1");
  const path2 = makeWinPath("2");

  // Duplicate task_id
  assert.equal(normalizeBindingRegistry(makeBinding([
    { task_id: "t-dup", worktree_path: path1, candidate_nonce: nonce1 },
    { task_id: "t-dup", worktree_path: path2, candidate_nonce: nonce2 }
  ])), null);

  // Duplicate canonical worktree_path
  assert.equal(normalizeBindingRegistry(makeBinding([
    { task_id: "t-1", worktree_path: path1, candidate_nonce: nonce1 },
    { task_id: "t-2", worktree_path: path1, candidate_nonce: nonce2 }
  ])), null);

  // Duplicate candidate_nonce
  assert.equal(normalizeBindingRegistry(makeBinding([
    { task_id: "t-1", worktree_path: path1, candidate_nonce: nonce1 },
    { task_id: "t-2", worktree_path: path2, candidate_nonce: nonce1 }
  ])), null);

  // Relative path
  assert.equal(normalizeBindingRegistry(makeBinding([
    { task_id: "t-1", worktree_path: "relative/path", candidate_nonce: nonce1 }
  ])), null);

  // Filesystem root path
  assert.equal(normalizeBindingRegistry(makeBinding([
    { task_id: "t-1", worktree_path: win32.join("C:", "/"), candidate_nonce: nonce1 }
  ])), null);
  assert.equal(normalizeBindingRegistry(makeBinding([
    { task_id: "t-1", worktree_path: "/", candidate_nonce: nonce1 }
  ])), null);

  // Malformed nonce
  assert.equal(normalizeBindingRegistry(makeBinding([
    { task_id: "t-1", worktree_path: path1, candidate_nonce: "not-32-hex" }
  ])), null);

  // Unknown root key
  assert.equal(normalizeBindingRegistry({ ...makeBinding([]), unknown_key: "bad" }), null);

  // Unknown entry key
  assert.equal(normalizeBindingRegistry(makeBinding([
    { task_id: "t-1", worktree_path: path1, candidate_nonce: nonce1, unknown_field: 123 }
  ])), null);

  // Verify report with invalid binding produces source_health invalid and 0 candidates
  const repInvalid = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([makeEntry("t-1")]) },
    taskWorktreeBinding: { status: "available", value: { ...makeBinding([]), unknown_key: "bad" } },
    now: NOW
  });
  assert.equal(repInvalid.source_health.task_worktree_binding, "invalid");
  assert.equal(repInvalid.candidates.length, 0);
  assert.equal(repInvalid.lifecycle_retention_action, "HOLD");
});

test("P2: bound candidate metadata and hold reasons propagation", () => {
  const wtPath = makeWinPath("prop");
  const candNonce = makeNonce("9999999999999999");
  const wtNonce = makeNonce("ffffffffffffffff");
  const worktreeId = deriveWorktreeId(wtPath, wtNonce);

  const preflightMock = {
    status: "HOLD",
    list_status: "available",
    comparison_ref_status: "available",
    entries: [
      {
        worktree_id: worktreeId,
        head_state: "attached",
        locked: true,
        prunable: true,
        tracked_dirty: true,
        untracked: true,
        index_lock_present: true,
        operation_marker_count: 2,
        unique_commit_count_vs_main: 3,
        cleanup_state: "HOLD",
        hold_reasons: [
          "git_operation_marker_present",
          "index_lock_present",
          "tracked_changes_present",
          "unique_commits_present",
          "untracked_files_present",
          "worktree_locked",
          "worktree_prunable_requires_owner_decision"
        ]
      }
    ]
  };

  const binding = makeBinding([{ task_id: "t-prop", worktree_path: wtPath, candidate_nonce: candNonce }], { worktreeNonce: wtNonce });
  const report = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([makeEntry("t-prop")]) },
    taskWorktreeBinding: { status: "available", value: binding },
    worktreePreflight: preflightMock,
    now: NOW
  });

  assert.equal(report.candidates.length, 1);
  const cand = report.candidates[0];
  assert.equal(cand.metadata_counts.tracked_dirty, true);
  assert.equal(cand.metadata_counts.untracked, true);
  assert.equal(cand.metadata_counts.index_lock, true);
  assert.equal(cand.metadata_counts.operation_markers, 2);
  assert.equal(cand.metadata_counts.unique_commits_vs_main, 3);
  assert.equal(cand.metadata_counts.locked, true);
  assert.equal(cand.metadata_counts.prunable, true);

  assert.ok(cand.hold_reasons.includes("tracked_changes_present"));
  assert.ok(cand.hold_reasons.includes("untracked_files_present"));
  assert.ok(cand.hold_reasons.includes("index_lock_present"));
  assert.ok(cand.hold_reasons.includes("git_operation_marker_present"));
  assert.ok(cand.hold_reasons.includes("worktree_locked"));
  assert.ok(cand.hold_reasons.includes("worktree_prunable_requires_owner_decision"));
  assert.ok(cand.hold_reasons.includes("unique_commits_present"));
});

test("P2: unmatched binding path produces worktree_not_found_in_preflight hold reason", () => {
  const candNonce = makeNonce("8888888888888888");
  const wtNonce = makeNonce("ffffffffffffffff");

  const preflightMock = {
    status: "HOLD",
    list_status: "available",
    comparison_ref_status: "available",
    entries: []
  };

  const binding = makeBinding([{ task_id: "t-unmatched", worktree_path: makeWinPath("unmatched"), candidate_nonce: candNonce }], { worktreeNonce: wtNonce });
  const report = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([makeEntry("t-unmatched")]) },
    taskWorktreeBinding: { status: "available", value: binding },
    worktreePreflight: preflightMock,
    now: NOW
  });

  assert.equal(report.candidates.length, 1);
  assert.ok(report.candidates[0].hold_reasons.includes("worktree_not_found_in_preflight"));
});

test("P2: ignored-local guarantee via .gitignore check and git check-ignore execution", async () => {
  const root = defaultRepoRoot();
  const gitignoreContent = await readFile(join(root, ".gitignore"), "utf8");
  const lines = gitignoreContent.split(/\r?\n/u).map((l) => l.trim());
  assert.ok(lines.includes("guild_hall/state/**"), ".gitignore must contain exact rule guild_hall/state/**");

  const testFile = "guild_hall/state/operations/team_ops_board/task_worktree_binding.v1.json";
  try {
    const { stdout } = await execFile("git", ["-C", root, "check-ignore", "-v", testFile], {
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }
    });
    assert.ok(stdout.includes("guild_hall/state/**"), "git check-ignore must report match for guild_hall/state/**");
  } catch (error) {
    assert.fail(`git check-ignore failed: ${error?.message}`);
  }
});

test("P2-2: deriveWorktreeId requires valid 32-hex worktreeNonce and returns null when missing", () => {
  const path = makeWinPath("sub");
  const nonce = makeNonce("1234567890abcdef");

  assert.equal(deriveWorktreeId(path, null), null);
  assert.equal(deriveWorktreeId(path, "invalid-nonce"), null);

  const saltedId = deriveWorktreeId(path, nonce);
  assert.ok(saltedId.startsWith("worktree-"));
  assert.equal(saltedId.length, 41);
});

test("P2-3: legacy wrapper build emits threads sorted by localeCompare, explicit build omits threads", () => {
  const enrollment = makeEnrollment([makeEntry("z-thread"), makeEntry("a-thread")]);

  const legacyRep = buildLegacyReport({ enrollment: { status: "available", value: enrollment } });
  assert.ok(Array.isArray(legacyRep.threads));
  assert.equal(legacyRep.threads[0].thread_id, "a-thread");
  assert.equal(legacyRep.threads[1].thread_id, "z-thread");

  const explicitRep = buildLifecycleRetentionReport({ enrollment: { status: "available", value: enrollment } });
  assert.equal(explicitRep.threads, undefined);
});

test("P2-4 Focused CLI Negative: report without --json exits 2", async () => {
  let stderrStr = "";
  const code = await cliMain(["report"], { stderr: { write: (s) => { stderrStr += s; } } });
  assert.equal(code, 2);
  assert.ok(stderrStr.includes("invalid_lifecycle_retention_report_arguments"));
});

test("P2-4 Focused CLI Negative: malformed expected digest exits 2", async () => {
  let stderrStr = "";
  const code = await cliMain(["report", "--json", "--expected-digest", "not-a-sha"], { stderr: { write: (s) => { stderrStr += s; } } });
  assert.equal(code, 2);
  assert.ok(stderrStr.includes("invalid_expected_digest_format"));
});

test("P2-4 Focused CLI Negative: main-ref with leading dash or .. rejected", () => {
  assert.throws(() => parseLifecycleRetentionReportArgs(["report", "--json", "--main-ref", "-invalid"]), /invalid_lifecycle_retention_report_arguments|invalid_main_ref/u);
  assert.throws(() => parseLifecycleRetentionReportArgs(["report", "--json", "--main-ref", "main..feature"]), /invalid_main_ref/u);
});

test("P2-4 Focused CLI Negative: unknown option and missing/dash-prefixed option values rejected", () => {
  assert.throws(() => parseLifecycleRetentionReportArgs(["report", "--json", "--unknown"]), /invalid_lifecycle_retention_report_arguments/u);
  assert.throws(() => parseLifecycleRetentionReportArgs(["report", "--json", "--repo", "-another-flag"]), /invalid_lifecycle_retention_report_arguments/u);
  assert.throws(() => parseLifecycleRetentionReportArgs(["report", "--json", "--binding"]), /invalid_lifecycle_retention_report_arguments/u);
});

test("P2-4 Focused CLI Negative: emergency disabled branch exits 0 with disabled output", async () => {
  let stdoutStr = "";
  const code = await cliMain(["report", "--json"], { env: { SOULFORGE_CODEX_LIFECYCLE_RETENTION_REPORT_DISABLED: "1" }, stdout: { write: (s) => { stdoutStr += s; } } });
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdoutStr).status, "disabled");
});

test("Sanitizer fail-closed: forced HOLD, enum validation, distinct dropped vs sanitized counters", () => {
  const input = {
    status: "available",
    list_status: "invalid_status",
    comparison_ref_status: "available",
    entries: [
      { worktree_id: "worktree-1", head_state: "bad_state", hold_reasons: ["valid_reason", makeWinPath("injected")] },
      { worktree_id: "invalid-id-with-slash/injected", head_state: "attached", hold_reasons: ["valid_reason"] }
    ]
  };

  const sanitized = sanitizeWorktreePreflight(input);
  assert.equal(sanitized.status, "HOLD");
  assert.equal(sanitized.list_status, "unavailable");
  assert.equal(sanitized.comparison_ref_status, "available");
  assert.equal(sanitized.sanitization_dropped_entries, 1);
  assert.equal(sanitized.sanitized_field_count, 2);
  assert.equal(sanitized.entries.length, 1);
  assert.equal(sanitized.entries[0].head_state, "unknown");
});

test("Binding coverage truth and orphan_binding_count rules", () => {
  const nonce1 = makeNonce("1111111111111111");
  const nonce2 = makeNonce("2222222222222222");

  const repEnrollMissing = buildLifecycleRetentionReport({
    enrollment: { status: "missing", value: null },
    taskWorktreeBinding: { status: "available", value: makeBinding([]) }
  });
  assert.equal(repEnrollMissing.thread_scope.binding_coverage, "unavailable");
  assert.equal(repEnrollMissing.thread_scope.orphan_binding_count, null);

  const repNoActive = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([]) },
    taskWorktreeBinding: { status: "available", value: makeBinding([{ task_id: "t-orphan", worktree_path: makeWinPath("1"), candidate_nonce: nonce1 }]) },
    now: NOW
  });
  assert.equal(repNoActive.thread_scope.binding_coverage, "no_active_tasks");
  assert.equal(repNoActive.thread_scope.orphan_binding_count, 1);

  const repBindingUnavail = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([makeEntry("t-1")]) },
    taskWorktreeBinding: { status: "invalid", value: null }
  });
  assert.equal(repBindingUnavail.thread_scope.binding_coverage, "unavailable");
  assert.equal(repBindingUnavail.thread_scope.orphan_binding_count, null);

  const repNone = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([makeEntry("t-1")]) },
    taskWorktreeBinding: { status: "available", value: makeBinding([]) },
    now: NOW
  });
  assert.equal(repNone.thread_scope.binding_coverage, "none");
  assert.equal(repNone.thread_scope.orphan_binding_count, 0);

  const repIncomplete = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([makeEntry("t-1"), makeEntry("t-2")]) },
    taskWorktreeBinding: { status: "available", value: makeBinding([{ task_id: "t-1", worktree_path: makeWinPath("1"), candidate_nonce: nonce1 }]) },
    now: NOW
  });
  assert.equal(repIncomplete.thread_scope.binding_coverage, "incomplete");

  const repComplete = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([makeEntry("t-1"), makeEntry("t-2")]) },
    taskWorktreeBinding: { status: "available", value: makeBinding([
      { task_id: "t-1", worktree_path: makeWinPath("1"), candidate_nonce: nonce1 },
      { task_id: "t-2", worktree_path: makeWinPath("2"), candidate_nonce: nonce2 }
    ]) },
    now: NOW
  });
  assert.equal(repComplete.thread_scope.binding_coverage, "complete");
});

test("Salted pseudonymous worktree IDs vs positional fallback", async () => {
  const wtPath = makeWinPath("salted");
  const nonceA = makeNonce("aaaaaaaaaaaaaaaa");
  const nonceB = makeNonce("bbbbbbbbbbbbbbbb");

  const runGitMock = async (_cwd, args) => {
    const cmd = args.join(" ");
    if (cmd === "worktree list --porcelain") return { code: 0, stdout: `worktree ${wtPath}\nHEAD 123\nbranch refs/heads/main\n` };
    if (cmd === "rev-parse --verify --quiet main") return { code: 0, stdout: "123\n" };
    if (cmd === "diff --quiet" || cmd === "diff --cached --quiet") return { code: 0, stdout: "" };
    if (cmd === "ls-files --others --exclude-standard -z") return { code: 0, stdout: "" };
    if (cmd === "rev-list --count main..HEAD") return { code: 0, stdout: "0\n" };
    if (cmd.startsWith("rev-parse --git-path")) return { code: 0, stdout: "" };
    return { code: 0, stdout: "" };
  };

  const pfPositional = await inspectWorktreePreflight({ repoRoot: wtPath, mainRef: "main", worktreeNonce: null, runGit: runGitMock, exists: async () => false });
  assert.equal(pfPositional.entries[0].worktree_id, "worktree-1");

  const pfSaltedA = await inspectWorktreePreflight({ repoRoot: wtPath, mainRef: "main", worktreeNonce: nonceA, runGit: runGitMock, exists: async () => false });
  const pfSaltedB = await inspectWorktreePreflight({ repoRoot: wtPath, mainRef: "main", worktreeNonce: nonceB, runGit: runGitMock, exists: async () => false });

  assert.ok(pfSaltedA.entries[0].worktree_id.startsWith("worktree-"));
  assert.equal(pfSaltedA.entries[0].worktree_id.length, 41);
  assert.notEqual(pfSaltedA.entries[0].worktree_id, pfSaltedB.entries[0].worktree_id);
});

test("Binding freshness and disable gate: stale or disabled binding -> zero candidates and HOLD", () => {
  const nonce = makeNonce("1111111111111111");

  const bDisabled = makeBinding([{ task_id: "t-1", worktree_path: makeWinPath("1"), candidate_nonce: nonce }], { disabled: true });
  const normDis = normalizeBindingRegistry(bDisabled, { now: NOW });
  assert.equal(normDis.status, "disabled");

  const repDis = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([makeEntry("t-1")]) },
    taskWorktreeBinding: { status: "disabled", value: null },
    now: NOW
  });
  assert.equal(repDis.source_health.task_worktree_binding, "disabled");
  assert.equal(repDis.candidates.length, 0);
  assert.equal(repDis.lifecycle_retention_action, "HOLD");

  const staleTime = new Date(NOW - 25 * 60 * 60 * 1_000).toISOString();
  const bStale = makeBinding([{ task_id: "t-1", worktree_path: makeWinPath("1"), candidate_nonce: nonce }], { updatedAt: staleTime });
  const normStale = normalizeBindingRegistry(bStale, { now: NOW, maxAgeMs: DEFAULT_BINDING_MAX_AGE_MS });
  assert.equal(normStale.status, "stale");

  const repStale = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: makeEnrollment([makeEntry("t-1")]) },
    taskWorktreeBinding: { status: "stale", value: null },
    now: NOW
  });
  assert.equal(repStale.source_health.task_worktree_binding, "stale");
  assert.equal(repStale.candidates.length, 0);
  assert.equal(repStale.lifecycle_retention_action, "HOLD");
});

test("Digest mismatch exit 3 for CLI and legacy main entrypoints", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-digest-test-"));
  try {
    const enrollmentPath = join(tempDir, "enrollment.json");
    const lifecyclePath = join(tempDir, "lifecycle.json");
    const resultGatePath = join(tempDir, "result_gate.json");
    const bindingPath = join(tempDir, "binding.json");

    await writeFile(enrollmentPath, JSON.stringify(makeEnrollment([makeEntry("t-1")])));
    await writeFile(lifecyclePath, JSON.stringify(makeLifecycle([])));
    await writeFile(resultGatePath, JSON.stringify(makeResultGate([])));
    await writeFile(bindingPath, JSON.stringify(makeBinding([])));

    const cliRep = await runLifecycleRetentionReport({ repoRoot: tempDir, enrollmentPath, lifecyclePath, resultGatePath, taskWorktreeBindingPath: bindingPath, legacyMode: false, now: NOW });
    const legacyRep = await runLifecycleRetentionReport({ repoRoot: tempDir, enrollmentPath, lifecyclePath, resultGatePath, taskWorktreeBindingPath: bindingPath, legacyMode: true, now: NOW });

    const wrongDigest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    const commonArgs = ["--repo", tempDir, "--enrollment", enrollmentPath, "--lifecycle", lifecyclePath, "--result-gate", resultGatePath, "--binding", bindingPath];

    let cliOut1 = "";
    assert.equal(await cliMain(["report", "--json", ...commonArgs, "--expected-digest", cliRep.digest], { stdout: { write: (s) => { cliOut1 += s; } } }), 0);
    assert.equal(JSON.parse(cliOut1).digest_matched, true);

    let cliOut2 = "";
    assert.equal(await cliMain(["report", "--json", ...commonArgs, "--expected-digest", wrongDigest], { stdout: { write: (s) => { cliOut2 += s; } } }), 3);
    assert.equal(JSON.parse(cliOut2).digest_mismatch, true);

    let legOut1 = "";
    assert.equal(await legacyMain([...commonArgs, "--expected-digest", legacyRep.digest], { stdout: { write: (s) => { legOut1 += s; } } }), 0);
    assert.equal(JSON.parse(legOut1).digest_matched, true);

    let legOut2 = "";
    assert.equal(await legacyMain([...commonArgs, "--expected-digest", wrongDigest], { stdout: { write: (s) => { legOut2 += s; } } }), 3);
    assert.equal(JSON.parse(legOut2).digest_mismatch, true);

    // CLI with --prior-digest alias
    let cliOutAlias = "";
    assert.equal(await cliMain(["report", "--json", ...commonArgs, "--prior-digest", cliRep.digest], { stdout: { write: (s) => { cliOutAlias += s; } } }), 0);
    assert.equal(JSON.parse(cliOutAlias).digest_matched, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Real cliMain report --json pipeline test with full report leak check", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "soulforge-cli-test-"));
  try {
    const enrollmentPath = join(tempDir, "enrollment.json");
    const lifecyclePath = join(tempDir, "lifecycle.json");
    const resultGatePath = join(tempDir, "result_gate.json");
    const bindingPath = join(tempDir, "binding.json");

    const taskId = "task-synthetic-cli-999";
    const candNonce = makeNonce("7777777777777777");
    const wtNonce = makeNonce("8888888888888888");
    const expectedCandidateId = deriveCandidateId(candNonce);
    const worktreePath = win32.join(tempDir, "worktree");

    await writeFile(enrollmentPath, JSON.stringify(makeEnrollment([makeEntry(taskId)])));
    await writeFile(lifecyclePath, JSON.stringify(makeLifecycle([makeIdentity(taskId, "started", "SessionStart")])));
    await writeFile(resultGatePath, JSON.stringify(makeResultGate([])));
    await writeFile(bindingPath, JSON.stringify(makeBinding([{ task_id: taskId, worktree_path: worktreePath, candidate_nonce: candNonce }], { worktreeNonce: wtNonce })));

    let stdoutStr = "";
    let stderrStr = "";
    const exitCode = await cliMain([
      "report", "--json",
      "--repo", tempDir,
      "--enrollment", enrollmentPath,
      "--lifecycle", lifecyclePath,
      "--result-gate", resultGatePath,
      "--binding", bindingPath
    ], { stdout: { write: (s) => { stdoutStr += s; } }, stderr: { write: (s) => { stderrStr += s; } } });

    assert.equal(exitCode, 0);

    const parsed = JSON.parse(stdoutStr);
    assert.equal(parsed.report_only, true);
    assert.equal(parsed.candidates[0].candidate_id, expectedCandidateId);

    const fullLower = stdoutStr.toLowerCase();
    assert.ok(!fullLower.includes(taskId.toLowerCase()), "Task ID must not leak");
    assert.ok(!fullLower.includes(worktreePath.toLowerCase()), "Raw worktree path must not leak");
    assert.ok(!fullLower.includes(worktreePath.replace(/\\/gu, "\\\\").toLowerCase()), "Escaped worktree path must not leak");
    assert.ok(!fullLower.includes(candNonce.toLowerCase()), "Raw candidate nonce must not leak");
    assert.ok(!fullLower.includes(wtNonce.toLowerCase()), "Raw worktree nonce must not leak");
    assert.ok(!fullLower.includes(tempDir.toLowerCase()), "Temp dir path must not leak");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
