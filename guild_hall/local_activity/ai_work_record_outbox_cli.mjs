#!/usr/bin/env node

import path from "node:path";

import {
  acknowledgeAiWorkRecordEvent,
  appendAiWorkRecordEvent,
  assertSyntheticAiWorkRecordRoot,
  inspectAiWorkRecordAcknowledgement,
  inspectAiWorkRecordCandidate,
  listPendingAiWorkRecordEvents,
  withAiWorkRecordOutboxLock,
} from "./ai_work_record_outbox.mjs";

const VALUE_ARGUMENTS = new Set([
  "--operation",
  "--state-root",
  "--project",
  "--event-base64",
  "--attempt-id",
  "--attempted-at",
  "--owner-token",
  "--fencing-token",
  "--lock-acquired-at",
  "--work-id",
  "--event-id",
  "--event-digest",
  "--sequence",
  "--ack-id",
  "--acked-at",
]);
const FLAG_ARGUMENTS = new Set([
  "--dry-run",
  "--synthetic-apply",
]);
const OPERATIONS = new Set(["publish", "ack", "pending"]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (FLAG_ARGUMENTS.has(token)) {
      const name = token.slice(2).replaceAll("-", "_");
      if (args[name] !== undefined) fail("argument_duplicate");
      args[name] = true;
      continue;
    }
    if (!VALUE_ARGUMENTS.has(token)) fail("argument_invalid");
    const name = token.slice(2).replaceAll("-", "_");
    if (args[name] !== undefined) fail("argument_duplicate");
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("argument_value_required");
    }
    args[name] = value;
    index += 1;
  }
  if (!OPERATIONS.has(args.operation)) fail("operation_invalid");
  if (!args.state_root || !path.isAbsolute(args.state_root)) {
    fail("state_root_absolute_required");
  }
  if (!args.project) fail("project_required");
  if (args.dry_run && args.synthetic_apply) fail("feature_mode_conflict");
  if (!args.dry_run && !args.synthetic_apply) fail("feature_off");
  assertSyntheticAiWorkRecordRoot(args.state_root);
  return args;
}

function parseBase64Json(value) {
  if (
    typeof value !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
      .test(value)
  ) {
    fail("event_base64_invalid");
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    fail("event_json_invalid");
  }
  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    fail("event_json_invalid");
  }
  return parsed;
}

function required(args, names) {
  for (const name of names) {
    if (!args[name]) fail(`${name}_required`);
  }
}

function parseSequence(value) {
  if (!/^(?:0|[1-9]\d*)$/u.test(String(value ?? ""))) {
    fail("sequence_invalid");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail("sequence_invalid");
  return parsed;
}

function lockOptions(args) {
  required(args, [
    "owner_token",
    "fencing_token",
    "lock_acquired_at",
  ]);
  return {
    stateRoot: args.state_root,
    projectCode: args.project,
    ownerToken: args.owner_token,
    fencingToken: args.fencing_token,
    acquiredAt: args.lock_acquired_at,
  };
}

async function dryRun(args) {
  if (args.operation === "publish") {
    required(args, ["event_base64"]);
    const event = parseBase64Json(args.event_base64);
    const inspected = await inspectAiWorkRecordCandidate({
      stateRoot: args.state_root,
      projectCode: args.project,
      event,
    });
    return {
      ok: true,
      operation: "publish",
      mode: "dry_run",
      ...inspected,
      claim_ceiling: "canon_candidate_public_synthetic_feature_off",
    };
  }
  if (args.operation === "ack") {
    required(args, [
      "work_id",
      "event_id",
      "event_digest",
      "sequence",
      "ack_id",
      "acked_at",
    ]);
    return inspectAiWorkRecordAcknowledgement({
      stateRoot: args.state_root,
      projectCode: args.project,
      workId: args.work_id,
      eventId: args.event_id,
      eventDigest: args.event_digest,
      sequence: parseSequence(args.sequence),
      ackId: args.ack_id,
      ackedAt: args.acked_at,
    });
  }
  const result = await listPendingAiWorkRecordEvents({
    stateRoot: args.state_root,
    projectCode: args.project,
  });
  return {
    ...result,
    mode: "dry_run",
  };
}

async function execute(args) {
  if (args.dry_run) return dryRun(args);
  if (args.operation === "pending") {
    return listPendingAiWorkRecordEvents({
      stateRoot: args.state_root,
      projectCode: args.project,
    });
  }
  return withAiWorkRecordOutboxLock(
    lockOptions(args),
    async (fence) => {
      if (args.operation === "publish") {
        required(args, [
          "event_base64",
          "attempt_id",
          "attempted_at",
        ]);
        return appendAiWorkRecordEvent({
          stateRoot: args.state_root,
          projectCode: args.project,
          event: parseBase64Json(args.event_base64),
          attemptId: args.attempt_id,
          attemptedAt: args.attempted_at,
          fence,
        });
      }
      required(args, [
        "work_id",
        "event_id",
        "event_digest",
        "sequence",
        "ack_id",
        "acked_at",
      ]);
      return acknowledgeAiWorkRecordEvent({
        stateRoot: args.state_root,
        projectCode: args.project,
        workId: args.work_id,
        eventId: args.event_id,
        eventDigest: args.event_digest,
        sequence: parseSequence(args.sequence),
        ackId: args.ack_id,
        ackedAt: args.acked_at,
        fence,
      });
    },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await execute(args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `ai_work_record_outbox_rejected:${error?.code ?? "unexpected"}\n`,
  );
  process.exitCode = 1;
});
