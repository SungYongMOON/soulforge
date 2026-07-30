#!/usr/bin/env node
import { createReadStream, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertExactKeys,
  canonicalize,
  codedError,
  normalizePublicCommitRef,
  normalizeUtc,
  operationalNonAcceptanceReceipt,
  publicErrorCode,
  rejectForbiddenInput,
  sha256Digest,
} from "./five_field_recovery_contract.mjs";

export const PROJECTOR_EXPECTATION_SCHEMA =
  "soulforge.five_field_ledger_metadata_projection_expectation.v1";
export const PROJECTOR_RECEIPT_SCHEMA =
  "soulforge.five_field_ledger_metadata_projection_receipt.v1";

const RECORD_SCHEMA = "soulforge.five_field_capture.v0";
const MAX_STREAM_BYTES = 32 * 1024 * 1024;
const MAX_LINE_BYTES = 64 * 1024;
const RECORD_KEYS = [
  "schema_version",
  "id",
  "at",
  "occurred_at",
  "recorded_at",
  "worker",
  "session_ref",
  "project_code",
  "request_kind",
  "input_refs",
  "judgment",
  "output",
  "verification",
  "stop_conditions",
  "needs_backfill",
  "data_label",
];
const EXPECTATION_KEYS = [
  "schema_version",
  "classification",
  "baseline_ref",
  "target_ref",
  "source_commits",
  "snapshot_complete",
];
const PUBLIC_INPUT_REF_RE =
  /^git:[a-z0-9][a-z0-9._-]{0,119}@([0-9a-f]{40}(?:[0-9a-f]{24})?)$/u;
const SAFE_METADATA_RE = /^[^\0\r\n]{1,600}$/u;

function emptyCounts() {
  return {
    total_lines: 0,
    valid_records: 0,
    projected_records: 0,
    filtered: 0,
    malformed: 0,
    duplicate: 0,
    conflict: 0,
    out_of_scope: 0,
    missing: 0,
    hold: 0,
  };
}

function baseReceipt() {
  return operationalNonAcceptanceReceipt({
    schema_version: PROJECTOR_RECEIPT_SCHEMA,
    status: "HOLD",
    classification: "public_metadata_projection",
    counts: emptyCounts(),
    range: {
      baseline_ref: null,
      target_ref: null,
      source_commit_count: 0,
      source_commit_digest: null,
    },
    records: [],
    completeness: {
      snapshot_complete: false,
      expected_source_commits: 0,
      covered_source_commits: 0,
      missing_source_commits: 0,
      malformed_records: 0,
      conflict_identities: 0,
      complete: false,
    },
    error_attestation: {
      status: "HOLD",
      errors: [],
    },
  });
}

function addError(errorCounts, code, increment = 1) {
  errorCounts.set(code, (errorCounts.get(code) || 0) + increment);
}

function errorsFrom(errorCounts) {
  return [...errorCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({ code, count }));
}

function normalizeExpectation(value) {
  assertExactKeys(value, EXPECTATION_KEYS, "expectation_contract_invalid");
  if (value.schema_version !== PROJECTOR_EXPECTATION_SCHEMA) {
    throw codedError("expectation_schema_mismatch");
  }
  if (value.classification !== "public") {
    throw codedError("expectation_classification_invalid");
  }
  const baselineRef = normalizePublicCommitRef(
    value.baseline_ref,
    "baseline_ref_invalid",
  );
  const targetRef = normalizePublicCommitRef(
    value.target_ref,
    "target_ref_invalid",
  );
  if (!Array.isArray(value.source_commits)) {
    throw codedError("source_commits_invalid");
  }
  const sourceCommits = value.source_commits.map((commit) =>
    normalizePublicCommitRef(commit, "source_commit_ref_invalid"));
  if (new Set(sourceCommits).size !== sourceCommits.length) {
    throw codedError("source_commits_duplicate");
  }
  if (
    (sourceCommits.length === 0 && baselineRef !== targetRef)
    || (
      sourceCommits.length > 0
      && (
        sourceCommits.at(-1) !== targetRef
        || sourceCommits.includes(baselineRef)
      )
    )
  ) {
    throw codedError("source_commit_range_invalid");
  }
  if (typeof value.snapshot_complete !== "boolean") {
    throw codedError("snapshot_completeness_invalid");
  }
  rejectForbiddenInput(value, { code: "expectation_boundary_rejected" });
  return {
    baselineRef,
    targetRef,
    sourceCommits,
    snapshotComplete: value.snapshot_complete,
  };
}

function safeMetadata(value) {
  return typeof value === "string" && SAFE_METADATA_RE.test(value);
}

