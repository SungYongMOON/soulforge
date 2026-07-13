import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMON_KNOWLEDGE_SCOPE_REF,
  ProjectRagMigrationDryRunError,
  RAG_MIGRATION_TARGET_OWNER_SURFACES,
  buildProjectRagMigrationDryRun,
} from "./project_rag_migration_dry_run.mjs";

const PROJECT_REF = Object.freeze({
  entity_type: "project",
  owner_surface: "dev_erp",
  entity_id: "P24-049",
});

const OTHER_PROJECT_REF = Object.freeze({
  entity_type: "project",
  owner_surface: "dev_erp",
  entity_id: "P25-050",
});

const SOURCE_REVISION_A = `sr_${"a".repeat(32)}`;
const SOURCE_REVISION_B = `sr_${"b".repeat(32)}`;
const CONTENT_A = `sha256:${"a".repeat(64)}`;
const CONTENT_B = `sha256:${"b".repeat(64)}`;

function projectRow(overrides = {}) {
  return {
    legacy_asset_ref: "_workspaces/knowledge/rag/indexes_local/ridx_001",
    asset_kind: "indexes_local",
    observed_scope_ref: PROJECT_REF,
    classification: "project",
    project_ref: PROJECT_REF,
    source_revision_id: SOURCE_REVISION_A,
    content_id: CONTENT_A,
    legacy_status: "active",
    current_owner_surface: "legacy_common_rag",
    target_owner_surface: RAG_MIGRATION_TARGET_OWNER_SURFACES.project,
    target_name: "ridx_001",
    inbound_consumers: ["consumer:dev_erp:task_context"],
    outbound_refs: ["lineage:source_revision:001"],
    collision_state: "clear",
    acl_state: "approved",
    rollback_source_ref: "rollback:legacy_source:001",
    rollback_reader_ref: "rollback:legacy_reader:v1",
    evidence_refs: ["evidence:inventory:001"],
    decision_or_blocker: null,
    claim_ceiling: "source_supported",
    ...overrides,
  };
}

function commonRow(overrides = {}) {
  return {
    legacy_asset_ref: "_workspaces/knowledge/rag/derived_text/common_001",
    asset_kind: "derived_text",
    observed_scope_ref: COMMON_KNOWLEDGE_SCOPE_REF,
    classification: "common",
    project_ref: null,
    source_revision_id: SOURCE_REVISION_B,
    content_id: CONTENT_B,
    legacy_status: "readable",
    current_owner_surface: "legacy_common_rag",
    target_owner_surface: RAG_MIGRATION_TARGET_OWNER_SURFACES.common,
    target_name: "common_001",
    inbound_consumers: ["consumer:common_search:v1"],
    outbound_refs: ["lineage:common_source:001"],
    collision_state: "clear",
    acl_state: "approved",
    rollback_source_ref: "rollback:common_source:001",
    rollback_reader_ref: "rollback:common_reader:v1",
    evidence_refs: ["evidence:inventory:common_001"],
    decision_or_blocker: null,
    claim_ceiling: "observed",
    ...overrides,
  };
}

function assertCode(fn, code) {
  assert.throws(
    fn,
    (error) => error instanceof ProjectRagMigrationDryRunError && error.code === code,
  );
}

