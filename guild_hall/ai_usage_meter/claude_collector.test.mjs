import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import {
  collectClaudeUsageEvents,
  createClaudeCollectionEnvelope,
  deriveClaudeProjectSlug,
  validateClaudeCollectionEnvelope,
} from "./claude_collector.mjs";
import { runCli } from "./cli.mjs";
import {
  loadPersistedUsageEvents,
  persistUsageEvents,
  validateUsageEvent,
} from "./usage_meter.mjs";

const WIN_DRIVE = `${String.fromCharCode(67)}:`;
const SESSION_A = "6f0a1b2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c";
const SESSION_OLD = "0e1d2c3b-4a5f-4e6d-9c8b-7a6f5e4d3c2b";

function assistantLine({
  timestamp,
  sessionId = SESSION_A,
  cwd = `${WIN_DRIVE}\\Workspace\\Alpha Project`,
  isSidechain = false,
  effort = "high",
  messageId = "msg_alpha001",
  requestId = "req_alpha001",
  model = "claude-opus-5",
  usage = {
    input_tokens: 2,
    cache_creation_input_tokens: 100,
    cache_read_input_tokens: 900,
    output_tokens: 50,
  },
}) {
  const message = { id: messageId, type: "message", role: "assistant", model, usage };
  if (messageId === null) delete message.id;
  return JSON.stringify({
    type: "assistant",
    timestamp,
    sessionId,
    cwd,
    isSidechain,
    effort,
    requestId,
    message,
  });
}

async function writeSessionFixture(projectsRoot) {
  const slugDir = path.join(projectsRoot, "C--Workspace-Alpha");
  await mkdir(slugDir, { recursive: true });
  const lines = [
    JSON.stringify({ type: "user", timestamp: "2026-08-05T01:00:00.000Z", sessionId: SESSION_A }),
    assistantLine({ timestamp: "2026-08-05T01:00:01.000Z" }),
    assistantLine({ timestamp: "2026-08-05T01:00:01.500Z" }),
    assistantLine({ timestamp: "2026-08-05T01:00:02.000Z" }),
    assistantLine({
      timestamp: "2026-08-05T01:05:00.000Z",
      isSidechain: true,
      effort: null,
      messageId: null,
      requestId: "req_beta001",
      model: "claude-haiku-4",
      usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 },
    }),
    "{ this line is not valid json",
    JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-05T01:06:00.000Z",
      sessionId: SESSION_A,
      message: { id: "msg_no_usage", model: "claude-opus-5" },
    }),
  ];
  await writeFile(path.join(slugDir, `${SESSION_A}.jsonl`), `${lines.join("\n")}\n`, "utf8");

  const oldDir = path.join(projectsRoot, "C--Old-Project");
  await mkdir(oldDir, { recursive: true });
  const oldFile = path.join(oldDir, `${SESSION_OLD}.jsonl`);
  await writeFile(oldFile, `${assistantLine({
    timestamp: "2026-05-01T00:00:00.000Z",
    sessionId: SESSION_OLD,
    messageId: "msg_old001",
    cwd: `${WIN_DRIVE}\\Old\\Stale`,
  })}\n`, "utf8");
  const stale = new Date("2026-05-01T00:00:00.000Z");
  await utimes(oldFile, stale, stale);
}

