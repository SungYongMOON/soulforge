import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createSlackCoverageReceipt,
  validateSlackCoverageReceipt,
} from "./slack_history.mjs";
import {
  DEFAULT_ARCHIVE_COVERAGE_GAPS,
  SLACK_ARCHIVE_COVERAGE_NOTICE,
  SLACK_ARCHIVE_QUERY_SCHEMA_VERSION,
  SLACK_ARCHIVE_SCHEMA_VERSION,
  SLACK_ARCHIVE_STATUS_SCHEMA_VERSION,
  SlackArchiveError,
  assertSafeArchiveOutput,
  createSlackArchiveIndex,
  slackTsToIso,
  slackTsToMs,
  validateArchiveRecord,
  validateSlackArchiveCoverage,
  validateSlackArchiveEnvelope,
} from "./slack_archive_query.mjs";
import {
  READ_ONLY,
  SLACK_ARCHIVE_MCP_BINDING_SCHEMA_VERSION,
  SLACK_ARCHIVE_MCP_INSTRUCTIONS,
  SLACK_ARCHIVE_MCP_TOOLS,
  assertRuntimeBindingAllowed,
  createSlackArchiveJsonRpcHandler,
  createSlackArchiveMcpHandlers,
  validateSlackArchiveMcpBinding,
} from "./slack_archive_mcp_adapter.mjs";
import {
  parseCliArguments,
  readBoundedRegularFile,
  runSlackArchiveStdioServer,
} from "./slack_archive_mcp_server.mjs";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(moduleDirectory, "slack_archive_query.schema.json");
const fixturePath = path.join(moduleDirectory, "fixtures", "synthetic_slack_archive.json");

const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const fixtureText = await readFile(fixturePath, "utf8");
const fixture = JSON.parse(fixtureText);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertArchiveErrorCode(action, expectedCode) {
  assert.throws(action, (error) => (
    error instanceof SlackArchiveError && error.code === expectedCode
  ));
}

function materializeSyntheticArchive() {
  const revisionRefs = new Map();
  const materializedRecords = [];

  for (const raw of fixture.records) {
    const supersedesRef = raw.supersedes_alias
      ? revisionRefs.get(raw.supersedes_alias)
      : (raw.supersedes_revision_ref || null);

    const recordInput = {
      revision_kind: raw.revision_kind,
      workspace_id: raw.workspace_id,
      channel_id: raw.channel_id,
      message_ts: raw.message_ts,
      thread_ts: raw.thread_ts,
      revision_ts: raw.revision_ts,
      actor: deepClone(raw.actor),
      source_metadata_digest: raw.source_metadata_digest,
      text: raw.text ?? null,
      attachment_pointers: deepClone(raw.attachment_pointers || []),
      supersedes_revision_ref: supersedesRef,
      received_at: raw.received_at,
    };

    const validated = validateArchiveRecord(recordInput);
    if (raw.revision_alias) {
      revisionRefs.set(raw.revision_alias, validated.revision_ref);
    }
    materializedRecords.push(validated);
  }

  return {
    binding: deepClone(fixture.binding),
    coverage: deepClone(fixture.coverage),
    records: materializedRecords,
  };
}

test("synthetic Slack archive fixture parses and passes strict JSON schema and canonical coverage validation", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(fixture);
  assert.equal(valid, true, JSON.stringify(validate.errors, null, 2));

  const { records } = materializeSyntheticArchive();
  const expectedCoverage = createSlackCoverageReceipt({
    workspace_id: fixture.binding.workspace_id,
    channel_id: fixture.binding.channel_id,
    binding_id: fixture.binding.binding_id,
    project_code: fixture.binding.project_code,
    window_start: fixture.coverage.window_start,
    window_end: fixture.coverage.window_end,
    state: "partial",
    event_count: records.length,
    gap_codes: fixture.coverage.gap_codes,
    applicability_ref: null,
    revision_refs: records.map((r) => r.revision_ref),
  });

  assert.deepEqual(fixture.coverage, expectedCoverage);
  const validatedCoverage = validateSlackCoverageReceipt(fixture.coverage);
  assert.equal(validatedCoverage.state, "partial");
  assert.equal(validatedCoverage.event_count, 8);
  assert.equal(validatedCoverage.revision_refs.length, 8);
});

