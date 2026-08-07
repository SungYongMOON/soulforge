import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  mkdir,
  link,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import test from "node:test";

import {
  SlackContinuousError,
  digestSlackContinuousBinding,
  runSlackContinuousIngress,
  validateSlackContinuousBinding,
} from "./slack_continuous_runner.mjs";
import {
  SlackCustodyError,
  acquireExclusiveLease,
  atomicWritePrivateJson,
  preparePrivateDataRoot,
  writeSlackHostedFileToCustody,
} from "./slack_custody.mjs";
import {
  createSlackHostedFileTransport,
  createSlackWebApiCompatibleAdapter,
  createSlackWebApiCall,
  createSlackWebApiPollingTransport,
  createSyntheticSlackTransport,
  loadSlackAccessToken,
  loadSlackBotToken,
} from "./slack_transport.mjs";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(await readFile(
  path.join(moduleDirectory, "slack_continuous_binding.schema.json"),
  "utf8",
));
const FAKE_BOT_TOKEN = ["xoxb", "1234567890", "abcdefghij"].join("-");
const OTHER_FAKE_BOT_TOKEN = ["xoxb", "1234567890", "klmnopqrst"].join("-");
const FAKE_USER_TOKEN = ["xoxp", "1234567890", "uvwxyzabcd"].join("-");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function makeBinding() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "soulforge-slack-continuous-"));
  const privateRoot = path.join(parent, "private-owner");
  return {
    schema_version: "soulforge.slack_continuous.binding.v1",
    feature_enabled: false,
    binding_id: "binding:slack:project-01",
    workspace_id: "T00000001",
    channel_id: "C00000001",
    project_code: "P01-001",
    channel: {
      kind: "project",
      visibility: "public",
      is_shared: false,
      is_ext_shared: false,
      is_archived: false,
      is_member: true,
    },
    credentials: {
      app_token_env: "SLACK_APP_TOKEN",
      bot_token_env: "SLACK_BOT_TOKEN",
      app_token_file: null,
      bot_token_file: null,
    },
    attachment_policy: {
      feature_enabled: false,
      custody_root: path.join(privateRoot, "slack-custody", "attachments"),
      max_files_per_message: 4,
      max_file_bytes: 1_048_576,
      max_total_bytes: 2_097_152,
      allowed_mime_types: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
      ],
      allowed_file_types: ["docx", "png"],
      timeout_ms: 1_000,
      max_retries: 2,
      max_retry_after_seconds: 2,
    },
    private_root: privateRoot,
    data_root: path.join(privateRoot, "slack-custody"),
    forbidden_roots: [
      path.join(parent, "public-runtime"),
    ],
    writer: {
      authority_id: "writer:synthetic-primary",
      epoch: 7,
    },
  };
}

function rawMessage({
  ts,
  user = "U00000001",
  text = "private synthetic body",
  thread_ts: threadTs,
}) {
  return {
    type: "message",
    subtype: null,
    ts,
    user,
    text,
    ...(threadTs === undefined ? {} : { thread_ts: threadTs }),
  };
}

function record(eventId, rawEvent, overrides = {}) {
  return {
    event_id: eventId,
    retry_num: 0,
    retry_reason: null,
    received_at: "2026-07-23T01:00:00.000Z",
    workspace_id: "T00000001",
    channel_id: "C00000001",
    channel_kind: "project",
    is_private: false,
    is_shared: false,
    is_ext_shared: false,
    is_archived: false,
    is_member: true,
    source_refs: [`slack-event:${eventId}`],
    raw_event: rawEvent,
    ...overrides,
  };
}

function responseHeaders(values = {}) {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  return {
    get(name) {
      return normalized.get(String(name).toLowerCase()) ?? null;
    },
  };
}

function jsonResponse(value, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders(headers),
    async json() {
      return clone(value);
    },
  };
}

function byteResponse(bytes, mimeType, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: responseHeaders({
      "content-length": bytes.length,
      "content-type": mimeType,
      ...headers,
    }),
    body: Readable.from([Buffer.from(bytes)]),
  };
}

function hostedInfo(declared, workspaceId, overrides = {}) {
  return {
    id: declared.id,
    team_id: workspaceId,
    user_team: workspaceId,
    mode: "hosted",
    is_external: false,
    external_type: "",
    file_access: "visible",
    deleted: false,
    size: declared.size,
    mimetype: declared.mimetype,
    filetype: declared.filetype,
    timestamp: 1_720_000_000,
    url_private_download: `https://files.slack.com/files-pri/${workspaceId}-${declared.id}/download`,
    ...overrides,
  };
}

function fullRevisionRecords() {
  const rootTs = "1720000000.000100";
  return [
    record("Ev00000001", rawMessage({ ts: rootTs })),
    record("Ev00000002", rawMessage({
      ts: "1720000000.000200",
      user: "U00000002",
      text: "private reply",
      thread_ts: rootTs,
    }), { received_at: "2026-07-23T01:00:01.000Z" }),
    record("Ev00000003", {
      type: "message",
      subtype: "message_changed",
      message: {
        ts: rootTs,
        user: "U00000001",
        text: "private edited body",
        edited: {
          user: "U00000001",
          ts: "1720000000.000300",
        },
      },
    }, { received_at: "2026-07-23T01:00:02.000Z" }),
    record("Ev00000004", {
      type: "message",
      subtype: "message_deleted",
      deleted_ts: rootTs,
      event_ts: "1720000000.000400",
      user: "U00000001",
      previous_message: {
        user: "U00000001",
      },
    }, { received_at: "2026-07-23T01:00:03.000Z" }),
    record("Ev00000005", {
      type: "message",
      subtype: "tombstone",
      deleted_ts: rootTs,
      event_ts: "1720000000.000500",
      user: "U00000001",
      previous_message: {
        user: "U00000001",
      },
    }, { received_at: "2026-07-23T01:00:04.000Z" }),
  ];
}

async function run(binding, records, options = {}) {
  return runSlackContinuousIngress({
    binding,
    expected_binding_digest: digestSlackContinuousBinding(binding),
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    transport: createSyntheticSlackTransport(records),
    dry_run: options.dry_run ?? false,
    max_events: options.max_events ?? 100,
    test_fail_before_state_rename: options.test_fail_before_state_rename ?? false,
  });
}

