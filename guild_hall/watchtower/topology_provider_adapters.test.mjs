import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { topologySkeleton } from "./topology.mjs";
import {
  adaptEngineeringEngineTopology,
  adaptWatchtowerTopology,
} from "./topology_provider_adapters.mjs";
import { composeFederatedTopology, canonicalStringify } from "./topology_federation.mjs";

const WATCHTOWER_SOURCE = new URL("./topology.mjs", import.meta.url);
const ENGINE_SOURCE = new URL("../engineering_engine/topology/engine_topology.json", import.meta.url);
const CLI = fileURLToPath(new URL("./tools/emit_federated_topology.mjs", import.meta.url));
const TRACKED_ARTIFACT = fileURLToPath(new URL("./topology/federated_topology.v1.json", import.meta.url));
// Single versioned oracle: expectations derive from the contract pin instead of
// remembered counts, so topology growth is a deliberate pin update and silent
// drift fails closed here and in the Team Ops Board unified-view tests.
const CONTRACT = JSON.parse(readFileSync(new URL("./topology/federated_topology.v1.contract.json", import.meta.url), "utf8"));
const contractProvider = (id) => {
  const entry = CONTRACT.providers.find((provider) => provider.provider_id === id);
  assert.ok(entry, `contract provider missing: ${id}`);
  return entry;
};

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readInputs() {
  const watchtowerBytes = readFileSync(WATCHTOWER_SOURCE);
  const engineBytes = readFileSync(ENGINE_SOURCE);
  return {
    watchtowerBytes,
    engineBytes,
    engine: JSON.parse(engineBytes.toString("utf8")),
  };
}

test("allowlisted adapters map exact Watchtower and Engineering Engine inventories", () => {
  const { watchtowerBytes, engineBytes, engine } = readInputs();
  const watchtower = adaptWatchtowerTopology(topologySkeleton(), watchtowerBytes);
  const engineeringEngine = adaptEngineeringEngineTopology(engineBytes);

  assert.equal(watchtower.nodes.length, contractProvider("watchtower").node_count);
  assert.equal(watchtower.edges.length, contractProvider("watchtower").edge_count);
  assert.equal(engineeringEngine.nodes.length, contractProvider("engineering_engine").node_count);
  assert.equal(engineeringEngine.edges.length, contractProvider("engineering_engine").edge_count);
  assert.equal(watchtower.source.digest, digest(watchtowerBytes));
  assert.equal(engineeringEngine.source.digest, digest(engineBytes));
  assert.equal(watchtower.runtime_state, "unknown");
  assert.equal(engineeringEngine.runtime_state, "unknown");
  assert.ok([...watchtower.edges, ...engineeringEngine.edges].every(({ evidence_mode }) => evidence_mode === "structural_only"));
  assert.ok(engineeringEngine.nodes.every(({ id }) => id.length <= 95));
  assert.equal(new Set(engineeringEngine.nodes.map(({ id }) => id)).size, engineeringEngine.nodes.length);
  const longE03Node = engineeringEngine.nodes.find(({ label }) => label === "engines/material_procurement_readiness/evaluator/material_procurement_readiness_evaluator_adapter");
  assert.match(longE03Node.id, /^module\.[a-f0-9]{32}$/u);
  assert.ok(engineeringEngine.edges.every(({ from, to }) => engineeringEngine.nodes.some(({ id }) => id === from) && engineeringEngine.nodes.some(({ id }) => id === to)));

  const federation = composeFederatedTopology([watchtower, engineeringEngine]);
  assert.deepEqual(federation.summary, {
    provider_count: 2,
    node_count: contractProvider("watchtower").node_count + contractProvider("engineering_engine").node_count,
    edge_count: contractProvider("watchtower").edge_count + contractProvider("engineering_engine").edge_count,
    runtime_authority: false,
    repair_execution_authority: false,
  });
});

