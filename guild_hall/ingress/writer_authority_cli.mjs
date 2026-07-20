#!/usr/bin/env node
import { transitionWriterAuthority } from "./writer_authority.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseEpoch(value) {
  if (!/^\d+$/.test(value || "")) fail("writer_authority_cli_invalid_expected_epoch");
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch)) fail("writer_authority_cli_invalid_expected_epoch");
  return epoch;
}

function parse(argv) {
  const booleanFlags = new Set(["apply"]);
  const valueFlags = new Set([
    "state-root",
    "record",
    "action",
    "expected-current-epoch",
    "expected-current-digest",
    "expected-node",
    "primary-node",
    "fallback-node",
    "target-mode",
    "target-node",
    "not-before",
    "expires-at",
    "owner-approval-ref",
  ]);
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail("writer_authority_cli_unexpected_argument");
    const key = token.slice(2);
    if ((!booleanFlags.has(key) && !valueFlags.has(key)) || Object.hasOwn(values, key)) {
      fail("writer_authority_cli_unknown_or_duplicate_flag");
    }
    if (booleanFlags.has(key)) {
      values[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) fail(`writer_authority_cli_value_required_${key}`);
    values[key] = next;
    index += 1;
  }
  for (const key of ["state-root", "record", "action", "not-before", "expires-at", "owner-approval-ref"]) {
    if (!values[key]) fail(`writer_authority_cli_required_${key}`);
  }
  if (values.apply) {
    for (const key of ["expected-current-epoch", "expected-current-digest", "expected-node"]) {
      if (values[key] === undefined) fail(`writer_authority_cli_required_${key}`);
    }
  }
  if (values.action === "initialize") {
    for (const key of ["primary-node", "fallback-node"]) {
      if (!values[key]) fail(`writer_authority_cli_required_${key}`);
    }
  }
  if (values.action === "promote") {
    for (const key of ["target-mode", "target-node"]) {
      if (!values[key]) fail(`writer_authority_cli_required_${key}`);
    }
  }
  if (values.action === "failback" && !values["target-node"]) {
    fail("writer_authority_cli_required_target-node");
  }
  return values;
}

async function main() {
  try {
    const args = parse(process.argv.slice(2));
    const result = await transitionWriterAuthority({
      stateRoot: args["state-root"],
      recordPath: args.record,
      action: args.action,
      expectedCurrentEpoch: args["expected-current-epoch"] === undefined
        ? undefined
        : parseEpoch(args["expected-current-epoch"]),
      expectedCurrentDigest: args["expected-current-digest"],
      expectedNodeId: args["expected-node"],
      primaryNodeId: args["primary-node"],
      fallbackNodeId: args["fallback-node"],
      targetMode: args["target-mode"],
      targetNodeId: args["target-node"],
      notBefore: args["not-before"],
      expiresAt: args["expires-at"],
      ownerApprovalRef: args["owner-approval-ref"],
      apply: args.apply === true,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "error", code: error?.code || "writer_authority_failed" })}\n`);
    process.exitCode = 2;
  }
}

await main();
