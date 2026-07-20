#!/usr/bin/env node

import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalJson, sha256Canonical } from "../shared/project_history_envelope.mjs";
import {
  buildLegacyMailMergeManifest,
  LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA,
  LEGACY_MAIL_MERGE_MANIFEST_SCHEMA,
} from "./legacy_mail_merge_manifest.mjs";

export const LEGACY_MAIL_SOURCE_BINDING_SCHEMA = "soulforge.ingress.legacy_mail_source_binding.v1";

const RAW_SHA256 = /^[0-9a-f]{64}$/u;
const EMAIL_EVENT_FIELDS = Object.freeze([
  "attachments", "body_html", "body_text", "cc", "event_id", "from", "ingest_status",
  "ingested_at", "metadata", "provider_message_id", "raw", "received_at", "schema_version",
  "source", "subject", "thread_id", "to",
]);
const ADDRESS_FIELDS = Object.freeze(["address", "name"]);
const ATTACHMENT_FIELDS = Object.freeze([
  "content_sha256", "local_path", "metadata", "mime", "name", "provider_attachment_id",
  "size", "type", "url",
]);
const CUSTODY_FIELDS = Object.freeze([
  "eml_sha256", "eml_size", "event_id", "match_method", "provider_id_sha256",
  "storage_ref", "verified",
]);
const ERP_FIELDS = new Set([
  "at", "body_preview", "body_text", "counterpart", "data_label", "direction", "dup_of",
  "hidden", "id", "mailbox", "pointer_ref", "project_id", "provider_message_id",
  "recipient_role", "source_ref", "stage_code", "subject",
]);

export class LegacyMailDescriptorProducerError extends Error {
  constructor(code) {
    super(code);
    this.name = "LegacyMailDescriptorProducerError";
    this.code = code;
  }
}

function fail(code) {
  throw new LegacyMailDescriptorProducerError(code);
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

function nonemptyString(value, code) {
  if (typeof value !== "string" || !value.trim()) fail(code);
  return value;
}

function nullableString(value, code) {
  if (value !== null && typeof value !== "string") fail(code);
  return value;
}

function rawDigest(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function bytesDigest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function statFingerprint(info) {
  return [info.dev, info.ino, info.size, info.mtimeNs].map(String).join(":");
}

async function readHandleBytes(handle, size) {
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) fail("legacy_mail_source_read_or_parse_failed");
  const buffer = Buffer.alloc(Number(size));
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) fail("legacy_mail_source_identity_changed");
    offset += bytesRead;
  }
  return buffer;
}

async function readStableBytes(path, errorCode) {
  let handle;
  try {
    handle = await open(path, "r");
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail(errorCode);
    const first = await readHandleBytes(handle, before.size);
    const middle = await handle.stat({ bigint: true });
    if (statFingerprint(before) !== statFingerprint(middle)) fail("legacy_mail_source_identity_changed");
    const second = await readHandleBytes(handle, before.size);
    const after = await handle.stat({ bigint: true });
    const pathAfter = await stat(path, { bigint: true });
    const stableFingerprint = statFingerprint(before);
    if (
      stableFingerprint !== statFingerprint(after)
      || stableFingerprint !== statFingerprint(pathAfter)
      || bytesDigest(first) !== bytesDigest(second)
    ) fail("legacy_mail_source_identity_changed");
    return first;
  } catch (error) {
    if (error instanceof LegacyMailDescriptorProducerError) throw error;
    fail(errorCode);
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function decodeJson(bytes, code) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(code);
  }
}

function decodeJsonl(bytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("legacy_mail_source_read_or_parse_failed");
  }
  const rows = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      fail("legacy_mail_source_read_or_parse_failed");
    }
  }
  return rows;
}

function explicitJsonlPath(value) {
  nonemptyString(value, "legacy_mail_binding_path_invalid");
  if (!isAbsolute(value) || /(^|[\\/])\.\.([\\/]|$)/u.test(value) || !value.toLowerCase().endsWith(".jsonl")) {
    fail("legacy_mail_binding_path_invalid");
  }
  return normalize(value);
}

function pathArray(value) {
  if (!Array.isArray(value) || value.length === 0) fail("legacy_mail_binding_files_required");
  return value.map(explicitJsonlPath).sort((left, right) => left.localeCompare(right));
}

