import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { composeFederatedTopology } from "../../../../../guild_hall/watchtower/topology_federation.mjs";
import {
  TOPOLOGY_FEDERATION_DOES_NOT_PROVE,
  TOPOLOGY_FEDERATION_PROJECTION_SCHEMA,
  TOPOLOGY_FEDERATION_SNAPSHOT_PATH,
  createTopologyFederationAdapter,
  createTopologyFederationAdapterPlugin,
  validateFederatedTopologyArtifact,
} from "./topology-federation-adapter.mjs";

function syntheticFragment(providerId, overrides = {}) {
  return {
    schema_version: "soulforge.ax_topology.provider.v1",
    provider_id: providerId,
    provider_kind: "platform",
    label: `${providerId} declared topology`,
    source: {
      source_id: `${providerId}_source`,
      schema_version: "synthetic_topology.v1",
      revision: "synthetic.v1",
      digest: "a".repeat(64),
    },
    declared_status: "active",
    validation: {
      validator_id: `${providerId}_adapter.v1`,
      state: "passed",
      evidence_ref: "guild_hall/watchtower/topology.mjs",
      source_commit: null,
    },
    capabilities: {
      observe: ["declared_structure"],
      diagnose: ["structural_validation"],
      propose_repair: [],
      execute_repair: false,
    },
    authority_boundary: {
      source_truth: false,
      answer_authority: false,
      owner_approval_authority: false,
      runtime_mutation: false,
    },
    claim_ceiling: "observed",
    runtime_state: "unknown",
    payload_state: "public_safe_contract",
    blocker_codes: ["runtime_observation_absent"],
    nodes: [
      {
        id: "collector", label: "collector", kind: "worker", layer: "subsystem",
        parent_id: null, group: "collect", diagnostic_state: "validator_backed", repair_state: "none",
      },
      {
        id: "ledger", label: "ledger", kind: "store", layer: "subsystem",
        parent_id: null, group: "data", diagnostic_state: "structural", repair_state: "candidate_only",
      },
    ],
    edges: [
      {
        id: "edge.collector.ledger", from: "collector", to: "ledger", label: "append",
        relation: "data", layer: "subsystem", evidence_mode: "structural_only",
      },
    ],
    ...overrides,
  };
}

function syntheticArtifact(fragments = [syntheticFragment("alpha_provider"), syntheticFragment("beta_provider")]) {
  return composeFederatedTopology(fragments);
}

