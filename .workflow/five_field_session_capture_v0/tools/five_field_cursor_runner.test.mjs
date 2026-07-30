import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CursorRunnerInterruption,
  RUNNER_INPUT_SCHEMA,
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
const CURSOR_PATH = "state/cursor.json";
const LEDGER_PATH = "ledger/five_field_log.jsonl";
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

function fixture({ sourceSubjects = ["first public result"], selfLoop = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "five-field-runner-"));
  const sourceWork = join(root, "source-work");
  const sourceSnapshot = join(root, "source-snapshot.git");
  const writerRemote = join(root, "writer-remote.git");
  const writerClone = join(root, "writer-clone");

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
    const source = {
      repo: "soulforge-public",
      ref: SOURCE_REF,
      source_lane: "public-main",
    };
    sourceCommits.push(sourceCommit(
      sourceWork,
      "self-loop",
      "synthetic automated output",
      `2026-07-${26 + sourceCommits.length}T01:00:00Z`,
      `${AUTOMATION_SELF_LOOP_TRAILER}\n${sourceLaneTrailer(source)}`,
    ));
  }
  const target = sourceCommits.at(-1);
  execFileSync("git", ["clone", "--bare", sourceWork, sourceSnapshot], {
    encoding: "utf8",
    windowsHide: true,
  });

  execFileSync("git", ["init", "--bare", "-b", "main", writerRemote], {
    encoding: "utf8",
    windowsHide: true,
  });
  execFileSync("git", ["clone", writerRemote, writerClone], {
    encoding: "utf8",
    windowsHide: true,
  });
  configureIdentity(writerClone);
  const remoteCursor = {
    repo: "soulforge-public",
    ref: SOURCE_REF,
    source_lane: "public-main",
    last_successful_source_commit: seed,
  };
  const cursorFile = join(writerClone, ...CURSOR_PATH.split("/"));
  mkdirSync(dirname(cursorFile), { recursive: true });
  writeFileSync(cursorFile, `${JSON.stringify(remoteCursor, null, 2)}\n`, "utf8");
  git(writerClone, ["add", CURSOR_PATH]);
  git(writerClone, ["commit", "-m", "synthetic cursor seed"]);
  git(writerClone, ["push", "origin", `HEAD:${WRITER_REF}`]);

  const input = {
    schema_version: RUNNER_INPUT_SCHEMA,
    execution_mode: "isolated",
    recorded_at: "2026-07-30T03:00:00Z",
    runtime: { ...RUNTIME },
    source: {
      classification: "public",
      repo: "soulforge-public",
      ref: SOURCE_REF,
      source_lane: "public-main",
      seed,
      target,
      snapshot_path: sourceSnapshot,
    },
    source_allowlist: [{
      classification: "public",
      repo: "soulforge-public",
      ref: SOURCE_REF,
      source_lane: "public-main",
      snapshot_path: sourceSnapshot,
    }],
    cursor: {
      ...remoteCursor,
      logical_path: CURSOR_PATH,
      expected_revision: cursorRevision(remoteCursor),
    },
    writer: {
      classification: "synthetic",
      binding_id: "synthetic-writer",
      clone_path: writerClone,
      remote: "origin",
      remote_url: writerRemote,
      ref: WRITER_REF,
      ledger_logical_path: LEDGER_PATH,
      commit_author: {
        name: "Synthetic Recovery Worker",
        email: "synthetic-recovery@example.invalid",
      },
      output_commit_message: "synthetic recovery ledger output",
      cursor_commit_message: "synthetic recovery cursor advance",
    },
    writer_allowlist: [{
      classification: "synthetic",
      binding_id: "synthetic-writer",
      clone_path: writerClone,
      remote: "origin",
      remote_url: writerRemote,
      ref: WRITER_REF,
      ledger_logical_path: LEDGER_PATH,
      cursor_logical_path: CURSOR_PATH,
      output_commit_message: "synthetic recovery ledger output",
      cursor_commit_message: "synthetic recovery cursor advance",
    }],
  };
  return {
    root,
    sourceWork,
    sourceSnapshot,
    writerRemote,
    writerClone,
    seed,
    target,
    sourceCommits,
    input,
  };
}

function worktreeSentinel(f) {
  return {
    cursor: readFileSync(join(f.writerClone, ...CURSOR_PATH.split("/"))),
    status: git(f.writerClone, ["status", "--porcelain=v1", "--untracked-files=all"]),
    liveRunner: readFileSync(RUNNER_TOOL),
    liveSweep: readFileSync(SWEEP_TOOL),
  };
}

function assertWorktreeSentinel(f, before) {
  assert.deepEqual(
    readFileSync(join(f.writerClone, ...CURSOR_PATH.split("/"))),
    before.cursor,
  );
  assert.equal(
    git(f.writerClone, ["status", "--porcelain=v1", "--untracked-files=all"]),
    before.status,
  );
  assert.deepEqual(readFileSync(RUNNER_TOOL), before.liveRunner);
  assert.deepEqual(readFileSync(SWEEP_TOOL), before.liveSweep);
}

function assertNoInjectedPath(receipt, f, extra = []) {
  const serialized = JSON.stringify(receipt);
  for (const sentinel of [
    f.root,
    f.sourceSnapshot,
    f.writerRemote,
    f.writerClone,
    ...extra,
  ]) {
    assert.equal(serialized.includes(sentinel), false, `receipt leaked ${sentinel}`);
  }
}