test("private binding schema is strict, feature-OFF, and secret values are rejected", async () => {
  const binding = await makeBinding();
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  assert.equal(validate(binding), true, JSON.stringify(validate.errors));
  validateSlackContinuousBinding(binding);

  const enabled = clone(binding);
  enabled.feature_enabled = true;
  assert.equal(validate(enabled), false);
  assert.throws(
    () => validateSlackContinuousBinding(enabled),
    (error) => error instanceof SlackContinuousError && error.code === "feature_must_remain_off",
  );

  const tokenValue = clone(binding);
  tokenValue.credentials.app_token_env = "xapp-secret-value";
  assert.equal(validate(tokenValue), false);
  assert.throws(
    () => validateSlackContinuousBinding(tokenValue),
    (error) => error instanceof SlackContinuousError
      && ["credential_env_name_invalid", "secret_value_forbidden"].includes(error.code),
  );

  const tokenInSafeRef = clone(binding);
  tokenInSafeRef.binding_id = ["xapp", "1", "ABCDEFGHIJKLMNOP"].join("-");
  assert.throws(
    () => validateSlackContinuousBinding(tokenInSafeRef),
    (error) => error instanceof SlackContinuousError
      && error.code === "secret_value_forbidden",
  );

  const extraSecret = clone(binding);
  extraSecret.credentials.access_token = "forbidden";
  assert.throws(
    () => validateSlackContinuousBinding(extraSecret),
    (error) => error instanceof SlackContinuousError && error.code === "exact_keys_required",
  );

  const privateChannel = clone(binding);
  privateChannel.channel.visibility = "private";
  assert.throws(
    () => validateSlackContinuousBinding(privateChannel),
    (error) => error instanceof SlackContinuousError && error.code === "unsafe_channel_binding",
  );

  const rootEqualToOwner = clone(binding);
  rootEqualToOwner.data_root = rootEqualToOwner.private_root;
  assert.throws(
    () => validateSlackContinuousBinding(rootEqualToOwner),
    (error) => error instanceof SlackContinuousError
      && error.code === "data_root_not_strict_private_child",
  );

  const rootOutsideOwner = clone(binding);
  rootOutsideOwner.data_root = path.join(path.dirname(rootOutsideOwner.private_root), "other-custody");
  assert.throws(
    () => validateSlackContinuousBinding(rootOutsideOwner),
    (error) => error instanceof SlackContinuousError
      && error.code === "data_root_not_strict_private_child",
  );

  const rootInsideForbidden = clone(binding);
  rootInsideForbidden.forbidden_roots = [
    path.join(rootInsideForbidden.private_root, "runtime"),
  ];
  rootInsideForbidden.data_root = path.join(
    rootInsideForbidden.private_root,
    "runtime",
    "slack-custody",
  );
  assert.throws(
    () => validateSlackContinuousBinding(rootInsideForbidden),
    (error) => error instanceof SlackContinuousError
      && error.code === "data_root_forbidden_overlap",
  );

  const rootContainsForbidden = clone(binding);
  rootContainsForbidden.forbidden_roots = [
    path.join(rootContainsForbidden.data_root, "public-cache"),
  ];
  assert.throws(
    () => validateSlackContinuousBinding(rootContainsForbidden),
    (error) => error instanceof SlackContinuousError
      && error.code === "data_root_forbidden_overlap",
  );

  const credentialOutsideOwner = clone(binding);
  credentialOutsideOwner.credentials.bot_token_file = path.join(
    path.dirname(credentialOutsideOwner.private_root),
    "outside-token.txt",
  );
  assert.throws(
    () => validateSlackContinuousBinding(credentialOutsideOwner),
    (error) => error instanceof SlackContinuousError
      && error.code === "credential_file_not_strict_private_child",
  );

  const credentialInCustody = clone(binding);
  credentialInCustody.credentials.bot_token_file = path.join(
    credentialInCustody.data_root,
    "bot-token.txt",
  );
  assert.throws(
    () => validateSlackContinuousBinding(credentialInCustody),
    (error) => error instanceof SlackContinuousError
      && error.code === "credential_file_data_root_overlap",
  );
});

test("dry-run validates replay semantics without creating the private data root", async () => {
  const binding = await makeBinding();
  const result = await run(binding, fullRevisionRecords(), { dry_run: true });
  assert.deepEqual(
    {
      mode: result.mode,
      accepted_count: result.accepted_count,
      held_count: result.held_count,
      revision_count: result.revision_count,
      private_writes: result.private_writes,
      network_used: result.network_used,
    },
    {
      mode: "dry_run",
      accepted_count: 5,
      held_count: 0,
      revision_count: 5,
      private_writes: 0,
      network_used: false,
    },
  );
  await assert.rejects(lstat(binding.data_root), (error) => error.code === "ENOENT");
});

test("unsafe scopes and file-bearing records HOLD without raw custody", async () => {
  const binding = await makeBinding();
  const unsafe = [
    record("EvHoldDm", rawMessage({ ts: "1720000010.000100" }), {
      channel_id: "D00000001",
      channel_kind: "dm",
      is_private: true,
    }),
    record("EvHoldCommon", rawMessage({ ts: "1720000010.000200" }), {
      channel_id: "C00000002",
      channel_kind: "common",
    }),
    record("EvHoldArchived", rawMessage({ ts: "1720000010.000300" }), {
      is_archived: true,
    }),
    record("EvHoldConnect", rawMessage({ ts: "1720000010.000400" }), {
      is_shared: true,
      is_ext_shared: true,
    }),
    record("EvHoldFile", {
      ...rawMessage({ ts: "1720000010.000500" }),
      files: [{
        id: "F00000001",
        url_private: "https://files.invalid/private",
        file_bytes: "AA==",
        local_path: "/forbidden",
      }],
    }),
  ];
  const result = await run(binding, unsafe);
  assert.equal(result.accepted_count, 0);
  assert.equal(result.held_count, 5);
  const state = JSON.parse(await readFile(
    path.join(binding.data_root, "state", "slack-continuous.json"),
    "utf8",
  ));
  assert.equal(state.custody_receipts.length, 0);
  assert.equal(state.hold_receipts.length, 5);
  assert.deepEqual(
    new Set(state.hold_receipts.map((receipt) => receipt.page_id)),
    new Set(["synthetic-page:0:5"]),
  );
  for (const receipt of state.hold_receipts) {
    assert.deepEqual(
      Object.keys(receipt).sort(),
      [
        "event_id",
        "hold_reasons",
        "page_id",
        "raw_digest",
        "received_at",
        "retry_num",
        "retry_reason",
        "source_refs",
      ],
    );
  }
  await assert.rejects(readdir(path.join(binding.data_root, "raw")), (error) => error.code === "ENOENT");
  const stateText = JSON.stringify(state);
  assert.doesNotMatch(stateText, /files\.invalid|AA==|\/forbidden|private synthetic body/u);
  const statePath = path.join(binding.data_root, "state", "slack-continuous.json");
  const persistedBeforeReplay = await readFile(statePath, "utf8");

  const exactReplay = await run(binding, unsafe);
  assert.equal(exactReplay.replayed_pages, 1);
  assert.equal(exactReplay.private_writes, 0);
  const replayedStateText = await readFile(statePath, "utf8");
  assert.equal(replayedStateText, persistedBeforeReplay);
  assert.equal(JSON.parse(replayedStateText).hold_receipts.length, 5);

  const changedSamePage = clone(unsafe);
  changedSamePage[0].raw_event.text = "changed held body";
  await assert.rejects(
    run(binding, changedSamePage),
    (error) => error instanceof SlackContinuousError && error.code === "page_evidence_conflict",
  );
  assert.equal(await readFile(statePath, "utf8"), replayedStateText);

  const changedMembership = clone(unsafe);
  changedMembership[0].event_id = "EvHoldReplacement";
  changedMembership[0].source_refs = ["slack-event:EvHoldReplacement"];
  await assert.rejects(
    run(binding, changedMembership),
    (error) => error instanceof SlackContinuousError && error.code === "page_evidence_conflict",
  );
  assert.equal(await readFile(statePath, "utf8"), replayedStateText);

  const changedOtherPage = [
    changedSamePage[0],
    ...unsafe.slice(1),
    record("EvHoldExtra", rawMessage({ ts: "1720000010.000600" }), {
      channel_id: "D00000002",
      channel_kind: "dm",
      is_private: true,
    }),
  ];
  await assert.rejects(
    run(binding, changedOtherPage),
    (error) => error instanceof SlackContinuousError && error.code === "hold_event_id_conflict",
  );
  assert.equal(await readFile(statePath, "utf8"), replayedStateText);
});

