#!/usr/bin/env node
/**
 * CLI for the Buzz backup-generation indexer.
 *
 *   node buzz_backup_generation_index_cli.mjs \
 *     --buzz-root <buzz controller root> --data-root <private spine root> \
 *     [--generation-seq <n>] [--stamp <YYYYMMDDTHHMMSSZ>] [--apply]
 *
 * `--plan` is the default and writes nothing. `--apply` writes create-only
 * under `<data_root>` and never touches `<buzz_root>`.
 *
 * Without `--generation-seq` the `backup_generation_pointer` is withheld
 * rather than invented: a pointer must name the collection generation the
 * backup covers, and there is no honest default for that.
 */

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runBuzzBackupGenerationIndex } from "./buzz_backup_generation_index.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function parseBuzzBackupIndexArguments(argv) {
  const request = {
    buzz_root: null,
    data_root: null,
    generation_seq: null,
    stamp: null,
    apply: false,
  };
  const valueFlags = new Map([
    ["--buzz-root", "buzz_root"],
    ["--data-root", "data_root"],
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
  if (request.buzz_root === null || request.data_root === null) fail("cli_argument_missing");
  request.buzz_root = path.resolve(request.buzz_root);
  request.data_root = path.resolve(request.data_root);
  if (request.generation_seq !== null) {
    if (!/^[1-9][0-9]{0,14}$/u.test(request.generation_seq)) fail("cli_generation_seq_invalid");
    request.generation_seq = Number(request.generation_seq);
  }
  return request;
}

async function main() {
  try {
    const request = parseBuzzBackupIndexArguments(process.argv.slice(2));
    const result = await runBuzzBackupGenerationIndex(request);
    // The full index rides in the return value for callers; stdout stays a
    // compact summary so a scheduled run never prints an inventory.
    process.stdout.write(`${JSON.stringify({
      mode: result.mode,
      written: result.written,
      stamp: result.stamp,
      generation_ref: result.generation_ref,
      content_digest: result.content_digest,
      file_count: result.file_count,
      total_bytes: result.total_bytes,
      verified_file_count: result.verified_file_count,
      bytes_duplicated: result.bytes_duplicated,
      coverage_gaps: result.coverage_gaps,
      withheld: result.withheld,
    })}\n`);
  } catch (error) {
    const candidate = String(error?.code ?? "");
    const code = /^[a-z][a-z0-9_]{0,95}$/u.test(candidate) ? candidate : "unknown_failure";
    process.stderr.write(`buzz_backup_index_rejected:${code}\n`);
    process.exitCode = 1;
  }
}

const normalizePath = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath !== null && normalizePath(invokedPath) === normalizePath(fileURLToPath(import.meta.url))) {
  await main();
}
