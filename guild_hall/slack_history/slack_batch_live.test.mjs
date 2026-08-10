import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";

import {
  preflightSlackBatchLive,
  runSlackBatchLive,
  SlackBatchLiveError,
  SLACK_BATCH_REDACTED_ATTESTATION_ENTRYPOINT_SHA256,
  SLACK_BATCH_REDACTED_ATTESTATION_SCHEMA_VERSION,
  SLACK_BATCH_REDACTED_TRUSTED_EXPECTED_SCHEMA_VERSION,
  validateRedactedSlackBatchAttestation,
} from "./slack_batch_live_runner.mjs";
import {
  SLACK_BATCH_RUNTIME_ENTRYPOINT,
  SLACK_BATCH_RUNTIME_MANIFEST_SCHEMA_VERSION,
  SlackBatchRuntimeError,
  verifyExactSlackBatchRuntime,
} from "./slack_batch_live_launcher.mjs";

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_ROOT, "..", "..");
const TASK_REGISTRAR_PATH = path.join(
  MODULE_ROOT,
  "ops",
  "register-slack-batch-hpp-task.ps1",
);
const APP_MANIFEST_PATH = path.join(MODULE_ROOT, "slack_app_manifest.yaml");
const execFileAsync = promisify(execFile);
const PLACEHOLDER_HEALTH_PATH = ["C:", "path", "to", "Soulforge"].join("\\");
const SYNTHETIC_TOKEN_LIKE_VALUE = ["xoxb", "synthetic", "token"].join("-");

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sha256CanonicalString(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), "utf8"));
}

function redactedAttestationFixture({ sourceCount = 9 } = {}) {
  const writer = {
    authority_sha256: sha256CanonicalString("synthetic-writer-authority"),
    lease_sha256: sha256CanonicalString("synthetic-writer-lease"),
    epoch: 7,
    status: "single_writer",
  };
  const sources = Array.from({ length: sourceCount }, (_, index) => ({
    source_sha256: sha256CanonicalString(`synthetic-source-${index}`),
    binding_sha256: sha256CanonicalString(`synthetic-binding-${index}`),
    cursor_sha256: sha256CanonicalString(`synthetic-cursor-${index}`),
    revision_sha256: sha256CanonicalString(`synthetic-revision-${index}`),
    dedupe_sha256: sha256CanonicalString(`synthetic-dedupe-${index}`),
    writer_authority_sha256: writer.authority_sha256,
    writer_lease_sha256: writer.lease_sha256,
    writer_epoch: writer.epoch,
    cursor_status: "current",
    revision_status: "current",
    dedupe_status: "clean",
    freshness_status: "fresh",
    writer_status: "single_writer",
  })).sort((left, right) => left.source_sha256.localeCompare(right.source_sha256));
  const attestation = {
    schema_version: SLACK_BATCH_REDACTED_ATTESTATION_SCHEMA_VERSION,
    entrypoint_sha256: SLACK_BATCH_REDACTED_ATTESTATION_ENTRYPOINT_SHA256,
    runner_sha256: sha256CanonicalString("synthetic-runner"),
    node_sha256: sha256CanonicalString("synthetic-node"),
    runtime_manifest_sha256: sha256CanonicalString("synthetic-runtime-manifest"),
    task_sha256: sha256CanonicalString("synthetic-task"),
    batch_binding_sha256: sha256CanonicalString("synthetic-batch-binding"),
    immutable_source_sha256: sha256CanonicalString("synthetic-immutable-source"),
    config_sha256: sha256CanonicalString("synthetic-config"),
    source_binding_set_sha256: sha256CanonicalString(sources
      .map((source) => [source.source_sha256, source.binding_sha256])
      .sort(([left], [right]) => left.localeCompare(right))),
    apply_argv_projection: null,
    preflight_argv_projection: null,
    writer,
    sources,
  };
  const projection = (mode) => [
    mode,
    "--entrypoint-sha256", attestation.entrypoint_sha256,
    "--runner-sha256", attestation.runner_sha256,
    "--node-sha256", attestation.node_sha256,
    "--runtime-manifest-sha256", attestation.runtime_manifest_sha256,
    "--task-sha256", attestation.task_sha256,
    "--batch-binding-sha256", attestation.batch_binding_sha256,
    "--immutable-source-sha256", attestation.immutable_source_sha256,
    "--config-sha256", attestation.config_sha256,
    "--source-binding-set-sha256", attestation.source_binding_set_sha256,
  ];
  attestation.apply_argv_projection = projection("--apply");
  attestation.preflight_argv_projection = projection("--preflight");
  return attestation;
}

function trustedExpectedFor(attestation) {
  return {
    schema_version: SLACK_BATCH_REDACTED_TRUSTED_EXPECTED_SCHEMA_VERSION,
    entrypoint_sha256: attestation.entrypoint_sha256,
    runner_sha256: attestation.runner_sha256,
    node_sha256: attestation.node_sha256,
    runtime_manifest_sha256: attestation.runtime_manifest_sha256,
    task_sha256: attestation.task_sha256,
    batch_binding_sha256: attestation.batch_binding_sha256,
    immutable_source_sha256: attestation.immutable_source_sha256,
    config_sha256: attestation.config_sha256,
    source_binding_set_sha256: attestation.source_binding_set_sha256,
    apply_argv_projection_sha256: sha256CanonicalString(attestation.apply_argv_projection),
    preflight_argv_projection_sha256: sha256CanonicalString(attestation.preflight_argv_projection),
    writer_authority_sha256: attestation.writer.authority_sha256,
    writer_lease_sha256: attestation.writer.lease_sha256,
    writer_epoch: attestation.writer.epoch,
    source_authority_set_sha256: sha256CanonicalString(attestation.sources
      .map((source) => [
        source.source_sha256,
        source.writer_authority_sha256,
        source.writer_lease_sha256,
        source.writer_epoch,
      ])
      .sort(([left], [right]) => left.localeCompare(right))),
    source_count: attestation.sources.length,
  };
}

