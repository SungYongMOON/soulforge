import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { computeReportDigest } from "../lifecycle_retention.mjs";
import {
  RETENTION_CANARY_APPROVAL_SCHEMA,
  RETENTION_CANARY_PACKET_SCHEMA,
  RETENTION_CANARY_RECEIPT_SCHEMA,
  RETENTION_CANARY_RESULT_SCHEMA,
  RETENTION_ARCHIVE_OBSERVATION_SCHEMA,
  CANARY_MANAGER_PROTOCOL_SCHEMA,
  validateRetentionCanaryApproval,
  planRetentionCanary,
  executeRetentionCanary
} from "../lifecycle_retention_canary.mjs";
import {
  executeRetentionCanaryProductionInternal,
  executeRetentionCanarySyntheticInternal,
  computePacketDigest,
  snapshotPlainData
} from "../lifecycle_retention_canary_internal.mjs";
import {
  HELD_PRODUCTION_GIT_CANARY_ADAPTER,
  HELD_PRODUCTION_ARCHIVE_OBSERVER,
  createRealGitCanaryAdapter,
  createSyntheticGitCanaryAdapter,
  createSyntheticArchiveObserverAdapter,
  createManagerCodexArchiveObserverAdapter
} from "../git_worktree_canary_adapter.mjs";
import {
  createSyntheticReplayStoreAdapter,
  createSyntheticBindingStoreAdapter
} from "../../../guild_hall/backup_controller/retention_canary_gate.mjs";
import { RETENTION_PRESERVATION_RECEIPT_SCHEMA } from "../lifecycle_retention_preservation.mjs";
import { runCanaryCli } from "../lifecycle_retention_canary_cli.mjs";

function makeSampleFixtures() {
  const candidateId = "cand-0123456789abcdef0123456789abcdef";
  const approvalId = "appr-0123456789abcdef0123456789abcdef";
  const preservationReceiptId = "rcpt-pres-0123456789abcdef0123456789abcdef";
  const targetCommitSha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
  const approvedMainSha = "b2c3d4e5f60718293a4b5c6d7e8f90123456789a";
  const approvedMainRef = "origin/main";

  const now = 1750000000000;
  const issuedAt = new Date(now - 1000).toISOString();
  const expiresAt = new Date(now + 3600000).toISOString();

  const report = {
    schema_version: "soulforge.codex_thread_manager.lifecycle_retention_report.v1",
    report_only: true,
    generated_at: new Date(now).toISOString(),
    scope_metadata: {
      classifications_scope: "all_current_or_accepted_enrolled_tasks",
      candidates_scope: "exact_bound_active_enrolled_tasks_only"
    },
    lifecycle_retention_action: "HOLD",
    source_health: {
      enrollment: "available",
      lifecycle: "available",
      result_gate: "available",
      task_worktree_binding: "available"
    },
    thread_scope: {
      current_or_accepted_count: 1,
      history_or_retired_excluded_count: 0,
      bound_task_count: 1,
      unbound_task_count: 0,
      orphan_binding_count: 0,
      binding_coverage: "complete"
    },
    classifications: {
      active: 0,
      input_waiting: 0,
      result_waiting: 0,
      completed: 1,
      interrupted: 0,
      duplicate: 0,
      duplicate_candidate_hold: 0,
      unknown: 0
    },
    candidates: [
      {
        candidate_id: candidateId,
        retention_action: "HOLD",
        classification: "completed",
        enrollment_lifecycle: "current",
        pinned: false,
        reason_codes: ["authoritative_completion_receipt"],
        hold_reasons: [],
        metadata_counts: {
          tracked_dirty: false,
          untracked: false,
          index_lock: false,
          operation_markers: 0,
          unique_commits_vs_main: 0,
          locked: false,
          prunable: false
        }
      }
    ],
    authority_gaps: {
      completion_receipt: "HOLD",
      interruption_receipt: "HOLD",
      duplicate_decision: "HOLD",
      codex_archive_delete: "OWNER_AUTHORIZATION_REQUIRED",
      pull_request: "HOLD",
      active_process: "HOLD",
      result_handoff: "HOLD"
    },
    worktree_preflight: {
      report_only: true,
      status: "HOLD",
      list_status: "available",
      comparison_ref_status: "available",
      total_worktrees: 1,
      dirty_worktrees: 0,
      untracked_worktrees: 0,
      locked_worktrees: 0,
      prunable_worktrees: 0,
      index_lock_worktrees: 0,
      operation_marker_worktrees: 0,
      unique_commit_worktrees: 0,
      sanitization_dropped_entries: 0,
      sanitized_field_count: 0,
      authority_gaps: { pull_request: "HOLD", active_process: "HOLD", result_handoff: "HOLD" },
      entries: []
    },
    privacy: { metadata_only: true, raw_content_fields_stored: 0, raw_flag_fields_stored: 0, sensitive_content_included: false, paths_omitted: true }
  };

  const reportDigest = computeReportDigest(report);
  report.digest = reportDigest;

  const approval = {
    schema_version: RETENTION_CANARY_APPROVAL_SCHEMA,
    approval_id: approvalId,
    candidate_id: candidateId,
    report_digest: reportDigest,
    allowed_action: "apply_canary",
    canary_strategy: "archive_and_remove_clean_worktree",
    issued_at: issuedAt,
    expires_at: expiresAt
  };

  const preservationReceipt = {
    schema_version: RETENTION_PRESERVATION_RECEIPT_SCHEMA,
    receipt_id: preservationReceiptId,
    candidate_id: candidateId,
    report_digest: reportDigest,
    approval_id: approvalId,
    strategy: "preservation_branch",
    manifest_id: "pmst-001",
    manifest_digest: "sha256:9999999900000000111111112222222233333333444444445555555566666666",
    status: "PRESERVED_VERIFIED",
    restore_check_status: "VERIFIED",
    verified_at: issuedAt,
    claim_ceiling: "synthetic_evidence_only",
    evidence_kind: "synthetic_test_proof",
    preservation_count: 1,
    removal_count: 0,
    authority: { preservation_authorized: true, removal_authorized: false }
  };

  return { candidateId, approvalId, preservationReceiptId, targetCommitSha, approvedMainSha, approvedMainRef, now, report, approval, preservationReceipt };
}

