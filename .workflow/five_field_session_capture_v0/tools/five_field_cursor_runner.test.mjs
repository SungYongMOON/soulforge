import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CursorRunnerInterruption,
  RUNNER_INPUT_SCHEMA,
  cursorLogicalPath,
  cursorRevision,
  inspectNonInteractiveGitEnvironment,
  localFileAuthorityFingerprint,
  runCursorRunner,
} from "./five_field_cursor_runner.mjs";
import {
  LEASE_TTL_FORMULA,
  RUNTIME_PREFLIGHT_INPUT_SCHEMA,
  STALE_RECOVERY_POLICY,
  WORKTREE_INVENTORY_SOURCE_CLASSIFICATION,
  WORKTREE_INVENTORY_TOOL_CLASSIFICATION,
  WRITER_EPOCH_FORMULA,
  runRuntimePreflight,
  runtimeAttestationDigest,
  runtimeLatestReceiptDigest,
  runtimePathDigest,
} from "./five_field_runtime_preflight.mjs";
import {
  AUTOMATION_SELF_LOOP_TRAILER,
  sourceLaneTrailer,
} from "./five_field_cursor_sweep.mjs";

const RUNNER_TOOL = fileURLToPath(new URL("./five_field_cursor_runner.mjs", import.meta.url));
const SWEEP_TOOL = fileURLToPath(new URL("./five_field_cursor_sweep.mjs", import.meta.url));
const SOURCE_REF = "refs/heads/main";
const WRITER_REF = "refs/heads/main";
const LEDGER_PATH = "ledger/five_field_log.jsonl";
const LEDGER_REMOTE_NAME = "workmeta-origin";
const CURSOR_REMOTE_NAME = "private-origin";
const SOURCE_TUPLE = {
  repo: "soulforge-public",
  ref: SOURCE_REF,
  source_lane: "public-main",
};
const CURSOR_PATH = cursorLogicalPath(SOURCE_TUPLE);
const RUNTIME = {
  tool: "codex",
  model: "gpt-5.6-sol",
  installed_models: ["gpt-5.6-sol"],
  asserted_worker: "codex_gpt-5.6-sol",
};

function seal(value) {
  value.attestation_digest = runtimeAttestationDigest(value);
  return value;
}