function cloned(value) {
  return JSON.parse(JSON.stringify(value));
}

test("public synthetic attestation accepts exact redacted nine-source evidence without side effects", () => {
  const attestation = redactedAttestationFixture();
  const result = validateRedactedSlackBatchAttestation(attestation, trustedExpectedFor(attestation));
  assert.equal(result.attestation_status, "PASS");
  assert.equal(result.configured_source_count, 9);
  assert.equal(result.passed_source_count, 9);
  assert.equal(result.held_source_count, 0);
  assert.deepEqual(result.aggregate_codes, []);
  assert.equal(result.repository_writes, 0);
  assert.equal(result.private_writes, 0);
  assert.equal(result.network_used, false);
  assert.equal(result.official_live_acceptance, false);
  assert.equal(result.restart_reconcile_authorized, false);
  assert.equal(JSON.stringify(result).includes("synthetic-source-"), false);
});

test("public synthetic attestation requires a separately supplied trusted expected set", () => {
  const attestation = redactedAttestationFixture();
  const missing = validateRedactedSlackBatchAttestation(attestation);
  assert.equal(missing.attestation_status, "HOLD");
  assert.deepEqual(missing.aggregate_codes, ["trusted_expected_missing"]);
  assert.equal(missing.held_source_count, 9);

  const invalid = validateRedactedSlackBatchAttestation(attestation, { unexpected: "value" });
  assert.equal(invalid.attestation_status, "HOLD");
  assert.deepEqual(invalid.aggregate_codes, ["trusted_expected_invalid"]);
});

test("public synthetic attestation holds trusted pin mismatches without echoing expected values", () => {
  const attestation = redactedAttestationFixture();
  const trustedExpected = trustedExpectedFor(attestation);
  trustedExpected.runner_sha256 = sha256CanonicalString("synthetic-untrusted-runner");
  const result = validateRedactedSlackBatchAttestation(attestation, trustedExpected);
  assert.equal(result.attestation_status, "HOLD");
  assert.deepEqual(result.aggregate_codes, ["trusted_runner_mismatch"]);
  assert.equal(JSON.stringify(result).includes("synthetic-untrusted-runner"), false);
});

test("public synthetic attestation fails closed for an incomplete source set", () => {
  const attestation = redactedAttestationFixture({ sourceCount: 8 });
  const result = validateRedactedSlackBatchAttestation(attestation, trustedExpectedFor(attestation));
  assert.equal(result.attestation_status, "HOLD");
  assert.deepEqual(result.aggregate_codes, ["source_count_mismatch"]);
  assert.equal(result.configured_source_count, 8);
});

test("public synthetic attestation fails closed for an excess source set", () => {
  const attestation = redactedAttestationFixture({ sourceCount: 10 });
  const result = validateRedactedSlackBatchAttestation(attestation, trustedExpectedFor(attestation));
  assert.equal(result.attestation_status, "HOLD");
  assert.deepEqual(result.aggregate_codes, ["source_count_mismatch"]);
  assert.equal(result.configured_source_count, 10);
});

test("public synthetic attestation holds every source when the binding digest set mismatches", () => {
  const attestation = redactedAttestationFixture();
  const trustedExpected = trustedExpectedFor(attestation);
  attestation.sources[0].binding_sha256 = sha256CanonicalString("synthetic-mismatch");
  const result = validateRedactedSlackBatchAttestation(attestation, trustedExpected);
  assert.equal(result.attestation_status, "HOLD");
  assert.deepEqual(result.aggregate_codes, ["binding_digest_mismatch"]);
  assert.equal(result.held_source_count, 9);
  assert.deepEqual(result.sources[0].codes, ["binding_digest_mismatch"]);
});

test("public synthetic attestation rejects a non-equivalent apply/preflight projection", () => {
  const attestation = redactedAttestationFixture();
  attestation.preflight_argv_projection[2] = sha256CanonicalString("synthetic-argv-mismatch");
  assert.throws(
    () => validateRedactedSlackBatchAttestation(attestation),
    (error) => error instanceof SlackBatchLiveError && error.code === "synthetic_argv_projection_invalid",
  );
});

test("public synthetic attestation holds stale cursor, revision, dedupe, and writer conflicts", () => {
  const attestation = redactedAttestationFixture();
  const trustedExpected = trustedExpectedFor(attestation);
  attestation.sources[0].cursor_status = "stale";
  attestation.sources[1].revision_status = "conflict";
  attestation.sources[2].dedupe_status = "conflict";
  attestation.sources[3].writer_status = "ambiguous";
  const result = validateRedactedSlackBatchAttestation(attestation, trustedExpected);
  assert.equal(result.attestation_status, "HOLD");
  assert.deepEqual(result.sources[0].codes, ["cursor_stale"]);
  assert.deepEqual(result.sources[1].codes, ["revision_conflict"]);
  assert.deepEqual(result.sources[2].codes, ["duplicate_conflict"]);
  assert.deepEqual(result.sources[3].codes, ["writer_ambiguous"]);
});

test("public synthetic attestation holds all sources when the global writer is ambiguous", () => {
  const attestation = redactedAttestationFixture();
  const trustedExpected = trustedExpectedFor(attestation);
  attestation.writer.status = "ambiguous";
  const result = validateRedactedSlackBatchAttestation(attestation, trustedExpected);
  assert.equal(result.attestation_status, "HOLD");
  assert.equal(result.held_source_count, 9);
  assert.deepEqual(result.sources[0].codes, ["writer_ambiguous"]);
});

