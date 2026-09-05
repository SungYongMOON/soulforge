import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { assignCandidate } from "../src/assignment_policy.mjs";
import { createCandidateExecutionCoordinator } from "../src/candidate_execution_coordinator.mjs";
import { createHermesBotSubmitExecutor } from "../src/hermes_bot_submit_executor.mjs";
import { matchRoleCapabilities } from "../src/role_capability_matcher.mjs";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;
const EXECUTABLE_PATH = path.resolve("synthetic-hermes-fixture", "hermes");
const HERMES_HOME = path.resolve("synthetic-hermes-fixture", "hermes-home");
const WORKING_DIRECTORY = path.resolve("synthetic-hermes-fixture", "work");

function taskRef(taskId) {
  return { provider: "linear", task_id: taskId };
}

function revisionRef(taskId) {
  return {
    provider: "linear",
    task_id: taskId,
    revision_id: "brief-r1",
    content_sha256: SHA_A,
  };
}

function taskPacket(taskId) {
  return {
    schema_version: "soulforge.candidate_execution.task_packet.v1",
    validation_state: "prevalidated",
    task_class: "official",
    task_status: "Todo",
    task_ref: taskRef(taskId),
    parent_task_ref: null,
    work_brief_revision_ref: revisionRef(taskId),
    action_ref: "prepare.synthetic.review",
    authority_ref: "authority.synthetic.r1",
    coverage_refs: [`coverage.${taskId.toLowerCase()}`],
  };
}

function matcherInput(task) {
  return {
    work_task_contract: {
      schema_version: "soulforge.role_capability.work_task_contract.v1",
      validation_state: "prevalidated",
      task_ref: structuredClone(task.task_ref),
      work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
      action_ref: task.action_ref,
      authority_ref: task.authority_ref,
      required_role_ref: "role.product.ceo",
      required_capability_refs: ["cap.review"],
    },
    role_snapshot: {
      schema_version: "soulforge.organization.role_snapshot.v1",
      snapshot_ref: { revision_id: "roles-r1", content_sha256: SHA_A },
      roles: [{
        role_ref: "role.product.ceo",
        status: "active",
        responsible_action_refs: [task.action_ref],
        responsible_actor_ref: "actor.product.ceo",
        candidate_actor_refs: ["actor.product.ceo"],
      }],
    },
    capability_snapshot: {
      schema_version: "soulforge.organization.capability_snapshot.v1",
      snapshot_ref: { revision_id: "capabilities-r1", content_sha256: SHA_B },
      actor_bindings: [{
        actor_ref: "actor.product.ceo",
        performing_agent_id: "agent.product.ceo",
        bot_ref: "bot.product.ceo",
        executor_ref: "executor.hermes.bot-submit",
        status: "active",
        capability_refs: ["cap.review"],
      }],
    },
  };
}

function assignmentFor(task) {
  return assignCandidate({
    matcher_result: matchRoleCapabilities(matcherInput(task)),
    policy: {
      schema_version: "soulforge.assignment_policy.snapshot.v1",
      validation_state: "prevalidated",
      mode: "responsible_ceo_triage",
      policy_revision_ref: { revision_id: "assignment-policy-r1", content_sha256: SHA_B },
    },
  });
}

function candidatePacket(task) {
  return {
    schema_version: "soulforge.candidate_execution.candidate_packet.v1",
    validation_state: "prevalidated",
    selection_state: "candidate",
    candidate_ref: `candidate.${task.task_ref.task_id.toLowerCase()}`,
    label_prefilter_passed: true,
    task_ref: structuredClone(task.task_ref),
    work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
    action_ref: task.action_ref,
    authority_ref: task.authority_ref,
  };
}

function runtimeBinding(overrides = {}) {
  return {
    performing_agent_id: "agent.product.ceo",
    bot_ref: "bot.product.ceo",
    durable_session_key: "durable-product-ceo",
    expected_model: "synthetic/model-1",
    executable_path: EXECUTABLE_PATH,
    executable_sha256: SHA_C,
    HERMES_HOME,
    working_directory: WORKING_DIRECTORY,
    ...overrides,
  };
}

function successfulJsonl({
  requestId = "request-1",
  sessionKey = "durable-product-ceo",
  model = "synthetic/model-1",
  text = "bounded synthetic result",
} = {}) {
  return [
    {
      schema_version: "hermes.bot_submit.v1",
      event: "accepted",
      state: "accepted",
      request_id: requestId,
      session_key: sessionKey,
      model,
    },
    {
      schema_version: "hermes.bot_submit.v1",
      event: "completed",
      state: "completed",
      status: "complete",
      request_id: requestId,
      text,
    },
  ].map((record) => JSON.stringify(record)).join("\n");
}

