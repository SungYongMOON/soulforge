import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import {
  CODEX_ACTIVITY_PATH,
  CODEX_ACTIVITY_SCHEMA,
  MAX_CODEX_ACTIVITY_PROJECTION_BYTES,
  collapseCodexActivityTurns,
  createCodexActivityProjection,
  loadCodexActivityProjection,
  persistCodexActivityProjection,
  validateCodexActivityProjection,
} from "./codex_usage_activity.mjs";

test("createCodexActivityProjection aggregates multi-day observation deltas and reconciles totals in compact format", () => {
  const sampleTurns = [
    {
      thread_id: "thread-1",
      turn_id: "turn-1",
      usage: { input_tokens: 200, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 100, reasoning_output_tokens: 0, total_tokens: 300 },
      observations: [
        {
          observed_at: "2026-08-21T10:00:00.000Z",
          delta_tokens: 100,
          delta_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
          cumulative_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
        },
        {
          observed_at: "2026-08-22T02:00:00.000Z",
          delta_tokens: 200,
          delta_usage: { input_tokens: 130, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 70, reasoning_output_tokens: 0, total_tokens: 200 },
          cumulative_usage: { input_tokens: 200, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 100, reasoning_output_tokens: 0, total_tokens: 300 },
        },
      ],
    },
    {
      thread_id: "thread-2",
      turn_id: "turn-2",
      usage: { input_tokens: 50, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 100 },
      observations: [
        {
          observed_at: "2026-08-22T05:00:00.000Z",
          delta_tokens: 100,
          delta_usage: { input_tokens: 50, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 100 },
          cumulative_usage: { input_tokens: 50, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 100 },
        },
      ],
    },
  ];

  const projection = createCodexActivityProjection(sampleTurns, {
    scope: "full_sessions_root",
    session_file_count: 2,
    parsed_session_count: 2,
  }, { generatedAt: "2026-08-24T12:00:00.000Z" });

  assert.equal(projection.schema_version, CODEX_ACTIVITY_SCHEMA);
  assert.equal(projection.totals.total_tokens, 400);
  assert.equal(projection.reconciliation.total_tokens, 400);
  assert.equal(projection.reconciliation.thread_count, 2);
  assert.equal(projection.reconciliation.turn_count, 2);
  assert.equal(projection.reconciliation.observation_count, 3);

  // Compact format check: no redundant model, effort, rate limit, usage partition, or daily fields
  assert.equal(projection.daily, undefined);
  assert.equal(projection.threads[0].model_id, undefined);
  assert.equal(projection.threads[0].final_usage, undefined);
  assert.equal(projection.threads[0].observations[0].delta_usage, undefined);
  assert.equal(projection.threads[0].observations[0].rate_limit_snapshot, undefined);

  assert.deepEqual(projection.threads[0].observations, [
    { observed_at: "2026-08-21T10:00:00.000Z", delta_tokens: 100 },
    { observed_at: "2026-08-22T02:00:00.000Z", delta_tokens: 200 },
  ]);
});

test("privacy boundary: projection contains zero prompt, reasoning, or tool payload metadata", () => {
  const sampleTurns = [
    {
      thread_id: "thread-1",
      turn_id: "turn-1",
      observations: [
        {
          observed_at: "2026-08-21T10:00:00.000Z",
          delta_tokens: 100,
          delta_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
          cumulative_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
        },
      ],
    },
  ];

  const projection = createCodexActivityProjection(sampleTurns);
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /(?:session_path|raw_prompt|prompt_text|message_body|bearer_token|tool_args)/iu);
  assert.equal(projection.privacy.metadata_only, true);
  assert.equal(projection.privacy.prompt_captured, false);
  assert.equal(projection.privacy.reasoning_captured, false);
  assert.equal(projection.privacy.tool_payload_captured, false);
});

test("counter regression exclusion: turns with counter regression are excluded with safe issue", () => {
  const turnsWithRegression = [
    {
      thread_id: "thread-good",
      turn_id: "turn-good",
      observations: [
        {
          observed_at: "2026-08-21T10:00:00.000Z",
          delta_tokens: 50,
          delta_usage: { input_tokens: 30, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 0, total_tokens: 50 },
          cumulative_usage: { input_tokens: 30, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 0, total_tokens: 50 },
        },
      ],
    },
    {
      thread_id: "thread-bad",
      turn_id: "turn-bad",
      has_counter_regression: true,
    },
  ];

  const projection = createCodexActivityProjection(turnsWithRegression);
  assert.equal(projection.threads.length, 1);
  assert.equal(projection.threads[0].thread_id, "thread-good");
  assert.ok(projection.issues.some((i) => i.code === "codex_activity_counter_regression"));
});

