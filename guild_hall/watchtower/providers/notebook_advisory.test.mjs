import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateTopologyProviderFragment } from "../topology_federation.mjs";
import {
  NOTEBOOK_ADVISORY_SOURCE_REFS,
  buildNotebookAdvisoryTopologyProvider,
} from "./notebook_advisory.mjs";

const EXPECTED_SOURCE_REFS = [
  ".workflow/dual_deep_research_v0/workflow.yaml",
  "docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md",
  "guild_hall/knowledge_access/notebooklm_bridge.mjs",
];

const EXPECTED_SOURCE_ANCHORS = {
  ".workflow/dual_deep_research_v0/workflow.yaml": [
    "workflow_id: dual_deep_research_v0",
    "notebooklm_output_is_advisory: true",
    "handoff_is_not_registration: true",
  ],
  "docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md": [
    "# NOTEBOOKLM_MCP_SETUP_V0",
    "advisory research surface",
    "public canon 에 복사하려면 먼저",
  ],
  "guild_hall/knowledge_access/notebooklm_bridge.mjs": [
    "soulforge.notebooklm_metadata_bridge_import.v0",
    "metadata_only: true",
    "notebooklm_advisory_only: true",
  ],
};

function readSources(order = EXPECTED_SOURCE_REFS) {
  return Object.fromEntries(order.map((ref) => [
    ref,
    readFileSync(new URL(`../../../${ref}`, import.meta.url)),
  ]));
}

function independentSourceSetDigest(sources) {
  const hash = createHash("sha256");
  for (const ref of Object.keys(sources).sort()) {
    const bytes = sources[ref];
    hash.update(Buffer.from(`${Buffer.byteLength(ref, "utf8")}:`, "utf8"));
    hash.update(Buffer.from(ref, "utf8"));
    hash.update(Buffer.from(`${bytes.length}:`, "utf8"));
    hash.update(bytes);
  }
  return hash.digest("hex");
}

test("provider binds exactly the three tracked public source buffers", () => {
  assert.deepEqual(NOTEBOOK_ADVISORY_SOURCE_REFS, EXPECTED_SOURCE_REFS);
  const sources = readSources();
  const provider = buildNotebookAdvisoryTopologyProvider(sources);

  assert.equal(provider.source.digest, independentSourceSetDigest(sources));
  assert.equal(provider.source.source_id, "watchtower_notebook_advisory_sources");
  assert.deepEqual(provider.nodes.map(({ id }) => id), [
    "advisory_boundary",
    "discovery_workflow",
    "human_review_handoff",
    "metadata_bridge",
  ]);
  assert.doesNotThrow(() => validateTopologyProviderFragment(provider));
});

test("provider is deterministic and insensitive to source object insertion order", () => {
  const forward = buildNotebookAdvisoryTopologyProvider(readSources());
  const reversed = buildNotebookAdvisoryTopologyProvider(readSources([...EXPECTED_SOURCE_REFS].reverse()));
  assert.deepEqual(reversed, forward);
});

