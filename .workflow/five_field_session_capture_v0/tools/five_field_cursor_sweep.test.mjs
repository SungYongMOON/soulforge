import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AUTOMATION_SELF_LOOP_TRAILER,
  INPUT_SCHEMA,
  canonicalRecordDigest,
  planCursorSweep,
  sourceLaneTrailer,
} from "./five_field_cursor_sweep.mjs";

const CAPTURE_TOOL = fileURLToPath(new URL("./five_field_capture.mjs", import.meta.url));
const CURSOR_TOOL = fileURLToPath(new URL("./five_field_cursor_sweep.mjs", import.meta.url));

function git(repo, args, options = {}) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  }).trim();
}

function commit(repo, name, subject, date, body = "") {
  writeFileSync(join(repo, "work.txt"), `${name}\n`, "utf8");
  git(repo, ["add", "work.txt"]);
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  };
  const message = body ? `${subject}\n\n${body}` : subject;
  git(repo, ["commit", "-m", message], { env });
  return git(repo, ["rev-parse", "HEAD"]);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "five-field-cursor-"));
  const repo = join(root, "public-source");
  mkdirSync(repo);
  execFileSync("git", ["init", "-b", "main", repo], { encoding: "utf8", windowsHide: true });
  git(repo, ["config", "user.email", "synthetic@example.invalid"]);
  git(repo, ["config", "user.name", "Synthetic Test"]);
  const baseline = commit(repo, "base", "baseline", "2026-07-26T01:00:00Z");
  return { root, repo, baseline };
}

function inputFor(repo, baseline, candidateTarget, extra = {}) {
  return {
    schema_version: INPUT_SCHEMA,
    feature_state: "OFF",
    recorded_at: "2026-07-30T03:00:00Z",
    runtime: {
      tool: "codex",
      model: "gpt-5.6-sol",
      installed_models: ["gpt-5.6-sol"],
      asserted_worker: "codex_gpt-5.6-sol",
    },
    source: {
      classification: "public",
      repo: "soulforge-public",
      repo_path: repo,
      ref: "refs/heads/main",
      source_lane: "public-main",
      baseline,
      candidate_target: candidateTarget,
    },
    cursor: {
      repo: "soulforge-public",
      ref: "refs/heads/main",
      source_lane: "public-main",
      last_successful_source_commit: baseline,
    },
    source_allowlist: [{
      classification: "public",
      repo: "soulforge-public",
      repo_path: repo,
      ref: "refs/heads/main",
      source_lane: "public-main",
    }],
    ledger_records: [],
    ...extra,
  };
}

function successEvidence(sourceTarget, validatedRecordCount = 1) {
  const outputCommit = "a".repeat(40);
  return {
    validation: {
      ok: true,
      commands: ["node --test synthetic"],
      candidate_target: sourceTarget,
      validated_record_count: validatedRecordCount,
    },
    commit: { ok: true, commit: outputCommit },
    push: {
      ok: true,
      commit: outputCommit,
      remote_contains_commit: true,
      source_target: sourceTarget,
    },
  };
}

function runCapture(root, payload, extraArgs = []) {
  return spawnSync(process.execPath, [
    CAPTURE_TOOL,
    "--repo-root", root,
    "--project", "system",
    "--session-ref", "cursor_capture_test",
    "--worker", "codex_gpt-5.6-sol",
    "--request-kind", "ai_work_result_recovery",
    "--json", "-",
    ...extraArgs,
  ], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    windowsHide: true,
  });
}

function assertNoHostPath(text, forbidden = []) {
  for (const value of forbidden) {
    assert.equal(text.includes(value), false, `public output leaked ${value}`);
  }
  assert.doesNotMatch(text, /(?:[A-Za-z]:[\\/]|\/(?:Users|home|tmp)\/)/iu);
}

