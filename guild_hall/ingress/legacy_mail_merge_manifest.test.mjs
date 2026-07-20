import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildLegacyMailMergeManifest,
  LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA,
} from "./legacy_mail_merge_manifest.mjs";

const cliPath = fileURLToPath(new URL("./legacy_mail_merge_manifest.mjs", import.meta.url));
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function record(sourceKind, suffix, overrides = {}) {
  return {
    source_kind: sourceKind,
    event_id_digest: digest(`event-${suffix}`),
    provider_id_digest: digest(`provider-${suffix}`),
    conservative_fingerprint_digest: null,
    content_digest: sourceKind === "metadata_only" ? null : digest(`content-${suffix}`),
    attachment_set_digest: sourceKind === "gateway_normalized_attachments"
      ? digest(`attachments-${suffix}`)
      : null,
    ...overrides,
  };
}

test("exact IDs dedupe by source precedence while fingerprint matches stay ambiguous", () => {
  const exactEvent = digest("exact-event");
  const fingerprint = digest("conservative-only");
  const manifest = buildLegacyMailMergeManifest({
    schema_version: LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA,
    records: [
      record("gateway_normalized_attachments", "gateway", { event_id_digest: exactEvent }),
      record("hpp_eml_current", "hpp", { event_id_digest: exactEvent }),
      record("erp_legacy_body_preview", "erp", { conservative_fingerprint_digest: fingerprint }),
      record("metadata_only", "metadata", {
        event_id_digest: null,
        provider_id_digest: null,
        conservative_fingerprint_digest: fingerprint,
      }),
    ],
  });

  assert.equal(manifest.mode, "dry_run_only");
  assert.equal(manifest.inventory.record_count, 4);
  assert.equal(manifest.dedupe_plan.exact_match_group_count, 1);
  assert.equal(manifest.dedupe_plan.exact_duplicate_record_count, 1);
  assert.equal(manifest.dedupe_plan.planned_distinct_record_count, 3);
  assert.equal(manifest.dedupe_plan.ambiguous_fingerprint_group_count, 1);
  assert.equal(manifest.dedupe_plan.conservative_fingerprint_automatic_merge_count, 0);
  assert.equal(manifest.action_plan.preferred_source_counts.hpp_eml_current, 1);
  assert.equal(manifest.action_plan.live_apply_authorized, false);
});

test("an exact provider ID dedupes records when event IDs differ", () => {
  const provider = digest("shared-provider-id");
  const manifest = buildLegacyMailMergeManifest({
    schema_version: LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA,
    records: [
      record("erp_legacy_body_preview", "provider-a", { provider_id_digest: provider }),
      record("gateway_normalized_attachments", "provider-b", { provider_id_digest: provider }),
    ],
  });
  assert.equal(manifest.dedupe_plan.exact_event_id_group_count, 0);
  assert.equal(manifest.dedupe_plan.exact_provider_id_group_count, 1);
  assert.equal(manifest.dedupe_plan.planned_distinct_record_count, 1);
  assert.equal(manifest.action_plan.preferred_source_counts.gateway_normalized_attachments, 1);
});

test("descriptor rejects payload-bearing fields and invalid source-quality claims", () => {
  const unsafe = record("metadata_only", "unsafe");
  unsafe.forbidden_field = true;
  assert.throws(
    () => buildLegacyMailMergeManifest({
      schema_version: LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA,
      records: [unsafe],
    }),
    { code: "legacy_mail_record_fields_invalid" },
  );
  assert.throws(
    () => buildLegacyMailMergeManifest({
      schema_version: LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA,
      records: [record("metadata_only", "content", { content_digest: digest("not-metadata-only") })],
    }),
    { code: "legacy_mail_source_quality_invalid" },
  );
});

test("CLI reads one temp descriptor, writes only sanitized stdout, and exposes no apply mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "legacy-mail-merge-manifest-"));
  try {
    const input = join(root, "descriptor.json");
    await writeFile(input, `${JSON.stringify({
      schema_version: LEGACY_MAIL_MERGE_DESCRIPTOR_SCHEMA,
      records: [record("hpp_eml_current", "cli")],
    })}\n`);
    const before = await readdir(root);
    const run = spawnSync(process.execPath, [cliPath, "--input", input], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(await readdir(root), before);
    const output = JSON.parse(run.stdout);
    assert.deepEqual(output.no_copy_no_write_proof, {
      collector_invocations: 0,
      explicit_descriptor_files_read: 1,
      filesystem_copies: 0,
      filesystem_writes: 0,
      output_surface: "stdout_sanitized_json_only",
      root_searches: 0,
      source_payload_files_read: 0,
      writer_or_scheduler_changes: 0,
    });
    assert.equal(run.stdout.includes(input), false);

    const apply = spawnSync(process.execPath, [cliPath, "--input", input, "--apply"], { encoding: "utf8" });
    assert.equal(apply.status, 1);
    assert.equal(JSON.parse(apply.stdout).code, "legacy_mail_cli_arguments_invalid");
    assert.deepEqual(await readdir(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