test("Claude sessions become deduplicated per-message metadata-only events", async () => {
  const projectsRoot = await mkdtemp(path.join(os.tmpdir(), "sf-claude-collector-"));
  try {
    await writeSessionFixture(projectsRoot);
    const result = await collectClaudeUsageEvents({
      projectsRoot,
      maxAgeDays: 45,
      now: Date.parse("2026-08-07T00:00:00.000Z"),
      config: { organization_id: "org-a", default_team_id: "team-a", node_id: "node-a" },
    });

    assert.equal(result.session_file_count, 1);
    assert.equal(result.parsed_session_count, 1);
    assert.equal(result.issue_count ?? result.issues.length, 0);
    assert.equal(result.observed_message_count, 2);
    assert.equal(result.duplicate_message_count, 2);
    assert.equal(result.events.length, 2);

    const [main, sidechain] = result.events;
    assert.equal(main.event_id, "aue-cl-msg_alpha001");
    assert.equal(main.thread_id, SESSION_A);
    assert.equal(main.turn_id, "msg_alpha001");
    assert.equal(main.root_thread_id, SESSION_A);
    assert.equal(main.root_turn_id, "msg_alpha001");
    assert.equal(main.parent_thread_id, null);
    assert.equal(main.work_id, `claude.${SESSION_A}`);
    assert.equal(main.project_id, "alpha-project");
    assert.equal(main.organization_id, "org-a");
    assert.equal(main.team_id, "team-a");
    assert.deepEqual(main.source, { kind: "claude_session_jsonl", source_ref: SESSION_A, originator: null });
    assert.deepEqual(main.actor, { node_id: "node-a", agent_id: "root", agent_depth: 0, role: "executor" });
    assert.deepEqual(main.model, {
      id: "claude-opus-5", reasoning_effort: "high", service_tier: "standard", context_window: null,
    });
    assert.deepEqual(main.usage, {
      input_tokens: 1002,
      cached_input_tokens: 900,
      cache_write_input_tokens: 100,
      output_tokens: 50,
      reasoning_output_tokens: 0,
      total_tokens: 1052,
      uncached_input_tokens: 2,
      model_invocation_count: 1,
      max_invocation_input_tokens: 1002,
    });
    assert.deepEqual(main.credits, {
      status: "rate_unknown", rate_card_id: "unpriced", service_tier: "standard", total: null, components: null,
    });
    assert.deepEqual(main.time, {
      started_at: "2026-08-05T01:00:01.000Z",
      completed_at: "2026-08-05T01:00:01.000Z",
      duration_ms: null,
    });
    assert.equal(main.rate_limit_snapshot, null);
    assert.deepEqual(main.measurement, {
      status: "complete", token_confidence: "exact_per_message", attribution_confidence: "derived_lineage",
    });

    assert.equal(sidechain.event_id, "aue-cl-req_beta001");
    assert.equal(sidechain.actor.agent_id, "sidechain");
    assert.equal(sidechain.actor.agent_depth, 1);
    assert.equal(sidechain.model.reasoning_effort, null);
    assert.equal(sidechain.usage.total_tokens, 15);

    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /Workspace|Alpha Project|\.jsonl|\\\\/u);

    const schema = JSON.parse(await readFile(new URL("./ai_usage_event.v1.schema.json", import.meta.url), "utf8"));
    const validate = new Ajv2020({
      strict: true,
      allowUnionTypes: true,
      formats: { "date-time": true },
    }).compile(schema);
    assert.equal(validate(main), true, JSON.stringify(validate.errors));
    const badPairing = structuredClone(main);
    badPairing.measurement.token_confidence = "exact_cumulative_delta";
    assert.equal(validate(badPairing), false);
  } finally {
    await rm(projectsRoot, { recursive: true, force: true });
  }
});

