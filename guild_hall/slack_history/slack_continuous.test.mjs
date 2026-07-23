import assert from "node:assert/strict";
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
} from "./slack_custody.mjs";
import {
  createSlackWebApiCompatibleAdapter,
  createSlackWebApiCall,
  createSlackWebApiPollingTransport,
  createSyntheticSlackTransport,
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