test("missed three days are planned oldest-to-newest with separated times", () => {
  const f = fixture();
  try {
    const commits = [
      commit(f.repo, "day1", "day one", "2026-07-27T01:00:00Z"),
      commit(f.repo, "day2", "day two", "2026-07-28T01:00:00Z"),
      commit(f.repo, "day3", "day three", "2026-07-29T01:00:00Z"),
    ];
    const receipt = planCursorSweep({
      ...inputFor(f.repo, f.baseline, commits[2]),
      success_evidence: successEvidence(commits[2], 3),
    });
    assert.equal(receipt.status, "READY_TO_ADVANCE");
    assert.deepEqual(receipt.range.commits, commits);
    assert.deepEqual(receipt.counts, {
      missing: 3,
      generated: 3,
      duplicate: 0,
      hold: 0,
      excluded_self_loop: 0,
    });
    assert.equal(receipt.source_cursor.after, commits[2]);
    assert.deepEqual(
      receipt.records_to_append.map((record) => record.occurred_at),
      ["2026-07-27T01:00:00.000Z", "2026-07-28T01:00:00.000Z", "2026-07-29T01:00:00.000Z"],
    );
    assert.ok(receipt.records_to_append.every((record) =>
      record.recorded_at === "2026-07-30T03:00:00.000Z"
      && record.at === record.recorded_at
      && Object.keys(record).length === 16));
    assert.equal(
      receipt.digests[0].digest,
      canonicalRecordDigest(receipt.records_to_append[0]),
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }

});

test("mid-run failure holds cursor and resume deduplicates existing output", () => {
  const f = fixture();
  try {
    const first = commit(f.repo, "first", "first result", "2026-07-27T01:00:00Z");
    const second = commit(f.repo, "second", "second result", "2026-07-28T01:00:00Z");
    const failed = planCursorSweep(inputFor(f.repo, f.baseline, second));
    assert.equal(failed.status, "PLANNED_NO_ADVANCE");
    assert.equal(failed.source_cursor.after, f.baseline);
    assert.equal(failed.advance_boundary.satisfied, false);

    const resumed = planCursorSweep({
      ...inputFor(f.repo, f.baseline, second),
      ledger_records: [failed.records_to_append[0]],
      success_evidence: successEvidence(second, 2),
    });
    assert.ok(failed.records_to_append[0].input_refs[0].endsWith(`@${first}`));
    assert.equal(resumed.counts.duplicate, 1);
    assert.equal(resumed.counts.missing, 1);
    assert.ok(resumed.records_to_append[0].input_refs[0].endsWith(`@${second}`));
    assert.equal(resumed.source_cursor.after, second);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }

  const revisionFixture = fixture();
  try {
    const sentinel = "ghp_abcdefgh";
    const target = commit(
      revisionFixture.repo,
      "invalid-revision-sentinel",
      "safe source subject",
      "2026-07-29T02:00:00Z",
    );
    const input = inputFor(
      revisionFixture.repo,
      revisionFixture.baseline,
      target,
    );
    input.source.baseline = sentinel;
    input.cursor.last_successful_source_commit = sentinel;
    const receipt = planCursorSweep(input);
    assert.equal(receipt.status, "HOLD");
    assert.equal(JSON.stringify(receipt).includes(sentinel), false);
    assert.equal(receipt.records_to_append.length, 0);
  } finally {
    rmSync(revisionFixture.root, { recursive: true, force: true });
  }
});

test("same identity and full digest is a no-op; different digest is HOLD", () => {
  const f = fixture();
  try {
    const target = commit(f.repo, "one", "one result", "2026-07-27T01:00:00Z");
    const planned = planCursorSweep(inputFor(f.repo, f.baseline, target));
    const record = planned.records_to_append[0];
    const duplicate = planCursorSweep({
      ...inputFor(f.repo, f.baseline, target),
      ledger_records: [record],
      success_evidence: successEvidence(target),
    });
    assert.equal(duplicate.counts.duplicate, 1);
    assert.equal(duplicate.counts.generated, 0);
    assert.equal(duplicate.status, "READY_TO_ADVANCE");

    const conflict = { ...record, output: "different public result" };
    const held = planCursorSweep({
      ...inputFor(f.repo, f.baseline, target),
      ledger_records: [conflict],
      success_evidence: successEvidence(target),
    });
    assert.equal(held.status, "HOLD");
    assert.ok(held.hold_reasons.some((reason) => reason.startsWith("identity_digest_conflict:")));
    assert.equal(held.source_cursor.after, f.baseline);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("capture CLI writes additive clocks and holds same identity with another digest", () => {
  const root = mkdtempSync(join(tmpdir(), "five-field-capture-"));
  try {
    mkdirSync(join(root, "_workmeta"));
    const payload = {
      input_refs: ["git:soulforge-public@0123456789012345678901234567890123456789"],
      judgment: "bounded synthetic decision",
      output: "bounded synthetic output",
      verification: "synthetic validator passed",
      stop_conditions: ["stop before live state"],
    };
    const args = [
      "--id", `recovery:${"b".repeat(64)}`,
      "--occurred-at", "2026-07-27T01:00:00Z",
      "--recorded-at", "2026-07-30T03:00:00Z",
    ];
    const first = runCapture(root, payload, args);
    assert.equal(first.status, 0, first.stdout || first.stderr);
    const ledger = join(
      root,
      "_workmeta",
      "system",
      "reports",
      "procedure_capture",
      "five_field_log.jsonl",
    );
    const stored = JSON.parse(readFileSync(ledger, "utf8").trim());
    assert.equal(stored.at, "2026-07-30T03:00:00.000Z");
    assert.equal(stored.occurred_at, "2026-07-27T01:00:00.000Z");
    assert.equal(stored.recorded_at, stored.at);
    const replay = runCapture(root, payload, args);
    assert.equal(replay.status, 0, replay.stdout || replay.stderr);
    assert.equal(JSON.parse(replay.stdout).skipped, "duplicate");

    const conflict = runCapture(root, {
      ...payload,
      stop_conditions: ["different immutable content"],
    }, args);
    assert.equal(conflict.status, 1);
    assert.equal(JSON.parse(conflict.stdout).error, "same_identity_different_digest_hold");

    const legacy = {
      schema_version: "soulforge.five_field_capture.v0",
      id: "legacy:0123456789abcdef",
      at: "2026-07-25T03:00:00.000Z",
      worker: "codex_gpt-5.6-sol",
      session_ref: "cursor_capture_test",
      project_code: "system",
      request_kind: "ai_work_result_recovery",
      ...payload,
      needs_backfill: 0,
      data_label: "ai_draft",
    };
    writeFileSync(ledger, `${readFileSync(ledger, "utf8")}${JSON.stringify(legacy)}\n`, "utf8");
    const legacyReplay = runCapture(root, payload, ["--id", legacy.id]);
    assert.equal(legacyReplay.status, 0, legacyReplay.stdout || legacyReplay.stderr);
    assert.equal(JSON.parse(legacyReplay.stdout).skipped, "duplicate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("target/ref mismatch, history rewrite, and non-FF observation each HOLD", () => {
  const f = fixture();
  try {
    const oldTip = commit(f.repo, "old", "old tip", "2026-07-27T01:00:00Z");
    git(f.repo, ["checkout", "--orphan", "rewritten"]);
    rmSync(join(f.repo, "work.txt"), { force: true });
    const rewritten = commit(f.repo, "new", "rewritten tip", "2026-07-28T01:00:00Z");

    const historyRewrite = planCursorSweep({
      ...inputFor(f.repo, f.baseline, rewritten),
      source: {
        ...inputFor(f.repo, f.baseline, rewritten).source,
        ref: "refs/heads/rewritten",
      },
      cursor: {
        ...inputFor(f.repo, f.baseline, rewritten).cursor,
        ref: "refs/heads/rewritten",
      },
      source_allowlist: [{
        classification: "public",
        repo: "soulforge-public",
        repo_path: f.repo,
        ref: "refs/heads/rewritten",
        source_lane: "public-main",
      }],
    });
    assert.ok(historyRewrite.hold_reasons.includes("baseline_not_ancestor_history_rewrite"));

    git(f.repo, ["checkout", "main"]);
    const newer = commit(f.repo, "newer", "newer tip", "2026-07-29T01:00:00Z");
    const notAllowlisted = planCursorSweep({
      ...inputFor(f.repo, f.baseline, newer),
      source_allowlist: [],
    });
    assert.ok(notAllowlisted.hold_reasons.includes("source_lane_not_exactly_allowlisted"));
    const targetMismatch = planCursorSweep(inputFor(f.repo, f.baseline, oldTip));
    assert.ok(targetMismatch.hold_reasons.includes("candidate_target_ref_mismatch"));

    const nonFf = planCursorSweep({
      ...inputFor(f.repo, f.baseline, newer),
      source: {
        ...inputFor(f.repo, f.baseline, newer).source,
        expected_ref_tip: rewritten,
      },
    });
    assert.ok(nonFf.hold_reasons.includes("non_fast_forward_ref_observation"));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("invalid repository HOLD uses only a stable redacted error code", () => {
  const root = mkdtempSync(join(tmpdir(), "five-field-redaction-"));
  try {
    const missingRepo = join(root, "private-owner-path");
    const baseline = "1".repeat(40);
    const target = "2".repeat(40);
    const receipt = planCursorSweep(inputFor(missingRepo, baseline, target));
    const serialized = JSON.stringify(receipt);
    assert.equal(receipt.status, "HOLD");
    assert.deepEqual(receipt.hold_reasons, ["git_rev_parse_failed"]);
    assert.equal(receipt.source_cursor.after, null);
    assert.equal(serialized.includes(missingRepo), false);
    assertNoHostPath(serialized, [root, missingRepo, "private-owner-path"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI missing input never returns an absolute path or raw filesystem error", () => {
  const root = mkdtempSync(join(tmpdir(), "five-field-cli-redaction-"));
  try {
    const missingInput = join(root, "missing-private-input.json");
    const missingFile = spawnSync(process.execPath, [
      CURSOR_TOOL,
      "--input",
      missingInput,
    ], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(missingFile.status, 1);
    assert.deepEqual(JSON.parse(missingFile.stdout), {
      ok: false,
      error: "input_read_failed",
    });
    assertNoHostPath(missingFile.stdout, [root, missingInput, "missing-private-input.json"]);

    const missingValue = spawnSync(process.execPath, [CURSOR_TOOL, "--input"], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(missingValue.status, 1);
    assert.deepEqual(JSON.parse(missingValue.stdout), {
      ok: false,
      error: "input_path_required",
    });
    assertNoHostPath(missingValue.stdout, [root, process.cwd()]);

    const emptyStdin = spawnSync(process.execPath, [CURSOR_TOOL], {
      input: "",
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(emptyStdin.status, 1);
    assert.deepEqual(JSON.parse(emptyStdin.stdout), {
      ok: false,
      error: "input_json_invalid",
    });
    assertNoHostPath(emptyStdin.stdout, [root, process.cwd()]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("only the exact automation trailer is excluded as a self-loop", () => {
  const f = fixture();
  try {
    const similar = commit(
      f.repo,
      "similar",
      "mentions Soulforge-Automation-Output in a title",
      "2026-07-27T01:00:00Z",
    );
    const incomplete = commit(
      f.repo,
      "incomplete",
      "automation trailer without lane identity",
      "2026-07-28T01:00:00Z",
      AUTOMATION_SELF_LOOP_TRAILER,
    );
    const source = inputFor(f.repo, f.baseline, incomplete).source;
    const bodyPair = commit(
      f.repo,
      "body-pair",
      "exact marker text outside the trailer block",
      "2026-07-29T01:00:00Z",
      `${AUTOMATION_SELF_LOOP_TRAILER}\n${sourceLaneTrailer(source)}\n\nnot a trailer footer`,
    );
    const selfLoop = commit(
      f.repo,
      "loop",
      "automated ledger result",
      "2026-07-30T01:00:00Z",
      `${AUTOMATION_SELF_LOOP_TRAILER}\n${sourceLaneTrailer(source)}`,
    );
    const receipt = planCursorSweep(inputFor(f.repo, f.baseline, selfLoop));
    assert.deepEqual(receipt.range.commits, [similar, incomplete, bodyPair, selfLoop]);
    assert.equal(receipt.counts.excluded_self_loop, 1);
    assert.deepEqual(receipt.self_loop_exclusions, [{
      commit: selfLoop,
      reason: "exact_automation_and_source_lane_trailers",
    }]);
    assert.equal(receipt.counts.generated, 3);
    assert.ok(receipt.records_to_append[0].input_refs[0].endsWith(`@${similar}`));
    assert.ok(receipt.records_to_append[1].input_refs[0].endsWith(`@${incomplete}`));
    assert.ok(receipt.records_to_append[2].input_refs[0].endsWith(`@${bodyPair}`));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("runtime-derived worker identity is required and an asserted mismatch HOLDs", () => {
  const f = fixture();
  try {
    const target = commit(f.repo, "worker", "runtime worker", "2026-07-27T01:00:00Z");
    const valid = planCursorSweep(inputFor(f.repo, f.baseline, target));
    assert.equal(valid.worker_identity, "codex_gpt-5.6-sol");
    assert.equal(valid.records_to_append[0].worker, valid.worker_identity);

    const missing = inputFor(f.repo, f.baseline, target);
    delete missing.runtime;
    const missingReceipt = planCursorSweep(missing);
    assert.equal(missingReceipt.status, "HOLD");
    assert.ok(missingReceipt.hold_reasons.includes("runtime_metadata_required"));
    assert.equal(missingReceipt.records_to_append.length, 0);

    const mismatch = planCursorSweep({
      ...inputFor(f.repo, f.baseline, target),
      runtime: {
        ...inputFor(f.repo, f.baseline, target).runtime,
        asserted_worker: "codex_another-model",
      },
    });
    assert.equal(mismatch.status, "HOLD");
    assert.ok(mismatch.hold_reasons.includes("runtime_worker_assertion_mismatch"));
    assert.equal(mismatch.records_to_append.length, 0);

    const secretShaped = planCursorSweep({
      ...inputFor(f.repo, f.baseline, target),
      runtime: {
        tool: "xoxb-abcdefgh",
        model: "gpt-5.6-sol",
        installed_models: ["gpt-5.6-sol"],
      },
    });
    assert.equal(secretShaped.status, "HOLD");
    assert.ok(secretShaped.hold_reasons.includes(
      "runtime_metadata_boundary_sentinel",
    ));
    assert.equal(JSON.stringify(secretShaped).includes("xoxb-abcdefgh"), false);
    assert.equal(secretShaped.records_to_append.length, 0);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("secret and absolute-path sentinels HOLD without echoing the triggering value", () => {
  const sentinels = [
    "access_token=synthetic-secret-value",
    "local path C:\\synthetic-private\\owner\\record.txt",
  ];
  for (const [index, sentinel] of sentinels.entries()) {
    const f = fixture();
    try {
      const target = commit(
        f.repo,
        `sentinel-${index}`,
        sentinel,
        `2026-07-${27 + index}T01:00:00Z`,
      );
      const receipt = planCursorSweep(inputFor(f.repo, f.baseline, target));
      const serialized = JSON.stringify(receipt);
      assert.equal(receipt.status, "HOLD");
      assert.ok(receipt.hold_reasons.some((reason) =>
        reason.startsWith("source_metadata_boundary_sentinel:")));
      assert.equal(serialized.includes(sentinel), false);
      assert.equal(receipt.records_to_append.length, 0);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }

  const f = fixture();
  try {
    const sentinel = "ghp_abcdefgh";
    const target = commit(
      f.repo,
      "allowlisted-token-sentinel",
      "safe source subject",
      "2026-07-29T01:00:00Z",
    );
    const input = inputFor(f.repo, f.baseline, target);
    input.source.repo = sentinel;
    input.cursor.repo = sentinel;
    input.source_allowlist[0].repo = sentinel;
    const receipt = planCursorSweep(input);
    assert.equal(receipt.status, "HOLD");
    assert.ok(receipt.hold_reasons.includes("source_metadata_boundary_sentinel"));
    assert.equal(JSON.stringify(receipt).includes(sentinel), false);
    assert.equal(receipt.records_to_append.length, 0);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("synthetic active foreground and private trees remain byte-for-byte unchanged", () => {
  const f = fixture();
  try {
    const activeForeground = join(f.root, "active-foreground");
    const activePrivate = join(f.root, "active-private");
    mkdirSync(activeForeground);
    mkdirSync(activePrivate);
    const foregroundSentinel = join(activeForeground, "sentinel.txt");
    const privateSentinel = join(activePrivate, "sentinel.txt");
    writeFileSync(foregroundSentinel, "foreground unchanged\n", "utf8");
    writeFileSync(privateSentinel, "private unchanged\n", "utf8");
    const before = [readFileSync(foregroundSentinel, "utf8"), readFileSync(privateSentinel, "utf8")];

    const target = commit(f.repo, "result", "safe public result", "2026-07-27T01:00:00Z");
    const receipt = planCursorSweep(inputFor(f.repo, f.baseline, target));

    assert.equal(receipt.safety.active_tree_mutations, 0);
    assert.equal(receipt.safety.private_tree_mutations, 0);
    assert.deepEqual(
      [readFileSync(foregroundSentinel, "utf8"), readFileSync(privateSentinel, "utf8")],
      before,
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
