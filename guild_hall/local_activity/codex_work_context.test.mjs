import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  CODEX_WORK_CONTEXT_BINDING_SCHEMA,
  executeCodexWorkContextOperation,
  normalizeCodexWorkContextBinding,
  readCodexWorkContextBinding,
} from "./codex_work_context.mjs";

const execFileAsync = promisify(execFile);
const BINDING_SHA = "1".repeat(64);

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-work-context-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binding = {
    schema_version: CODEX_WORK_CONTEXT_BINDING_SCHEMA,
    binding_id: "hpp_codex_work_context_test_v1",
    node_id: "hpp_test",
    node_role: "tool_pc",
    state_root: path.join(root, "state"),
    projects: [
      { project_code: "P26-014", enabled: true },
      { project_code: "P25-000", enabled: false },
    ],
  };
  return { root, binding };
}

function input(operation, overrides = {}) {
  const base = {
    operation,
    project_code: "P26-014",
    occurred_at: "2026-07-27T10:00:00.000Z",
    event_id: `${operation}:event-001`,
  };
  const payloads = {
    register_leader: {
      leader_thread_ref: "thread:kvds-leader",
      title: "KVDS 과제 팀장",
    },
    begin_work: {
      work_id: "LW-P26-014-TEST-001",
      leader_thread_ref: "thread:kvds-leader",
      executor_thread_ref: "thread:kvds-leader",
      title: "KVDS 자료 검토",
      request_summary: "KVDS 자료를 검토하고 결과를 남긴다.",
      source_refs: ["project-file:requirements.xlsx"],
    },
    attach_thread: {
      work_id: "LW-P26-014-TEST-001",
      thread_ref: "thread:kvds-worker-1",
      parent_thread_ref: "thread:kvds-leader",
      thread_role: "worker",
      title: "KVDS 요구사항 검토",
    },
    checkpoint: {
      work_id: "LW-P26-014-TEST-001",
      thread_ref: "thread:kvds-leader",
      summary: "요구사항 표를 검토했다.",
      decision_refs: ["decision:keep-interface-v2"],
      file_refs: ["file:requirements.xlsx"],
      run_refs: ["run:npm-test"],
    },
    finish_work: {
      work_id: "LW-P26-014-TEST-001",
      thread_ref: "thread:kvds-leader",
      result_summary: "요구사항 검토를 완료했다.",
      verification_summary: "관련 검증 3건 통과.",
      file_refs: ["file:requirements.xlsx"],
      run_refs: ["run:npm-test"],
      remaining_notes: null,
    },
    supersede_work: {
      work_id: "LW-P26-014-TEST-001",
      thread_ref: "thread:kvds-leader",
      reason: "검증 참조가 잘못되어 새 기록으로 대체한다.",
      replacement_work_id: "LW-P26-014-TEST-002",
    },
    status: {
      work_id: null,
    },
  };
  return {
    ...base,
    ...payloads[operation],
    ...overrides,
  };
}

async function execute(binding, operation, overrides = {}) {
  return executeCodexWorkContextOperation({
    binding,
    bindingSha256: BINDING_SHA,
    input: input(operation, overrides),
  });
}

test("binding is exact, private-root bound, and digest pinned", async (t) => {
  const fx = await fixture(t);
  assert.equal(
    normalizeCodexWorkContextBinding(fx.binding).projects.length,
    2,
  );
  assert.throws(
    () => normalizeCodexWorkContextBinding({
      ...fx.binding,
      projects: [
        ...fx.binding.projects,
        { project_code: "P26-014", enabled: true },
      ],
    }),
    /binding_project_duplicate/u,
  );
  const bindingPath = path.join(fx.root, "binding.json");
  const bytes = `${JSON.stringify(fx.binding, null, 2)}\n`;
  await writeFile(bindingPath, bytes, "utf8");
  const sha = createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    (await readCodexWorkContextBinding(bindingPath, sha)).binding_sha256,
    sha,
  );
  await assert.rejects(
    readCodexWorkContextBinding(bindingPath, "0".repeat(64)),
    /binding_digest_mismatch/u,
  );
});