test("happy project/common rows resolve only to locked owner targets and remain metadata-only", () => {
  const plan = buildProjectRagMigrationDryRun({ rows: [projectRow(), commonRow()] });
  assert.equal(plan.mode, "dry_run");
  assert.equal(plan.write_allowed, false);
  assert.equal(plan.plan_verdict, "ready");
  assert.match(plan.plan_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(plan.counts, {
    total: 2,
    project: 1,
    common: 1,
    unresolved: 0,
    conflict: 0,
    ready: 2,
    hold: 0,
  });
  assert.deepEqual(
    plan.rows.map((row) => row.legacy_asset_ref),
    [
      "_workspaces/knowledge/rag/derived_text/common_001",
      "_workspaces/knowledge/rag/indexes_local/ridx_001",
    ],
  );
  const common = plan.rows.find((row) => row.classification === "common");
  const project = plan.rows.find((row) => row.classification === "project");
  assert.equal(common.target_ref, "_workspaces/knowledge/rag/derived_text/common_001");
  assert.equal(
    project.target_ref,
    "_workspaces/P24-049/reference_payloads/rag/indexes_local/ridx_001",
  );
  assert.equal(common.verdict, "ready");
  assert.equal(project.verdict, "ready");
  assert.deepEqual(common.hold_reasons, []);
  assert.deepEqual(project.hold_reasons, []);
  assert.equal(JSON.stringify(plan).includes(["C", ":", "\\"].join("")), false);
  assert.equal(JSON.stringify(plan).includes("\\\\"), false);
  assert.equal(JSON.stringify(plan).includes("legacy_asset_collision_basis"), false);
});

test("nested target_path_segments resolve the exact immutable pilot artifact ref", () => {
  const plan = buildProjectRagMigrationDryRun({
    rows: [projectRow({
      target_name: "project_rag_index.v1.json",
      target_path_segments: [
        "ridx_0123456789abcdef0123456789abcdef",
        "project_rag_index.v1.json",
      ],
      target_content_id: CONTENT_B,
    })],
  });
  assert.equal(
    plan.rows[0].target_ref,
    "_workspaces/P24-049/reference_payloads/rag/indexes_local/"
      + "ridx_0123456789abcdef0123456789abcdef/project_rag_index.v1.json",
  );
  assert.equal(plan.rows[0].target_content_id, CONTENT_B);
});

test("nested target path must end with target_name and target digest must be canonical", () => {
  assertCode(
    () => buildProjectRagMigrationDryRun({
      rows: [projectRow({
        target_path_segments: ["ridx_001", "other.json"],
      })],
    }),
    "RAG_MIGRATION_TARGET_PATH_MISMATCH",
  );
  assertCode(
    () => buildProjectRagMigrationDryRun({
      rows: [projectRow({ target_content_id: "sha256:ABC" })],
    }),
    "RAG_MIGRATION_CONTENT_ID_INVALID",
  );
});

test("unresolved and conflict rows enumerate every bounded hold reason", () => {
  const unresolved = projectRow({
    legacy_asset_ref: "legacy:unresolved:001",
    observed_scope_ref: COMMON_KNOWLEDGE_SCOPE_REF,
    classification: "unresolved",
    project_ref: null,
    source_revision_id: null,
    content_id: null,
    legacy_status: "unknown",
    target_owner_surface: "unresolved_rag",
    inbound_consumers: [],
    outbound_refs: [],
    collision_state: "unknown",
    acl_state: "unknown",
    rollback_source_ref: null,
    rollback_reader_ref: null,
    evidence_refs: [],
    decision_or_blocker: null,
    claim_ceiling: "unknown",
  });
  const conflict = commonRow({
    legacy_asset_ref: "legacy:conflict:001",
    classification: "conflict",
    observed_scope_ref: PROJECT_REF,
    project_ref: PROJECT_REF,
    collision_state: "conflict",
    acl_state: "denied",
    legacy_status: "conflict",
    decision_or_blocker: "blocker:owner_scope_conflict:001",
    claim_ceiling: "rejected_or_blocked",
  });
  const plan = buildProjectRagMigrationDryRun({ rows: [unresolved, conflict] });
  const unresolvedResult = plan.rows.find((row) => row.classification === "unresolved");
  const conflictResult = plan.rows.find((row) => row.classification === "conflict");
  assert.equal(plan.counts.hold, 2);
  assert.equal(plan.plan_verdict, "hold");
  assert.equal(unresolvedResult.verdict, "hold");
  assert.deepEqual(unresolvedResult.hold_reasons, [
    "acl_state_unknown",
    "claim_ceiling_unknown",
    "classification_unresolved",
    "collision_state_unknown",
    "content_id_missing",
    "decision_or_blocker_missing",
    "evidence_refs_missing",
    "inbound_consumers_missing",
    "legacy_status_not_ready",
    "lineage_refs_missing",
    "rollback_reader_ref_missing",
    "rollback_source_ref_missing",
    "source_revision_id_missing",
  ]);
  assert.equal(conflictResult.verdict, "hold");
  for (const reason of [
    "classification_conflict",
    "collision_state_conflict",
    "acl_state_denied",
    "legacy_status_not_ready",
    "claim_rejected_or_blocked",
  ]) {
    assert.equal(conflictResult.hold_reasons.includes(reason), true, reason);
  }
  assert.equal(unresolvedResult.target_ref, null);
  assert.equal(conflictResult.target_ref, null);
});

test("missing lineage, rollback, ACL, and consumer evidence are holds rather than implicit approval", () => {
  const cases = [
    ["source_revision_id", null, "source_revision_id_missing"],
    ["content_id", null, "content_id_missing"],
    ["rollback_source_ref", null, "rollback_source_ref_missing"],
    ["rollback_reader_ref", null, "rollback_reader_ref_missing"],
    ["acl_state", "unknown", "acl_state_unknown"],
    ["inbound_consumers", [], "inbound_consumers_missing"],
    ["outbound_refs", [], "lineage_refs_missing"],
    ["evidence_refs", [], "evidence_refs_missing"],
  ];
  for (const [field, value, reason] of cases) {
    const plan = buildProjectRagMigrationDryRun({ rows: [projectRow({ [field]: value })] });
    assert.equal(plan.rows[0].verdict, "hold", field);
    assert.equal(plan.rows[0].hold_reasons.includes(reason), true, field);
  }
});

test("row order, semantic-set order, and identical duplicates preserve byte-stable output", () => {
  const project = projectRow({
    inbound_consumers: ["consumer:z", "consumer:a", "consumer:a"],
    outbound_refs: ["lineage:z", "lineage:a"],
  });
  const common = commonRow();
  const first = buildProjectRagMigrationDryRun({ rows: [project, common] });
  const second = buildProjectRagMigrationDryRun({
    rows: [
      { ...common },
      {
        ...project,
        inbound_consumers: ["consumer:a", "consumer:z"],
        outbound_refs: ["lineage:a", "lineage:z", "lineage:a"],
      },
      project,
    ],
  });
  assert.deepEqual(second, first);
  assert.equal(second.plan_digest, first.plan_digest);
});

test("different rows sharing one legacy_asset_ref fail as a duplicate conflict", () => {
  const row = projectRow();
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [row, { ...row, content_id: CONTENT_B }],
      }),
    "RAG_MIGRATION_DUPLICATE_CONFLICT",
  );
});

