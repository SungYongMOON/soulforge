#!/usr/bin/env node

import process from "node:process";

import {
  preflightSlackBatchLive,
  runSlackBatchLive,
  SlackBatchLiveError,
} from "./slack_batch_live_runner.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseArguments(argv) {
  const request = {
    mode: null,
    repository_root: null,
    runtime_root: null,
    batch_binding_path: null,
    expected_batch_binding_sha256: null,
  };
  const modeFlags = new Map([
    ["--preflight", "preflight"],
    ["--apply", "apply"],
  ]);
  const valueFlags = new Map([
    ["--repository-root", "repository_root"],
    ["--runtime-root", "runtime_root"],
    ["--batch-binding", "batch_binding_path"],
    ["--expected-batch-binding-sha256", "expected_batch_binding_sha256"],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (modeFlags.has(flag)) {
      if (request.mode !== null) fail("cli_mode_invalid");
      request.mode = modeFlags.get(flag);
      continue;
    }
    if (!valueFlags.has(flag) || seen.has(flag) || index + 1 >= argv.length) {
      fail("cli_argument_invalid");
    }
    seen.add(flag);
    request[valueFlags.get(flag)] = argv[index + 1];
    index += 1;
  }
  if (request.mode === null
    || Object.entries(request).some(([key, value]) => key !== "mode" && value === null)) {
    fail("cli_argument_missing");
  }
  return request;
}

function assertRuntimeAttestation(runtimeRoot) {
  const attestation = globalThis[Symbol.for("soulforge.slack_batch.runtime_attestation")];
  if (attestation === null || typeof attestation !== "object"
    || typeof attestation.runtime_root !== "string"
    || typeof attestation.manifest_sha256 !== "string") {
    fail("runtime_attestation_missing");
  }
  const normalize = (value) => (
    process.platform === "win32" ? value.toLowerCase() : value
  );
  if (normalize(attestation.runtime_root) !== normalize(runtimeRoot)) {
    fail("runtime_attestation_mismatch");
  }
}

try {
  const request = parseArguments(process.argv.slice(2));
  assertRuntimeAttestation(request.runtime_root);
  const result = request.mode === "preflight"
    ? await preflightSlackBatchLive(request)
    : await runSlackBatchLive(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failed_count > 0) process.exitCode = 2;
} catch (error) {
  const candidate = error instanceof SlackBatchLiveError
    ? error.code
    : String(error?.code ?? "");
  const code = /^[a-z][a-z0-9_]{0,95}$/u.test(candidate)
    ? candidate
    : "unknown_failure";
  process.stderr.write(`slack_batch_live_rejected:${code}\n`);
  process.exitCode = 1;
}