test("provider remains HOLD, advisory-only, authority-free, and runtime-unknown", () => {
  const provider = buildNotebookAdvisoryTopologyProvider(readSources());

  assert.equal(provider.provider_id, "watchtower_notebook_advisory_adapter");
  assert.equal(provider.provider_kind, "advisory_workbench");
  assert.equal(provider.declared_status, "hold");
  assert.equal(provider.runtime_state, "unknown");
  assert.equal(provider.payload_state, "public_safe_contract");
  assert.deepEqual(provider.blocker_codes, ["canonical_provider_id_missing"]);
  assert.deepEqual(provider.authority_boundary, {
    source_truth: false,
    answer_authority: false,
    owner_approval_authority: false,
    runtime_mutation: false,
  });
  assert.equal(provider.capabilities.execute_repair, false);
  assert.deepEqual(provider.capabilities.propose_repair, []);
  assert.ok(provider.nodes.every(({ repair_state }) => repair_state === "none"));
  assert.ok(provider.edges.every(({ evidence_mode }) => evidence_mode === "structural_only"));

  const serialized = JSON.stringify(provider).toLowerCase();
  for (const forbidden of [
    "account_id", "answer_body", "api_endpoint", "credential", "live_query",
    "notebook_id", "notebook_membership", "private_payload", "raw_payload",
    "runtime_path", "session_id", "source_membership",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("provider refuses missing, additional, empty, or non-Buffer source inputs", () => {
  const sources = readSources();
  const missing = { ...sources };
  delete missing[EXPECTED_SOURCE_REFS[0]];
  assert.throws(
    () => buildNotebookAdvisoryTopologyProvider(missing),
    (error) => error?.code === "notebook_advisory_source_allowlist_mismatch",
  );

  assert.throws(
    () => buildNotebookAdvisoryTopologyProvider({ ...sources, "extra.md": Buffer.from("extra") }),
    (error) => error?.code === "notebook_advisory_source_allowlist_mismatch",
  );
  assert.throws(
    () => buildNotebookAdvisoryTopologyProvider({ ...sources, [EXPECTED_SOURCE_REFS[0]]: Buffer.alloc(0) }),
    (error) => error?.code === "notebook_advisory_source_bytes_invalid",
  );
  assert.throws(
    () => buildNotebookAdvisoryTopologyProvider({ ...sources, [EXPECTED_SOURCE_REFS[0]]: "not-bytes" }),
    (error) => error?.code === "notebook_advisory_source_bytes_invalid",
  );

  const symbolKey = { ...sources, [Symbol("unexpected")]: Buffer.from("unexpected") };
  assert.throws(
    () => buildNotebookAdvisoryTopologyProvider(symbolKey),
    (error) => error?.code === "notebook_advisory_source_allowlist_mismatch",
  );

  const accessor = { ...sources };
  Object.defineProperty(accessor, EXPECTED_SOURCE_REFS[0], { get: () => sources[EXPECTED_SOURCE_REFS[0]] });
  assert.throws(
    () => buildNotebookAdvisoryTopologyProvider(accessor),
    (error) => error?.code === "notebook_advisory_source_bytes_invalid",
  );
});

test("provider fails closed when any source contract anchor is removed", () => {
  const sources = readSources();
  for (const [ref, anchors] of Object.entries(EXPECTED_SOURCE_ANCHORS)) {
    for (const anchor of anchors) {
      const text = sources[ref].toString("utf8");
      assert.equal(text.includes(anchor), true, `${ref}:${anchor}`);
      const mutated = {
        ...sources,
        [ref]: Buffer.from(text.replace(anchor, "_".repeat(anchor.length)), "utf8"),
      };
      assert.throws(
        () => buildNotebookAdvisoryTopologyProvider(mutated),
        (error) => error?.code === "notebook_advisory_source_anchor_missing",
        `${ref}:${anchor}`,
      );
    }
  }
});

test("provider rejects random or source-swapped bytes even when the allowlist keys are present", () => {
  const sources = readSources();
  for (const ref of EXPECTED_SOURCE_REFS) {
    assert.throws(
      () => buildNotebookAdvisoryTopologyProvider({ ...sources, [ref]: Buffer.from("random public bytes") }),
      (error) => error?.code === "notebook_advisory_source_anchor_missing",
      ref,
    );
  }

  const swapped = {
    ...sources,
    [EXPECTED_SOURCE_REFS[0]]: sources[EXPECTED_SOURCE_REFS[1]],
    [EXPECTED_SOURCE_REFS[1]]: sources[EXPECTED_SOURCE_REFS[0]],
  };
  assert.throws(
    () => buildNotebookAdvisoryTopologyProvider(swapped),
    (error) => error?.code === "notebook_advisory_source_anchor_missing",
  );
});

test("every allowlisted byte mutation changes the source-set digest", () => {
  const baselineSources = readSources();
  const baseline = buildNotebookAdvisoryTopologyProvider(baselineSources);

  for (const ref of EXPECTED_SOURCE_REFS) {
    const mutated = {
      ...baselineSources,
      [ref]: Buffer.concat([baselineSources[ref], Buffer.from("\nsource-byte-mutation", "utf8")]),
    };
    const changed = buildNotebookAdvisoryTopologyProvider(mutated);
    assert.notEqual(changed.source.digest, baseline.source.digest, ref);
    assert.deepEqual(changed.nodes, baseline.nodes);
    assert.deepEqual(changed.edges, baseline.edges);
  }
});

test("federation validator still rejects authority and forbidden-field mutations", () => {
  const provider = buildNotebookAdvisoryTopologyProvider(readSources());
  const authorityMutation = structuredClone(provider);
  authorityMutation.authority_boundary.owner_approval_authority = true;
  assert.throws(() => validateTopologyProviderFragment(authorityMutation));

  const payloadMutation = structuredClone(provider);
  payloadMutation.nodes[0].answer_body = "forbidden";
  assert.throws(() => validateTopologyProviderFragment(payloadMutation));

  assert.doesNotThrow(() => validateTopologyProviderFragment(provider));
});