test("raw/secret/unknown fields and absolute private paths fail closed", () => {
  assertCode(
    () => buildProjectRagMigrationDryRun({ rows: [{ ...projectRow(), body: "payload" }] }),
    "RAG_MIGRATION_FORBIDDEN_FIELD",
  );
  assertCode(
    () => buildProjectRagMigrationDryRun({ rows: [{ ...projectRow(), unexpected: "x" }] }),
    "RAG_MIGRATION_UNKNOWN_FIELD",
  );
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [projectRow({ evidence_refs: ["raw source body text"] })],
      }),
    "RAG_MIGRATION_REF_INVALID",
  );
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [projectRow({ decision_or_blocker: "authorization: Bearer_example" })],
      }),
    "RAG_MIGRATION_SECRET_VALUE_BLOCKED",
  );
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [projectRow({
          legacy_asset_ref: ["C:", "private", "rag", "index.json"].join("\\"),
        })],
      }),
    "RAG_MIGRATION_ABSOLUTE_PATH_BLOCKED",
  );
});

test("file/data URIs and representative synthetic secret shapes fail closed", () => {
  for (const legacyAssetRef of [
    "file:/C:/synthetic/private/rag/index.json",
    "file:C:/synthetic/private/rag/index.json",
    "data:synthetic_payload",
  ]) {
    assertCode(
      () =>
        buildProjectRagMigrationDryRun({
          rows: [projectRow({ legacy_asset_ref: legacyAssetRef })],
        }),
      "RAG_MIGRATION_ABSOLUTE_PATH_BLOCKED",
    );
  }

  const syntheticSecretShapes = [
    `ghp_${"S".repeat(40)}`,
    `eyJ${"A".repeat(8)}.${"B".repeat(12)}.${"C".repeat(16)}`,
    `api_key_${"Z".repeat(24)}`,
  ];
  for (const syntheticRef of syntheticSecretShapes) {
    assertCode(
      () =>
        buildProjectRagMigrationDryRun({
          rows: [projectRow({ evidence_refs: [syntheticRef] })],
        }),
      "RAG_MIGRATION_SECRET_VALUE_BLOCKED",
    );
  }
});

