import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskPacket, selectTask } from "./claim_task.mjs";
import { autoApproveCandidates, formatCandidateQueueText, listCandidatePackets, promoteApprovedCandidates } from "./candidate_queue.mjs";
import { DEFAULT_DOCTOR_COMMAND } from "./preflight_repo_sync.mjs";

test("preflight default doctor stays lane-local and public-safe", () => {
  assert.equal(DEFAULT_DOCTOR_COMMAND, "npm run guild-hall:doctor -- --profile public-only --remote");
});

test("normalizeTaskPacket accepts a minimal ready packet", () => {
  const task = normalizeTaskPacket(
    {
      schema_version: "soulforge.dev_worker_request.v0",
      task_id: "sample task",
      status: "ready",
      summary: "Do a bounded thing.",
      allowed_write_paths: ["guild_hall/example/**"],
      acceptance_checks: ["npm run validate:canon"],
    },
    {
      source_kind: "mission",
      source_order: 10,
      packet_path: "packet.yaml",
      packet_ref: ".mission/sample/dev_worker_request.yaml",
    },
  );

  assert.equal(task.eligible, true);
  assert.equal(task.task_id, "sample-task");
  assert.equal(task.project_code, "shared");
  assert.deepEqual(task.acceptance_checks, ["npm run validate:canon"]);
});

test("normalizeTaskPacket rejects packets without checks or write paths", () => {
  const task = normalizeTaskPacket(
    {
      schema_version: "soulforge.dev_worker_request.v0",
      task_id: "missing-checks",
      status: "ready",
      summary: "Missing fields.",
    },
    {
      source_kind: "mission",
      source_order: 10,
      packet_path: "packet.yaml",
      packet_ref: ".mission/sample/dev_worker_request.yaml",
    },
  );

  assert.equal(task.eligible, false);
  assert.match(task.ineligible_reason, /missing_required_fields/u);
});

test("normalizeTaskPacket requires approval for agent-generated ready packets", () => {
  const task = normalizeTaskPacket(
    {
      schema_version: "soulforge.dev_worker_request.v0",
      task_id: "agent-ready",
      status: "ready",
      summary: "Agent generated task without owner approval.",
      allowed_write_paths: ["guild_hall/example/**"],
      acceptance_checks: ["npm run validate:canon"],
      origin: {
        kind: "agent_generated",
      },
      owner_approval: {
        required: true,
        approved: false,
      },
    },
    {
      source_kind: "workmeta",
      source_order: 20,
      packet_path: "packet.yaml",
      packet_ref: "_workmeta/system/dev_worker_queue/agent-ready.yaml",
    },
  );

  assert.equal(task.eligible, false);
  assert.equal(task.ineligible_reason, "owner_approval_required");
});

test("normalizeTaskPacket accepts approved agent-generated ready packets", () => {
  const task = normalizeTaskPacket(
    {
      schema_version: "soulforge.dev_worker_request.v0",
      task_id: "agent-ready-approved",
      status: "ready",
      summary: "Agent generated task with owner approval.",
      allowed_write_paths: ["guild_hall/example/**"],
      acceptance_checks: ["npm run validate:canon"],
      origin: {
        kind: "agent_generated",
      },
      owner_approval: {
        required: true,
        approved: true,
      },
    },
    {
      source_kind: "workmeta",
      source_order: 20,
      packet_path: "packet.yaml",
      packet_ref: "_workmeta/system/dev_worker_queue/agent-ready-approved.yaml",
    },
  );

  assert.equal(task.eligible, true);
});