async function withArtifactFile(artifact, body) {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-federation-"));
  try {
    const artifactPath = join(directory, "federated_topology.v1.json");
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return await body(artifactPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readProjectionFor(artifact) {
  return withArtifactFile(artifact, (artifactPath) => (
    createTopologyFederationAdapter({ artifactPath }).readProjection()
  ));
}

test("tracked federation artifact loads from the fixed repo-relative path as a declared-structure projection", async () => {
  const projection = await createTopologyFederationAdapter().readProjection();
  assert.equal(projection.schema_version, TOPOLOGY_FEDERATION_PROJECTION_SCHEMA);
  assert.equal(projection.state, "ready");
  assert.equal(projection.reason, null);
  assert.equal(projection.lens, "declared_structure");
  assert.deepEqual(projection.does_not_prove, [...TOPOLOGY_FEDERATION_DOES_NOT_PROVE]);
  assert.equal(projection.snapshot.schema_version, "soulforge.ax_topology.federation.v1");
  assert.deepEqual(
    projection.snapshot.providers.map((provider) => provider.provider_id),
    [
      "engineering_engine",
      "knowledge_stack",
      "watchtower",
      "watchtower_notebook_advisory_adapter",
    ],
  );
  assert.equal(projection.snapshot.summary.runtime_authority, false);
  assert.equal(projection.snapshot.summary.repair_execution_authority, false);
  assert.equal(projection.snapshot.summary.node_count, projection.snapshot.nodes.length);
  assert.equal(projection.snapshot.summary.edge_count, projection.snapshot.edges.length);
});

test("declared-structure projection carries no absolute path, account, or project identifier", async () => {
  const serialized = JSON.stringify(await createTopologyFederationAdapter().readProjection());
  assert.doesNotMatch(serialized, /[A-Za-z]:\\\\/u);
  assert.doesNotMatch(serialized, /\/(?:home|Users|mnt|var|etc|opt|root)\//u);
  assert.doesNotMatch(serialized, /\b[^\s"@]+@[^\s"@]+\.[a-z]{2,}\b/u);
  assert.doesNotMatch(serialized, /(?:^|[^a-z0-9])[a-z]\d{2}[-_]\d{3}(?:[^a-z0-9]|$)/iu);
});

test("synthetic federation artifact validates and keeps namespaced flattened identity", () => {
  const artifact = syntheticArtifact();
  assert.equal(validateFederatedTopologyArtifact(artifact), artifact);
  assert.deepEqual(artifact.nodes.map((node) => node.id), [
    "alpha_provider::collector", "alpha_provider::ledger",
    "beta_provider::collector", "beta_provider::ledger",
  ]);
  assert.deepEqual(artifact.summary, {
    provider_count: 2, node_count: 4, edge_count: 2,
    runtime_authority: false, repair_execution_authority: false,
  });
});

test("a tampered topology digest is rejected instead of served", async () => {
  const artifact = { ...syntheticArtifact(), topology_digest: "b".repeat(64) };
  const projection = await readProjectionFor(artifact);
  assert.equal(projection.state, "unavailable");
  assert.equal(projection.reason, "topology_federation_digest_mismatch");
  assert.equal(projection.snapshot, null);
});

test("a tampered source-set digest is rejected", async () => {
  const artifact = { ...syntheticArtifact(), source_set_digest: "c".repeat(64) };
  const projection = await readProjectionFor(artifact);
  assert.equal(projection.state, "unavailable");
  assert.equal(projection.reason, "topology_federation_source_digest_mismatch");
});

test("a flattened node edited without touching digests is still rejected", async () => {
  const artifact = syntheticArtifact();
  const tampered = {
    ...artifact,
    nodes: artifact.nodes.map((node, index) => (
      index === 0 ? { ...node, label: "injected label" } : node
    )),
  };
  const projection = await readProjectionFor(tampered);
  assert.equal(projection.state, "unavailable");
  assert.equal(projection.reason, "topology_federation_projection_mismatch");
});

test("an invented flattened edge that no provider declares is rejected", async () => {
  const artifact = syntheticArtifact();
  const tampered = {
    ...artifact,
    edges: [...artifact.edges, {
      ...artifact.edges[0],
      id: "alpha_provider::edge.invented",
      to: "beta_provider::ledger",
      provider_id: "alpha_provider",
    }],
  };
  const projection = await readProjectionFor(tampered);
  assert.equal(projection.state, "unavailable");
  assert.equal(projection.reason, "topology_federation_projection_mismatch");
});

test("a provider fragment claiming repair execution or runtime mutation authority is rejected", async () => {
  const repairClaim = syntheticArtifact([
    syntheticFragment("alpha_provider", {
      capabilities: {
        observe: ["declared_structure"], diagnose: [], propose_repair: [], execute_repair: false,
      },
    }),
  ]);
  repairClaim.providers[0].capabilities.execute_repair = true;
  const repairProjection = await readProjectionFor(repairClaim);
  assert.equal(repairProjection.state, "unavailable");
  assert.equal(repairProjection.reason, "topology_provider_repair_execution_forbidden");

  const mutationClaim = syntheticArtifact();
  mutationClaim.providers[0].authority_boundary.runtime_mutation = true;
  const mutationProjection = await readProjectionFor(mutationClaim);
  assert.equal(mutationProjection.state, "unavailable");
  assert.equal(mutationProjection.reason, "topology_provider_authority_forbidden");
});

test("wrong schema version, projection kind, or extra root key fails closed", async () => {
  const wrongSchema = { ...syntheticArtifact(), schema_version: "soulforge.ax_topology.federation.v2" };
  assert.equal((await readProjectionFor(wrongSchema)).reason, "topology_federation_schema_invalid");

  const wrongKind = { ...syntheticArtifact(), projection_kind: "observed_runtime" };
  assert.equal((await readProjectionFor(wrongKind)).reason, "topology_federation_projection_kind_invalid");

  const extraKey = { ...syntheticArtifact(), health: { state: "ok" } };
  assert.equal((await readProjectionFor(extraKey)).reason, "topology_federation_shape_invalid");
});

test("a missing artifact fails closed with a safe reason code and no path leak", async () => {
  const adapter = createTopologyFederationAdapter({
    artifactPath: join(tmpdir(), "team-ops-federation-absent", "federated_topology.v1.json"),
  });
  const projection = await adapter.readProjection();
  assert.equal(projection.state, "unavailable");
  assert.equal(projection.reason, "topology_federation_unclassified");
  assert.equal(projection.snapshot, null);
  assert.doesNotMatch(JSON.stringify(projection), /team-ops-federation-absent/u);
});

test("unparsable artifact bytes fail closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-federation-broken-"));
  try {
    const artifactPath = join(directory, "federated_topology.v1.json");
    await writeFile(artifactPath, "{ not json", "utf8");
    const projection = await createTopologyFederationAdapter({ artifactPath }).readProjection();
    assert.equal(projection.state, "unavailable");
    assert.equal(projection.reason, "topology_federation_parse_failed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed re-read keeps the last validated structure explicitly stale, never current", async () => {
  const artifact = syntheticArtifact();
  let attempt = 0;
  const adapter = createTopologyFederationAdapter({
    readArtifact: async () => {
      attempt += 1;
      if (attempt === 1) return artifact;
      throw new Error("topology_federation_file_invalid");
    },
  });
  const first = await adapter.readProjection();
  assert.equal(first.state, "ready");
  const second = await adapter.readProjection();
  assert.equal(second.state, "stale");
  assert.equal(second.reason, "topology_federation_file_invalid");
  assert.equal(second.snapshot.topology_digest, artifact.topology_digest);
});

test("federation loopback plugin serves only local GET on its own path", async () => {
  const artifact = syntheticArtifact();
  let middleware;
  const plugin = createTopologyFederationAdapterPlugin({ readArtifact: async () => artifact });
  plugin.configureServer({ middlewares: { use: (handler) => { middleware = handler; } } });

  const request = {
    method: "GET",
    url: TOPOLOGY_FEDERATION_SNAPSHOT_PATH,
    socket: { remoteAddress: "127.0.0.1" },
  };
  const ok = await new Promise((resolve) => {
    const response = {
      statusCode: 0,
      headers: {},
      setHeader(key, value) { this.headers[key] = value; },
      end(body = "") { resolve({ statusCode: this.statusCode, headers: this.headers, body }); },
    };
    middleware(request, response, () => resolve({ next: true }));
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers["Cache-Control"], "no-store");
  assert.equal(ok.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(JSON.parse(ok.body).snapshot.topology_digest, artifact.topology_digest);

  const remote = await new Promise((resolve) => {
    const response = { statusCode: 0, setHeader() {}, end() { resolve(this.statusCode); } };
    middleware({ ...request, socket: { remoteAddress: "10.0.0.4" } }, response, () => resolve(0));
  });
  assert.equal(remote, 403);

  const method = await new Promise((resolve) => {
    const response = { statusCode: 0, setHeader() {}, end() { resolve(this.statusCode); } };
    middleware({ ...request, method: "POST" }, response, () => resolve(0));
  });
  assert.equal(method, 405);

  const other = await new Promise((resolve) => {
    const response = { statusCode: 0, setHeader() {}, end() { resolve("ended"); } };
    middleware({ ...request, url: "/topology-health.snapshot.json" }, response, () => resolve("next"));
  });
  assert.equal(other, "next");
});
