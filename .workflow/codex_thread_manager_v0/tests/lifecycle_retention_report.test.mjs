import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LIFECYCLE_MAX_AGE_MS,
  LIFECYCLE_RETENTION_REPORT_DISABLED_ENV,
  buildLifecycleRetentionReport,
  classifyLifecycleRetentionThread,
  inspectWorktreePreflight,
  isLifecycleRetentionReportDisabled,
  parseGitWorktreePorcelain,
  parseLifecycleRetentionReportArgs
} from "../lifecycle_retention_report.mjs";

const NOW = Date.parse("2026-08-06T00:00:00.000Z");
const ISO = new Date(NOW).toISOString();
const PAST = new Date(NOW - 1_000).toISOString();
const SYNTHETIC_SECRET_ROOT = ["C:", "/secret"].join("");

function entry(threadId, { lifecycle = "current", parentThreadId = null, displayLabel = "PRIVATE_TITLE_MUST_NOT_LEAK" } = {}) {
  return {
    thread_id: threadId,
    organization_group_id: "system",
    route_id: null,
    work_id: null,
    thread_kind: "task",
    display_label: displayLabel,
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

function enrollment(entries) {
  return {
    schema_version: "soulforge.team_ops_board.thread_enrollment.v1",
    registry_revision: 1,
    updated_at: ISO,
    disabled: false,
    entries
  };
}

function identity(threadId, lifecycleState, sourceEvent, observedAt = PAST) {
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

function lifecycle(identities, generatedAt = ISO) {
  return {
    schema_version: "soulforge.ai_usage_lifecycle_snapshot.v1",
    generated_at: generatedAt,
    receipt_count: identities.length,
    latest_identity_count: identities.length,
    states: {
      started: identities.filter((item) => item.lifecycle_state === "started").length,
      input_received: identities.filter((item) => item.lifecycle_state === "input_received").length,
      waiting_on_approval: identities.filter((item) => item.lifecycle_state === "waiting_on_approval").length,
      observed_at_stop: identities.filter((item) => item.lifecycle_state === "observed_at_stop").length,
      ended: identities.filter((item) => item.lifecycle_state === "ended").length
    },
    result_pending_count: identities.length,
    raw_content_fields_stored: 0,
    raw_flag_fields_stored: 0,
    identities
  };
}

function gateEvent(eventId, threadId, eventType, { target = "owner", targetThreadId = null, occurredAt = ISO } = {}) {
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

function resultGate(events) {
  return {
    schema_version: "soulforge.team_ops_board.thread_result_gate.v1",
    registry_revision: 1,
    updated_at: ISO,
    disabled: false,
    events
  };
}

test("report is metadata-only and classifies only exact evidence", () => {
  const ids = ["thread-active", "thread-wait", "thread-stop", "thread-gate", "thread-closed", "thread-input"];
  const report = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: enrollment(ids.map((id) => entry(id))) },
    lifecycle: {
      status: "available",
      value: lifecycle([
        identity("thread-active", "started", "SessionStart"),
        identity("thread-wait", "waiting_on_approval", "PermissionRequest"),
        identity("thread-stop", "observed_at_stop", "Stop"),
        identity("thread-input", "input_received", "UserPromptSubmit")
      ])
    },
    resultGate: {
      status: "available",
      value: resultGate([
        gateEvent("gate-1", "thread-gate", "started", { target: "none" }),
        gateEvent("gate-2", "thread-gate", "result_ready"),
        gateEvent("closed-1", "thread-closed", "started", { target: "none" }),
        gateEvent("closed-2", "thread-closed", "result_ready"),
        gateEvent("closed-3", "thread-closed", "accepted"),
        gateEvent("closed-4", "thread-closed", "closed")
      ])
    },
    now: NOW
  });

  assert.deepEqual(report.classifications, {
    active: 1,
    input_waiting: 1,
    result_waiting: 2,
    completed: 0,
    interrupted: 0,
    duplicate: 0,
    duplicate_candidate_hold: 0,
    unknown: 2
  });
  assert.equal(report.threads.find((item) => item.thread_id === "thread-closed").reason_code, "result_gate_not_completion_authority");
  assert.equal(report.threads.find((item) => item.thread_id === "thread-input").reason_code, "input_received_is_not_waiting");
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_TITLE_MUST_NOT_LEAK/u);
  assert.doesNotMatch(JSON.stringify(report), /C:\\private|private.worktree/u);
});

test("stale lifecycle does not create an active classification", () => {
  const report = buildLifecycleRetentionReport({
    enrollment: { status: "available", value: enrollment([entry("thread-stale")]) },
    lifecycle: {
      status: "available",
      value: lifecycle(
        [identity("thread-stale", "started", "SessionStart", new Date(NOW - DEFAULT_LIFECYCLE_MAX_AGE_MS - 1).toISOString())],
        new Date(NOW - DEFAULT_LIFECYCLE_MAX_AGE_MS - 1).toISOString()
      )
    },
    resultGate: { status: "missing", value: null },
    now: NOW
  });
  assert.equal(report.source_health.lifecycle, "stale");
  assert.equal(report.threads[0].classification, "unknown");
});

