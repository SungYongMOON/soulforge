import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PROJECTOR_EXPECTATION_SCHEMA,
  PROJECTOR_RECEIPT_SCHEMA,
  projectLedgerMetadataPath,
  projectLedgerMetadataStream,
  projectLedgerMetadataText,
} from "./five_field_ledger_metadata_projector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CLI = join(HERE, "five_field_ledger_metadata_projector.mjs");
const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);

function expectation(overrides = {}) {
  return {
    schema_version: PROJECTOR_EXPECTATION_SCHEMA,
    classification: "public",
    baseline_ref: "0".repeat(40),
    target_ref: COMMIT_B,
    source_commits: [COMMIT_A, COMMIT_B],
    snapshot_complete: true,
    ...overrides,
  };
}

function record(commit, overrides = {}) {
  const recordedAt = "2026-07-30T00:00:00.000Z";
  return {
    schema_version: "soulforge.five_field_capture.v0",
    id: `recovery:${commit}`,
    at: recordedAt,
    occurred_at: "2026-07-29T23:00:00.000Z",
    recorded_at: recordedAt,
    worker: "codex_synthetic",
    session_ref: `cursor_sweep:${commit}`,
    project_code: "system",
    request_kind: "ai_work_result_recovery",
    input_refs: [`git:soulforge-public@${commit}`],
    judgment: "Synthetic public commit metadata.",
    output: "Synthetic subject.",
    verification: `source_commit=${commit}; order=oldest_to_newest`,
    stop_conditions: ["HOLD on synthetic conflict."],
    needs_backfill: 0,
    data_label: "ai_backfill",
    ...overrides,
  };
}

function jsonl(rows) {
  return `${rows.map((row) =>
    typeof row === "string" ? row : JSON.stringify(row)).join("\n")}\n`;
}

function assertNonAcceptance(receipt) {
  assert.equal(receipt.official_completion, false);
  assert.equal(receipt.worksession_acceptance, false);
  assert.equal(receipt.taskdriver_acceptance, false);
  assert.equal(receipt.erp_acceptance, false);
  assert.equal(receipt.mcp_acceptance, false);
  assert.equal(receipt.claim_ceiling, "operational_evidence_only");
}

test("projects complete synthetic coverage and collapses same-digest replay", () => {
  const first = record(COMMIT_A);
  const receipt = projectLedgerMetadataText(
    jsonl([first, first, record(COMMIT_B)]),
    expectation(),
  );

  assert.equal(receipt.schema_version, PROJECTOR_RECEIPT_SCHEMA);
  assert.equal(receipt.status, "COMPLETE");
  assert.deepEqual(receipt.counts, {
    total_lines: 3,
    valid_records: 3,
    projected_records: 2,
    filtered: 0,
    malformed: 0,
    duplicate: 1,
    conflict: 0,
    out_of_scope: 0,
    missing: 0,
    hold: 0,
  });
  assert.equal(receipt.completeness.complete, true);
  assert.equal(receipt.error_attestation.status, "CLEAR");
  assert.deepEqual(receipt.error_attestation.errors, []);
  assert.deepEqual(
    receipt.records.map((row) => row.status).sort(),
    ["duplicate", "unique"],
  );
  assertNonAcceptance(receipt);

  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /Synthetic subject|cursor_sweep|recovery:/u);
  assert.doesNotMatch(serialized, /judgment|output|verification|session_ref/u);
});

test("same identity with a different full-record digest is a redacted HOLD", () => {
  const original = record(COMMIT_A);
  const changed = record(COMMIT_A, { output: "Different synthetic subject." });
  const receipt = projectLedgerMetadataText(
    jsonl([original, changed, record(COMMIT_B)]),
    expectation(),
  );

  assert.equal(receipt.status, "HOLD");
  assert.equal(receipt.counts.conflict, 1);
  assert.equal(receipt.counts.missing, 1);
  assert.equal(receipt.completeness.complete, false);
  assert.deepEqual(
    receipt.error_attestation.errors.map((row) => row.code),
    ["identity_digest_conflict", "source_commit_coverage_conflict",
      "source_commit_coverage_missing"],
  );
  assert.ok(receipt.records
    .filter((row) => row.source_commit_ref === COMMIT_A)
    .every((row) => row.status === "conflict"));
  assert.doesNotMatch(JSON.stringify(receipt), /Different synthetic subject/u);
  assertNonAcceptance(receipt);
});

test("malformed, unknown-key and secret-shaped rows never leak rejected input", () => {
  const privateMarker = "ghp_123456789SECRET";
  const unknown = { ...record(COMMIT_A), body: "private-body-marker" };
  const secret = record(COMMIT_B, { output: `token=${privateMarker}` });
  const receipt = projectLedgerMetadataText(
    jsonl(["{not-json", unknown, secret]),
    expectation(),
  );

  assert.equal(receipt.status, "HOLD");
  assert.equal(receipt.counts.malformed, 3);
  assert.equal(receipt.counts.missing, 2);
  assert.deepEqual(receipt.records, []);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /private-body-marker|123456789SECRET/u);
  assert.doesNotMatch(serialized, /not-json|body|token=/u);
  assert.deepEqual(
    receipt.error_attestation.errors.map((row) => row.code),
    [
      "record_boundary_rejected",
      "record_contract_invalid",
      "record_json_invalid",
      "source_commit_coverage_missing",
    ],
  );
});