test("team leader can execute a whole work unit directly", async (t) => {
  const fx = await fixture(t);
  await execute(fx.binding, "register_leader");
  const started = await execute(fx.binding, "begin_work");
  assert.equal(started.snapshot.status, "active");
  assert.equal(started.snapshot.attached_threads.length, 1);
  assert.equal(started.snapshot.attached_threads[0].thread_role, "leader_executor");
  assert.match(started.snapshot.started_at, /\+09:00$/u);
  await execute(fx.binding, "checkpoint");
  const finished = await execute(fx.binding, "finish_work");
  assert.equal(finished.snapshot.status, "completed");
  assert.equal(finished.snapshot.event_count, 3);
  assert.equal(finished.snapshot.boundaries.whole_chat_auto_collected, false);
  assert.equal(finished.snapshot.boundaries.bounded_fields_only, true);
  assert.equal(finished.snapshot.boundaries.official_task_mutated, false);

  const status = await execute(fx.binding, "status");
  assert.equal(status.active_count, 0);
  assert.equal(status.completed_count, 1);
  assert.equal(status.work_units[0].checkpoints.length, 1);
  const eventRoot = path.join(
    fx.binding.state_root,
    "projects",
    "P26-014",
    "codex_work_context",
    "work_units",
    "LW-P26-014-TEST-001",
    "events",
  );
  assert.equal((await readdir(eventRoot)).length, 3);
});

test("child and continuation threads stay attached to one work id", async (t) => {
  const fx = await fixture(t);
  await execute(fx.binding, "begin_work");
  await execute(fx.binding, "attach_thread");
  await execute(fx.binding, "checkpoint", {
    event_id: "checkpoint:event-worker",
    thread_ref: "thread:kvds-worker-1",
  });
  await execute(fx.binding, "attach_thread", {
    event_id: "attach_thread:event-continuation",
    thread_ref: "thread:kvds-worker-2",
    parent_thread_ref: "thread:kvds-worker-1",
    thread_role: "continuation",
    title: "KVDS 요구사항 검토 계속",
  });
  const finished = await execute(fx.binding, "finish_work", {
    event_id: "finish_work:event-continuation",
    thread_ref: "thread:kvds-worker-2",
  });
  assert.equal(finished.snapshot.attached_threads.length, 3);
  assert.equal(finished.snapshot.completion.thread_ref, "thread:kvds-worker-2");
});

test("unknown project, disabled project, and unattached thread are rejected", async (t) => {
  const fx = await fixture(t);
  await assert.rejects(
    execute(fx.binding, "begin_work", { project_code: "P99-999" }),
    /project_not_allowed/u,
  );
  await assert.rejects(
    execute(fx.binding, "begin_work", { project_code: "P25-000" }),
    /project_disabled/u,
  );
  await execute(fx.binding, "begin_work");
  await assert.rejects(
    execute(fx.binding, "checkpoint", {
      thread_ref: "thread:not-attached",
    }),
    /thread_not_attached/u,
  );
});

test("same event is idempotent and changed replay is held", async (t) => {
  const fx = await fixture(t);
  const first = await execute(fx.binding, "begin_work");
  assert.equal(first.write_status, "written");
  const replay = await execute(fx.binding, "begin_work");
  assert.equal(replay.write_status, "replayed");
  await assert.rejects(
    execute(fx.binding, "begin_work", {
      request_summary: "같은 event id에 다른 내용",
    }),
    /work_already_started/u,
  );
});

test("generated work id is deterministic for a pinned begin event", async (t) => {
  const fx = await fixture(t);
  const first = await execute(fx.binding, "begin_work", {
    event_id: "begin_work:event-generated-id",
    work_id: null,
  });
  const replay = await execute(fx.binding, "begin_work", {
    event_id: "begin_work:event-generated-id",
    work_id: null,
  });
  assert.equal(replay.write_status, "replayed");
  assert.equal(replay.work_id, first.work_id);
  const status = await execute(fx.binding, "status");
  assert.equal(status.work_units.length, 1);
});