test("source fixture file is not mutated during test execution", async () => {
  const currentBytes = await readFile(fixturePath, "utf8");
  assert.equal(currentBytes, fixtureText, "Fixture content must remain byte-identical and unmutated");
});

test("message-time ordering vs backup time is strictly preserved", () => {
  const { binding, coverage, records } = materializeSyntheticArchive();
  const index = createSlackArchiveIndex({ binding, coverage, records });

  const timelineResult = index.timeline();
  assert.equal(timelineResult.returned_count >= 2, true);
  assert.equal(timelineResult.ordering_field, "message_ts");
  assert.equal(timelineResult.time_dimension, "message_time");

  const msg1 = timelineResult.messages.find((m) => m.message_ts === "1720000000.000100");
  const msg2 = timelineResult.messages.find((m) => m.message_ts === "1720000000.000200");
  assert.ok(msg1);
  assert.ok(msg2);

  assert.equal(msg1.message_ts < msg2.message_ts, true);
  assert.equal(msg1.received_at > msg2.received_at, true);

  const msg1Index = timelineResult.messages.indexOf(msg1);
  const msg2Index = timelineResult.messages.indexOf(msg2);
  assert.equal(msg1Index < msg2Index, true, "Message with earlier post time must appear before message with later post time");

  const searchResult = index.search({ query: "Synthetic" });
  assert.equal(searchResult.ordering_field, "message_ts");
  const searchMsg1Idx = searchResult.results.findIndex((m) => m.message_ts === "1720000000.000100");
  const searchMsg2Idx = searchResult.results.findIndex((m) => m.message_ts === "1720000000.000200");
  assert.equal(searchMsg1Idx < searchMsg2Idx, true, "Search results must be ordered by message_ts");
});

