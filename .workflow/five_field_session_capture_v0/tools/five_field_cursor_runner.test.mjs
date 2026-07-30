import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
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
  runCursorRunner,
} from "./five_field_cursor_runner.mjs";
import {
  AUTOMATION_SELF_LOOP_TRAILER,
  sourceLaneTrailer,
} from "./five_field_cursor_sweep.mjs";

const RUNNER_TOOL = fileURLToPath(new URL("./five_field_cursor_runner.mjs", import.meta.url));
const SWEEP_TOOL = fileURLToPath(new URL("./five_field_cursor_sweep.mjs", import.meta.url));
const SOURCE_REF = "refs/heads/main";
const WRITER_REF = "refs/heads/main";
const LEDGER_PATH = "ledger/five_field_log.jsonl";
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

function initializeWriter(remote, clone, seedFile, content) {
  execFileSync("git", ["init", "--bare", "-b", "main", remote], {
    encoding: "utf8",
    windowsHide: true,
  });
  execFileSync("git", ["clone", remote, clone], {
    encoding: "utf8",
    windowsHide: true,
  });
  configureIdentity(clone);
  const file = join(clone, ...seedFile.split("/"));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
  git(clone, ["add", seedFile]);
  git(clone, ["commit", "-m", `synthetic ${seedFile} seed`]);
  git(clone, ["push", "origin", `HEAD:${WRITER_REF}`]);
}

