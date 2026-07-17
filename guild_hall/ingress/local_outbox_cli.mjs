#!/usr/bin/env node
import { enqueueLocalOutboxFile } from "./local_outbox.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parse(argv) {
  const allowed = new Set(["config", "lane", "source", "occurrence-id", "apply"]);
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail("local_outbox_unexpected_argument");
    const key = token.slice(2);
    if (!allowed.has(key) || Object.hasOwn(values, key)) fail("local_outbox_unknown_or_duplicate_flag");
    if (key === "apply") {
      values[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) fail(`local_outbox_flag_value_required_${key}`);
    values[key] = next;
    index += 1;
  }
  for (const key of ["config", "lane", "source", "occurrence-id"]) {
    if (!values[key]) fail(`local_outbox_flag_required_${key}`);
  }
  return values;
}

async function main() {
  try {
    const args = parse(process.argv.slice(2));
    const result = await enqueueLocalOutboxFile({
      bindingPath: args.config,
      lane: args.lane,
      source: args.source,
      occurrenceId: args["occurrence-id"],
      apply: args.apply === true,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "error", code: error?.code || "local_outbox_failed" })}\n`);
    process.exitCode = 2;
  }
}

await main();