test("separate time filters operate on distinct dimensions and reject null received_at", () => {
  const { binding, coverage, records } = materializeSyntheticArchive();
  const index = createSlackArchiveIndex({ binding, coverage, records });

  // 1. Filter by Slack message timestamp
  const tsSearch = index.search({
    since_message_ts: "1720000000.000200",
    until_message_ts: "1720000000.000400",
  });
  assert.equal(tsSearch.results.every((m) => m.message_ts >= "1720000000.000200" && m.message_ts <= "1720000000.000400"), true);

  // 2. Filter by ISO message time
  const isoSearch = index.search({
    since_message_time: "2024-07-01T00:00:00.000Z",
    until_message_time: "2024-07-04T00:00:00.000Z",
  });
  assert.equal(isoSearch.results.length, 5);

  const isoSearchPast = index.search({
    until_message_time: "2024-07-01T00:00:00.000Z",
  });
  assert.equal(isoSearchPast.results.length, 0);

  // 3. Filter by received_at (collection arrival time)
  const receivedSearch = index.search({
    since_received_at: "2026-07-03T02:00:00.000Z",
    until_received_at: "2026-07-03T05:00:00.000Z",
  });
  assert.equal(receivedSearch.results.length >= 1, true);
  assert.equal(receivedSearch.results.every((m) => m.received_at !== null && m.received_at >= "2026-07-03T02:00:00.000Z" && m.received_at <= "2026-07-03T05:00:00.000Z"), true);

  // 4. Record with null received_at is excluded when received_at bounds are applied
  const recordsWithNullReceived = deepClone(records);
  recordsWithNullReceived[0].received_at = null;
  const indexWithNull = createSlackArchiveIndex({ binding, coverage, records: recordsWithNullReceived });

  const searchNullRec = indexWithNull.search({
    since_received_at: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(searchNullRec.results.some((m) => m.message_ref === recordsWithNullReceived[0].message_ref), false);
});

test("timeline direction desc accurately reverses chronological order", () => {
  const { binding, coverage, records } = materializeSyntheticArchive();
  const index = createSlackArchiveIndex({ binding, coverage, records });

  const ascTimeline = index.timeline({ direction: "asc" });
  const descTimeline = index.timeline({ direction: "desc" });

  assert.equal(ascTimeline.returned_count, descTimeline.returned_count);
  assert.equal(ascTimeline.direction, "asc");
  assert.equal(descTimeline.direction, "desc");

  const ascFirst = ascTimeline.messages[0].message_ts;
  const descLast = descTimeline.messages.at(-1).message_ts;
  assert.equal(ascFirst, descLast);

  const ascLast = ascTimeline.messages.at(-1).message_ts;
  const descFirst = descTimeline.messages[0].message_ts;
  assert.equal(ascLast, descFirst);
});

test("attachment filters in search isolate messages with and without attachments", () => {
  const { binding, coverage, records } = materializeSyntheticArchive();
  const index = createSlackArchiveIndex({ binding, coverage, records });

  const withAttachments = index.search({ has_attachments: true });
  assert.equal(withAttachments.results.length >= 1, true);
  assert.equal(withAttachments.results.every((m) => m.attachment_pointers.length > 0), true);

  const withoutAttachments = index.search({ has_attachments: false });
  assert.equal(withoutAttachments.results.length >= 1, true);
  assert.equal(withoutAttachments.results.every((m) => m.attachment_pointers.length === 0), true);
});

test("edit and revision behavior resolves latest content and marks deletions", () => {
  const { binding, coverage, records } = materializeSyntheticArchive();
  const index = createSlackArchiveIndex({ binding, coverage, records });

  const searchEdited = index.search({ query: "review comments" });
  assert.equal(searchEdited.returned_count, 1);
  assert.equal(searchEdited.results[0].message_ts, "1720000000.000200");
  assert.equal(searchEdited.results[0].revision_kind, "edit");
  assert.equal(searchEdited.results[0].revision_count, 2);
  assert.equal(searchEdited.results[0].text, "Synthetic architecture draft discussion updated with review comments");

  const searchOriginal = index.search({ query: "draft discussion" });
  assert.equal(searchOriginal.returned_count, 1);
  assert.equal(searchOriginal.results[0].text, "Synthetic architecture draft discussion updated with review comments");

  const searchDeleted = index.search({ query: "temporary announcement" });
  assert.equal(searchDeleted.returned_count, 0, "Deleted messages must be omitted from standard search by default");

  const timelineWithDeleted = index.timeline({ include_deleted: true });
  const deletedItem = timelineWithDeleted.messages.find((m) => m.message_ts === "1720000000.000600");
  assert.ok(deletedItem);
  assert.equal(deletedItem.is_deleted, true);
  assert.equal(deletedItem.text, null);
  assert.equal(deletedItem.source_metadata_digest, null);
  assert.equal(deletedItem.attachment_pointers.length, 0);
  assert.equal(deletedItem.revision_kind, "delete");
});

test("thread grouping accurately isolates root message and replies", () => {
  const { binding, coverage, records } = materializeSyntheticArchive();
  const index = createSlackArchiveIndex({ binding, coverage, records });

  const threadRes = index.thread({ thread_ts: "1720000000.000300" });
  assert.ok(threadRes.root_message);
  assert.equal(threadRes.root_message.message_ts, "1720000000.000300");
  assert.equal(threadRes.root_message.text, "Synthetic question regarding interface specifications");
  assert.equal(threadRes.reply_count, 2);
  assert.equal(threadRes.returned_reply_count, 2);
  assert.equal(threadRes.replies[0].message_ts, "1720000000.000400");
  assert.equal(threadRes.replies[0].thread_ts, "1720000000.000300");
  assert.equal(threadRes.replies[1].message_ts, "1720000000.000500");
  assert.equal(threadRes.replies[1].thread_ts, "1720000000.000300");
  assert.equal(threadRes.coverage_notice, SLACK_ARCHIVE_COVERAGE_NOTICE);

  const nonExistent = index.thread({ thread_ts: "1720000000.000999" });
  assert.equal(nonExistent.root_message, null);
  assert.equal(nonExistent.reply_count, 0);
  assert.equal(nonExistent.replies.length, 0);

  assertArchiveErrorCode(
    () => index.thread({ thread_ts: "not_a_ts" }),
    "thread_ts_invalid",
  );
});

test("coverage validation enforces canonical receipt schema and fail-closed: complete state is rejected as unsupported/forgery", () => {
  const { binding, records, coverage } = materializeSyntheticArchive();

  // 1. Canonical fixture coverage passes
  const validated = validateSlackArchiveCoverage(coverage);
  assert.equal(validated.schema_version, "soulforge.slack_history.coverage.v1");
  assert.equal(validated.state, "partial");
  assert.deepEqual(validated.gap_codes, [
    "deletions_unproven",
    "thread_replies_not_collected",
    "unallowlisted_channels_omitted",
  ]);

  // 2. Forged complete state is refused as unsupported in v0
  const completeCoverageInput = {
    workspace_id: binding.workspace_id,
    channel_id: binding.channel_id,
    binding_id: binding.binding_id,
    project_code: binding.project_code,
    window_start: "2026-07-01T00:00:00.000Z",
    window_end: "2026-07-31T00:00:00.000Z",
    state: "complete_with_events",
    event_count: 1,
    gap_codes: [],
    applicability_ref: null,
    revision_refs: [records[0].revision_ref],
  };
  const completeReceipt = createSlackCoverageReceipt(completeCoverageInput);

  assertArchiveErrorCode(
    () => validateSlackArchiveCoverage(completeReceipt),
    "coverage_state_unsupported",
  );

  // 3. Index creation with complete coverage fails closed
  assertArchiveErrorCode(
    () => createSlackArchiveIndex({
      binding,
      records,
      coverage: completeReceipt,
    }),
    "coverage_state_unsupported",
  );

  // 4. Coverage scope mismatch against binding in envelope is rejected
  const mismatchedCoverageInput = {
    ...completeCoverageInput,
    channel_id: "C99999999",
    state: "partial",
    gap_codes: ["some_gap"],
  };
  const mismatchedCoverage = createSlackCoverageReceipt(mismatchedCoverageInput);

  assertArchiveErrorCode(
    () => validateSlackArchiveEnvelope({
      schema_version: SLACK_ARCHIVE_SCHEMA_VERSION,
      binding,
      coverage: mismatchedCoverage,
      records,
    }),
    "coverage_scope_mismatch",
  );

  // 5. Incomplete / non-canonical coverage shape rejected
  assertArchiveErrorCode(
    () => validateSlackArchiveCoverage({ state: "partial", gap_codes: ["gap"] }),
    "missing_field",
  );
  assertArchiveErrorCode(
    () => validateSlackArchiveCoverage({ ...coverage, schema_version: "wrong_version" }),
    "coverage_schema_version_invalid",
  );
});

test("ordinary public URLs in text are allowed while authenticated Slack locators/secrets fail closed", () => {
  // 1. Ordinary public documentation URL in text is allowed
  const validRecordWithPublicUrl = validateArchiveRecord({
    revision_kind: "message",
    workspace_id: "T00000001",
    channel_id: "C00000001",
    message_ts: "1720000000.000100",
    thread_ts: null,
    revision_ts: "1720000000.000100",
    actor: { slack_user_id: "U00000001", erp_account_ref: null },
    source_metadata_digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    text: "Please review the RFC at https://example.com/specs/v1 and http://docs.org/guide",
    attachment_pointers: [],
    supersedes_revision_ref: null,
  });
  assert.ok(validRecordWithPublicUrl.text);

  // 2. Authenticated Slack file locator is forbidden
  assertArchiveErrorCode(
    () => assertSafeArchiveOutput("https://files.slack.com/files-pri/T0123/download"),
    "unsafe_output_detected",
  );
  assertArchiveErrorCode(
    () => assertSafeArchiveOutput("https://workspace.slack.com/files-upload/F123/upload"),
    "unsafe_output_detected",
  );

  // 3. Local drive paths, secrets, byte buffers are forbidden
  const driveLetter = String.fromCharCode(67);
  const forbiddenWinPath = `${driveLetter}:\\sensitive\\private.json`;
  assertArchiveErrorCode(() => assertSafeArchiveOutput(forbiddenWinPath), "unsafe_output_detected");
  assertArchiveErrorCode(() => assertSafeArchiveOutput("/etc/passwd"), "unsafe_output_detected");
  assertArchiveErrorCode(() => assertSafeArchiveOutput("../../../_workmeta/credentials"), "unsafe_output_detected");
  assertArchiveErrorCode(() => assertSafeArchiveOutput("xoxb-123456789012-123456789012-abcdef123456"), "unsafe_output_detected");
  assertArchiveErrorCode(() => assertSafeArchiveOutput("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "unsafe_output_detected");
  assertArchiveErrorCode(() => assertSafeArchiveOutput(Buffer.from("raw bytes")), "attachment_bytes_forbidden");
});

test("strict MCP runtime binding envelope validation and scope enforcement", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "slack-bind-test-"));
  try {
    const privateRoot = path.join(tempDir, "private");
    const archivePath = path.join(privateRoot, "archives", "archive.json");
    const outsideArchive = path.join(tempDir, "other", "archive.json");
    const validSha = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const validEnvelope = {
      schema_version: SLACK_ARCHIVE_MCP_BINDING_SCHEMA_VERSION,
      feature_enabled: true,
      private_root: privateRoot,
      archive_path: archivePath,
      archive_sha256: validSha,
      max_archive_bytes: 10485760,
      scope: {
        binding_id: "slack-bind:T00000001:C00000001",
        workspace_id: "T00000001",
        channel_id: "C00000001",
        project_code: "P00-SYNTH",
      },
    };

    const validated = validateSlackArchiveMcpBinding(validEnvelope);
    assert.equal(validated.schema_version, SLACK_ARCHIVE_MCP_BINDING_SCHEMA_VERSION);
    assert.equal(validated.feature_enabled, true);

    // Extra keys rejected
    assertArchiveErrorCode(
      () => validateSlackArchiveMcpBinding({ ...validEnvelope, extra_key: "forbidden" }),
      "extra_binding_field",
    );

    // Feature disabled rejected
    assertArchiveErrorCode(
      () => validateSlackArchiveMcpBinding({ ...validEnvelope, feature_enabled: false }),
      "feature_disabled",
    );

    // Archive path outside private_root rejected
    assertArchiveErrorCode(
      () => validateSlackArchiveMcpBinding({ ...validEnvelope, archive_path: outsideArchive }),
      "archive_outside_private_root",
    );

    // Extra scope keys rejected
    assertArchiveErrorCode(
      () => validateSlackArchiveMcpBinding({
        ...validEnvelope,
        scope: { ...validEnvelope.scope, extra_scope: "bad" },
      }),
      "extra_scope_field",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("local stdio MCP JSON-RPC adapter handles protocol methods and enforces runtime binding scope", async () => {
  const { binding, coverage, records } = materializeSyntheticArchive();
  const index = createSlackArchiveIndex({ binding, coverage, records });

  assert.throws(
    () => createSlackArchiveJsonRpcHandler({ index, runtimeBinding: null }),
    (error) => error instanceof SlackArchiveError && error.code === "runtime_binding_required",
  );

  const mismatchedBinding = {
    ...binding,
    channel_id: "C99999999",
  };
  assert.throws(
    () => createSlackArchiveJsonRpcHandler({ index, runtimeBinding: mismatchedBinding }),
    (error) => error instanceof SlackArchiveError && error.code === "binding_scope_mismatch",
  );

  const mismatchedProject = {
    ...binding,
    project_code: "P99-OTHER",
  };
  assert.throws(
    () => createSlackArchiveJsonRpcHandler({ index, runtimeBinding: mismatchedProject }),
    (error) => error instanceof SlackArchiveError && error.code === "binding_project_mismatch",
  );

  const handleMessage = createSlackArchiveJsonRpcHandler({
    index,
    runtimeBinding: binding,
  });

  // 1. tools/list before initialize is rejected
  const preInitList = await handleMessage({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/list",
  });
  assert.equal(preInitList.error.code, -32600);
  assert.equal(preInitList.error.data.code, "server_not_initialized");

  // 2. tools/call before initialize is rejected
  const preInitCall = await handleMessage({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "slack_archive_status", arguments: {} },
  });
  assert.equal(preInitCall.error.code, -32600);
  assert.equal(preInitCall.error.data.code, "server_not_initialized");

  // 3. initialize with unsupported protocolVersion is rejected
  const badInit = await handleMessage({
    jsonrpc: "2.0",
    id: 12,
    method: "initialize",
    params: { protocolVersion: "2024-01-01" },
  });
  assert.equal(badInit.error.code, -32602);
  assert.equal(badInit.error.data.code, "unsupported_protocol_version");

  // 4. Valid initialize call succeeds
  const initRes = await handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18" },
  });
  assert.equal(initRes.result.serverInfo.name, "soulforge-slack-archive-query");
  assert.equal(initRes.result.protocolVersion, "2025-06-18");
  assert.equal(initRes.result.instructions, SLACK_ARCHIVE_MCP_INSTRUCTIONS);
  assert.equal(initRes.result._meta.read_only, true);

  const notifyRes = await handleMessage({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  assert.equal(notifyRes.notification, true);

  const pingRes = await handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "ping",
  });
  assert.equal(pingRes.result._meta.status, "ok");

  const listRes = await handleMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/list",
  });
  assert.equal(listRes.result.tools.length, 5);

  const statusCall = await handleMessage({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "slack_archive_status",
      arguments: {},
    },
  });
  assert.ok(statusCall.result.structuredContent);
  assert.equal(statusCall.result.structuredContent.workspace_id, "T00000001");
  assert.equal(statusCall.result.structuredContent.coverage_state, "partial");

  const searchCall = await handleMessage({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "slack_archive_search",
      arguments: { query: "architecture" },
    },
  });
  assert.equal(searchCall.result.structuredContent.returned_count, 1);

  const threadCall = await handleMessage({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "slack_archive_thread",
      arguments: { thread_ts: "1720000000.000300" },
    },
  });
  assert.equal(threadCall.result.structuredContent.reply_count, 2);

  const unknownCall = await handleMessage({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "slack_archive_nonexistent",
      arguments: {},
    },
  });
  assert.equal(unknownCall.error.code, -32602);
  assert.equal(unknownCall.error.data.code, "unknown_tool");
});