test("Phase 5 Canary: Successful CANARY_VERIFIED Synthetic Execution Happy Path", async () => {
  const { now, report, approval, preservationReceipt, targetCommitSha, approvedMainSha, approvedMainRef, candidateId } = makeSampleFixtures();
  const planRes = planRetentionCanary(report, approval, preservationReceipt, { now, target_commit_sha: targetCommitSha, approved_main_sha: approvedMainSha, approved_main_ref: approvedMainRef });
  assert.equal(planRes.status, "PLAN_READY");
  const packet = planRes.packet_template;

  const replayStore = createSyntheticReplayStoreAdapter();
  const bindingStore = createSyntheticBindingStoreAdapter({
    bindingsMap: new Map([[packet.binding_handle, {
      candidate_id: candidateId,
      binding_handle: packet.binding_handle,
      packet_id: packet.packet_id,
      packet_digest: packet.packet_digest,
      worktree_path: "/path/to/wt",
      target_commit_sha: targetCommitSha,
      official_thread_id: "thread-123",
      binding_kind: "direct_app_observation",
      observed_at: new Date(now - 100).toISOString(),
      issued_at: approval.issued_at,
      expires_at: approval.expires_at
    }]])
  });

  const archiveObs = {
    schema_version: RETENTION_ARCHIVE_OBSERVATION_SCHEMA,
    candidate_id: candidateId,
    packet_digest: packet.packet_digest,
    status: "archived",
    archive_verified: true,
    observer_kind: "codex_app_manager",
    observed_at: new Date(now - 100).toISOString(),
    observed_evidence: Object.freeze(["synthetic_archive_verified"])
  };

  const archiveObserverAdapter = createSyntheticArchiveObserverAdapter({ archivedTasks: new Map([[candidateId, archiveObs]]) });
  const worktreeRemoverAdapter = createSyntheticGitCanaryAdapter();
  const restoreProbeAdapter = createSyntheticGitCanaryAdapter();

  const res = await executeRetentionCanarySyntheticInternal(report, approval, preservationReceipt, archiveObs, {
    now, packetInput: packet, replayStore, bindingStore, archiveObserverAdapter, worktreeRemoverAdapter, restoreProbeAdapter
  });

  assert.equal(res.status, "CANARY_VERIFIED");
  assert.equal(res.reason_code, "SUCCESS");
  assert.equal(res.archive_count, 1);
  assert.equal(res.removal_count, 1);
  assert.equal(res.restore_probe_count, 1);
  assert.equal(res.zero_forbidden_actions, true);
  assert.equal(res.replay_state, "single_use_consumed");

  const r = res.receipt;
  assert.equal(r.schema_version, RETENTION_CANARY_RECEIPT_SCHEMA);
  assert.match(r.receipt_id, /^rcpt-canary-[0-9a-f]{32}$/);
  assert.equal(r.claim_ceiling, "synthetic_evidence_only");
  assert.equal(r.evidence_kind, "synthetic_test_proof");
});