test("CLI retry uses only a pinned event id and repairs current snapshot", async (t) => {
  const fx = await fixture(t);
  const bindingPath = path.join(fx.root, "binding.json");
  const bytes = `${JSON.stringify(fx.binding, null, 2)}\n`;
  await writeFile(bindingPath, bytes, "utf8");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const cli = path.resolve(
    "guild_hall",
    "local_activity",
    "codex_work_context_cli.mjs",
  );
  const args = [
    cli,
    "--binding",
    bindingPath,
    "--binding-sha256",
    sha,
    "--operation",
    "begin_work",
    "--project",
    "P26-014",
    "--event-id",
    "begin_work:cli-retry-event",
    "--payload-base64",
    Buffer.from(JSON.stringify({
      work_id: null,
      leader_thread_ref: "thread:kvds-leader",
      executor_thread_ref: "thread:kvds-leader",
      title: "CLI retry test",
      request_summary: "Retry the same event without a pinned clock.",
      source_refs: [],
    }), "utf8").toString("base64"),
  ];
  const first = JSON.parse((await execFileAsync(process.execPath, args, {
    cwd: process.cwd(),
    windowsHide: true,
  })).stdout);
  const currentPath = path.join(
    fx.binding.state_root,
    "projects",
    "P26-014",
    "codex_work_context",
    "work_units",
    first.work_id,
    "current.json",
  );
  await rm(currentPath);
  const replay = JSON.parse((await execFileAsync(process.execPath, args, {
    cwd: process.cwd(),
    windowsHide: true,
  })).stdout);
  assert.equal(replay.write_status, "replayed");
  assert.equal(replay.work_id, first.work_id);
  assert.equal(JSON.parse(await readFile(currentPath, "utf8")).event_count, 1);
});

test("leader registration is idempotent and conflicting replay is held", async (t) => {
  const fx = await fixture(t);
  const first = await execute(fx.binding, "register_leader");
  assert.equal(first.write_status, "written");
  const replay = await execute(fx.binding, "register_leader", {
    occurred_at: "2026-07-27T12:00:00.000Z",
  });
  assert.equal(replay.write_status, "replayed");
  assert.equal(replay.leader.registered_at, first.leader.registered_at);
  await assert.rejects(
    execute(fx.binding, "register_leader", {
      title: "같은 event id에 다른 팀장 제목",
    }),
    /immutable_packet_conflict/u,
  );
});

test("events after completion and unknown work are rejected", async (t) => {
  const fx = await fixture(t);
  await assert.rejects(
    execute(fx.binding, "checkpoint"),
    /work_not_found/u,
  );
  await execute(fx.binding, "begin_work");
  await execute(fx.binding, "finish_work");
  await assert.rejects(
    execute(fx.binding, "checkpoint", {
      event_id: "checkpoint:event-after-finish",
    }),
    /work_event_after_finish/u,
  );
});

test("completed work is corrected by immutable supersession", async (t) => {
  const fx = await fixture(t);
  await execute(fx.binding, "begin_work");
  await execute(fx.binding, "finish_work");
  await execute(fx.binding, "begin_work", {
    event_id: "begin_work:event-replacement",
    work_id: "LW-P26-014-TEST-002",
  });
  await execute(fx.binding, "finish_work", {
    event_id: "finish_work:event-replacement",
    work_id: "LW-P26-014-TEST-002",
  });
  const superseded = await execute(fx.binding, "supersede_work");
  assert.equal(superseded.snapshot.status, "superseded");
  assert.equal(
    superseded.snapshot.supersession.replacement_work_id,
    "LW-P26-014-TEST-002",
  );
  const status = await execute(fx.binding, "status");
  assert.equal(status.active_count, 0);
  assert.equal(status.completed_count, 1);
  assert.equal(status.superseded_count, 1);
  await assert.rejects(
    execute(fx.binding, "supersede_work", {
      event_id: "supersede_work:event-second",
    }),
    /work_event_after_supersession/u,
  );
});

test("supersession rejects self, missing, and already superseded replacement", async (t) => {
  const fx = await fixture(t);
  await execute(fx.binding, "begin_work");
  await execute(fx.binding, "finish_work");
  await assert.rejects(
    execute(fx.binding, "supersede_work", {
      replacement_work_id: "LW-P26-014-TEST-001",
    }),
    /replacement_work_self_reference/u,
  );
  await assert.rejects(
    execute(fx.binding, "supersede_work", {
      replacement_work_id: "LW-P26-014-NOT-FOUND",
    }),
    /replacement_work_not_found/u,
  );

  await execute(fx.binding, "begin_work", {
    event_id: "begin_work:event-replacement-a",
    work_id: "LW-P26-014-TEST-002",
  });
  await execute(fx.binding, "finish_work", {
    event_id: "finish_work:event-replacement-a",
    work_id: "LW-P26-014-TEST-002",
  });
  await execute(fx.binding, "begin_work", {
    event_id: "begin_work:event-replacement-b",
    work_id: "LW-P26-014-TEST-003",
  });
  await execute(fx.binding, "finish_work", {
    event_id: "finish_work:event-replacement-b",
    work_id: "LW-P26-014-TEST-003",
  });
  await execute(fx.binding, "supersede_work", {
    event_id: "supersede_work:event-replacement-a",
    work_id: "LW-P26-014-TEST-002",
    replacement_work_id: "LW-P26-014-TEST-003",
  });
  await assert.rejects(
    execute(fx.binding, "supersede_work", {
      event_id: "supersede_work:event-original",
      replacement_work_id: "LW-P26-014-TEST-002",
    }),
    /replacement_work_not_current/u,
  );
});