test("Claude project binding file overrides the derived cwd leaf slug", async () => {
  const projectsRoot = await mkdtemp(path.join(os.tmpdir(), "sf-claude-binding-"));
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "sf-claude-binding-state-"));
  try {
    await writeSessionFixture(projectsRoot);
    await mkdir(path.join(stateRoot, "bindings"), { recursive: true });
    await writeFile(
      path.join(stateRoot, "bindings", "claude_project_binding.json"),
      JSON.stringify({ "alpha-project": "project-alpha" }),
      "utf8",
    );
    const result = await collectClaudeUsageEvents({
      projectsRoot,
      stateRoot,
      now: Date.parse("2026-08-07T00:00:00.000Z"),
      config: {},
    });
    const main = result.events.find((event) => event.event_id === "aue-cl-msg_alpha001");
    assert.equal(main.project_id, "project-alpha");
    assert.equal(main.measurement.attribution_confidence, "explicit_binding");
  } finally {
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("Claude collect persistence and CLI re-runs stay idempotent", async () => {
  const projectsRoot = await mkdtemp(path.join(os.tmpdir(), "sf-claude-cli-"));
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "sf-claude-cli-state-"));
  try {
    await writeSessionFixture(projectsRoot);
    const dry = await runCli([
      "collect-claude",
      "--projects-root", projectsRoot,
      "--state-root", stateRoot,
    ]);
    assert.equal(dry.mode, "dry_run");
    assert.equal(dry.event_count, 2);
    assert.equal(dry.persistence, null);
    assert.equal(dry.collection.state, "observed");
    assert.equal(dry.collection.counts.accepted_event_count, 2);
    assert.equal(await loadPersistedUsageEvents(stateRoot).then((events) => events.length), 0);

    const applied = await runCli([
      "collect-claude",
      "--projects-root", projectsRoot,
      "--state-root", stateRoot,
      "--apply",
    ]);
    assert.equal(applied.mode, "apply");
    assert.equal(applied.persistence.created, 2);

    const replayed = await runCli([
      "collect-claude",
      "--projects-root", projectsRoot,
      "--state-root", stateRoot,
      "--apply",
    ]);
    assert.equal(replayed.persistence.created, 0);
    assert.equal(replayed.persistence.replayed, 2);

    const persisted = await loadPersistedUsageEvents(stateRoot);
    assert.equal(persisted.length, 2);
    assert.equal(persisted[0].source.kind, "claude_session_jsonl");
    assert.equal((await persistUsageEvents(stateRoot, persisted)).replayed, 2);
  } finally {
    await rm(projectsRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("Relaxed source kinds still enforce the token-confidence pairing", async () => {
  const projectsRoot = await mkdtemp(path.join(os.tmpdir(), "sf-claude-pairing-"));
  try {
    await writeSessionFixture(projectsRoot);
    const { events } = await collectClaudeUsageEvents({
      projectsRoot,
      now: Date.parse("2026-08-07T00:00:00.000Z"),
      config: {},
    });
    const valid = events[0];
    assert.deepEqual(validateUsageEvent(structuredClone(valid)), valid);

    const wrongConfidence = structuredClone(valid);
    wrongConfidence.measurement.token_confidence = "exact_cumulative_delta";
    assert.throws(
      () => validateUsageEvent(wrongConfidence),
      (error) => error?.code === "usage_event_token_confidence_invalid",
    );

    const unknownKind = structuredClone(valid);
    unknownKind.source.kind = "gemini_session_jsonl";
    assert.throws(
      () => validateUsageEvent(unknownKind),
      (error) => error?.code === "usage_event_source_kind_invalid",
    );

    const pricedUnknown = structuredClone(valid);
    pricedUnknown.credits.total = 1;
    assert.throws(
      () => validateUsageEvent(pricedUnknown),
      (error) => error?.code === "usage_event_unknown_credit_invalid",
    );
  } finally {
    await rm(projectsRoot, { recursive: true, force: true });
  }
});

test("Claude cwd leaf slug derivation never leaks the full path", () => {
  assert.equal(deriveClaudeProjectSlug(`${WIN_DRIVE}\\Workspace\\Alpha Project`), "alpha-project");
  assert.equal(deriveClaudeProjectSlug(["", "home", "user", "soulforge"].join("/")), "soulforge");
  assert.equal(deriveClaudeProjectSlug(`${WIN_DRIVE}\\`), "c-");
  assert.equal(deriveClaudeProjectSlug(""), "unassigned");
  assert.equal(deriveClaudeProjectSlug(null), "unassigned");
  assert.equal(deriveClaudeProjectSlug([WIN_DRIVE, "tmp", ".claude"].join("/")), "unassigned");
});

test("Claude collection envelope distinguishes source states and keeps only safe evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-claude-envelope-"));
  const attemptedAt = Date.parse("2026-08-03T02:00:00.000Z");
  try {
    const missing = await collectClaudeUsageEvents({
      projectsRoot: path.join(root, "missing-root"),
      now: attemptedAt,
    });
    const empty = await collectClaudeUsageEvents({ projectsRoot: root, now: attemptedAt });
    await mkdir(path.join(root, "safe-project"), { recursive: true });
    await writeFile(
      path.join(root, "safe-project", "good.jsonl"),
      `${assistantLine({ timestamp: "2026-08-03T00:00:00.000Z", sessionId: "safe-session", messageId: "safe-message" })}\n`,
      "utf8",
    );
    const observed = await collectClaudeUsageEvents({ projectsRoot: root, now: attemptedAt });
    await writeFile(
      path.join(root, "safe-project", ".jsonl"),
      `${assistantLine({ timestamp: "2026-08-03T00:01:00.000Z", sessionId: null, messageId: "bad-message" })}\n`,
      "utf8",
    );
    const partial = await collectClaudeUsageEvents({ projectsRoot: root, now: attemptedAt });
    await rm(path.join(root, "safe-project", "good.jsonl"));
    const error = await collectClaudeUsageEvents({ projectsRoot: root, now: attemptedAt });

    assert.equal(missing.collection.state, "missing");
    assert.equal(empty.collection.state, "available_empty");
    assert.equal(observed.collection.state, "observed");
    assert.equal(partial.collection.state, "partial");
    assert.equal(error.collection.state, "error");
    assert.equal(empty.collection.counts.accepted_event_count, 0);
    assert.equal(observed.collection.counts.accepted_event_count, 1);
    assert.equal(partial.collection.counts.issue_count, 1);
    assert.equal(error.collection.counts.parsed_session_count, 0);
    assert.equal(observed.collection.evidence_scope, "collector_attempt_source_observation_only");
    assert.equal(
      observed.collection.claim_scope,
      "does_not_prove_provider_availability_health_live_e2e_or_aggregate_health_or_completeness",
    );
    assert.doesNotMatch(JSON.stringify(observed.collection), /safe-project|good\.jsonl|source_ref|prompt|secret/u);

    const stale = { ...observed.collection, freshness: "stale" };
    assert.equal(
      validateClaudeCollectionEnvelope(stale, { referenceAt: "2026-08-03T02:16:00.000Z" }).freshness,
      "stale",
    );
    const future = { ...observed.collection, freshness: "unknown" };
    assert.throws(
      () => validateClaudeCollectionEnvelope(future, { referenceAt: "2026-08-03T01:59:00.000Z" }),
      (errorValue) => errorValue?.code === "claude_collection_freshness_invalid",
    );
    const normalizedFuture = createClaudeCollectionEnvelope(future, {
      referenceAt: "2026-08-03T01:59:00.000Z",
    });
    assert.equal(normalizedFuture.state, "unknown");
    assert.equal(normalizedFuture.attempted_at, null);
    assert.deepEqual(normalizedFuture.counts, {
      session_file_count: 0,
      parsed_session_count: 0,
      observed_message_count: 0,
      accepted_event_count: 0,
      duplicate_message_count: 0,
      issue_count: 0,
    });
    const invalidTimestamp = { ...observed.collection, attempted_at: "not-a-timestamp" };
    assert.throws(
      () => validateClaudeCollectionEnvelope(invalidTimestamp, { referenceAt: "2026-08-03T02:00:00.000Z" }),
      (errorValue) => errorValue?.code === "claude_collection_envelope_invalid",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collect-claude keeps missing and partial explicit but exits nonzero on collector error", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-claude-cli-error-"));
  const missingRoot = path.join(root, "missing-root");
  const projectRoot = path.join(root, "safe-project");
  const goodFile = path.join(projectRoot, "good.jsonl");
  const stateRoot = path.join(root, "meter-state");
  try {
    const missing = await runCli(["collect-claude", "--projects-root", missingRoot]);
    assert.equal(missing.collection.state, "missing");

    await mkdir(projectRoot, { recursive: true });
    await writeFile(
      goodFile,
      `${assistantLine({ timestamp: new Date().toISOString(), sessionId: "safe-session", messageId: "safe-message" })}\n`,
      "utf8",
    );
    await writeFile(
      path.join(projectRoot, ".jsonl"),
      `${assistantLine({ timestamp: new Date().toISOString(), sessionId: null, messageId: "bad-message" })}\n`,
      "utf8",
    );
    const partial = await runCli(["collect-claude", "--projects-root", root]);
    assert.equal(partial.collection.state, "partial");
    assert.equal(partial.collection.counts.accepted_event_count, 1);

    await rm(goodFile);
    await assert.rejects(
      () => runCli(["collect-claude", "--projects-root", root, "--state-root", stateRoot, "--apply"]),
      (errorValue) => {
        assert.equal(errorValue?.code, "claude_collection_error");
        assert.equal(errorValue?.collection?.state, "error");
        assert.doesNotMatch(JSON.stringify(errorValue.collection), /safe-project|bad-message|source_ref|prompt|secret|credential|cookie/u);
        return true;
      },
    );
    assert.equal((await loadPersistedUsageEvents(stateRoot)).length, 0);

    const processResult = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./cli.mjs", import.meta.url)),
        "collect-claude", "--projects-root", root,
        "--state-root", stateRoot,
        "--apply",
      ],
      { encoding: "utf8" },
    );
    assert.equal(processResult.status, 1);
    assert.equal(processResult.stdout, "");
    const errorPayload = JSON.parse(processResult.stderr);
    assert.equal(errorPayload.ok, false);
    assert.equal(errorPayload.error, "claude_collection_error");
    assert.equal(errorPayload.collection.state, "error");
    assert.doesNotMatch(JSON.stringify(errorPayload), /safe-project|bad-message|source_ref|prompt|secret|credential|cookie/u);
    assert.equal((await loadPersistedUsageEvents(stateRoot)).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