test("Phase 5 Canary: Blocking Archive Result Gate Negatives (Fifth Review)", async () => {
  const { now, report, approval, preservationReceipt, targetCommitSha, approvedMainSha, approvedMainRef, candidateId } = makeSampleFixtures();
  const planRes = planRetentionCanary(report, approval, preservationReceipt, { now, target_commit_sha: targetCommitSha, approved_main_sha: approvedMainSha, approved_main_ref: approvedMainRef });
  const packet = planRes.packet_template;

  const replayStore = createSyntheticReplayStoreAdapter();
  const bindingStore = createSyntheticBindingStoreAdapter({
    bindingsMap: new Map([[packet.binding_handle, {
      candidate_id: candidateId,
      binding_handle: packet.binding_handle,
      packet_id: packet.packet_id,
      packet_digest: packet.packet_digest,
      worktree_path: "/path/to/wt",
      target_commit_sha: targetCommitSha,
      official_thread_id: "thread-123",
      binding_kind: "direct_app_observation",
      observed_at: new Date(now - 100).toISOString(),
      issued_at: approval.issued_at,
      expires_at: approval.expires_at
    }]])
  });

  const validObs = {
    schema_version: RETENTION_ARCHIVE_OBSERVATION_SCHEMA,
    candidate_id: candidateId,
    packet_digest: packet.packet_digest,
    status: "archived",
    archive_verified: true,
    observer_kind: "codex_app_manager",
    observed_at: new Date(now - 100).toISOString(),
    observed_evidence: Object.freeze(["synthetic_archive_verified"])
  };

  const worktreeRemoverAdapter = createSyntheticGitCanaryAdapter();
  const restoreProbeAdapter = createSyntheticGitCanaryAdapter();

  // Test 1: Mismatched candidate_id in archive observation
  const badCandObs = { ...validObs, candidate_id: "cand-wrong00000000000000000000000000" };
  const obsAdapter1 = createSyntheticArchiveObserverAdapter({ archivedTasks: new Map([[candidateId, badCandObs]]) });
  const res1 = await executeRetentionCanarySyntheticInternal(report, approval, preservationReceipt, validObs, {
    now, packetInput: packet, replayStore, bindingStore, archiveObserverAdapter: obsAdapter1, worktreeRemoverAdapter, restoreProbeAdapter
  });
  assert.equal(res1.status, "HOLD");
  assert.equal(res1.reason_code, "ARCHIVE_NOT_VERIFIED");
  assert.equal(res1.archive_count, 0);
  assert.equal(res1.removal_count, 0);
  assert.equal(res1.restore_probe_count, 0);
  assert.equal(res1.replay_state, "none");
  assert.equal(worktreeRemoverAdapter.getRemoveCalls(), 0);

  // Test 2: Mismatched packet_digest in archive observation
  const badDigestObs = { ...validObs, packet_digest: "sha256:wrong000000000000000000000000000000000000000000000000000000000000" };
  const obsAdapter2 = createSyntheticArchiveObserverAdapter({ archivedTasks: new Map([[candidateId, badDigestObs]]) });
  const res2 = await executeRetentionCanarySyntheticInternal(report, approval, preservationReceipt, validObs, {
    now, packetInput: packet, replayStore, bindingStore, archiveObserverAdapter: obsAdapter2, worktreeRemoverAdapter, restoreProbeAdapter
  });
  assert.equal(res2.status, "HOLD");
  assert.equal(res2.reason_code, "ARCHIVE_NOT_VERIFIED");
  assert.equal(res2.archive_count, 0);
  assert.equal(worktreeRemoverAdapter.getRemoveCalls(), 0);

  // Test 3: Stale observed_at (>24h)
  const staleObs = { ...validObs, observed_at: new Date(now - 90000000).toISOString() };
  const obsAdapter3 = createSyntheticArchiveObserverAdapter({ archivedTasks: new Map([[candidateId, staleObs]]) });
  const res3 = await executeRetentionCanarySyntheticInternal(report, approval, preservationReceipt, staleObs, {
    now, packetInput: packet, replayStore, bindingStore, archiveObserverAdapter: obsAdapter3, worktreeRemoverAdapter, restoreProbeAdapter
  });
  assert.equal(res3.status, "HOLD");
  assert.equal(res3.reason_code, "ARCHIVE_OBSERVATION_EXPIRED");
  assert.equal(res3.archive_count, 0);
  assert.equal(worktreeRemoverAdapter.getRemoveCalls(), 0);

  // Test 4: Off-allowlist evidence token in archive observation
  const badTokObsAdapter = {
    adapter_kind: "synthetic_archive_observer_adapter",
    feature_state: "off",
    observeTaskArchive: () => ({
      schema_version: RETENTION_ARCHIVE_OBSERVATION_SCHEMA,
      success: true,
      archive_verified: true,
      candidate_id: candidateId,
      packet_digest: packet.packet_digest,
      status: "archived",
      observer_kind: "codex_app_manager",
      observed_at: validObs.observed_at,
      observed_evidence: ["FORBIDDEN_CUSTOM_PATH_TOKEN"]
    })
  };
  const res4 = await executeRetentionCanarySyntheticInternal(report, approval, preservationReceipt, validObs, {
    now, packetInput: packet, replayStore, bindingStore, archiveObserverAdapter: badTokObsAdapter, worktreeRemoverAdapter, restoreProbeAdapter
  });
  assert.equal(res4.status, "HOLD");
  assert.equal(res4.reason_code, "EVIDENCE_TOKEN_INVALID");
  assert.equal(res4.archive_count, 0);
  assert.equal(worktreeRemoverAdapter.getRemoveCalls(), 0);
});