test("public synthetic attestation rejects duplicate identities and unsafe input without echoing it", () => {
  const duplicate = redactedAttestationFixture();
  duplicate.sources[1].source_sha256 = duplicate.sources[0].source_sha256;
  assert.throws(
    () => validateRedactedSlackBatchAttestation(duplicate),
    (error) => error instanceof SlackBatchLiveError && error.code === "synthetic_duplicate_source_identity",
  );

  for (const unsafe of [
    { unexpected: "value" },
    { apply_argv_projection: ["--apply", PLACEHOLDER_HEALTH_PATH] },
    { config_sha256: SYNTHETIC_TOKEN_LIKE_VALUE },
  ]) {
    const attestation = cloned(redactedAttestationFixture());
    Object.assign(attestation, unsafe);
    assert.throws(
      () => validateRedactedSlackBatchAttestation(attestation),
      (error) => error instanceof SlackBatchLiveError
        && ["exact_keys_required", "synthetic_path_forbidden", "synthetic_secret_value_forbidden"].includes(error.code)
        && !error.message.includes(SYNTHETIC_TOKEN_LIKE_VALUE)
        && !error.message.includes(PLACEHOLDER_HEALTH_PATH),
    );
  }
});

test("owner-managed Slack app manifest grants only the bounded read scopes", async () => {
  const manifest = parseYaml(await readFile(APP_MANIFEST_PATH, "utf8"));
  assert.deepEqual(manifest.oauth_config.scopes.user, [
    "channels:read",
    "channels:history",
    "files:read",
  ]);
  assert.equal(manifest.settings.socket_mode_enabled, false);
  assert.equal("bot" in manifest.oauth_config.scopes, false);
  assert.equal("features" in manifest, false);
  assert.equal("event_subscriptions" in manifest.settings, false);
  assert.equal(JSON.stringify(manifest).includes(":write"), false);
});

async function writePinnedJson(target, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return sha256Bytes(bytes);
}

function liveBinding({
  privateRoot,
  runtimeRoot,
  bindingId,
  workspaceId,
  channelId,
  dataRoot,
}) {
  return {
    schema_version: "soulforge.slack_continuous.binding.v2",
    feature_enabled: true,
    binding_id: bindingId,
    workspace_id: workspaceId,
    channel_id: channelId,
    project_code: "P1",
    channel: {
      kind: "project",
      visibility: "public",
      is_shared: false,
      is_ext_shared: false,
      is_archived: false,
      is_member: true,
    },
    credentials: {
      app_token_env: null,
      bot_token_env: "SLACK_BOT_TOKEN_TEST",
      app_token_file: null,
      bot_token_file: null,
    },
    attachment_policy: {
      feature_enabled: false,
      custody_root: path.join(dataRoot, "attachments"),
      max_files_per_message: 4,
      max_file_bytes: 1_048_576,
      max_total_bytes: 2_097_152,
      allowed_mime_types: ["text/plain"],
      allowed_file_types: ["txt"],
      timeout_ms: 1_000,
      max_retries: 0,
      max_retry_after_seconds: 0,
    },
    private_root: privateRoot,
    data_root: dataRoot,
    forbidden_roots: [REPOSITORY_ROOT, runtimeRoot],
    writer: {
      authority_id: `writer-${bindingId}`,
      epoch: 1,
    },
  };
}

