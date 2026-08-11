#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { topologySkeleton } from "../topology.mjs";
import {
  adaptEngineeringEngineTopology,
  adaptWatchtowerTopology,
} from "../topology_provider_adapters.mjs";
import { canonicalStringify, composeFederatedTopology } from "../topology_federation.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WATCHTOWER_SOURCE = resolve(REPO_ROOT, "guild_hall/watchtower/topology.mjs");
const ENGINE_SOURCE = resolve(REPO_ROOT, "guild_hall/engineering_engine/topology/engine_topology.json");

function fail(code, detail = "") {
  throw new Error(`${code}${detail ? `: ${detail}` : ""}`);
}

function parseArgs(args) {
  let out = null;
  let check = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== "--out" && arg !== "--check") fail("federated_topology_argument_unknown", arg);
    const value = args[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) fail("federated_topology_argument_value_missing", arg);
    if (arg === "--out") {
      if (out !== null) fail("federated_topology_argument_duplicate", arg);
      out = value;
    } else {
      if (check !== null) fail("federated_topology_argument_duplicate", arg);
      check = value;
    }
    index += 1;
  }
  if (out !== null && check !== null) fail("federated_topology_mode_conflict");
  return { out, check };
}

function readRequiredSource(path, sourceId) {
  if (!existsSync(path)) fail("federated_topology_source_missing", sourceId);
  return readFileSync(path);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function outputPath(ref) {
  return isAbsolute(ref) ? resolve(ref) : resolve(REPO_ROOT, ref);
}

function buildFederatedTopologyBytes() {
  const watchtowerBytes = readRequiredSource(WATCHTOWER_SOURCE, "watchtower_topology_source");
  const engineBytes = readRequiredSource(ENGINE_SOURCE, "engineering_engine_topology_source");
  const providers = [
    adaptWatchtowerTopology(topologySkeleton(), watchtowerBytes),
    adaptEngineeringEngineTopology(engineBytes),
  ];
  return Buffer.from(canonicalStringify(composeFederatedTopology(providers)), "utf8");
}

function main() {
  const { out, check } = parseArgs(process.argv.slice(2));
  const bytes = buildFederatedTopologyBytes();
  if (check !== null) {
    const target = outputPath(check);
    if (!existsSync(target)) fail("federated_topology_check_missing", check);
    const expected = readFileSync(target);
    if (!expected.equals(bytes)) fail("federated_topology_check_mismatch", check);
    process.stdout.write(`${JSON.stringify({ checked: check, bytes: bytes.length, sha256: sha256(bytes) })}\n`);
    return;
  }
  if (out !== null) {
    writeFileSync(outputPath(out), bytes);
    process.stdout.write(`${JSON.stringify({ emitted: out, bytes: bytes.length, sha256: sha256(bytes) })}\n`);
    return;
  }
  process.stdout.write(bytes);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.message ?? "federated_topology_failed"}\n`);
  process.exitCode = 1;
}
