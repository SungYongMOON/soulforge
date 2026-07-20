import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildLegacyMailManifestFromBinding,
  LEGACY_MAIL_SOURCE_BINDING_SCHEMA,
} from "./legacy_mail_descriptor_producer.mjs";

const cliPath = fileURLToPath(new URL("./legacy_mail_descriptor_producer.mjs", import.meta.url));
const hexDigest = (value) => createHash("sha256").update(value).digest("hex");

function address(name, value) {
  return { name, address: value };
}

function attachment(overrides = {}) {
  return {
    type: "binary_attachment",
    name: "SENSITIVE_DRAWING.pdf",
    mime: "application/pdf",
    size: 128,
    url: "source://private/SENSITIVE_ATTACHMENT_URL",
    content_sha256: null,
    local_path: "D:/PRIVATE_ATTACHMENT_PATH",
    provider_attachment_id: "SENSITIVE_ATTACHMENT_ID",
    metadata: { classification: "private" },
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    schema_version: "email.fetch.event.v1",
    event_id: "SENSITIVE_EVENT_ID",
    source: "hiworks",
    provider_message_id: "SENSITIVE_PROVIDER_ID",
    thread_id: null,
    subject: "SENSITIVE_SUBJECT",
    from: [address("Private Sender", "sender-sensitive@example.test")],
    to: [address("Private Recipient", "recipient-sensitive@example.test")],
    cc: [],
    received_at: "2026-07-21T00:15:00+00:00",
    body_text: "SENSITIVE_BODY_TEXT",
    body_html: null,
    attachments: [attachment()],
    ingested_at: "2026-07-21T00:16:00+00:00",
    ingest_status: "ok",
    raw: { private_provider_payload: "SENSITIVE_RAW_VALUE" },
    metadata: { classification: { bucket: "mail" } },
    ...overrides,
  };
}

function custody(eventValue) {
  const emlSha256 = hexDigest("SENSITIVE_RFC822_BYTES");
  return {
    event_id: eventValue.event_id,
    provider_id_sha256: hexDigest(eventValue.provider_message_id),
    eml_sha256: emlSha256,
    eml_size: 512,
    storage_ref: `hiworks/sha256/${emlSha256.slice(0, 2)}/${emlSha256}.eml`,
    match_method: "message_id_exact",
    verified: true,
  };
}

function erpRow(overrides = {}) {
  return {
    id: "SENSITIVE_ERP_ID",
    project_id: "PRIVATE_PROJECT",
    at: "2026-07-21T09:15:00+09:00",
    direction: "in",
    subject: "SENSITIVE_SUBJECT",
    counterpart: "sender-sensitive@example.test",
    pointer_ref: "PRIVATE_POINTER",
    stage_code: null,
    source_ref: "PRIVATE_SOURCE_REF",
    mailbox: "private@example.test",
    data_label: "real",
    body_preview: "SENSITIVE_ERP_PREVIEW",
    body_text: "SENSITIVE_ERP_BODY_TEXT",
    hidden: 0,
    dup_of: null,
    recipient_role: "to",
    provider_message_id: "SENSITIVE_ERP_PROVIDER_ID",
    ...overrides,
  };
}