function jsonl(records) {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

function acceptedRecord(overrides = {}) {
  return {
    schema_version: "hermes.bot_submit.v1",
    event: "accepted",
    state: "accepted",
    request_id: "request-1",
    session_key: "durable-product-ceo",
    model: "synthetic/model-1",
    ...overrides,
  };
}

function completedRecord(overrides = {}) {
  return {
    schema_version: "hermes.bot_submit.v1",
    event: "completed",
    state: "completed",
    status: "complete",
    request_id: "request-1",
    text: "bounded synthetic result",
    ...overrides,
  };
}

function executeInput(task, assignment = assignmentFor(task)) {
  return {
    operation_id: "candidate-run-000001",
    fencing_epoch: 1,
    attempt_no: 1,
    claim: {
      task_ref: structuredClone(task.task_ref),
      work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
      action_ref: task.action_ref,
    },
    task_packet: structuredClone(task),
    assignment_packet: structuredClone(assignment),
  };
}

async function withDefaultRunnerFixture(scriptSource, action) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-hermes-runner-"));
  const workingDirectory = path.join(fixtureRoot, "work");
  const hermesHome = path.join(fixtureRoot, "hermes-home");
  const executablePath = path.join(
    fixtureRoot,
    process.platform === "win32" ? "hermes-node.exe" : "hermes-node",
  );
  await mkdir(workingDirectory);
  await mkdir(hermesHome);
  await copyFile(process.execPath, executablePath);
  await chmod(executablePath, 0o755);
  await writeFile(path.join(workingDirectory, "bot-submit"), scriptSource, {
    encoding: "utf8",
    mode: 0o600,
  });
  const executableSha256 = `sha256:${createHash("sha256")
    .update(await readFile(executablePath)).digest("hex")}`;
  try {
    return await action({ executablePath, executableSha256, hermesHome, workingDirectory });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}

function defaultRunnerBinding(fixture) {
  return runtimeBinding({
    executable_path: fixture.executablePath,
    executable_sha256: fixture.executableSha256,
    HERMES_HOME: fixture.hermesHome,
    working_directory: fixture.workingDirectory,
  });
}

test("Matcher to Assignment to Coordinator dispatches one exact Hermes bot-submit command", async () => {
  const task = taskPacket("TASK-HERMES-001");
  const assignment = assignmentFor(task);
  const workBrief = "Synthetic public-safe Work Brief.";
  const commandCalls = [];
  const resolvedRefs = [];
  const executor = createHermesBotSubmitExecutor({
    feature_enabled: true,
    runtime_binding: runtimeBinding(),
    wait_seconds: 45,
    async resolveWorkBrief(ref) {
      resolvedRefs.push(ref);
      return workBrief;
    },
    async inspectFile(path) {
      assert.equal(path, EXECUTABLE_PATH);
      return { is_file: true, is_reparse_point: false };
    },
    async hashFile(path) {
      assert.equal(path, EXECUTABLE_PATH);
      return SHA_C;
    },
    async runCommand(command) {
      commandCalls.push(command);
      return { exit_code: 0, stdout: successfulJsonl(), stderr: "" };
    },
    now: () => 1_777_777_777_000,
  });
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([["executor.hermes.bot-submit", executor]]),
  });

  const result = await coordinator.dispatch({
    candidate_packet: candidatePacket(task),
    task_packet: task,
    assignment_packet: assignment,
    idempotency_key: "dispatch.task-hermes-001.1",
  });

  assert.equal(result.status, "succeeded");
  assert.equal(commandCalls.length, 1);
  assert.deepEqual(resolvedRefs, [task.work_brief_revision_ref]);
  assert.equal(commandCalls[0].command, EXECUTABLE_PATH);
  assert.deepEqual(commandCalls[0].argv, [
    "bot-submit",
    "--session-key", "durable-product-ceo",
    "--expect-model", "synthetic/model-1",
    "--query-file", "-",
    "--wait-seconds", "45",
    "--jsonl",
  ]);
  assert.equal(commandCalls[0].shell, false);
  assert.equal(commandCalls[0].cwd, WORKING_DIRECTORY);
  assert.deepEqual(commandCalls[0].env, { HERMES_HOME });
  assert.deepEqual(commandCalls[0].stdin, Buffer.from(workBrief, "utf8"));
  assert.deepEqual(result.execution_receipt.attribution, {
    responsible_role_ref: "role.product.ceo",
    actor_ref: "actor.product.ceo",
    performing_agent_id: "agent.product.ceo",
    bot_ref: "bot.product.ceo",
    executor_ref: "executor.hermes.bot-submit",
  });
  assert.match(result.execution_receipt.result_ref, /^hermes-result\.sha256\.[a-f0-9]{64}$/u);
  assert.deepEqual(result.execution_receipt.artifact_refs, []);
  assert.equal(result.execution_receipt.evidence_refs.length, 1);
  assert.match(
    result.execution_receipt.evidence_refs[0],
    /^hermes-request\.sha256\.[a-f0-9]{64}$/u,
  );
  assert.deepEqual(result.execution_receipt.external_effect_evidence, {
    source: "executor.hermes.bot-submit",
    receipt_ref: result.execution_receipt.external_effect_evidence.receipt_ref,
    linear_writes: "UNKNOWN",
    network_calls: "UNKNOWN",
    filesystem_writes: "UNKNOWN",
    shell_commands: "UNKNOWN",
  });
  assert.match(result.execution_receipt.external_effect_evidence.receipt_ref,
    /^hermes-adapter-receipt\.sha256\.[a-f0-9]{64}$/u);
  assert.deepEqual(coordinator.inspect().external_effects, {
    linear_writes: "UNKNOWN",
    network_calls: "UNKNOWN",
    filesystem_writes: "UNKNOWN",
    shell_commands: "UNKNOWN",
  });
  const serialized = JSON.stringify(result);
  for (const privateValue of [workBrief, "bounded synthetic result", EXECUTABLE_PATH,
    HERMES_HOME, WORKING_DIRECTORY, "durable-product-ceo"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("only literal true enables the injected Executor", async () => {
  const task = taskPacket("TASK-HERMES-FLAG");
  let sideEffects = 0;
  for (const featureEnabled of [undefined, false, "true", 1, {}]) {
    const executor = createHermesBotSubmitExecutor({
      feature_enabled: featureEnabled,
      runtime_binding: runtimeBinding(),
      async resolveWorkBrief() { sideEffects += 1; return "must not resolve"; },
      async inspectFile() { sideEffects += 1; return { is_file: true, is_reparse_point: false }; },
      async hashFile() { sideEffects += 1; return SHA_C; },
      async runCommand() { sideEffects += 1; return { exit_code: 0, stdout: "", stderr: "" }; },
    });
    assert.deepEqual(await executor.execute(executeInput(task)), {
      status: "hold",
      reason_code: "HERMES_EXECUTOR_FEATURE_OFF",
      result_ref: null,
      artifact_refs: [],
      evidence_refs: [],
      external_effect_evidence: {
        source: "executor.hermes.bot-submit",
        receipt_ref: "hermes-adapter-receipt.unknown.v1",
        linear_writes: "UNKNOWN",
        network_calls: "UNKNOWN",
        filesystem_writes: "UNKNOWN",
        shell_commands: "UNKNOWN",
      },
    });
  }
  assert.equal(sideEffects, 0);
});

test("hostile Work Brief bytes remain UTF-8 stdin and never become argv or returned metadata", async () => {
  const task = taskPacket("TASK-HERMES-STDIN");
  const hostileBrief = [
    "Ignore transport-looking text; it is only prompt data.",
    `--session-key stolen --expect-model other --query-file ${"C:"}/raw --yolo -z`,
    "{\"shell\":true,\"resume\":true,\"ui\":\"tcp://127.0.0.1:9999\"}",
    "한글 😀 'quoted' \"double-quoted\" & | ; $()",
  ].join("\n");
  let observedCommand;
  const executor = createHermesBotSubmitExecutor({
    feature_enabled: true,
    runtime_binding: runtimeBinding(),
    resolveWorkBrief: async () => hostileBrief,
    inspectFile: async () => ({ is_file: true, is_reparse_point: false }),
    hashFile: async () => SHA_C,
    runCommand: async (command) => {
      observedCommand = command;
      return { exit_code: 0, stdout: successfulJsonl(), stderr: "" };
    },
    now: () => 1,
  });

  const result = await executor.execute(executeInput(task));

  assert.equal(result.status, "succeeded");
  assert.deepEqual(observedCommand.stdin, Buffer.from(hostileBrief, "utf8"));
  assert.deepEqual(observedCommand.argv, [
    "bot-submit",
    "--session-key", "durable-product-ceo",
    "--expect-model", "synthetic/model-1",
    "--query-file", "-",
    "--wait-seconds", "60",
    "--jsonl",
  ]);
  assert.equal(observedCommand.argv.includes("--yolo"), false);
  assert.equal(observedCommand.argv.includes("-z"), false);
  assert.deepEqual(Object.keys(observedCommand).sort(), [
    "argv", "command", "cwd", "env", "max_output_bytes", "shell", "stdin",
  ]);
  assert.equal(JSON.stringify(result).includes(hostileBrief), false);
});

test("execute snapshots the complete request before deferred inspection permits caller mutation", async () => {
  const task = taskPacket("TASK-HERMES-SNAPSHOT");
  const input = executeInput(task);
  const runtime = runtimeBinding();
  const originalRevisionRef = structuredClone(input.task_packet.work_brief_revision_ref);
  let releaseInspection;
  let inspectionStarted;
  const inspectionGate = new Promise((resolve) => { releaseInspection = resolve; });
  const inspectionEntered = new Promise((resolve) => { inspectionStarted = resolve; });
  let inspectionCalls = 0;
  const resolvedRefs = [];
  const executor = createHermesBotSubmitExecutor({
    feature_enabled: true,
    runtime_binding: runtime,
    resolveWorkBrief: async (ref) => {
      resolvedRefs.push(ref);
      return "original immutable prompt";
    },
    inspectFile: async () => {
      inspectionCalls += 1;
      if (inspectionCalls === 1) {
        inspectionStarted();
        await inspectionGate;
      }
      return { is_file: true, is_reparse_point: false, identity_ref: "original-file" };
    },
    hashFile: async () => SHA_C,
    runCommand: async (command, control) => {
      assert.equal(command.command, EXECUTABLE_PATH);
      assert.equal(command.cwd, WORKING_DIRECTORY);
      assert.deepEqual(command.env, { HERMES_HOME });
      assert.deepEqual(command.stdin, Buffer.from("original immutable prompt", "utf8"));
      await control.verifyExecutableAfterSpawn();
      return {
        exit_code: 0,
        stdout: jsonl([
          acceptedRecord({ operation_id: "candidate-run-000001" }),
          completedRecord({ operation_id: "candidate-run-000001" }),
        ]),
        stderr: "",
      };
    },
    now: () => 1,
  });

  const pending = executor.execute(input);
  await inspectionEntered;
  input.operation_id = "candidate-run-mutated";
  input.claim.task_ref.task_id = "TASK-MUTATED";
  input.claim.work_brief_revision_ref.revision_id = "brief-mutated";
  input.task_packet.task_ref.task_id = "TASK-MUTATED";
  input.task_packet.work_brief_revision_ref.task_id = "TASK-MUTATED";
  input.task_packet.work_brief_revision_ref.revision_id = "brief-mutated";
  input.task_packet.work_brief_revision_ref.content_sha256 = SHA_B;
  input.task_packet.authority_ref = "authority.mutated";
  input.assignment_packet.task_ref.task_id = "TASK-MUTATED";
  input.assignment_packet.work_brief_revision_ref.task_id = "TASK-MUTATED";
  input.assignment_packet.work_brief_revision_ref.revision_id = "brief-mutated";
  input.assignment_packet.work_brief_revision_ref.content_sha256 = SHA_B;
  input.assignment_packet.authority_ref = "authority.mutated";
  input.assignment_packet.performer_binding.performing_agent_id = "agent.mutated";
  input.assignment_packet.performer_binding.bot_ref = "bot.mutated";
  input.assignment_packet.performer_binding.capability_snapshot_ref.revision_id = "cap-mutated";
  runtime.executable_path = path.resolve("mutated-hermes");
  runtime.HERMES_HOME = path.resolve("mutated-hermes-home");
  runtime.working_directory = path.resolve("mutated-work");
  releaseInspection();

  const result = await pending;

  assert.equal(result.status, "succeeded");
  assert.equal(result.reason_code, null);
  assert.deepEqual(resolvedRefs, [originalRevisionRef]);
  assert.equal(JSON.stringify(result).includes("mutated"), false);
});

test("default runner sends exact hostile UTF-8 stdin and parses two-record JSONL without a shell", async () => {
  const task = taskPacket("TASK-HERMES-DEFAULT-RUNNER");
  const workBrief = "default runner stdin 한글 😀 & | ; $() --yolo\nsecond line";
  const expectedArgv = [
    "--session-key", "durable-product-ceo",
    "--expect-model", "synthetic/model-1",
    "--query-file", "-",
    "--wait-seconds", "5",
    "--jsonl",
  ];
  const script = `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const exactInput = Buffer.concat(chunks).toString("base64") === ${JSON.stringify(Buffer.from(workBrief).toString("base64"))};
  const exactArgv = JSON.stringify(process.argv.slice(2)) === ${JSON.stringify(JSON.stringify(expectedArgv))};
  if (!exactInput || !exactArgv) process.exit(9);
  const records = [
    {schema_version:"hermes.bot_submit.v1",event:"accepted",state:"accepted",request_id:"real-runner-1",session_key:"durable-product-ceo",model:"synthetic/model-1"},
    {schema_version:"hermes.bot_submit.v1",event:"completed",state:"completed",status:"complete",request_id:"real-runner-1",text:"real runner bounded result"}
  ];
  process.stdout.write(records.map(JSON.stringify).join("\\n"));
});
`;

  await withDefaultRunnerFixture(script, async (fixture) => {
    const executor = createHermesBotSubmitExecutor({
      feature_enabled: true,
      runtime_binding: defaultRunnerBinding(fixture),
      wait_seconds: 5,
      resolveWorkBrief: async () => workBrief,
      now: () => 1,
    });

    const result = await executor.execute(executeInput(task));

    assert.equal(result.status, "succeeded");
    assert.equal(result.reason_code, null);
    assert.match(result.result_ref, /^hermes-result\.sha256\.[a-f0-9]{64}$/u);
    assert.equal(JSON.stringify(result).includes(workBrief), false);
  });
});

test("default runner performs pre-launch and post-spawn executable identity checks", async () => {
  const task = taskPacket("TASK-HERMES-DEFAULT-IDENTITY");
  const script = "setTimeout(() => {}, 1000);\n";

  await withDefaultRunnerFixture(script, async (fixture) => {
    let inspectionCalls = 0;
    let hashCalls = 0;
    const executor = createHermesBotSubmitExecutor({
      feature_enabled: true,
      runtime_binding: defaultRunnerBinding(fixture),
      resolveWorkBrief: async () => "identity-check prompt",
      inspectFile: async (filePath) => {
        assert.equal(filePath, fixture.executablePath);
        inspectionCalls += 1;
        return {
          is_file: true,
          is_reparse_point: false,
          identity_ref: inspectionCalls < 3 ? "copied-node-1" : "copied-node-2",
        };
      },
      hashFile: async (filePath) => {
        assert.equal(filePath, fixture.executablePath);
        hashCalls += 1;
        return fixture.executableSha256;
      },
      now: () => 1,
    });

    const result = await executor.execute(executeInput(task));

    assert.equal(inspectionCalls, 3);
    assert.equal(hashCalls, 2);
    assert.equal(result.status, "hold");
    assert.equal(result.reason_code, "HERMES_EXECUTABLE_DRIFT");
  });
});

test("default runner host deadline aborts and best-effort kills the direct child as UNKNOWN", async () => {
  const task = taskPacket("TASK-HERMES-DEFAULT-TIMEOUT");
  const script = `
const fs = require("node:fs");
const path = require("node:path");
fs.writeFileSync(path.join(process.env.HERMES_HOME, "started"), "started");
setTimeout(() => fs.writeFileSync(path.join(process.env.HERMES_HOME, "completed"), "completed"), 4000);
`;

  await withDefaultRunnerFixture(script, async (fixture) => {
    const executor = createHermesBotSubmitExecutor({
      feature_enabled: true,
      runtime_binding: defaultRunnerBinding(fixture),
      hard_timeout_ms: 1500,
      resolveWorkBrief: async () => "timeout prompt",
      now: () => 1,
    });

    const result = await executor.execute(executeInput(task));
    await access(path.join(fixture.hermesHome, "started"));
    await delay(3000);

    assert.equal(result.status, "hold");
    assert.equal(result.reason_code, "HERMES_TIMEOUT_UNKNOWN");
    await assert.rejects(access(path.join(fixture.hermesHome, "completed")), { code: "ENOENT" });
  });
});

test("default runner preserves stable command exit mappings", async () => {
  const task = taskPacket("TASK-HERMES-DEFAULT-EXITS");
  const cases = [
    { name: "usage", exitCode: 2, stdout: "", status: "failed", reason: "HERMES_COMMAND_USAGE_ERROR" },
    {
      name: "runtime hold",
      exitCode: 3,
      stdout: jsonl([completedRecord({ state: "hold", text: undefined, code: "session_busy" })]),
      status: "hold",
      reason: "HERMES_RUNTIME_HOLD",
    },
    { name: "transport timeout", exitCode: 124, stdout: "", status: "hold", reason: "HERMES_TIMEOUT_UNKNOWN" },
    {
      name: "terminal error",
      exitCode: 1,
      stdout: jsonl([acceptedRecord(), completedRecord({ status: "error", text: undefined })]),
      status: "failed",
      reason: "HERMES_TERMINAL_ERROR",
    },
  ];

  for (const commandCase of cases) {
    const script = commandCase.stdout.length > 0
      ? `process.stdout.write(${JSON.stringify(commandCase.stdout)}, () => process.exit(${commandCase.exitCode}));\n`
      : `process.exit(${commandCase.exitCode});\n`;
    await withDefaultRunnerFixture(script, async (fixture) => {
      const executor = createHermesBotSubmitExecutor({
        feature_enabled: true,
        runtime_binding: defaultRunnerBinding(fixture),
        resolveWorkBrief: async () => "exit-map prompt",
        now: () => 1,
      });

      const result = await executor.execute(executeInput(task));

      assert.equal(result.status, commandCase.status, commandCase.name);
      assert.equal(result.reason_code, commandCase.reason, commandCase.name);
    });
  }
});

test("runtime binding is exact and must match the Assignment identity before any file or process call", async () => {
  const task = taskPacket("TASK-HERMES-BINDING");
  let sideEffects = 0;
  const forbiddenExtraKeys = [
    "title", "create", "resume", "ui", "tcp", "ws", "--yolo", "-z", "shell",
  ];
  const invalidBindings = forbiddenExtraKeys.map((key) => ({
    ...runtimeBinding(),
    [key]: key === "shell" ? true : "forbidden",
  }));
  const missingBot = runtimeBinding();
  delete missingBot.bot_ref;
  invalidBindings.push(
    missingBot,
    runtimeBinding({ durable_session_key: "durable\nsession" }),
    runtimeBinding({ durable_session_key: "--yolo" }),
    runtimeBinding({ expected_model: "model\u0000bad" }),
    runtimeBinding({ expected_model: "-z" }),
    runtimeBinding({ executable_path: "relative/hermes" }),
    runtimeBinding({ executable_sha256: `sha256:${"C".repeat(64)}` }),
    runtimeBinding({ HERMES_HOME: "relative/hermes-home" }),
    runtimeBinding({ working_directory: "relative/work" }),
  );

  for (const binding of invalidBindings) {
    const executor = createHermesBotSubmitExecutor({
      feature_enabled: true,
      runtime_binding: binding,
      resolveWorkBrief: async () => { sideEffects += 1; return "must not resolve"; },
      inspectFile: async () => { sideEffects += 1; return { is_file: true, is_reparse_point: false }; },
      hashFile: async () => { sideEffects += 1; return SHA_C; },
      runCommand: async () => { sideEffects += 1; return { exit_code: 0, stdout: "", stderr: "" }; },
    });
    assert.equal(
      (await executor.execute(executeInput(task))).reason_code,
      "HERMES_RUNTIME_BINDING_INVALID",
    );
  }

  for (const [field, value] of [
    ["performing_agent_id", "agent.other"],
    ["bot_ref", "bot.other"],
  ]) {
    const assignment = structuredClone(assignmentFor(task));
    assignment.performer_binding[field] = value;
    const executor = createHermesBotSubmitExecutor({
      feature_enabled: true,
      runtime_binding: runtimeBinding(),
      resolveWorkBrief: async () => { sideEffects += 1; return "must not resolve"; },
      inspectFile: async () => { sideEffects += 1; return { is_file: true, is_reparse_point: false }; },
      hashFile: async () => { sideEffects += 1; return SHA_C; },
      runCommand: async () => { sideEffects += 1; return { exit_code: 0, stdout: "", stderr: "" }; },
    });
    assert.equal(
      (await executor.execute(executeInput(task, assignment))).reason_code,
      "HERMES_ASSIGNMENT_IDENTITY_MISMATCH",
    );
  }
  assert.equal(sideEffects, 0);
});

test("standalone adapter requires exact coordinator task and assignment contracts before I/O", async () => {
  const task = taskPacket("TASK-HERMES-PACKET-CONTRACT");
  const assignment = assignmentFor(task);
  let sideEffects = 0;
  const executor = createHermesBotSubmitExecutor({
    feature_enabled: true,
    runtime_binding: runtimeBinding(),
    resolveWorkBrief: async () => { sideEffects += 1; return "must not resolve"; },
    inspectFile: async () => { sideEffects += 1; return { is_file: true, is_reparse_point: false }; },
    hashFile: async () => { sideEffects += 1; return SHA_C; },
    runCommand: async () => { sideEffects += 1; return { exit_code: 0, stdout: "", stderr: "" }; },
  });
  const cases = [];
  const minimal = executeInput(task, assignment);
  minimal.task_packet = {
    task_ref: structuredClone(task.task_ref),
    work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
    action_ref: task.action_ref,
    authority_ref: task.authority_ref,
  };
  cases.push(minimal);
  for (const [target, field, value] of [
    ["task_packet", "schema_version", "wrong.task.schema"],
    ["task_packet", "validation_state", "unchecked"],
    ["task_packet", "task_status", "Done"],
    ["assignment_packet", "schema_version", "wrong.assignment.schema"],
    ["assignment_packet", "assignment_state", "candidate"],
    ["assignment_packet", "policy_mode", "other_mode"],
    ["assignment_packet", "responsible_role_ref", "bad role with spaces"],
    ["performer_binding", "actor_ref", "bad actor with spaces"],
    ["performer_binding", "actor_ref", `sk-${"x".repeat(20)}`],
    ["performer_binding", "executor_ref", "executor.other"],
    ["performer_binding", "capability_snapshot_ref", null],
  ]) {
    const candidate = executeInput(task, assignment);
    const object = target === "performer_binding"
      ? candidate.assignment_packet.performer_binding : candidate[target];
    object[field] = value;
    cases.push(candidate);
  }
  const identityMismatch = executeInput(task, assignment);
  identityMismatch.assignment_packet.authority_ref = "authority.other";
  cases.push(identityMismatch);

  for (const packet of cases) {
    const result = await executor.execute(packet);
    assert.equal(result.status, "hold");
    assert.match(result.reason_code, /^HERMES_(?:EXECUTION_PACKET_INVALID|ASSIGNMENT_IDENTITY_MISMATCH)$/u);
  }
  assert.equal(sideEffects, 0);
});

test("exit 3, timeout 124, terminal errors, and malformed JSONL map to deterministic safe outcomes", async () => {
  const task = taskPacket("TASK-HERMES-PROTOCOL");
  const cases = [
    {
      name: "pre-accept HOLD",
      commandResult: {
        exit_code: 3,
        stdout: jsonl([{
          schema_version: "hermes.bot_submit.v1",
          event: "completed",
          state: "hold",
          code: "session_busy",
          request_id: "request-hold",
        }]),
        stderr: "private diagnostic must not escape",
      },
      status: "hold",
      reason: "HERMES_RUNTIME_HOLD",
    },
    {
      name: "pre-ACK uncertainty",
      commandResult: {
        exit_code: 124,
        stdout: jsonl([{
          schema_version: "hermes.bot_submit.v1",
          event: "completed",
          state: "unknown",
          code: "transport_timeout_pre_ack",
          request_id: "request-pre-ack",
        }]),
        stderr: "",
      },
      status: "hold",
      reason: "HERMES_PRE_ACK_UNKNOWN",
    },
    {
      name: "post-ACK timeout uncertainty",
      commandResult: {
        exit_code: 124,
        stdout: jsonl([
          acceptedRecord(),
          completedRecord({ state: "unknown", status: undefined, text: undefined,
            code: "result_timeout" }),
        ]),
        stderr: "",
      },
      status: "hold",
      reason: "HERMES_RESULT_UNKNOWN",
    },
    {
      name: "timeout with no JSONL is unknown before parsing",
      commandResult: { exit_code: 124, stdout: "", stderr: "private timeout diagnostic" },
      status: "hold",
      reason: "HERMES_TIMEOUT_UNKNOWN",
    },
    {
      name: "exit 2 is a stable invocation failure",
      commandResult: { exit_code: 2, stdout: "", stderr: "private usage diagnostic" },
      status: "failed",
      reason: "HERMES_COMMAND_USAGE_ERROR",
    },
    {
      name: "terminal error",
      commandResult: {
        exit_code: 1,
        stdout: jsonl([
          acceptedRecord(),
          completedRecord({ status: "error", text: undefined }),
        ]),
        stderr: "raw provider error",
      },
      status: "failed",
      reason: "HERMES_TERMINAL_ERROR",
    },
    {
      name: "arbitrary nonzero",
      commandResult: { exit_code: 9, stdout: "", stderr: "raw failure" },
      status: "failed",
      reason: "HERMES_COMMAND_FAILED",
    },
    {
      name: "request mismatch",
      commandResult: {
        exit_code: 0,
        stdout: jsonl([acceptedRecord(), completedRecord({ request_id: "request-other" })]),
        stderr: "",
      },
      status: "failed",
      reason: "HERMES_PROTOCOL_MISMATCH",
    },
    {
      name: "session mismatch",
      commandResult: {
        exit_code: 0,
        stdout: jsonl([
          acceptedRecord({ session_key: "durable-other" }),
          completedRecord(),
        ]),
        stderr: "",
      },
      status: "failed",
      reason: "HERMES_PROTOCOL_MISMATCH",
    },
    {
      name: "model mismatch",
      commandResult: {
        exit_code: 0,
        stdout: jsonl([
          acceptedRecord({ model: "synthetic/model-other" }),
          completedRecord(),
        ]),
        stderr: "",
      },
      status: "failed",
      reason: "HERMES_PROTOCOL_MISMATCH",
    },
    {
      name: "missing accepted model cannot prove the required contract",
      commandResult: {
        exit_code: 0,
        stdout: jsonl([
          acceptedRecord({ model: undefined }),
          completedRecord(),
        ]),
        stderr: "",
      },
      status: "hold",
      reason: "HERMES_ACCEPTED_MODEL_REQUIRED",
    },
    {
      name: "operation mismatch when present",
      commandResult: {
        exit_code: 0,
        stdout: jsonl([
          acceptedRecord({ operation_id: "candidate-run-other" }),
          completedRecord({ operation_id: "candidate-run-other" }),
        ]),
        stderr: "",
      },
      status: "failed",
      reason: "HERMES_PROTOCOL_MISMATCH",
    },
    {
      name: "duplicate ACK",
      commandResult: {
        exit_code: 0,
        stdout: jsonl([acceptedRecord(), acceptedRecord(), completedRecord()]),
        stderr: "",
      },
      status: "failed",
      reason: "HERMES_JSONL_SEQUENCE_INVALID",
    },
    {
      name: "missing ACK identity",
      commandResult: {
        exit_code: 0,
        stdout: jsonl([
          {
            schema_version: "hermes.bot_submit.v1",
            event: "accepted",
            state: "accepted",
            request_id: "request-1",
            model: "synthetic/model-1",
          },
          completedRecord(),
        ]),
        stderr: "",
      },
      status: "failed",
      reason: "HERMES_PROTOCOL_MISMATCH",
    },
    {
      name: "unknown JSONL field",
      commandResult: {
        exit_code: 0,
        stdout: jsonl([acceptedRecord({ prompt: "raw prompt" }), completedRecord()]),
        stderr: "",
      },
      status: "failed",
      reason: "HERMES_PROTOCOL_MISMATCH",
    },
    {
      name: "empty successful text",
      commandResult: {
        exit_code: 0,
        stdout: jsonl([acceptedRecord(), completedRecord({ text: "" })]),
        stderr: "",
      },
      status: "failed",
      reason: "HERMES_EMPTY_RESULT",
    },
    {
      name: "malformed JSONL",
      commandResult: { exit_code: 0, stdout: "{not-json", stderr: "" },
      status: "failed",
      reason: "HERMES_JSONL_MALFORMED",
    },
    ...[
      ["null JSONL", "null"],
      ["array JSONL", "[]"],
      ["scalar JSONL", "7"],
      ["string JSONL", "\"scalar\""],
    ].map(([name, stdout]) => ({
      name,
      commandResult: { exit_code: 0, stdout, stderr: "" },
      status: "failed",
      reason: "HERMES_JSONL_MALFORMED",
    })),
    {
      name: "oversized stdout",
      commandResult: { exit_code: 0, stdout: "x".repeat(257), stderr: "" },
      maxOutputBytes: 256,
      status: "failed",
      reason: "HERMES_OUTPUT_OVERSIZED",
    },
  ];

  for (const protocolCase of cases) {
    let commandCalls = 0;
    const executor = createHermesBotSubmitExecutor({
      feature_enabled: true,
      runtime_binding: runtimeBinding(),
      resolveWorkBrief: async () => "synthetic protocol prompt",
      inspectFile: async () => ({ is_file: true, is_reparse_point: false }),
      hashFile: async () => SHA_C,
      runCommand: async () => { commandCalls += 1; return protocolCase.commandResult; },
      now: () => 1,
      max_output_bytes: protocolCase.maxOutputBytes ?? 1024,
    });
    const result = await executor.execute(executeInput(task));
    assert.equal(result.status, protocolCase.status, protocolCase.name);
    assert.equal(result.reason_code, protocolCase.reason, protocolCase.name);
    assert.equal(commandCalls, 1, protocolCase.name);
    assert.equal(result.result_ref, null, protocolCase.name);
    assert.deepEqual(result.artifact_refs, [], protocolCase.name);
    assert.deepEqual(result.evidence_refs, [], protocolCase.name);
    const serialized = JSON.stringify(result);
    for (const privateValue of [
      "private diagnostic must not escape", "raw provider error", "raw failure", "raw prompt",
      EXECUTABLE_PATH, HERMES_HOME, WORKING_DIRECTORY, "durable-product-ceo",
    ]) {
      assert.equal(serialized.includes(privateValue), false, protocolCase.name);
    }
  }
});

test("richer accepted and completed identity fields are checked without requiring legacy state fields", async () => {
  const task = taskPacket("TASK-HERMES-RICH-JSONL");
  const stdout = jsonl([
    {
      schema_version: "hermes.bot_submit.v1",
      type: "accepted",
      request_id: "request-rich-1",
      requested_session_key: "durable-product-ceo",
      actual_session_key: "durable-product-ceo",
      live_session_id: "live-session-1",
      started_at: "2026-08-24T00:00:00Z",
      model: "synthetic/model-1",
      operation_id: "candidate-run-000001",
    },
    {
      schema_version: "hermes.bot_submit.v1",
      type: "completed",
      request_id: "request-rich-1",
      requested_session_key: "durable-product-ceo",
      actual_session_key: "durable-product-ceo",
      live_session_id: "live-session-1",
      operation_id: "candidate-run-000001",
      status: "complete",
      text: "rich bounded result",
      usage: { input_tokens: 10, output_tokens: 3 },
      finished_at: "2026-08-24T00:00:03Z",
    },
  ]);
  const executor = createHermesBotSubmitExecutor({
    feature_enabled: true,
    runtime_binding: runtimeBinding(),
    resolveWorkBrief: async () => "synthetic rich protocol prompt",
    inspectFile: async () => ({ is_file: true, is_reparse_point: false }),
    hashFile: async () => SHA_C,
    runCommand: async () => ({ exit_code: 0, stdout, stderr: "" }),
    now: () => 1,
  });

  const result = await executor.execute(executeInput(task));

  assert.equal(result.status, "succeeded");
  assert.equal(result.reason_code, null);
  assert.equal(JSON.stringify(result).includes("live-session-1"), false);
  assert.equal(JSON.stringify(result).includes("rich bounded result"), false);
});

test("unsafe executable, hash drift, unavailable Work Brief, and invalid prompt fail before command launch", async () => {
  const task = taskPacket("TASK-HERMES-PREFLIGHT");
  const cases = [
    {
      name: "not a regular file",
      inspectFile: async () => ({ is_file: false, is_reparse_point: false }),
      reason: "HERMES_EXECUTABLE_UNSAFE",
    },
    {
      name: "reparse point",
      inspectFile: async () => ({ is_file: true, is_reparse_point: true }),
      reason: "HERMES_EXECUTABLE_UNSAFE",
    },
    {
      name: "non-exact inspection result",
      inspectFile: async () => ({ is_file: true, is_reparse_point: false, guessed: true }),
      reason: "HERMES_EXECUTABLE_UNSAFE",
    },
    {
      name: "inspection failure",
      inspectFile: async () => { throw new Error("private path diagnostic"); },
      reason: "HERMES_EXECUTABLE_INSPECTION_FAILED",
    },
    {
      name: "hash drift",
      hashFile: async () => SHA_B,
      reason: "HERMES_EXECUTABLE_HASH_MISMATCH",
    },
    {
      name: "hash failure",
      hashFile: async () => { throw new Error("private hash diagnostic"); },
      reason: "HERMES_EXECUTABLE_INSPECTION_FAILED",
    },
    {
      name: "resolver failure",
      resolveWorkBrief: async () => { throw new Error("private resolver diagnostic"); },
      reason: "HERMES_WORK_BRIEF_UNAVAILABLE",
    },
    {
      name: "empty prompt",
      resolveWorkBrief: async () => "",
      reason: "HERMES_WORK_BRIEF_INVALID",
    },
    {
      name: "control-bearing prompt",
      resolveWorkBrief: async () => "private\u0000prompt",
      reason: "HERMES_WORK_BRIEF_INVALID",
    },
    {
      name: "byte-oversized prompt",
      resolveWorkBrief: async () => "😀".repeat(16_000) + "x",
      reason: "HERMES_WORK_BRIEF_INVALID",
    },
    {
      name: "invalid clock",
      now: () => Number.NaN,
      reason: "HERMES_CLOCK_INVALID",
    },
  ];

  for (const preflightCase of cases) {
    let commandCalls = 0;
    const executor = createHermesBotSubmitExecutor({
      feature_enabled: true,
      runtime_binding: runtimeBinding(),
      resolveWorkBrief: preflightCase.resolveWorkBrief ?? (async () => "synthetic prompt"),
      inspectFile: preflightCase.inspectFile
        ?? (async () => ({ is_file: true, is_reparse_point: false })),
      hashFile: preflightCase.hashFile ?? (async () => SHA_C),
      runCommand: async () => {
        commandCalls += 1;
        return { exit_code: 0, stdout: successfulJsonl(), stderr: "" };
      },
      now: preflightCase.now ?? (() => 1),
    });
    const result = await executor.execute(executeInput(task));
    assert.equal(result.status, "hold", preflightCase.name);
    assert.equal(result.reason_code, preflightCase.reason, preflightCase.name);
    assert.equal(commandCalls, 0, preflightCase.name);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("private"), false, preflightCase.name);
    assert.equal(serialized.includes(EXECUTABLE_PATH), false, preflightCase.name);
  }
});

test("an injected command-runner failure is one UNKNOWN attempt with no retry or raw echo", async () => {
  const task = taskPacket("TASK-HERMES-RUNNER-THROW");
  let commandCalls = 0;
  const executor = createHermesBotSubmitExecutor({
    feature_enabled: true,
    runtime_binding: runtimeBinding(),
    resolveWorkBrief: async () => "synthetic runner prompt",
    inspectFile: async () => ({ is_file: true, is_reparse_point: false }),
    hashFile: async () => SHA_C,
    runCommand: async () => {
      commandCalls += 1;
      throw new Error("private command failure with durable-product-ceo");
    },
    now: () => 1,
  });

  const result = await executor.execute(executeInput(task));

  assert.equal(commandCalls, 1);
  assert.equal(result.status, "hold");
  assert.equal(result.reason_code, "HERMES_COMMAND_UNCERTAIN");
  assert.equal(result.result_ref, null);
  assert.deepEqual(result.artifact_refs, []);
  assert.deepEqual(result.evidence_refs, []);
  assert.deepEqual(result.external_effect_evidence, {
    source: "executor.hermes.bot-submit",
    receipt_ref: result.external_effect_evidence.receipt_ref,
    linear_writes: "UNKNOWN",
    network_calls: "UNKNOWN",
    filesystem_writes: "UNKNOWN",
    shell_commands: "UNKNOWN",
  });
  assert.match(result.external_effect_evidence.receipt_ref,
    /^hermes-adapter-receipt\.sha256\.[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(result).includes("durable-product-ceo"), false);
});

test("host hard deadline aborts one hung command attempt and reports UNKNOWN", async () => {
  const task = taskPacket("TASK-HERMES-HOST-DEADLINE");
  let commandCalls = 0;
  let aborts = 0;
  const executor = createHermesBotSubmitExecutor({
    feature_enabled: true,
    runtime_binding: runtimeBinding(),
    hard_timeout_ms: 20,
    resolveWorkBrief: async () => "synthetic timeout prompt",
    inspectFile: async () => ({
      is_file: true,
      is_reparse_point: false,
      identity_ref: "file-identity-1",
    }),
    hashFile: async () => SHA_C,
    runCommand: async (_command, control) => {
      commandCalls += 1;
      control.signal.addEventListener("abort", () => { aborts += 1; }, { once: true });
      return new Promise(() => {});
    },
    now: () => 1,
  });

  const result = await executor.execute(executeInput(task));

  assert.equal(commandCalls, 1);
  assert.equal(aborts, 1);
  assert.equal(result.status, "hold");
  assert.equal(result.reason_code, "HERMES_TIMEOUT_UNKNOWN");
});

test("executable identity or digest drift after spawn is killed and held", async () => {
  const task = taskPacket("TASK-HERMES-SPAWN-DRIFT");
  for (const mutation of ["identity", "digest"]) {
    let commandCalls = 0;
    let identityRef = "file-identity-1";
    let digest = SHA_C;
    const executor = createHermesBotSubmitExecutor({
      feature_enabled: true,
      runtime_binding: runtimeBinding(),
      resolveWorkBrief: async () => "synthetic race prompt",
      inspectFile: async () => ({
        is_file: true,
        is_reparse_point: false,
        identity_ref: identityRef,
      }),
      hashFile: async () => digest,
      runCommand: async (_command, control) => {
        commandCalls += 1;
        if (mutation === "identity") identityRef = "file-identity-2";
        else digest = SHA_B;
        assert.equal(await control.verifyExecutableAfterSpawn(), false);
        return { exit_code: 0, stdout: successfulJsonl(), stderr: "" };
      },
      now: () => 1,
    });

    const result = await executor.execute(executeInput(task));

    assert.equal(commandCalls, 1, mutation);
    assert.equal(result.status, "hold", mutation);
    assert.equal(result.reason_code, "HERMES_EXECUTABLE_DRIFT", mutation);
    assert.equal(JSON.stringify(result).includes(EXECUTABLE_PATH), false, mutation);
  }
});