async function createBatchFixture({
  bindingSpecs = [
    { bindingId: "binding-a", workspaceId: "TAAA", channelId: "CAAA" },
    { bindingId: "binding-b", workspaceId: "TAAA", channelId: "CBBB" },
  ],
  stateInsideRuntime = false,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-slack-batch-"));
  const runtimeRoot = path.join(root, "runtime");
  const privateRoot = path.join(root, "private");
  const configRoot = path.join(privateRoot, "config");
  const stateRoot = stateInsideRuntime
    ? path.join(runtimeRoot, "state")
    : path.join(privateRoot, "batch-state");
  await Promise.all([
    mkdir(runtimeRoot, { recursive: true }),
    mkdir(configRoot, { recursive: true }),
  ]);
  const references = [];
  for (const spec of bindingSpecs) {
    const dataRoot = path.join(privateRoot, "channels", spec.bindingId);
    const binding = liveBinding({
      privateRoot,
      runtimeRoot,
      ...spec,
      dataRoot,
    });
    const bindingPath = path.join(configRoot, `${spec.bindingId}.json`);
    const bindingSha256 = await writePinnedJson(bindingPath, binding);
    references.push({
      binding_id: spec.bindingId,
      workspace_id: spec.workspaceId,
      channel_id: spec.channelId,
      binding_path: bindingPath,
      binding_sha256: bindingSha256,
      max_events: 100,
      max_pages: 3,
    });
  }
  references.sort((left, right) => (
    `${left.workspace_id}\u0000${left.channel_id}\u0000${left.binding_id}`
      .localeCompare(`${right.workspace_id}\u0000${right.channel_id}\u0000${right.binding_id}`)
  ));
  const batch = {
    schema_version: "soulforge.slack_batch_live.binding.v1",
    feature_enabled: true,
    batch_id: "hpp-slack-daily",
    private_root: privateRoot,
    state_root: stateRoot,
    forbidden_roots: [REPOSITORY_ROOT, runtimeRoot],
    writer: {
      authority_id: "hpp-slack-batch-writer",
      epoch: 1,
    },
    bindings: references,
  };
  const batchPath = path.join(configRoot, "batch.json");
  const batchSha256 = await writePinnedJson(batchPath, batch);
  return {
    root,
    runtimeRoot,
    privateRoot,
    stateRoot,
    batch,
    batchPath,
    batchSha256,
    options: {
      batch_binding_path: batchPath,
      expected_batch_binding_sha256: batchSha256,
      repository_root: REPOSITORY_ROOT,
      runtime_root: runtimeRoot,
    },
  };
}

function messageRecord(binding, suffix = "1") {
  return {
    event_id: `EvBatch:${binding.channel_id}:${suffix}`,
    retry_num: 0,
    retry_reason: null,
    received_at: "2026-07-24T00:00:00.000Z",
    workspace_id: binding.workspace_id,
    channel_id: binding.channel_id,
    channel_kind: "project",
    is_private: false,
    is_shared: false,
    is_ext_shared: false,
    is_archived: false,
    is_member: true,
    source_refs: [`slack-batch:${binding.channel_id}:${suffix}`],
    raw_event: {
      type: "message",
      ts: `1720000000.00000${suffix}`,
      user: "UAAA",
      text: "synthetic batch message",
    },
  };
}

function onePageTransport(binding, calls) {
  return {
    kind: "web_api",
    async pull({ cursor_token: cursorToken }) {
      calls.push(binding.channel_id);
      const record = messageRecord(binding);
      return {
        page_id: `page:${binding.channel_id}:1`,
        previous_cursor_digest: cursorToken,
        next_cursor_digest: null,
        next_cursor_token: null,
        records: [record],
        coverage_gaps: ["synthetic_transport_only"],
      };
    },
  };
}

test("preflight validates every exact private binding without network or writes", async () => {
  const fixture = await createBatchFixture();
  const result = await preflightSlackBatchLive(fixture.options);
  assert.deepEqual(result, {
    mode: "preflight",
    feature_status: "ON",
    configured_count: 2,
    succeeded_count: 2,
    failed_count: 0,
    pulled_count: 0,
    accepted_count: 0,
    held_count: 0,
    processed_pages: 0,
    replayed_pages: 0,
    continuation_pending_count: 0,
    repository_writes: 0,
    private_writes: 0,
    network_used: false,
    coverage_gaps: [],
    error_code_counts: [],
  });
});

test("one channel failure is isolated and aggregate output contains no channel identity", async () => {
  const fixture = await createBatchFixture();
  const calls = [];
  const result = await runSlackBatchLive({
    ...fixture.options,
    transport_factory: async ({ binding }) => {
      calls.push(`factory:${binding.channel_id}`);
      if (binding.channel_id === "CAAA") {
        const error = new Error("synthetic private detail must not escape");
        error.code = "synthetic_channel_failure";
        throw error;
      }
      return onePageTransport(binding, calls);
    },
  });
  assert.equal(result.configured_count, 2);
  assert.equal(result.succeeded_count, 1);
  assert.equal(result.failed_count, 1);
  assert.deepEqual(result.error_code_counts, [{
    code: "synthetic_channel_failure",
    count: 1,
  }]);
  assert.ok(calls.includes("factory:CAAA"));
  assert.ok(calls.includes("factory:CBBB"));
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "CAAA",
    "CBBB",
    "TAAA",
    "binding-a",
    "binding-b",
    fixture.privateRoot,
    fixture.runtimeRoot,
    fixture.batchSha256,
    "synthetic private detail",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("apply preserves per-binding state and stops at the provider end cursor", async () => {
  const fixture = await createBatchFixture({
    bindingSpecs: [
      { bindingId: "binding-a", workspaceId: "TAAA", channelId: "CAAA" },
    ],
  });
  const calls = [];
  const result = await runSlackBatchLive({
    ...fixture.options,
    transport_factory: async ({ binding }) => onePageTransport(binding, calls),
  });
  assert.equal(result.succeeded_count, 1);
  assert.equal(result.failed_count, 0);
  assert.equal(result.processed_pages, 1);
  assert.equal(result.replayed_pages, 0);
  assert.equal(calls.length, 1);
  const channelState = JSON.parse(await readFile(
    path.join(fixture.privateRoot, "channels", "binding-a", "state", "slack-continuous.json"),
    "utf8",
  ));
  assert.equal(channelState.writer_authority_id, "writer-binding-a");
  assert.equal(channelState.cursor.accepted_pages.length, 1);
  const batchState = JSON.parse(await readFile(
    path.join(fixture.stateRoot, "state", "slack-batch-live.json"),
    "utf8",
  ));
  assert.equal(batchState.schema_version, "soulforge.slack_batch_live.state.v1");
  assert.equal(batchState.result.configured_count, 1);
  assert.equal(batchState.result.repository_writes, 0);
});

test("apply follows a bounded provider cursor across multiple pages", async () => {
  const fixture = await createBatchFixture({
    bindingSpecs: [
      { bindingId: "binding-a", workspaceId: "TAAA", channelId: "CAAA" },
    ],
  });
  const calls = [];
  const result = await runSlackBatchLive({
    ...fixture.options,
    transport_factory: async ({ binding }) => ({
      kind: "web_api",
      async pull({ cursor_token: cursorToken }) {
        calls.push(cursorToken);
        if (cursorToken === null) {
          return {
            page_id: "page:CAAA:1",
            previous_cursor_digest: null,
            next_cursor_digest: sha256CanonicalString("cursor:CAAA:2"),
            next_cursor_token: "cursor:CAAA:2",
            records: [messageRecord(binding, "1")],
          };
        }
        assert.equal(cursorToken, "cursor:CAAA:2");
        return {
          page_id: "page:CAAA:2",
          previous_cursor_digest: sha256CanonicalString(cursorToken),
          next_cursor_digest: null,
          next_cursor_token: null,
          records: [messageRecord(binding, "2")],
        };
      },
    }),
  });
  assert.deepEqual(calls, [null, "cursor:CAAA:2"]);
  assert.equal(result.processed_pages, 2);
  assert.equal(result.accepted_count, 2);
  const channelState = JSON.parse(await readFile(
    path.join(fixture.privateRoot, "channels", "binding-a", "state", "slack-continuous.json"),
    "utf8",
  ));
  assert.equal(channelState.cursor.accepted_pages.length, 2);
  assert.equal(channelState.provider_cursor_token, null);
});

test("max-pages exhaustion is explicit when a provider continuation remains", async () => {
  const fixture = await createBatchFixture({
    bindingSpecs: [
      { bindingId: "binding-a", workspaceId: "TAAA", channelId: "CAAA" },
    ],
  });
  fixture.batch.bindings[0].max_pages = 1;
  fixture.batchSha256 = await writePinnedJson(fixture.batchPath, fixture.batch);
  fixture.options.expected_batch_binding_sha256 = fixture.batchSha256;
  const result = await runSlackBatchLive({
    ...fixture.options,
    transport_factory: async ({ binding }) => ({
      kind: "web_api",
      async pull({ cursor_token: cursorToken }) {
        assert.equal(cursorToken, null);
        return {
          page_id: "page:CAAA:bounded",
          previous_cursor_digest: null,
          next_cursor_digest: sha256CanonicalString("cursor:CAAA:pending"),
          next_cursor_token: "cursor:CAAA:pending",
          records: [messageRecord(binding, "9")],
        };
      },
    }),
  });
  assert.equal(result.succeeded_count, 1);
  assert.equal(result.continuation_pending_count, 1);
  assert.deepEqual(result.coverage_gaps, ["max_pages_continuation_pending"]);
});

test("batch rejects private state overlap with runtime before any transport is created", async () => {
  const fixture = await createBatchFixture({ stateInsideRuntime: true });
  let factoryCalls = 0;
  await assert.rejects(
    runSlackBatchLive({
      ...fixture.options,
      transport_factory: async () => {
        factoryCalls += 1;
        throw new Error("must not run");
      },
    }),
    (error) => error instanceof SlackBatchLiveError
      && ["state_root_not_strict_private_child", "private_forbidden_overlap"].includes(error.code),
  );
  assert.equal(factoryCalls, 0);
});

test("batch rejects duplicate workspace/channel allowlist entries globally", async () => {
  const fixture = await createBatchFixture();
  const duplicate = structuredClone(fixture.batch);
  duplicate.bindings[1].workspace_id = duplicate.bindings[0].workspace_id;
  duplicate.bindings[1].channel_id = duplicate.bindings[0].channel_id;
  const digest = await writePinnedJson(fixture.batchPath, duplicate);
  await assert.rejects(
    preflightSlackBatchLive({
      ...fixture.options,
      expected_batch_binding_sha256: digest,
    }),
    (error) => error instanceof SlackBatchLiveError
      && error.code === "duplicate_channel_binding",
  );
});

test("pairwise overlapping channel state roots fail closed before transport creation", async () => {
  const fixture = await createBatchFixture();
  const firstDataRoot = path.join(fixture.privateRoot, "channels", "binding-a");
  const secondReference = fixture.batch.bindings.find((entry) => entry.binding_id === "binding-b");
  const secondBinding = JSON.parse(await readFile(secondReference.binding_path, "utf8"));
  secondBinding.data_root = firstDataRoot;
  secondBinding.attachment_policy.custody_root = path.join(firstDataRoot, "attachments");
  secondReference.binding_sha256 = await writePinnedJson(secondReference.binding_path, secondBinding);
  const batchSha256 = await writePinnedJson(fixture.batchPath, fixture.batch);
  let factoryCalls = 0;
  const result = await runSlackBatchLive({
    ...fixture.options,
    expected_batch_binding_sha256: batchSha256,
    transport_factory: async () => {
      factoryCalls += 1;
      throw new Error("transport must not be created");
    },
  });
  assert.equal(factoryCalls, 0);
  assert.equal(result.succeeded_count, 0);
  assert.equal(result.failed_count, 2);
  assert.deepEqual(result.error_code_counts, [{
    code: "channel_state_root_overlap",
    count: 2,
  }]);
});

test("batch binding byte drift is rejected before parsing or channel access", async () => {
  const fixture = await createBatchFixture();
  await writeFile(fixture.batchPath, `${JSON.stringify(fixture.batch)} \n`, "utf8");
  await assert.rejects(
    preflightSlackBatchLive(fixture.options),
    (error) => error instanceof SlackBatchLiveError
      && error.code === "private_json_digest_mismatch",
  );
});

async function createRuntimeFixture(
  entrypointSource = "export const fixture = true;\n",
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-slack-runtime-"));
  const runtimeRoot = path.join(root, "runtime");
  const launcherPath = path.join(
    runtimeRoot,
    "guild_hall",
    "slack_history",
    "slack_batch_live_launcher.mjs",
  );
  const entrypointPath = path.join(runtimeRoot, ...SLACK_BATCH_RUNTIME_ENTRYPOINT.split("/"));
  await mkdir(path.dirname(launcherPath), { recursive: true });
  await copyFile(path.join(MODULE_ROOT, "slack_batch_live_launcher.mjs"), launcherPath);
  await writeFile(entrypointPath, entrypointSource, "utf8");
  const files = [];
  for (const [relativePath, target] of [
    ["guild_hall/slack_history/slack_batch_live_cli.mjs", entrypointPath],
    ["guild_hall/slack_history/slack_batch_live_launcher.mjs", launcherPath],
  ]) {
    files.push({
      relative_path: relativePath,
      sha256: sha256Bytes(await readFile(target)),
    });
  }
  files.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  const manifest = {
    schema_version: SLACK_BATCH_RUNTIME_MANIFEST_SCHEMA_VERSION,
    entrypoint: SLACK_BATCH_RUNTIME_ENTRYPOINT,
    files,
  };
  const manifestPath = path.join(runtimeRoot, "slack-runtime-manifest.json");
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8");
  await writeFile(manifestPath, manifestBytes);
  return {
    root,
    runtimeRoot,
    launcherPath,
    entrypointPath,
    manifestPath,
    manifestSha256: sha256Bytes(manifestBytes),
    nodeSha256: sha256Bytes(await readFile(process.execPath)),
  };
}

test("exact runtime verifier pins manifest, Node, launcher, entrypoint, and entire tree", async () => {
  const fixture = await createRuntimeFixture();
  const result = await verifyExactSlackBatchRuntime({
    runtime_root: fixture.runtimeRoot,
    runtime_manifest_path: fixture.manifestPath,
    expected_runtime_manifest_sha256: fixture.manifestSha256,
    node_path: process.execPath,
    expected_node_sha256: fixture.nodeSha256,
    launcher_path: fixture.launcherPath,
  });
  assert.equal(result.verified_file_count, 2);
  await writeFile(path.join(fixture.runtimeRoot, "unmanifested.mjs"), "export {};\n", "utf8");
  await assert.rejects(
    verifyExactSlackBatchRuntime({
      runtime_root: fixture.runtimeRoot,
      runtime_manifest_path: fixture.manifestPath,
      expected_runtime_manifest_sha256: fixture.manifestSha256,
      node_path: process.execPath,
      expected_node_sha256: fixture.nodeSha256,
      launcher_path: fixture.launcherPath,
    }),
    (error) => error instanceof SlackBatchRuntimeError
      && error.code === "runtime_tree_manifest_mismatch",
  );
});

test("runtime inventory and manifest share one canonical mixed-case path order", async () => {
  const fixture = await createRuntimeFixture();
  const licensePath = path.join(fixture.runtimeRoot, "LICENSE");
  const distPath = path.join(fixture.runtimeRoot, "dist", "runtime.mjs");
  await mkdir(path.dirname(distPath), { recursive: true });
  await writeFile(licensePath, "synthetic license fixture\n", "utf8");
  await writeFile(distPath, "export const fixture = true;\n", "utf8");

  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  manifest.files.push(
    {
      relative_path: "LICENSE",
      sha256: sha256Bytes(await readFile(licensePath)),
    },
    {
      relative_path: "dist/runtime.mjs",
      sha256: sha256Bytes(await readFile(distPath)),
    },
  );
  manifest.files.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  assert.deepEqual(
    manifest.files.map((entry) => entry.relative_path),
    [
      "dist/runtime.mjs",
      "guild_hall/slack_history/slack_batch_live_cli.mjs",
      "guild_hall/slack_history/slack_batch_live_launcher.mjs",
      "LICENSE",
    ],
  );
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8");
  await writeFile(fixture.manifestPath, manifestBytes);
  const result = await verifyExactSlackBatchRuntime({
    runtime_root: fixture.runtimeRoot,
    runtime_manifest_path: fixture.manifestPath,
    expected_runtime_manifest_sha256: sha256Bytes(manifestBytes),
    node_path: process.execPath,
    expected_node_sha256: fixture.nodeSha256,
    launcher_path: fixture.launcherPath,
  });
  assert.equal(result.verified_file_count, 4);
});

test("copied runtime launcher performs verify-only without importing the entrypoint", async () => {
  const fixture = await createRuntimeFixture();
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    fixture.launcherPath,
    "--runtime-root", fixture.runtimeRoot,
    "--runtime-manifest", fixture.manifestPath,
    "--expected-runtime-manifest-sha256", fixture.manifestSha256,
    "--expected-node-sha256", fixture.nodeSha256,
    "--verify-only",
  ], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout), {
    mode: "runtime_verify",
    verified_file_count: 2,
    repository_writes: 0,
    private_writes: 0,
    network_used: false,
  });
});

