import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MANUAL_ORGANIZATION_CATALOG_WRITES_DISABLED,
  defaultLegacyOrganizationCatalogPath,
  defaultOrganizationCatalogPath,
  readOrganizationCatalog,
  writeOrganizationCatalogAtomic
} from "./live-organization-catalog-store.mjs";

const AT = "2026-08-05T00:01:00.000Z";

function governanceSource(overrides = {}) {
  return {
    schema_version: "soulforge.organization_governance_overlay.v1",
    catalog_revision: 1,
    effective_at: "2026-08-05T00:00:00.000Z",
    updated_at: AT,
    authority_state: "validated_private",
    disabled: false,
    root_display_label: "Synthetic organization",
    organizations: [
      {
        organization_id: "source-company",
        parent_organization_id: null,
        organization_kind: "company",
        display_label: "Source Company",
        display_order: 10,
        lifecycle: "active",
        member_branch_ids: ["common", "projects"],
        owner_authority_ref: "owner-approved:organization-governance-v1",
        identity_state: "legacy_projection",
        mapping_authority: "owner_seeded",
        legacy_projection_ref: "owner-seeded:source-company"
      },
      {
        organization_id: "source-projects",
        parent_organization_id: "source-company",
        organization_kind: "project_portfolio",
        display_label: "Source Projects",
        display_order: 20,
        lifecycle: "active",
        member_branch_ids: ["projects"],
        owner_authority_ref: "owner-approved:organization-governance-v1",
        identity_state: "legacy_projection",
        mapping_authority: "owner_seeded",
        legacy_projection_ref: "owner-seeded:source-projects"
      }
    ],
    role_bindings: [
      {
        role_binding_id: "source-company:role",
        organization_id: "source-company",
        role_code: "company_ceo",
        position_code: null,
        rank: 0,
        display_order: 0,
        stable_route_id: null,
        display_label: "CEO",
        lifecycle: "active"
      },
      {
        role_binding_id: "source-projects:role",
        organization_id: "source-projects",
        role_code: "project_manager",
        position_code: null,
        rank: 1,
        display_order: 1,
        stable_route_id: null,
        display_label: "Projects lead",
        lifecycle: "active"
      }
    ],
    metadata_only: true,
    ...overrides
  };
}

function legacyCatalog() {
  return {
    schema_version: "soulforge.team_ops_board.organization_catalog.v1",
    catalog_revision: 1,
    updated_at: AT,
    disabled: false,
    root_display_label: "Rollback organization",
    companies: [{
      company_id: "rollback-company",
      display_label: "Rollback Company",
      ceo_group_id: "rollback-company",
      sort_order: 0,
      lifecycle: "active"
    }],
    groups: [{
      organization_group_id: "rollback-company",
      company_id: "rollback-company",
      display_label: "Rollback CEO",
      parent_group_id: null,
      presentation_role: "ceo",
      sort_order: 0,
      lifecycle: "active"
    }],
    metadata_only: true,
    raw_preview: false,
    raw_turns: false,
    raw_messages: false,
    raw_reasoning: false,
    raw_tool_io: false,
    raw_cwd: false
  };
}

test("store projects a refreshed governance source to the existing Board catalog contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-organization-source-"));
  const sourcePath = join(directory, "organization_governance_overlay.v1.json");
  try {
    await writeFile(sourcePath, `${JSON.stringify(governanceSource(), null, 2)}\n`, "utf8");
    const initial = await readOrganizationCatalog(sourcePath, { env: {} });
    assert.equal(initial.status, "available");
    assert.equal(initial.source, "governance");
    assert.deepEqual(initial.catalog.companies.map((company) => company.company_id), ["source-company"]);
    assert.equal(initial.catalog.companies[0].display_label, "Source Company");
    assert.deepEqual(
      initial.catalog.groups.map((group) => [group.organization_group_id, group.company_id, group.presentation_role]),
      [
        ["source-company", "source-company", "ceo"],
        ["source-projects", "source-company", "manager_peers"]
      ]
    );
    assert.equal(initial.catalog.groups.find((group) => group.organization_group_id === "source-company").display_label, "CEO");

    await writeFile(sourcePath, `${JSON.stringify(governanceSource({
      catalog_revision: 2,
      updated_at: "2026-08-05T00:02:00.000Z",
      root_display_label: "Refreshed organization"
    }), null, 2)}\n`, "utf8");
    const refreshed = await readOrganizationCatalog(sourcePath, { env: {} });
    assert.equal(refreshed.status, "available");
    assert.equal(refreshed.catalog.catalog_revision, 2);
    assert.equal(refreshed.catalog.root_display_label, "Refreshed organization");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("store fails closed for a missing or invalid governance source unless rollback is explicit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-organization-fail-closed-"));
  const sourcePath = join(directory, "organization_governance_overlay.v1.json");
  const legacyPath = join(directory, "organization_catalog.v1.json");
  try {
    assert.deepEqual(
      await readOrganizationCatalog(sourcePath, { env: {}, legacyCatalogPath: legacyPath }),
      { status: "missing", catalog: null, source: "governance" }
    );

    await writeFile(sourcePath, "{ not-json", "utf8");
    assert.deepEqual(
      await readOrganizationCatalog(sourcePath, { env: {}, legacyCatalogPath: legacyPath }),
      { status: "invalid", catalog: null, source: "governance" }
    );

    await writeFile(legacyPath, `${JSON.stringify(legacyCatalog(), null, 2)}\n`, "utf8");
    const rollback = await readOrganizationCatalog(sourcePath, {
      env: { SOULFORGE_ORGANIZATION_GOVERNANCE_ROLLBACK_LEGACY: "1" },
      legacyCatalogPath: legacyPath
    });
    assert.equal(rollback.status, "hold");
    assert.equal(rollback.source, "legacy_rollback");
    assert.equal(rollback.catalog.groups[0].organization_group_id, "rollback-company");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual Board catalog writes are rejected", async () => {
  await assert.rejects(
    writeOrganizationCatalogAtomic("ignored.json", legacyCatalog()),
    new RegExp(MANUAL_ORGANIZATION_CATALOG_WRITES_DISABLED, "u")
  );
});

test("governance and legacy rollback paths use separate environment controls", () => {
  const governancePath = "C:/local/organization-governance.json";
  const legacyPath = "C:/local/organization-catalog.json";
  assert.equal(
    defaultOrganizationCatalogPath({
      TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_OVERLAY: governancePath,
      TEAM_OPS_BOARD_ORGANIZATION_CATALOG: legacyPath
    }),
    governancePath
  );
  assert.equal(
    defaultLegacyOrganizationCatalogPath({ TEAM_OPS_BOARD_ORGANIZATION_CATALOG: legacyPath }),
    legacyPath
  );
  assert.notEqual(
    defaultOrganizationCatalogPath({ TEAM_OPS_BOARD_ORGANIZATION_CATALOG: legacyPath }),
    legacyPath
  );
});
