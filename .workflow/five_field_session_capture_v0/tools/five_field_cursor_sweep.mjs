#!/usr/bin/env node
/**
 * Feature-OFF planner for deterministic AI work result recovery.
 *
 * This module reads public Git metadata and caller-supplied ledger/cursor state.
 * It never writes a ledger, cursor, Git ref, commit, or remote. The caller must
 * separately perform and attest validation + commit + push before the returned
 * cursor can advance.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const INPUT_SCHEMA = "soulforge.five_field_cursor_sweep_input.v1";
export const RECEIPT_SCHEMA = "soulforge.five_field_cursor_sweep_receipt.v1";
export const RECORD_SCHEMA = "soulforge.five_field_capture.v0";
export const AUTOMATION_SELF_LOOP_TRAILER =
  "Soulforge-Automation-Output: ai-work-result-recovery/v1";

const SHA_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const REF_RE = /^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const TOKEN_RE = /^[a-z0-9][a-z0-9._/-]{0,119}$/;
const PUBLIC_ERROR_CODES = new Set([
  "baseline_must_be_full_commit_sha",
  "baseline_not_a_commit",
  "candidate_target_must_be_full_commit_sha",
  "candidate_target_not_a_commit",
  "commit_occurred_at_invalid",
  "commit_occurred_at_required",
  "expected_ref_tip_must_be_full_commit_sha",
  "expected_ref_tip_not_a_commit",
  "git_command_failed",
  "git_merge_base_failed",
  "git_rev_list_failed",
  "git_rev_parse_failed",
  "git_show_failed",
  "git_show_parse_failed",
  "input_json_invalid",
  "input_object_required",
  "input_path_required",
  "input_read_failed",
  "internal_cli_error",
  "internal_planner_error",
  "recorded_at_invalid",
  "recorded_at_required",
  "source_commit_metadata_failed",
  "source_history_read_failed",
  "source_ref_invalid",
  "source_ref_not_a_commit",
  "source_ref_recheck_failed",
  "source_revision_resolution_failed",
  "source_topology_check_failed",
  "unknown_argument",
]);

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function publicErrorCode(error, fallback = "internal_planner_error") {
  const candidate = error?.code ?? error?.message;
  return typeof candidate === "string" && PUBLIC_ERROR_CODES.has(candidate)
    ? candidate
    : fallback;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalRecordDigest(record) {
  return `sha256:${sha256(canonicalize(record))}`;
}

export function sourceLaneTrailer(source) {
  const laneTuple = [source.repo, source.ref, source.source_lane].join("\0");
  return `Soulforge-Source-Lane: sha256:${sha256(laneTuple)}`;
}

function normalizeIso(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw codedError(`${field}_required`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw codedError(`${field}_invalid`);
  return parsed.toISOString();
}

function git(repoPath, args) {
  const result = spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const operationCodes = {
      "rev-parse": "git_rev_parse_failed",
      "rev-list": "git_rev_list_failed",
      show: "git_show_failed",
    };
    throw codedError(operationCodes[args[0]] ?? "git_command_failed");
  }
  return String(result.stdout).replace(/\r\n/g, "\n");
}

function resolveCommit(repoPath, value, field) {
  if (!SHA_RE.test(value)) throw codedError(`${field}_must_be_full_commit_sha`);
  const resolved = git(repoPath, ["rev-parse", "--verify", `${value}^{commit}`]).trim();
  if (!SHA_RE.test(resolved)) throw codedError(`${field}_not_a_commit`);
  return resolved;
}

function resolveRef(repoPath, ref) {
  if (!REF_RE.test(ref)) throw codedError("source_ref_invalid");
  const resolved = git(repoPath, ["rev-parse", "--verify", `${ref}^{commit}`]).trim();
  if (!SHA_RE.test(resolved)) throw codedError("source_ref_not_a_commit");
  return resolved;
}

function isAncestor(repoPath, older, newer) {
  const result = spawnSync("git", ["-C", repoPath, "merge-base", "--is-ancestor", older, newer], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw codedError("git_merge_base_failed");
}

function commitMetadata(repoPath, commit) {
  const raw = git(repoPath, ["show", "-s", "--format=%H%x00%cI%x00%B", commit]);
  const first = raw.indexOf("\0");
  const second = raw.indexOf("\0", first + 1);
  if (first < 0 || second < 0) throw codedError("git_show_parse_failed");
  const sha = raw.slice(0, first).trim();
  const occurredAt = normalizeIso(raw.slice(first + 1, second).trim(), "commit_occurred_at");
  const message = raw.slice(second + 1).replace(/\n+$/, "");
  return {
    commit: sha,
    occurred_at: occurredAt,
    subject: message.split("\n", 1)[0].trim().slice(0, 600),
    message,
  };
}

function hasExactSelfLoopMarker(message, source) {
  const lines = message.replace(/\s+$/u, "").split(/\r?\n/u);
  const trailers = [];
  let index = lines.length - 1;
  while (index >= 0 && /^[A-Za-z0-9-]+:\s+\S.*$/u.test(lines[index])) {
    trailers.unshift(lines[index].trim());
    index -= 1;
  }
  if (trailers.length === 0 || (index >= 0 && lines[index].trim() !== "")) return false;
  const trailerSet = new Set(trailers);
  return trailerSet.has(AUTOMATION_SELF_LOOP_TRAILER)
    && trailerSet.has(sourceLaneTrailer(source));
}

function makeIdentity(source, commit) {
  const tuple = [source.repo, source.ref, source.source_lane, commit].join("\0");
  return `recovery:${sha256(tuple)}`;
}

function expectedRecord(source, metadata, recordedAt, existingRecordedAt) {
  const stableRecordedAt = existingRecordedAt
    ? normalizeIso(existingRecordedAt, "existing_recorded_at")
    : recordedAt;
  const id = makeIdentity(source, metadata.commit);
  const record = {
    schema_version: RECORD_SCHEMA,
    id,
    at: stableRecordedAt,
    occurred_at: metadata.occurred_at,
    recorded_at: stableRecordedAt,
    worker: "codex_gpt-5.6-sol",
    session_ref: `cursor_sweep:${metadata.commit}`,
    project_code: "system",
    request_kind: "ai_work_result_recovery",
    input_refs: [`git:${source.repo}@${metadata.commit}`],
    judgment: "Public Git commit metadata selected by the approved cursor range.",
    output: metadata.subject || "(empty commit subject)",
    verification: `source_commit=${metadata.commit}; order=oldest_to_newest`,
    stop_conditions: [
      "HOLD on topology rewrite, identity conflict, or incomplete success evidence.",
    ],
    needs_backfill: 0,
    data_label: "ai_backfill",
  };
  return record;
}

function attestationsComplete(evidence, candidateTarget, validatedRecordCount) {
  const validation = evidence?.validation?.ok === true
    && Array.isArray(evidence.validation.commands)
    && evidence.validation.commands.length > 0
    && evidence.validation.candidate_target === candidateTarget
    && evidence.validation.validated_record_count === validatedRecordCount;
  const commit = evidence?.commit?.ok === true && SHA_RE.test(evidence.commit.commit || "");
  const push = evidence?.push?.ok === true
    && evidence.push.remote_contains_commit === true
    && evidence.push.commit === evidence?.commit?.commit
    && evidence.push.source_target === candidateTarget;
  return {
    validation,
    commit,
    push,
    complete: validation && commit && push,
  };
}

function baseReceipt(input) {
  const source = input.source || {};
  const cursor = input.cursor || {};
  return {
    schema_version: RECEIPT_SCHEMA,
    feature_state: "OFF",
    operation: "ai_work_result_recovery",
    status: "HOLD",
    source_cursor: {
      repo: source.repo ?? null,
      ref: source.ref ?? null,
      source_lane: source.source_lane ?? null,
      source_lane_digest: source.repo && source.ref && source.source_lane
        ? sourceLaneTrailer(source).split(": ", 2)[1]
        : null,
      before: cursor.last_successful_source_commit ?? null,
      candidate_target: source.candidate_target ?? null,
      after: cursor.last_successful_source_commit ?? null,
    },
    range: {
      exclusive: cursor.last_successful_source_commit ?? null,
      inclusive: source.candidate_target ?? null,
      order: "oldest_to_newest",
      commits: [],
      digest: null,
    },
    counts: {
      missing: 0,
      generated: 0,
      duplicate: 0,
      hold: 0,
      excluded_self_loop: 0,
    },
    records_to_append: [],
    digests: [],
    hold_reasons: [],
    advance_boundary: {
      validation_success: false,
      commit_success: false,
      push_success: false,
      satisfied: false,
    },
    safety: {
      planner_only: true,
      public_metadata_only: "caller_attested_exact_allowlist",
      public_classification_independently_verified: false,
      active_tree_mutations: 0,
      private_tree_mutations: 0,
      git_mutations: 0,
      network_operations: 0,
    },
  };
}

function hold(receipt, reason) {
  if (!receipt.hold_reasons.includes(reason)) receipt.hold_reasons.push(reason);
}

/**
 * Produce a deterministic recovery plan and receipt.
 *
 * The only filesystem access is read-only Git inspection of source.repo_path.
 * ledger_records and cursor state must be supplied in the input object.
 */