function validateBinding(value) {
  exactFields(value, ["erp", "gateway", "hpp", "schema_version"], "legacy_mail_binding_fields_invalid");
  if (value.schema_version !== LEGACY_MAIL_SOURCE_BINDING_SCHEMA) fail("legacy_mail_binding_schema_invalid");
  exactFields(value.hpp, ["custody_index_file", "event_files"], "legacy_mail_binding_hpp_fields_invalid");
  exactFields(value.gateway, ["event_files"], "legacy_mail_binding_gateway_fields_invalid");
  exactFields(value.erp, ["normalized_files"], "legacy_mail_binding_erp_fields_invalid");
  const binding = {
    hpp: {
      event_files: pathArray(value.hpp.event_files),
      custody_index_file: explicitJsonlPath(value.hpp.custody_index_file),
    },
    gateway: { event_files: pathArray(value.gateway.event_files) },
    erp: { normalized_files: pathArray(value.erp.normalized_files) },
  };
  const allPaths = [
    ...binding.hpp.event_files, binding.hpp.custody_index_file,
    ...binding.gateway.event_files, ...binding.erp.normalized_files,
  ];
  const keys = allPaths.map((item) => process.platform === "win32" ? item.toLowerCase() : item);
  if (new Set(keys).size !== keys.length) fail("legacy_mail_binding_file_duplicate");
  return binding;
}

function validateAddress(value) {
  exactFields(value, ADDRESS_FIELDS, "legacy_mail_email_event_address_invalid");
  if (typeof value.name !== "string" || typeof value.address !== "string") fail("legacy_mail_email_event_address_invalid");
}

function validateAttachment(value) {
  exactFields(value, ATTACHMENT_FIELDS, "legacy_mail_email_event_attachment_invalid");
  nonemptyString(value.type, "legacy_mail_email_event_attachment_invalid");
  for (const field of ["content_sha256", "local_path", "mime", "name", "provider_attachment_id", "url"]) {
    nullableString(value[field], "legacy_mail_email_event_attachment_invalid");
  }
  if (value.size !== null && (!Number.isSafeInteger(value.size) || value.size < 0)) fail("legacy_mail_email_event_attachment_invalid");
  if (value.metadata !== null && !isPlainObject(value.metadata)) fail("legacy_mail_email_event_attachment_invalid");
}

function validateEmailEvent(value) {
  exactFields(value, EMAIL_EVENT_FIELDS, "legacy_mail_email_event_fields_invalid");
  if (value.schema_version !== "email.fetch.event.v1") fail("legacy_mail_email_event_schema_invalid");
  for (const field of ["event_id", "provider_message_id", "received_at", "source", "subject"]) {
    nonemptyString(value[field], "legacy_mail_email_event_identity_invalid");
  }
  for (const field of ["body_html", "body_text", "thread_id"]) nullableString(value[field], "legacy_mail_email_event_fields_invalid");
  for (const field of ["cc", "from", "to"]) {
    if (!Array.isArray(value[field])) fail("legacy_mail_email_event_address_invalid");
    value[field].forEach(validateAddress);
  }
  if (!Array.isArray(value.attachments)) fail("legacy_mail_email_event_attachment_invalid");
  value.attachments.forEach(validateAttachment);
  if (!Number.isFinite(Date.parse(value.received_at))) fail("legacy_mail_email_event_time_invalid");
  return value;
}

function canonicalText(value) {
  return value.normalize("NFC").replace(/\r\n?/gu, "\n");
}

function identityText(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function canonicalTime(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) fail("legacy_mail_event_time_invalid");
  return parsed.toISOString();
}

function conservativeFingerprint({ at, subject, counterparts }) {
  return sha256Canonical({
    at: canonicalTime(at),
    subject: identityText(subject),
    counterparts: [...new Set(counterparts.map(identityText).filter(Boolean))].sort(),
  });
}

function eventCounterparts(event) {
  return ["from", "to", "cc"].flatMap((field) => event[field].flatMap((item) => [item.address, item.name]));
}

function attachmentSetDigest(attachments) {
  const itemDigests = attachments.map((item) => sha256Canonical({
    type: identityText(item.type),
    name_digest: item.name ? rawDigest(canonicalText(item.name)) : null,
    mime: item.mime ? identityText(item.mime) : null,
    size: item.size,
    content_digest: item.content_sha256
      ? (RAW_SHA256.test(item.content_sha256) ? `sha256:${item.content_sha256}` : rawDigest(item.content_sha256))
      : null,
    provider_attachment_id_digest: item.provider_attachment_id ? rawDigest(item.provider_attachment_id) : null,
    locator_digest: item.url || item.local_path ? sha256Canonical({ url: item.url, local_path: item.local_path }) : null,
  })).sort();
  return sha256Canonical(itemDigests);
}