function normalizeRecord(value) {
  assertExactKeys(value, RECORD_KEYS, "record_contract_invalid");
  if (value.schema_version !== RECORD_SCHEMA) {
    throw codedError("record_schema_mismatch");
  }
  if (value.request_kind !== "ai_work_result_recovery") {
    return { filtered: true };
  }
  rejectForbiddenInput(value, { code: "record_boundary_rejected" });
  if (
    typeof value.id !== "string"
    || value.id.length < 1
    || value.id.length > 240
    || !safeMetadata(value.worker)
    || !safeMetadata(value.session_ref)
    || value.project_code !== "system"
    || !safeMetadata(value.judgment)
    || !safeMetadata(value.output)
    || !safeMetadata(value.verification)
    || value.needs_backfill !== 0
    || value.data_label !== "ai_backfill"
    || !Array.isArray(value.stop_conditions)
    || !value.stop_conditions.every(safeMetadata)
    || value.stop_conditions.length > 12
    || !Array.isArray(value.input_refs)
    || value.input_refs.length !== 1
  ) {
    throw codedError("record_contract_invalid");
  }
  const inputRefMatch = PUBLIC_INPUT_REF_RE.exec(value.input_refs[0]);
  if (!inputRefMatch) throw codedError("record_source_ref_invalid");
  const sourceCommitRef = normalizePublicCommitRef(inputRefMatch[1]);
  const occurredAt = normalizeUtc(value.occurred_at, "occurred_at_invalid");
  const recordedAt = normalizeUtc(value.recorded_at, "recorded_at_invalid");
  if (normalizeUtc(value.at, "recorded_at_invalid") !== recordedAt) {
    throw codedError("recorded_at_mismatch");
  }
  if (recordedAt < occurredAt) {
    throw codedError("recorded_at_before_occurred_at");
  }
  return {
    id: value.id,
    identity_digest: sha256Digest(value.id),
    full_record_digest: sha256Digest(canonicalize(value)),
    source_commit_ref: sourceCommitRef,
    occurred_at: occurredAt,
    recorded_at: recordedAt,
    classification: "public",
  };
}

function parseLedger(text) {
  if (typeof text !== "string") throw codedError("ledger_text_required");
  if (Buffer.byteLength(text, "utf8") > MAX_STREAM_BYTES) {
    throw codedError("ledger_stream_too_large");
  }
  const rows = [];
  const errorCounts = new Map();
  const lines = text.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
      addError(errorCounts, "record_too_large");
      rows.push(null);
      continue;
    }
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      addError(errorCounts, "record_json_invalid");
      rows.push(null);
      continue;
    }
    try {
      rows.push(normalizeRecord(value));
    } catch (error) {
      addError(errorCounts, publicErrorCode(error, "record_invalid"));
      rows.push(null);
    }
  }
  return { rows, errorCounts };
}