export function planCursorSweep(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw codedError("input_object_required");
  }
  const receipt = baseReceipt(input);
  const source = input.source || {};
  const cursor = input.cursor || {};

  if (input.schema_version !== INPUT_SCHEMA) hold(receipt, "input_schema_mismatch");
  if (input.feature_state !== "OFF") hold(receipt, "feature_must_remain_off");
  if (source.classification !== "public") hold(receipt, "source_must_be_public");
  if (!TOKEN_RE.test(source.repo || "")) hold(receipt, "source_repo_invalid");
  if (!TOKEN_RE.test(source.source_lane || "")) hold(receipt, "source_lane_invalid");
  if (!REF_RE.test(source.ref || "")) hold(receipt, "source_ref_invalid");
  if (!source.repo_path || typeof source.repo_path !== "string") hold(receipt, "source_repo_path_required");
  if (!Array.isArray(input.source_allowlist)) {
    hold(receipt, "source_allowlist_required");
  } else {
    const matches = input.source_allowlist.filter((lane) =>
      lane?.classification === "public"
      && lane.repo === source.repo
      && lane.ref === source.ref
      && lane.source_lane === source.source_lane
      && typeof lane.repo_path === "string"
      && resolve(lane.repo_path) === resolve(source.repo_path));
    if (matches.length !== 1) hold(receipt, "source_lane_not_exactly_allowlisted");
  }
  if (cursor.repo !== source.repo || cursor.ref !== source.ref
      || cursor.source_lane !== source.source_lane) {
    hold(receipt, "cursor_identity_tuple_mismatch");
  }
  if (cursor.last_successful_source_commit !== source.baseline) {
    hold(receipt, "baseline_cursor_mismatch");
  }
  if (!Array.isArray(input.ledger_records)) hold(receipt, "ledger_records_array_required");

  let recordedAt;
  try {
    recordedAt = normalizeIso(input.recorded_at, "recorded_at");
  } catch (error) {
    hold(receipt, publicErrorCode(error));
  }

  if (receipt.hold_reasons.length) {
    receipt.counts.hold = receipt.hold_reasons.length;
    return receipt;
  }

  const repoPath = resolve(source.repo_path);
  let baseline;
  let target;
  let refTip;
  try {
    baseline = resolveCommit(repoPath, source.baseline, "baseline");
    target = resolveCommit(repoPath, source.candidate_target, "candidate_target");
    refTip = resolveRef(repoPath, source.ref);
  } catch (error) {
    hold(receipt, publicErrorCode(error, "source_revision_resolution_failed"));
    receipt.counts.hold = receipt.hold_reasons.length;
    return receipt;
  }
  receipt.source_cursor.before = baseline;
  receipt.source_cursor.candidate_target = target;
  receipt.range.exclusive = baseline;
  receipt.range.inclusive = target;

  if (target !== refTip) hold(receipt, "candidate_target_ref_mismatch");
  try {
    if (!isAncestor(repoPath, baseline, target)) hold(receipt, "baseline_not_ancestor_history_rewrite");
    if (source.expected_ref_tip) {
      const expectedTip = resolveCommit(repoPath, source.expected_ref_tip, "expected_ref_tip");
      if (!isAncestor(repoPath, expectedTip, target)) hold(receipt, "non_fast_forward_ref_observation");
    }
  } catch (error) {
    hold(receipt, publicErrorCode(error, "source_topology_check_failed"));
  }

  if (receipt.hold_reasons.length) {
    receipt.counts.hold = receipt.hold_reasons.length;
    return receipt;
  }

  let commits;
  try {
    commits = git(repoPath, ["rev-list", "--reverse", "--topo-order", `${baseline}..${target}`])
      .trim().split("\n").filter(Boolean);
  } catch (error) {
    hold(receipt, publicErrorCode(error, "source_history_read_failed"));
    receipt.counts.hold = receipt.hold_reasons.length;
    return receipt;
  }
  receipt.range.commits = commits;

  const ledgerById = new Map();
  for (const record of input.ledger_records) {
    if (!record || typeof record !== "object" || typeof record.id !== "string") continue;
    const records = ledgerById.get(record.id) || [];
    records.push(record);
    ledgerById.set(record.id, records);
  }

  const missingRecords = [];
  for (const commit of commits) {
    let metadata;
    try {
      metadata = commitMetadata(repoPath, commit);
    } catch (error) {
      hold(receipt, publicErrorCode(error, "source_commit_metadata_failed"));
      break;
    }
    if (hasExactSelfLoopMarker(metadata.message, source)) {
      receipt.counts.excluded_self_loop += 1;
      continue;
    }
    const id = makeIdentity(source, metadata.commit);
    const existingMatches = ledgerById.get(id) || [];
    if (existingMatches.length > 1) {
      const existingDigests = new Set(existingMatches.map(canonicalRecordDigest));
      if (existingDigests.size > 1) {
        hold(receipt, `duplicate_ledger_identity_conflict:${id}`);
        continue;
      }
    }
    const existing = existingMatches[0];
    const expected = expectedRecord(
      source,
      metadata,
      recordedAt,
      existing?.recorded_at ?? existing?.at,
    );
    const expectedDigest = canonicalRecordDigest(expected);
    if (!existing) {
      receipt.counts.missing += 1;
      missingRecords.push(expected);
      receipt.digests.push({ id, digest: expectedDigest, disposition: "missing" });
      continue;
    }
    const actualDigest = canonicalRecordDigest(existing);
    if (actualDigest !== expectedDigest) {
      hold(receipt, `identity_digest_conflict:${id}`);
      receipt.digests.push({ id, digest: actualDigest, disposition: "hold" });
      continue;
    }
    receipt.counts.duplicate += 1;
    receipt.digests.push({ id, digest: actualDigest, disposition: "duplicate" });
  }

  receipt.range.digest = `sha256:${sha256(commits.join("\n"))}`;
  try {
    if (resolveRef(repoPath, source.ref) !== target) hold(receipt, "source_ref_moved_during_scan");
  } catch (error) {
    hold(receipt, publicErrorCode(error, "source_ref_recheck_failed"));
  }
  const boundary = attestationsComplete(
    input.success_evidence,
    target,
    receipt.counts.missing + receipt.counts.duplicate,
  );
  receipt.advance_boundary = {
    validation_success: boundary.validation,
    commit_success: boundary.commit,
    push_success: boundary.push,
    satisfied: boundary.complete && receipt.hold_reasons.length === 0,
  };

  if (receipt.hold_reasons.length) {
    receipt.counts.hold = receipt.hold_reasons.length;
    receipt.counts.generated = 0;
    receipt.records_to_append = [];
    return receipt;
  }

  receipt.status = boundary.complete ? "READY_TO_ADVANCE" : "PLANNED_NO_ADVANCE";
  receipt.records_to_append = missingRecords;
  receipt.counts.generated = missingRecords.length;
  receipt.source_cursor.after = boundary.complete ? target : baseline;
  return receipt;
}

function parseCli(argv) {
  let inputPath = "-";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input") {
      if (!argv[i + 1]) throw codedError("input_path_required");
      inputPath = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--help") {
      return { help: true };
    } else {
      throw codedError("unknown_argument");
    }
  }
  return { inputPath };
}

function cli() {
  try {
    const args = parseCli(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(
        "Usage: node five_field_cursor_sweep.mjs [--input <public-safe-json-file|->]\n"
        + "Feature-OFF planner; prints a receipt and performs no writes.\n",
      );
      return;
    }
    let text;
    try {
      text = args.inputPath === "-"
        ? readFileSync(0, "utf8")
        : readFileSync(resolve(args.inputPath), "utf8");
    } catch {
      throw codedError("input_read_failed");
    }
    let input;
    try {
      input = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
      throw codedError("input_json_invalid");
    }
    const receipt = planCursorSweep(input);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.exitCode = receipt.status === "HOLD" ? 2 : 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: publicErrorCode(error, "internal_cli_error"),
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) cli();