test("selectTask picks the first eligible mission packet and suggests a branch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-"));
  try {
    await mkdir(path.join(root, ".mission", "blocked"), { recursive: true });
    await mkdir(path.join(root, ".mission", "ready"), { recursive: true });
    await writeFile(
      path.join(root, ".mission", "blocked", "dev_worker_request.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: blocked_task",
        "status: blocked",
        "summary: This should not be selected.",
        "allowed_write_paths:",
        "  - guild_hall/blocked/**",
        "acceptance_checks:",
        "  - npm run validate:canon",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(root, ".mission", "ready", "dev_worker_request.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: ready_task",
        "status: ready",
        "project_code: soulforge_public",
        "summary: This should be selected.",
        "branch_slug: ready-task-branch",
        "allowed_write_paths:",
        "  - guild_hall/dev_worker/**",
        "acceptance_checks:",
        "  - npm run validate:dev-worker",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await selectTask({
      localRoot: root,
      workmetaRoot: path.join(root, "_workmeta"),
      identity: { node_id: "high perf tool 01" },
    });

    assert.equal(result.scanned_count, 2);
    assert.equal(result.eligible_count, 1);
    assert.equal(result.selected.task_id, "ready_task");
    assert.equal(result.selected.suggested_branch, "codex/high-perf-tool-01-ready-task-branch");
    assert.equal(result.skipped.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate queue promotes only approved candidates into ready queue", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-candidate-"));
  const workmetaRoot = path.join(root, "_workmeta");
  try {
    await mkdir(path.join(workmetaRoot, "system", "dev_worker_candidate_queue"), { recursive: true });
    await writeFile(
      path.join(workmetaRoot, "system", "dev_worker_candidate_queue", "draft.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: draft_task",
        "status: proposed",
        "summary: This should stay candidate-only.",
        "allowed_write_paths:",
        "  - docs/example/**",
        "acceptance_checks:",
        "  - npm run validate:canon",
        "origin:",
        "  kind: agent_generated",
        "owner_approval:",
        "  required: true",
        "  approved: false",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(workmetaRoot, "system", "dev_worker_candidate_queue", "approved.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: approved task",
        "status: approved",
        "project_code: system",
        "summary: Promote this approved candidate.",
        "branch_slug: approved-task",
        "allowed_write_paths:",
        "  - guild_hall/dev_worker/**",
        "acceptance_checks:",
        "  - npm run validate:dev-worker",
        "origin:",
        "  kind: agent_generated",
        "owner_approval:",
        "  required: true",
        "  approved: true",
        "  approved_by: owner",
        "  approved_at: 2026-05-17T00:00:00.000Z",
        "",
      ].join("\n"),
      "utf8",
    );

    const listed = await listCandidatePackets({ localRoot: root, workmetaRoot });
    assert.equal(listed.scanned_count, 2);
    assert.equal(listed.promotable_count, 1);
    assert.equal(listed.active_candidate_count, 2);
    assert.equal(listed.closed_candidate_count, 0);
    assert.deepEqual(listed.status_counts, {
      approved: 1,
      proposed: 1,
    });

    const textSummary = formatCandidateQueueText(listed, { details: true });
    assert.match(textSummary, /active-candidates: 2/u);
    assert.match(textSummary, /closed-candidates: 0/u);
    assert.match(textSummary, /status:\n- approved: 1\n- proposed: 1/u);
    assert.match(textSummary, /draft_task \[proposed\]/u);
    assert.match(textSummary, /promotable: no \(status_not_approved:proposed\)/u);
    assert.match(textSummary, /approved-task \[approved\]/u);
    assert.match(textSummary, /promotable: yes/u);

    const promoted = await promoteApprovedCandidates({ localRoot: root, workmetaRoot });
    assert.equal(promoted.promoted_count, 1);
    assert.equal(promoted.promoted[0].to, "_workmeta/system/dev_worker_queue/approved-task.yaml");

    const readyPacket = await readFile(path.join(workmetaRoot, "system", "dev_worker_queue", "approved-task.yaml"), "utf8");
    assert.match(readyPacket, /status: ready/u);
    assert.match(readyPacket, /approved: true/u);

    const selected = await selectTask({
      localRoot: root,
      workmetaRoot,
      identity: { node_id: "high perf tool 01" },
    });
    assert.equal(selected.eligible_count, 1);
    assert.equal(selected.selected.suggested_branch, "codex/high-perf-tool-01-approved-task");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate queue summary separates closed candidates from active candidates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-closed-candidate-"));
  const workmetaRoot = path.join(root, "_workmeta");
  try {
    await mkdir(path.join(workmetaRoot, "system", "dev_worker_candidate_queue"), { recursive: true });
    await writeFile(
      path.join(workmetaRoot, "system", "dev_worker_candidate_queue", "completed.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: completed_task",
        "status: completed",
        "project_code: system",
        "summary: Already completed candidate.",
        "allowed_write_paths:",
        "  - guild_hall/dev_worker/**",
        "acceptance_checks:",
        "  - npm run validate:dev-worker",
        "owner_approval:",
        "  required: true",
        "  approved: false",
        "",
      ].join("\n"),
      "utf8",
    );

    const listed = await listCandidatePackets({ localRoot: root, workmetaRoot });
    assert.equal(listed.active_candidate_count, 0);
    assert.equal(listed.closed_candidate_count, 1);
    assert.deepEqual(listed.status_counts, { completed: 1 });

    const textSummary = formatCandidateQueueText(listed, { details: true });
    assert.match(textSummary, /closed-candidates: 1/u);
    assert.match(textSummary, /promotable: no \(status_closed:completed\)/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate queue auto-approves low-risk safe candidates only", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-auto-approval-"));
  const workmetaRoot = path.join(root, "_workmeta");
  try {
    await mkdir(path.join(workmetaRoot, "system", "dev_worker_candidate_queue"), { recursive: true });
    await writeFile(
      path.join(workmetaRoot, "system", "dev_worker_candidate_queue", "safe.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: safe_auto_task",
        "status: proposed",
        "project_code: system",
        "summary: Update a low-risk dev worker doc and test.",
        "branch_slug: safe-auto-task",
        "risk_level: low",
        "allowed_write_paths:",
        "  - guild_hall/dev_worker/**",
        "acceptance_checks:",
        "  - npm run validate:dev-worker",
        "origin:",
        "  kind: agent_generated",
        "owner_approval:",
        "  required: true",
        "  approved: false",
        "auto_approval:",
        "  requested: true",
        "  risk_level: low",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(workmetaRoot, "system", "dev_worker_candidate_queue", "unsafe.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: unsafe_auto_task",
        "status: proposed",
        "project_code: system",
        "summary: Try to alter foundation canon without owner review.",
        "branch_slug: unsafe-auto-task",
        "risk_level: low",
        "allowed_write_paths:",
        "  - docs/architecture/foundation/**",
        "acceptance_checks:",
        "  - npm run validate",
        "origin:",
        "  kind: agent_generated",
        "owner_approval:",
        "  required: true",
        "  approved: false",
        "auto_approval:",
        "  requested: true",
        "  risk_level: low",
        "",
      ].join("\n"),
      "utf8",
    );

    const listed = await listCandidatePackets({ localRoot: root, workmetaRoot });
    assert.equal(listed.auto_approvable_count, 1);

    const approved = await autoApproveCandidates({ localRoot: root, workmetaRoot });
    assert.equal(approved.auto_approved_count, 1);
    assert.equal(approved.auto_approved[0].task_id, "safe_auto_task");
    assert.equal(approved.skipped.some((item) => item.reason === "write_path_not_allowed:docs/architecture/foundation/**"), true);

    const promoted = await promoteApprovedCandidates({ localRoot: root, workmetaRoot });
    assert.equal(promoted.promoted_count, 1);
    assert.equal(promoted.promoted[0].to, "_workmeta/system/dev_worker_queue/safe_auto_task.yaml");

    const readyPacket = await readFile(path.join(workmetaRoot, "system", "dev_worker_queue", "safe_auto_task.yaml"), "utf8");
    assert.match(readyPacket, /approved_by: auto_policy:dev_worker_auto_approval_policy_v0/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