function projectParsedLedger(parsed, expectation) {
  const receipt = baseReceipt();
  const expected = new Set(expectation.sourceCommits);
  const errorCounts = parsed.errorCounts;
  receipt.range = {
    baseline_ref: expectation.baselineRef,
    target_ref: expectation.targetRef,
    source_commit_count: expectation.sourceCommits.length,
    source_commit_digest: sha256Digest(expectation.sourceCommits.join("\n")),
  };
  receipt.counts.total_lines = parsed.rows.length;
  receipt.counts.malformed = parsed.rows.filter((row) => row === null).length;

  const byIdentity = new Map();
  for (const row of parsed.rows) {
    if (!row) continue;
    if (row.filtered) {
      receipt.counts.filtered += 1;
      continue;
    }
    receipt.counts.valid_records += 1;
    const matches = byIdentity.get(row.id) || [];
    matches.push(row);
    byIdentity.set(row.id, matches);
  }

  const projections = [];
  const coverage = new Map();
  for (const rows of byIdentity.values()) {
    const digestGroups = new Map();
    for (const row of rows) {
      const matching = digestGroups.get(row.full_record_digest) || [];
      matching.push(row);
      digestGroups.set(row.full_record_digest, matching);
    }
    const conflicting = digestGroups.size > 1
      || new Set(rows.map((row) => row.source_commit_ref)).size > 1;
    if (conflicting) {
      receipt.counts.conflict += 1;
      addError(errorCounts, "identity_digest_conflict");
    } else if (rows.length > 1) {
      receipt.counts.duplicate += rows.length - 1;
    }
    for (const digestRows of digestGroups.values()) {
      const row = digestRows[0];
      const inScope = expected.has(row.source_commit_ref);
      const status = conflicting
        ? "conflict"
        : inScope
          ? (rows.length > 1 ? "duplicate" : "unique")
          : "out_of_scope";
      if (!inScope) receipt.counts.out_of_scope += digestRows.length;
      projections.push({
        identity_digest: row.identity_digest,
        full_record_digest: row.full_record_digest,
        source_commit_ref: row.source_commit_ref,
        occurred_at: row.occurred_at,
        recorded_at: row.recorded_at,
        classification: row.classification,
        status,
      });
      if (inScope) {
        const entries = coverage.get(row.source_commit_ref) || [];
        entries.push({ identity: row.identity_digest, conflicting });
        coverage.set(row.source_commit_ref, entries);
      }
    }
  }

  let covered = 0;
  let commitConflicts = 0;
  for (const commit of expectation.sourceCommits) {
    const entries = coverage.get(commit) || [];
    const identities = new Set(entries.map((entry) => entry.identity));
    if (
      entries.length === 1
      && identities.size === 1
      && entries.every((entry) => !entry.conflicting)
    ) {
      covered += 1;
    } else if (entries.length > 0) {
      commitConflicts += 1;
    }
  }
  if (commitConflicts > 0) {
    addError(errorCounts, "source_commit_coverage_conflict", commitConflicts);
  }
  receipt.counts.missing = expectation.sourceCommits.length - covered;
  if (receipt.counts.missing > 0) {
    addError(errorCounts, "source_commit_coverage_missing", receipt.counts.missing);
  }
  if (!expectation.snapshotComplete) {
    addError(errorCounts, "snapshot_completeness_unattested");
  }

  receipt.records = projections.sort((left, right) =>
    left.source_commit_ref.localeCompare(right.source_commit_ref)
      || left.identity_digest.localeCompare(right.identity_digest)
      || left.full_record_digest.localeCompare(right.full_record_digest));
  receipt.counts.projected_records = receipt.records.length;
  receipt.completeness = {
    snapshot_complete: expectation.snapshotComplete,
    expected_source_commits: expectation.sourceCommits.length,
    covered_source_commits: covered,
    missing_source_commits: receipt.counts.missing,
    malformed_records: receipt.counts.malformed,
    conflict_identities: receipt.counts.conflict,
    complete: expectation.snapshotComplete
      && receipt.counts.malformed === 0
      && receipt.counts.conflict === 0
      && commitConflicts === 0
      && receipt.counts.missing === 0,
  };
  receipt.status = receipt.completeness.complete ? "COMPLETE" : "HOLD";
  receipt.error_attestation = {
    status: receipt.completeness.complete ? "CLEAR" : "HOLD",
    errors: errorsFrom(errorCounts),
  };
  receipt.counts.hold = receipt.error_attestation.errors.reduce(
    (sum, row) => sum + row.count,
    0,
  );
  return receipt;
}

export function projectLedgerMetadataText(text, expectationInput) {
  const expectation = normalizeExpectation(expectationInput);
  return projectParsedLedger(parseLedger(text), expectation);
}

export async function projectLedgerMetadataStream(stream, expectationInput) {
  const expectation = normalizeExpectation(expectationInput);
  let text = "";
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > MAX_STREAM_BYTES) throw codedError("ledger_stream_too_large");
      text += buffer.toString("utf8");
    }
  } catch (error) {
    if (publicErrorCode(error) === "ledger_stream_too_large") throw error;
    throw codedError("ledger_stream_read_failed");
  }
  return projectParsedLedger(parseLedger(text), expectation);
}

export function projectLedgerMetadataPath(path, expectationInput) {
  if (typeof path !== "string" || path.length === 0) {
    return Promise.reject(codedError("ledger_path_required"));
  }
  return projectLedgerMetadataStream(createReadStream(resolve(path)), expectationInput);
}

function cliHold(code) {
  const receipt = baseReceipt();
  receipt.error_attestation.errors = [{ code, count: 1 }];
  receipt.counts.hold = 1;
  return receipt;
}

function parseCli(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") return { help: true };
    if (value !== "--ledger" && value !== "--expectation") {
      throw codedError("unknown_argument");
    }
    const next = argv[index + 1];
    if (!next) throw codedError("argument_value_required");
    args[value.slice(2)] = next;
    index += 1;
  }
  if (!args.ledger || !args.expectation) throw codedError("arguments_required");
  return args;
}

async function cli() {
  try {
    const args = parseCli(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(
        "Usage: node five_field_ledger_metadata_projector.mjs "
        + "--ledger <owner-injected-jsonl> --expectation <public-json>\n"
        + "Prints only redacted metadata projection; never modifies the ledger.\n",
      );
      return;
    }
    let expectation;
    try {
      const text = readFileSync(resolve(args.expectation), "utf8");
      expectation = JSON.parse(text.replace(/^\uFEFF/u, ""));
    } catch {
      throw codedError("expectation_read_invalid");
    }
    const receipt = await projectLedgerMetadataPath(args.ledger, expectation);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.exitCode = receipt.status === "COMPLETE" ? 0 : 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(
      cliHold(publicErrorCode(error, "internal_cli_error")),
      null,
      2,
    )}\n`);
    process.exitCode = 2;
  }
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  await cli();
}