test("observation conflict vs deterministic replay vs monotonic progression", () => {
  const turnBase = {
    thread_id: "thread-dup",
    turn_id: "turn-dup",
    observations: [
      {
        observed_at: "2026-08-21T10:00:00.000Z",
        delta_tokens: 100,
        delta_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
        cumulative_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
      },
    ],
  };

  // Exact replay: deterministic, no conflict
  const replayRes = collapseCodexActivityTurns([turnBase, turnBase]);
  assert.equal(replayRes.threads.length, 1);
  assert.equal(replayRes.issues.length, 0);

  // Monotonic progression: second copy has forward observation
  const turnProgression = {
    thread_id: "thread-dup",
    turn_id: "turn-dup",
    observations: [
      turnBase.observations[0],
      {
        observed_at: "2026-08-22T10:00:00.000Z",
        delta_tokens: 100,
        delta_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
        cumulative_usage: { input_tokens: 140, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 60, reasoning_output_tokens: 0, total_tokens: 200 },
      },
    ],
  };
  const progRes = collapseCodexActivityTurns([turnBase, turnProgression]);
  assert.equal(progRes.threads.length, 1);
  assert.equal(progRes.threads[0].observations.length, 2);
  assert.equal(progRes.threads[0].total_tokens, 200);

  // Observation conflict: same timestamp but different token values
  const turnConflicted = {
    thread_id: "thread-dup",
    turn_id: "turn-dup",
    observations: [
      {
        observed_at: "2026-08-21T10:00:00.000Z",
        delta_tokens: 999, // mismatch!
        delta_usage: { input_tokens: 500, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 499, reasoning_output_tokens: 0, total_tokens: 999 },
        cumulative_usage: { input_tokens: 500, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 499, reasoning_output_tokens: 0, total_tokens: 999 },
      },
    ],
  };
  const conflictRes = collapseCodexActivityTurns([turnBase, turnConflicted]);
  assert.equal(conflictRes.threads.length, 0); // Excluded!
  assert.ok(conflictRes.issues.some((i) => i.code === "codex_activity_observation_conflict"));
});