function fixture({ sourceSubjects = ["first public result"], selfLoop = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "five-field-runner-"));
  const sourceWork = join(root, "source-work");
  const sourceSnapshot = join(root, "source-snapshot.git");
  const ledgerRemote = join(root, "ledger-remote.git");
  const ledgerClone = join(root, "ledger-clone");
  const cursorRemote = join(root, "cursor-remote.git");
  const cursorClone = join(root, "cursor-clone");
  const runtimeRoot = join(root, "runtime-root");
  const lockParent = join(root, "lock-parent");
  const lockPath = join(lockParent, "runner.lease.json");
  mkdirSync(runtimeRoot);
  mkdirSync(lockParent);
  const forbiddenRoots = [
    "active_public_repo",
    "active_workmeta",
    "codex_worktree",
    "orca_worktree",
    "installed_automation_control",
  ].map((kind) => {
    const path = join(root, `forbidden-${kind}`);
    mkdirSync(path);
    return { kind, path };
  });

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
  initializeWriter(ledgerRemote, ledgerClone, ".synthetic-seed", "ledger seed\n");
  initializeWriter(
    cursorRemote,
    cursorClone,
    CURSOR_PATH,
    `${JSON.stringify(remoteCursor, null, 2)}\n`,
  );

  const commitAuthor = {
    name: "Synthetic Recovery Worker",
    email: "synthetic-recovery@example.invalid",
  };
  const input = {
    schema_version: RUNNER_INPUT_SCHEMA,
    execution_mode: "isolated",
    recorded_at: "2026-07-30T03:00:00Z",
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
      remote: "origin",
      remote_url: ledgerRemote,
      ref: WRITER_REF,
      ledger_logical_path: LEDGER_PATH,
      commit_author: { ...commitAuthor },
      output_commit_message: "synthetic recovery ledger output",
    },
    cursor_writer: {
      classification: "synthetic",
      binding_id: "synthetic-cursor-writer",
      clone_path: cursorClone,
      remote: "origin",
      remote_url: cursorRemote,
      ref: WRITER_REF,
      commit_author: { ...commitAuthor },
      cursor_commit_message: "synthetic recovery cursor advance",
    },
    lease: {
      owner_token: "synthetic-fence-owner",
      pid: 424242,
      host_identity: "synthetic-host",
      acquired_at: "2026-07-30T02:59:00Z",
      expires_at: "2099-07-30T03:30:00Z",
      writer_epoch: 1,
      lock_path: lockPath,
      stale_recovery_policy: "same_host_dead_pid_expired_owner_approved",
      owner_allows_stale_recovery: false,
    },
    isolation: {
      runtime_root: runtimeRoot,
      forbidden_roots: forbiddenRoots,
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
      remote: "origin",
      remote_url: ledgerRemote,
      ref: WRITER_REF,
      ledger_logical_path: LEDGER_PATH,
    }],
    cursor_writer_allowlist: [{
      classification: "synthetic",
      binding_id: "synthetic-cursor-writer",
      clone_path: cursorClone,
      remote: "origin",
      remote_url: cursorRemote,
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
    lockParent,
    lockPath,
    forbiddenRoots,
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

test("exclusive lease and monotonic epoch fence live, stale, expired, and recovered owners", () => {
  for (const [name, current, inputDelta, isPidAlive, reason] of [
    [
      "live owner always blocks",
      { expires_at: "2099-07-30T03:30:00Z" },
      {},
      true,
      "lease_live_owner",
    ],
    [
      "dead expired owner needs explicit policy",
      {},
      { writer_epoch: 2, owner_allows_stale_recovery: false },
      false,
      "lease_stale_recovery_not_allowed",
    ],
    [
      "non-monotonic stale epoch blocks",
      { writer_epoch: 2 },
      { writer_epoch: 2, owner_allows_stale_recovery: true },
      false,
      "writer_epoch_stale",
    ],
  ]) {
    const f = fixture();
    try {
      writeLease(f, current);
      Object.assign(f.input.lease, inputDelta);
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

  const recovered = fixture();
  try {
    writeLease(recovered);
    Object.assign(recovered.input.lease, {
      writer_epoch: 2,
      owner_allows_stale_recovery: true,
    });
    const receipt = runCursorRunner(recovered.input, {
      isPidAlive: () => false,
    });
    assert.equal(receipt.status, "SUCCESS", JSON.stringify(receipt));
    assert.equal(receipt.lease.stale_recovered, true);
    assert.equal(receipt.lease.state, "RELEASED");
    assert.equal(receipt.cursor_update.writer_epoch_after, 2);
    assert.equal(existsSync(recovered.lockPath), false);
  } finally {
    rmSync(recovered.root, { recursive: true, force: true });
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
    for (const kind of ["codex_worktree", "orca_worktree", "installed_automation_control"]) {
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
    overlapped.cursor_writer.remote_url = f.ledgerRemote;
    overlapped.cursor_writer_allowlist[0].clone_path = f.ledgerClone;
    overlapped.cursor_writer_allowlist[0].remote_url = f.ledgerRemote;
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

    git(f.cursorClone, ["remote", "set-url", "origin", f.ledgerRemote]);
    const shared = structuredClone(f.input);
    shared.cursor_writer.remote_url = f.ledgerRemote;
    shared.cursor_writer_allowlist[0].remote_url = f.ledgerRemote;
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

test("interleaved stale takeover preserves a newly live lease and permits one recoverer", () => {
  const winner = fixture();
  try {
    writeLease(winner);
    Object.assign(winner.input.lease, {
      owner_token: "winning-recoverer",
      writer_epoch: 2,
      owner_allows_stale_recovery: true,
    });
    const contenderInput = structuredClone(winner.input);
    Object.assign(contenderInput.lease, {
      owner_token: "contending-recoverer",
      pid: 626262,
      writer_epoch: 3,
    });
    let contenderReceipt;
    const winnerReceipt = runCursorRunner(winner.input, {
      isPidAlive: () => false,
      beforeStaleLeaseDelete: () => {
        contenderReceipt = runCursorRunner(contenderInput, {
          isPidAlive: () => false,
        });
      },
    });
    assert.equal(winnerReceipt.status, "SUCCESS", JSON.stringify(winnerReceipt));
    assert.equal(winnerReceipt.lease.acquired, true);
    assert.equal(winnerReceipt.lease.stale_recovered, true);
    assert.equal(contenderReceipt.status, "HOLD");
    assert.ok(contenderReceipt.hold_reasons.some((reason) =>
      ["lease_takeover_in_progress", "lease_stale_takeover_contended"]
        .includes(reason)));
    assert.equal(contenderReceipt.lease.acquired, false);
    assert.equal(showLedger(winner.ledgerRemote).length, 1);
    assert.equal(
      showJson(winner.cursorRemote, WRITER_REF, CURSOR_PATH).writer_epoch,
      2,
    );
  } finally {
    rmSync(winner.root, { recursive: true, force: true });
  }

  const replaced = fixture();
  try {
    writeLease(replaced);
    Object.assign(replaced.input.lease, {
      owner_token: "losing-recoverer",
      writer_epoch: 2,
      owner_allows_stale_recovery: true,
    });
    const newLive = {
      owner_token: "new-live-recoverer",
      pid: 636363,
      host_identity: "synthetic-host",
      acquired_at: "2026-07-30T03:00:00Z",
      expires_at: "2099-07-30T03:30:00Z",
      writer_epoch: 3,
    };
    const receipt = runCursorRunner(replaced.input, {
      isPidAlive: () => false,
      beforeStaleLeaseDelete: () => {
        rmSync(replaced.lockPath, { force: true });
        writeFileSync(
          replaced.lockPath,
          `${JSON.stringify(newLive, null, 2)}\n`,
          "utf8",
        );
      },
    });
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("lease_stale_record_changed"));
    assert.equal(receipt.lease.acquired, false);
    assert.deepEqual(JSON.parse(readFileSync(replaced.lockPath, "utf8")), newLive);
    assert.equal(existsSync(`${replaced.lockPath}.stale-takeover`), false);
    assert.equal(showLedger(replaced.ledgerRemote).length, 0);
    assert.equal(
      showJson(replaced.cursorRemote, WRITER_REF, CURSOR_PATH).writer_epoch,
      0,
    );
  } finally {
    rmSync(replaced.root, { recursive: true, force: true });
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

      const cli = spawnSync(process.execPath, [RUNNER_TOOL], {
        input: JSON.stringify(input),
        encoding: "utf8",
        windowsHide: true,
      });
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

      const cli = spawnSync(process.execPath, [RUNNER_TOOL], {
        input: JSON.stringify(input),
        encoding: "utf8",
        windowsHide: true,
      });
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
