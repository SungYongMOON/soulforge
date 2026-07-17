#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { IngressClient } from "./src/ingress_client.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function flags(args, allowed) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !allowed.has(flag.slice(2)) || value === undefined || value.startsWith("--")) {
      fail("invalid_cli_arguments");
    }
    const key = flag.slice(2);
    if (Object.hasOwn(values, key)) fail("duplicate_cli_argument");
    values[key] = value;
  }
  return values;
}

function required(values, names) {
  for (const name of names) if (!values[name]) fail(`required_cli_argument_${name}`);
}

async function inputJson(path) {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(process.cwd(), path);
  try { return JSON.parse(await readFile(absolute, "utf8")); }
  catch { fail("invalid_input_json"); }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const token = process.env.SOULFORGE_INGRESS_TOKEN;
  if (!token) fail("SOULFORGE_INGRESS_TOKEN_required");
  const client = new IngressClient({
    baseUrl: process.env.SOULFORGE_INGRESS_URL || "http://127.0.0.1:4312",
    token,
  });
  try {
    let result;
    if (command === "whoami") {
      if (args.length) fail("invalid_cli_arguments");
      result = await client.whoami();
    } else if (command === "upload") {
      const values = flags(args, new Set(["file", "project", "occurrence", "idempotency", "media-type"]));
      required(values, ["file", "project", "occurrence", "idempotency", "media-type"]);
      result = await client.uploadFile({
        path: isAbsolute(values.file) ? resolve(values.file) : resolve(process.cwd(), values.file),
        projectHint: values.project,
        occurrenceId: values.occurrence,
        idempotencyKey: values.idempotency,
        mediaType: values["media-type"],
      });
    } else if (command === "publish-work" || command === "publish-run") {
      const values = flags(args, new Set(["input"]));
      required(values, ["input"]);
      const input = await inputJson(values.input);
      result = command === "publish-work"
        ? await client.publishWorkEvent(input)
        : await client.publishRunReceipt(input);
    } else if (command === "status") {
      const values = flags(args, new Set(["submission"]));
      required(values, ["submission"]);
      result = await client.submissionStatus(values.submission);
    } else {
      fail("usage: whoami | upload | publish-work | publish-run | status");
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "error", code: error?.code || error?.message || "ingress_client_failed" })}\n`);
  process.exitCode = 1;
});