function appendConflictingRecord(f) {
  const conflictClone = join(f.root, "conflict-clone");
  execFileSync("git", ["clone", f.writerRemote, conflictClone], {
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

function advanceWriterRemote(f) {
  const raceClone = join(f.root, "writer-race-clone");
  execFileSync("git", ["clone", f.writerRemote, raceClone], {
    encoding: "utf8",
    windowsHide: true,
  });
  configureIdentity(raceClone);
  writeFileSync(join(raceClone, "synthetic-race.txt"), "remote advanced\n", "utf8");
  git(raceClone, ["add", "synthetic-race.txt"]);
  git(raceClone, ["commit", "-m", "synthetic concurrent writer advance"]);
  git(raceClone, ["push", "origin", `HEAD:${WRITER_REF}`]);
}

test("first run appends records, advances the cursor, itemizes self-loops, and preserves active bytes", () => {
  const f = fixture({ sourceSubjects: ["ordinary result"], selfLoop: true });
  try {
    const before = worktreeSentinel(f);
    const receipt = runCursorRunner(f.input);

    assert.equal(receipt.status, "SUCCESS");
    assert.equal(receipt.worker_identity, "codex_gpt-5.6-sol");
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
    assert.equal(showLedger(f.writerRemote).length, 1);
    assert.equal(showLedger(f.writerRemote)[0].worker, "codex_gpt-5.6-sol");
    assert.equal(
      showJson(f.writerRemote, WRITER_REF, CURSOR_PATH).last_successful_source_commit,
      f.target,
    );
    assert.equal(receipt.safety.writer_worktree_mutations, 0);
    assert.equal(receipt.safety.force_pushes, 0);
    assertWorktreeSentinel(f, before);
    assertNoInjectedPath(receipt, f);

    const replay = runCursorRunner(f.input);
    assert.equal(replay.status, "ALREADY_ADVANCED");
    assert.equal(replay.records.missing, 0);
    assert.equal(replay.records.duplicate, 1);
    assert.equal(showLedger(f.writerRemote).length, 1);
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
      showJson(resumeFixture.writerRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      resumeFixture.seed,
    );

    const resumed = runCursorRunner(resumeFixture.input);
    assert.equal(resumed.status, "SUCCESS");
    assert.equal(resumed.records.missing, 0);
    assert.equal(resumed.records.duplicate, 1);
    assert.equal(resumed.records.appended, 0);
    assert.equal(showLedger(resumeFixture.writerRemote).length, 1);
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
      showJson(conflictFixture.writerRemote, WRITER_REF, CURSOR_PATH)
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
    assert.equal(showLedger(rewritten.writerRemote).length, 0);
    assert.equal(
      showJson(rewritten.writerRemote, WRITER_REF, CURSOR_PATH)
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
      beforeLedgerPush: () => advanceWriterRemote(raced),
    });
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes(
      "ledger_output_non_fast_forward_push_failed",
    ));
    assert.equal(receipt.ledger_output.push_success, false);
    assert.equal(receipt.cursor_update.state, "VERIFIED_NOT_ADVANCED");
    assert.equal(
      showJson(raced.writerRemote, WRITER_REF, CURSOR_PATH)
        .last_successful_source_commit,
      raced.seed,
    );
    assert.equal(showLedger(raced.writerRemote).length, 0);
  } finally {
    rmSync(raced.root, { recursive: true, force: true });
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
      showJson(ledgerFailure.writerRemote, WRITER_REF, CURSOR_PATH)
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
      showJson(cursorFailure.writerRemote, WRITER_REF, CURSOR_PATH)
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
        showJson(f.writerRemote, WRITER_REF, CURSOR_PATH).last_successful_source_commit,
        f.seed,
        point,
      );
      const resumed = runCursorRunner(f.input);
      assert.equal(resumed.status, "SUCCESS", point);
      assert.equal(resumed.records.duplicate, 1, point);
      assert.equal(showLedger(f.writerRemote).length, 1, point);
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
      showJson(pushed.writerRemote, WRITER_REF, CURSOR_PATH).last_successful_source_commit,
      pushed.target,
    );
    const resumed = runCursorRunner(pushed.input);
    assert.equal(resumed.status, "ALREADY_ADVANCED");
    assert.equal(resumed.records.duplicate, 1);
    assert.equal(showLedger(pushed.writerRemote).length, 1);
  } finally {
    rmSync(pushed.root, { recursive: true, force: true });
  }
});

test("missing and mismatched injected worker identity HOLD in API and CLI", () => {
  for (const [reason, runtime] of [
    ["runtime_metadata_required", undefined],
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
      assert.ok(receipt.hold_reasons.includes(reason));
      assert.equal(showLedger(f.writerRemote).length, 0);

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
      assert.equal(showLedger(f.writerRemote).length, 0);
      assert.equal(
        showJson(f.writerRemote, WRITER_REF, CURSOR_PATH)
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
        input.writer.binding_id = sentinel;
      } else if (field === "allowlisted_source_repo") {
        input.source.repo = sentinel;
        input.source_allowlist[0].repo = sentinel;
        input.cursor.repo = sentinel;
      } else if (field === "runtime_tool") {
        input.runtime.tool = sentinel;
      } else {
        input.writer.commit_author.email = sentinel;
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
      assert.equal(showLedger(f.writerRemote).length, 0);
      assert.equal(
        showJson(f.writerRemote, WRITER_REF, CURSOR_PATH)
          .last_successful_source_commit,
        f.seed,
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});