test("adapters derive exact-byte digests and reject invalid bytes, inventory drift, and embedded digest drift", () => {
  const { watchtowerBytes, engineBytes, engine } = readInputs();
  assert.throws(() => adaptWatchtowerTopology(topologySkeleton(), "0".repeat(64)));
  assert.throws(() => adaptWatchtowerTopology(topologySkeleton(), Buffer.alloc(0)));

  const fewerNodes = topologySkeleton();
  fewerNodes.nodes.pop();
  assert.throws(() => adaptWatchtowerTopology(fewerNodes, watchtowerBytes));

  const tamperedEngine = structuredClone(engine);
  tamperedEngine.modules[0].area = "tampered";
  assert.throws(() => adaptEngineeringEngineTopology(Buffer.from(JSON.stringify(tamperedEngine), "utf8")));
  assert.doesNotThrow(() => adaptEngineeringEngineTopology(engineBytes));
});

test("CLI emits canonical bytes only on stdout by default and --check remains read-only", () => {
  const run = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.summary.provider_count, CONTRACT.summary.provider_count);
  assert.equal(parsed.summary.node_count, CONTRACT.summary.node_count);
  assert.equal(parsed.summary.edge_count, CONTRACT.summary.edge_count);
  assert.equal(run.stdout, canonicalStringify(parsed));

  const scratch = mkdtempSync(join(tmpdir(), "soulforge-federated-topology-"));
  const expected = join(scratch, "expected.json");
  try {
    writeFileSync(expected, run.stdout, "utf8");
    const before = readFileSync(expected);
    const checked = spawnSync(process.execPath, [CLI, "--check", expected], { encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(readFileSync(expected), before);

    writeFileSync(expected, `${run.stdout.trim()} `, "utf8");
    const mismatch = spawnSync(process.execPath, [CLI, "--check", expected], { encoding: "utf8" });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /federated_topology_check_mismatch/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("tracked federated topology matches the fresh emit and the versioned contract pin", () => {
  const tracked = readFileSync(TRACKED_ARTIFACT);
  const checked = spawnSync(process.execPath, [CLI, "--check", TRACKED_ARTIFACT], { encoding: "utf8" });
  assert.equal(checked.status, 0, `tracked artifact drifted from fresh emit: ${checked.stderr}`);

  assert.equal(digest(tracked), CONTRACT.artifact_sha256, "contract artifact_sha256 drifted from tracked bytes");
  const snapshot = JSON.parse(tracked.toString("utf8"));
  assert.deepEqual(
    {
      provider_count: snapshot.summary.provider_count,
      node_count: snapshot.summary.node_count,
      edge_count: snapshot.summary.edge_count,
    },
    CONTRACT.summary,
  );
  const perProvider = new Map(CONTRACT.providers.map((entry) => [entry.provider_id, { node_count: 0, edge_count: 0 }]));
  for (const node of snapshot.nodes) {
    assert.ok(perProvider.has(node.provider_id), `node provider outside contract: ${node.provider_id}`);
    perProvider.get(node.provider_id).node_count += 1;
  }
  for (const edge of snapshot.edges) {
    assert.ok(perProvider.has(edge.provider_id), `edge provider outside contract: ${edge.provider_id}`);
    perProvider.get(edge.provider_id).edge_count += 1;
  }
  for (const entry of CONTRACT.providers) {
    assert.deepEqual(perProvider.get(entry.provider_id), { node_count: entry.node_count, edge_count: entry.edge_count }, entry.provider_id);
  }
});

test("CLI never writes without --out and writes only the requested output", () => {
  const scratch = mkdtempSync(join(tmpdir(), "soulforge-federated-topology-out-"));
  const output = join(scratch, "federation.json");
  try {
    const emitted = spawnSync(process.execPath, [CLI, "--out", output], { encoding: "utf8" });
    assert.equal(emitted.status, 0, emitted.stderr);
    const parsed = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(parsed.summary.provider_count, CONTRACT.summary.provider_count);
    assert.equal(parsed.summary.node_count, CONTRACT.summary.node_count);
    assert.equal(parsed.summary.edge_count, CONTRACT.summary.edge_count);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
