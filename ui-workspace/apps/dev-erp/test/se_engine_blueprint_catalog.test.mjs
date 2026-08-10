import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SE_ENGINE_BLUEPRINT_CATALOG,
  SE_ENGINE_BLUEPRINT_CLAIM_CEILINGS,
  SE_ENGINE_BLUEPRINT_COMMON_CONTRACT_TABLE,
  SE_ENGINE_BLUEPRINT_CATALOG_REVISION,
  SE_ENGINE_BLUEPRINT_GATE_SEQUENCE,
  SE_ENGINE_BLUEPRINT_PLAN_REVISION,
  SE_ENGINE_BLUEPRINT_SCHEMA,
  createSeEngineBlueprintCatalog,
  validateSeEngineBlueprintCatalog
} from "../src/se_engine_blueprint_catalog.mjs";

function cloneCatalog() {
  return structuredClone(SE_ENGINE_BLUEPRINT_CATALOG);
}

function expectCode(mutator, expectedCode) {
  const candidate = cloneCatalog();
  mutator(candidate);
  assert.throws(
    () => validateSeEngineBlueprintCatalog(candidate),
    (error) => {
      assert.equal(error?.code, expectedCode);
      return true;
    }
  );
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertPrerequisiteDag(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const state = new Map();
  function visit(nodeId) {
    assert.notEqual(state.get(nodeId), "visiting", `prerequisite cycle at ${nodeId}`);
    if (state.get(nodeId) === "visited") return;
    state.set(nodeId, "visiting");
    for (const prerequisite of byId.get(nodeId).prerequisite_node_refs) visit(prerequisite);
    state.set(nodeId, "visited");
  }
  for (const node of nodes) visit(node.id);
}

async function listPublicCodeFiles(root) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "coverage"].includes(entry.name)) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (/\.(?:cjs|js|mjs|ts|tsx)$/u.test(entry.name)) {
        files.push(entryPath);
      }
    }
  }
  await walk(root);
  return files;
}

test("SE-BLUEPRINT-001 validates the bounded data-only V1.2 candidate", () => {
  const catalog = createSeEngineBlueprintCatalog();

  assert.equal(catalog.schema_version, SE_ENGINE_BLUEPRINT_SCHEMA);
  assert.equal(catalog.plan_revision, SE_ENGINE_BLUEPRINT_PLAN_REVISION);
  assert.equal(catalog.catalog_revision, SE_ENGINE_BLUEPRINT_CATALOG_REVISION);
  assert.equal(catalog.catalog_state, "candidate");
  assert.equal(catalog.claim_ceiling, "observed");
  assert.ok(SE_ENGINE_BLUEPRINT_CLAIM_CEILINGS.includes("unknown"));
  assert.deepEqual(
    catalog.common_contract_table.map((row) => row.contract_id),
    ["id", "owner", "node", "edge", "status", "gate"]
  );
  assert.deepEqual(
    catalog.gate_sequence.map((gate) => [gate.order, gate.gate_id, gate.node_id]),
    [
      [5, "p5_context_acceptance", "p5_human_acceptance"],
      [6, "p6_candidate_generation", "p6_task_intent_candidate"],
      [7, "p7_task_driver_acceptance", "p7_task_driver"],
      [8, "p8_atomic_erp_write", "p8_sole_erp_writer"]
    ]
  );
  assert.equal(catalog.source_authority.claim_ceiling, "observed");
  assert.equal(catalog.source_authority.lower_source_may_override_higher, false);
  assert.equal(catalog.source_authority.normative_force_and_applicability_remain_distinct, true);
  assert.ok(catalog.nodes.every((node) => node.implementation_view === "TARGET"));
  assert.ok(catalog.nodes.every((node) => node.lifecycle_status === "candidate"));
  assert.ok(catalog.edges.every((edge) => edge.relation_state === "candidate"));
  assert.ok(catalog.edges.every((edge) => edge.relation_lifecycle === "active"));
  assert.ok(catalog.edges.every((edge) => edge.directed === true));
  assert.ok(catalog.edges.every((edge) => edge.claim_ceiling === "observed"));
  assert.ok(catalog.edges.every((edge) => edge.source_refs.length > 0));
  assert.ok(catalog.edges.every((edge) => edge.does_not_prove.includes("owner_approval")));
  assert.ok(!catalog.nodes.some((node) => ["engineering_navigator", "ax_cep_topology_view"].includes(node.id)));
  assert.ok(catalog.nodes.every((node) => !("col" in node) && !("row" in node) && !("presentation_readiness" in node)));
  assert.deepEqual(catalog.boundaries, {
    metadata_only: true,
    structural_catalog_only: true,
    generated_view_is_not_authority: true,
    actual_project_data_included: false,
    raw_payload_included: false,
    private_path_included: false,
    secret_included: false,
    ui_integration: false,
    runtime_activation: false,
    writer_activation: false,
    ai_official_approval_allowed: false,
    ai_baseline_change_allowed: false,
    ai_external_commitment_allowed: false,
    p8_is_only_erp_writer: true
  });

  for (const snapshotId of ["project_state_snapshot", "project_state_snapshot_next"]) {
    const snapshot = catalog.nodes.find((node) => node.id === snapshotId);
    assert.ok(snapshot);
    assert.deepEqual(new Set(snapshot.required_contract_fields), new Set([
      "snapshot_id", "project_code", "typed_ref", "revision_id", "accepted_context_generation",
      "valid_at", "known_at", "exact_source_artifact_revision_hash_refs", "state_axes",
      "evidence_lineage", "claim_ceiling", "deterministic_replay_fingerprint",
      "prior_snapshot_ref", "prior_snapshot_diff"
    ]));
    assert.deepEqual(snapshot.forbidden_contract_fields, ["as_of"]);
  }

  const p5 = catalog.nodes.find((node) => node.id === "p5_human_acceptance");
  assert.equal(p5.entity_ref.owner_surface, "owner_scope:registered_human_authority");
  assert.equal(p5.claim_ceiling, "observed");
  assert.deepEqual(
    catalog.nodes.filter((node) => node.role === "writer").map((node) => node.id),
    ["p8_sole_erp_writer"]
  );
  assertPrerequisiteDag(catalog.nodes);
  assert.ok(Object.isFrozen(SE_ENGINE_BLUEPRINT_CATALOG));
  assert.ok(Object.isFrozen(SE_ENGINE_BLUEPRINT_COMMON_CONTRACT_TABLE));
  assert.ok(Object.isFrozen(SE_ENGINE_BLUEPRINT_GATE_SEQUENCE));
});