test("runtime launcher injects its verified canonical root into entrypoint arguments", async () => {
  const fixture = await createRuntimeFixture(
    "process.stdout.write(`${JSON.stringify(process.argv.slice(2))}\\n`);\n",
  );
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    fixture.launcherPath,
    "--runtime-root", fixture.runtimeRoot,
    "--runtime-manifest", fixture.manifestPath,
    "--expected-runtime-manifest-sha256", fixture.manifestSha256,
    "--expected-node-sha256", fixture.nodeSha256,
    "--apply",
    "--repository-root", REPOSITORY_ROOT,
    "--batch-binding", path.join(fixture.root, "private", "batch.json"),
    "--expected-batch-binding-sha256", `sha256:${"0".repeat(64)}`,
  ], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(stderr, "");
  const forwarded = JSON.parse(stdout);
  assert.deepEqual(forwarded.slice(-2), ["--runtime-root", fixture.runtimeRoot]);
  assert.equal(forwarded.filter((entry) => entry === "--runtime-root").length, 1);
});

test("runtime verifier rejects pinned file drift and reparse members", async (t) => {
  const drift = await createRuntimeFixture();
  await writeFile(drift.entrypointPath, "export const fixture = false;\n", "utf8");
  await assert.rejects(
    verifyExactSlackBatchRuntime({
      runtime_root: drift.runtimeRoot,
      runtime_manifest_path: drift.manifestPath,
      expected_runtime_manifest_sha256: drift.manifestSha256,
      node_path: process.execPath,
      expected_node_sha256: drift.nodeSha256,
      launcher_path: drift.launcherPath,
    }),
    (error) => error instanceof SlackBatchRuntimeError
      && error.code === "runtime_file_digest_mismatch",
  );

  const reparse = await createRuntimeFixture();
  const linkPath = path.join(reparse.runtimeRoot, "linked-runtime");
  try {
    await symlink(path.dirname(reparse.entrypointPath), linkPath, "junction");
  } catch (error) {
    if (error?.code === "EPERM") {
      t.diagnostic("junction creation unavailable; reparse assertion skipped");
      return;
    }
    throw error;
  }
  await assert.rejects(
    verifyExactSlackBatchRuntime({
      runtime_root: reparse.runtimeRoot,
      runtime_manifest_path: reparse.manifestPath,
      expected_runtime_manifest_sha256: reparse.manifestSha256,
      node_path: process.execPath,
      expected_node_sha256: reparse.nodeSha256,
      launcher_path: reparse.launcherPath,
    }),
    (error) => error instanceof SlackBatchRuntimeError
      && error.code === "runtime_reparse_forbidden",
  );
});