test("apply writes content-addressed raw custody and digest-only receipts", async () => {
  const binding = await makeBinding();
  const result = await run(binding, fullRevisionRecords());
  assert.equal(result.accepted_count, 5);
  assert.equal(result.revision_count, 5);
  assert.equal(result.timeline_annotation_count, 5);
  assert.equal(result.timeline_annotations_written, 5);
  const state = JSON.parse(await readFile(
    path.join(binding.data_root, "state", "slack-continuous.json"),
    "utf8",
  ));
  assert.deepEqual(
    new Set(state.revisions.map((revision) => revision.revision_kind)),
    new Set(["message", "reply", "edit", "delete", "tombstone"]),
  );
  assert.equal(state.custody_receipts.length, 5);
  for (const receipt of state.custody_receipts) {
    assert.deepEqual(
      Object.keys(receipt).sort(),
      ["raw_digest", "raw_ref", "source_refs"],
    );
    assert.match(receipt.raw_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.match(receipt.raw_ref, /^slack-raw:[0-9a-f]{64}$/u);
  }
  const stateText = JSON.stringify(state);
  assert.doesNotMatch(stateText, /private synthetic body|private edited body|private reply/u);
  const firstHex = state.custody_receipts[0].raw_digest.slice("sha256:".length);
  const rawText = await readFile(
    path.join(binding.data_root, "raw", "sha256", firstHex.slice(0, 2), `${firstHex}.json`),
    "utf8",
  );
  assert.match(rawText, /private/u);
  const timelineFiles = await readdir(
    path.join(binding.data_root, "timeline", "source_arrival"),
    { recursive: true },
  );
  const timelineJsonFiles = timelineFiles.filter((entry) => entry.endsWith(".json"));
  assert.equal(timelineJsonFiles.length, 5);
  const timelineAnnotation = JSON.parse(await readFile(
    path.join(binding.data_root, "timeline", "source_arrival", timelineJsonFiles[0]),
    "utf8",
  ));
  assert.match(timelineAnnotation.occurrence.occurred_at, /\+09:00$/u);
});

test("completed-page replay never regresses provider cursor and the next run remains stable", async () => {
  const binding = await makeBinding();
  const records = fullRevisionRecords();
  const first = await run(binding, records, { max_events: 2 });
  assert.equal(first.revision_count, 2);
  const second = await run(binding, records, { max_events: 3 });
  assert.equal(second.revision_count, 5);
  const completedStatePath = path.join(binding.data_root, "state", "slack-continuous.json");
  const completedStateText = await readFile(completedStatePath, "utf8");
  const completedState = JSON.parse(completedStateText);
  assert.equal(completedState.provider_cursor_token, null);
  const replay = await run(binding, records, { max_events: 2 });
  assert.equal(replay.replayed_pages, 1);
  assert.equal(replay.revision_count, 5);
  assert.equal(replay.private_writes, 0);
  const replayedStateText = await readFile(completedStatePath, "utf8");
  assert.equal(replayedStateText, completedStateText);
  const replayedState = JSON.parse(replayedStateText);
  assert.equal(replayedState.provider_cursor_token, null);
  const nextRun = await run(binding, records, { max_events: 2 });
  assert.equal(nextRun.replayed_pages, 1);
  assert.equal(nextRun.revision_count, 5);
  assert.equal(nextRun.private_writes, 0);
  const state = JSON.parse(await readFile(
    completedStatePath,
    "utf8",
  ));
  assert.equal(state.provider_cursor_token, null);
  assert.equal(state.cursor.accepted_pages.length, 2);
  assert.equal(state.cursor.delivery_evidence.length, 5);
});

test("binding digest, writer epoch, and exclusive lease fence persistent apply", async () => {
  const binding = await makeBinding();
  await assert.rejects(
    runSlackContinuousIngress({
      binding,
      expected_binding_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      writer_authority_id: binding.writer.authority_id,
      writer_epoch: binding.writer.epoch,
      transport: createSyntheticSlackTransport([]),
    }),
    (error) => error instanceof SlackContinuousError && error.code === "binding_digest_fence",
  );
  await assert.rejects(lstat(binding.data_root), (error) => error.code === "ENOENT");

  await assert.rejects(
    runSlackContinuousIngress({
      binding,
      expected_binding_digest: digestSlackContinuousBinding(binding),
      writer_authority_id: binding.writer.authority_id,
      writer_epoch: binding.writer.epoch + 1,
      transport: createSyntheticSlackTransport([]),
    }),
    (error) => error instanceof SlackContinuousError && error.code === "writer_authority_fence",
  );

  const lease = await acquireExclusiveLease({
    data_root: binding.data_root,
    binding_digest: digestSlackContinuousBinding(binding),
    authority_id: binding.writer.authority_id,
    epoch: binding.writer.epoch,
  });
  try {
    await assert.rejects(
      run(binding, []),
      (error) => error instanceof SlackCustodyError && error.code === "exclusive_lease_unavailable",
    );
  } finally {
    await lease.release();
  }
});

test("failed atomic state commit leaves the prior cursor generation intact and releases lease", async () => {
  const binding = await makeBinding();
  const records = fullRevisionRecords();
  await run(binding, records.slice(0, 1));
  const statePath = path.join(binding.data_root, "state", "slack-continuous.json");
  const before = await readFile(statePath, "utf8");
  await assert.rejects(
    run(binding, records.slice(0, 2), { test_fail_before_state_rename: true }),
    (error) => error instanceof SlackCustodyError && error.code === "injected_atomic_failure",
  );
  assert.equal(await readFile(statePath, "utf8"), before);
  const afterRecovery = await run(binding, records.slice(0, 2));
  assert.equal(afterRecovery.revision_count, 2);
});

test("persistent state read rejects a second hard link before parsing rollback data", async (t) => {
  const binding = await makeBinding();
  await run(binding, fullRevisionRecords().slice(0, 1));
  const statePath = path.join(binding.data_root, "state", "slack-continuous.json");
  const outsideLink = path.join(binding.private_root, "outside-channel-state-hardlink.json");
  try {
    await link(statePath, outsideLink);
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`hardlink unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    run(binding, fullRevisionRecords().slice(0, 2)),
    (error) => error instanceof SlackCustodyError
      && error.code === "custody_read_target_invalid",
  );
});

test("path guard rejects reparse roots when the platform permits junction creation", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "soulforge-slack-reparse-"));
  const real = path.join(parent, "real");
  await preparePrivateDataRoot(real);
  const link = path.join(parent, "linked");
  try {
    await symlink(real, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`symlink unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    preparePrivateDataRoot(link),
    (error) => error instanceof SlackCustodyError && error.code === "reparse_path_forbidden",
  );
});

test("atomic helper rolls back temporary state on a pre-rename failure", async () => {
  const binding = await makeBinding();
  await atomicWritePrivateJson(binding.data_root, ["state", "probe.json"], { sequence: 1 });
  const target = path.join(binding.data_root, "state", "probe.json");
  const before = await readFile(target, "utf8");
  await assert.rejects(
    atomicWritePrivateJson(
      binding.data_root,
      ["state", "probe.json"],
      { sequence: 2 },
      { fail_before_rename: true },
    ),
    (error) => error instanceof SlackCustodyError && error.code === "injected_atomic_failure",
  );
  assert.equal(await readFile(target, "utf8"), before);
});

test("Web API adapter is injection-only and live runner activation stays blocked", async () => {
  const calls = [];
  const adapter = createSlackWebApiCompatibleAdapter({
    async apiCall(method, params) {
      calls.push({ method, params });
      return { ok: true };
    },
  });
  await adapter.inspectAuth();
  await adapter.inspectChannel({ channel_id: "C00000001" });
  await adapter.pullHistoryPage({
    channel_id: "C00000001",
    cursor_token: null,
    limit: 10,
  });
  assert.deepEqual(calls.map((call) => call.method), [
    "auth.test",
    "conversations.info",
    "conversations.history",
  ]);

  const binding = await makeBinding();
  await assert.rejects(
    runSlackContinuousIngress({
      binding,
      expected_binding_digest: digestSlackContinuousBinding(binding),
      writer_authority_id: binding.writer.authority_id,
      writer_epoch: binding.writer.epoch,
      transport: adapter,
    }),
    (error) => error instanceof SlackContinuousError && error.code === "transport_invalid",
  );
  await assert.rejects(
    runSlackContinuousIngress({
      binding,
      expected_binding_digest: digestSlackContinuousBinding(binding),
      writer_authority_id: binding.writer.authority_id,
      writer_epoch: binding.writer.epoch,
      transport: {
        kind: "web_api",
        pull() {
          throw new Error("must not be called");
        },
      },
    }),
    (error) => error instanceof SlackContinuousError && error.code === "live_transport_feature_off",
  );
  await assert.rejects(lstat(binding.data_root), (error) => error.code === "ENOENT");
});

test("v2 binding performs a bounded Web API polling page and reports honest coverage gaps", async () => {
  const binding = await makeBinding();
  binding.schema_version = "soulforge.slack_continuous.binding.v2";
  binding.feature_enabled = true;
  const calls = [];
  const transport = createSlackWebApiPollingTransport({
    binding,
    async apiCall(method, params) {
      calls.push({ method, params });
      if (method === "auth.test") {
        return { ok: true, team_id: binding.workspace_id };
      }
      if (method === "conversations.info") {
        return {
          ok: true,
          channel: {
            id: binding.channel_id,
            is_private: false,
            is_shared: false,
            is_ext_shared: false,
            is_archived: false,
            is_member: true,
          },
        };
      }
      return {
        ok: true,
        messages: [{
          type: "message",
          ts: "1720000000.000100",
          user: "U00000001",
          text: "private live fixture body",
        }],
        response_metadata: { next_cursor: "" },
      };
    },
  });
  const result = await runSlackContinuousIngress({
    binding,
    expected_binding_digest: digestSlackContinuousBinding(binding),
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    transport,
    dry_run: true,
    max_events: 15,
  });
  assert.deepEqual(calls.map((call) => call.method), [
    "auth.test",
    "conversations.info",
    "conversations.history",
  ]);
  assert.equal(result.feature_status, "ON");
  assert.equal(result.network_used, true);
  assert.equal(result.pulled_count, 1);
  assert.equal(result.accepted_count, 1);
  assert.deepEqual(result.coverage_gaps, [
    "polling_cannot_prove_deleted_messages",
    "polling_cannot_reconstruct_pre_activation_edit_history",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /private live fixture body|xoxb-/u);
  await assert.rejects(lstat(binding.data_root), (error) => error.code === "ENOENT");
});

test("bot token is loaded only from an approved environment name", async () => {
  const binding = await makeBinding();
  const token = await loadSlackBotToken(binding.credentials, {
    SLACK_BOT_TOKEN: FAKE_BOT_TOKEN,
  });
  assert.equal(token.startsWith("xoxb-"), true);
  await assert.rejects(
    loadSlackBotToken({ ...binding.credentials, bot_token_file: null }, {}),
    /bot_token_unavailable/u,
  );
});

test("v3 binding loads a read-only user access token without bot credential fields", async () => {
  const legacy = await makeBinding();
  const binding = {
    ...legacy,
    schema_version: "soulforge.slack_continuous.binding.v3",
    feature_enabled: true,
    credentials: {
      access_token_env: "SLACK_ACCESS_TOKEN",
      access_token_file: null,
    },
  };
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  assert.equal(validate(binding), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    ...binding,
    credentials: {},
  }), false);
  assert.equal(validate({
    ...binding,
    credentials: {
      ...binding.credentials,
      bot_token_env: null,
    },
  }), false);
  validateSlackContinuousBinding(binding);
  const token = await loadSlackAccessToken(binding.credentials, {
    SLACK_ACCESS_TOKEN: FAKE_USER_TOKEN,
  });
  assert.equal(token.startsWith("xoxp-"), true);
  const apiCall = createSlackWebApiCall({
    access_token: token,
    fetch_impl: async (_url, options) => {
      assert.equal(options.headers.authorization, `Bearer ${FAKE_USER_TOKEN}`);
      return {
        ok: true,
        async json() {
          return { ok: true };
        },
      };
    },
  });
  assert.deepEqual(await apiCall("auth.test", {}), { ok: true });
});

