#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { canonicalJson, sha256Canonical } from "../shared/project_history_envelope.mjs";

export const LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA = "soulforge.ingress.legacy_mail_merge_descriptor.v1";
export const LEGACY_MAIL_MERGE_MANIFEST_SCHEMA = "soulforge.ingress.legacy_mail_merge_manifest.v1";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SOURCE_KINDS = Object.freeze([
  "hpp_eml_current",
  "gateway_normalized_attachments",
  "erp_legacy_body_preview",
  "metadata_only",
]);
const SOURCE_RANK = new Map(SOURCE_KINDS.map((kind, index) => [kind, index]));
const TOP_FIELDS = Object.freeze(["records", "schema_version"]);
const RECORD_FIELDS = Object.freeze([
  "attachment_set_digest",
  "conservative_fingerprint_digest",
  "content_digest",
  "event_id_digest",
  "provider_id_digest",
  "source_kind",
]);

export class LegacyMailMergeManifestError extends Error {
  constructor(code) {
    super(code);
    this.name = "LegacyMailMergeManifestError";
    this.code = code;
  }
}

function fail(code) {
  throw new LegacyMailMergeManifestError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactFields(value, fields, code) {
  if (!isPlainObject(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function nullableDigest(value, code) {
  if (value !== null && (typeof value !== "string" || !DIGEST.test(value))) fail(code);
  return value;
}

function validateRecord(record) {
  exactFields(record, RECORD_FIELDS, "legacy_mail_record_fields_invalid");
  if (!SOURCE_RANK.has(record.source_kind)) fail("legacy_mail_source_kind_invalid");
  for (const field of RECORD_FIELDS.filter((field) => field.endsWith("_digest"))) {
    nullableDigest(record[field], "legacy_mail_digest_invalid");
  }
  if (!record.event_id_digest && !record.provider_id_digest && !record.conservative_fingerprint_digest) {
    fail("legacy_mail_identity_missing");
  }
  const contentRequired = record.source_kind !== "metadata_only";
  if ((record.content_digest !== null) !== contentRequired) fail("legacy_mail_source_quality_invalid");
  const attachmentRequired = record.source_kind === "gateway_normalized_attachments";
  if ((record.attachment_set_digest !== null) !== attachmentRequired) fail("legacy_mail_source_quality_invalid");
  return Object.freeze({ ...record, record_digest: sha256Canonical(record) });
}

function emptySourceCounts() {
  return Object.fromEntries(SOURCE_KINDS.map((kind) => [kind, 0]));
}

function unionFind(size) {
  const parent = Array.from({ length: size }, (_, index) => index);
  const find = (value) => {
    while (parent[value] !== value) {
      parent[value] = parent[parent[value]];
      value = parent[value];
    }
    return value;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  return { find, union };
}

function unionExactMatches(records, field, graph) {
  const firstByDigest = new Map();
  const countByDigest = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const digest = records[index][field];
    if (!digest) continue;
    countByDigest.set(digest, (countByDigest.get(digest) ?? 0) + 1);
    if (firstByDigest.has(digest)) graph.union(firstByDigest.get(digest), index);
    else firstByDigest.set(digest, index);
  }
  return [...countByDigest.values()].filter((count) => count > 1).length;
}

function preferredRecord(records) {
  return [...records].sort((left, right) => (
    SOURCE_RANK.get(left.source_kind) - SOURCE_RANK.get(right.source_kind)
    || left.record_digest.localeCompare(right.record_digest)
  ))[0];
}

export function buildLegacyMailMergeManifest(descriptor) {
  exactFields(descriptor, TOP_FIELDS, "legacy_mail_descriptor_fields_invalid");
  if (descriptor.schema_version !== LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA) {
    fail("legacy_mail_descriptor_schema_invalid");
  }
  if (!Array.isArray(descriptor.records) || descriptor.records.length === 0) {
    fail("legacy_mail_records_required");
  }
  const records = descriptor.records.map(validateRecord).sort((left, right) => (
    left.record_digest.localeCompare(right.record_digest)
  ));
  const sourceCounts = emptySourceCounts();
  for (const record of records) sourceCounts[record.source_kind] += 1;

  const graph = unionFind(records.length);
  const eventIdGroupCount = unionExactMatches(records, "event_id_digest", graph);
  const providerIdGroupCount = unionExactMatches(records, "provider_id_digest", graph);
  const componentsByRoot = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const root = graph.find(index);
    if (!componentsByRoot.has(root)) componentsByRoot.set(root, []);
    componentsByRoot.get(root).push(records[index]);
  }
  const components = [...componentsByRoot.entries()];
  const preferredSourceCounts = emptySourceCounts();
  for (const [, componentRecords] of components) {
    preferredSourceCounts[preferredRecord(componentRecords).source_kind] += 1;
  }

  const rootsByFingerprint = new Map();
  for (const [root, componentRecords] of components) {
    for (const digest of new Set(componentRecords.map((record) => record.conservative_fingerprint_digest).filter(Boolean))) {
      if (!rootsByFingerprint.has(digest)) rootsByFingerprint.set(digest, new Set());
      rootsByFingerprint.get(digest).add(root);
    }
  }
  const ambiguousFingerprintGroups = [...rootsByFingerprint.values()].filter((roots) => roots.size > 1);
  const ambiguousRoots = new Set(ambiguousFingerprintGroups.flatMap((roots) => [...roots]));
  const exactDuplicateRecordCount = records.length - components.length;
  const exactMatchGroupCount = components.filter(([, componentRecords]) => componentRecords.length > 1).length;

  const manifest = {
    schema_version: LEGACY_MAIL_MERGE_MANIFEST_SCHEMA,
    mode: "dry_run_only",
    status: "planned_no_write",
    descriptor_digest: sha256Canonical(descriptor),
    source_quality_precedence: [...SOURCE_KINDS],
    inventory: {
      record_count: records.length,
      source_counts: sourceCounts,
    },
    dedupe_plan: {
      exact_event_id_group_count: eventIdGroupCount,
      exact_provider_id_group_count: providerIdGroupCount,
      exact_match_group_count: exactMatchGroupCount,
      exact_duplicate_record_count: exactDuplicateRecordCount,
      planned_distinct_record_count: components.length,
      conservative_fingerprint_automatic_merge_count: 0,
      ambiguous_fingerprint_group_count: ambiguousFingerprintGroups.length,
      ambiguous_distinct_record_count: ambiguousRoots.size,
    },
    action_plan: {
      future_retain_preferred_count: components.length,
      future_skip_exact_duplicate_count: exactDuplicateRecordCount,
      future_review_ambiguous_fingerprint_group_count: ambiguousFingerprintGroups.length,
      preferred_source_counts: preferredSourceCounts,
      live_apply_authorized: false,
    },
    no_copy_no_write_proof: {
      explicit_descriptor_files_read: 1,
      source_payload_files_read: 0,
      root_searches: 0,
      filesystem_copies: 0,
      filesystem_writes: 0,
      collector_invocations: 0,
      writer_or_scheduler_changes: 0,
      output_surface: "stdout_sanitized_json_only",
    },
  };
  return Object.freeze({ ...manifest, manifest_digest: sha256Canonical(manifest) });
}

function parseArgs(argv) {
  if (argv.length === 1 && new Set(["--help", "-h"]).has(argv[0])) return { help: true };
  if (argv.length !== 2 || argv[0] !== "--input" || !argv[1] || argv[1].startsWith("--")) {
    fail("legacy_mail_cli_arguments_invalid");
  }
  return { help: false, input: argv[1] };
}

export async function runLegacyMailMergeManifestCli(argv = process.argv.slice(2), io = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    return {
      schema_version: LEGACY_MAIL_MERGE_MANIFEST_SCHEMA,
      mode: "help",
      status: "no_write",
      usage: "legacy-mail-merge-manifest --input <one-explicit-sanitized-json-descriptor>",
      live_apply_available: false,
    };
  }
  let document;
  try {
    document = JSON.parse(await readFile(options.input, "utf8"));
  } catch {
    fail("legacy_mail_descriptor_read_or_parse_failed");
  }
  const manifest = buildLegacyMailMergeManifest(document);
  if (io.stdout) io.stdout.write(`${canonicalJson(manifest)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runLegacyMailMergeManifestCli();
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      schema_version: LEGACY_MAIL_MERGE_MANIFEST_SCHEMA,
      mode: "dry_run_only",
      status: "blocked_no_write",
      code: error instanceof LegacyMailMergeManifestError ? error.code : "legacy_mail_manifest_failed",
    })}\n`);
    process.exitCode = 1;
  }
}
