import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  antigravityTimestampToIso,
  collectAntigravityUsageEvents,
  extractAntigravityModelId,
} from "./antigravity_collector.mjs";
import { runCli } from "./cli.mjs";
import { loadPersistedUsageEvents } from "./usage_meter.mjs";

const CONV_A = "11111111-2222-4333-8444-555555555555";
const CONV_B = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const CONV_ZERO = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const CONV_UNINDEXED = "12121212-3434-4565-8787-909090909090";
const PROJECT_UUID = "747dfb50-492d-47ff-9cd8-016bae565500";

function modelBlob(modelId) {
  return Uint8Array.from([
    0x0a, 0x12, 0x01,
    ...[...modelId].map((char) => char.charCodeAt(0)),
    0x00, 0x08, 0x02,
  ]);
}

async function writeAntigravityFixture(cliRoot) {
  await mkdir(path.join(cliRoot, "conversations"), { recursive: true });
  const index = new DatabaseSync(path.join(cliRoot, "conversation_summaries.db"));
  index.exec(`CREATE TABLE conversation_summaries (
    conversation_id TEXT, title TEXT, preview TEXT, step_count INTEGER,
    last_modified_time datetime, last_user_input_time datetime,
    project_id TEXT, agent_name TEXT, status TEXT, source TEXT
  )`);
  const insert = index.prepare(
    "INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    CONV_A, "TITLE-SECRET-A", "PREVIEW-SECRET-A", 8,
    "2026-08-02 09:00:00.7654321+00:00", "2026-08-01 10:00:00.1234567+00:00",
    PROJECT_UUID, "", "", "",
  );
  insert.run(
    CONV_B, "TITLE-SECRET-B", "PREVIEW-SECRET-B", 3,
    "2026-07-30 12:00:00+00:00", "0001-01-01 00:00:00+00:00",
    "not a safe id!", "", "", "",
  );
  insert.run(
    CONV_ZERO, "TITLE-SECRET-C", "PREVIEW-SECRET-C", 1,
    "0001-01-01 00:00:00+00:00", "0001-01-01 00:00:00+00:00",
    PROJECT_UUID, "", "", "",
  );
  index.close();

  const writeConversation = (conversationId, rows) => {
    const db = new DatabaseSync(path.join(cliRoot, "conversations", `${conversationId}.db`));
    db.exec("CREATE TABLE gen_metadata (idx INTEGER, data BLOB)");
    const insertRow = db.prepare("INSERT INTO gen_metadata VALUES (?, ?)");
    for (const [idx, blob] of rows) insertRow.run(idx, blob);
    db.close();
  };
  writeConversation(CONV_A, [
    [0, modelBlob("gemini-3-pro")],
    [1, modelBlob("claude-sonnet-4-5")],
  ]);
  writeConversation(CONV_B, [[0, Uint8Array.from([0x01, 0x02, 0x03])]]);
  writeConversation(CONV_ZERO, [[0, modelBlob("gemini-3-flash")]]);
  writeConversation(CONV_UNINDEXED, [[0, modelBlob("gpt-5.2")]]);
}