test("SE-BLUEPRINT-002 normalization is deterministic for nested sets and object key order", () => {
  const baseline = createSeEngineBlueprintCatalog();
  const scrambled = cloneCatalog();
  scrambled.status_contract.implementation_view_values.reverse();
  scrambled.status_contract.lifecycle_values.reverse();
  scrambled.status_contract.claim_ceiling_values.reverse();
  scrambled.non_claims.reverse();
  scrambled.common_contract_table.reverse();
  for (const row of scrambled.common_contract_table) {
    row.required_fields.reverse();
    row.rules.reverse();
    row.forbidden.reverse();
  }
  scrambled.gate_sequence.reverse();
  for (const gate of scrambled.gate_sequence) {
    gate.requires.reverse();
    gate.unlocks.reverse();
  }
  scrambled.nodes.reverse();
  for (const node of scrambled.nodes) {
    node.authority_owner_refs.reverse();
    node.evidence_refs.reverse();
    node.required_contract_fields.reverse();
    node.forbidden_contract_fields.reverse();
    node.prerequisite_node_refs.reverse();
  }
  scrambled.edges.reverse();
  for (const edge of scrambled.edges) {
    edge.source_refs.reverse();
    edge.proves.reverse();
    edge.does_not_prove.reverse();
    edge.gate_refs.reverse();
  }
  const reordered = Object.fromEntries(Object.entries(scrambled).reverse());
  reordered.status_contract = Object.fromEntries(Object.entries(reordered.status_contract).reverse());
  reordered.nodes = reordered.nodes.map((node) => Object.fromEntries(Object.entries(node).reverse()));
  reordered.edges = reordered.edges.map((edge) => Object.fromEntries(Object.entries(edge).reverse()));
  const before = structuredClone(reordered);

  const normalized = validateSeEngineBlueprintCatalog(reordered);

  assert.deepEqual(reordered, before);
  assert.deepEqual(normalized, baseline);
  assert.equal(stableHash(normalized), stableHash(baseline));
});

test("SE-BLUEPRINT-003 factory returns isolated mutable copies", () => {
  const first = createSeEngineBlueprintCatalog();
  const second = createSeEngineBlueprintCatalog();
  first.nodes[0].label = "changed locally";
  first.gate_sequence[0].requires.push("changed_locally");
  assert.notEqual(first.nodes[0].label, second.nodes[0].label);
  assert.notDeepEqual(first.gate_sequence[0].requires, second.gate_sequence[0].requires);
  assert.deepEqual(second, createSeEngineBlueprintCatalog());
});