async function writeJsonl(path, rows) {
  await writeFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

async function makeFixture(root, overrides = {}) {
  const hppEvent = overrides.hppEvent ?? event();
  const hppEvents = join(root, "hpp-events.jsonl");
  const custodyIndex = join(root, "hpp-custody.jsonl");
  const gatewayOne = join(root, "gateway-one.jsonl");
  const gatewayTwo = join(root, "gateway-two.jsonl");
  const erpOne = join(root, "erp-one.jsonl");
  const erpTwo = join(root, "erp-two.jsonl");
  await writeJsonl(hppEvents, overrides.hppRows ?? [hppEvent]);
  await writeJsonl(custodyIndex, overrides.custodyRows ?? [custody(hppEvent)]);
  await writeJsonl(gatewayOne, overrides.gatewayOneRows ?? [event({ source: "gmail" })]);
  await writeJsonl(gatewayTwo, [overrides.gatewayTwoEvent ?? event({
    event_id: "SENSITIVE_GATEWAY_METADATA_ID",
    provider_message_id: "SENSITIVE_GATEWAY_METADATA_PROVIDER",
    body_text: null,
    attachments: [],
  })]);
  await writeJsonl(erpOne, [erpRow()]);
  await writeJsonl(erpTwo, [erpRow({
    id: "SENSITIVE_ERP_METADATA_ID",
    provider_message_id: null,
    body_text: "",
    body_preview: "",
  })]);
  if (overrides.gatewayMalformed) await writeFile(gatewayOne, overrides.gatewayMalformed);
  const sourcePaths = [hppEvents, custodyIndex, gatewayOne, gatewayTwo, erpOne, erpTwo];
  const binding = {
    schema_version: LEGACY_MAIL_SOURCE_BINDING_SCHEMA,
    hpp: { event_files: [hppEvents], custody_index_file: custodyIndex },
    gateway: { event_files: [gatewayOne, gatewayTwo] },
    erp: { normalized_files: [erpOne, erpTwo] },
  };
  const bindingPath = join(root, "PRIVATE_BINDING_DO_NOT_PRINT.json");
  await writeFile(bindingPath, JSON.stringify(binding));
  return { binding, bindingPath, gatewayOne, sourcePaths };
}

async function snapshot(paths) {
  return Promise.all(paths.map(async (path) => {
    const info = await stat(path);
    return { bytes: await readFile(path, "hex"), size: info.size, mtimeMs: info.mtimeMs };
  }));
}

test("explicit real-like HPP, gateway, and ERP JSONL produce only a sanitized actual dry-run manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "legacy-mail-producer-sensitive-"));
  try {
    const fixture = await makeFixture(root);
    const before = await snapshot([fixture.bindingPath, ...fixture.sourcePaths]);
    const run = spawnSync(process.execPath, [cliPath, "--binding", fixture.bindingPath], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stderr, "");
    assert.deepEqual(await snapshot([fixture.bindingPath, ...fixture.sourcePaths]), before);
    const output = JSON.parse(run.stdout);
    assert.equal(output.mode, "dry_run_only");
    assert.equal(output.status, "planned_no_write");
    assert.equal(output.inventory.record_count, 5);
    assert.equal(output.inventory.source_counts.hpp_eml_current, 1);
    assert.equal(output.inventory.source_counts.gateway_normalized_attachments, 1);
    assert.equal(output.inventory.source_counts.erp_legacy_body_preview, 1);
    assert.equal(output.inventory.source_counts.metadata_only, 2);
    assert.equal(output.dedupe_plan.conservative_fingerprint_automatic_merge_count, 0);
    assert.deepEqual(output.no_copy_no_write_proof, {
      collector_invocations: 0,
      explicit_binding_files_read: 1,
      explicit_descriptor_files_read: 0,
      filesystem_copies: 0,
      filesystem_writes: 0,
      output_surface: "stdout_sanitized_json_only",
      root_searches: 0,
      source_files_before_after_verified: 6,
      source_payload_files_read: 6,
      writer_or_scheduler_changes: 0,
    });
    for (const sensitive of [
      root, fixture.bindingPath, "SENSITIVE_EVENT_ID", "SENSITIVE_PROVIDER_ID", "SENSITIVE_SUBJECT",
      "SENSITIVE_BODY_TEXT", "sender-sensitive@example.test", "SENSITIVE_DRAWING.pdf",
      "SENSITIVE_ATTACHMENT_URL", "PRIVATE_ATTACHMENT_PATH", "SENSITIVE_RAW_VALUE",
      "SENSITIVE_ERP_BODY_TEXT", "PRIVATE_POINTER",
    ]) assert.equal(run.stdout.includes(sensitive), false, sensitive);

    const reorderedPath = join(root, "PRIVATE_REORDERED_BINDING.json");
    await writeFile(reorderedPath, JSON.stringify({
      ...fixture.binding,
      gateway: { event_files: [...fixture.binding.gateway.event_files].reverse() },
      erp: { normalized_files: [...fixture.binding.erp.normalized_files].reverse() },
    }));
    const reordered = spawnSync(process.execPath, [cliPath, "--binding", reorderedPath], { encoding: "utf8" });
    assert.equal(reordered.status, 0, reordered.stderr);
    assert.deepEqual(JSON.parse(reordered.stdout), output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gateway rows reordered inside one JSONL produce byte-identical full output", async () => {
  const root = await mkdtemp(join(tmpdir(), "legacy-mail-producer-row-order-"));
  try {
    const rows = [
      event({ event_id: "row-order-a", provider_message_id: "row-provider-a", source: "gmail" }),
      event({ event_id: "row-order-b", provider_message_id: "row-provider-b", source: "gmail" }),
    ];
    const fixture = await makeFixture(root, { gatewayOneRows: rows });
    const first = spawnSync(process.execPath, [cliPath, "--binding", fixture.bindingPath], { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    await writeJsonl(fixture.gatewayOne, [...rows].reverse());
    const reversed = spawnSync(process.execPath, [cliPath, "--binding", fixture.bindingPath], { encoding: "utf8" });
    assert.equal(reversed.status, 0, reversed.stderr);
    assert.equal(reversed.stdout, first.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gateway attachment-only events retain gateway content quality", async () => {
  const root = await mkdtemp(join(tmpdir(), "legacy-mail-producer-attachment-only-"));
  try {
    const fixture = await makeFixture(root, { gatewayTwoEvent: event({
      event_id: "attachment-only-event",
      provider_message_id: "attachment-only-provider",
      body_text: null,
      body_html: null,
      attachments: [attachment()],
    }) });
    const manifest = await buildLegacyMailManifestFromBinding(fixture.bindingPath);
    assert.equal(manifest.inventory.source_counts.gateway_normalized_attachments, 2);
    assert.equal(manifest.inventory.source_counts.metadata_only, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HPP custody mismatch, duplicate, and unmatched rows fail closed", async (t) => {
  for (const fixtureCase of [
    {
      name: "provider mismatch",
      code: "legacy_mail_hpp_custody_provider_mismatch",
      mutate: (row) => ({ ...row, provider_id_sha256: hexDigest("different-provider") }),
    },
    {
      name: "duplicate",
      code: "legacy_mail_hpp_custody_duplicate",
      mutateRows: (row) => [row, { ...row }],
    },
    {
      name: "unmatched",
      code: "legacy_mail_hpp_custody_unmatched",
      mutate: (row) => ({ ...row, event_id: "SENSITIVE_UNMATCHED_EVENT" }),
    },
  ]) {
    await t.test(fixtureCase.name, async () => {
      const root = await mkdtemp(join(tmpdir(), "legacy-mail-producer-custody-"));
      try {
        const hppEvent = event();
        const original = custody(hppEvent);
        const custodyRows = fixtureCase.mutateRows
          ? fixtureCase.mutateRows(original)
          : [fixtureCase.mutate(original)];
        const fixture = await makeFixture(root, { hppEvent, custodyRows });
        await assert.rejects(
          buildLegacyMailManifestFromBinding(fixture.bindingPath),
          { code: fixtureCase.code },
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test("source parse errors and rejected apply expose only fixed codes and change no input", async () => {
  const root = await mkdtemp(join(tmpdir(), "legacy-mail-producer-parse-"));
  try {
    const secretSnippet = "SENSITIVE_JSON_SNIPPET";
    const fixture = await makeFixture(root, { gatewayMalformed: `{\"body\":\"${secretSnippet}\"` });
    const before = await snapshot([fixture.bindingPath, ...fixture.sourcePaths]);
    const parseRun = spawnSync(process.execPath, [cliPath, "--binding", fixture.bindingPath], { encoding: "utf8" });
    assert.equal(parseRun.status, 1);
    assert.equal(parseRun.stderr, "");
    assert.equal(JSON.parse(parseRun.stdout).code, "legacy_mail_source_read_or_parse_failed");
    assert.equal(parseRun.stdout.includes(secretSnippet), false);
    assert.equal(parseRun.stdout.includes(root), false);

    const applyRun = spawnSync(process.execPath, [cliPath, "--binding", fixture.bindingPath, "--apply"], { encoding: "utf8" });
    assert.equal(applyRun.status, 1);
    assert.equal(applyRun.stderr, "");
    assert.equal(JSON.parse(applyRun.stdout).code, "legacy_mail_descriptor_cli_arguments_invalid");
    assert.equal(applyRun.stdout.includes(root), false);
    assert.deepEqual(await snapshot([fixture.bindingPath, ...fixture.sourcePaths]), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
