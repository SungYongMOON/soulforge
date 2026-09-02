#!/usr/bin/env node

// Linear collection CLI entrypoint. Only reachable through the exact-runtime
// launcher (the runtime attestation must be present) so a copied or drifted
// runtime tree cannot execute a live collection. `main` runs only when this
// file is the invoked entrypoint (process.argv[1]), exactly like the launcher
// and the emitter, so importing the module for its parser does nothing.

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  LinearCollectError,
  preflightLinearCollect,
  runLinearCollect,
} from "./linear_collect_runner.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function parseLinearCollectArguments(argv) {
  const request = {
    mode: null,
    repository_root: null,
    runtime_root: null,
    binding_path: null,
    expected_binding_sha256: null,
    state_root: null,
  };
  const modeFlags = new Map([
    ["--preflight", "preflight"],
    ["--apply", "apply"],
  ]);
  const valueFlags = new Map([
    ["--repository-root", "repository_root"],
    ["--runtime-root", "runtime_root"],
    ["--binding", "binding_path"],
    ["--expected-binding-sha256", "expected_binding_sha256"],
    ["--state-root", "state_root"],
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
  const attestation = globalThis[Symbol.for("soulforge.linear_collect.runtime_attestation")];
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

async function main() {
  try {
    const request = parseLinearCollectArguments(process.argv.slice(2));
    assertRuntimeAttestation(request.runtime_root);
    const result = request.mode === "preflight"
      ? await preflightLinearCollect(request)
      : await runLinearCollect(request);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const candidate = error instanceof LinearCollectError
      ? error.code
      : String(error?.code ?? "");
    const code = /^[a-z][a-z0-9_]{0,95}$/u.test(candidate)
      ? candidate
      : "unknown_failure";
    process.stderr.write(`linear_collect_rejected:${code}\n`);
    process.exitCode = 1;
  }
}

// The launcher sets process.argv[1] to the pinned runtime entrypoint before
// importing it; any other importer (tests, tooling) gets the parser only.
const normalizePath = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath !== null && normalizePath(invokedPath) === normalizePath(fileURLToPath(import.meta.url))) {
  await main();
}