function gatewayRecord(event) {
  validateEmailEvent(event);
  const bodyText = typeof event.body_text === "string" && event.body_text.trim() ? canonicalText(event.body_text) : null;
  const bodyHtml = typeof event.body_html === "string" && event.body_html.trim() ? canonicalText(event.body_html) : null;
  const hasBody = bodyText !== null || bodyHtml !== null;
  const hasAttachments = event.attachments.length > 0;
  const hasGatewayContent = hasBody || hasAttachments;
  return {
    source_kind: hasGatewayContent ? "gateway_normalized_attachments" : "metadata_only",
    event_id_digest: rawDigest(event.event_id),
    provider_id_digest: rawDigest(event.provider_message_id),
    conservative_fingerprint_digest: conservativeFingerprint({
      at: event.received_at, subject: event.subject, counterparts: eventCounterparts(event),
    }),
    content_digest: hasBody
      ? sha256Canonical({ body_html: bodyHtml, body_text: bodyText })
      : (hasAttachments ? sha256Canonical({ body_html: null, body_text: null, provenance: "attachment_only" }) : null),
    attachment_set_digest: hasGatewayContent ? attachmentSetDigest(event.attachments) : null,
  };
}

function custodyRows(rows) {
  const byEvent = new Map();
  const byEml = new Set();
  for (const row of rows) {
    exactFields(row, CUSTODY_FIELDS, "legacy_mail_hpp_custody_fields_invalid");
    nonemptyString(row.event_id, "legacy_mail_hpp_custody_identity_invalid");
    if (!RAW_SHA256.test(row.provider_id_sha256) || !RAW_SHA256.test(row.eml_sha256) || row.verified !== true) {
      fail("legacy_mail_hpp_custody_identity_invalid");
    }
    if (byEvent.has(row.event_id) || byEml.has(row.eml_sha256)) fail("legacy_mail_hpp_custody_duplicate");
    byEvent.set(row.event_id, row);
    byEml.add(row.eml_sha256);
  }
  return byEvent;
}

function hppRecords(events, custody) {
  const seen = new Set();
  const records = [];
  for (const event of events) {
    validateEmailEvent(event);
    if (seen.has(event.event_id)) fail("legacy_mail_hpp_event_duplicate");
    seen.add(event.event_id);
    const link = custody.get(event.event_id);
    if (!link) fail("legacy_mail_hpp_custody_unmatched");
    if (link.provider_id_sha256 !== rawDigest(event.provider_message_id).slice(7)) {
      fail("legacy_mail_hpp_custody_provider_mismatch");
    }
    records.push({
      source_kind: "hpp_eml_current",
      event_id_digest: rawDigest(event.event_id),
      provider_id_digest: `sha256:${link.provider_id_sha256}`,
      conservative_fingerprint_digest: conservativeFingerprint({
        at: event.received_at, subject: event.subject, counterparts: eventCounterparts(event),
      }),
      content_digest: `sha256:${link.eml_sha256}`,
      attachment_set_digest: null,
    });
    custody.delete(event.event_id);
  }
  if (custody.size !== 0) fail("legacy_mail_hpp_custody_unmatched");
  return records;
}

function erpRecord(row) {
  if (!isPlainObject(row) || Object.keys(row).some((field) => !ERP_FIELDS.has(field))) {
    fail("legacy_mail_erp_fields_invalid");
  }
  for (const field of ["at", "id", "subject"]) nonemptyString(row[field], "legacy_mail_erp_identity_invalid");
  if (!Number.isFinite(Date.parse(row.at))) fail("legacy_mail_event_time_invalid");
  for (const field of ["body_preview", "body_text", "counterpart", "provider_message_id"]) {
    if (row[field] !== undefined) nullableString(row[field], "legacy_mail_erp_fields_invalid");
  }
  const bodyKind = typeof row.body_text === "string" && row.body_text.trim()
    ? "body_text"
    : (typeof row.body_preview === "string" && row.body_preview.trim() ? "body_preview" : null);
  const body = bodyKind ? canonicalText(row[bodyKind]) : null;
  return {
    source_kind: bodyKind ? "erp_legacy_body_preview" : "metadata_only",
    event_id_digest: rawDigest(row.id),
    provider_id_digest: row.provider_message_id ? rawDigest(row.provider_message_id) : null,
    conservative_fingerprint_digest: conservativeFingerprint({
      at: row.at, subject: row.subject, counterparts: [row.counterpart],
    }),
    content_digest: bodyKind ? sha256Canonical({ body_kind: bodyKind, body }) : null,
    attachment_set_digest: null,
  };
}