test("bot token file is identity-fenced inside the private owner boundary", async () => {
  const binding = await makeBinding();
  const credentialDir = path.join(binding.private_root, "credentials");
  const tokenPath = path.join(credentialDir, "bot-token.txt");
  const outsidePath = path.join(path.dirname(binding.private_root), "outside-token.txt");
  const linkedPath = path.join(credentialDir, "linked-token.txt");
  await mkdir(credentialDir, { recursive: true });
  await writeFile(tokenPath, `${FAKE_BOT_TOKEN}\n`, "utf8");
  await writeFile(outsidePath, `${OTHER_FAKE_BOT_TOKEN}\n`, "utf8");
  try {
    const credentials = { ...binding.credentials, bot_token_env: null, bot_token_file: tokenPath };
    validateSlackContinuousBinding({ ...binding, credentials });
    const token = await loadSlackBotToken(credentials, {}, {
      private_root: binding.private_root,
      data_root: binding.data_root,
      forbidden_roots: binding.forbidden_roots,
    });
    assert.equal(token, FAKE_BOT_TOKEN);

    const hardLinkedPath = path.join(credentialDir, "hard-linked-token.txt");
    await link(outsidePath, hardLinkedPath);
    const hardLinkedCredentials = { ...credentials, bot_token_file: hardLinkedPath };
    validateSlackContinuousBinding({ ...binding, credentials: hardLinkedCredentials });
    await assert.rejects(
      loadSlackBotToken(hardLinkedCredentials, {}, {
        private_root: binding.private_root,
        data_root: binding.data_root,
        forbidden_roots: binding.forbidden_roots,
      }),
      /credential_file_unsafe/u,
    );

    try {
      await symlink(outsidePath, linkedPath, "file");
      const linkedCredentials = { ...credentials, bot_token_file: linkedPath };
      validateSlackContinuousBinding({ ...binding, credentials: linkedCredentials });
      await assert.rejects(
        loadSlackBotToken(linkedCredentials, {}, {
          private_root: binding.private_root,
          data_root: binding.data_root,
          forbidden_roots: binding.forbidden_roots,
        }),
        /credential_file_(?:unsafe|identity_escape)/u,
      );
    } catch (error) {
      if (!["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) throw error;
    }
  } finally {
    await rm(path.dirname(binding.private_root), { recursive: true, force: true });
  }
});

test("Slack Web API calls have a bounded wall-clock timeout", async () => {
  const apiCall = createSlackWebApiCall({
    bot_token: FAKE_BOT_TOKEN,
    timeout_ms: 100,
    fetch_impl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });
  await assert.rejects(
    apiCall("auth.test", {}),
    (error) => error?.code === "slack_http_timeout",
  );

  const bodyApiCall = createSlackWebApiCall({
    bot_token: FAKE_BOT_TOKEN,
    timeout_ms: 100,
    fetch_impl: async (_url, options) => ({
      ok: true,
      status: 200,
      json: async () => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    }),
  });
  await assert.rejects(
    bodyApiCall("auth.test", {}),
    (error) => error?.code === "slack_http_timeout",
  );
});

test("live polling accepts a new top message while replaying older page members exactly", async () => {
  const binding = await makeBinding();
  binding.schema_version = "soulforge.slack_continuous.binding.v2";
  binding.feature_enabled = true;
  const oldMessage = {
    type: "message",
    ts: "1720000000.000100",
    user: "U00000001",
    text: "older private fixture",
  };
  const channel = {
    id: binding.channel_id,
    is_private: false,
    is_shared: false,
    is_ext_shared: false,
    is_archived: false,
    is_member: true,
  };
  const transportFor = (messages) => createSlackWebApiPollingTransport({
    binding,
    async apiCall(method) {
      if (method === "auth.test") return { ok: true, team_id: binding.workspace_id };
      return method === "conversations.info"
        ? { ok: true, channel }
        : { ok: true, messages, response_metadata: { next_cursor: "" } };
    },
  });
  const request = {
    binding,
    expected_binding_digest: digestSlackContinuousBinding(binding),
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    dry_run: false,
    max_events: 15,
  };
  const first = await runSlackContinuousIngress({
    ...request,
    transport: transportFor([oldMessage]),
  });
  assert.equal(first.revision_count, 1);
  const second = await runSlackContinuousIngress({
    ...request,
    transport: transportFor([{
      type: "message",
      ts: "1720000001.000100",
      user: "U00000002",
      text: "new private fixture",
    }, oldMessage]),
  });
  assert.equal(second.revision_count, 2);
  assert.equal(second.accepted_count, 2);
  assert.equal(second.timeline_annotation_count, 2);
  assert.equal(second.timeline_annotations_written, 1);
});

test("live polling rejects another workspace before reading channel history", async () => {
  const binding = await makeBinding();
  binding.schema_version = "soulforge.slack_continuous.binding.v2";
  binding.feature_enabled = true;
  const calls = [];
  const transport = createSlackWebApiPollingTransport({
    binding,
    async apiCall(method) {
      calls.push(method);
      return { ok: true, team_id: "TOTHER001" };
    },
  });
  await assert.rejects(
    transport.pull({ limit: 15 }),
    /token_workspace_mismatch/u,
  );
  assert.deepEqual(calls, ["auth.test"]);
});

test("hosted PNG and DOCX files enter content-addressed custody without locators or secrets", async () => {
  const binding = await makeBinding();
  binding.schema_version = "soulforge.slack_continuous.binding.v2";
  binding.feature_enabled = true;
  binding.attachment_policy.feature_enabled = true;
  const sharedBytes = Buffer.from("synthetic duplicate attachment bytes", "utf8");
  const declaredFiles = [
    {
      id: "FPNG00001",
      size: sharedBytes.length,
      mimetype: "image/png",
      filetype: "png",
      mode: "hosted",
      is_external: false,
      file_access: "visible",
      url_private: "https://files.slack.com/private/signed-png",
      thumb_360: "https://files.slack.com/thumb/signed-png",
    },
    {
      id: "FDOCX0001",
      size: sharedBytes.length,
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filetype: "docx",
      mode: "hosted",
      is_external: false,
      file_access: "visible",
      url_private_download: "https://files.slack.com/private/signed-docx",
    },
  ];
  const token = FAKE_BOT_TOKEN;
  const fileById = new Map(declaredFiles.map((file) => [file.id, file]));
  const authenticatedRequests = [];
  const hostedFileTransport = createSlackHostedFileTransport({
    bot_token: token,
    policy: binding.attachment_policy,
    sleep_impl: async () => {},
    async fetch_impl(url, options) {
      authenticatedRequests.push({
        host: new URL(url).hostname,
        redirect: options.redirect,
        authorization: options.headers.authorization,
      });
      if (url === "https://slack.com/api/files.info") {
        const declared = fileById.get(options.body.get("file"));
        return jsonResponse({
          ok: true,
          file: hostedInfo(declared, binding.workspace_id),
        });
      }
      const declared = declaredFiles.find((file) => url.includes(file.id));
      return byteResponse(sharedBytes, declared.mimetype);
    },
  });
  const channel = {
    id: binding.channel_id,
    is_private: false,
    is_shared: false,
    is_ext_shared: false,
    is_archived: false,
    is_member: true,
  };
  const transport = createSlackWebApiPollingTransport({
    binding,
    hosted_file_transport: hostedFileTransport,
    async apiCall(method) {
      if (method === "auth.test") return { ok: true, team_id: binding.workspace_id };
      if (method === "conversations.info") return { ok: true, channel };
      return {
        ok: true,
        messages: [{
          type: "message",
          ts: "1720000100.000100",
          user: "U00000001",
          text: "attachment fixture https://files.slack.com:443/files-pri/signed-image",
          image_url: "https://files-origin.slack.com:443/files-pri/signed-preview",
          files: clone(declaredFiles),
        }],
        response_metadata: { next_cursor: "" },
      };
    },
  });
  const request = {
    binding,
    expected_binding_digest: digestSlackContinuousBinding(binding),
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    transport,
    dry_run: false,
    max_events: 15,
  };
  const first = await runSlackContinuousIngress(request);
  assert.equal(first.accepted_count, 1);
  assert.equal(first.held_count, 0);
  assert.equal(first.private_writes, 6);
  const statePath = path.join(binding.data_root, "state", "slack-continuous.json");
  const firstStateText = await readFile(statePath, "utf8");
  const state = JSON.parse(firstStateText);
  assert.equal(state.attachment_receipts.length, 2);
  assert.deepEqual(
    state.revisions[0].attachment_pointers.map((pointer) => pointer.mime_type).sort(),
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
    ],
  );
  assert.doesNotMatch(firstStateText, /files\.slack\.com|url_private|thumb_360|xoxb-|synthetic duplicate attachment bytes/u);
  const rawFiles = await readdir(path.join(binding.data_root, "raw"), { recursive: true });
  const rawText = await readFile(
    path.join(binding.data_root, "raw", rawFiles.find((entry) => entry.endsWith(".json"))),
    "utf8",
  );
  assert.doesNotMatch(rawText, /files(?:-origin)?\.slack\.com|url_private["]|thumb_360["]|xoxb-/u);
  assert.match(rawText, /redacted-slack-file-url/u);
  assert.match(rawText, /metadata_proof_sha256/u);
  const contentFiles = (await readdir(
    path.join(binding.attachment_policy.custody_root, "sha256"),
    { recursive: true },
  )).filter((entry) => entry.endsWith(".bin"));
  assert.equal(contentFiles.length, 1);
  assert.equal(authenticatedRequests.every((requestEntry) => requestEntry.redirect === "manual"), true);
  assert.equal(authenticatedRequests.every((requestEntry) => requestEntry.authorization === `Bearer ${token}`), true);

  const replay = await runSlackContinuousIngress(request);
  assert.equal(replay.replayed_pages, 1);
  assert.equal(await readFile(statePath, "utf8"), firstStateText);
});

test("hosted-file custody detects same-file conflicts and reparse escapes", async (t) => {
  const binding = await makeBinding();
  const receipt = await writeSlackHostedFileToCustody({
    custody_root: binding.attachment_policy.custody_root,
    file_id: "FCONFLICT1",
    revision_ref: "slack-file-rev:stable",
    bytes: Buffer.from("first", "utf8"),
    mime_type: "image/png",
  });
  const replay = await writeSlackHostedFileToCustody({
    custody_root: binding.attachment_policy.custody_root,
    file_id: "FCONFLICT1",
    revision_ref: "slack-file-rev:stable",
    bytes: Buffer.from("first", "utf8"),
    mime_type: "image/png",
  });
  assert.deepEqual(replay, receipt);
  await assert.rejects(
    writeSlackHostedFileToCustody({
      custody_root: binding.attachment_policy.custody_root,
      file_id: "FCONFLICT1",
      revision_ref: "slack-file-rev:changed",
      bytes: Buffer.from("changed", "utf8"),
      mime_type: "image/png",
    }),
    (error) => error instanceof SlackCustodyError && error.code === "slack_file_identity_conflict",
  );
  const contentHex = receipt.content_sha256.slice("sha256:".length);
  const contentPath = path.join(
    binding.attachment_policy.custody_root,
    "sha256",
    contentHex.slice(0, 2),
    `${contentHex}.bin`,
  );
  await writeFile(contentPath, "tampered", "utf8");
  await assert.rejects(
    writeSlackHostedFileToCustody({
      custody_root: binding.attachment_policy.custody_root,
      file_id: "FCONFLICT1",
      revision_ref: "slack-file-rev:stable",
      bytes: Buffer.from("first", "utf8"),
      mime_type: "image/png",
    }),
    (error) => error instanceof SlackCustodyError && error.code === "custody_digest_conflict",
  );
  const custodyEntries = await readdir(
    binding.attachment_policy.custody_root,
    { recursive: true },
  );
  assert.equal(custodyEntries.some((entry) => entry.includes(".tmp-")), false);

  const outside = path.join(path.dirname(binding.private_root), "outside-attachment-root");
  await mkdir(outside, { recursive: true });
  const linkedRoot = path.join(binding.data_root, "linked-attachments");
  await mkdir(binding.data_root, { recursive: true });
  try {
    await symlink(outside, linkedRoot, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.diagnostic(`attachment reparse probe unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    writeSlackHostedFileToCustody({
      custody_root: linkedRoot,
      file_id: "FESCAPE001",
      revision_ref: "slack-file-rev:escape",
      bytes: Buffer.from("escape", "utf8"),
      mime_type: "image/png",
    }),
    (error) => error instanceof SlackCustodyError && error.code === "reparse_path_forbidden",
  );
});

test("hosted-file transport enforces 429 bounds, byte framing, timeout, network, and redirect guards", async () => {
  const binding = await makeBinding();
  const declared = {
    id: "FBOUND001",
    size: 5,
    mimetype: "image/png",
    filetype: "png",
  };
  const info = hostedInfo(declared, binding.workspace_id);
  let calls = 0;
  const retryDelays = [];
  const retrying = createSlackHostedFileTransport({
    bot_token: FAKE_BOT_TOKEN,
    policy: binding.attachment_policy,
    sleep_impl: async (milliseconds) => retryDelays.push(milliseconds),
    async fetch_impl(url) {
      calls += 1;
      if (calls === 1) return jsonResponse({}, { status: 429, headers: { "retry-after": "1" } });
      if (url === "https://slack.com/api/files.info") return jsonResponse({ ok: true, file: info });
      return byteResponse(Buffer.from("12345"), "image/png");
    },
  });
  const downloaded = await retrying.fetchHostedFile({
    declared_file: declared,
    workspace_id: binding.workspace_id,
  });
  assert.equal(downloaded.size_bytes, 5);
  assert.deepEqual(retryDelays, [1_000]);

  const expectFailure = async (downloadResponse, code) => {
    const client = createSlackHostedFileTransport({
      bot_token: FAKE_BOT_TOKEN,
      policy: binding.attachment_policy,
      sleep_impl: async () => {},
      async fetch_impl(url) {
        return url === "https://slack.com/api/files.info"
          ? jsonResponse({ ok: true, file: info })
          : downloadResponse;
      },
    });
    await assert.rejects(
      client.fetchHostedFile({
        declared_file: declared,
        workspace_id: binding.workspace_id,
      }),
      (error) => error?.code === code,
    );
  };
  await expectFailure(
    byteResponse(Buffer.from("123456"), "image/png"),
    "attachment_content_length_mismatch",
  );
  await expectFailure(
    byteResponse(Buffer.from("1234"), "image/png", {
      headers: { "content-length": "5" },
    }),
    "attachment_stream_truncated",
  );

  for (const unsafeLocator of [
    "https://attacker.files.slack.com/private/file",
    "https://files.slack.com:444/private/file",
  ]) {
    const unsafeHostClient = createSlackHostedFileTransport({
      bot_token: FAKE_BOT_TOKEN,
      policy: binding.attachment_policy,
      sleep_impl: async () => {},
      async fetch_impl() {
        return jsonResponse({
          ok: true,
          file: { ...info, url_private_download: unsafeLocator },
        });
      },
    });
    await assert.rejects(
      unsafeHostClient.fetchHostedFile({
        declared_file: declared,
        workspace_id: binding.workspace_id,
      }),
      (error) => error?.code === "attachment_url_not_slack_owned",
    );
  }

  let oversizedStreamDestroyed = false;
  const oversizedBody = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from("123456", "utf8");
    },
    destroy() {
      oversizedStreamDestroyed = true;
    },
  };
  const oversizedStreamClient = createSlackHostedFileTransport({
    bot_token: FAKE_BOT_TOKEN,
    policy: binding.attachment_policy,
    sleep_impl: async () => {},
    async fetch_impl(url) {
      if (url === "https://slack.com/api/files.info") {
        return jsonResponse({ ok: true, file: info });
      }
      return {
        ok: true,
        status: 200,
        headers: responseHeaders({ "content-type": "image/png" }),
        body: oversizedBody,
      };
    },
  });
  await assert.rejects(
    oversizedStreamClient.fetchHostedFile({
      declared_file: declared,
      workspace_id: binding.workspace_id,
    }),
    (error) => error?.code === "attachment_stream_too_large",
  );
  assert.equal(oversizedStreamDestroyed, true);

  let redirectCalls = 0;
  const redirectClient = createSlackHostedFileTransport({
    bot_token: FAKE_BOT_TOKEN,
    policy: binding.attachment_policy,
    sleep_impl: async () => {},
    async fetch_impl(url, options) {
      redirectCalls += 1;
      assert.equal(options.redirect, "manual");
      if (url === "https://slack.com/api/files.info") return jsonResponse({ ok: true, file: info });
      return jsonResponse({}, {
        status: 302,
        headers: { location: "https://attacker.invalid/token-capture" },
      });
    },
  });
  await assert.rejects(
    redirectClient.fetchHostedFile({
      declared_file: declared,
      workspace_id: binding.workspace_id,
    }),
    (error) => error?.code === "attachment_redirect_forbidden"
      && !/attacker|xoxb|files\.slack\.com/u.test(error.message),
  );
  assert.equal(redirectCalls, 2);

  const networkClient = createSlackHostedFileTransport({
    bot_token: FAKE_BOT_TOKEN,
    policy: binding.attachment_policy,
    sleep_impl: async () => {},
    async fetch_impl() {
      throw new Error("https://secret.invalid xoxb-leak");
    },
  });
  await assert.rejects(
    networkClient.fetchHostedFile({
      declared_file: declared,
      workspace_id: binding.workspace_id,
    }),
    (error) => error?.code === "attachment_network_failed"
      && !/secret\.invalid|xoxb-leak/u.test(error.message),
  );

  const timeoutPolicy = { ...binding.attachment_policy, timeout_ms: 100 };
  const timeoutClient = createSlackHostedFileTransport({
    bot_token: FAKE_BOT_TOKEN,
    policy: timeoutPolicy,
    sleep_impl: async () => {},
    async fetch_impl(_url, options) {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
  });
  await assert.rejects(
    timeoutClient.fetchHostedFile({
      declared_file: declared,
      workspace_id: binding.workspace_id,
    }),
    (error) => error?.code === "attachment_timeout",
  );
});

test("external, unfurl, deleted, check-file-info, unknown, and Slack Connect files HOLD without authority", async () => {
  const binding = await makeBinding();
  binding.schema_version = "soulforge.slack_continuous.binding.v2";
  binding.feature_enabled = true;
  binding.attachment_policy.feature_enabled = true;
  const safeFile = {
    id: "FHOLD0001",
    size: 5,
    mimetype: "image/png",
    filetype: "png",
  };
  const messages = [
    { ...rawMessage({ ts: "1720000200.000100" }), attachments: [{ service_name: "unfurl" }] },
    { ...rawMessage({ ts: "1720000200.000200" }), files: [{ ...safeFile, is_external: true }] },
    { ...rawMessage({ ts: "1720000200.000300" }), files: [{ ...safeFile, deleted: true }] },
    { ...rawMessage({ ts: "1720000200.000400" }), files: [{ ...safeFile, file_access: "check_file_info" }] },
    { ...rawMessage({ ts: "1720000200.000500" }), files: [{ id: "FUNKNOWN1" }] },
    { ...rawMessage({ ts: "1720000200.000600" }), files: [{ ...safeFile, id: "FCONNECT1" }] },
  ];
  const records = messages.map((message, index) => record(
    `EvAttachHold${index}`,
    message,
    index === 5 ? { is_shared: true, is_ext_shared: true } : {},
  ));
  let downloadCalls = 0;
  const transport = {
    kind: "web_api",
    async pull() {
      return {
        page_id: "hosted-hold-page",
        previous_cursor_digest: null,
        next_cursor_digest: null,
        next_cursor_token: null,
        records,
      };
    },
    async fetchHostedFile() {
      downloadCalls += 1;
      throw Object.assign(new Error("unknown state"), { code: "attachment_not_safe_hosted_file" });
    },
  };
  const result = await runSlackContinuousIngress({
    binding,
    expected_binding_digest: digestSlackContinuousBinding(binding),
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    transport,
    dry_run: false,
  });
  assert.equal(result.accepted_count, 0);
  assert.equal(result.held_count, records.length);
  assert.equal(downloadCalls, 0);
  assert.deepEqual(result.coverage_gaps, ["attachment_custody_incomplete"]);
  const state = JSON.parse(await readFile(
    path.join(binding.data_root, "state", "slack-continuous.json"),
    "utf8",
  ));
  assert.equal(state.attachment_receipts.length, 0);
  assert.equal(state.revisions.length, 0);
});

test("attachment feature OFF makes no file call and a partial file failure HOLDs the whole message", async () => {
  const binding = await makeBinding();
  binding.schema_version = "soulforge.slack_continuous.binding.v2";
  binding.feature_enabled = true;
  const files = [
    {
      id: "FPARTIAL1",
      size: 5,
      mimetype: "image/png",
      filetype: "png",
    },
    {
      id: "FPARTIAL2",
      size: 5,
      mimetype: "image/png",
      filetype: "png",
    },
  ];
  const records = [record("EvPartialFiles", {
    ...rawMessage({ ts: "1720000300.000100" }),
    files,
  })];
  let calls = 0;
  const transport = {
    kind: "web_api",
    async pull() {
      return {
        page_id: "partial-file-page",
        previous_cursor_digest: null,
        next_cursor_digest: null,
        next_cursor_token: null,
        records,
      };
    },
    async fetchHostedFile({ declared_file: declared }) {
      calls += 1;
      if (declared.id === "FPARTIAL2") {
        throw Object.assign(new Error("synthetic network failure"), {
          code: "attachment_network_failed",
        });
      }
      const bytes = Buffer.from("12345");
      return {
        file_id: declared.id,
        revision_ref: "slack-file-rev:partial",
        size_bytes: bytes.length,
        mime_type: declared.mimetype,
        file_type: declared.filetype,
        bytes,
        content_sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      };
    },
  };
  const request = {
    binding,
    expected_binding_digest: digestSlackContinuousBinding(binding),
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    transport,
  };
  const offResult = await runSlackContinuousIngress(request);
  assert.equal(offResult.held_count, 1);
  assert.equal(calls, 0);

  await rm(binding.data_root, { recursive: true, force: true });
  binding.attachment_policy.feature_enabled = true;
  request.expected_binding_digest = digestSlackContinuousBinding(binding);
  const partialResult = await runSlackContinuousIngress(request);
  assert.equal(calls, 2);
  assert.equal(partialResult.accepted_count, 0);
  assert.equal(partialResult.held_count, 1);
  assert.deepEqual(partialResult.coverage_gaps, ["attachment_custody_incomplete"]);
  const state = JSON.parse(await readFile(
    path.join(binding.data_root, "state", "slack-continuous.json"),
    "utf8",
  ));
  assert.equal(state.revisions.length, 0);
  assert.equal(state.attachment_receipts.length, 0);
  assert.match(
    state.hold_receipts[0].hold_reasons.join(","),
    /attachment_network_failed/u,
  );
  await assert.rejects(
    lstat(path.join(binding.attachment_policy.custody_root, "sha256")),
    (error) => error.code === "ENOENT",
  );
  await assert.rejects(
    lstat(path.join(binding.attachment_policy.custody_root, "file_ids")),
    (error) => error.code === "ENOENT",
  );
});

test("attachment custody rolls back content and file-ID receipts when the page state commit fails", async () => {
  const binding = await makeBinding();
  binding.schema_version = "soulforge.slack_continuous.binding.v2";
  binding.feature_enabled = true;
  binding.attachment_policy.feature_enabled = true;
  const bytes = Buffer.from("atomic-page-attachment", "utf8");
  const declared = {
    id: "FATOMIC01",
    size: bytes.length,
    mimetype: "image/png",
    filetype: "png",
  };
  const transport = {
    kind: "web_api",
    async pull() {
      return {
        page_id: "atomic-page-failure",
        previous_cursor_digest: null,
        next_cursor_digest: null,
        next_cursor_token: null,
        records: [record("EvAtomicAttachment", {
          ...rawMessage({ ts: "1720000400.000100" }),
          files: [declared],
        })],
      };
    },
    async fetchHostedFile() {
      return {
        file_id: declared.id,
        revision_ref: "slack-file-rev:atomic",
        size_bytes: bytes.length,
        mime_type: declared.mimetype,
        file_type: declared.filetype,
        bytes,
        content_sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      };
    },
  };
  await assert.rejects(
    runSlackContinuousIngress({
      binding,
      expected_binding_digest: digestSlackContinuousBinding(binding),
      writer_authority_id: binding.writer.authority_id,
      writer_epoch: binding.writer.epoch,
      transport,
      test_fail_before_state_rename: true,
    }),
    (error) => error.code === "injected_atomic_failure",
  );
  const digest = createHash("sha256").update(bytes).digest("hex");
  await assert.rejects(
    lstat(path.join(
      binding.attachment_policy.custody_root,
      "sha256",
      digest.slice(0, 2),
      `${digest}.bin`,
    )),
    (error) => error.code === "ENOENT",
  );
  await assert.rejects(
    lstat(path.join(
      binding.attachment_policy.custody_root,
      "file_ids",
      `${declared.id}.json`,
    )),
    (error) => error.code === "ENOENT",
  );
  await assert.rejects(
    lstat(path.join(binding.data_root, "state", "slack-continuous.json")),
    (error) => error.code === "ENOENT",
  );
});

test("CLI accepts only dry-run and stdout contains aggregate metadata, not raw or secret paths", async () => {
  const binding = await makeBinding();
  const request = {
    binding,
    expected_binding_digest: digestSlackContinuousBinding(binding),
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    records: [fullRevisionRecords()[0]],
  };
  const cli = path.join(moduleDirectory, "slack_continuous_cli.mjs");
  const result = spawnSync(process.execPath, [cli, "--dry-run"], {
    cwd: moduleDirectory,
    input: JSON.stringify(request),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const aggregate = JSON.parse(result.stdout);
  assert.equal(aggregate.mode, "dry_run");
  assert.equal(aggregate.private_writes, 0);
  assert.doesNotMatch(result.stdout, /private synthetic body|SLACK_APP_TOKEN|slack-custody/u);
  await assert.rejects(lstat(binding.data_root), (error) => error.code === "ENOENT");

  const refused = spawnSync(process.execPath, [cli, "--apply"], {
    cwd: moduleDirectory,
    input: JSON.stringify(request),
    encoding: "utf8",
  });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /accepts_only_dry_run/u);
});

test("re-pulled message that carried edited at first pull replays its retained revision", async () => {
  const binding = await makeBinding();
  const editedAtFirstPull = {
    ...rawMessage({ ts: "1720000200.000100" }),
    edited: { user: "U00000001", ts: "1720000200.000150" },
  };
  const first = await run(binding, [record("EvEditedFirst", editedAtFirstPull)]);
  assert.equal(first.accepted_count, 1);
  assert.equal(first.revision_count, 1);
  const statePath = path.join(binding.data_root, "state", "slack-continuous.json");
  const initialRef = JSON.parse(await readFile(statePath, "utf8")).revisions[0].revision_ref;

  const second = await run(binding, [
    record("EvEditedFirst", clone(editedAtFirstPull)),
    record("EvEditedNew", rawMessage({ ts: "1720000200.000200" }), {
      received_at: "2026-07-23T01:00:05.000Z",
    }),
  ]);
  assert.equal(second.accepted_count, 2);
  assert.equal(second.revision_count, 2);
  const secondState = JSON.parse(await readFile(statePath, "utf8"));
  const evidence = secondState.cursor.delivery_evidence.find(
    (entry) => entry.event_id === "EvEditedFirst",
  );
  assert.equal(evidence.revision_ref, initialRef);
  assert.equal(
    secondState.revisions.filter((revision) => revision.revision_kind === "edit").length,
    0,
  );
});

test("volatile Slack metadata changes replay the retained revision instead of forking identity", async () => {
  const binding = await makeBinding();
  const rootTs = "1720000300.000100";
  const first = await run(binding, [record("EvVolatile1", rawMessage({ ts: rootTs }))]);
  assert.equal(first.revision_count, 1);
  const statePath = path.join(binding.data_root, "state", "slack-continuous.json");
  const initialRef = JSON.parse(await readFile(statePath, "utf8")).revisions[0].revision_ref;

  const withVolatileMetadata = {
    ...rawMessage({ ts: rootTs, thread_ts: rootTs }),
    reply_count: 1,
    reply_users: ["U00000002"],
    reply_users_count: 1,
    latest_reply: "1720000300.000200",
    reactions: [{ name: "eyes", users: ["U00000002"], count: 1 }],
  };
  const second = await run(binding, [
    record("EvVolatile2", withVolatileMetadata),
    record("EvVolatileReply", rawMessage({
      ts: "1720000300.000200",
      user: "U00000002",
      text: "private reply",
      thread_ts: rootTs,
    }), { received_at: "2026-07-23T01:00:06.000Z" }),
  ]);
  assert.equal(second.accepted_count, 2);
  assert.equal(second.revision_count, 2);
  const secondState = JSON.parse(await readFile(statePath, "utf8"));
  const evidence = secondState.cursor.delivery_evidence.find(
    (entry) => entry.event_id === "EvVolatile2",
  );
  assert.equal(evidence.revision_ref, initialRef);
  assert.deepEqual(
    new Set(secondState.revisions.map((revision) => revision.revision_kind)),
    new Set(["message", "reply"]),
  );
});

test("editing a thread parent keeps thread lineage after the parent gains thread metadata", async () => {
  const binding = await makeBinding();
  const rootTs = "1720000400.000100";
  const replyTs = "1720000400.000200";
  const reply = () => record("EvThreadReply", rawMessage({
    ts: replyTs,
    user: "U00000002",
    text: "private reply",
    thread_ts: rootTs,
  }), { received_at: "2026-07-23T01:00:01.000Z" });
  const first = await run(binding, [
    record("EvThreadRoot", rawMessage({ ts: rootTs })),
    reply(),
  ]);
  assert.equal(first.revision_count, 2);

  const editedParent = {
    ...rawMessage({ ts: rootTs, text: "private edited parent", thread_ts: rootTs }),
    edited: { user: "U00000001", ts: "1720000400.000300" },
    reply_count: 1,
    latest_reply: replyTs,
  };
  const second = await run(binding, [
    record("EvThreadRootEdited", editedParent),
    reply(),
    record("EvThreadNew", rawMessage({ ts: "1720000400.000400" }), {
      received_at: "2026-07-23T01:00:07.000Z",
    }),
  ]);
  assert.equal(second.accepted_count, 3);
  assert.equal(second.revision_count, 4);
  const state = JSON.parse(await readFile(
    path.join(binding.data_root, "state", "slack-continuous.json"),
    "utf8",
  ));
  const edit = state.revisions.find((revision) => revision.revision_kind === "edit");
  assert.equal(edit.message_ts, rootTs);
  assert.equal(edit.thread_ts, null);
});

test("re-delivered delete events replay instead of superseding their own removal", async () => {
  const binding = await makeBinding();
  const rootTs = "1720000500.000100";
  const original = record("EvRemovalRoot", rawMessage({ ts: rootTs }));
  const removal = record("EvRemovalDelete", {
    type: "message",
    subtype: "message_deleted",
    deleted_ts: rootTs,
    event_ts: "1720000500.000200",
    user: "U00000001",
    previous_message: { user: "U00000001" },
  }, { received_at: "2026-07-23T01:00:01.000Z" });
  const first = await run(binding, [original, removal]);
  assert.equal(first.revision_count, 2);

  const second = await run(binding, [
    clone(original),
    clone(removal),
    record("EvRemovalNew", rawMessage({ ts: "1720000500.000300" }), {
      received_at: "2026-07-23T01:00:08.000Z",
    }),
  ]);
  assert.equal(second.accepted_count, 3);
  assert.equal(second.revision_count, 3);
  const state = JSON.parse(await readFile(
    path.join(binding.data_root, "state", "slack-continuous.json"),
    "utf8",
  ));
  assert.deepEqual(
    state.revisions
      .filter((revision) => revision.message_ts === rootTs)
      .map((revision) => revision.revision_kind)
      .sort(),
    ["delete", "message"],
  );
});