test("path traversal, owner mismatch, and cross-project refs are rejected", () => {
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [projectRow({ target_name: "../escape" })],
      }),
    "RAG_MIGRATION_TARGET_NAME_INVALID",
  );
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [projectRow({ observed_scope_ref: OTHER_PROJECT_REF })],
      }),
    "RAG_MIGRATION_CROSS_PROJECT_REJECTED",
  );
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [
          projectRow({
            legacy_asset_ref:
              "_workspaces/P25-050/reference_payloads/rag/indexes_local/ridx_001",
          }),
        ],
      }),
    "RAG_MIGRATION_PATH_REJECTED",
  );
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [
          projectRow({
            legacy_asset_ref:
              "_workspaces/P25-050/reference_payloads/rag/indexes_local/ridx_001.",
          }),
        ],
      }),
    "RAG_MIGRATION_PATH_REJECTED",
  );
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [
          commonRow({
            legacy_asset_ref:
              "_workspaces/P24-049/reference_payloads/rag/derived_text/common_001",
          }),
        ],
      }),
    "RAG_MIGRATION_PATH_REJECTED",
  );
});

test("relation refs reject explicit foreign project bindings without substring false positives", () => {
  const foreignRefCases = [
    {
      inbound_consumers: [
        "_workspaces/P25-050/reference_payloads/rag/indexes_local/consumer.json",
      ],
    },
    { outbound_refs: ["lineage:P25-050:source_revision:001"] },
    { rollback_source_ref: "rollback:P25-050:source:001" },
    { rollback_reader_ref: "rollback:P25-050:reader:v1" },
    { evidence_refs: ["evidence:P25-050:inventory:001"] },
    { decision_or_blocker: "decision:P25-050:approved:001" },
  ];
  for (const overrides of foreignRefCases) {
    assertCode(
      () => buildProjectRagMigrationDryRun({ rows: [projectRow(overrides)] }),
      "RAG_MIGRATION_CROSS_PROJECT_REJECTED",
    );
  }

  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [commonRow({ evidence_refs: ["evidence:P24-049:inventory:001"] })],
      }),
    "RAG_MIGRATION_CROSS_PROJECT_REJECTED",
  );

  const ownProject = buildProjectRagMigrationDryRun({
    rows: [
      projectRow({
        inbound_consumers: [
          "_workspaces/P24-049/reference_payloads/rag/indexes_local/consumer.json",
        ],
        outbound_refs: ["lineage:P24-049:source_revision:001"],
      }),
    ],
  });
  assert.equal(ownProject.rows[0].verdict, "ready");

  const incidentalSubstring = buildProjectRagMigrationDryRun({
    rows: [projectRow({ inbound_consumers: ["consumer:fooP25-050bar"] })],
  });
  assert.equal(incidentalSubstring.rows[0].verdict, "ready");
});

test("project rows without an exact project ref remain on hold and cannot obtain a target", () => {
  const plan = buildProjectRagMigrationDryRun({
    rows: [projectRow({ project_ref: null })],
  });
  assert.equal(plan.rows[0].target_ref, null);
  assert.equal(plan.rows[0].verdict, "hold");
  assert.equal(plan.rows[0].hold_reasons.includes("project_ref_missing"), true);
  assert.equal(plan.rows[0].hold_reasons.includes("target_ref_unresolved"), true);
});

test("declared and derived target collisions hold every affected row", () => {
  const declared = projectRow({ collision_state: "conflict" });
  const collidingA = projectRow({
    legacy_asset_ref: "legacy:index:a",
    target_name: "Shared_Index",
  });
  const collidingB = projectRow({
    legacy_asset_ref: "legacy:index:b",
    source_revision_id: SOURCE_REVISION_B,
    content_id: CONTENT_B,
    target_name: "shared_index",
  });
  const plan = buildProjectRagMigrationDryRun({ rows: [declared, collidingA, collidingB] });
  const declaredResult = plan.rows.find(
    (row) => row.legacy_asset_ref === declared.legacy_asset_ref,
  );
  assert.equal(declaredResult.hold_reasons.includes("collision_state_conflict"), true);
  for (const legacyRef of ["legacy:index:a", "legacy:index:b"]) {
    const row = plan.rows.find((candidate) => candidate.legacy_asset_ref === legacyRef);
    assert.equal(row.verdict, "hold");
    assert.equal(row.hold_reasons.includes("target_ref_collision"), true);
  }
});