test("Phase 5 Canary: Linked Worktree Outside Main Root Supported (Blocker B2)", async () => {
  const drive = "C:";
  const mockRepo = `${drive}\\Users\\user\\repo`;
  const mockOutsideWt = `${drive}\\Users\\user\\.codex\\worktrees\\97a3\\outside_wt`;
  const approvedMainSha = "b2c3d4e5f60718293a4b5c6d7e8f90123456789a";
  const targetCommitSha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

  const calls = [];
  const mockRunGit = async (cwd, args) => {
    calls.push({ cwd, args });

    if (args[0] === "rev-parse" && args[4] === "origin/main^{commit}") return { code: 0, stdout: `${approvedMainSha}\n` };
    if (args[0] === "merge-base") return { code: 0, stdout: "" };
    if (args[0] === "rev-list") return { code: 0, stdout: "0\n" };
    if (args[0] === "worktree" && args[1] === "list") {
      const stdout = `worktree ${mockRepo}\nHEAD ${approvedMainSha}\n\nworktree ${mockOutsideWt}\nHEAD ${targetCommitSha}\n`;
      return { code: 0, stdout };
    }
    if (args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: `${targetCommitSha}\n` };
    if (args[0] === "diff" || args[0] === "ls-files") return { code: 0, stdout: "" };
    if (args[0] === "worktree" && args[1] === "remove") return { code: 0, stdout: "" };
    return { code: 0, stdout: "" };
  };

  const adapter = createRealGitCanaryAdapter({
    repoRoot: mockRepo,
    runGit: mockRunGit,
    lstatFn: async () => ({ isSymbolicLink: () => false }),
    realpathFn: async (p) => p
  });

  const packet = { target_commit_sha: targetCommitSha, approved_main_sha: approvedMainSha, approved_main_ref: "origin/main" };

  const remRes = await adapter.removeCleanWorktree("cand-1", packet, { worktreePath: mockOutsideWt });
  assert.equal(remRes.success, true);
  assert.equal(remRes.removal_count, 1);
});