test("atomic persistence and roundtrip load of activity projection", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "codex-activity-test-"));
  try {
    const sampleTurns = [
      {
        thread_id: "thread-1",
        turn_id: "turn-1",
        observations: [
          {
            observed_at: "2026-08-21T10:00:00.000Z",
            delta_tokens: 100,
            delta_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
            cumulative_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
          },
        ],
      },
    ];
    const projection = createCodexActivityProjection(sampleTurns);
    await persistCodexActivityProjection(tempDir, projection);

    const loaded = await loadCodexActivityProjection(tempDir);
    assert.deepEqual(loaded, projection);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("authoritative empty refresh replaces stale sidecar on disk", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "codex-activity-empty-refresh-"));
  try {
    // 1. Initial sidecar with populated turns
    const populatedTurns = [
      {
        thread_id: "thread-old",
        turn_id: "turn-old",
        observations: [
          {
            observed_at: "2026-08-21T10:00:00.000Z",
            delta_tokens: 500,
            delta_usage: { input_tokens: 350, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 150, reasoning_output_tokens: 0, total_tokens: 500 },
            cumulative_usage: { input_tokens: 350, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 150, reasoning_output_tokens: 0, total_tokens: 500 },
          },
        ],
      },
    ];
    const oldProj = createCodexActivityProjection(populatedTurns, { session_file_count: 1, parsed_session_count: 1 });
    await persistCodexActivityProjection(tempDir, oldProj);

    const loadedOld = await loadCodexActivityProjection(tempDir);
    assert.equal(loadedOld.totals.total_tokens, 500);

    // 2. Authoritative empty refresh (0 activity turns)
    const emptyProj = createCodexActivityProjection([], { session_file_count: 0, parsed_session_count: 0 });
    assert.equal(emptyProj.totals.total_tokens, 0);
    assert.equal(emptyProj.threads.length, 0);

    await persistCodexActivityProjection(tempDir, emptyProj);

    const loadedEmpty = await loadCodexActivityProjection(tempDir);
    assert.equal(loadedEmpty.totals.total_tokens, 0);
    assert.equal(loadedEmpty.threads.length, 0);
    assert.equal(loadedEmpty.reconciliation.total_tokens, 0);
    assert.equal(loadedEmpty.reconciliation.observation_count, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("loadCodexActivityProjection bounded read: refuses symlink, non-regular, and oversized files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "codex-activity-bounded-read-"));
  try {
    const targetDir = join(tempDir, "usage_activity");
    await mkdir(targetDir, { recursive: true });

    // Non-regular file (directory as target)
    const dirStateRoot = join(tempDir, "dir_state");
    await mkdir(join(dirStateRoot, "usage_activity", "current.json"), { recursive: true });
    await assert.rejects(
      loadCodexActivityProjection(dirStateRoot, { failClosed: true }),
      (err) => err.code === "codex_activity_projection_load_failed",
    );
    assert.equal(await loadCodexActivityProjection(dirStateRoot, { failClosed: false }), null);

    assert.equal(typeof MAX_CODEX_ACTIVITY_PROJECTION_BYTES, "number");
    assert.ok(MAX_CODEX_ACTIVITY_PROJECTION_BYTES >= 16 * 1024 * 1024);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("malformed usage inputs are excluded with codex_activity_partition_invalid and not zero-normalized", () => {
  const malformedTurns = [
    {
      thread_id: "thread-negative-token",
      turn_id: "turn-1",
      observations: [
        {
          observed_at: "2026-08-21T10:00:00.000Z",
          delta_tokens: -100, // negative!
          delta_usage: { input_tokens: -70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: -30, reasoning_output_tokens: 0, total_tokens: -100 },
          cumulative_usage: { input_tokens: -70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: -30, reasoning_output_tokens: 0, total_tokens: -100 },
        },
      ],
    },
    {
      thread_id: "thread-broken-partition",
      turn_id: "turn-2",
      observations: [
        {
          observed_at: "2026-08-21T10:00:00.000Z",
          delta_tokens: 100,
          delta_usage: { input_tokens: 100, cached_input_tokens: 150, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 100 },
          cumulative_usage: { input_tokens: 100, cached_input_tokens: 150, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 100 },
        },
      ],
    },
    {
      thread_id: "thread-missing-keys",
      turn_id: "turn-3",
      observations: [
        {
          observed_at: "2026-08-21T10:00:00.000Z",
          delta_tokens: 100,
          delta_usage: { total_tokens: 100 },
          cumulative_usage: { total_tokens: 100 },
        },
      ],
    },
  ];

  const res = collapseCodexActivityTurns(malformedTurns);
  assert.equal(res.threads.length, 0); // all excluded!
  const partitionIssues = res.issues.find((i) => i.code === "codex_activity_partition_invalid");
  assert.ok(partitionIssues);
  assert.equal(partitionIssues.count, 3);
});

test("validateCodexActivityProjection strictness: coverage counts, issue code uniqueness, token sums", () => {
  const sampleTurns = [
    {
      thread_id: "thread-1",
      turn_id: "turn-1",
      observations: [
        {
          observed_at: "2026-08-21T10:00:00.000Z",
          delta_tokens: 100,
          delta_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
          cumulative_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
        },
      ],
    },
  ];

  const valid = createCodexActivityProjection(sampleTurns, { session_file_count: 1, parsed_session_count: 1 });

  // 1. Coverage count mismatch
  const badCoverage = structuredClone(valid);
  badCoverage.coverage.turn_count = 999;
  assert.throws(() => validateCodexActivityProjection(badCoverage), { code: "codex_activity_coverage_count_mismatch" });

  // 2. Issue count mismatch
  const badIssueCount = structuredClone(valid);
  badIssueCount.coverage.issue_count = 999;
  assert.throws(() => validateCodexActivityProjection(badIssueCount), { code: "codex_activity_issue_count_mismatch" });

  // 3. Duplicate issue codes
  const dupIssue = structuredClone(valid);
  dupIssue.issues = [{ code: "test_issue", count: 1 }, { code: "test_issue", count: 2 }];
  dupIssue.coverage.issue_count = 3;
  assert.throws(() => validateCodexActivityProjection(dupIssue), { code: "codex_activity_issues_duplicate" });

  // 4. Thread observations delta sum mismatch vs thread total_tokens
  const badThreadTotal = structuredClone(valid);
  badThreadTotal.threads[0].observations[0].delta_tokens = 999;
  assert.throws(() => validateCodexActivityProjection(badThreadTotal), { code: "codex_activity_thread_total_mismatch" });

  // 5. Thread total sum mismatch vs root totals.total_tokens
  const badRootTotal = structuredClone(valid);
  badRootTotal.totals.total_tokens = 999;
  assert.throws(() => validateCodexActivityProjection(badRootTotal), { code: "codex_activity_reconciliation_total_mismatch" });
});

test("Large synthetic serialization check: 6,500 turns with ~20,000 observations easily fits within size limit", async () => {
  const turns = [];
  const turnCount = 6500;
  for (let i = 0; i < turnCount; i++) {
    const threadId = `thread-${String(Math.floor(i / 2)).padStart(5, "0")}`;
    const turnId = `turn-${String(i).padStart(5, "0")}`;
    const obsCount = (i % 3) + 1; // 1 to 3 observations
    const observations = [];
    let cumInput = 0;
    let cumOutput = 0;
    for (let o = 0; o < obsCount; o++) {
      const dInput = 50 + o * 10;
      const dOutput = 20 + o * 5;
      const dTotal = dInput + dOutput;
      cumInput += dInput;
      cumOutput += dOutput;
      observations.push({
        observed_at: `2026-08-${String(20 + o).padStart(2, "0")}T10:00:00.000Z`,
        delta_tokens: dTotal,
        delta_usage: {
          input_tokens: dInput,
          cached_input_tokens: 0,
          cache_write_input_tokens: 0,
          output_tokens: dOutput,
          reasoning_output_tokens: 0,
          total_tokens: dTotal,
        },
        cumulative_usage: {
          input_tokens: cumInput,
          cached_input_tokens: 0,
          cache_write_input_tokens: 0,
          output_tokens: cumOutput,
          reasoning_output_tokens: 0,
          total_tokens: cumInput + cumOutput,
        },
      });
    }
    turns.push({
      thread_id: threadId,
      turn_id: turnId,
      observations,
    });
  }

  const projection = createCodexActivityProjection(turns, {
    scope: "full_sessions_root",
    session_file_count: 3250,
    parsed_session_count: 3250,
  });

  const serialized = JSON.stringify(projection, null, 2);
  const byteLength = Buffer.byteLength(serialized, "utf8");

  // Measured bytes: compact 6,500 turns (~13,000 observations) is ~1.5 MB, well below 32 MB limit
  assert.ok(byteLength < 4 * 1024 * 1024, `Expected compact 6.5k projection < 4 MB, got ${(byteLength / (1024 * 1024)).toFixed(2)} MB (${byteLength} bytes)`);
  assert.equal(projection.threads.length, turnCount);

  // Roundtrip persistence test
  const tempDir = await mkdtemp(join(tmpdir(), "codex-activity-large-"));
  try {
    await persistCodexActivityProjection(tempDir, projection);
    const loaded = await loadCodexActivityProjection(tempDir);
    assert.equal(loaded.threads.length, turnCount);
    assert.equal(loaded.totals.total_tokens, projection.totals.total_tokens);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("static schema conformance of compact codex activity projection", async () => {
  const schemaPath = path.resolve("guild_hall/ai_usage_meter/ai_usage_codex_activity.v1.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateSchema = ajv.compile(schema);

  const sampleTurns = [
    {
      thread_id: "thread-1",
      turn_id: "turn-1",
      observations: [
        {
          observed_at: "2026-08-21T10:00:00.000Z",
          delta_tokens: 100,
          delta_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
          cumulative_usage: { input_tokens: 70, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 30, reasoning_output_tokens: 0, total_tokens: 100 },
        },
      ],
    },
  ];
  const projection = createCodexActivityProjection(sampleTurns);
  const valid = validateSchema(projection);
  assert.equal(valid, true, JSON.stringify(validateSchema.errors));
});