test("Antigravity conversation DBs become request-count-only metadata events", async () => {
  const cliRoot = await mkdtemp(path.join(os.tmpdir(), "sf-antigravity-collector-"));
  try {
    await writeAntigravityFixture(cliRoot);
    const result = await collectAntigravityUsageEvents({
      cliRoot,
      config: { organization_id: "org-a", default_team_id: "team-a", node_id: "node-a" },
    });

    assert.equal(result.conversation_db_count, 4);
    assert.equal(result.indexed_conversation_count, 3);
    assert.equal(result.skipped_conversation_count, 2);
    assert.equal(result.observed_row_count, 3);
    assert.equal(result.issues.length, 0);
    assert.equal(result.events.length, 3);

    const first = result.events.find((event) => event.event_id === `aue-ag-${CONV_A}-0`);
    assert.equal(first.thread_id, CONV_A);
    assert.equal(first.turn_id, `${CONV_A}.0`);
    assert.equal(first.root_turn_id, `${CONV_A}.0`);
    assert.equal(first.work_id, `antigravity.${CONV_A}`);
    assert.equal(first.project_id, PROJECT_UUID);
    assert.deepEqual(first.source, {
      kind: "antigravity_conversation_db", source_ref: CONV_A, originator: null,
    });
    assert.equal(first.model.id, "gemini-3-pro");
    assert.deepEqual(first.usage, {
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_write_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0,
      uncached_input_tokens: 0,
      model_invocation_count: 1,
      max_invocation_input_tokens: 0,
    });
    assert.deepEqual(first.credits, {
      status: "rate_unknown", rate_card_id: "unpriced", service_tier: "standard", total: null, components: null,
    });
    assert.equal(first.time.started_at, "2026-08-01T10:00:00.123Z");
    assert.equal(first.time.completed_at, first.time.started_at);
    assert.deepEqual(first.measurement, {
      status: "complete", token_confidence: "request_count_only", attribution_confidence: "derived_lineage",
    });

    const second = result.events.find((event) => event.event_id === `aue-ag-${CONV_A}-1`);
    assert.equal(second.model.id, "claude-sonnet-4-5");

    const fallback = result.events.find((event) => event.event_id === `aue-ag-${CONV_B}-0`);
    assert.equal(fallback.model.id, "unknown");
    assert.equal(fallback.project_id, "unassigned");
    assert.equal(fallback.time.started_at, "2026-07-30T12:00:00.000Z");

    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /TITLE-SECRET|PREVIEW-SECRET|conversations|\.db/u);
    assert.doesNotMatch(serialized, new RegExp(CONV_ZERO, "u"));
    assert.doesNotMatch(serialized, new RegExp(CONV_UNINDEXED, "u"));
  } finally {
    await rm(cliRoot, { recursive: true, force: true });
  }
});

test("Antigravity collection is a clean no-op without the CLI root", async () => {
  const cliRoot = await mkdtemp(path.join(os.tmpdir(), "sf-antigravity-missing-"));
  try {
    const missing = await collectAntigravityUsageEvents({
      cliRoot: path.join(cliRoot, "does-not-exist"),
      config: {},
    });
    assert.deepEqual(missing, {
      events: [],
      issues: [],
      conversation_db_count: 0,
      indexed_conversation_count: 0,
      skipped_conversation_count: 0,
      observed_row_count: 0,
    });
  } finally {
    await rm(cliRoot, { recursive: true, force: true });
  }
});

test("Antigravity CLI dry-run and apply re-runs stay idempotent", async () => {
  const cliRoot = await mkdtemp(path.join(os.tmpdir(), "sf-antigravity-cli-"));
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "sf-antigravity-cli-state-"));
  try {
    await writeAntigravityFixture(cliRoot);
    const dry = await runCli(["collect-antigravity", "--cli-root", cliRoot, "--state-root", stateRoot]);
    assert.equal(dry.mode, "dry_run");
    assert.equal(dry.event_count, 3);
    assert.equal(dry.persistence, null);
    assert.equal((await loadPersistedUsageEvents(stateRoot)).length, 0);

    const applied = await runCli([
      "collect-antigravity", "--cli-root", cliRoot, "--state-root", stateRoot, "--apply",
    ]);
    assert.equal(applied.persistence.created, 3);
    const replayed = await runCli([
      "collect-antigravity", "--cli-root", cliRoot, "--state-root", stateRoot, "--apply",
    ]);
    assert.equal(replayed.persistence.created, 0);
    assert.equal(replayed.persistence.replayed, 3);
    const persisted = await loadPersistedUsageEvents(stateRoot);
    assert.equal(persisted.length, 3);
    assert.equal(persisted[0].source.kind, "antigravity_conversation_db");
  } finally {
    await rm(cliRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("Antigravity timestamp and model scans stay defensive", () => {
  assert.equal(antigravityTimestampToIso("2026-07-25 03:32:05.4959863+00:00"), "2026-07-25T03:32:05.495Z");
  assert.equal(antigravityTimestampToIso("0001-01-01 00:00:00+00:00"), null);
  assert.equal(antigravityTimestampToIso(1786163319), "2026-08-08T04:28:39.000Z");
  assert.equal(antigravityTimestampToIso(1786163319000), "2026-08-08T04:28:39.000Z");
  assert.equal(antigravityTimestampToIso(""), null);
  assert.equal(antigravityTimestampToIso(null), null);
  assert.equal(antigravityTimestampToIso("not a date"), null);

  assert.equal(extractAntigravityModelId(modelBlob("gemini-3-pro")), "gemini-3-pro");
  assert.equal(extractAntigravityModelId(modelBlob("GPT-5.2")), "gpt-5.2");
  assert.equal(extractAntigravityModelId(Uint8Array.from([1, 2, 3])), "unknown");
  assert.equal(extractAntigravityModelId(null), "unknown");
});