test("Phase 5 Canary: Restore Probe Direct Tests for Porcelain Residue & Present Dir (Fifth Review)", async () => {
  const drive = "C:";
  const mockRepo = `${drive}\\Users\\user\\repo`;
  const targetCommitSha = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
  const tempProbeDir = `${drive}\\Users\\user\\temp\\sf_probe_canary_12345`;

  // Test 1: Porcelain residue during probe cleanup -> cleanupOk false
  const mockRunGitResidue = async (cwd, args) => {
    if (args[0] === "worktree" && args[1] === "add") return { code: 0, stdout: "" };
    if (args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: `${targetCommitSha}\n` };
    if (args[0] === "status") return { code: 0, stdout: "" };
    if (args[0] === "worktree" && args[1] === "remove") return { code: 0, stdout: "" };
    if (args[0] === "worktree" && args[1] === "list") {
      // Residue matching probe dir survives in porcelain!
      return { code: 0, stdout: `worktree ${mockRepo}\nHEAD ${targetCommitSha}\n\nworktree ${tempProbeDir}\nHEAD ${targetCommitSha}\n` };
    }
    return { code: 0, stdout: "" };
  };

  const adapterResidue = createRealGitCanaryAdapter({
    repoRoot: mockRepo,
    runGit: mockRunGitResidue,
    lstatFn: async () => { throw { code: "ENOENT" }; }, // File absent
    realpathFn: async (p) => p,
    mkdtempFn: async () => tempProbeDir,
    rmFn: async () => {}
  });

  const resResidue = await adapterResidue.performRestoreProbe("cand-1", { target_commit_sha: targetCommitSha });
  assert.equal(resResidue.success, false);
  assert.equal(resResidue.error_code, "RESTORE_PROBE_CLEANUP_FAILED");
  assert.equal(resResidue.probe_cleanup_verified, false);

  // Test 2: Directory still present on disk (lstat succeeds) -> cleanupOk false
  const mockRunGitClean = async (cwd, args) => {
    if (args[0] === "worktree" && args[1] === "add") return { code: 0, stdout: "" };
    if (args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: `${targetCommitSha}\n` };
    if (args[0] === "status") return { code: 0, stdout: "" };
    if (args[0] === "worktree" && args[1] === "remove") return { code: 0, stdout: "" };
    if (args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: `worktree ${mockRepo}\nHEAD ${targetCommitSha}\n` };
    return { code: 0, stdout: "" };
  };

  const adapterDirPresent = createRealGitCanaryAdapter({
    repoRoot: mockRepo,
    runGit: mockRunGitClean,
    lstatFn: async () => ({ isDirectory: () => true }), // Directory still present on disk!
    realpathFn: async (p) => p,
    mkdtempFn: async () => tempProbeDir,
    rmFn: async () => {}
  });

  const resDirPresent = await adapterDirPresent.performRestoreProbe("cand-1", { target_commit_sha: targetCommitSha });
  assert.equal(resDirPresent.success, false);
  assert.equal(resDirPresent.error_code, "RESTORE_PROBE_CLEANUP_FAILED");
  assert.equal(resDirPresent.probe_cleanup_verified, false);
});

test("Phase 5 Canary: Real Archive Observer Interface & HELD constant (Fifth Review)", async () => {
  assert.equal(HELD_PRODUCTION_ARCHIVE_OBSERVER.feature_state, "off");
  assert.equal(HELD_PRODUCTION_ARCHIVE_OBSERVER.observeTaskArchive().error_code, "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN");

  const managerObs = createManagerCodexArchiveObserverAdapter({
    observeManagerTaskArchive: async (candId, digest) => ({
      schema_version: RETENTION_ARCHIVE_OBSERVATION_SCHEMA,
      success: true,
      archive_verified: true,
      candidate_id: candId,
      packet_digest: digest,
      status: "archived",
      observer_kind: "codex_app_manager"
    })
  });

  assert.equal(managerObs.adapter_kind, "real_codex_archive_observer_adapter");
  assert.equal(managerObs.feature_state, "armed");
  const res = await managerObs.observeTaskArchive("cand-123", "sha256:1111222233334444555566667777888899990000111122223333444455556666");
  assert.equal(res.success, true);
  assert.equal(res.archive_verified, true);
});