test("completed, interrupted, and duplicate require explicit typed authority", () => {
  const subject = { thread_id: "thread-authority", lifecycle: "current", parent_thread_id: null };
  assert.equal(classifyLifecycleRetentionThread(subject).classification, "unknown");
  assert.equal(classifyLifecycleRetentionThread(subject, {
    completionReceipt: { type: "authoritative_completion_receipt", thread_id: "thread-authority", authority: "authoritative" }
  }).classification, "completed");
  assert.equal(classifyLifecycleRetentionThread(subject, {
    interruptionReceipt: { type: "explicit_interruption_receipt", thread_id: "thread-authority", authority: "authoritative" }
  }).classification, "interrupted");
  assert.equal(classifyLifecycleRetentionThread(subject, {
    duplicateDecision: { type: "duplicate_decision", thread_id: "thread-authority", authority: "authoritative", decision: "confirmed_duplicate" }
  }).classification, "duplicate");
  assert.equal(classifyLifecycleRetentionThread(subject, {
    duplicateDecision: { type: "duplicate_decision", thread_id: "thread-authority", authority: "authoritative", decision: "candidate_hold" }
  }).classification, "duplicate_candidate_hold");
});

test("newer exact lifecycle or result-gate evidence wins without inference", () => {
  const subject = { thread_id: "thread-order", lifecycle: "current", parent_thread_id: null };
  assert.equal(classifyLifecycleRetentionThread(subject, {
    lifecycleObservation: { fresh: true, lifecycle_state: "started", observed_at: PAST },
    resultGate: { stage: "result_ready", occurred_at: ISO }
  }).classification, "result_waiting");
  assert.equal(classifyLifecycleRetentionThread(subject, {
    lifecycleObservation: { fresh: true, lifecycle_state: "started", observed_at: ISO },
    resultGate: { stage: "result_ready", occurred_at: PAST }
  }).classification, "active");
});

test("report-only arguments reject destructive action flags and support emergency disable", () => {
  assert.throws(() => parseLifecycleRetentionReportArgs(["--apply"]), /report_only_destructive_option_forbidden/u);
  assert.throws(() => parseLifecycleRetentionReportArgs(["--delete=thread-x"]), /report_only_destructive_option_forbidden/u);
  assert.equal(isLifecycleRetentionReportDisabled({ [LIFECYCLE_RETENTION_REPORT_DISABLED_ENV]: "true" }), true);
  assert.equal(isLifecycleRetentionReportDisabled({}), false);
});

test("worktree preflight omits paths and holds for unknown authority", async () => {
  const privateComparisonRef = "refs/heads/private-secret-comparison";
  const records = parseGitWorktreePorcelain([
    `worktree ${SYNTHETIC_SECRET_ROOT}/worktree`,
    "HEAD abcdef",
    "branch refs/heads/codex/private-branch",
    "",
    `worktree ${SYNTHETIC_SECRET_ROOT}/detached`,
    "HEAD abcdef",
    "detached",
    ""
  ].join("\n"));
  assert.equal(records.length, 2);

  const runGit = async (_cwd, args) => {
    const command = args.join(" ");
    if (command === "worktree list --porcelain") {
      return {
        code: 0,
        stdout: [
          `worktree ${SYNTHETIC_SECRET_ROOT}/worktree`,
          "HEAD abcdef",
          "branch refs/heads/codex/private-branch",
          "",
          `worktree ${SYNTHETIC_SECRET_ROOT}/detached`,
          "HEAD abcdef",
          "detached",
          ""
        ].join("\n")
      };
    }
    if (command === `rev-parse --verify --quiet ${privateComparisonRef}`) return { code: 0, stdout: "abcdef\n" };
    if (command === "diff --quiet") return { code: 1, stdout: "" };
    if (command === "diff --cached --quiet") return { code: 0, stdout: "" };
    if (command === "ls-files --others --exclude-standard -z") return { code: 0, stdout: "private-untracked.txt\0" };
    if (command === `rev-list --count ${privateComparisonRef}..HEAD`) return { code: 0, stdout: "2\n" };
    if (command.startsWith("rev-parse --git-path")) return { code: 0, stdout: "relative-admin/marker\n" };
    return { code: 2, stdout: "" };
  };
  const checkedPaths = [];
  const report = await inspectWorktreePreflight({
    repoRoot: `${SYNTHETIC_SECRET_ROOT}/root`,
    mainRef: privateComparisonRef,
    runGit,
    exists: async (target) => {
      checkedPaths.push(target);
      return false;
    }
  });
  assert.equal(report.status, "HOLD");
  assert.equal(report.total_worktrees, 2);
  assert.equal(report.dirty_worktrees, 2);
  assert.equal(report.untracked_worktrees, 2);
  assert.equal(report.unique_commit_worktrees, 2);
  assert.equal(report.comparison_ref_status, "available");
  assert.ok(report.entries.every((item) => item.hold_reasons.includes("pr_authority_unknown")));
  const normalizedCheckedPaths = checkedPaths.map((target) => target.replace(/\\/gu, "/"));
  assert.ok(normalizedCheckedPaths.some((target) => target.includes(`${SYNTHETIC_SECRET_ROOT}/worktree/relative-admin/marker`)));
  assert.ok(normalizedCheckedPaths.some((target) => target.includes(`${SYNTHETIC_SECRET_ROOT}/detached/relative-admin/marker`)));
  assert.doesNotMatch(JSON.stringify(report), /secret|private-branch|private-untracked|private-secret-comparison/u);
});
