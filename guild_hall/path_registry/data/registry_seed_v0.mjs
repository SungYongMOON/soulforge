// Tracked public-safe seed definition for the Path Registry (plan 17, R1).
//
// This is a candidate inventory, not an acceptance claim: all four OD-10
// registry authorities are explicit `hold:od-10.*` activation sentinels.
// R0 and the OD-10 owner assignments are settled in canon, while private
// binding bytes, writer-exclusive ACL/readback and activation wiring remain
// intentionally absent from this public seed. Byte/revision/acceptance/backup
// owner refs therefore stay held and no row carries a physical binding. With
// this seed, every mutating authorization fails closed and
// `registryReadiness` reports HOLD. No host-local absolute path, credential,
// or private payload appears here.

export const SEED_AUTHORITY = Object.freeze({
  registry_schema_owner: "hold:od-10.registry_schema_owner",
  private_binding_writer: "hold:od-10.private_binding_writer",
  resolver_runtime_owner: "hold:od-10.resolver_runtime_owner",
  write_policy_owner: "hold:od-10.write_policy_owner",
});

const HOLD_OWNER = "hold:od-10.owner_refs";

function row(overrides) {
  return {
    parent_binding_ref: null,
    product_refs: ["product.erp", "product.engine", "product.agent"],
    portfolio_refs: ["sf-p08"],
    module_owner_ref: "hold:od-10.module_owner",
    source_class: null,
    project_or_org_scope_ref: "org:common",
    // Existing stable 4192 federated-topology identity (RED-02 pinned
    // artifact) this row resolves to; [] = no stable topology identity
    // exists yet, so the row appears only through the registry contract.
    topology_node_refs: [],
    binding_refs: [],
    owner_refs: {
      logical: HOLD_OWNER,
      byte: HOLD_OWNER,
      revision: HOLD_OWNER,
      acceptance: HOLD_OWNER,
      backup_restore: HOLD_OWNER,
    },
    sensitivity: "internal",
    acl_policy_ref: "hold:od-10.acl_policy",
    sole_writer_ref: null,
    authorized_writer_refs: [],
    retention_policy_ref: "hold:od-10.retention_policy",
    current_state: "reference_in_place",
    manifest_ref: null,
    latest_receipt_ref: null,
    migration_ref: null,
    rollback_ref: null,
    applicability: "applicable",
    ...overrides,
  };
}

function rootRow(cls, overrides) {
  return row({
    logical_path_id: `root.${cls}`,
    row_kind: "root",
    physical_root_class: cls,
    logical_owner_class: "physical_root",
    asset_or_source_class: "root_surface",
    owner_refs: {
      logical: "docs.program.plan17",
      byte: HOLD_OWNER,
      revision: HOLD_OWNER,
      acceptance: HOLD_OWNER,
      backup_restore: HOLD_OWNER,
    },
    ...overrides,
  });
}

function canonRow(id, overrides) {
  return row({
    logical_path_id: `canon.${id}`,
    row_kind: "canonical_root",
    physical_root_class: "source_checkout",
    logical_owner_class: "canonical_root",
    parent_binding_ref: "root.source_checkout",
    asset_or_source_class: "canon_surface",
    module_owner_ref: "docs.foundation.target_tree",
    owner_refs: {
      logical: "docs.foundation.document_ownership",
      byte: HOLD_OWNER,
      revision: HOLD_OWNER,
      acceptance: HOLD_OWNER,
      backup_restore: HOLD_OWNER,
    },
    sensitivity: "public",
    write_policy: "read_only",
    backup_class: "authoritative",
    ...overrides,
  });
}

function sourceRow(id, sourceClass, overrides) {
  const physical = sourceClass === "external_runtime" ? "external_runtime_root"
    : sourceClass === "internal_capture" ? "data_root"
      : "external_owner_store";
  return row({
    logical_path_id: `source.${id}`,
    row_kind: "source",
    physical_root_class: physical,
    logical_owner_class: "source_lane",
    parent_binding_ref: `root.${physical}`,
    asset_or_source_class: "source_capture_lane",
    source_class: sourceClass,
    owner_refs: {
      logical: "docs.program.plan10",
      byte: HOLD_OWNER,
      revision: HOLD_OWNER,
      acceptance: HOLD_OWNER,
      backup_restore: HOLD_OWNER,
    },
    sensitivity: "protected",
    write_policy: "read_only",
    backup_class: "authoritative",
    ...overrides,
  });
}

// Whole-estate asset classes are catalog/index identities, not new byte
// owners. They live under the data-root catalog plane and remain held until
// the existing authority for that class supplies an accepted binding and
// backup evidence. Registering a class makes absence visible in R3/4192; it
// does not move, copy, accept, or promote any asset.
function assetClassRow(id, moduleOwnerRef, overrides = {}) {
  return row({
    logical_path_id: `asset.${id}`,
    row_kind: "asset_class",
    physical_root_class: "data_root",
    logical_owner_class: "asset_catalog_index",
    parent_binding_ref: "root.data_root",
    asset_or_source_class: id,
    module_owner_ref: moduleOwnerRef,
    sensitivity: "protected",
    write_policy: "read_only",
    backup_class: "authoritative",
    current_state: "held",
    ...overrides,
  });
}