test("Phase 5 Canary: Honest CLI Option Parsing Rejects Dash-Prefixed Values (Fifth Review)", async () => {
  // Reject dash-prefixed value --report --force
  const res1 = await runCanaryCli(["prepare", "--report", "--force"]);
  assert.equal(res1.exitCode, 2);
  assert.equal(res1.error, "CANARY_CLI_OPTION_VALUE_FORBIDDEN_DASH");

  // Reject dash-prefixed value --approval -f
  const res2 = await runCanaryCli(["prepare", "--report", "report.json", "--approval", "-f"]);
  assert.equal(res2.exitCode, 2);
  assert.equal(res2.error, "CANARY_CLI_OPTION_VALUE_FORBIDDEN_DASH");
});

test("Phase 5 Canary: Operational Hardening Tests (Sixth Review)", async () => {
  const { now, report, approval, preservationReceipt, targetCommitSha, approvedMainSha, approvedMainRef, candidateId } = makeSampleFixtures();
  const planRes = planRetentionCanary(report, approval, preservationReceipt, { now, target_commit_sha: targetCommitSha, approved_main_sha: approvedMainSha, approved_main_ref: approvedMainRef });
  const packet = planRes.packet_template;

  const replayStore = createSyntheticReplayStoreAdapter();
  const bindingStore = createSyntheticBindingStoreAdapter({
    bindingsMap: new Map([[packet.binding_handle, {
      candidate_id: candidateId,
      binding_handle: packet.binding_handle,
      packet_id: packet.packet_id,
      packet_digest: packet.packet_digest,
      worktree_path: "/path/to/wt",
      target_commit_sha: targetCommitSha,
      official_thread_id: "thread-123",
      binding_kind: "direct_app_observation",
      observed_at: new Date(now - 100).toISOString(),
      issued_at: approval.issued_at,
      expires_at: approval.expires_at
    }]])
  });

  const archiveObs = {
    schema_version: RETENTION_ARCHIVE_OBSERVATION_SCHEMA,
    candidate_id: candidateId,
    packet_digest: packet.packet_digest,
    status: "archived",
    archive_verified: true,
    observer_kind: "codex_app_manager",
    observed_at: new Date(now - 100).toISOString(),
    observed_evidence: Object.freeze(["synthetic_archive_verified"])
  };

  const archiveObserverAdapter = createSyntheticArchiveObserverAdapter({ archivedTasks: new Map([[candidateId, archiveObs]]) });
  const worktreeRemoverAdapter = createSyntheticGitCanaryAdapter();
  const restoreProbeAdapter = createSyntheticGitCanaryAdapter();

  // Test 1: Result shape compatibility (packet AND packet_template both present and equal)
  const resCompat = await executeRetentionCanarySyntheticInternal(report, approval, preservationReceipt, archiveObs, {
    now, packetInput: packet, replayStore, bindingStore, archiveObserverAdapter, worktreeRemoverAdapter, restoreProbeAdapter
  });
  assert.equal(resCompat.status, "CANARY_VERIFIED");
  assert.notEqual(resCompat.packet, null);
  assert.notEqual(resCompat.packet_template, null);
  assert.deepEqual(resCompat.packet, resCompat.packet_template);

  // Test 2: Honest removal_count 1 on post-remove evidence failure
  const replayStore2 = createSyntheticReplayStoreAdapter();
  const badEvidenceRemover = {
    adapter_kind: "synthetic_git_canary_adapter",
    removeCleanWorktree: () => ({
      success: true,
      removal_count: 1,
      observed_evidence: ["UNSAFE_INVALID_RAW_TOKEN"]
    })
  };
  const resBadRemEv = await executeRetentionCanarySyntheticInternal(report, approval, preservationReceipt, archiveObs, {
    now, packetInput: packet, replayStore: replayStore2, bindingStore, archiveObserverAdapter, worktreeRemoverAdapter: badEvidenceRemover, restoreProbeAdapter
  });
  assert.equal(resBadRemEv.status, "HOLD");
  assert.equal(resBadRemEv.reason_code, "EVIDENCE_TOKEN_INVALID");
  assert.equal(resBadRemEv.removal_count, 1); // Honest removal_count 1!
  assert.equal(resBadRemEv.archive_count, 1);
  assert.equal(resBadRemEv.restore_probe_count, 0);
  assert.equal(resBadRemEv.replay_state, "single_use_consumed");

  // Test 3: Synthetic mode rejects real evidence token (codex_manager_archive_verified)
  const realEvObs = { ...archiveObs, observed_evidence: Object.freeze(["codex_manager_archive_verified"]) };
  const realEvObsAdapter = createSyntheticArchiveObserverAdapter({ archivedTasks: new Map([[candidateId, realEvObs]]) });
  const replayStore3 = createSyntheticReplayStoreAdapter();
  const resCrossRej = await executeRetentionCanarySyntheticInternal(report, approval, preservationReceipt, realEvObs, {
    now, packetInput: packet, replayStore: replayStore3, bindingStore, archiveObserverAdapter: realEvObsAdapter, worktreeRemoverAdapter, restoreProbeAdapter
  });
  assert.equal(resCrossRej.status, "HOLD");
  assert.equal(resCrossRej.reason_code, "EVIDENCE_TOKEN_INVALID");
  assert.equal(resCrossRej.archive_count, 0);

  // Test 4: Preservation receipt extra-key rejection
  const extraKeyPreservation = { ...preservationReceipt, extra_hostile_key: "forged" };
  const resExtraPres = await executeRetentionCanarySyntheticInternal(report, approval, extraKeyPreservation, archiveObs, {
    now, packetInput: packet, replayStore, bindingStore, archiveObserverAdapter, worktreeRemoverAdapter, restoreProbeAdapter
  });
  assert.equal(resExtraPres.status, "HOLD");
  assert.equal(resExtraPres.reason_code, "PRESERVATION_RECEIPT_REQUIRED");

  // Test 5: ProtocolContext extra-key rejection in real mode
  const mockRepoPath = join(tmpdir(), "sf_mock_repo");
  const realRemover = createRealGitCanaryAdapter({ repoRoot: mockRepoPath });
  const realProbe = createRealGitCanaryAdapter({ repoRoot: mockRepoPath });
  const realObs = createManagerCodexArchiveObserverAdapter({
    observeManagerTaskArchive: async () => ({
      schema_version: RETENTION_ARCHIVE_OBSERVATION_SCHEMA,
      success: true, archive_verified: true, candidate_id: candidateId, packet_digest: packet.packet_digest, status: "archived", observer_kind: "codex_app_manager", observed_at: new Date(now - 100).toISOString(), observed_evidence: ["codex_manager_archive_verified"]
    })
  });
  const extraKeyProtoCtx = {
    schema_version: CANARY_MANAGER_PROTOCOL_SCHEMA,
    adapter_mode: "real",
    approval_id: packet.approval_id,
    packet_id: packet.packet_id,
    packet_digest: packet.packet_digest,
    binding_handle: packet.binding_handle,
    issued_at: approval.issued_at,
    expires_at: approval.expires_at,
    manager_attestation_digest: "sha256:1111111122222222333333334444444455555555666666667777777788888888",
    forged_extra_key: "bad"
  };
  const realPreservation = { ...preservationReceipt, claim_ceiling: "real_preservation_verified", evidence_kind: "real_git_execution" };
  const resExtraProto = await executeRetentionCanarySyntheticInternal(report, approval, realPreservation, archiveObs, {
    now, packetInput: packet, protocolContext: extraKeyProtoCtx, replayStore, bindingStore, archiveObserverAdapter: realObs, worktreeRemoverAdapter: realRemover, restoreProbeAdapter: realProbe
  });
  assert.equal(resExtraProto.status, "HOLD");
  assert.equal(resExtraProto.reason_code, "PROTOCOL_INVALID");
});