test("recorded_at before occurred_at fails closed without leaking rejected input", () => {
  const inverted = record(COMMIT_A, {
    at: "2026-07-31T00:00:00.000Z",
    occurred_at: "2026-07-31T01:00:00.000Z",
    recorded_at: "2026-07-31T00:00:00.000Z",
    output: "synthetic-temporal-inversion-marker",
  });
  const receipt = projectLedgerMetadataText(
    jsonl([inverted, record(COMMIT_B)]),
    expectation(),
  );

  assert.equal(receipt.status, "HOLD");
  assert.equal(receipt.counts.malformed, 1);
  assert.equal(receipt.counts.missing, 1);
  assert.deepEqual(
    receipt.error_attestation.errors,
    [
      { code: "recorded_at_before_occurred_at", count: 1 },
      { code: "source_commit_coverage_missing", count: 1 },
    ],
  );
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /synthetic-temporal-inversion-marker/u);
  assert.doesNotMatch(
    serialized,
    /2026-07-31T00:00:00\.000Z|2026-07-31T01:00:00\.000Z/u,
  );
  assertNonAcceptance(receipt);
});

test("unrelated exact-schema ledger records are counted without reading their body", () => {
  const unrelatedPrivateMarker = "C:\\private-fixture\\owner-note.txt";
  const unrelated = record(COMMIT_A, {
    id: "private-fixture-id",
    request_kind: "unrelated_bounded_work",
    output: unrelatedPrivateMarker,
  });
  const receipt = projectLedgerMetadataText(
    jsonl([unrelated, record(COMMIT_A), record(COMMIT_B)]),
    expectation(),
  );

  assert.equal(receipt.status, "COMPLETE");
  assert.equal(receipt.counts.filtered, 1);
  assert.equal(receipt.counts.malformed, 0);
  assert.equal(receipt.counts.valid_records, 2);
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /private-fixture|owner-note|private-fixture-id/u,
  );
});

test("unknown expectation keys fail closed with a stable code", () => {
  const unsafe = {
    ...expectation(),
    payload: "must-not-echo",
  };
  assert.throws(
    () => projectLedgerMetadataText("", unsafe),
    (error) => error.code === "expectation_contract_invalid"
      && error.message === "expectation_contract_invalid",
  );
});

test("an unattested snapshot stays HOLD even when the expected range is empty", () => {
  const receipt = projectLedgerMetadataText("", expectation({
    target_ref: "0".repeat(40),
    source_commits: [],
    snapshot_complete: false,
  }));
  assert.equal(receipt.status, "HOLD");
  assert.equal(receipt.counts.missing, 0);
  assert.equal(receipt.completeness.snapshot_complete, false);
  assert.deepEqual(receipt.error_attestation.errors, [{
    code: "snapshot_completeness_unattested",
    count: 1,
  }]);
  assertNonAcceptance(receipt);
});

test("stream and synthetic OS-temp path produce the same deterministic receipt", async () => {
  const text = jsonl([record(COMMIT_A), record(COMMIT_B)]);
  const fromStream = await projectLedgerMetadataStream(
    Readable.from([text.slice(0, 17), text.slice(17)]),
    expectation(),
  );
  const root = mkdtempSync(join(tmpdir(), "five-field-projector-"));
  try {
    const ledgerPath = join(root, "synthetic.jsonl");
    writeFileSync(ledgerPath, text, "utf8");
    const fromPath = await projectLedgerMetadataPath(ledgerPath, expectation());
    assert.deepEqual(fromPath, fromStream);
    assert.equal(fromPath.status, "COMPLETE");
    assert.doesNotMatch(JSON.stringify(fromPath), new RegExp(
      root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
      "u",
    ));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI emits only a stable redacted HOLD when a synthetic path is unreadable", () => {
  const root = mkdtempSync(join(tmpdir(), "five-field-projector-cli-"));
  try {
    const expectationPath = join(root, "expectation.json");
    const missingPath = join(root, "missing-private-marker.jsonl");
    writeFileSync(expectationPath, JSON.stringify(expectation()), "utf8");
    const result = spawnSync(process.execPath, [
      CLI,
      "--ledger",
      missingPath,
      "--expectation",
      expectationPath,
    ], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 2);
    assert.equal(result.stderr, "");
    const receipt = JSON.parse(result.stdout);
    assert.deepEqual(receipt.error_attestation.errors, [{
      code: "ledger_stream_read_failed",
      count: 1,
    }]);
    assert.doesNotMatch(result.stdout, /missing-private-marker|five-field-projector-cli/u);
    assertNonAcceptance(receipt);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI completes from OS-temp fixtures without exposing either input path", () => {
  const root = mkdtempSync(join(tmpdir(), "five-field-projector-ok-"));
  try {
    const expectationPath = join(root, "expectation-private-marker.json");
    const ledgerPath = join(root, "ledger-private-marker.jsonl");
    writeFileSync(expectationPath, JSON.stringify(expectation()), "utf8");
    writeFileSync(
      ledgerPath,
      jsonl([record(COMMIT_A), record(COMMIT_B)]),
      "utf8",
    );
    const result = spawnSync(process.execPath, [
      CLI,
      "--ledger",
      ledgerPath,
      "--expectation",
      expectationPath,
    ], {
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.status, "COMPLETE");
    assert.doesNotMatch(result.stdout, /private-marker|five-field-projector-ok/u);
    assertNonAcceptance(receipt);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
