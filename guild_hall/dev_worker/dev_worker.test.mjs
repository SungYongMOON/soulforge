import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { normalizeTaskPacket, selectTask } from "./claim_task.mjs";
import { autoApproveCandidates, formatCandidateQueueText, listCandidatePackets, promoteApprovedCandidates } from "./candidate_queue.mjs";
import { DEFAULT_DOCTOR_COMMAND } from "./preflight_repo_sync.mjs";

const execFileAsync = promisify(execFile);
const CLAIM_TASK_CLI = fileURLToPath(new URL("./claim_task.mjs", import.meta.url));
const CANDIDATE_QUEUE_CLI = fileURLToPath(new URL("./candidate_queue.mjs", import.meta.url));
const RENDER_AUTOMATION_CLI = fileURLToPath(new URL("./render_local_automation.mjs", import.meta.url));

async function pathIsPresent(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function execRenderAutomation(args, options = {}) {
  try {
    const result = await execFileAsync(process.execPath, [RENDER_AUTOMATION_CLI, ...args], {
      cwd: options.cwd,
    });
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

function localAutomationArgs(root, workmetaRoot, privateStateRoot) {
  return [
    "--local-root",
    root,
    "--workmeta-root",
    workmetaRoot,
    "--private-state-root",
    privateStateRoot,
  ];
}

test("preflight default doctor stays lane-local and public-safe", () => {
  assert.equal(DEFAULT_DOCTOR_COMMAND, "npm run guild-hall:doctor -- --profile public-only --remote");
});

test("dev_worker_stale_automation_handoff_guard_v0 freshly rendered TOML is current", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-automation-current-"));
  const workmetaRoot = path.join(root, "_workmeta");
  const privateStateRoot = path.join(root, "private-state");
  const automationFile = path.join(root, "synthetic", "automation.toml");
  try {
    await mkdir(path.dirname(automationFile), { recursive: true });
    const render = await execRenderAutomation(localAutomationArgs(root, workmetaRoot, privateStateRoot), { cwd: root });
    assert.equal(render.code, 0);
    assert.equal(render.stderr, "");
    await writeFile(automationFile, render.stdout, "utf8");

    const check = await execRenderAutomation(
      [
        "--check",
        "--automation-file",
        automationFile,
        "--json",
        ...localAutomationArgs(root, workmetaRoot, privateStateRoot),
      ],
      { cwd: root },
    );

    assert.equal(check.code, 0);
    assert.equal(check.stderr, "");
    const payload = JSON.parse(check.stdout);
    assert.equal(payload.status, "current");
    assert.deepEqual(payload.mismatches, []);
    assert.deepEqual(payload.checked, ["id", "prompt", "cwds", "execution_environment"]);
    assert.equal(check.stdout.includes(root), false);
    assert.equal(check.stdout.includes(automationFile), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dev_worker_stale_automation_handoff_guard_v0 mutated prompt is stale without leaking prompt or root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-automation-stale-"));
  const workmetaRoot = path.join(root, "_workmeta");
  const privateStateRoot = path.join(root, "private-state");
  const automationFile = path.join(root, "synthetic", "automation.toml");
  const mutatedPrompt = "mutated stale handoff prompt with local root";
  try {
    await mkdir(path.dirname(automationFile), { recursive: true });
    const render = await execRenderAutomation(localAutomationArgs(root, workmetaRoot, privateStateRoot), { cwd: root });
    assert.equal(render.code, 0);
    assert.equal(render.stderr, "");
    await writeFile(
      automationFile,
      render.stdout.replace(/^prompt = .+$/mu, `prompt = ${JSON.stringify(mutatedPrompt)}`),
      "utf8",
    );

    const check = await execRenderAutomation(
      [
        "--check",
        "--automation-file",
        automationFile,
        "--json",
        ...localAutomationArgs(root, workmetaRoot, privateStateRoot),
      ],
      { cwd: root },
    );

    assert.equal(check.code, 1);
    assert.equal(check.stderr, "");
    const payload = JSON.parse(check.stdout);
    assert.equal(payload.status, "stale");
    assert.deepEqual(payload.mismatches, ["prompt"]);
    assert.match(payload.prompt_sha256.expected, /^[0-9a-f]{16}$/u);
    assert.match(payload.prompt_sha256.actual, /^[0-9a-f]{16}$/u);
    assert.equal(check.stdout.includes(mutatedPrompt), false);
    assert.equal(check.stdout.includes(root), false);
    assert.equal(check.stdout.includes(automationFile), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dev_worker_stale_automation_handoff_guard_v0 status and rrule changes stay current", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-automation-owner-local-"));
  const workmetaRoot = path.join(root, "_workmeta");
  const privateStateRoot = path.join(root, "private-state");
  const automationFile = path.join(root, "synthetic", "automation.toml");
  try {
    await mkdir(path.dirname(automationFile), { recursive: true });
    const render = await execRenderAutomation(localAutomationArgs(root, workmetaRoot, privateStateRoot), { cwd: root });
    assert.equal(render.code, 0);
    assert.equal(render.stderr, "");
    await writeFile(
      automationFile,
      render.stdout
        .replace(/^status = .+$/mu, `status = ${JSON.stringify("ACTIVE")}`)
        .replace(/^rrule = .+$/mu, `rrule = ${JSON.stringify("FREQ=DAILY;INTERVAL=1")}`),
      "utf8",
    );

    const check = await execRenderAutomation(
      [
        "--check",
        "--automation-file",
        automationFile,
        "--json",
        ...localAutomationArgs(root, workmetaRoot, privateStateRoot),
      ],
      { cwd: root },
    );

    assert.equal(check.code, 0);
    assert.equal(check.stderr, "");
    const payload = JSON.parse(check.stdout);
    assert.equal(payload.status, "current");
    assert.deepEqual(payload.mismatches, []);
    assert.equal(check.stdout.includes(root), false);
    assert.equal(check.stdout.includes(automationFile), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test("selectTask returns no task when all packets are ineligible", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-no-task-"));
  const workmetaRoot = path.join(root, "_workmeta");
  try {
    await mkdir(path.join(root, ".mission", "blocked"), { recursive: true });
    await mkdir(path.join(workmetaRoot, "system", "dev_worker_queue"), { recursive: true });
    await writeFile(
      path.join(root, ".mission", "blocked", "dev_worker_request.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: blocked_task",
        "status: blocked",
        "summary: This should be skipped as blocked.",
        "allowed_write_paths:",
        "  - guild_hall/blocked/**",
        "acceptance_checks:",
        "  - npm run validate:canon",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(workmetaRoot, "system", "dev_worker_queue", "agent-ready.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: agent_ready_without_approval",
        "status: ready",
        "summary: Agent generated task without owner approval.",
        "allowed_write_paths:",
        "  - guild_hall/dev_worker/**",
        "acceptance_checks:",
        "  - npm run validate:dev-worker",
        "origin:",
        "  kind: agent_generated",
        "owner_approval:",
        "  required: true",
        "  approved: false",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await selectTask({
      localRoot: root,
      workmetaRoot,
      identity: { node_id: "high perf tool 01" },
    });

    assert.equal(result.scanned_count, 2);
    assert.equal(result.eligible_count, 0);
    assert.equal(result.selected, null);
    assert.deepEqual(result.skipped.map((item) => item.reason).sort(), [
      "owner_approval_required",
      "status_not_eligible:blocked",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dev_worker_cli_readonly_audit_smoke_v0 claim_task --json reports no_task without recording", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-cli-no-task-"));
  const workmetaRoot = path.join(root, "_workmeta");
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        CLAIM_TASK_CLI,
        "--json",
        "--local-root",
        root,
        "--workmeta-root",
        workmetaRoot,
      ],
      { cwd: root },
    );

    assert.equal(stderr, "");
    const payload = JSON.parse(stdout);
    assert.equal(payload.status, "no_task");
    assert.equal(payload.selected, null);
    assert.equal(payload.eligible_count, 0);
    assert.equal(payload.scanned_count, 0);
    assert.deepEqual(payload.skipped, []);
    assert.equal(await pathIsPresent(workmetaRoot), false);
    assert.equal(await pathIsPresent(path.join(root, "guild_hall", "state")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dev_worker_cli_readonly_audit_smoke_v0 candidate_queue --details shows owner-approved proposed candidates as promotable without writing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-cli-candidate-"));
  const workmetaRoot = path.join(root, "_workmeta");
  const candidatePath = path.join(
    workmetaRoot,
    "system",
    "dev_worker_candidate_queue",
    "approval-only-cli-smoke.yaml",
  );
  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(
      candidatePath,
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: approval_only_cli_smoke",
        "status: proposed",
        "project_code: system",
        "summary: Owner approval is present, so the next automation trigger may promote it.",
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

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        CANDIDATE_QUEUE_CLI,
        "--details",
        "--local-root",
        root,
        "--workmeta-root",
        workmetaRoot,
      ],
      { cwd: root },
    );

    assert.equal(stderr, "");
    assert.match(stdout, /^candidates: 1$/mu);
    assert.match(stdout, /^promotable: 1$/mu);
    assert.match(stdout, /^auto-approvable: 0$/mu);
    assert.match(stdout, /^- approval_only_cli_smoke \[proposed\]/mu);
    assert.match(stdout, /^  promotable: yes$/mu);
    assert.match(stdout, /^  owner-approval: approved \(promotable\)$/mu);
    assert.match(stdout, /^  auto-approval: no \(auto_approval_not_requested\)$/mu);
    assert.equal(await pathIsPresent(path.join(workmetaRoot, "system", "dev_worker_queue")), false);
    assert.equal(await pathIsPresent(path.join(root, "guild_hall", "state")), false);

    const candidatePacket = await readFile(candidatePath, "utf8");
    assert.match(candidatePacket, /^status: proposed$/mu);
    assert.doesNotMatch(candidatePacket, /^promoted_to:/mu);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate queue promotes owner-approved active candidates into ready queue", async () => {
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
      path.join(workmetaRoot, "system", "dev_worker_candidate_queue", "approval-only.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: approval_only_task",
        "status: proposed",
        "summary: Owner approved this candidate, so it should promote on the next automation trigger.",
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
    assert.equal(listed.scanned_count, 3);
    assert.equal(listed.promotable_count, 2);
    assert.equal(listed.active_candidate_count, 3);
    assert.equal(listed.closed_candidate_count, 0);
    assert.deepEqual(listed.status_counts, {
      approved: 1,
      proposed: 2,
    });

    const textSummary = formatCandidateQueueText(listed, { details: true });
    assert.match(textSummary, /active-candidates: 3/u);
    assert.match(textSummary, /closed-candidates: 0/u);
    assert.match(textSummary, /status:\n- approved: 1\n- proposed: 2/u);
    assert.match(textSummary, /draft_task \[proposed\]/u);
    assert.match(textSummary, /promotable: no \(owner_approval_not_approved\)/u);
    assert.match(textSummary, /owner-approval: not-approved \(required; not promotable\)/u);
    assert.match(textSummary, /approval_only_task \[proposed\]/u);
    assert.match(textSummary, /owner-approval: approved \(promotable\)/u);
    assert.match(textSummary, /approved-task \[approved\]/u);
    assert.match(textSummary, /promotable: yes/u);
    assert.match(textSummary, /owner-approval: approved \(promotable\)/u);

    const promoted = await promoteApprovedCandidates({ localRoot: root, workmetaRoot });
    assert.equal(promoted.promoted_count, 2);
    assert.deepEqual(promoted.promoted.map((item) => item.to).sort(), [
      "_workmeta/system/dev_worker_queue/approval_only_task.yaml",
      "_workmeta/system/dev_worker_queue/approved-task.yaml",
    ]);

    const readyPacket = await readFile(path.join(workmetaRoot, "system", "dev_worker_queue", "approved-task.yaml"), "utf8");
    assert.match(readyPacket, /status: ready/u);
    assert.match(readyPacket, /approved: true/u);
    const proposedReadyPacket = await readFile(
      path.join(workmetaRoot, "system", "dev_worker_queue", "approval_only_task.yaml"),
      "utf8",
    );
    assert.match(proposedReadyPacket, /status: ready/u);
    assert.match(proposedReadyPacket, /approved: true/u);

    const selected = await selectTask({
      localRoot: root,
      workmetaRoot,
      identity: { node_id: "high perf tool 01" },
    });
    assert.equal(selected.eligible_count, 2);
    assert.equal(selected.selected.suggested_branch, "codex/high-perf-tool-01-approval_only_task");
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
        "  approved: true",
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
    assert.match(textSummary, /owner-approval: approved \(closed completed; not promotable\)/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dev_worker_closed_candidate_auto_approval_guard_v0 rejects closed auto-approval candidates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-closed-auto-approval-"));
  const workmetaRoot = path.join(root, "_workmeta");
  try {
    const queueRoot = path.join(workmetaRoot, "system", "dev_worker_candidate_queue");
    const readyQueueRoot = path.join(workmetaRoot, "system", "dev_worker_queue");
    const closedStatuses = ["completed", "promoted", "rejected", "dropped", "cancelled"];
    await mkdir(queueRoot, { recursive: true });

    for (const status of closedStatuses) {
      await writeFile(
        path.join(queueRoot, `${status}.yaml`),
        [
          "schema_version: soulforge.dev_worker_request.v0",
          `task_id: ${status}_closed_auto_task`,
          `status: ${status}`,
          "project_code: system",
          `summary: Closed ${status} candidates must not be auto-approved.`,
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
    }

    const listed = await listCandidatePackets({ localRoot: root, workmetaRoot });
    assert.equal(listed.scanned_count, closedStatuses.length);
    assert.equal(listed.auto_approvable_count, 0);
    assert.equal(listed.closed_candidate_count, 5);

    const byTaskId = new Map(listed.candidates.map((candidate) => [candidate.task_id, candidate]));
    for (const status of closedStatuses) {
      const candidate = byTaskId.get(`${status}_closed_auto_task`);
      assert.equal(candidate?.auto_approval.eligible, false);
      assert.equal(candidate?.auto_approval.reason, `status_not_auto_approvable:${status}`);
    }

    const approved = await autoApproveCandidates({ localRoot: root, workmetaRoot });
    assert.equal(approved.auto_approved_count, 0);
    assert.deepEqual(
      approved.skipped.map((item) => item.reason).sort(),
      closedStatuses.map((status) => `status_not_auto_approvable:${status}`).sort(),
    );

    const promoted = await promoteApprovedCandidates({ localRoot: root, workmetaRoot });
    assert.equal(promoted.promoted_count, 0);
    assert.equal(await pathIsPresent(readyQueueRoot), false);

    for (const status of closedStatuses) {
      const candidatePacket = await readFile(path.join(queueRoot, `${status}.yaml`), "utf8");
      assert.doesNotMatch(candidatePacket, /approved_by: auto_policy:dev_worker_auto_approval_policy_v0/u);
    }
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

test("candidate queue auto-approval scans raw control characters before the 40-entry limit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-auto-approval-overflow-"));
  const workmetaRoot = path.join(root, "_workmeta");
  try {
    const queueRoot = path.join(workmetaRoot, "system", "dev_worker_candidate_queue");
    await mkdir(queueRoot, { recursive: true });

    const yamlScalar = (value) => JSON.stringify(value);
    const safeWritePaths = Array.from({ length: 40 }, (_, index) => `guild_hall/dev_worker/safe-${index}/**`);
    const safeAcceptanceChecks = Array.from(
      { length: 40 },
      (_, index) => `npm run validate:dev-worker -- --safe-${index}`,
    );
    const candidates = [
      {
        file: "overflow-control-path.yaml",
        taskId: "overflow_control_path_auto_task",
        summary: "Try to hide a control write path after forty safe write paths.",
        allowedWritePaths: [...safeWritePaths, "guild_hall/dev_worker/**\n"],
        acceptanceChecks: ["npm run validate:dev-worker"],
        expectedReason: "write_path_not_allowed:guild_hall/dev_worker/**\\n",
      },
      {
        file: "overflow-control-check.yaml",
        taskId: "overflow_control_check_auto_task",
        summary: "Try to hide a control acceptance check after forty safe checks.",
        allowedWritePaths: ["guild_hall/dev_worker/**"],
        acceptanceChecks: [
          ...safeAcceptanceChecks,
          "npm run validate:dev-worker\nnode --check guild_hall/dev_worker/candidate_queue.mjs",
        ],
        expectedReason:
          "acceptance_check_not_allowed:npm run validate:dev-worker\\nnode --check guild_hall/dev_worker/candidate_queue.mjs",
      },
      {
        file: "overflow-newline-only-check.yaml",
        taskId: "overflow_newline_only_check_auto_task",
        summary: "Try to hide a newline-only acceptance check after forty safe checks.",
        allowedWritePaths: ["guild_hall/dev_worker/**"],
        acceptanceChecks: [...safeAcceptanceChecks, "\n"],
        expectedReason: "acceptance_check_not_allowed:\\n",
      },
      {
        file: "safe-baseline.yaml",
        taskId: "safe_baseline_auto_task",
        summary: "Keep a normal low-risk safe candidate eligible.",
        allowedWritePaths: ["guild_hall/dev_worker/**"],
        acceptanceChecks: ["npm run validate:dev-worker"],
        expectedReason: "eligible",
      },
    ];

    for (const candidate of candidates) {
      await writeFile(
        path.join(queueRoot, candidate.file),
        [
          "schema_version: soulforge.dev_worker_request.v0",
          `task_id: ${candidate.taskId}`,
          "status: proposed",
          "project_code: system",
          `summary: ${candidate.summary}`,
          "risk_level: low",
          "allowed_write_paths:",
          ...candidate.allowedWritePaths.map((allowedWritePath) => `  - ${yamlScalar(allowedWritePath)}`),
          "acceptance_checks:",
          ...candidate.acceptanceChecks.map((acceptanceCheck) => `  - ${yamlScalar(acceptanceCheck)}`),
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
    }

    const listed = await listCandidatePackets({ localRoot: root, workmetaRoot });
    assert.equal(listed.scanned_count, candidates.length);
    assert.equal(listed.auto_approvable_count, 1);

    const byTaskId = new Map(listed.candidates.map((candidate) => [candidate.task_id, candidate]));
    for (const candidate of candidates) {
      const listedCandidate = byTaskId.get(candidate.taskId);
      assert.equal(listedCandidate?.auto_approval.reason, candidate.expectedReason);
      assert.equal(/[\u0000-\u001F\u007F]/u.test(listedCandidate?.auto_approval.reason ?? ""), false);
    }
    assert.equal(byTaskId.get("safe_baseline_auto_task")?.auto_approval.eligible, true);

    const approved = await autoApproveCandidates({ localRoot: root, workmetaRoot });
    assert.equal(approved.auto_approved_count, 1);
    assert.equal(approved.auto_approved[0].task_id, "safe_baseline_auto_task");
    assert.deepEqual(
      approved.skipped.map((item) => item.reason).sort(),
      candidates
        .filter((candidate) => candidate.expectedReason !== "eligible")
        .map((candidate) => candidate.expectedReason)
        .sort(),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate queue auto-approval rejects boundary-bypass candidates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-auto-approval-boundary-"));
  const workmetaRoot = path.join(root, "_workmeta");
  try {
    await mkdir(path.join(workmetaRoot, "system", "dev_worker_candidate_queue"), { recursive: true });

    const absoluteWritePath = ["", "tmp", "soulforge", "guild_hall", "dev_worker", "**"].join("/");
    const yamlScalar = (value) => JSON.stringify(value).replace(/\u007F/gu, "\\u007F");
    const candidates = [
      {
        file: "path-traversal.yaml",
        taskId: "path_traversal_auto_task",
        summary: "Try to escape the safe path prefix with traversal.",
        allowedWritePath: "guild_hall/dev_worker/../gateway/**",
        acceptanceCheck: "npm run validate:dev-worker",
        reason: "write_path_not_allowed:guild_hall/dev_worker/../gateway/**",
      },
      {
        file: "direct-broad-gateway.yaml",
        taskId: "direct_broad_gateway_auto_task",
        summary: "Try to auto-approve direct broad gateway write scope.",
        allowedWritePath: "guild_hall/gateway/**",
        acceptanceCheck: "npm run validate:dev-worker",
        reason: "write_path_not_allowed:guild_hall/gateway/**",
      },
      {
        file: "trailing-parent.yaml",
        taskId: "trailing_parent_auto_task",
        summary: "Try to escape the safe path prefix with a trailing parent segment.",
        allowedWritePath: "guild_hall/dev_worker/..",
        acceptanceCheck: "npm run validate:dev-worker",
        reason: "write_path_not_allowed:guild_hall/dev_worker/..",
      },
      {
        file: "absolute-path.yaml",
        taskId: "absolute_path_auto_task",
        summary: "Try to use an absolute write path.",
        allowedWritePath: absoluteWritePath,
        acceptanceCheck: "npm run validate:dev-worker",
        reason: `write_path_not_allowed:${absoluteWritePath}`,
      },
      {
        file: "newline-control-path.yaml",
        taskId: "newline_control_path_auto_task",
        summary: "Try to hide a safe write path suffix behind a newline.",
        allowedWritePath: "guild_hall/dev_worker/**\n",
        acceptanceCheck: "npm run validate:dev-worker",
        reason: "write_path_not_allowed:guild_hall/dev_worker/**\\n",
      },
      {
        file: "tab-control-path.yaml",
        taskId: "tab_control_path_auto_task",
        summary: "Try to hide a safe write path suffix behind a tab.",
        allowedWritePath: "guild_hall/dev_worker/**\t",
        acceptanceCheck: "npm run validate:dev-worker",
        reason: "write_path_not_allowed:guild_hall/dev_worker/**\\t",
      },
      {
        file: "nul-control-path.yaml",
        taskId: "nul_control_path_auto_task",
        summary: "Try to hide a safe write path suffix behind a NUL.",
        allowedWritePath: "guild_hall/dev_worker/**\u0000",
        acceptanceCheck: "npm run validate:dev-worker",
        reason: "write_path_not_allowed:guild_hall/dev_worker/**\\u0000",
      },
      {
        file: "del-control-path.yaml",
        taskId: "del_control_path_auto_task",
        summary: "Try to hide a safe write path suffix behind a DEL.",
        allowedWritePath: "guild_hall/dev_worker/**\u007F",
        acceptanceCheck: "npm run validate:dev-worker",
        reason: "write_path_not_allowed:guild_hall/dev_worker/**\\u007F",
      },
      {
        file: "shell-metachar-check.yaml",
        taskId: "shell_metachar_auto_task",
        summary: "Try to add a shell metacharacter to an acceptance check.",
        allowedWritePath: "guild_hall/dev_worker/**",
        acceptanceCheck: "npm run validate:dev-worker; echo unsafe",
        reason: "acceptance_check_not_allowed:npm run validate:dev-worker; echo unsafe",
      },
      {
        file: "newline-control-check.yaml",
        taskId: "newline_control_auto_task",
        summary: "Try to split an acceptance check with a newline.",
        allowedWritePath: "guild_hall/dev_worker/**",
        acceptanceCheck: "npm run validate:dev-worker\nnode --test guild_hall/dev_worker/dev_worker.test.mjs",
        reason: "acceptance_check_not_allowed:npm run validate:dev-worker\\nnode --test guild_hall/dev_worker/dev_worker.test.mjs",
      },
      {
        file: "tab-control-check.yaml",
        taskId: "tab_control_auto_task",
        summary: "Try to hide acceptance check arguments behind a tab.",
        allowedWritePath: "guild_hall/dev_worker/**",
        acceptanceCheck: "npm run validate:dev-worker\t--filter unsafe",
        reason: "acceptance_check_not_allowed:npm run validate:dev-worker\\t--filter unsafe",
      },
      {
        file: "nul-control-check.yaml",
        taskId: "nul_control_auto_task",
        summary: "Try to hide acceptance check content behind a NUL.",
        allowedWritePath: "guild_hall/dev_worker/**",
        acceptanceCheck: "npm run validate:dev-worker\u0000node --test guild_hall/dev_worker/dev_worker.test.mjs",
        reason: "acceptance_check_not_allowed:npm run validate:dev-worker\\u0000node --test guild_hall/dev_worker/dev_worker.test.mjs",
      },
      {
        file: "del-control-check.yaml",
        taskId: "del_control_auto_task",
        summary: "Try to hide acceptance check content behind a DEL.",
        allowedWritePath: "guild_hall/dev_worker/**",
        acceptanceCheck: "npm run validate:dev-worker\u007Fnode --test guild_hall/dev_worker/dev_worker.test.mjs",
        reason: "acceptance_check_not_allowed:npm run validate:dev-worker\\u007Fnode --test guild_hall/dev_worker/dev_worker.test.mjs",
      },
      {
        file: "newline-only-control-check.yaml",
        taskId: "newline_only_control_auto_task",
        summary: "Try to include a newline-only acceptance check before a safe check.",
        allowedWritePath: "guild_hall/dev_worker/**",
        acceptanceChecks: ["\n", "npm run validate:dev-worker"],
        reason: "acceptance_check_not_allowed:\\n",
      },
      {
        file: "tab-only-control-check.yaml",
        taskId: "tab_only_control_auto_task",
        summary: "Try to include a tab-only acceptance check before a safe check.",
        allowedWritePath: "guild_hall/dev_worker/**",
        acceptanceChecks: ["\t", "npm run validate:dev-worker"],
        reason: "acceptance_check_not_allowed:\\t",
      },
      {
        file: "nul-only-control-check.yaml",
        taskId: "nul_only_control_auto_task",
        summary: "Try to include a NUL-only acceptance check before a safe check.",
        allowedWritePath: "guild_hall/dev_worker/**",
        acceptanceChecks: ["\u0000", "npm run validate:dev-worker"],
        reason: "acceptance_check_not_allowed:\\u0000",
      },
      {
        file: "del-only-control-check.yaml",
        taskId: "del_only_control_auto_task",
        summary: "Try to include a DEL-only acceptance check before a safe check.",
        allowedWritePath: "guild_hall/dev_worker/**",
        acceptanceChecks: ["\u007F", "npm run validate:dev-worker"],
        reason: "acceptance_check_not_allowed:\\u007F",
      },
    ];

    for (const candidate of candidates) {
      await writeFile(
        path.join(workmetaRoot, "system", "dev_worker_candidate_queue", candidate.file),
        [
          "schema_version: soulforge.dev_worker_request.v0",
          `task_id: ${candidate.taskId}`,
          "status: proposed",
          "project_code: system",
          `summary: ${candidate.summary}`,
          "risk_level: low",
          "allowed_write_paths:",
          `  - ${yamlScalar(candidate.allowedWritePath)}`,
          "acceptance_checks:",
          ...(candidate.acceptanceChecks ?? [candidate.acceptanceCheck]).map(
            (acceptanceCheck) => `  - ${yamlScalar(acceptanceCheck)}`,
          ),
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
    }

    const listed = await listCandidatePackets({ localRoot: root, workmetaRoot });
    assert.equal(listed.scanned_count, candidates.length);
    assert.equal(listed.auto_approvable_count, 0);
    assert.deepEqual(
      listed.candidates.map((candidate) => candidate.auto_approval.reason).sort(),
      candidates.map((candidate) => candidate.reason).sort(),
    );
    const directBroadGateway = listed.candidates.find((candidate) => candidate.task_id === "direct_broad_gateway_auto_task");
    assert.equal(directBroadGateway?.auto_approval.eligible, false);
    assert.equal(directBroadGateway?.auto_approval.reason, "write_path_not_allowed:guild_hall/gateway/**");
    for (const candidate of listed.candidates) {
      assert.equal(/[\u0000-\u001F\u007F]/u.test(candidate.auto_approval.reason), false);
    }
    const newlinePathReason = listed.candidates.find((candidate) => candidate.task_id === "newline_control_path_auto_task")?.auto_approval.reason;
    assert.equal(newlinePathReason, "write_path_not_allowed:guild_hall/dev_worker/**\\n");
    assert.equal(newlinePathReason.includes("\n"), false);
    assert.equal(newlinePathReason.includes("\\n"), true);

    const newlineReason = listed.candidates.find((candidate) => candidate.task_id === "newline_control_auto_task")?.auto_approval.reason;
    assert.equal(
      newlineReason,
      "acceptance_check_not_allowed:npm run validate:dev-worker\\nnode --test guild_hall/dev_worker/dev_worker.test.mjs",
    );
    assert.equal(newlineReason.includes("\n"), false);
    assert.equal(newlineReason.includes("\\n"), true);

    const textSummary = formatCandidateQueueText(listed, { details: true });
    assert.equal(
      textSummary.includes("write_path_not_allowed:guild_hall/dev_worker/**\n"),
      false,
    );
    assert.equal(
      textSummary.includes("write_path_not_allowed:guild_hall/dev_worker/**\\n"),
      true,
    );
    assert.equal(
      textSummary.includes("acceptance_check_not_allowed:npm run validate:dev-worker\nnode --test guild_hall/dev_worker/dev_worker.test.mjs"),
      false,
    );
    assert.equal(
      textSummary.includes("acceptance_check_not_allowed:npm run validate:dev-worker\\nnode --test guild_hall/dev_worker/dev_worker.test.mjs"),
      true,
    );

    const approved = await autoApproveCandidates({ localRoot: root, workmetaRoot });
    assert.equal(approved.auto_approved_count, 0);
    assert.deepEqual(
      approved.skipped.map((item) => item.reason).sort(),
      candidates.map((candidate) => candidate.reason).sort(),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