test("NFC, casefold, and trailing-dot-space workspace legacy aliases hold both rows", () => {
  const nfcLegacyRef = "_workspaces/knowledge/rag/indexes_local/Café_Index";
  const rows = [
    projectRow({
      legacy_asset_ref: "_workspaces/knowledge/rag/indexes_local/Legacy_Index",
      target_name: "case_a",
    }),
    projectRow({
      legacy_asset_ref: "_workspaces/knowledge/rag/indexes_local/legacy_index",
      source_revision_id: SOURCE_REVISION_B,
      content_id: CONTENT_B,
      target_name: "case_b",
    }),
    projectRow({
      legacy_asset_ref: nfcLegacyRef,
      target_name: "nfc_a",
    }),
    projectRow({
      legacy_asset_ref: nfcLegacyRef.normalize("NFD"),
      source_revision_id: SOURCE_REVISION_B,
      content_id: CONTENT_B,
      target_name: "nfc_b",
    }),
    projectRow({
      legacy_asset_ref: "_workspaces/knowledge/rag/indexes_local/Trailing_Index.",
      target_name: "dot_a",
    }),
    projectRow({
      legacy_asset_ref: "_workspaces/knowledge/rag/indexes_local/Trailing_Index",
      source_revision_id: SOURCE_REVISION_B,
      content_id: CONTENT_B,
      target_name: "dot_b",
    }),
    projectRow({
      legacy_asset_ref: "_workspaces/knowledge/rag/indexes_local/Space_Alias",
      target_name: "space_a",
    }),
    projectRow({
      legacy_asset_ref: "_workspaces/knowledge/rag/indexes_local/Space_Alias ",
      source_revision_id: SOURCE_REVISION_B,
      content_id: CONTENT_B,
      target_name: "space_b",
    }),
  ];
  const plan = buildProjectRagMigrationDryRun({ rows });
  const reversed = buildProjectRagMigrationDryRun({ rows: [...rows].reverse() });
  assert.deepEqual(reversed, plan);
  assert.equal(plan.plan_verdict, "hold");
  assert.equal(plan.counts.ready, 0);
  assert.equal(plan.counts.hold, rows.length);
  for (const row of plan.rows) {
    assert.equal(row.verdict, "hold");
    assert.equal(row.hold_reasons.includes("legacy_asset_ref_collision"), true);
  }
});

test("unknown current owners and explicit blockers force row and plan holds", () => {
  const plan = buildProjectRagMigrationDryRun({
    rows: [
      projectRow({ current_owner_surface: "unknown" }),
      commonRow({ decision_or_blocker: "blocker:owner_scope_conflict:001" }),
    ],
  });
  assert.equal(plan.plan_verdict, "hold");
  assert.equal(plan.counts.hold, 2);
  const project = plan.rows.find((row) => row.classification === "project");
  const common = plan.rows.find((row) => row.classification === "common");
  assert.equal(project.hold_reasons.includes("current_owner_surface_unknown"), true);
  assert.equal(common.hold_reasons.includes("decision_blocker_present"), true);
});

test("empty inventories are held at plan level", () => {
  const plan = buildProjectRagMigrationDryRun({ rows: [] });
  assert.equal(plan.plan_verdict, "hold");
  assert.deepEqual(plan.counts, {
    total: 0,
    project: 0,
    common: 0,
    unresolved: 0,
    conflict: 0,
    ready: 0,
    hold: 0,
  });
  assert.match(plan.plan_digest, /^sha256:[0-9a-f]{64}$/u);
});

test("schema is exact and bounded IDs are enforced", () => {
  const { evidence_refs: _removed, ...missing } = projectRow();
  assertCode(
    () => buildProjectRagMigrationDryRun({ rows: [missing] }),
    "RAG_MIGRATION_MISSING_FIELD",
  );
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [projectRow({ source_revision_id: "sr_short" })],
      }),
    "RAG_MIGRATION_SOURCE_REVISION_INVALID",
  );
  assertCode(
    () =>
      buildProjectRagMigrationDryRun({
        rows: [projectRow({ content_id: "sha256:abcd" })],
      }),
    "RAG_MIGRATION_CONTENT_ID_INVALID",
  );
});