function canonicalDigest(value) {
  const canonical = (candidate) => {
    if (Array.isArray(candidate)) {
      return `[${candidate.map(canonical).join(",")}]`;
    }
    if (candidate && typeof candidate === "object") {
      return `{${Object.keys(candidate).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(candidate[key])}`).join(",")}}`;
    }
    return JSON.stringify(candidate);
  };
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function inventoryGroup(paths) {
  const root_digests = paths.map(runtimePathDigest).sort();
  return {
    count: root_digests.length,
    zero_count: root_digests.length === 0,
    root_digests,
  };
}

function git(repo, args, options = {}) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  }).trim();
}

function configureIdentity(repo) {
  git(repo, ["config", "user.name", "Synthetic Test"]);
  git(repo, ["config", "user.email", "synthetic@example.invalid"]);
  git(repo, ["config", "core.autocrlf", "false"]);
}

function sourceCommit(repo, name, subject, date, body = "") {
  writeFileSync(join(repo, "work.txt"), `${name}\n`, "utf8");
  git(repo, ["add", "work.txt"]);
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  };
  git(repo, ["commit", "-m", body ? `${subject}\n\n${body}` : subject], { env });
  return git(repo, ["rev-parse", "HEAD"]);
}

function showJson(repo, ref, logicalPath) {
  return JSON.parse(git(repo, ["show", `${ref}:${logicalPath}`]));
}

function showLedger(repo) {
  const probe = spawnSync("git", [
    "-C",
    repo,
    "show",
    `${WRITER_REF}:${LEDGER_PATH}`,
  ], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (probe.status !== 0) return [];
  return probe.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function initializeWriter(remote, clone, remoteName, seedFile, content) {
  execFileSync("git", ["init", "--bare", "-b", "main", remote], {
    encoding: "utf8",
    windowsHide: true,
  });
  execFileSync("git", ["clone", remote, clone], {
    encoding: "utf8",
    windowsHide: true,
  });
  configureIdentity(clone);
  git(clone, ["remote", "rename", "origin", remoteName]);
  const file = join(clone, ...seedFile.split("/"));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
  git(clone, ["add", seedFile]);
  git(clone, ["commit", "-m", `synthetic ${seedFile} seed`]);
  git(clone, ["push", remoteName, `HEAD:${WRITER_REF}`]);
}

function fixture({ sourceSubjects = ["first public result"], selfLoop = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "five-field-runner-"));
  const sourceWork = join(root, "fixture-source-work");
  const sourceSnapshot = join(root, "source");
  const ledgerWriterRoot = join(root, "writer-workmeta");
  const ledgerRemote = join(ledgerWriterRoot, "remote.git");
  const ledgerClone = join(ledgerWriterRoot, "clone");
  const cursorWriterRoot = join(root, "writer-private-state");
  const cursorRemote = join(cursorWriterRoot, "remote.git");
  const cursorClone = join(cursorWriterRoot, "clone");
  const runtimeRoot = join(root, "runner");
  const configRoot = join(root, "config");
  const inputPath = join(configRoot, "input.json");
  const lockParent = join(root, "locks");
  const lockPath = join(lockParent, "runner.lease.json");
  mkdirSync(runtimeRoot);
  mkdirSync(configRoot);
  writeFileSync(inputPath, "{}\n", "utf8");
  mkdirSync(lockParent);
  mkdirSync(ledgerWriterRoot);
  mkdirSync(cursorWriterRoot);
  const activePublic = join(root, "forbidden-active-public");
  const activeWorkmeta = join(activePublic, "_workmeta");
  const activePrivateState = join(activePublic, "private-state");
  const automationControl = join(root, "forbidden-automation-control");
  const codexWorktree = join(root, "forbidden-codex-worktree");
  const orcaWorktree = join(root, "forbidden-orca-worktree");
  mkdirSync(activeWorkmeta, { recursive: true });
  mkdirSync(activePrivateState);
  mkdirSync(automationControl);
  mkdirSync(codexWorktree);
  mkdirSync(orcaWorktree);
  const guardedRoots = {
    active_public_root: activePublic,
    active_workmeta: activeWorkmeta,
    active_private_state: activePrivateState,
    automation_control_root: automationControl,
  };
  const forbiddenRoots = [
    ...Object.entries(guardedRoots).map(([kind, path]) => ({ kind, path })),
    { kind: "codex_worktree", path: codexWorktree },
    { kind: "orca_worktree", path: orcaWorktree },
  ];

  mkdirSync(sourceWork);
  execFileSync("git", ["init", "-b", "main", sourceWork], {
    encoding: "utf8",
    windowsHide: true,
  });
  configureIdentity(sourceWork);
  const seed = sourceCommit(
    sourceWork,
    "seed",
    "synthetic seed",
    "2026-07-25T01:00:00Z",
  );
  const sourceCommits = sourceSubjects.map((subject, index) =>
    sourceCommit(
      sourceWork,
      `result-${index}`,
      subject,
      `2026-07-${26 + index}T01:00:00Z`,
    ));
  if (selfLoop) {
    sourceCommits.push(sourceCommit(
      sourceWork,
      "self-loop",
      "synthetic automated output",
      `2026-07-${26 + sourceCommits.length}T01:00:00Z`,
      `${AUTOMATION_SELF_LOOP_TRAILER}\n${sourceLaneTrailer(SOURCE_TUPLE)}`,
    ));
  }
  const target = sourceCommits.at(-1);
  execFileSync("git", ["clone", "--bare", sourceWork, sourceSnapshot], {
    encoding: "utf8",
    windowsHide: true,
  });

  const remoteCursor = {
    ...SOURCE_TUPLE,
    last_successful_source_commit: seed,
    sequence: 0,
    writer_epoch: 0,
  };
  initializeWriter(
    ledgerRemote,
    ledgerClone,
    LEDGER_REMOTE_NAME,
    ".synthetic-seed",
    "ledger seed\n",
  );
  initializeWriter(
    cursorRemote,
    cursorClone,
    CURSOR_REMOTE_NAME,
    CURSOR_PATH,
    `${JSON.stringify(remoteCursor, null, 2)}\n`,
  );
  const ledgerAuthorityFingerprint =
    localFileAuthorityFingerprint(ledgerRemote);
  const cursorAuthorityFingerprint =
    localFileAuthorityFingerprint(cursorRemote);

  const commitAuthor = {
    name: "Synthetic Recovery Worker",
    email: "synthetic-recovery@example.invalid",
  };
  const preflightNow = new Date();
  const observedAt = new Date(preflightNow.valueOf() - 60_000).toISOString();
  const expiresAt = new Date(preflightNow.valueOf() + 10 * 60_000).toISOString();
  const codexInventory = inventoryGroup([codexWorktree]);
  const orcaInventory = inventoryGroup([orcaWorktree]);
  const worktreeInventory = seal({
    observed_at: observedAt,
    expires_at: expiresAt,
    source_classification: WORKTREE_INVENTORY_SOURCE_CLASSIFICATION,
    tool_classification: WORKTREE_INVENTORY_TOOL_CLASSIFICATION,
    complete: true,
    codex: codexInventory,
    orca: orcaInventory,
    root_set_digest: canonicalDigest({
      codex: codexInventory.root_digests,
      orca: orcaInventory.root_digests,
    }),
  });
  const acl = seal({
    status: "VERIFIED",
    principal_intent: "dedicated_runner_least_privilege",
    runner_read_execute: true,
    source_read_only: true,
    config_read_only: true,
    writers_modify: true,
    locks_modify: true,
    active_roots_write_denied: true,
  });
  const backupRestore = seal({
    status: "VERIFIED",
    observed_at: observedAt,
    expires_at: expiresAt,
    authorities: {
      workmeta: {
        classification: "backup_recovery_included",
        authority_fingerprint: ledgerAuthorityFingerprint,
        backup_receipt_digest: `sha256:${"1".repeat(64)}`,
      },
      private_state: {
        classification: "backup_recovery_included",
        authority_fingerprint: cursorAuthorityFingerprint,
        backup_receipt_digest: `sha256:${"2".repeat(64)}`,
      },
    },
    surface_classifications: {
      runner: "regenerable_excluded",
      source: "regenerable_excluded",
      writer_workmeta_clone: "regenerable_excluded",
      writer_private_state_clone: "regenerable_excluded",
      locks: "regenerable_excluded",
      execution_temp: "regenerable_excluded",
      config: "capture_prohibited",
      remote_url: "capture_prohibited",
      credential: "capture_prohibited",
      owner_token: "capture_prohibited",
      authoritative_ledger: "backup_restore_included",
      authoritative_cursor_authority: "backup_restore_included",
      redacted_receipt: "backup_restore_included",
    },
    clone_state: {
      writer_workmeta_dirty: false,
      writer_private_state_dirty: false,
      writer_workmeta_unpushed_commits: 0,
      writer_private_state_unpushed_commits: 0,
    },
    cursor_ledger_binding: {
      status: "VERIFIED",
      ledger_remote_inclusion_verified: true,
      cursor_points_only_to_included_ledger: true,
      included_ledger_digest: `sha256:${"3".repeat(64)}`,
      cursor_binding_digest: `sha256:${"4".repeat(64)}`,
    },
    restore: {
      destination_class: "isolated_scratch_non_authority",
      destination_root_digest: `sha256:${"5".repeat(64)}`,
      latest_receipt_digest: runtimeLatestReceiptDigest(
        `sha256:${"1".repeat(64)}`,
        `sha256:${"2".repeat(64)}`,
      ),
      manifest_digest: `sha256:${"7".repeat(64)}`,
      forbidden_root_clear: true,
      excluded_surfaces_absent: true,
      active_roots_untouched: true,
      workmeta: {
        status: "VERIFIED",
        authority_fingerprint: ledgerAuthorityFingerprint,
        receipt_digest: `sha256:${"1".repeat(64)}`,
        manifest_digest: `sha256:${"7".repeat(64)}`,
        destination_binding_digest: `sha256:${"9".repeat(64)}`,
        latest_receipt: true,
        manifest_match: true,
        hash_match: true,
        ref_match: true,
        remote_inclusion_verified: true,
        monotonic_sequence: true,
        monotonic_writer_epoch: true,
      },
      private_state: {
        status: "VERIFIED",
        authority_fingerprint: cursorAuthorityFingerprint,
        receipt_digest: `sha256:${"2".repeat(64)}`,
        manifest_digest: `sha256:${"7".repeat(64)}`,
        destination_binding_digest: `sha256:${"b".repeat(64)}`,
        latest_receipt: true,
        manifest_match: true,
        hash_match: true,
        ref_match: true,
        remote_inclusion_verified: true,
        monotonic_sequence: true,
        monotonic_writer_epoch: true,
      },
    },
  });
  const noninteractive = {
    terminal_prompt_blocked: true,
    credential_interactive_blocked: true,
    askpass_blocked: true,
    ssh_batch_mode: true,
    failure_output_discarded: true,
  };
  const forbiddenConfig = {
    include: false,
    include_if: false,
    instead_of: false,
    push_instead_of: false,
  };
  const gitAuthority = seal({
    status: "VERIFIED",
    observed_at: observedAt,
    expires_at: expiresAt,
    writers: {
      workmeta: {
        status: "VERIFIED",
        writer_role: "writer_workmeta",
        logical_remote: LEDGER_REMOTE_NAME,
        ref: WRITER_REF,
        transport_class: "local",
        authority_fingerprint: ledgerAuthorityFingerprint,
        config_projection_digest: `sha256:${"c".repeat(64)}`,
        config_content_digest: `sha256:${"d".repeat(64)}`,
        read_probe_status: "PASS",
        full_config_read: true,
        config_read_only: true,
        immutable_recheck: true,
        forbidden_config: structuredClone(forbiddenConfig),
        noninteractive: structuredClone(noninteractive),
      },
      private_state: {
        status: "VERIFIED",
        writer_role: "writer_private_state",
        logical_remote: CURSOR_REMOTE_NAME,
        ref: WRITER_REF,
        transport_class: "local",
        authority_fingerprint: cursorAuthorityFingerprint,
        config_projection_digest: `sha256:${"e".repeat(64)}`,
        config_content_digest: `sha256:${"f".repeat(64)}`,
        read_probe_status: "PASS",
        full_config_read: true,
        config_read_only: true,
        immutable_recheck: true,
        forbidden_config: structuredClone(forbiddenConfig),
        noninteractive: structuredClone(noninteractive),
      },
    },
  });
  const leasePolicy = seal({
    status: "VERIFIED",
    authority_profile: "owner_with_state",
    operational_primary: true,
    owner_token_class: "opaque_random_256_v1",
    first_lease_stale: false,
    host_identity_digest: `sha256:${createHash("sha256")
      .update("synthetic-host")
      .digest("hex")}`,
    restored_writer_epoch: 0,
    authority_writer_epoch: 0,
    receipt_writer_epoch: 0,
    initial_writer_epoch: 1,
    ttl_minutes: 30,
    ttl_formula: LEASE_TTL_FORMULA,
    epoch_formula: WRITER_EPOCH_FORMULA,
    stale_recovery_policy: STALE_RECOVERY_POLICY,
  });
  const preflightInput = {
    schema_version: RUNTIME_PREFLIGHT_INPUT_SCHEMA,
    roots: {
      runner: runtimeRoot,
      source: sourceSnapshot,
      writer_workmeta: ledgerWriterRoot,
      writer_private_state: cursorWriterRoot,
      config: configRoot,
      locks: lockParent,
    },
    launch: { input_path: inputPath },
    guarded_roots: guardedRoots,
    forbidden_roots: structuredClone(forbiddenRoots),
    worktree_inventory: worktreeInventory,
    evidence: {
      acl,
      backup_restore: backupRestore,
      git_authority: gitAuthority,
      lease_policy: leasePolicy,
    },
  };
  const preflightReceipt = runRuntimePreflight(preflightInput, {
    now: preflightNow,
  });
  assert.equal(preflightReceipt.status, "PASS", JSON.stringify(preflightReceipt));
  const leaseAcquiredAt =
    new Date(preflightNow.valueOf() - 60_000).toISOString();
  const leaseExpiresAt =
    new Date(new Date(leaseAcquiredAt).valueOf() + 30 * 60_000).toISOString();
  const input = {
    schema_version: RUNNER_INPUT_SCHEMA,
    execution_mode: "isolated",
    recorded_at: preflightNow.toISOString(),
    runtime: { ...RUNTIME },
    source: {
      classification: "public",
      ...SOURCE_TUPLE,
      seed,
      target,
      snapshot_path: sourceSnapshot,
    },
    cursor: {
      ...SOURCE_TUPLE,
      last_successful_source_commit: seed,
      logical_path: CURSOR_PATH,
      expected_revision: cursorRevision(remoteCursor),
      expected_sequence: 0,
    },
    ledger_writer: {
      classification: "synthetic",
      binding_id: "synthetic-ledger-writer",
      clone_path: ledgerClone,
      remote: LEDGER_REMOTE_NAME,
      transport_class: "local_file",
      authority_fingerprint: ledgerAuthorityFingerprint,
      ref: WRITER_REF,
      ledger_logical_path: LEDGER_PATH,
      commit_author: { ...commitAuthor },
      output_commit_message: "synthetic recovery ledger output",
    },
    cursor_writer: {
      classification: "synthetic",
      binding_id: "synthetic-cursor-writer",
      clone_path: cursorClone,
      remote: CURSOR_REMOTE_NAME,
      transport_class: "local_file",
      authority_fingerprint: cursorAuthorityFingerprint,
      ref: WRITER_REF,
      commit_author: { ...commitAuthor },
      cursor_commit_message: "synthetic recovery cursor advance",
    },
    lease: {
      owner_token: "1".repeat(64),
      pid: 424242,
      host_identity: "synthetic-host",
      acquired_at: leaseAcquiredAt,
      expires_at: leaseExpiresAt,
      writer_epoch: 1,
      lock_path: lockPath,
      stale_recovery_policy: "same_host_dead_pid_expired_owner_approved",
      owner_allows_stale_recovery: false,
    },
    isolation: {
      runtime_root: runtimeRoot,
      forbidden_roots: forbiddenRoots,
    },
    runtime_preflight: {
      input: preflightInput,
      receipt: preflightReceipt,
    },
    automation_binding: {
      candidate_sha256: `sha256:${"0".repeat(64)}`,
      candidate_status: "PAUSED",
      runtime_manifest_digest: preflightReceipt.manifest_digest,
      runtime_evidence_digest: preflightReceipt.evidence_digest,
      runtime_launch_binding_digest: preflightReceipt.launch_binding_digest,
    },
    source_allowlist: [{
      classification: "public",
      ...SOURCE_TUPLE,
      snapshot_path: sourceSnapshot,
    }],
    ledger_writer_allowlist: [{
      classification: "synthetic",
      binding_id: "synthetic-ledger-writer",
      clone_path: ledgerClone,
      remote: LEDGER_REMOTE_NAME,
      transport_class: "local_file",
      authority_fingerprint: ledgerAuthorityFingerprint,
      ref: WRITER_REF,
      ledger_logical_path: LEDGER_PATH,
    }],
    cursor_writer_allowlist: [{
      classification: "synthetic",
      binding_id: "synthetic-cursor-writer",
      clone_path: cursorClone,
      remote: CURSOR_REMOTE_NAME,
      transport_class: "local_file",
      authority_fingerprint: cursorAuthorityFingerprint,
      ref: WRITER_REF,
      cursor_logical_path: CURSOR_PATH,
    }],
  };
  return {
    root,
    sourceWork,
    sourceSnapshot,
    ledgerRemote,
    ledgerClone,
    cursorRemote,
    cursorClone,
    runtimeRoot,
    configRoot,
    inputPath,
    lockParent,
    lockPath,
    forbiddenRoots,
    guardedRoots,
    preflightNow,
    seed,
    target,
    sourceCommits,
    input,
  };
}

function worktreeSentinel(f) {
  return {
    cursor: readFileSync(join(f.cursorClone, ...CURSOR_PATH.split("/"))),
    cursorStatus: git(f.cursorClone, ["status", "--porcelain=v1", "--untracked-files=all"]),
    ledgerStatus: git(f.ledgerClone, ["status", "--porcelain=v1", "--untracked-files=all"]),
    liveRunner: readFileSync(RUNNER_TOOL),
    liveSweep: readFileSync(SWEEP_TOOL),
  };
}

function assertWorktreeSentinel(f, before) {
  assert.deepEqual(
    readFileSync(join(f.cursorClone, ...CURSOR_PATH.split("/"))),
    before.cursor,
  );
  assert.equal(
    git(f.cursorClone, ["status", "--porcelain=v1", "--untracked-files=all"]),
    before.cursorStatus,
  );
  assert.equal(
    git(f.ledgerClone, ["status", "--porcelain=v1", "--untracked-files=all"]),
    before.ledgerStatus,
  );
  assert.deepEqual(readFileSync(RUNNER_TOOL), before.liveRunner);
  assert.deepEqual(readFileSync(SWEEP_TOOL), before.liveSweep);
}

function assertNoInjectedPath(receipt, f, extra = []) {
  const serialized = JSON.stringify(receipt);
  for (const sentinel of [
    f.root,
    f.sourceSnapshot,
    f.ledgerRemote,
    f.ledgerClone,
    f.cursorRemote,
    f.cursorClone,
    f.runtimeRoot,
    f.configRoot,
    f.lockParent,
    ...extra,
  ]) {
    assert.equal(serialized.includes(sentinel), false, `receipt leaked ${sentinel}`);
  }
}

function appendConflictingRecord(f) {
  const conflictClone = join(f.root, "conflict-clone");
  execFileSync("git", ["clone", f.ledgerRemote, conflictClone], {
    encoding: "utf8",
    windowsHide: true,
  });
  configureIdentity(conflictClone);
  const ledgerFile = join(conflictClone, ...LEDGER_PATH.split("/"));
  const existing = readFileSync(ledgerFile, "utf8")
    .split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(existing.length, 1);
  const conflict = {
    ...existing[0],
    output: "synthetic conflicting immutable output",
  };
  writeFileSync(
    ledgerFile,
    `${readFileSync(ledgerFile, "utf8")}${JSON.stringify(conflict)}\n`,
    "utf8",
  );
  git(conflictClone, ["add", LEDGER_PATH]);
  git(conflictClone, ["commit", "-m", "synthetic identity conflict"]);
  git(conflictClone, ["push", "origin", `HEAD:${WRITER_REF}`]);
}

function advanceLedgerRemote(f) {
  const raceClone = join(f.root, "writer-race-clone");
  execFileSync("git", ["clone", f.ledgerRemote, raceClone], {
    encoding: "utf8",
    windowsHide: true,
  });
  configureIdentity(raceClone);
  writeFileSync(join(raceClone, "synthetic-race.txt"), "remote advanced\n", "utf8");
  git(raceClone, ["add", "synthetic-race.txt"]);
  git(raceClone, ["commit", "-m", "synthetic concurrent writer advance"]);
  git(raceClone, ["push", "origin", `HEAD:${WRITER_REF}`]);
}

function advanceCursorRemote(f) {
  const raceClone = join(f.root, "cursor-race-clone");
  execFileSync("git", ["clone", f.cursorRemote, raceClone], {
    encoding: "utf8",
    windowsHide: true,
  });
  configureIdentity(raceClone);
  writeFileSync(join(raceClone, "synthetic-race.txt"), "remote advanced\n", "utf8");
  git(raceClone, ["add", "synthetic-race.txt"]);
  git(raceClone, ["commit", "-m", "synthetic concurrent cursor advance"]);
  git(raceClone, ["push", "origin", `HEAD:${WRITER_REF}`]);
}

function corruptAdvancedCursorRemote(f) {
  const corruptionClone = join(f.root, "cursor-corruption-clone");
  execFileSync("git", ["clone", f.cursorRemote, corruptionClone], {
    encoding: "utf8",
    windowsHide: true,
  });
  configureIdentity(corruptionClone);
  const cursorFile = join(
    corruptionClone,
    ...CURSOR_PATH.split("/"),
  );
  const cursor = JSON.parse(readFileSync(cursorFile, "utf8"));
  cursor.sequence += 10;
  writeFileSync(cursorFile, `${JSON.stringify(cursor, null, 2)}\n`, "utf8");
  git(corruptionClone, ["add", CURSOR_PATH]);
  git(corruptionClone, ["commit", "-m", "synthetic corrupt cursor content"]);
  git(corruptionClone, ["push", "origin", `HEAD:${WRITER_REF}`]);
}

function writeLease(f, overrides = {}) {
  const value = {
    owner_token: "other-fence-owner",
    pid: 515151,
    host_identity: "synthetic-host",
    acquired_at: "2026-07-29T01:00:00Z",
    expires_at: "2026-07-29T02:00:00Z",
    writer_epoch: 1,
    ...overrides,
  };
  writeFileSync(f.lockPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertNonAcceptance(receipt) {
  assert.equal(receipt.official_completion, false);
  assert.equal(receipt.worksession_acceptance, false);
  assert.equal(receipt.taskdriver_acceptance, false);
  assert.equal(receipt.erp_acceptance, false);
  assert.equal(receipt.mcp_acceptance, false);
  assert.equal(receipt.claim_ceiling, "operational_evidence_only");
}

test("all built-in Git execution is non-interactive and redacts failure output", () => {
  assert.deepEqual(inspectNonInteractiveGitEnvironment({
    GIT_TERMINAL_PROMPT: "1",
    GCM_INTERACTIVE: "Always",
    GIT_ASKPASS: "synthetic-interactive-helper",
    SSH_ASKPASS: "synthetic-interactive-helper",
    SSH_ASKPASS_REQUIRE: "force",
    GIT_SSH_COMMAND: "synthetic-interactive-ssh",
  }), {
    terminal_prompt_blocked: true,
    credential_manager_interactive: false,
    git_askpass_blocked: true,
    ssh_askpass_blocked: true,
    ssh_batch_mode: true,
    raw_failure_output_discarded: true,
  });
});

test("failing Git boundary observes noninteractive env and never leaks process output", () => {
  const f = fixture();
  const observation = join(f.root, "synthetic-git-env-observed.txt");
  const marker = "synthetic-auth-failure-marker";
  const rejectingHook = join(f.ledgerRemote, "hooks", "pre-receive");
  writeFileSync(rejectingHook, [
    "#!/bin/sh",
    "[ \"$GIT_TERMINAL_PROMPT\" = \"0\" ] || exit 88",
    "[ \"$GCM_INTERACTIVE\" = \"Never\" ] || exit 89",
    "[ \"$SSH_ASKPASS_REQUIRE\" = \"never\" ] || exit 90",
    "printf observed > \"$SYNTHETIC_GIT_ENV_OBSERVATION\"",
    `printf ${marker}`,
    `printf ${marker} >&2`,
    "exit 1",
    "",
  ].join("\n"), "utf8");
  chmodSync(rejectingHook, 0o755);
  useBuiltInNetworkTransport(f, "https");

  const previousObservation = process.env.SYNTHETIC_GIT_ENV_OBSERVATION;
  try {
    process.env.SYNTHETIC_GIT_ENV_OBSERVATION = observation;
    const receipt = runCursorRunner(f.input);
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(
      receipt.hold_reasons,
      ["ledger_output_unknown_after_push"],
    );
    assert.equal(readFileSync(observation, "utf8").trim(), "observed");
    assert.equal(JSON.stringify(receipt).includes(marker), false);
    assert.equal(receipt.cursor_update.created, false);
  } finally {
    if (previousObservation === undefined) {
      delete process.env.SYNTHETIC_GIT_ENV_OBSERVATION;
    } else {
      process.env.SYNTHETIC_GIT_ENV_OBSERVATION = previousObservation;
    }
    rmSync(f.root, { recursive: true, force: true });
  }
});

function runCli(f, input, overrides = {}) {
  writeFileSync(f.inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
  const preflight = input.runtime_preflight.receipt;
  assert.equal(preflight.status, "PASS", JSON.stringify(preflight));
  return spawnSync(process.execPath, [
    RUNNER_TOOL,
    "--runtime-root",
    overrides.runtimeRoot || f.runtimeRoot,
    "--config-root",
    overrides.configRoot || f.configRoot,
    "--runtime-manifest-digest",
    overrides.manifestDigest || preflight.manifest_digest,
    "--runtime-evidence-digest",
    overrides.evidenceDigest || preflight.evidence_digest,
    "--runtime-launch-binding-digest",
    overrides.launchBindingDigest || preflight.launch_binding_digest,
    "--input",
    overrides.inputPath || f.inputPath,
  ], {
    encoding: "utf8",
    windowsHide: true,
  });
}

function refreshRuntimePreflight(f, now = f.preflightNow) {
  const preflightInput = f.input.runtime_preflight.input;
  for (const evidence of [
    preflightInput.worktree_inventory,
    preflightInput.evidence.acl,
    preflightInput.evidence.backup_restore,
    preflightInput.evidence.git_authority,
    preflightInput.evidence.lease_policy,
  ]) seal(evidence);
  const receipt = runRuntimePreflight(preflightInput, { now });
  assert.equal(receipt.status, "PASS", JSON.stringify(receipt));
  f.input.runtime_preflight.receipt = receipt;
  f.input.automation_binding.runtime_manifest_digest = receipt.manifest_digest;
  f.input.automation_binding.runtime_evidence_digest = receipt.evidence_digest;
  f.input.automation_binding.runtime_launch_binding_digest =
    receipt.launch_binding_digest;
  return receipt;
}

function setLeasePolicyBasis(f, overrides) {
  const policy = f.input.runtime_preflight.input.evidence.lease_policy;
  Object.assign(policy, overrides);
  seal(policy);
  return refreshRuntimePreflight(f);
}

function setNetworkTransportBinding(f, transportClass = "https") {
  const fingerprints = {
    ledger: `sha256:${"d".repeat(64)}`,
    cursor: `sha256:${"e".repeat(64)}`,
  };
  for (const [writer, allowlist, fingerprint] of [
    [
      f.input.ledger_writer,
      f.input.ledger_writer_allowlist,
      fingerprints.ledger,
    ],
    [
      f.input.cursor_writer,
      f.input.cursor_writer_allowlist,
      fingerprints.cursor,
    ],
  ]) {
    writer.transport_class = transportClass;
    writer.authority_fingerprint = fingerprint;
    allowlist[0].transport_class = transportClass;
    allowlist[0].authority_fingerprint = fingerprint;
  }
  const evidence = f.input.runtime_preflight.input.evidence;
  evidence.git_authority.writers.workmeta.transport_class = transportClass;
  evidence.git_authority.writers.workmeta.authority_fingerprint =
    fingerprints.ledger;
  evidence.git_authority.writers.private_state.transport_class = transportClass;
  evidence.git_authority.writers.private_state.authority_fingerprint =
    fingerprints.cursor;
  evidence.backup_restore.authorities.workmeta.authority_fingerprint =
    fingerprints.ledger;
  evidence.backup_restore.authorities.private_state.authority_fingerprint =
    fingerprints.cursor;
  evidence.backup_restore.restore.workmeta.authority_fingerprint =
    fingerprints.ledger;
  evidence.backup_restore.restore.private_state.authority_fingerprint =
    fingerprints.cursor;
  refreshRuntimePreflight(f);
  return fingerprints;
}

function useBuiltInNetworkTransport(f, transportClass = "https") {
  const fingerprints = setNetworkTransportBinding(f, transportClass);
  for (const [clone, remote, fingerprint] of [
    [f.ledgerClone, LEDGER_REMOTE_NAME, fingerprints.ledger],
    [f.cursorClone, CURSOR_REMOTE_NAME, fingerprints.cursor],
  ]) {
    git(clone, [
      "config",
      `remote.${remote}.soulforge-transport-class`,
      transportClass,
    ]);
    git(clone, [
      "config",
      `remote.${remote}.soulforge-authority-fingerprint`,
      fingerprint,
    ]);
  }
}

function useMockNetworkTransport(f, transportClass = "https") {
  setNetworkTransportBinding(f, transportClass);

  function executor(clone, remote) {
    return (request) => {
      if (request.operation === "fetch_fresh_tip") {
        git(clone, ["fetch", "--no-tags", "--quiet", remote, WRITER_REF]);
        return {
          status: "OK",
          tip: git(clone, ["rev-parse", "--verify", "FETCH_HEAD"]),
          authority_binding_verified: true,
        };
      }
      if (request.operation === "push_commit") {
        const result = spawnSync("git", [
          "-C",
          clone,
          "push",
          "--porcelain",
          remote,
          `${request.commit}:${WRITER_REF}`,
        ], {
          encoding: "utf8",
          windowsHide: true,
        });
        return {
          status: result.status === 0
            ? "PUSHED"
            : "REJECTED_NON_FAST_FORWARD",
          authority_binding_verified: true,
        };
      }
      git(clone, ["fetch", "--no-tags", "--quiet", remote, WRITER_REF]);
      const tip = git(clone, ["rev-parse", "--verify", "FETCH_HEAD"]);
      const contains = spawnSync("git", [
        "-C",
        clone,
        "merge-base",
        "--is-ancestor",
        request.commit,
        tip,
      ], {
        encoding: "utf8",
        windowsHide: true,
      }).status === 0;
      return {
        status: contains ? "INCLUDED" : "NOT_INCLUDED",
        tip,
        authority_binding_verified: true,
      };
    };
  }

  return {
    [f.input.ledger_writer.binding_id]:
      executor(f.ledgerClone, LEDGER_REMOTE_NAME),
    [f.input.cursor_writer.binding_id]:
      executor(f.cursorClone, CURSOR_REMOTE_NAME),
  };
}

test("HTTPS and SSH use only injected executors and preserve publication order", () => {
  for (const transportClass of ["https", "ssh"]) {
    const f = fixture();
    try {
      const transportExecutors = useMockNetworkTransport(f, transportClass);
      const receipt = runCursorRunner(f.input, { transportExecutors });
      assert.equal(receipt.status, "SUCCESS", JSON.stringify(receipt));
      assert.deepEqual(receipt.writer_binding, {
        ledger: {
          classification: "synthetic",
          transport_class: transportClass,
          authority_binding_verified: true,
        },
        cursor: {
          classification: "synthetic",
          transport_class: transportClass,
          authority_binding_verified: true,
        },
      });
      assert.deepEqual(receipt.publication_order, [
        "ledger_push_attempt",
        "ledger_remote_inclusion_verified",
        "cursor_commit_created",
        "cursor_push_attempt",
        "cursor_remote_inclusion_verified",
      ]);
      assertNoInjectedPath(receipt, f);
      assertNonAcceptance(receipt);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("network transport without an executor and unknown push outcome HOLD before cursor CAS", () => {
  const noExecutor = fixture();
  try {
    setNetworkTransportBinding(noExecutor);
    const receipt = runCursorRunner(noExecutor.input);
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(receipt.hold_reasons, ["writer_transport_metadata_missing"]);
    assert.equal(receipt.lease.acquired, false);
    assert.equal(existsSync(noExecutor.lockPath), false);
    assertNoInjectedPath(receipt, noExecutor);
  } finally {
    rmSync(noExecutor.root, { recursive: true, force: true });
  }

  const unknown = fixture();
  try {
    const transportExecutors = useMockNetworkTransport(unknown, "ssh");
    const ledgerId = unknown.input.ledger_writer.binding_id;
    const baseLedgerExecutor = transportExecutors[ledgerId];
    transportExecutors[ledgerId] = (request) => request.operation === "push_commit"
      ? { status: "UNKNOWN_AFTER_PUSH", authority_binding_verified: true }
      : baseLedgerExecutor(request);
    const receipt = runCursorRunner(unknown.input, { transportExecutors });
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("ledger_output_unknown_after_push"));
    assert.equal(receipt.cursor_update.created, false);
    assert.equal(
      showJson(unknown.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      unknown.seed,
    );
    assertNoInjectedPath(receipt, unknown);
  } finally {
    rmSync(unknown.root, { recursive: true, force: true });
  }
});

test("built-in HTTPS/SSH executor verifies metadata, inclusion, and push uncertainty", () => {
  for (const transportClass of ["https", "ssh"]) {
    const f = fixture();
    try {
      useBuiltInNetworkTransport(f, transportClass);
      const cli = runCli(f, f.input);
      assert.equal(cli.status, 0, cli.stdout || cli.stderr);
      const receipt = JSON.parse(cli.stdout);
      assert.equal(receipt.status, "SUCCESS", JSON.stringify(receipt));
      assert.equal(receipt.ledger_output.remote_contains_commit, true);
      assert.equal(receipt.cursor_update.remote_contains_commit, true);
      assert.equal(
        receipt.writer_binding.ledger.authority_binding_verified,
        true,
      );
      assert.equal(
        receipt.writer_binding.cursor.authority_binding_verified,
        true,
      );
      assertNoInjectedPath(receipt, f);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  const uncertain = fixture();
  try {
    useBuiltInNetworkTransport(uncertain, "https");
    git(uncertain.ledgerClone, [
      "config",
      `remote.${LEDGER_REMOTE_NAME}.pushurl`,
      join(uncertain.root, "synthetic-unreachable-remote.git"),
    ]);
    const receipt = runCursorRunner(uncertain.input);
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("ledger_output_unknown_after_push"));
    assert.equal(receipt.cursor_update.created, false);
    assertNoInjectedPath(receipt, uncertain);
  } finally {
    rmSync(uncertain.root, { recursive: true, force: true });
  }

  const raced = fixture();
  try {
    useBuiltInNetworkTransport(raced, "ssh");
    const receipt = runCursorRunner(raced.input, {
      beforeLedgerPush: () => advanceLedgerRemote(raced),
    });
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes(
      "ledger_output_non_fast_forward_push_failed",
    ));
    assert.equal(receipt.cursor_update.created, false);
    assertNoInjectedPath(receipt, raced);
  } finally {
    rmSync(raced.root, { recursive: true, force: true });
  }
});

test("v3 input is explicitly held and CLI launch binding fails closed", () => {
  const f = fixture();
  try {
    const v3 = structuredClone(f.input);
    v3.schema_version = "soulforge.five_field_cursor_runner_input.v3";
    const receipt = runCursorRunner(v3);
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(receipt.hold_reasons, ["runner_v3_explicit_hold"]);
    assert.equal(receipt.lease.acquired, false);

    const v3Cli = runCli(f, v3);
    assert.equal(v3Cli.status, 2, v3Cli.stdout || v3Cli.stderr);
    assert.deepEqual(
      JSON.parse(v3Cli.stdout).hold_reasons,
      ["runner_v3_explicit_hold"],
    );

    const wrongDigest = runCli(f, f.input, {
      manifestDigest: `sha256:${"f".repeat(64)}`,
    });
    assert.equal(wrongDigest.status, 2, wrongDigest.stdout || wrongDigest.stderr);
    assert.deepEqual(
      JSON.parse(wrongDigest.stdout).hold_reasons,
      ["runtime_cli_binding_mismatch"],
    );

    const wrongEvidence = runCli(f, f.input, {
      evidenceDigest: `sha256:${"e".repeat(64)}`,
    });
    assert.equal(
      wrongEvidence.status,
      2,
      wrongEvidence.stdout || wrongEvidence.stderr,
    );
    assert.deepEqual(
      JSON.parse(wrongEvidence.stdout).hold_reasons,
      ["runtime_cli_binding_mismatch"],
    );

    const wrongLaunch = runCli(f, f.input, {
      launchBindingDigest: `sha256:${"d".repeat(64)}`,
    });
    assert.equal(
      wrongLaunch.status,
      2,
      wrongLaunch.stdout || wrongLaunch.stderr,
    );
    assert.deepEqual(
      JSON.parse(wrongLaunch.stdout).hold_reasons,
      ["runtime_cli_binding_mismatch"],
    );

    const outsidePath = join(f.sourceWork, "outside-input.json");
    writeFileSync(outsidePath, `${JSON.stringify(f.input)}\n`, "utf8");
    const outside = runCli(f, f.input, { inputPath: outsidePath });
    assert.equal(outside.status, 1, outside.stdout || outside.stderr);
    assert.deepEqual(JSON.parse(outside.stdout), {
      ok: false,
      error: "cli_input_realpath_invalid",
    });
    assert.equal(existsSync(f.lockPath), false);
    assert.equal(showLedger(f.ledgerRemote).length, 0);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("v4 rejects caller summaries, missing projections, swapped authority rows, and digest mismatch", () => {
  const f = fixture();
  try {
    const summaryOnly = structuredClone(f.input);
    summaryOnly.runtime_preflight = {
      status: "PASS",
      manifest_digest: f.input.runtime_preflight.receipt.manifest_digest,
      evidence_digest: f.input.runtime_preflight.receipt.evidence_digest,
      launch_binding_digest:
        f.input.runtime_preflight.receipt.launch_binding_digest,
    };
    const summaryReceipt = runCursorRunner(summaryOnly);
    assert.equal(summaryReceipt.status, "HOLD");
    assert.deepEqual(
      summaryReceipt.hold_reasons,
      ["runtime_preflight_full_projection_required"],
    );
    assert.equal(summaryReceipt.lease.acquired, false);

    const missingProjection = structuredClone(f.input);
    delete missingProjection.runtime_preflight.input.worktree_inventory;
    const missingReceipt = runCursorRunner(missingProjection);
    assert.equal(missingReceipt.status, "HOLD");
    assert.ok(missingReceipt.hold_reasons[0].startsWith(
      "runtime_preflight_recheck:",
    ));
    assert.equal(missingReceipt.lease.acquired, false);

    const swapped = structuredClone(f.input);
    const writers =
      swapped.runtime_preflight.input.evidence.git_authority.writers;
    [writers.workmeta, writers.private_state] = [
      writers.private_state,
      writers.workmeta,
    ];
    seal(swapped.runtime_preflight.input.evidence.git_authority);
    const swappedReceipt = runCursorRunner(swapped);
    assert.equal(swappedReceipt.status, "HOLD");
    assert.ok(swappedReceipt.hold_reasons[0].startsWith(
      "runtime_preflight_recheck:",
    ));
    assert.equal(swappedReceipt.lease.acquired, false);

    const mismatched = structuredClone(f.input);
    mismatched.automation_binding.runtime_evidence_digest =
      `sha256:${"9".repeat(64)}`;
    const mismatchReceipt = runCursorRunner(mismatched);
    assert.equal(mismatchReceipt.status, "HOLD");
    assert.deepEqual(
      mismatchReceipt.hold_reasons,
      ["automation_runtime_binding_mismatch"],
    );
    assert.equal(mismatchReceipt.lease.acquired, false);
    assert.equal(showLedger(f.ledgerRemote).length, 0);
    assertNonAcceptance(mismatchReceipt);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("runtime evidence expiry and root or digest drift fail closed at mutation boundaries", () => {
  const expired = fixture();
  try {
    let clock = expired.preflightNow;
    const expiresAt = new Date(
      expired.input.runtime_preflight.input.worktree_inventory.expires_at,
    );
    const receipt = runCursorRunner(expired.input, {
      preflightNow: () => clock,
      beforeLedgerPush: () => {
        clock = expiresAt;
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons[0].startsWith(
      "runtime_preflight_recheck:",
    ));
    assert.equal(receipt.ledger_output.remote_contains_commit, false);
    assert.equal(receipt.cursor_update.created, false);
    assert.equal(showLedger(expired.ledgerRemote).length, 0);
    assert.equal(
      showJson(expired.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      expired.seed,
    );
  } finally {
    rmSync(expired.root, { recursive: true, force: true });
  }

  const rootDrift = fixture();
  try {
    const receipt = runCursorRunner(rootDrift.input, {
      preflightNow: rootDrift.preflightNow,
      beforeCursorCommit: () => {
        rootDrift.input.runtime_preflight.input.roots.source =
          rootDrift.guardedRoots.active_public_root;
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.equal(receipt.ledger_output.remote_contains_commit, true);
    assert.equal(receipt.cursor_update.created, false);
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason: "authority_drift_after_ledger:before_cursor_commit",
      cursor_unchanged: true,
    });
    assert.equal(
      showJson(rootDrift.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      rootDrift.seed,
    );
  } finally {
    rmSync(rootDrift.root, { recursive: true, force: true });
  }

  const digestDrift = fixture();
  try {
    const receipt = runCursorRunner(digestDrift.input, {
      preflightNow: digestDrift.preflightNow,
      beforeCursorPush: () => {
        digestDrift.input.automation_binding.runtime_manifest_digest =
          `sha256:${"8".repeat(64)}`;
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.equal(receipt.ledger_output.remote_contains_commit, true);
    assert.equal(receipt.cursor_update.created, true);
    assert.equal(receipt.cursor_update.remote_contains_commit, false);
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason: "authority_drift_after_ledger:before_cursor_push",
      cursor_unchanged: true,
    });
    assert.equal(
      showJson(digestDrift.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      digestDrift.seed,
    );
    assertNonAcceptance(receipt);
  } finally {
    rmSync(digestDrift.root, { recursive: true, force: true });
  }
});

test("source snapshot hook races fail at the final adjacent mutation gates", () => {
  const beforeLedger = fixture();
  try {
    const receipt = runCursorRunner(beforeLedger.input, {
      beforeLedgerPush: () => {
        git(beforeLedger.sourceSnapshot, [
          "update-ref",
          SOURCE_REF,
          beforeLedger.seed,
        ]);
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(
      receipt.hold_reasons,
      ["source_snapshot_changed_before_ledger_push"],
    );
    assert.equal(receipt.ledger_output.push_success, false);
    assert.equal(receipt.ledger_output.remote_contains_commit, false);
    assert.equal(receipt.cursor_update.created, false);
    assert.equal(showLedger(beforeLedger.ledgerRemote).length, 0);
    assert.equal(
      showJson(beforeLedger.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      beforeLedger.seed,
    );
  } finally {
    rmSync(beforeLedger.root, { recursive: true, force: true });
  }

  const beforeCursorCommit = fixture();
  try {
    const receipt = runCursorRunner(beforeCursorCommit.input, {
      beforeCursorCommit: () => {
        git(beforeCursorCommit.sourceSnapshot, [
          "update-ref",
          SOURCE_REF,
          beforeCursorCommit.seed,
        ]);
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(
      receipt.hold_reasons,
      ["source_snapshot_changed_before_cursor_commit"],
    );
    assert.equal(receipt.ledger_output.remote_contains_commit, true);
    assert.equal(receipt.cursor_update.created, false);
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason:
        "source_snapshot_drift_after_ledger:before_cursor_commit",
      cursor_unchanged: true,
    });
    assert.equal(showLedger(beforeCursorCommit.ledgerRemote).length, 1);
    assert.equal(
      showJson(beforeCursorCommit.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      beforeCursorCommit.seed,
    );
  } finally {
    rmSync(beforeCursorCommit.root, { recursive: true, force: true });
  }

  const beforeCursorPush = fixture();
  try {
    const receipt = runCursorRunner(beforeCursorPush.input, {
      beforeCursorPush: () => {
        git(beforeCursorPush.sourceSnapshot, [
          "update-ref",
          SOURCE_REF,
          beforeCursorPush.seed,
        ]);
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(
      receipt.hold_reasons,
      ["source_snapshot_changed_before_cursor_push"],
    );
    assert.equal(receipt.ledger_output.remote_contains_commit, true);
    assert.equal(receipt.cursor_update.created, true);
    assert.equal(receipt.cursor_update.push_success, false);
    assert.equal(receipt.cursor_update.remote_contains_commit, false);
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason: "source_snapshot_drift_after_ledger:before_cursor_push",
      cursor_unchanged: true,
    });
    assert.equal(showLedger(beforeCursorPush.ledgerRemote).length, 1);
    assert.equal(
      showJson(beforeCursorPush.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      beforeCursorPush.seed,
    );
  } finally {
    rmSync(beforeCursorPush.root, { recursive: true, force: true });
  }
});

test("post-ledger source and lease failures always require redacted reconciliation", () => {
  const sourceDrift = fixture();
  try {
    const receipt = runCursorRunner(sourceDrift.input, {
      beforePostLedgerCursorSourceCheck: () => {
        git(sourceDrift.sourceSnapshot, [
          "update-ref",
          SOURCE_REF,
          sourceDrift.seed,
        ]);
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(
      receipt.hold_reasons,
      ["source_snapshot_changed_before_cursor_cas"],
    );
    assert.equal(receipt.ledger_output.remote_contains_commit, true);
    assert.equal(receipt.cursor_update.created, false);
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason: "source_snapshot_drift_after_ledger:before_cursor_cas",
      cursor_unchanged: true,
    });
    assert.equal(showLedger(sourceDrift.ledgerRemote).length, 1);
    assert.equal(
      showJson(sourceDrift.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      sourceDrift.seed,
    );
  } finally {
    rmSync(sourceDrift.root, { recursive: true, force: true });
  }

  const leaseBeforeCommit = fixture();
  try {
    const receipt = runCursorRunner(leaseBeforeCommit.input, {
      beforeCursorCommit: () => {
        writeLease(leaseBeforeCommit, { writer_epoch: 2 });
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.equal(receipt.hold_reasons[0], "lease_fence_lost");
    assert.ok(receipt.hold_reasons.includes("lease_release_failed"));
    assert.equal(receipt.ledger_output.remote_contains_commit, true);
    assert.equal(receipt.cursor_update.created, false);
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason:
        "post_ledger_cursor_stage_failure:before_cursor_commit",
      cursor_unchanged: true,
    });
    assert.equal(showLedger(leaseBeforeCommit.ledgerRemote).length, 1);
    assert.equal(
      showJson(leaseBeforeCommit.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      leaseBeforeCommit.seed,
    );
  } finally {
    rmSync(leaseBeforeCommit.root, { recursive: true, force: true });
  }

  const leaseBeforePush = fixture();
  try {
    const receipt = runCursorRunner(leaseBeforePush.input, {
      beforeCursorPush: () => {
        writeLease(leaseBeforePush, { writer_epoch: 2 });
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.equal(receipt.hold_reasons[0], "lease_fence_lost");
    assert.ok(receipt.hold_reasons.includes("lease_release_failed"));
    assert.equal(receipt.ledger_output.remote_contains_commit, true);
    assert.equal(receipt.cursor_update.created, true);
    assert.equal(receipt.cursor_update.push_success, false);
    assert.equal(receipt.cursor_update.remote_contains_commit, false);
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason: "post_ledger_cursor_stage_failure:before_cursor_push",
      cursor_unchanged: true,
    });
    assert.equal(showLedger(leaseBeforePush.ledgerRemote).length, 1);
    assert.equal(
      showJson(leaseBeforePush.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      leaseBeforePush.seed,
    );
  } finally {
    rmSync(leaseBeforePush.root, { recursive: true, force: true });
  }
});

test("post-push uncertainty never claims the cursor stayed unchanged", () => {
  for (const [name, pushStatus, expectedState] of [
    ["unknown push", "UNKNOWN_AFTER_PUSH", "UNKNOWN_AFTER_PUSH"],
    [
      "rejected push",
      "REJECTED_NON_FAST_FORWARD",
      "UNKNOWN_AFTER_PUSH_ATTEMPT",
    ],
  ]) {
    const f = fixture();
    try {
      const transportExecutors = useMockNetworkTransport(f, "ssh");
      const cursorId = f.input.cursor_writer.binding_id;
      const baseCursorExecutor = transportExecutors[cursorId];
      transportExecutors[cursorId] = (request) =>
        request.operation === "push_commit"
          ? { status: pushStatus, authority_binding_verified: true }
          : baseCursorExecutor(request);
      const receipt = runCursorRunner(f.input, { transportExecutors });
      assert.equal(receipt.status, "HOLD", name);
      assert.equal(receipt.cursor_update.state, expectedState, name);
      assert.deepEqual(receipt.reconciliation, {
        required: true,
        reason: "post_cursor_push_outcome_unverified",
        cursor_unchanged: null,
      }, name);
      assert.equal(
        receipt.cursor_update.state === "UNKNOWN_AFTER_PUSH"
          && receipt.reconciliation.cursor_unchanged === true,
        false,
        name,
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  const inclusionUnknown = fixture();
  try {
    const transportExecutors = useMockNetworkTransport(
      inclusionUnknown,
      "https",
    );
    const cursorId = inclusionUnknown.input.cursor_writer.binding_id;
    const baseCursorExecutor = transportExecutors[cursorId];
    transportExecutors[cursorId] = (request) => {
      if (request.operation === "verify_inclusion") {
        const included = baseCursorExecutor(request);
        return {
          status: "UNKNOWN_AFTER_PUSH",
          tip: included.tip,
          authority_binding_verified: true,
        };
      }
      return baseCursorExecutor(request);
    };
    const receipt = runCursorRunner(
      inclusionUnknown.input,
      { transportExecutors },
    );
    assert.equal(receipt.status, "HOLD");
    assert.equal(receipt.cursor_update.state, "UNKNOWN_AFTER_PUSH");
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason: "post_cursor_push_inclusion_unverified",
      cursor_unchanged: null,
    });
  } finally {
    rmSync(inclusionUnknown.root, { recursive: true, force: true });
  }

  const contentMismatch = fixture();
  try {
    const transportExecutors = useMockNetworkTransport(
      contentMismatch,
      "https",
    );
    const cursorId = contentMismatch.input.cursor_writer.binding_id;
    const baseCursorExecutor = transportExecutors[cursorId];
    let corrupted = false;
    transportExecutors[cursorId] = (request) => {
      if (request.operation === "verify_inclusion" && !corrupted) {
        corrupted = true;
        corruptAdvancedCursorRemote(contentMismatch);
      }
      return baseCursorExecutor(request);
    };
    const receipt = runCursorRunner(
      contentMismatch.input,
      { transportExecutors },
    );
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes(
      "cursor_remote_content_verification_failed",
    ));
    assert.equal(receipt.cursor_update.state, "UNKNOWN_AFTER_PUSH");
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason: "post_cursor_push_content_unverified",
      cursor_unchanged: null,
    });
  } finally {
    rmSync(contentMismatch.root, { recursive: true, force: true });
  }

  const outerCatch = fixture();
  try {
    const marker = "synthetic-post-push-raw-marker";
    const transportExecutors = useMockNetworkTransport(outerCatch, "ssh");
    const cursorId = outerCatch.input.cursor_writer.binding_id;
    const baseCursorExecutor = transportExecutors[cursorId];
    transportExecutors[cursorId] = (request) => {
      if (request.operation === "verify_inclusion") {
        throw new Error(marker);
      }
      return baseCursorExecutor(request);
    };
    const receipt = runCursorRunner(outerCatch.input, { transportExecutors });
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("transport_executor_failed"));
    assert.equal(JSON.stringify(receipt).includes(marker), false);
    assert.equal(receipt.cursor_update.state, "UNKNOWN_AFTER_PUSH");
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason: "post_cursor_push_stage_unverified",
      cursor_unchanged: null,
    });
  } finally {
    rmSync(outerCatch.root, { recursive: true, force: true });
  }
});

test("v4 one-shot lease binds TTL, epoch bases, host, token, and stale authority", () => {
  for (const [name, mutate, expectedReason] of [
    ["short TTL", (f) => {
      f.input.lease.expires_at = new Date(
        new Date(f.input.lease.acquired_at).valueOf() + 29 * 60_000,
      ).toISOString();
    }, "one_shot_lease_basis_mismatch"],
    ["long TTL", (f) => {
      f.input.lease.expires_at = new Date(
        new Date(f.input.lease.acquired_at).valueOf() + 31 * 60_000,
      ).toISOString();
    }, "one_shot_lease_basis_mismatch"],
    ["jumped epoch", (f) => {
      f.input.lease.writer_epoch = 2;
    }, "one_shot_lease_basis_mismatch"],
    ["host mismatch", (f) => {
      f.input.lease.host_identity = "different-synthetic-host";
    }, "one_shot_lease_basis_mismatch"],
    ["token mismatch", (f) => {
      f.input.lease.owner_token = "a".repeat(63);
    }, "one_shot_lease_basis_mismatch"],
    ["stale recovery authority", (f) => {
      f.input.lease.owner_allows_stale_recovery = true;
    }, "one_shot_lease_basis_mismatch"],
  ]) {
    const f = fixture();
    try {
      mutate(f);
      const receipt = runCursorRunner(f.input);
      assert.equal(receipt.status, "HOLD", name);
      assert.deepEqual(receipt.hold_reasons, [expectedReason], name);
      assert.equal(receipt.lease.acquired, false, name);
      assert.equal(existsSync(f.lockPath), false, name);
      assert.equal(showLedger(f.ledgerRemote).length, 0, name);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  const skippedBasis = fixture();
  try {
    setLeasePolicyBasis(skippedBasis, {
      restored_writer_epoch: 0,
      authority_writer_epoch: 2,
      receipt_writer_epoch: 5,
      initial_writer_epoch: 6,
    });
    skippedBasis.input.lease.writer_epoch = 5;
    const receipt = runCursorRunner(skippedBasis.input);
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(
      receipt.hold_reasons,
      ["one_shot_lease_basis_mismatch"],
    );
    assert.equal(receipt.lease.acquired, false);
    assert.equal(showLedger(skippedBasis.ledgerRemote).length, 0);
  } finally {
    rmSync(skippedBasis.root, { recursive: true, force: true });
  }

  const restoredMismatch = fixture();
  try {
    setLeasePolicyBasis(restoredMismatch, {
      restored_writer_epoch: 1,
      authority_writer_epoch: 0,
      receipt_writer_epoch: 0,
      initial_writer_epoch: 2,
    });
    restoredMismatch.input.lease.writer_epoch = 2;
    const receipt = runCursorRunner(restoredMismatch.input);
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes(
      "cursor_restored_writer_epoch_mismatch",
    ));
    assert.equal(receipt.lease.acquired, true);
    assert.equal(showLedger(restoredMismatch.ledgerRemote).length, 0);
    assert.equal(
      showJson(restoredMismatch.cursorRemote, WRITER_REF, CURSOR_PATH)
        .writer_epoch,
      0,
    );
  } finally {
    rmSync(restoredMismatch.root, { recursive: true, force: true });
  }

  const maxPlusOne = fixture();
  try {
    setLeasePolicyBasis(maxPlusOne, {
      restored_writer_epoch: 0,
      authority_writer_epoch: 2,
      receipt_writer_epoch: 5,
      initial_writer_epoch: 6,
    });
    maxPlusOne.input.lease.writer_epoch = 6;
    const receipt = runCursorRunner(maxPlusOne.input);
    assert.equal(receipt.status, "SUCCESS", JSON.stringify(receipt));
    assert.equal(receipt.lease.writer_epoch, 6);
    assert.equal(receipt.cursor_update.writer_epoch_after, 6);
    assert.deepEqual(receipt.runtime_preflight.lease_policy, {
      authority_profile: "owner_with_state",
      operational_primary: true,
      owner_token_class: "opaque_random_256_v1",
      first_lease_stale: false,
      host_identity_digest:
        maxPlusOne.input.runtime_preflight.input.evidence.lease_policy
          .host_identity_digest,
      restored_writer_epoch: 0,
      authority_writer_epoch: 2,
      receipt_writer_epoch: 5,
      initial_writer_epoch: 6,
      ttl_minutes: 30,
      ttl_formula: LEASE_TTL_FORMULA,
      epoch_formula: WRITER_EPOCH_FORMULA,
    });
  } finally {
    rmSync(maxPlusOne.root, { recursive: true, force: true });
  }
});

test("first run appends records, advances the cursor, itemizes self-loops, and preserves active bytes", () => {
  const f = fixture({ sourceSubjects: ["ordinary result"], selfLoop: true });
  try {
    const before = worktreeSentinel(f);
    const receipt = runCursorRunner(f.input);

    assert.equal(receipt.status, "SUCCESS", JSON.stringify(receipt));
    assertNonAcceptance(receipt);
    assert.equal(receipt.worker_identity, "codex_gpt-5.6-sol");
    assert.deepEqual(receipt.publication_order, [
      "ledger_push_attempt",
      "ledger_remote_inclusion_verified",
      "cursor_commit_created",
      "cursor_push_attempt",
      "cursor_remote_inclusion_verified",
    ]);
    assert.equal(receipt.lease.state, "RELEASED");
    assert.equal(receipt.lease.writer_epoch, 1);
    assert.equal(receipt.lease.acquired, true);
    assert.equal(receipt.lease.released, true);
    assert.deepEqual(receipt.records, {
      missing: 1,
      appended: 1,
      duplicate: 0,
      full_record_digests: receipt.records.full_record_digests,
    });
    assert.equal(receipt.records.full_record_digests.length, 1);
    assert.deepEqual(receipt.self_loop_exclusions, [{
      commit: f.sourceCommits[1],
      reason: "exact_automation_and_source_lane_trailers",
    }]);
    assert.equal(receipt.ledger_output.created, true);
    assert.equal(receipt.ledger_output.push_success, true);
    assert.equal(receipt.ledger_output.remote_contains_commit, true);
    assert.equal(receipt.cursor_update.cas_success, true);
    assert.equal(receipt.cursor_update.push_success, true);
    assert.equal(receipt.cursor_update.remote_contains_commit, true);
    assert.equal(receipt.cursor_update.after, f.target);
    assert.equal(receipt.cursor_update.state, "VERIFIED_ADVANCED");
    assert.equal(receipt.cursor_update.sequence_before, 0);
    assert.equal(receipt.cursor_update.sequence_after, 1);
    assert.equal(receipt.cursor_update.writer_epoch_before, 0);
    assert.equal(receipt.cursor_update.writer_epoch_after, 1);
    assert.deepEqual(receipt.reconciliation, {
      required: false,
      reason: null,
      cursor_unchanged: false,
    });
    assert.equal(showLedger(f.ledgerRemote).length, 1);
    assert.equal(showLedger(f.ledgerRemote)[0].worker, "codex_gpt-5.6-sol");
    assert.equal(
      showJson(f.cursorRemote, WRITER_REF, CURSOR_PATH).last_successful_source_commit,
      f.target,
    );
    assert.equal(receipt.safety.ledger_writer_worktree_mutations, 0);
    assert.equal(receipt.safety.cursor_writer_worktree_mutations, 0);
    assert.equal(receipt.safety.force_pushes, 0);
    assertWorktreeSentinel(f, before);
    assertNoInjectedPath(receipt, f);

    const replay = runCursorRunner(f.input);
    assert.equal(replay.status, "ALREADY_ADVANCED");
    // ALREADY_ADVANCED means this invocation made no cursor mutation.
    assert.deepEqual(replay.reconciliation, {
      required: false,
      reason: null,
      cursor_unchanged: true,
    });
    assert.equal(replay.records.missing, 0);
    assert.equal(replay.records.duplicate, 1);
    assert.equal(showLedger(f.ledgerRemote).length, 1);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("output failure resumes by exact duplicate while an identity conflict HOLDs", () => {
  const resumeFixture = fixture();
  try {
    const failed = runCursorRunner(resumeFixture.input, { faultAt: "after_output_push" });
    assert.equal(failed.status, "HOLD");
    assert.deepEqual(failed.hold_reasons, ["injected_fault:after_output_push"]);
    assert.equal(failed.ledger_output.remote_contains_commit, true);
    assert.equal(
      showJson(resumeFixture.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      resumeFixture.seed,
    );

    const resumed = runCursorRunner(resumeFixture.input);
    assert.equal(resumed.status, "SUCCESS");
    assert.equal(resumed.records.missing, 0);
    assert.equal(resumed.records.duplicate, 1);
    assert.equal(resumed.records.appended, 0);
    assert.equal(showLedger(resumeFixture.ledgerRemote).length, 1);
  } finally {
    rmSync(resumeFixture.root, { recursive: true, force: true });
  }

  const conflictFixture = fixture();
  try {
    const failed = runCursorRunner(conflictFixture.input, { faultAt: "after_output_push" });
    assert.equal(failed.status, "HOLD");
    appendConflictingRecord(conflictFixture);

    const conflict = runCursorRunner(conflictFixture.input);
    assert.equal(conflict.status, "HOLD");
    assert.ok(conflict.hold_reasons.includes("ledger_identity_digest_conflict"));
    assert.equal(
      showJson(conflictFixture.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      conflictFixture.seed,
    );
  } finally {
    rmSync(conflictFixture.root, { recursive: true, force: true });
  }
});

test("fast-forward source succeeds and a non-fast-forward source rewrite HOLDs", () => {
  const fastForward = fixture({ sourceSubjects: ["ff one", "ff two"] });
  try {
    const receipt = runCursorRunner(fastForward.input);
    assert.equal(receipt.status, "SUCCESS");
    assert.equal(receipt.records.appended, 2);
  } finally {
    rmSync(fastForward.root, { recursive: true, force: true });
  }

  const rewritten = fixture();
  try {
    git(rewritten.sourceWork, ["checkout", "--orphan", "rewritten"]);
    rmSync(join(rewritten.sourceWork, "work.txt"), { force: true });
    const rewrittenTarget = sourceCommit(
      rewritten.sourceWork,
      "rewritten",
      "rewritten source result",
      "2026-07-29T01:00:00Z",
    );
    git(rewritten.sourceWork, [
      "push",
      "--force",
      rewritten.sourceSnapshot,
      `HEAD:${SOURCE_REF}`,
    ]);
    const input = {
      ...rewritten.input,
      source: { ...rewritten.input.source, target: rewrittenTarget },
    };
    const receipt = runCursorRunner(input);
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("source_seed_not_ancestor"));
    assert.equal(showLedger(rewritten.ledgerRemote).length, 0);
    assert.equal(
      showJson(rewritten.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      rewritten.seed,
    );
  } finally {
    rmSync(rewritten.root, { recursive: true, force: true });
  }
});

test("writer remote fast-forward succeeds and a concurrent non-FF race HOLDs", () => {
  const fastForward = fixture();
  try {
    const receipt = runCursorRunner(fastForward.input);
    assert.equal(receipt.status, "SUCCESS");
    assert.equal(receipt.ledger_output.push_success, true);
  } finally {
    rmSync(fastForward.root, { recursive: true, force: true });
  }

  const raced = fixture();
  try {
    const receipt = runCursorRunner(raced.input, {
      beforeLedgerPush: () => advanceLedgerRemote(raced),
    });
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes(
      "ledger_output_non_fast_forward_push_failed",
    ));
    assert.equal(receipt.ledger_output.push_success, false);
    assert.equal(receipt.cursor_update.state, "VERIFIED_NOT_ADVANCED");
    assert.equal(
      showJson(raced.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      raced.seed,
    );
    assert.equal(showLedger(raced.ledgerRemote).length, 0);
  } finally {
    rmSync(raced.root, { recursive: true, force: true });
  }

  const cursorRaced = fixture();
  try {
    const receipt = runCursorRunner(cursorRaced.input, {
      beforeCursorPush: () => advanceCursorRemote(cursorRaced),
    });
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("cursor_non_fast_forward_race"));
    assert.equal(showLedger(cursorRaced.ledgerRemote).length, 1);
    assert.equal(
      showJson(cursorRaced.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      cursorRaced.seed,
    );
  } finally {
    rmSync(cursorRaced.root, { recursive: true, force: true });
  }
});

test("ledger inclusion failure holds before cursor advance; cursor inclusion uncertainty reconciles", () => {
  const ledgerFailure = fixture();
  try {
    const receipt = runCursorRunner(
      ledgerFailure.input,
      { faultAt: "ledger_inclusion_failure" },
    );
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("ledger_output_remote_inclusion_failed"));
    assert.equal(receipt.cursor_update.after, ledgerFailure.seed);
    assert.equal(
      showJson(ledgerFailure.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      ledgerFailure.seed,
    );
  } finally {
    rmSync(ledgerFailure.root, { recursive: true, force: true });
  }

  const cursorFailure = fixture();
  try {
    const receipt = runCursorRunner(
      cursorFailure.input,
      { faultAt: "cursor_inclusion_failure" },
    );
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("cursor_remote_inclusion_failed"));
    assert.equal(receipt.cursor_update.after, null);
    assert.equal(receipt.cursor_update.state, "UNKNOWN_AFTER_PUSH");
    assert.deepEqual(receipt.reconciliation, {
      required: true,
      reason: "post_cursor_push_inclusion_unverified",
      cursor_unchanged: null,
    });
    assert.equal(
      showJson(cursorFailure.cursorRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      cursorFailure.target,
    );
    const replay = runCursorRunner(cursorFailure.input);
    assert.equal(replay.status, "ALREADY_ADVANCED");
    assert.equal(replay.cursor_update.state, "VERIFIED_ADVANCED");
  } finally {
    rmSync(cursorFailure.root, { recursive: true, force: true });
  }
});

test("all durable crash windows resume without duplicate ledger rows", () => {
  for (const point of ["after_output_push", "after_cursor_commit"]) {
    const f = fixture();
    try {
      const interrupted = runCursorRunner(f.input, { faultAt: point });
      assert.equal(interrupted.status, "HOLD", point);
      assert.deepEqual(interrupted.hold_reasons, [`injected_fault:${point}`], point);
      assert.equal(
        showJson(f.cursorRemote, WRITER_REF, CURSOR_PATH).last_successful_source_commit,
        f.seed,
        point,
      );
      const resumed = runCursorRunner(f.input);
      assert.equal(resumed.status, "SUCCESS", point);
      assert.equal(resumed.records.duplicate, 1, point);
      assert.equal(showLedger(f.ledgerRemote).length, 1, point);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  const pushed = fixture();
  try {
    assert.throws(
      () => runCursorRunner(pushed.input, { faultAt: "after_cursor_push" }),
      (error) => error instanceof CursorRunnerInterruption
        && error.code === "injected_fault:after_cursor_push",
    );
    assert.equal(
      showJson(pushed.cursorRemote, WRITER_REF, CURSOR_PATH).last_successful_source_commit,
      pushed.target,
    );
    const resumed = runCursorRunner(pushed.input);
    assert.equal(resumed.status, "ALREADY_ADVANCED");
    assert.equal(resumed.records.duplicate, 1);
    assert.equal(showLedger(pushed.ledgerRemote).length, 1);
  } finally {
    rmSync(pushed.root, { recursive: true, force: true });
  }
});

test("v4 one-shot lease blocks live and stale owners and detects fence loss", () => {
  for (const [name, current, isPidAlive, reason] of [
    [
      "live owner always blocks",
      { expires_at: "2099-07-30T03:30:00Z" },
      true,
      "lease_live_owner",
    ],
    [
      "dead expired owner cannot bypass first-lease policy",
      {},
      false,
      "lease_stale_recovery_not_allowed",
    ],
  ]) {
    const f = fixture();
    try {
      writeLease(f, current);
      const receipt = runCursorRunner(f.input, { isPidAlive: () => isPidAlive });
      assert.equal(receipt.status, "HOLD", name);
      assert.ok(receipt.hold_reasons.includes(reason), name);
      assert.equal(showLedger(f.ledgerRemote).length, 0, name);
      assert.equal(
        showJson(f.cursorRemote, WRITER_REF, CURSOR_PATH).writer_epoch,
        0,
        name,
      );
      assertNonAcceptance(receipt);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  const lost = fixture();
  try {
    const receipt = runCursorRunner(lost.input, {
      beforeLedgerPush: () => writeLease(lost, { writer_epoch: 2 }),
    });
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("lease_fence_lost"));
    assert.equal(showLedger(lost.ledgerRemote).length, 0);
    assert.equal(
      showJson(lost.cursorRemote, WRITER_REF, CURSOR_PATH).writer_epoch,
      0,
    );
  } finally {
    rmSync(lost.root, { recursive: true, force: true });
  }
});

test("realpath containment rejects forbidden roots, mutual overlap, and reparse aliases", () => {
  const f = fixture();
  try {
    for (const kind of [
      "codex_worktree",
      "orca_worktree",
      "automation_control_root",
    ]) {
      const input = structuredClone(f.input);
      const forbidden = input.isolation.forbidden_roots.find((row) => row.kind === kind);
      input.source.snapshot_path = forbidden.path;
      input.source_allowlist[0].snapshot_path = forbidden.path;
      const receipt = runCursorRunner(input);
      assert.equal(receipt.status, "HOLD", kind);
      assert.ok(receipt.hold_reasons.includes("forbidden_root_overlap"), kind);
      assertNoInjectedPath(receipt, f);
    }

    const overlapped = structuredClone(f.input);
    overlapped.cursor_writer.clone_path = f.ledgerClone;
    overlapped.cursor_writer.remote = LEDGER_REMOTE_NAME;
    overlapped.cursor_writer.authority_fingerprint =
      localFileAuthorityFingerprint(f.ledgerRemote);
    overlapped.cursor_writer_allowlist[0].clone_path = f.ledgerClone;
    overlapped.cursor_writer_allowlist[0].remote = LEDGER_REMOTE_NAME;
    overlapped.cursor_writer_allowlist[0].authority_fingerprint =
      localFileAuthorityFingerprint(f.ledgerRemote);
    const overlapReceipt = runCursorRunner(overlapped);
    assert.equal(overlapReceipt.status, "HOLD");
    assert.ok(overlapReceipt.hold_reasons.includes("isolation_roots_overlap"));

    const linkPath = join(f.root, "source-reparse");
    let linkCreated = false;
    try {
      symlinkSync(f.sourceSnapshot, linkPath, "junction");
      linkCreated = true;
    } catch {
      // Windows hosts without junction privilege still exercise realpath guards above.
    }
    if (linkCreated) {
      const reparse = structuredClone(f.input);
      reparse.source.snapshot_path = linkPath;
      reparse.source_allowlist[0].snapshot_path = linkPath;
      const reparseReceipt = runCursorRunner(reparse);
      assert.equal(reparseReceipt.status, "HOLD");
      assert.ok(reparseReceipt.hold_reasons.includes(
        "source_snapshot_realpath_invalid",
      ));
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("both bare remote roots are forbidden-root guarded and cannot be shared before mutation", () => {
  const f = fixture();
  try {
    const before = {
      ledgerTip: git(f.ledgerRemote, ["rev-parse", WRITER_REF]),
      cursorTip: git(f.cursorRemote, ["rev-parse", WRITER_REF]),
      ledger: showLedger(f.ledgerRemote),
      cursor: showJson(f.cursorRemote, WRITER_REF, CURSOR_PATH),
    };
    for (const [name, remotePath] of [
      ["ledger remote", f.ledgerRemote],
      ["cursor remote", f.cursorRemote],
    ]) {
      const input = structuredClone(f.input);
      input.isolation.forbidden_roots.find(
        (row) => row.kind === "active_workmeta",
      ).path = remotePath;
      const receipt = runCursorRunner(input);
      assert.equal(receipt.status, "HOLD", name);
      assert.ok(receipt.hold_reasons.includes("forbidden_root_overlap"), name);
      assert.equal(receipt.lease.acquired, false, name);
      assert.equal(existsSync(f.lockPath), false, name);
      assertNoInjectedPath(receipt, f);
    }

    git(f.cursorClone, [
      "remote",
      "set-url",
      CURSOR_REMOTE_NAME,
      f.ledgerRemote,
    ]);
    const shared = structuredClone(f.input);
    shared.cursor_writer.authority_fingerprint =
      localFileAuthorityFingerprint(f.ledgerRemote);
    shared.cursor_writer_allowlist[0].authority_fingerprint =
      localFileAuthorityFingerprint(f.ledgerRemote);
    const sharedReceipt = runCursorRunner(shared);
    assert.equal(sharedReceipt.status, "HOLD");
    assert.ok(sharedReceipt.hold_reasons.includes("isolation_roots_overlap"));
    assert.equal(sharedReceipt.lease.acquired, false);
    assert.equal(existsSync(f.lockPath), false);

    assert.equal(git(f.ledgerRemote, ["rev-parse", WRITER_REF]), before.ledgerTip);
    assert.equal(git(f.cursorRemote, ["rev-parse", WRITER_REF]), before.cursorTip);
    assert.deepEqual(showLedger(f.ledgerRemote), before.ledger);
    assert.deepEqual(showJson(f.cursorRemote, WRITER_REF, CURSOR_PATH), before.cursor);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("v4 first one-shot never enters the stale takeover mutation path", () => {
  const f = fixture();
  try {
    writeLease(f);
    const before = readFileSync(f.lockPath, "utf8");
    let staleDeleteHookCalled = false;
    const receipt = runCursorRunner(f.input, {
      isPidAlive: () => false,
      beforeStaleLeaseDelete: () => {
        staleDeleteHookCalled = true;
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(
      receipt.hold_reasons,
      ["lease_stale_recovery_not_allowed"],
    );
    assert.equal(receipt.lease.acquired, false);
    assert.equal(staleDeleteHookCalled, false);
    assert.equal(readFileSync(f.lockPath, "utf8"), before);
    assert.equal(existsSync(`${f.lockPath}.stale-takeover`), false);
    assert.equal(showLedger(f.ledgerRemote).length, 0);
    assert.equal(
      showJson(f.cursorRemote, WRITER_REF, CURSOR_PATH).writer_epoch,
      0,
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("recursive input rejection covers forbidden keys, private refs and URLs without leaks", () => {
  const f = fixture();
  try {
    const cases = [
      ...[
        "raw",
        "chat",
        "payload",
        "body",
        "messages",
        "transcript",
        "credential",
        "token",
        "password",
        "cookie",
        "session",
      ].map((key) => [`forbidden ${key}`, (input) => {
        input.runtime[key] = `synthetic-${key}-marker`;
      }, `synthetic-${key}-marker`]),
      ["unknown nested key", (input) => {
        input.lease.unexpected = "synthetic-unknown-marker";
      }, "synthetic-unknown-marker"],
      ["private URL", (input) => {
        input.ledger_writer.remote_url =
          "https://private.invalid/synthetic-private-url-marker";
      }, "synthetic-private-url-marker"],
      ["private ref", (input) => {
        input.cursor_writer.ref = "refs/private/synthetic-private-ref-marker";
      }, "synthetic-private-ref-marker"],
      ["secret-shaped value", (input) => {
        input.runtime.model = "access_token=synthetic-secret-marker";
      }, "synthetic-secret-marker"],
      ["workmeta cursor owner", (input) => {
        input.cursor.logical_path = "_workmeta/system/bindings/synthetic-marker.json";
        input.cursor_writer_allowlist[0].cursor_logical_path =
          input.cursor.logical_path;
      }, "synthetic-marker"],
    ];
    for (const [name, mutate, marker] of cases) {
      const input = structuredClone(f.input);
      mutate(input);
      const receipt = runCursorRunner(input);
      const serialized = JSON.stringify(receipt);
      assert.equal(receipt.status, "HOLD", name);
      assert.equal(serialized.includes(marker), false, name);
      assertNoInjectedPath(receipt, f, [marker]);
      assertNonAcceptance(receipt);
      assert.equal(showLedger(f.ledgerRemote).length, 0, name);
    }

    const authorityMismatch = structuredClone(f.input);
    authorityMismatch.ledger_writer.authority_fingerprint =
      `sha256:${"e".repeat(64)}`;
    authorityMismatch.ledger_writer_allowlist[0].authority_fingerprint =
      authorityMismatch.ledger_writer.authority_fingerprint;
    const authorityReceipt = runCursorRunner(authorityMismatch);
    assert.equal(authorityReceipt.status, "HOLD");
    assert.deepEqual(
      authorityReceipt.hold_reasons,
      ["writer_authority_fingerprint_mismatch"],
    );
    assert.equal(authorityReceipt.lease.acquired, false);

    const runtimeEvidenceMissing = structuredClone(f.input);
    runtimeEvidenceMissing.runtime_preflight.input.evidence.acl.status = "UNKNOWN";
    const runtimeReceipt = runCursorRunner(runtimeEvidenceMissing);
    assert.equal(runtimeReceipt.status, "HOLD");
    assert.ok(runtimeReceipt.hold_reasons[0].startsWith(
      "runtime_preflight_recheck:",
    ));
    assert.equal(runtimeReceipt.lease.acquired, false);
    assert.equal(showLedger(f.ledgerRemote).length, 0);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("missing and mismatched injected worker identity HOLD in API and CLI", () => {
  for (const [reason, runtime] of [
    ["runtime_contract_invalid", undefined],
    ["runtime_worker_assertion_mismatch", {
      ...RUNTIME,
      asserted_worker: "codex_different-model",
    }],
  ]) {
    const f = fixture();
    try {
      const input = { ...f.input };
      if (runtime) input.runtime = runtime;
      else delete input.runtime;

      const receipt = runCursorRunner(input);
      assert.equal(receipt.status, "HOLD");
      assert.ok(
        receipt.hold_reasons.includes(reason),
        `${reason}: ${JSON.stringify(receipt.hold_reasons)}`,
      );
      assert.equal(showLedger(f.ledgerRemote).length, 0);

      const cli = runCli(f, input);
      assert.equal(cli.status, 2, cli.stdout || cli.stderr);
      const cliReceipt = JSON.parse(cli.stdout);
      assert.equal(cliReceipt.status, "HOLD");
      assert.ok(cliReceipt.hold_reasons.includes(reason));
      assertNoInjectedPath(cliReceipt, f);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("secret and path sentinels HOLD without leaking injected values", () => {
  for (const sentinel of [
    "access_token=synthetic-secret-value",
    "file:///synthetic-private/owner/result.txt",
  ]) {
    const f = fixture({ sourceSubjects: [sentinel] });
    try {
      const receipt = runCursorRunner(f.input);
      const serialized = JSON.stringify(receipt);
      assert.equal(receipt.status, "HOLD");
      assert.ok(receipt.hold_reasons.some((reason) =>
        reason.startsWith("source_metadata_boundary_sentinel:")));
      assert.equal(serialized.includes(sentinel), false);
      assertNoInjectedPath(receipt, f, [sentinel]);
      assert.equal(showLedger(f.ledgerRemote).length, 0);
      assert.equal(
        showJson(f.cursorRemote, WRITER_REF, CURSOR_PATH)
          .last_successful_source_commit,
        f.seed,
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  for (const [field, sentinel] of [
    ["invalid_source_repo", "access_token=synthetic-secret-value"],
    ["invalid_writer_binding", "C:/synthetic-private/owner"],
    ["allowlisted_source_repo", "ghp_abcdefgh"],
    ["runtime_tool", "xoxb-abcdefgh"],
    ["author_email", "ghp_abcdefgh@example.invalid"],
  ]) {
    const f = fixture();
    try {
      const input = structuredClone(f.input);
      if (field === "invalid_source_repo") {
        input.source.repo = sentinel;
      } else if (field === "invalid_writer_binding") {
        input.ledger_writer.binding_id = sentinel;
      } else if (field === "allowlisted_source_repo") {
        input.source.repo = sentinel;
        input.source_allowlist[0].repo = sentinel;
        input.cursor.repo = sentinel;
      } else if (field === "runtime_tool") {
        input.runtime.tool = sentinel;
      } else {
        input.ledger_writer.commit_author.email = sentinel;
      }

      const receipt = runCursorRunner(input);
      assert.equal(receipt.status, "HOLD");
      assert.equal(JSON.stringify(receipt).includes(sentinel), false);

      const cli = runCli(f, input);
      assert.equal(cli.status, 2, cli.stdout || cli.stderr);
      assert.equal(cli.stdout.includes(sentinel), false);
      assert.equal(showLedger(f.ledgerRemote).length, 0);
      assert.equal(
        showJson(f.cursorRemote, WRITER_REF, CURSOR_PATH)
          .last_successful_source_commit,
        f.seed,
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});