async function readJsonlFiles(paths) {
  const rows = [];
  for (const path of paths) rows.push(...decodeJsonl(await readStableBytes(path, "legacy_mail_source_read_or_parse_failed")));
  return rows;
}

function sortDescriptorRecords(records) {
  return records.map((record) => ({
    record,
    digest: sha256Canonical(record),
    canonical: canonicalJson(record),
  })).sort((left, right) => {
    if (left.digest < right.digest) return -1;
    if (left.digest > right.digest) return 1;
    if (left.canonical < right.canonical) return -1;
    if (left.canonical > right.canonical) return 1;
    return 0;
  }).map(({ record }) => record);
}

function withActualProof(base, sourceFileCount) {
  const { manifest_digest: ignored, ...manifestFields } = base;
  const manifest = {
    ...manifestFields,
    no_copy_no_write_proof: {
      explicit_binding_files_read: 1,
      explicit_descriptor_files_read: 0,
      source_payload_files_read: sourceFileCount,
      source_files_before_after_verified: sourceFileCount,
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

export async function buildLegacyMailManifestFromBinding(bindingPath) {
  const bindingBytes = await readStableBytes(bindingPath, "legacy_mail_binding_read_or_parse_failed");
  const binding = validateBinding(decodeJson(bindingBytes, "legacy_mail_binding_read_or_parse_failed"));
  const hppEvents = await readJsonlFiles(binding.hpp.event_files);
  const custody = custodyRows(decodeJsonl(await readStableBytes(
    binding.hpp.custody_index_file, "legacy_mail_source_read_or_parse_failed",
  )));
  const gatewayEvents = await readJsonlFiles(binding.gateway.event_files);
  const erpRows = await readJsonlFiles(binding.erp.normalized_files);
  const records = sortDescriptorRecords([
    ...hppRecords(hppEvents, custody),
    ...gatewayEvents.map(gatewayRecord),
    ...erpRows.map(erpRecord),
  ]);
  const descriptor = {
    schema_version: LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA,
    records,
  };
  const sourceFileCount = binding.hpp.event_files.length + 1
    + binding.gateway.event_files.length + binding.erp.normalized_files.length;
  return withActualProof(buildLegacyMailMergeManifest(descriptor), sourceFileCount);
}

function parseArgs(argv) {
  if (argv.length === 1 && new Set(["--help", "-h"]).has(argv[0])) return { help: true };
  if (argv.length !== 2 || argv[0] !== "--binding" || !argv[1] || argv[1].startsWith("--")) {
    fail("legacy_mail_descriptor_cli_arguments_invalid");
  }
  return { help: false, binding: argv[1] };
}

export async function runLegacyMailDescriptorProducerCli(argv = process.argv.slice(2), io = {}) {
  const options = parseArgs(argv);
  const result = options.help ? {
    schema_version: LEGACY_MAIL_MERGE_MANIFEST_SCHEMA,
    mode: "help",
    status: "no_write",
    usage: "legacy-mail-descriptor-producer --binding <one-explicit-private-json-binding>",
    live_apply_available: false,
  } : await buildLegacyMailManifestFromBinding(options.binding);
  if (io.stdout) io.stdout.write(`${canonicalJson(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${canonicalJson(await runLegacyMailDescriptorProducerCli())}\n`);
  } catch (error) {
    const code = typeof error?.code === "string" && /^[a-z0-9_]+$/u.test(error.code)
      ? error.code
      : "legacy_mail_descriptor_producer_failed";
    process.stdout.write(`${JSON.stringify({
      schema_version: LEGACY_MAIL_MERGE_MANIFEST_SCHEMA,
      mode: "dry_run_only",
      status: "blocked_no_write",
      code,
    })}\n`);
    process.exitCode = 1;
  }
}
