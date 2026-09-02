#!/usr/bin/env node
/**
 * CLI for the Hermes profile snapshot (the Sigil inventory).
 *
 *   node hermes_profile_snapshot_cli.mjs \
 *     --hermes-home <hermes home> --data-root <private spine root> \
 *     [--running-profiles <a,b,c>] [--generation-seq <n>] \
 *     [--stamp <YYYYMMDDTHHMMSSZ>] [--apply]
 *
 * `--plan` is the default and writes nothing. `--apply` writes create-only
 * under `<data_root>` and never writes under `<hermes_home>`.
 *
 * `--running-profiles` is supplied by the operator; this tool enumerates no
 * processes. Omit it and every profile's `running` field is `null` with the
 * `running_state_unknown` gap recorded, which is the honest answer rather than
 * a guess. On the Main Node the list comes from the running `serve` processes,
 * for example:
 *
 *   powershell -NoProfile -Command "(Get-CimInstance Win32_Process |
 *     Where-Object { $_.CommandLine -like '*hermes*serve*' }).CommandLine"
 *
 * and is then passed in explicitly.
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runHermesProfileSnapshot } from "./hermes_profile_snapshot.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function parseHermesSnapshotArguments(argv) {
  const request = {
    hermes_home: null,
    data_root: null,
    running_profiles: null,
    generation_seq: null,
    stamp: null,
    apply: false,
  };
  const valueFlags = new Map([
    ["--hermes-home", "hermes_home"],
    ["--data-root", "data_root"],
    ["--running-profiles", "running_profiles"],
    ["--generation-seq", "generation_seq"],
    ["--stamp", "stamp"],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--apply") {
      if (request.apply) fail("cli_argument_invalid");
      request.apply = true;
      continue;
    }
    if (flag === "--plan") continue;
    if (!valueFlags.has(flag) || seen.has(flag) || index + 1 >= argv.length) {
      fail("cli_argument_invalid");
    }
    seen.add(flag);
    request[valueFlags.get(flag)] = argv[index + 1];
    index += 1;
  }
  if (request.hermes_home === null || request.data_root === null) fail("cli_argument_missing");
  request.hermes_home = path.resolve(request.hermes_home);
  request.data_root = path.resolve(request.data_root);
  if (request.running_profiles !== null) {
    const names = request.running_profiles.split(",").map((name) => name.trim()).filter(Boolean);
    if (names.length === 0 || names.some((name) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(name))) {
      fail("cli_running_profiles_invalid");
    }
    request.running_profiles = names;
  }
  if (request.generation_seq !== null) {
    if (!/^[1-9][0-9]{0,14}$/u.test(request.generation_seq)) fail("cli_generation_seq_invalid");
    request.generation_seq = Number(request.generation_seq);
  }
  return request;
}

async function main() {
  try {
    const request = parseHermesSnapshotArguments(process.argv.slice(2));
    const result = await runHermesProfileSnapshot(request);
    // Compact summary only: a scheduled run must never print a profile roster.
    process.stdout.write(`${JSON.stringify({
      mode: result.mode,
      written: result.written,
      stamp: result.stamp,
      generation_ref: result.generation_ref,
      content_digest: result.content_digest,
      profile_count: result.profile_count,
      payload_file_count: result.payload_file_count,
      payload_total_bytes: result.payload_total_bytes,
      readback_verified_count: result.readback_verified_count,
      coverage_gaps: result.coverage_gaps,
      withheld: result.withheld,
    })}\n`);
  } catch (error) {
    const candidate = String(error?.code ?? "");
    const code = /^[a-z][a-z0-9_]{0,95}$/u.test(candidate) ? candidate : "unknown_failure";
    process.stderr.write(`hermes_profile_snapshot_rejected:${code}\n`);
    process.exitCode = 1;
  }
}

const normalizePath = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath !== null && normalizePath(invokedPath) === normalizePath(fileURLToPath(import.meta.url))) {
  await main();
}