test("SE-BLUEPRINT-004 exact shapes fail closed", async (t) => {
  await t.test("root extra key", () => {
    expectCode((catalog) => { catalog.extra = true; }, "blueprint_root_shape_invalid");
  });
  await t.test("node extra key", () => {
    expectCode((catalog) => { catalog.nodes[0].extra = true; }, "blueprint_node_shape_invalid");
  });
  await t.test("edge extra key", () => {
    expectCode((catalog) => { catalog.edges[0].extra = true; }, "blueprint_edge_shape_invalid");
  });
  for (const revision of [
    "token_sk_live_abcdef123456",
    "credential_private_value",
    "cookie_session_value",
    "password_hidden_value"
  ]) {
    await t.test(`catalog revision is pinned: ${revision}`, () => {
      expectCode((catalog) => { catalog.catalog_revision = revision; }, "blueprint_root_value_invalid");
    });
  }
});

test("SE-BLUEPRINT-005 graph identity, relation state, and protected transitions fail closed", async (t) => {
  await t.test("duplicate node", () => {
    expectCode((catalog) => { catalog.nodes.push(structuredClone(catalog.nodes[0])); }, "blueprint_node_duplicate");
  });
  await t.test("dangling endpoint", () => {
    expectCode((catalog) => { catalog.edges[0].to_ref.entity_id = "missing_node"; }, "blueprint_edge_invalid");
  });
  await t.test("self loop", () => {
    expectCode((catalog) => { catalog.edges[0].to_ref = structuredClone(catalog.edges[0].from_ref); }, "blueprint_edge_invalid");
  });
  await t.test("unknown relation", () => {
    expectCode((catalog) => { catalog.edges[0].relation_type = "executes"; }, "blueprint_edge_invalid");
  });
  await t.test("relation promoted to confirmed", () => {
    expectCode((catalog) => { catalog.edges[0].relation_state = "confirmed"; }, "blueprint_edge_invalid");
  });
  await t.test("safe endpoint rewire", () => {
    expectCode((catalog) => {
      const source = catalog.nodes.find((node) => node.id === "rag_evidence").entity_ref;
      catalog.edges[0].from_ref = structuredClone(source);
    }, "blueprint_edge_definition_invalid");
  });
  await t.test("protected gate refs removed", () => {
    expectCode((catalog) => {
      catalog.edges.find((edge) => edge.id === "edge_p7_produces_p8").gate_refs = [];
    }, "blueprint_edge_definition_invalid");
  });
});

test("SE-BLUEPRINT-006 every text surface rejects private, actual-project, and secret-like material", async (t) => {
  for (const [name, mutate] of [
    ["absolute path ref", (catalog) => { catalog.nodes[0].evidence_refs = ["~/private/source.md"]; }],
    ["workspace payload ref", (catalog) => { catalog.nodes[0].evidence_refs = ["_workspaces/system/source.md"]; }],
    ["private metadata in rule", (catalog) => { catalog.common_contract_table[0].rules = ["read _workmeta/system/source.md"]; }],
    ["actual project in label", (catalog) => { catalog.nodes[0].label = "P99-999 source"; }],
    ["absolute path in note", (catalog) => { catalog.nodes[0].boundary_note = "use ~/private/source.md"; }],
    ["secret assignment in edge", (catalog) => { catalog.edges[0].label = "token=synthetic_value"; }]
  ]) {
    await t.test(name, () => expectCode(mutate, "blueprint_unsafe_text"));
  }
});

test("SE-BLUEPRINT-007 runtime keys, cyclic input, and unsupported promotions fail closed", async (t) => {
  await t.test("runtime field", () => {
    expectCode((catalog) => { catalog.nodes[0].health = "ok"; }, "blueprint_forbidden_runtime_field");
  });
  await t.test("legacy as_of field", () => {
    expectCode((catalog) => { catalog.nodes[0].as_of = "2026-08-09"; }, "blueprint_forbidden_runtime_field");
  });
  await t.test("cyclic object input", () => {
    expectCode((catalog) => { catalog.nodes[0].loop = catalog; }, "blueprint_cyclic_input");
  });
  await t.test("candidate promoted to current", () => {
    expectCode((catalog) => { catalog.nodes[0].implementation_view = "CURRENT"; }, "blueprint_candidate_status_boundary");
  });
  await t.test("claim promoted to canon", () => {
    expectCode((catalog) => { catalog.nodes[0].claim_ceiling = "canon_entry"; }, "blueprint_node_definition_invalid");
  });
  await t.test("generated catalog promoted to authority", () => {
    expectCode((catalog) => { catalog.boundaries.generated_view_is_not_authority = false; }, "blueprint_boundary_invalid");
  });
});