test("event time cannot move backwards within one work id", async (t) => {
  const fx = await fixture(t);
  await execute(fx.binding, "begin_work", {
    occurred_at: "2026-07-27T12:00:00+09:00",
  });
  await assert.rejects(
    execute(fx.binding, "checkpoint", {
      occurred_at: "2026-07-27T11:59:59+09:00",
    }),
    /work_event_time_regression/u,
  );
});

test("one project may keep multiple independent active work ids", async (t) => {
  const fx = await fixture(t);
  await execute(fx.binding, "begin_work");
  await execute(fx.binding, "begin_work", {
    event_id: "begin_work:event-second-work",
    work_id: "LW-P26-014-TEST-002",
    title: "두 번째 독립 업무",
  });
  const status = await execute(fx.binding, "status");
  assert.equal(status.active_count, 2);
  assert.deepEqual(
    new Set(status.work_units.map((item) => item.work_id)),
    new Set(["LW-P26-014-TEST-001", "LW-P26-014-TEST-002"]),
  );
});

test("an attached verifier may checkpoint and close the same work id", async (t) => {
  const fx = await fixture(t);
  await execute(fx.binding, "begin_work");
  await execute(fx.binding, "attach_thread", {
    event_id: "attach_thread:event-verifier",
    thread_ref: "thread:kvds-verifier",
    parent_thread_ref: "thread:kvds-leader",
    thread_role: "verifier",
    title: "KVDS 독립 검증",
  });
  await execute(fx.binding, "checkpoint", {
    event_id: "checkpoint:event-verifier",
    thread_ref: "thread:kvds-verifier",
    summary: "독립 검증 결과를 남겼다.",
  });
  const finished = await execute(fx.binding, "finish_work", {
    event_id: "finish_work:event-verifier",
    thread_ref: "thread:kvds-verifier",
  });
  assert.equal(finished.snapshot.status, "completed");
  assert.equal(finished.snapshot.completion.thread_ref, "thread:kvds-verifier");
  assert.equal(
    finished.snapshot.attached_threads.some(
      (item) => item.thread_role === "verifier",
    ),
    true,
  );
});

test("CLI writes a private event and reads status without mutation", async (t) => {
  const fx = await fixture(t);
  const bindingPath = path.join(fx.root, "binding.json");
  const bytes = `${JSON.stringify(fx.binding, null, 2)}\n`;
  await writeFile(bindingPath, bytes, "utf8");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const cli = path.resolve(
    "guild_hall",
    "local_activity",
    "codex_work_context_cli.mjs",
  );
  const beginPayload = JSON.stringify({
    work_id: "LW-P26-014-CLI-001",
    leader_thread_ref: "thread:kvds-leader",
    executor_thread_ref: "thread:kvds-leader",
    title: "CLI 시험",
    request_summary: "CLI로 업무를 시작한다.",
    source_refs: [],
  });
  const begin = await execFileAsync(process.execPath, [
    cli,
    "--binding",
    bindingPath,
    "--binding-sha256",
    sha,
    "--operation",
    "begin_work",
    "--project",
    "P26-014",
    "--payload-json",
    beginPayload,
    "--occurred-at",
    "2026-07-27T12:00:00+09:00",
  ], { cwd: process.cwd(), windowsHide: true });
  assert.equal(JSON.parse(begin.stdout).snapshot.status, "active");

  const status = await execFileAsync(process.execPath, [
    cli,
    "--binding",
    bindingPath,
    "--binding-sha256",
    sha,
    "--operation",
    "status",
    "--project",
    "P26-014",
  ], { cwd: process.cwd(), windowsHide: true });
  assert.equal(JSON.parse(status.stdout).active_count, 1);
  await assert.rejects(readFile(
    path.join(fx.binding.state_root, "codex_work_context.lock"),
  ));
});