test("runtime verifier refuses secret-shaped runtime members before hashing them", async () => {
  const fixture = await createRuntimeFixture();
  await writeFile(path.join(fixture.runtimeRoot, ".env"), "DO_NOT_READ=this-value\n", "utf8");
  await assert.rejects(
    verifyExactSlackBatchRuntime({
      runtime_root: fixture.runtimeRoot,
      runtime_manifest_path: fixture.manifestPath,
      expected_runtime_manifest_sha256: fixture.manifestSha256,
      node_path: process.execPath,
      expected_node_sha256: fixture.nodeSha256,
      launcher_path: fixture.launcherPath,
    }),
    (error) => error instanceof SlackBatchRuntimeError
      && error.code === "secret_file_forbidden",
  );
});

test("PowerShell registrar dry-run emits an attestation without task mutation", {
  skip: process.platform !== "win32",
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-slack-task-dry-run-"));
  const runtimeRoot = path.join(root, "runtime");
  const privateRoot = path.join(root, "private");
  const stateRoot = path.join(privateRoot, "state");
  const bindingPath = path.join(privateRoot, "config", "batch.json");
  const manifestPath = path.join(runtimeRoot, "runtime-manifest.json");
  const launcherPath = path.join(
    runtimeRoot,
    "guild_hall",
    "slack_history",
    "slack_batch_live_launcher.mjs",
  );
  await Promise.all([
    mkdir(path.dirname(bindingPath), { recursive: true }),
    mkdir(path.dirname(launcherPath), { recursive: true }),
  ]);
  const bindingSha256 = await writePinnedJson(bindingPath, {
    schema_version: "soulforge.slack_batch_live.binding.v1",
    feature_enabled: true,
    private_root: privateRoot,
    state_root: stateRoot,
  });
  const manifestSha256 = await writePinnedJson(manifestPath, {
    fixture: "registrar-dry-run-only",
  });
  await writeFile(launcherPath, [
    "process.stdout.write(`${JSON.stringify({",
    '  mode: "preflight",',
    "  configured_count: 1,",
    "  succeeded_count: 1,",
    "  failed_count: 0,",
    "  repository_writes: 0,",
    "  private_writes: 0,",
    "  network_used: false,",
    "})}\\n`);",
    "",
  ].join("\n"), "utf8");
  const harnessPath = path.join(root, "registrar-harness.ps1");
  await writeFile(harnessPath, [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    "function Get-ScheduledTask {",
    "  [CmdletBinding()]",
    "  param([string]$TaskName)",
    "  return $null",
    "}",
    "& $env:SLACK_TASK_REGISTRAR `",
    "  -RuntimeRoot $env:SLACK_TASK_RUNTIME `",
    "  -RepoRoot $env:SLACK_TASK_REPO `",
    "  -PrivateRoot $env:SLACK_TASK_PRIVATE `",
    "  -StateRoot $env:SLACK_TASK_STATE `",
    "  -BatchBindingPath $env:SLACK_TASK_BINDING `",
    "  -BatchBindingSha256 $env:SLACK_TASK_BINDING_SHA `",
    "  -RuntimeManifestPath $env:SLACK_TASK_MANIFEST `",
    "  -RuntimeManifestSha256 $env:SLACK_TASK_MANIFEST_SHA `",
    "  -NodePath $env:SLACK_TASK_NODE `",
    "  -NodeSha256 $env:SLACK_TASK_NODE_SHA",
    "",
  ].join("\r\n"), "utf8");
  const powershell = path.join(
    process.env.SystemRoot ?? path.win32.join("C:", path.win32.sep, "Windows"),
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const { stdout, stderr } = await execFileAsync(powershell, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", harnessPath,
  ], {
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      SLACK_TASK_REGISTRAR: TASK_REGISTRAR_PATH,
      SLACK_TASK_RUNTIME: runtimeRoot,
      SLACK_TASK_REPO: REPOSITORY_ROOT,
      SLACK_TASK_PRIVATE: privateRoot,
      SLACK_TASK_STATE: stateRoot,
      SLACK_TASK_BINDING: bindingPath,
      SLACK_TASK_BINDING_SHA: bindingSha256,
      SLACK_TASK_MANIFEST: manifestPath,
      SLACK_TASK_MANIFEST_SHA: manifestSha256,
      SLACK_TASK_NODE: process.execPath,
      SLACK_TASK_NODE_SHA: sha256Bytes(await readFile(process.execPath)),
    },
  });
  assert.equal(stderr, "");
  assert.match(stdout, /^slack batch task dry-run attested: plan_digest=sha256:[0-9a-f]{64} triggers=2 mutation=false\r?\n$/u);
});