test("SE-BLUEPRINT-008 source precedence and authority owners are literal", async (t) => {
  await t.test("source precedence reversal", () => {
    expectCode((catalog) => { catalog.source_authority.ordered_source_families.reverse(); }, "blueprint_source_authority_invalid");
  });
  await t.test("P5 owner changed to AI", () => {
    expectCode((catalog) => {
      const p5 = catalog.nodes.find((node) => node.id === "p5_human_acceptance");
      p5.entity_ref.owner_surface = "owner_scope:ai_approver";
      p5.authority_owner_refs = ["owner_scope:ai_approver"];
    }, "blueprint_node_definition_invalid");
  });
  await t.test("P8 writer owner changed", () => {
    expectCode((catalog) => {
      const p8 = catalog.nodes.find((node) => node.id === "p8_sole_erp_writer");
      p8.entity_ref.owner_surface = "owner_scope:alternate_writer";
      p8.authority_owner_refs = ["owner_scope:alternate_writer"];
    }, "blueprint_node_definition_invalid");
  });
});

test("SE-BLUEPRINT-009 complete P5-P8 gate tuples cannot be rewritten", async (t) => {
  for (const [name, mutate] of [
    ["P5 order", (gate) => { gate.order = 8; }],
    ["P5 node", (gate) => { gate.node_id = "p8_sole_erp_writer"; }],
    ["P5 receipt", (gate) => { gate.receipt = "erp_atomic_write_receipt"; }],
    ["P5 unlock", (gate) => { gate.unlocks = ["p8_sole_erp_writer"]; }],
    ["P5 stop condition", (gate) => { gate.stop_condition = "writer_not_authorized_or_not_sole"; }],
    ["P5 requirement", (gate) => { gate.requires = ["p8_sole_erp_writer"]; }]
  ]) {
    await t.test(name, () => {
      expectCode((catalog) => mutate(catalog.gate_sequence.find((gate) => gate.gate_id === "p5_context_acceptance")), "blueprint_gate_definition_invalid");
    });
  }
  await t.test("finding cannot jump directly to P6", () => {
    expectCode((catalog) => {
      const edge = catalog.edges.find((entry) => entry.id === "edge_disposition_produces_p6");
      edge.from_ref = structuredClone(catalog.nodes.find((node) => node.id === "gap_unknown_finding").entity_ref);
    }, "blueprint_gate_bypass");
  });
});

test("SE-BLUEPRINT-010 current and next accepted generations remain explicit and acyclic", () => {
  const catalog = createSeEngineBlueprintCatalog();
  const ids = new Set(catalog.nodes.map((node) => node.id));
  for (const id of [
    "accepted_context_generation_current", "project_state_snapshot", "gap_unknown_finding",
    "context_request_candidate", "context_exchange_receipts", "context_response_candidate",
    "p5_human_acceptance", "accepted_context_generation_next", "project_state_snapshot_next",
    "finding_disposition", "p6_task_intent_candidate", "p7_task_driver", "p8_sole_erp_writer"
  ]) assert.ok(ids.has(id), id);
  assertPrerequisiteDag(catalog.nodes);
  expectCode((candidate) => {
    candidate.nodes.find((node) => node.id === "project_state_snapshot").prerequisite_node_refs = ["p5_human_acceptance"];
  }, "blueprint_node_definition_invalid");
});

test("SE-BLUEPRINT-011 no public UI or runtime source imports the candidate", async () => {
  const testFile = fileURLToPath(import.meta.url);
  const moduleFile = fileURLToPath(new URL("../src/se_engine_blueprint_catalog.mjs", import.meta.url));
  const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const roots = [
    path.join(repoRoot, "guild_hall"),
    path.join(repoRoot, "ui-workspace", "apps", "dev-erp"),
    path.join(repoRoot, "ui-workspace", "apps", "team-ops-board")
  ];
  const moduleSource = await readFile(moduleFile, "utf8");
  assert.doesNotMatch(moduleSource, /^\s*import\s/mu);
  assert.doesNotMatch(moduleSource, /presentation_readiness|engineering_navigator|ax_cep_topology_view|\bcol:|\brow:/u);

  for (const root of roots) {
    for (const file of await listPublicCodeFiles(root)) {
      if (file === testFile || file === moduleFile) continue;
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, /se_engine_blueprint_catalog/u, file);
    }
  }
});