test("CLI blocks a live writer and recovers a dead writer lock", async (t) => {
  const fx = await fixture(t);
  const bindingPath = path.join(fx.root, "binding.json");
  const bytes = `${JSON.stringify(fx.binding, null, 2)}\n`;
  await writeFile(bindingPath, bytes, "utf8");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const cli = path.resolve(
    "guild_hall",
    "local_activity",
    "codex_work_context_cli.mjs",
  );
  const lockPath = path.join(fx.binding.state_root, "codex_work_context.lock");
  await mkdir(fx.binding.state_root, { recursive: true });
  await writeFile(lockPath, `${JSON.stringify({
    pid: process.pid,
    started_at: new Date().toISOString(),
    owner_token: "live-parent-process",
  })}\n`, "utf8");
  const commonArgs = [
    cli,
    "--binding",
    bindingPath,
    "--binding-sha256",
    sha,
    "--operation",
    "register_leader",
    "--project",
    "P26-014",
    "--payload-base64",
    Buffer.from(JSON.stringify({
      leader_thread_ref: "thread:kvds-leader",
      title: "KVDS 과제 팀장",
    }), "utf8").toString("base64"),
  ];
  await assert.rejects(
    execFileAsync(process.execPath, commonArgs, {
      cwd: process.cwd(),
      windowsHide: true,
    }),
    /hpp_codex_work_context_rejected:codex_work_context_busy/u,
  );

  await writeFile(lockPath, `${JSON.stringify({
    pid: 999999999,
    started_at: new Date().toISOString(),
    owner_token: "dead-writer",
  })}\n`, "utf8");
  const recovered = await execFileAsync(process.execPath, commonArgs, {
    cwd: process.cwd(),
    windowsHide: true,
  });
  assert.equal(JSON.parse(recovered.stdout).write_status, "written");
  await assert.rejects(readFile(lockPath));
  assert.equal(
    (await readdir(fx.binding.state_root))
      .filter((name) => name.startsWith("codex_work_context.lock.stale-"))
      .length,
    0,
  );

  await writeFile(lockPath, `${JSON.stringify({
    pid: process.pid,
    started_at: "2020-01-01T00:00:00.000Z",
    owner_token: "reused-or-stale-live-pid",
  })}\n`, "utf8");
  const staleLiveRecovered = await execFileAsync(process.execPath, [
    ...commonArgs,
    "--event-id",
    "register_leader:stale-live-recovery",
  ], {
    cwd: process.cwd(),
    windowsHide: true,
  });
  assert.equal(JSON.parse(staleLiveRecovered.stdout).write_status, "written");
  await assert.rejects(readFile(lockPath));
});

test("CLI payload cannot override operation or project and bypass the lock", async (t) => {
  const fx = await fixture(t);
  const bindingPath = path.join(fx.root, "binding.json");
  const bytes = `${JSON.stringify(fx.binding, null, 2)}\n`;
  await writeFile(bindingPath, bytes, "utf8");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const cli = path.resolve(
    "guild_hall",
    "local_activity",
    "codex_work_context_cli.mjs",
  );
  const malicious = Buffer.from(JSON.stringify({
    operation: "begin_work",
    project_code: "P99-999",
    work_id: "LW-P99-999-BYPASS",
    leader_thread_ref: "thread:attacker",
    executor_thread_ref: "thread:attacker",
    title: "bypass",
    request_summary: "must not write",
    source_refs: [],
  }), "utf8").toString("base64");
  await assert.rejects(
    execFileAsync(process.execPath, [
      cli,
      "--binding",
      bindingPath,
      "--binding-sha256",
      sha,
      "--operation",
      "status",
      "--project",
      "P26-014",
      "--payload-base64",
      malicious,
    ], { cwd: process.cwd(), windowsHide: true }),
    /hpp_codex_work_context_rejected:payload_reserved_key/u,
  );
  await assert.rejects(readdir(path.join(
    fx.binding.state_root,
    "projects",
    "P99-999",
  )));
});