test("tools/call arguments validation rejects unknown arguments and out-of-bounds parameters", async () => {
  const { binding, coverage, records } = materializeSyntheticArchive();
  const index = createSlackArchiveIndex({ binding, coverage, records });
  const handleMessage = createSlackArchiveJsonRpcHandler({ index, runtimeBinding: binding });
  await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });

  // 1. Unknown argument in status
  const statusUnknown = await handleMessage({
    jsonrpc: "2.0",
    id: 101,
    method: "tools/call",
    params: {
      name: "slack_archive_status",
      arguments: { injected_param: "evil" },
    },
  });
  assert.equal(statusUnknown.error.code, -32602);
  assert.equal(statusUnknown.error.data.code, "unknown_argument");

  // 2. Unknown argument in search
  const searchUnknown = await handleMessage({
    jsonrpc: "2.0",
    id: 102,
    method: "tools/call",
    params: {
      name: "slack_archive_search",
      arguments: { secret_token: "xoxb-12345" },
    },
  });
  assert.equal(searchUnknown.error.code, -32602);
  assert.equal(searchUnknown.error.data.code, "unknown_argument");

  // 3. Out of bounds limit in search
  const searchBadLimit = await handleMessage({
    jsonrpc: "2.0",
    id: 103,
    method: "tools/call",
    params: {
      name: "slack_archive_search",
      arguments: { limit: 999 },
    },
  });
  assert.equal(searchBadLimit.error.code, -32602);
  assert.equal(searchBadLimit.error.data.code, "invalid_arguments");

  // 4. Missing required thread_ts in thread
  const threadMissing = await handleMessage({
    jsonrpc: "2.0",
    id: 104,
    method: "tools/call",
    params: {
      name: "slack_archive_thread",
      arguments: {},
    },
  });
  assert.equal(threadMissing.error.code, -32602);
  assert.equal(threadMissing.error.data.code, "missing_required_argument");

  // 5. Non-object arguments
  const nonObjectArgs = await handleMessage({
    jsonrpc: "2.0",
    id: 105,
    method: "tools/call",
    params: {
      name: "slack_archive_status",
      arguments: ["array_is_invalid"],
    },
  });
  assert.equal(nonObjectArgs.error.code, -32602);
  assert.equal(nonObjectArgs.error.data.code, "invalid_arguments");
});