export function seedRows() {
  return [
    rootRow("source_checkout", {
      sensitivity: "public", write_policy: "read_only", backup_class: "authoritative",
    }),
    rootRow("runtime_root", { write_policy: "read_only", backup_class: "runtime_local" }),
    rootRow("data_root", {
      sensitivity: "protected", write_policy: "append_create_only", backup_class: "authoritative",
    }),
    rootRow("control_root", {
      sensitivity: "protected", write_policy: "append_create_only", backup_class: "authoritative",
    }),
    rootRow("project_work_root", {
      sensitivity: "protected", write_policy: "append_create_only", backup_class: "authoritative",
    }),
    rootRow("tool_root", { write_policy: "read_only", backup_class: "runtime_local" }),
    rootRow("recovery_root", { write_policy: "rebuild_only", backup_class: "rebuildable" }),
    rootRow("external_runtime_root", { write_policy: "read_only", backup_class: "runtime_local" }),
    rootRow("external_owner_store", { write_policy: "read_only", backup_class: "authoritative" }),
    rootRow("secret_owner_root", {
      sensitivity: "secret_ref_only", write_policy: "forbidden", backup_class: "forbidden",
      current_state: "target",
    }),

    canonRow("registry"),
    canonRow("unit"),
    canonRow("workflow"),
    canonRow("party"),
    canonRow("mission"),
    canonRow("guild_hall"),
    canonRow("workspaces", {
      physical_root_class: "project_work_root",
      parent_binding_ref: "root.project_work_root",
      sensitivity: "protected",
      write_policy: "append_create_only",
    }),

    // Nested private planes: physical containment under a source checkout,
    // logical records owned by data/control planes (explicit multi-axis rows
    // instead of containment-inferred ownership; plan 17 crosswalk).
    row({
      logical_path_id: "plane.workmeta",
      row_kind: "nested_plane",
      physical_root_class: "data_root",
      logical_owner_class: "private_metadata_plane",
      parent_binding_ref: "root.source_checkout",
      asset_or_source_class: "metadata_plane",
      sensitivity: "protected",
      write_policy: "append_create_only",
      backup_class: "authoritative",
    }),
    row({
      logical_path_id: "plane.private_state",
      row_kind: "nested_plane",
      physical_root_class: "control_root",
      logical_owner_class: "private_continuity_plane",
      parent_binding_ref: "root.source_checkout",
      asset_or_source_class: "continuity_plane",
      sensitivity: "protected",
      write_policy: "append_create_only",
      backup_class: "authoritative",
    }),

    // Every plan-10 source is a row; lanes without an observed capture lane
    // are explicit HOLD rows (current_state "held"), not omissions.
    // Linear has NO existing stable topology identity: it appears only
    // through this registry contract until its lane lands.
    sourceRow("linear", "external_saas", { current_state: "held" }),
    sourceRow("slack", "external_saas", {
      topology_node_refs: ["watchtower::src_slack"],
    }),
    sourceRow("mail", "external_saas", {
      topology_node_refs: ["watchtower::src_hiworks", "watchtower::src_gmail"],
    }),
    sourceRow("voice_plaud", "external_saas", {
      topology_node_refs: ["watchtower::src_plaud"],
    }),
    sourceRow("cloud_drive", "external_saas", {
      current_state: "held",
      topology_node_refs: ["watchtower::src_onedrive"],
    }),
    sourceRow("buzz", "external_runtime", {}),
    sourceRow("hermes", "external_runtime", {}),
    sourceRow("git", "source_repository", { current_state: "held" }),
    sourceRow("nas", "nas_store", { current_state: "held" }),
    sourceRow("pc_activity", "internal_capture", {}),
    sourceRow("team_files", "internal_capture", {}),
    sourceRow("run_logs", "internal_capture", {}),

    // Original-vision asset classes. These rows index existing owners and
    // intentionally carry no physical binding or topology identity yet.
    assetClassRow("knowledge", "guild_hall.knowledge_canon"),
    assetClassRow("project_assets", "docs.workspace.workspace_project_model"),
    assetClassRow("artifacts", "guild_hall.vault_revision"),
    assetClassRow("templates", "docs.workspace.artifact_template_system"),
    assetClassRow("bom_material", "ui_workspace.dev_erp"),
    assetClassRow("datasets", "docs.workspace.workspace_project_model"),
    assetClassRow("test_results", "docs.workspace.workspace_project_model"),
    assetClassRow("engine_rules_profiles", "guild_hall.engineering_engine"),
    assetClassRow("ai_workforce", "docs.program.plan06"),
  ];
}