test("PowerShell registrar removes a newly registered task when XML attestation fails", {
  skip: process.platform !== "win32",
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-slack-task-rollback-"));
  const runtimeRoot = path.join(root, "runtime");
  const privateRoot = path.join(root, "private");
  const stateRoot = path.join(privateRoot, "state");
  const bindingPath = path.join(privateRoot, "config", "batch.json");
  const manifestPath = path.join(runtimeRoot, "runtime-manifest.json");
  const launcherPath = path.join(
    runtimeRoot,
    "guild_hall",
    "slack_history",
    "slack_batch_live_launcher.mjs",
  );
  await Promise.all([
    mkdir(path.dirname(bindingPath), { recursive: true }),
    mkdir(path.dirname(launcherPath), { recursive: true }),
  ]);
  const bindingSha256 = await writePinnedJson(bindingPath, {
    schema_version: "soulforge.slack_batch_live.binding.v1",
    feature_enabled: true,
    private_root: privateRoot,
    state_root: stateRoot,
  });
  const manifestSha256 = await writePinnedJson(manifestPath, {
    fixture: "registrar-rollback",
  });
  await writeFile(launcherPath, [
    "process.stdout.write(`${JSON.stringify({",
    '  mode: "preflight", configured_count: 1, succeeded_count: 1, failed_count: 0,',
    "  repository_writes: 0, private_writes: 0, network_used: false,",
    "})}\\n`);",
    "",
  ].join("\n"), "utf8");
  const harnessPath = path.join(root, "registrar-rollback-harness.ps1");
  await writeFile(harnessPath, [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    "$global:SlackTaskExists = $false",
    "$global:SlackTaskRegisterCount = 0",
    "$global:SlackTaskDisableCount = 0",
    "$global:SlackTaskUnregisterCount = 0",
    "function Get-ScheduledTask { [CmdletBinding()] param([string]$TaskName) if ($global:SlackTaskExists) { return [pscustomobject]@{ State = 'Ready' } } return $null }",
    "function New-ScheduledTaskAction { [CmdletBinding()] param($Execute,$Argument,$WorkingDirectory) return [pscustomobject]@{} }",
    "function New-ScheduledTaskTrigger { [CmdletBinding()] param([switch]$Daily,$At) return [pscustomobject]@{} }",
    "function New-ScheduledTaskPrincipal { [CmdletBinding()] param($UserId,$LogonType,$RunLevel) return [pscustomobject]@{} }",
    "function New-ScheduledTaskSettingsSet { [CmdletBinding()] param($MultipleInstances,$RestartCount,$RestartInterval,$ExecutionTimeLimit,[switch]$StartWhenAvailable,[switch]$Hidden,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries) return [pscustomobject]@{} }",
    "function Register-ScheduledTask { [CmdletBinding()] param($TaskName,$Action,$Trigger,$Principal,$Settings,$Description,[switch]$Force,$Xml) $global:SlackTaskRegisterCount += 1; $global:SlackTaskExists = $true; return [pscustomobject]@{} }",
    "function Export-ScheduledTask { [CmdletBinding()] param($TaskName) return '<Task><Triggers /></Task>' }",
    "function Disable-ScheduledTask { [CmdletBinding()] param($TaskName) $global:SlackTaskDisableCount += 1; return [pscustomobject]@{} }",
    "function Unregister-ScheduledTask { [CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')] param($TaskName) $global:SlackTaskUnregisterCount += 1; $global:SlackTaskExists = $false }",
    "$Common = @{",
    "  RuntimeRoot = $env:SLACK_TASK_RUNTIME; RepoRoot = $env:SLACK_TASK_REPO;",
    "  PrivateRoot = $env:SLACK_TASK_PRIVATE; StateRoot = $env:SLACK_TASK_STATE;",
    "  BatchBindingPath = $env:SLACK_TASK_BINDING; BatchBindingSha256 = $env:SLACK_TASK_BINDING_SHA;",
    "  RuntimeManifestPath = $env:SLACK_TASK_MANIFEST; RuntimeManifestSha256 = $env:SLACK_TASK_MANIFEST_SHA;",
    "  NodePath = $env:SLACK_TASK_NODE; NodeSha256 = $env:SLACK_TASK_NODE_SHA",
    "}",
    "$Dry = & $env:SLACK_TASK_REGISTRAR @Common",
    "$Match = [regex]::Match(($Dry -join \"`n\"), 'plan_digest=(sha256:[0-9a-f]{64})')",
    "if (-not $Match.Success) { throw 'dry-run digest unavailable' }",
    "$Caught = $false",
    "$CaughtMessage = $null",
    "try { & $env:SLACK_TASK_REGISTRAR @Common -Register -ExpectedDryRunDigest $Match.Groups[1].Value -Confirm:$false } catch { $Caught = $true; $CaughtMessage = $_.Exception.Message }",
    "[ordered]@{ caught=$Caught; caught_message=$CaughtMessage; register_count=$global:SlackTaskRegisterCount; disable_count=$global:SlackTaskDisableCount; unregister_count=$global:SlackTaskUnregisterCount; exists=$global:SlackTaskExists } | ConvertTo-Json -Compress",
    "",
  ].join("\r\n"), "utf8");
  const powershell = path.join(
    process.env.SystemRoot ?? path.win32.join("C:", path.win32.sep, "Windows"),
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const { stdout, stderr } = await execFileAsync(powershell, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", harnessPath,
  ], {
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      SLACK_TASK_REGISTRAR: TASK_REGISTRAR_PATH,
      SLACK_TASK_RUNTIME: runtimeRoot,
      SLACK_TASK_REPO: REPOSITORY_ROOT,
      SLACK_TASK_PRIVATE: privateRoot,
      SLACK_TASK_STATE: stateRoot,
      SLACK_TASK_BINDING: bindingPath,
      SLACK_TASK_BINDING_SHA: bindingSha256,
      SLACK_TASK_MANIFEST: manifestPath,
      SLACK_TASK_MANIFEST_SHA: manifestSha256,
      SLACK_TASK_NODE: process.execPath,
      SLACK_TASK_NODE_SHA: sha256Bytes(await readFile(process.execPath)),
    },
  });
  assert.equal(stderr, "");
  const result = JSON.parse(stdout.trim());
  assert.equal(result.caught, true, result.caught_message);
  assert.equal(result.register_count, 1, result.caught_message);
  assert.equal(result.disable_count, 1, result.caught_message);
  assert.equal(result.unregister_count, 1, result.caught_message);
  assert.equal(result.exists, false, result.caught_message);
});
