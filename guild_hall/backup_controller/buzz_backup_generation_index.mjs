/**
 * Buzz backup-generation indexer.
 *
 * The Buzz relay already backs itself up: `BuzzBackup-Daily` writes into
 * `<buzz_root>/backup/{postgres,redis,minio,git}` and appends a line to
 * `<buzz_root>/logs/backup/receipts.jsonl`. That is a real backup Soulforge
 * does not own and must not disturb. What Soulforge lacked was any record
 * that it exists, so this module reads it and writes an index.
 *
 * What it does NOT do, deliberately:
 *  - it never copies a backup byte. `claim_ceiling: "index_only"` is in the
 *    output because an index is not a backup and must never be counted as one;
 *  - it never writes, renames, or deletes anything under `<buzz_root>`;
 *  - it never opens a credential-shaped file, only names it;
 *  - it never asserts that a restore works. The Buzz controller's own weekly
 *    restore test is *observed* and recorded as an observation, not emitted as
 *    a `restore_test` lane record — Soulforge performed no isolated restore
 *    and holds no readback digest, and inventing one would be exactly the
 *    fabricated evidence the source-lane contract exists to refuse.
 *
 * The `backup_generation_pointer` it emits is a real
 * `soulforge.source_lane_index.v0` record and is therefore withheld unless the
 * caller supplies the collection `generation_seq` the backup covers. There is
 * no default and no guess.
 *
 * Independent of the `backup_controller` v1 binding: this module reads its
 * roots from arguments only.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export const BUZZ_BACKUP_INDEX_SCHEMA = "soulforge.backup_controller.buzz_backup_generation_index.v0";
export const BUZZ_RESTORE_OBSERVATION_SCHEMA = "soulforge.backup_controller.buzz_restore_test_observation.v0";
export const BUZZ_SOURCE_REF = "source.buzz";

// The four streams the Buzz controller maintains, and the receipt key each one
// reports its digest under. `postgres` is `pg_digest`, not `postgres_digest`.
export const BUZZ_BACKUP_STREAMS = Object.freeze([
  { stream: "postgres", receipt_digest_key: "pg_digest", receipt_bytes_key: "pg_bytes" },
  { stream: "redis", receipt_digest_key: "redis_digest", receipt_bytes_key: null },
  { stream: "minio", receipt_digest_key: "minio_digest", receipt_bytes_key: null },
  { stream: "git", receipt_digest_key: "git_digest", receipt_bytes_key: null },
]);

export const BUZZ_BACKUP_INDEX_GAPS = Object.freeze([
  "file_digest_unreceipted",
  "receipt_digest_unmatched",
  "receipts_log_missing",
  "restore_test_never_observed",
  "retention_window_only",
  "secret_named_file_skipped",
  "stream_missing",
  "total_bytes_bound_reached",
  "unparsable_receipt_line",
]);

const RECEIPT_DIGEST_PREFIX = /^[0-9a-f]{8,64}$/u;
const STAMP = /^\d{8}T\d{6}Z$/u;
const SECRET_NAME = /(?:^|[.\-_])(?:env|secret|secrets|token|tokens|password|passwords|credential|credentials|api[_-]?key)(?:$|[.\-_])|^\.env|auth\.(?:json|lock)$|\.(?:pem|p12|pfx|key)$/iu;

// Bounds. The relay's own retention is 14 generations per stream (5 present at
// the last observation), so these are far above the real tree and exist only
// so a surprise cannot make the indexer run unbounded.
const MAX_FILES = 20_000;
const MAX_DEPTH = 6;
const MAX_RECEIPT_LINE_BYTES = 65_536;
const MAX_RECEIPTS_LOG_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024 * 1024;

export class BuzzBackupIndexError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "BuzzBackupIndexError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BuzzBackupIndexError(code, message);
}

// A local canonical serializer, kept local on purpose: `backup_controller`
// modules are self-contained and this one must not acquire a new module
// dependency to hash a plain record. Same rules the rest of Soulforge uses —
// sorted keys, NFC strings, safe integers only.
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("canonical_number_invalid", "Only safe integers can be hashed");
    return String(value);
  }
  if (typeof value === "string") {
    if (value.normalize("NFC") !== value) fail("canonical_string_invalid", "Strings must already be NFC");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return fail("canonical_value_invalid", "Unsupported canonical value");
}

export function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(Buffer.from(canonicalJson(value), "utf8")).digest("hex")}`;
}

export function stampFor(date) {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d+Z$/u, "Z");
}

// The stamp is a path segment and keeps the `20260903T001500Z` form the rest
// of `backup_controller` uses. A `soulforge.source_lane_index.v0` ref may not
// contain uppercase, so the ref carries the same stamp lowercased; uppercasing
// it recovers the directory name exactly.
export function generationRefFor(stamp) {
  return `backup.buzz.controller.${stamp.toLowerCase()}`;
}

async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

// The Buzz controller root is read-only to this module, but it is still a path
// the caller supplied, so it is resolved and checked like any other.
async function canonicalExistingDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail("absolute_path_required", `${label} must be an absolute path`);
  }
  const stat = await lstatOrNull(value);
  if (stat === null || !stat.isDirectory() || stat.isSymbolicLink()) {
    fail("directory_required", `${label} must be an existing normal directory`);
  }
  const canonical = await realpath(value);
  if (path.resolve(canonical).toLowerCase() !== path.resolve(value).toLowerCase()) {
    fail("canonical_path_required", `${label} must not resolve through an alias`);
  }
  return canonical;
}

function pathsOverlap(left, right) {
  const normalize = (value) => (
    process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value)
  );
  const within = (parent, candidate) => {
    const relative = path.relative(normalize(parent), normalize(candidate));
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  return within(left, right) || within(right, left);
}

export function parseBuzzBackupReceipts(text) {
  const backups = [];
  const restoreTests = [];
  let unparsable = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (Buffer.byteLength(line, "utf8") > MAX_RECEIPT_LINE_BYTES) {
      unparsable += 1;
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      unparsable += 1;
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      unparsable += 1;
      continue;
    }
    // Two line shapes, told apart by which key they carry. Anything else is
    // counted, not guessed at.
    if (Object.hasOwn(parsed, "restore_test")) restoreTests.push(parsed);
    else if (Object.hasOwn(parsed, "backup")) backups.push(parsed);
    else unparsable += 1;
  }
  return { backups, restore_tests: restoreTests, unparsable_lines: unparsable };
}

function receiptDigestPrefixes(backups, receiptKey) {
  const prefixes = new Map();
  for (const receipt of backups) {
    const value = receipt[receiptKey];
    if (typeof value !== "string") continue;
    const normalized = value.toLowerCase();
    if (!RECEIPT_DIGEST_PREFIX.test(normalized)) continue;
    if (!prefixes.has(normalized)) prefixes.set(normalized, []);
    prefixes.get(normalized).push(typeof receipt.backup === "string" ? receipt.backup : null);
  }
  return prefixes;
}

async function hashFile(target) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(target), hash);
  return hash.digest("hex");
}

async function walkStream(root, gaps) {
  const files = [];
  const skippedSecretNames = [];
  async function visit(directory, prefix, depth) {
    if (depth > MAX_DEPTH) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      const target = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await visit(target, relative, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SECRET_NAME.test(entry.name)) {
        // Named, never opened, never hashed.
        skippedSecretNames.push(relative.normalize("NFC"));
        gaps.add("secret_named_file_skipped");
        continue;
      }
      files.push({ relative: relative.normalize("NFC"), absolute: target });
    }
  }
  await visit(root, "", 0);
  return { files, skipped_secret_names: skippedSecretNames.sort() };
}

export async function buildBuzzBackupIndex({
  buzz_root: buzzRoot,
  stamp,
  now = () => new Date(),
  max_total_bytes: maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
}) {
  if (typeof stamp !== "string" || !STAMP.test(stamp)) {
    fail("stamp_invalid", "Expected a YYYYMMDDTHHMMSSZ stamp");
  }
  const root = await canonicalExistingDirectory(buzzRoot, "buzz_root");
  const gaps = new Set(["retention_window_only"]);

  const receiptsPath = path.join(root, "logs", "backup", "receipts.jsonl");
  let receipts = { backups: [], restore_tests: [], unparsable_lines: 0 };
  const receiptsStat = await lstatOrNull(receiptsPath);
  if (receiptsStat === null || !receiptsStat.isFile() || receiptsStat.isSymbolicLink()) {
    gaps.add("receipts_log_missing");
  } else if (receiptsStat.size > MAX_RECEIPTS_LOG_BYTES) {
    fail("receipts_log_too_large", "Receipts log exceeds the readable bound");
  } else {
    receipts = parseBuzzBackupReceipts(await readFile(receiptsPath, "utf8"));
    if (receipts.unparsable_lines > 0) gaps.add("unparsable_receipt_line");
  }
  if (receipts.restore_tests.length === 0) gaps.add("restore_test_never_observed");

  let totalBytes = 0;
  const streams = [];
  for (const spec of BUZZ_BACKUP_STREAMS) {
    const streamRoot = path.join(root, "backup", spec.stream);
    const streamStat = await lstatOrNull(streamRoot);
    if (streamStat === null || !streamStat.isDirectory() || streamStat.isSymbolicLink()) {
      gaps.add("stream_missing");
      streams.push({
        stream: spec.stream,
        present: false,
        file_count: 0,
        total_bytes: 0,
        files: [],
        skipped_secret_names: [],
        receipt_digest_prefixes: 0,
        receipt_digests_matched: 0,
      });
      continue;
    }
    const walked = await walkStream(streamRoot, gaps);
    const prefixes = receiptDigestPrefixes(receipts.backups, spec.receipt_digest_key);
    const matchedPrefixes = new Set();
    const files = [];
    let streamBytes = 0;
    for (const entry of walked.files) {
      const stat = await lstatOrNull(entry.absolute);
      if (stat === null || !stat.isFile() || stat.isSymbolicLink()) continue;
      let sha256 = null;
      if (totalBytes + stat.size > maxTotalBytes) {
        gaps.add("total_bytes_bound_reached");
      } else {
        sha256 = await hashFile(entry.absolute);
        totalBytes += stat.size;
      }
      let matchedPrefix = null;
      if (sha256 !== null) {
        for (const prefix of prefixes.keys()) {
          if (sha256.startsWith(prefix)) {
            matchedPrefix = prefix;
            matchedPrefixes.add(prefix);
            break;
          }
        }
        if (matchedPrefix === null) gaps.add("file_digest_unreceipted");
      }
      streamBytes += stat.size;
      files.push({
        name: entry.relative,
        bytes: stat.size,
        modified_at: new Date(stat.mtimeMs).toISOString(),
        // `null` when the byte bound stopped this file from being hashed: the
        // index says so rather than reporting a digest it did not compute.
        sha256: sha256 === null ? null : `sha256:${sha256}`,
        receipt_digest_prefix: matchedPrefix,
        digest_verified: matchedPrefix !== null,
      });
    }
    if (matchedPrefixes.size < prefixes.size) gaps.add("receipt_digest_unmatched");
    streams.push({
      stream: spec.stream,
      present: true,
      file_count: files.length,
      total_bytes: streamBytes,
      files,
      skipped_secret_names: walked.skipped_secret_names,
      receipt_digest_prefixes: prefixes.size,
      receipt_digests_matched: matchedPrefixes.size,
    });
  }

  const backupTimestamps = receipts.backups
    .map((receipt) => receipt.backup)
    .filter((value) => typeof value === "string")
    .sort();
  const inventory = streams.map((stream) => ({
    stream: stream.stream,
    present: stream.present,
    files: stream.files.map((file) => ({
      name: file.name, bytes: file.bytes, sha256: file.sha256, digest_verified: file.digest_verified,
    })),
  }));

  const index = {
    schema_version: BUZZ_BACKUP_INDEX_SCHEMA,
    // An index is not a backup. Nothing downstream may promote this record to
    // backup evidence on its own.
    claim_ceiling: "index_only",
    source_ref: BUZZ_SOURCE_REF,
    generation_ref: generationRefFor(stamp),
    stamp,
    indexed_at: now().toISOString(),
    bytes_duplicated: 0,
    controller: {
      backup_receipts_observed: receipts.backups.length,
      restore_test_receipts_observed: receipts.restore_tests.length,
      unparsable_receipt_lines: receipts.unparsable_lines,
      earliest_backup_at: backupTimestamps[0] ?? null,
      latest_backup_at: backupTimestamps[backupTimestamps.length - 1] ?? null,
    },
    streams,
    file_count: streams.reduce((total, stream) => total + stream.file_count, 0),
    total_bytes: streams.reduce((total, stream) => total + stream.total_bytes, 0),
    verified_file_count: streams.reduce(
      (total, stream) => total + stream.files.filter((file) => file.digest_verified).length, 0,
    ),
    content_digest: canonicalDigest(inventory),
    coverage_gaps: [...gaps].sort(),
  };
  // The parsed receipts ride alongside the index rather than inside it: the
  // index is written to disk and has no business carrying the controller's
  // raw log lines.
  return { index, receipts };
}

// A real `soulforge.source_lane_index.v0` backup_generation_pointer. It is
// withheld, never invented, when the caller cannot say which collection
// generation the backup covers.
export function buildBackupGenerationPointer({ index, generation_seq: generationSeq }) {
  if (!Number.isSafeInteger(generationSeq) || generationSeq < 1) {
    fail("generation_seq_required", "A backup pointer needs the collection generation it covers");
  }
  const backedUpAt = index.controller.latest_backup_at ?? index.indexed_at;
  if (typeof backedUpAt !== "string" || !Number.isFinite(Date.parse(backedUpAt))) {
    fail("backed_up_at_invalid", "The pointer needs a real backup instant");
  }
  return {
    record_kind: "backup_generation_pointer",
    source_ref: BUZZ_SOURCE_REF,
    generation_seq: generationSeq,
    backup_generation_ref: index.generation_ref,
    content_digest: index.content_digest,
    backed_up_at: backedUpAt,
  };
}

// Deliberately NOT a `restore_test` lane record. Soulforge performed no
// isolated restore and holds no readback digest; this states what the Buzz
// controller's own weekly test reported and what is still missing before a
// lane record could honestly exist.
export function buildRestoreTestObservation({ index, restore_tests: restoreTests }) {
  const observed = restoreTests
    .filter((receipt) => typeof receipt.restore_test === "string")
    .sort((left, right) => left.restore_test.localeCompare(right.restore_test));
  const latest = observed[observed.length - 1] ?? null;
  return {
    schema_version: BUZZ_RESTORE_OBSERVATION_SCHEMA,
    claim_ceiling: "observed",
    source_ref: BUZZ_SOURCE_REF,
    backup_generation_ref: index.generation_ref,
    stamp: index.stamp,
    observed_at: index.indexed_at,
    controller_restore_tests_observed: observed.length,
    latest_controller_restore_test_at: latest === null ? null : latest.restore_test,
    latest_controller_restore_test_state: latest === null ? null
      : (typeof latest.state === "string" ? latest.state : null),
    // The three things that must exist before a `restore_test` lane record
    // could be emitted without fabricating evidence.
    soulforge_isolated_restore_performed: false,
    readback_digest: null,
    human_acceptance_state: "pending",
    blocking_reasons: [
      "no_isolated_restore_root",
      "no_readback_digest",
      "no_human_acceptance",
    ],
  };
}

async function writeCreateOnly(target, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await mkdir(path.dirname(target), { recursive: true });
  const existing = await lstatOrNull(target);
  if (existing !== null) {
    fail("output_exists", "Index outputs are create-only and this stamp already exists");
  }
  const temporary = `${target}.tmp-${process.pid}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return { path: target, bytes: bytes.length };
}

export async function runBuzzBackupGenerationIndex({
  buzz_root: buzzRoot,
  data_root: dataRoot,
  generation_seq: generationSeq = null,
  apply = false,
  stamp = null,
  now = () => new Date(),
  max_total_bytes: maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
}) {
  if (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)) {
    fail("absolute_path_required", "data_root must be an absolute path");
  }
  if (pathsOverlap(buzzRoot, dataRoot)) {
    fail("roots_overlap", "The Buzz controller root and the index data root must be disjoint");
  }
  const effectiveStamp = stamp ?? stampFor(now());
  const { index, receipts } = await buildBuzzBackupIndex({
    buzz_root: buzzRoot, stamp: effectiveStamp, now, max_total_bytes: maxTotalBytes,
  });
  const restoreObservation = buildRestoreTestObservation({
    index, restore_tests: receipts.restore_tests,
  });

  let pointer = null;
  const withheld = [];
  if (generationSeq === null) {
    withheld.push("backup_generation_pointer_withheld_no_collection_generation");
  } else {
    pointer = buildBackupGenerationPointer({ index, generation_seq: generationSeq });
  }

  const targets = {
    index: path.join(dataRoot, "60_BACKUP_GENERATIONS", "buzz", `buzz-controller-${effectiveStamp}`, "index.json"),
    restore_observation: path.join(dataRoot, "10_SOURCE_CAPTURE_CATALOG", "buzz", "restore-tests", `${effectiveStamp}.json`),
    pointer: path.join(dataRoot, "10_SOURCE_CAPTURE_CATALOG", "buzz", "backup-generation-refs", `${effectiveStamp}.json`),
  };

  if (!apply) {
    return {
      mode: "plan",
      written: false,
      stamp: effectiveStamp,
      generation_ref: index.generation_ref,
      content_digest: index.content_digest,
      file_count: index.file_count,
      total_bytes: index.total_bytes,
      verified_file_count: index.verified_file_count,
      bytes_duplicated: 0,
      coverage_gaps: index.coverage_gaps,
      withheld,
      would_write: pointer === null
        ? [targets.index, targets.restore_observation]
        : [targets.index, targets.restore_observation, targets.pointer],
      index,
      restore_observation: restoreObservation,
      backup_generation_pointer: pointer,
    };
  }

  const written = [];
  written.push(await writeCreateOnly(targets.index, index));
  written.push(await writeCreateOnly(targets.restore_observation, restoreObservation));
  if (pointer !== null) written.push(await writeCreateOnly(targets.pointer, pointer));

  return {
    mode: "apply",
    written: true,
    stamp: effectiveStamp,
    generation_ref: index.generation_ref,
    content_digest: index.content_digest,
    file_count: index.file_count,
    total_bytes: index.total_bytes,
    verified_file_count: index.verified_file_count,
    bytes_duplicated: 0,
    coverage_gaps: index.coverage_gaps,
    withheld,
    written_paths: written.map((entry) => entry.path),
    index,
    restore_observation: restoreObservation,
    backup_generation_pointer: pointer,
  };
}