test("server CLI arguments parser requires absolute paths, pinned sha256, and rejects relative paths", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "slack-cli-test-"));
  try {
    const absBinding = path.join(tempDir, "binding.json");
    const absArchive = path.join(tempDir, "archive.json");
    const validSha = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const valid = parseCliArguments([
      "--binding", absBinding,
      "--archive", absArchive,
      "--expected-archive-sha256", validSha,
    ]);
    assert.equal(valid.error, undefined);
    assert.equal(valid.expectedArchiveSha256, validSha);

    const relativeBinding = parseCliArguments([
      "--binding", path.join("relative", "binding.json"),
      "--archive", absArchive,
      "--expected-archive-sha256", validSha,
    ]);
    assert.equal(relativeBinding.error, "binding_path_must_be_absolute");

    const relativeArchive = parseCliArguments([
      "--binding", absBinding,
      "--archive", path.join("relative", "archive.json"),
      "--expected-archive-sha256", validSha,
    ]);
    assert.equal(relativeArchive.error, "archive_path_must_be_absolute");

    const missingSha = parseCliArguments([
      "--binding", absBinding,
      "--archive", absArchive,
    ]);
    assert.equal(missingSha.error, "expected_archive_sha256_required");

    const invalidSha = parseCliArguments([
      "--binding", absBinding,
      "--archive", absArchive,
      "--expected-archive-sha256", "not-a-sha",
    ]);
    assert.equal(invalidSha.error, "expected_archive_sha256_invalid");

    const unknownFlag = parseCliArguments([
      "--binding", absBinding,
      "--archive", absArchive,
      "--expected-archive-sha256", validSha,
      "--injected_flag", "val",
    ]);
    assert.equal(unknownFlag.error, "unknown_flag");
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("guarded file reading and server runtime enforcement with strict envelope verification", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "slack-archive-test-"));

  try {
    const privateRoot = path.join(tempDir, "private");
    const outsideRoot = path.join(tempDir, "outside");
    const archiveDir = path.join(privateRoot, "archives");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(archiveDir, { recursive: true });
    await mkdir(outsideRoot, { recursive: true });

    const bindingPath = path.join(privateRoot, "binding.json");
    const archivePath = path.join(archiveDir, "archive.json");
    const outsideArchivePath = path.join(outsideRoot, "escaped_archive.json");

    const { binding: canonicalBinding, coverage, records } = materializeSyntheticArchive();
    const validArchivePayload = {
      schema_version: SLACK_ARCHIVE_SCHEMA_VERSION,
      binding: canonicalBinding,
      coverage,
      records,
    };
    const validArchiveJson = JSON.stringify(validArchivePayload, null, 2);
    const validArchiveSha256 = `sha256:${createHash("sha256").update(Buffer.from(validArchiveJson, "utf8")).digest("hex")}`;

    await writeFile(archivePath, validArchiveJson, "utf8");
    await writeFile(outsideArchivePath, validArchiveJson, "utf8");

    const validMcpBinding = {
      schema_version: SLACK_ARCHIVE_MCP_BINDING_SCHEMA_VERSION,
      feature_enabled: true,
      private_root: privateRoot,
      archive_path: archivePath,
      archive_sha256: validArchiveSha256,
      max_archive_bytes: 10485760,
      scope: {
        binding_id: canonicalBinding.binding_id,
        workspace_id: canonicalBinding.workspace_id,
        channel_id: canonicalBinding.channel_id,
        project_code: canonicalBinding.project_code,
      },
    };

    const validBindingJson = JSON.stringify(validMcpBinding, null, 2);
    await writeFile(bindingPath, validBindingJson, "utf8");

    // 1. Binding path equal to private_root rejected
    await assert.rejects(
      () => runSlackArchiveStdioServer({
        bindingPath: privateRoot,
        archivePath,
        expectedArchiveSha256: validArchiveSha256,
      }),
      (error) => error instanceof SlackArchiveError && (error.code === "binding_outside_private_root" || error.code === "file_type_invalid"),
    );

    // 2. Digest mismatch rejected
    await assert.rejects(
      () => runSlackArchiveStdioServer({
        bindingPath,
        archivePath,
        expectedArchiveSha256: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      }),
      (error) => error instanceof SlackArchiveError && error.code === "archive_sha256_binding_mismatch",
    );

    // 3. Archive path mismatch between CLI and binding rejected
    await assert.rejects(
      () => runSlackArchiveStdioServer({
        bindingPath,
        archivePath: outsideArchivePath,
        expectedArchiveSha256: validArchiveSha256,
      }),
      (error) => error instanceof SlackArchiveError && error.code === "archive_path_binding_mismatch",
    );

    // 4. Archive envelope with extra/missing keys or empty records rejected on server load
    const invalidEnvelopePayload = {
      ...validArchivePayload,
      records: [],
    };
    const invalidEnvelopeJson = JSON.stringify(invalidEnvelopePayload, null, 2);
    const invalidEnvelopeSha = `sha256:${createHash("sha256").update(Buffer.from(invalidEnvelopeJson, "utf8")).digest("hex")}`;
    const invalidArchivePath = path.join(archiveDir, "invalid_archive.json");
    await writeFile(invalidArchivePath, invalidEnvelopeJson, "utf8");

    const invalidBinding = {
      ...validMcpBinding,
      archive_path: invalidArchivePath,
      archive_sha256: invalidEnvelopeSha,
    };
    const invalidBindingPath = path.join(privateRoot, "invalid_binding.json");
    await writeFile(invalidBindingPath, JSON.stringify(invalidBinding, null, 2), "utf8");

    await assert.rejects(
      () => runSlackArchiveStdioServer({
        bindingPath: invalidBindingPath,
        archivePath: invalidArchivePath,
        expectedArchiveSha256: invalidEnvelopeSha,
      }),
      (error) => error instanceof SlackArchiveError && error.code === "records_required",
    );

    // 5. Oversized file rejected by readBoundedRegularFile
    const smallBudgetFile = path.join(archiveDir, "oversized.json");
    await writeFile(smallBudgetFile, "x".repeat(200), "utf8");
    await assert.rejects(
      () => readBoundedRegularFile(smallBudgetFile, { maxBytes: 100 }),
      (error) => error instanceof SlackArchiveError && error.code === "file_oversized",
    );

    // 6. Non-existent file rejected with archive_read_failed
    const missingFile = path.join(archiveDir, "non_existent.json");
    await assert.rejects(
      () => readBoundedRegularFile(missingFile),
      (error) => error instanceof SlackArchiveError && error.code === "archive_read_failed",
    );

    // 7. Successful server execution over PassThrough streams
    const input = new PassThrough();
    const output = new PassThrough();

    const serverPromise = runSlackArchiveStdioServer({
      bindingPath,
      archivePath,
      expectedArchiveSha256: validArchiveSha256,
      input,
      output,
    });

    const lines = [];
    output.on("data", (chunk) => {
      lines.push(...chunk.toString("utf8").split("\n").filter((l) => l.trim().length > 0));
    });

    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "slack_archive_status", arguments: {} } })}\n`);
    input.end();

    await serverPromise;

    assert.equal(lines.length, 3);
    const parsed1 = JSON.parse(lines[0]);
    assert.equal(parsed1.id, 1);
    assert.equal(parsed1.result.protocolVersion, "2025-06-18");

    const parsed2 = JSON.parse(lines[1]);
    assert.equal(parsed2.id, 2);
    assert.equal(parsed2.result.tools.length, 5);

    const parsed3 = JSON.parse(lines[2]);
    assert.equal(parsed3.id, 3);
    assert.equal(parsed3.result.structuredContent.workspace_id, "T00000001");
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});
