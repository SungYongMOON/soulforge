import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION,
  AX_TOPOLOGY_FEDERATION_SCHEMA_VERSION,
  validateTopologyProviderFragment,
  composeFederatedTopology,
  reconcileTopologySets,
  canonicalStringify,
  topologyDigest,
} from "./topology_federation.mjs";

function fragment(overrides = {}) {
  const base = {
    schema_version: AX_TOPOLOGY_PROVIDER_SCHEMA_VERSION,
    provider_id: "synthetic_provider",
    provider_kind: "platform",
    label: "Synthetic topology provider",
    source: {
      source_id: "synthetic_topology_source",
      schema_version: "synthetic_topology.v1",
      revision: "synthetic_revision.v1",
      digest: "a".repeat(64),
    },
    declared_status: "active",
    validation: {
      validator_id: "validate.synthetic_topology",
      state: "passed",
      evidence_ref: "docs/architecture/workspace/examples/synthetic_topology.json",
      source_commit: null,
    },
    capabilities: {
      observe: ["topology_structure"],
      diagnose: ["declared_observed_diff"],
      propose_repair: ["repair_candidate"],
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
    blocker_codes: [],
    nodes: [
      {
        id: "root",
        label: "Synthetic root",
        kind: "provider",
        layer: "subsystem",
        parent_id: null,
        group: "Synthetic",
        diagnostic_state: "validator_backed",
        repair_state: "candidate_only",
      },
      {
        id: "worker",
        label: "Synthetic worker",
        kind: "worker",
        layer: "module",
        parent_id: "root",
        group: "Synthetic",
        diagnostic_state: "structural",
        repair_state: "none",
      },
    ],
    edges: [
      {
        id: "root_contains_worker",
        from: "root",
        to: "worker",
        label: "contains",
        relation: "contains",
        layer: "module",
        evidence_mode: "structural_only",
      },
    ],
  };
  return { ...base, ...overrides };
}

function clone(value) {
  return structuredClone(value);
}

test("provider schema is strict and the pure validator normalises set-valued fields", () => {
  const schema = JSON.parse(readFileSync(new URL("./topology_federation.v1.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.source.additionalProperties, false);
  assert.equal(schema.$defs.node.additionalProperties, false);
  assert.equal(schema.$defs.edge.additionalProperties, false);

  const input = fragment({
    blocker_codes: ["z_blocker", "a_blocker"],
    capabilities: {
      observe: ["z_observation", "a_observation"],
      diagnose: ["z_diagnostic", "a_diagnostic"],
      propose_repair: ["z_candidate", "a_candidate"],
      execute_repair: false,
    },
    nodes: [...fragment().nodes].reverse(),
  });
  const validated = validateTopologyProviderFragment(input);
  assert.deepEqual(validated.blocker_codes, ["a_blocker", "z_blocker"]);
  assert.deepEqual(validated.capabilities.observe, ["a_observation", "z_observation"]);
  assert.deepEqual(validated.nodes.map(({ id }) => id), ["root", "worker"]);
});

test("federation is deterministic, namespaced, and sensitive to nested mutations", () => {
  const one = fragment();
  const two = fragment({
    provider_id: "second_provider",
    provider_kind: "domain_engine",
    label: "Second provider",
    source: { ...fragment().source, source_id: "second_topology_source", digest: "b".repeat(64) },
  });
  const forward = composeFederatedTopology([one, two]);
  const reversed = composeFederatedTopology([
    { ...two, nodes: [...two.nodes].reverse(), edges: [...two.edges].reverse() },
    { ...one, nodes: [...one.nodes].reverse(), edges: [...one.edges].reverse() },
  ]);
  assert.equal(forward.schema_version, AX_TOPOLOGY_FEDERATION_SCHEMA_VERSION);
  assert.equal(canonicalStringify(forward), canonicalStringify(reversed));
  assert.equal(forward.topology_digest, reversed.topology_digest);
  assert.equal(forward.summary.provider_count, 2);
  assert.ok(forward.nodes.every(({ id, provider_id }) => id.startsWith(`${provider_id}::`)));

  const mutated = clone(one);
  mutated.nodes[1].label = "Mutated worker";
  assert.notEqual(composeFederatedTopology([mutated, two]).topology_digest, forward.topology_digest);
});

test("provider validation rejects authority, payload, path, identifier, graph, and runtime-state attacks", () => {
  const cases = [];

  const authority = clone(fragment());
  authority.authority_boundary.owner_approval_authority = true;
  cases.push(authority);

  const repair = clone(fragment());
  repair.capabilities.execute_repair = true;
  cases.push(repair);

  const unsafePath = clone(fragment());
  unsafePath.label = ["C", ":", "\\", "private", "payload"].join("");
  cases.push(unsafePath);

  const embeddedWindowsPath = clone(fragment());
  embeddedWindowsPath.label = ["See ", "C", ":", "\\", "Users", "\\", "payload"].join("");
  cases.push(embeddedWindowsPath);

  for (const root of ["tmp", "root", "Volumes"]) {
    const embeddedPosixPath = clone(fragment());
    embeddedPosixPath.label = ["See ", "/", root, "/", "payload"].join("");
    cases.push(embeddedPosixPath);
  }

  const projectIdentifier = clone(fragment());
  projectIdentifier.nodes[0].label = ["P", "12", "-", "345"].join("");
  cases.push(projectIdentifier);

  const payloadKey = clone(fragment());
  payloadKey.nodes[0].answer_body = "not allowed";
  cases.push(payloadKey);

  const health = clone(fragment());
  health.edges[0].health = "ok";
  cases.push(health);

  const dangling = clone(fragment());
  dangling.edges[0].to = "missing";
  cases.push(dangling);

  const duplicate = clone(fragment());
  duplicate.nodes.push(clone(duplicate.nodes[0]));
  cases.push(duplicate);

  const cycle = clone(fragment());
  cycle.nodes[0].parent_id = "worker";
  cases.push(cycle);

  const secret = clone(fragment());
  secret.label = ["api", "_key", "=", "value"].join("");
  cases.push(secret);

  for (const candidate of cases) assert.throws(() => validateTopologyProviderFragment(candidate));
  assert.doesNotThrow(() => validateTopologyProviderFragment(fragment()));
});

test("federation refuses duplicate provider and source ownership", () => {
  assert.throws(
    () => composeFederatedTopology([fragment(), fragment()]),
    (error) => error?.code === "topology_federation_provider_duplicate",
  );
  assert.throws(
    () => composeFederatedTopology([
      fragment(),
      fragment({ provider_id: "other_provider" }),
    ]),
    (error) => error?.code === "topology_federation_source_duplicate",
  );
});

test("declared versus observed reconciliation exposes exact drift without claiming runtime truth", () => {
  const declared = {
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "b", flow: "data", label: "declared" }],
  };
  const observed = {
    nodes: [{ id: "a", label: "A changed" }, { id: "c", label: "C" }],
    edges: [{ from: "a", to: "c", flow: "data", label: "observed" }],
  };
  const result = reconcileTopologySets(declared, observed);
  assert.equal(result.drift, true);
  assert.deepEqual(result.nodes.declared_only, ["b"]);
  assert.deepEqual(result.nodes.observed_only, ["c"]);
  assert.deepEqual(result.nodes.changed.map(({ id }) => id), ["a"]);
  assert.equal(result.edges.declared_only.length, 1);
  assert.equal(result.edges.observed_only.length, 1);
  assert.match(result.declared_digest, /^[a-f0-9]{64}$/);
  assert.notEqual(result.declared_digest, result.observed_digest);
});

test("canonical hashing covers nested keys and rejects non-JSON values", () => {
  const left = { z: [{ b: 2, a: 1 }], a: true };
  const right = { a: true, z: [{ a: 1, b: 2 }] };
  assert.equal(canonicalStringify(left), canonicalStringify(right));
  assert.equal(topologyDigest(left), topologyDigest(right));
  assert.notEqual(topologyDigest(left), topologyDigest({ ...right, z: [{ a: 1, b: 3 }] }));
  assert.throws(() => canonicalStringify({ invalid: undefined }));

  const ordinary = JSON.parse('{"id":"a"}');
  const specialKey = JSON.parse('{"id":"a","__proto__":{"polluted":true}}');
  assert.notEqual(topologyDigest(ordinary), topologyDigest(specialKey));
  const reconciliation = reconcileTopologySets(
    { nodes: [ordinary], edges: [] },
    { nodes: [specialKey], edges: [] },
  );
  assert.equal(reconciliation.drift, true);
  assert.deepEqual(reconciliation.nodes.changed.map(({ id }) => id), ["a"]);
});
